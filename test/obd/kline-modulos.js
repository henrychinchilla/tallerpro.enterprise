/* Escaneo por módulo en K-line (ISO 14230 / KWP2000) y aviso previo de acceso.

   Motivo: un liviano anterior a ~2006 no tiene CAN de diagnóstico, así que todo
   el barrido por CAN (0x700-0x7EF) no le aplica. Antes de esto el vehículo
   quedaba con un módulo listado — el motor — y todo lo demás invisible, que es
   el falso-limpio que este módulo no se puede permitir.

   Nada de esto toca un bus real: se valida el armado de la trama, el
   direccionamiento y — sobre todo — que un mapa de K-line NO se presente ni se
   reutilice como si fuera CAN. */

const { cargar, ok, fin } = require('./harness');

/* ── La cabecera: [0x80|largo][destino][0xF1] ───────────────────────────── */
{
  const { M } = cargar();
  ok('cabecera K-line: formato lleva el largo (2 bytes → 82)',
     M._klineHdr(0x18, 2) === '82 18 F1');
  ok('cabecera K-line: 4 bytes → 84',
     M._klineHdr(0x7A, 4) === '84 7A F1');
  ok('cabecera K-line: 1 byte → 81 (StartCommunication)',
     M._klineHdr(0x10, 1) === '81 10 F1');
}

/* ── Sólo aplica en ISO 14230 por Bluetooth ─────────────────────────────── */
{
  const { M } = cargar();
  const caso = (via, proto) => { M._via = via; M._protoNum = proto; return M._klinePuedeModulos(); };
  ok('K-line por módulo: sí en protocolo 5 (init rápido)', caso('ble', 5) === true);
  ok('K-line por módulo: sí en protocolo 4 (init 5 baudios)', caso('ble', 4) === true);
  /* ISO 9141-2 queda afuera a propósito: ahí el direccionamiento por módulo no
     está especificado así, y adivinarlo sería inventar direcciones. */
  ok('K-line por módulo: NO en protocolo 3 (ISO 9141-2)', caso('ble', 3) === false);
  ok('K-line por módulo: NO en CAN', caso('ble', 6) === false);
  ok('K-line por módulo: NO por USB', caso('usb', 5) === false);
}

/* ── El barrido: quién contesta y quién no ──────────────────────────────── */
(async () => {
  const { M } = cargar();
  M._via = 'ble'; M._protoNum = 5;
  const preguntas = [];
  M._cmd = async (cmd) => {
    preguntas.push(cmd);
    if (cmd.startsWith('ATSH')) return 'OK';
    /* Se responde según a quién apunte la última cabecera */
    const dst = (preguntas.filter(c => c.startsWith('ATSH')).pop() || '').split(' ')[2];
    if (dst === '18') return 'C1 EA 8F';        // saludo aceptado
    if (dst === '28') return '7F 81 12';        // rechaza: pero ESTÁ
    if (dst === '40') return 'BUS INIT: ERROR'; // el ELM negociando, no un módulo
    return 'NO DATA';
  };
  const h = await M._barrerModulosKline(null);
  const dirs = h.map(x => x.dst);
  ok('barrido K-line: encuentra al que saluda (0x18)', dirs.includes(0x18));
  ok('barrido K-line: cuenta al que rechaza (0x28) — rechazar es estar', dirs.includes(0x28));
  ok('barrido K-line: NO toma "BUS INIT" por un módulo', !dirs.includes(0x40));
  ok('barrido K-line: exactamente 2 módulos', h.length === 2);
  ok('barrido K-line: no se pregunta a sí mismo (0xF1)', !dirs.includes(0xF1));
  ok('barrido K-line: distingue saludo de rechazo',
     h.find(x => x.dst === 0x18).saludo === true && h.find(x => x.dst === 0x28).saludo === false);

  /* ── Los códigos se piden con el servicio KWP2000, y se restaura al final ── */
  const { M: M2 } = cargar();
  M2._via = 'ble'; M2._protoNum = 5;
  const cmds = [];
  M2._cmd = async (cmd) => {
    cmds.push(cmd);
    if (cmd.startsWith('ATSH')) return 'OK';
    if (cmd.startsWith('AT')) return 'OK';
    const dst = (cmds.filter(c => c.startsWith('ATSH')).pop() || '').split(' ')[2];
    if (dst !== '18') return 'NO DATA';            // solo el 0x18 vive
    if (cmd === '81') return 'C1 EA 8F';
    /* 58 01 + un código de 3 bytes. Los dos bits altos del primer byte dan la
       letra: 0x57 = 01·01 0111 → C1707. (Con 0x17 serían 00 → P1707.) */
    if (cmd === '1800FF00') return '58 01 57 07 24';
    return 'NO DATA';
  };
  const res = await M2._escanearModulosKline(null);
  ok('K-line: lee códigos con 18 00 FF 00', cmds.includes('1800FF00'));
  ok('K-line: devuelve el módulo con su código', !!res && res.length === 1 && res[0].codigos.length === 1);
  ok('K-line: el código sale bien decodificado (C1707)',
     !!res && res[0].codigos[0].codigo.indexOf('C1707') === 0);
  /* El nombre se deduce de la letra del código, no se inventa por la dirección */
  ok('K-line: nombra por el tipo de código (C → chasis/frenos)',
     !!res && /[Cc]hasis|[Ff]renos/.test(res[0].nombre));
  ok('K-line: marca el servicio usado', !!res && /KWP2000/.test(res[0].servicio));
  ok('K-line: el estado NO se afirma (en KWP no está verificado)',
     !!res && res[0].codigos[0].estadoDesconocido === true);
  /* Sin esto la cabecera queda apuntando al último módulo y el monitor en vivo
     y el borrado de códigos le hablarían a ese. */
  ok('K-line: restaura el protocolo al terminar (ATSP0 + 0100)',
     cmds.includes('ATSP0') && cmds.lastIndexOf('ATSP0') > cmds.indexOf('1800FF00'));

  /* Sin módulos no se inventa un mapa vacío */
  const { M: M3 } = cargar();
  M3._via = 'ble'; M3._protoNum = 5;
  M3._cmd = async (c) => c.startsWith('AT') ? 'OK' : 'NO DATA';
  ok('K-line: sin módulos devuelve null', (await M3._escanearModulosKline(null)) === null);

  /* ── El mapa NO puede decir "CAN" si se entró por K-line ───────────────── */
  const { M: M4 } = cargar();
  M4._via = 'ble'; M4._protoNum = 5; M4._canBaud = 500; M4._mapaFaltantes = [];
  const mapa = M4._mapaDeEscaneo([{ ecu:0x18, resp:null, kline:true, nombre:'Chasis', codigos:[], servicio:'18 00 FF 00 (KWP2000)' }]);
  ok('mapa K-line: se guarda como enlace kline', mapa.enlace === 'kline');
  ok('mapa K-line: NO inventa bits/baud de CAN', mapa.bits === undefined && mapa.baud === undefined);
  ok('mapa K-line: marca el módulo como kline', mapa.modulos[0].kline === true);
  const mapaCan = M4._mapaDeEscaneo([{ ecu:0x7E0, resp:0x7E8, nombre:'Motor', codigos:[], servicio:'19 02' }]);
  ok('mapa CAN sigue siendo CAN', mapaCan.enlace === 'can' && mapaCan.bits === 11 && mapaCan.baud === 500);

  /* La tarjeta no debe anunciar "CAN 11 bits" en un vehículo de K-line */
  const html = M4._mapaHTML({ mapa_acceso: mapa });
  ok('tarjeta del mapa: dice K-line', /K-line/.test(html));
  ok('tarjeta del mapa: no miente diciendo CAN', !/CAN \d+ bits/.test(html));

  /* ── Un mapa de K-line no debe contaminar el barrido por CAN ───────────── */
  const { M: M5, ctx } = cargar();
  M5._vehiculos = [{ id:'v1', marca:'MITSUBISHI', modelo:'MONTERO GLS', anio:2004 }];
  ctx.DB.getDiagnosticosPorModelo = async () => ([
    { mapa_acceso: { enlace:'kline', modulos:[{ req:0x18, kline:true, nombre:'Chasis' }] } },
    { mapa_acceso: { enlace:'can',   modulos:[{ req:0x7E0, resp:0x7E8, nombre:'Motor' }] } },
  ]);
  const conocido = await M5._mapaConocido('v1');
  ok('mapa conocido: descarta los destinos de K-line (no son IDs CAN)',
     !!conocido && conocido.modulos.length === 1 && conocido.modulos[0].req === 0x7E0);

  /* ── Barrido corto primero: 255 puertas a ciegas son varios minutos ────────
     En K-line cada destino que no contesta se paga con el timeout completo, así
     que recorrer 0x01-0xFF de entrada deja la pantalla quieta ~6 minutos en el
     caso peor — justo el caso del Montero, donde casi nada responde. */
  {
    const { M: M6 } = cargar();
    M6._via = 'ble'; M6._protoNum = 5;
    const vistos = [];
    M6._cmd = async (cmd) => {
      if (cmd.startsWith('ATSH')) { vistos.push(parseInt(cmd.split(' ')[2], 16)); return 'OK'; }
      return 'NO DATA';
    };
    await M6._barrerModulosKline(null);
    ok('barrido corto: no recorre los 255 destinos', vistos.length < 60);
    ok('barrido corto: cubre el motor (0x10) y el ABS (0x28)',
       vistos.includes(0x10) && vistos.includes(0x28));
    ok('barrido corto: cubre la dirección funcional 0x33', vistos.includes(0x33));

    vistos.length = 0;
    await M6._barrerModulosKline(null, true);
    ok('barrido completo: sí recorre los 255 cuando se pide', vistos.length > 240);
  }

  /* Si en los habituales no aparece nadie, hay que recorrer los 255 antes de
     declarar el vehículo mudo. */
  {
    const { M: M7 } = cargar();
    M7._via = 'ble'; M7._protoNum = 5;
    const vistos = [];
    M7._cmd = async (cmd) => {
      if (cmd.startsWith('ATSH')) { vistos.push(parseInt(cmd.split(' ')[2], 16)); return 'OK'; }
      if (cmd.startsWith('AT')) return 'OK';
      /* Solo vive el 0xA5, que NO está entre los habituales */
      const dst = vistos[vistos.length - 1];
      if (dst === 0xA5) return cmd === '81' ? 'C1 EA 8F' : '58 01 57 07 24';
      return 'NO DATA';
    };
    const res = await M7._escanearModulosKline(null);
    ok('sin nadie en los habituales: recorre los 255 y encuentra al escondido',
       !!res && res.length === 1 && res[0].ecu === 0xA5);
  }

  /* ── La sesión KWP se cae sola: hay que re-saludar antes de pedir códigos ──
     Entre el barrido y la lectura pasan minutos. Sin re-saludar el módulo
     contesta NO DATA y quedaría listado como "sin códigos" teniéndolos. */
  {
    const { M: M8 } = cargar();
    M8._via = 'ble'; M8._protoNum = 5;
    const orden = [];
    let sesionViva = false;
    M8._cmd = async (cmd) => {
      if (cmd.startsWith('ATSH')) { orden.push('ATSH:' + cmd.split(' ')[2]); return 'OK'; }
      if (cmd.startsWith('AT')) return 'OK';
      orden.push(cmd);
      const dst = (orden.filter(c => c.startsWith('ATSH:')).pop() || '').split(':')[1];
      if (dst !== '18') return 'NO DATA';
      if (cmd === '81') { sesionViva = true; return 'C1 EA 8F'; }
      /* El módulo solo entrega códigos con la sesión abierta */
      if (cmd === '1800FF00') return sesionViva ? '58 01 57 07 24' : 'NO DATA';
      return 'NO DATA';
    };
    /* Se simula que la sesión murió tras el barrido */
    const barrido = await M8._barrerModulosKline(null);
    sesionViva = false;
    orden.length = 0;
    const res = await M8._escanearModulosKline(null);
    const iSaludo = orden.indexOf('81');
    const iCodigos = orden.indexOf('1800FF00');
    ok('lectura K-line: vuelve a saludar antes de pedir códigos',
       iSaludo >= 0 && iCodigos >= 0 && iSaludo < iCodigos);
    ok('lectura K-line: con el re-saludo sí obtiene los códigos',
       !!res && res.some(m => m.codigos.length === 1));
  }

  /* Un módulo que saludó pero no entregó códigos NO puede darse por sano */
  {
    const { M: M9 } = cargar();
    M9._via = 'ble'; M9._protoNum = 5;
    M9._cmd = async (cmd) => {
      if (cmd.startsWith('AT')) return 'OK';
      return cmd === '81' ? 'C1 EA 8F' : 'NO DATA';   // saluda siempre, nunca da códigos
    };
    const res = await M9._escanearModulosKline(null);
    ok('K-line: el que saluda pero no entrega códigos queda marcado como no respondió',
       !!res && res.length > 0 && res.every(m => m.respondio === false));
  }

  fin();
})();

/* ── Aviso previo: qué se sabe del vehículo antes de conectar ───────────── */
{
  const el = { innerHTML: '' };
  const { M } = cargar({ document: { getElementById: id => (id === 'obd-aviso' ? el : null), querySelector: () => null } });

  M._vehiculos = [
    { id:'mont', marca:'MITSUBISHI', modelo:'MONTERO GLS', anio:2004, vin:'JMVLVV77WM306540' },
    { id:'rogue', marca:'Nissan', modelo:'Rogue', anio:2017, vin:'JN8AT2MT0HW123456' },
    { id:'sinanio', marca:'Toyota', modelo:'Hilux', anio:null, vin:'' },
  ];

  M._avisoAcceso('mont');
  const h = el.innerHTML;
  ok('aviso Montero 2004: avisa que es K-line', /K-line/.test(h));
  ok('aviso Montero 2004: manda a Bluetooth, no al USB-Link', /Bluetooth/.test(h));
  ok('aviso Montero 2004: nombra MUT-II y los módulos que quedan fuera',
     /MUT-II/.test(h) && /ETACS/.test(h) && /15625/.test(h));
  ok('aviso Montero 2004: dice que el pin 9 no se cablea', /pin 9/.test(h));
  /* El VIN de la tarjeta trae 16 caracteres: sin avisarlo, NHTSA devuelve vacío
     y parece que el vehículo no tiene campañas. */
  ok('aviso Montero 2004: detecta el VIN de largo inválido', /16 caracteres/.test(h));

  M._avisoAcceso('rogue');
  const h2 = el.innerHTML;
  ok('aviso 2017: dice que CAN es obligatorio y sirve cualquiera de las dos vías', /CAN obligatorio/.test(h2));
  ok('aviso 2017: no arrastra el aviso de Mitsubishi', !/MUT-II/.test(h2));
  ok('aviso 2017: VIN de 17 no se marca', !/caracteres/.test(h2));

  M._avisoAcceso('sinanio');
  ok('aviso sin año: lo pide en vez de adivinar el enlace', /Sin año registrado/.test(el.innerHTML));

  M._avisoAcceso('no-existe');
  ok('aviso: vehículo inexistente no pinta nada', el.innerHTML === '');
}
