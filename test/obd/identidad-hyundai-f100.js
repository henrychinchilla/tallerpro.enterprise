/* Hyundai/Kia se identifican solos con 22 F1 00 (2026-09-22).

   Henry: «si lo encuentro en la primera búsqueda de Google, la app no puede
   decir que no lo conoce». A la IA le llegaba 0x7D2 sin nada más que la
   dirección. Pero los módulos Hyundai/Kia contestan 22 F1 00 con una cadena
   que dice QUÉ SON ("JA  MDPS … 56310-G6200"): es lo que usa opendbc para
   reconocerlos, y la app nunca la pedía. Las cadenas de estas pruebas son
   huellas reales de opendbc/car/hyundai/fingerprints.py.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M } = cargar();
const bytes = s => [...s].map(c => c.charCodeAt(0));

(async () => {
  /* ── Leer la cadena ── */
  const mdps = M._leerDescripcionHMC(bytes('IG  MDPS C 1.00 1.02 56310G8510\x00 4IGSC103'));
  ok('lee la plataforma', mdps.plataforma === 'IG');
  ok('lee la sigla del módulo', mdps.sigla === 'MDPS');
  ok('lee el número de pieza y lo normaliza', mdps.pieza === '56310-G8510');
  const esc = M._leerDescripcionHMC(bytes('DN ESC \x01 102\x19\x04\x13 58910-L1300'));
  ok('la cadena del ESC trae binario adentro y aun así se lee', esc.sigla === 'ESC' && esc.pieza === '58910-L1300');
  ok('basura binaria no es una descripción', M._leerDescripcionHMC([0, 1, 2, 255, 0]) === null);

  /* ── Se pide solo en Hyundai/Kia/Genesis, y antes que F197 ── */
  const pedidos = [];
  M._udsPedir = async (req, resp, tx) => {
    pedidos.push(tx.map(b => b.toString(16).padStart(2, '0')).join(' '));
    if (tx[1] === 0xF1 && tx[2] === 0x00) return [0x62, 0xF1, 0x00, ...bytes('JA  MDPS C 1.00 1.01 56310-G6200 4JAPC101')];
    return [0x7F, 0x22, 0x31];
  };
  M._marcaBarrido = 'Kia';
  const id = await M._identidadModulo({ req: 0x7D4, resp: 0x7DC });
  ok('en Kia pregunta 22 F1 00', pedidos.includes('22 f1 00'));
  ok('y con la sigla ya no gasta la consulta de F197', !pedidos.includes('22 f1 97'));
  ok('el número de pieza sale de la misma respuesta (no pregunta F187)',
     id.referencia === '56310-G6200' && !pedidos.includes('22 f1 87'));

  pedidos.length = 0;
  M._marcaBarrido = 'Toyota';
  await M._identidadModulo({ req: 0x7A1, resp: 0x7A9 });
  ok('en otra marca NO pregunta 22 F1 00 (es un identificador de Hyundai)', !pedidos.includes('22 f1 00'));

  /* ── El nombre sale de lo que el módulo dijo ── */
  M._modulosDeclarados = [];
  const r = M._nombreResuelto({ ecu: 0x7D4, ident: id, codigos: [] }, 'Kia');
  ok('MDPS se llama Dirección asistida', /Direcci/.test(r.nombre) && r.firme === true);
  ok('y el origen muestra la cadena del módulo', /«MDPS»/.test(r.origen) && /56310-G6200/.test(r.origen));

  const raro = M._nombreResuelto({ ecu: 0x7D2, ident: { hmc: M._leerDescripcionHMC(bytes('JA  IBU 1.00 95400-G6010')) }, codigos: [] }, 'Kia');
  ok('una sigla sin traducción verificada se muestra tal cual, como provisional',
     raro.nombre === 'Módulo IBU' && raro.firme === false);

  /* ── La IA investiga también los provisionales ── */
  const scan = { vehiculos: { marca: 'Kia' }, por_modulo: [
    { ecu: 0x7D4, nombre: 'Dirección asistida (MDPS)', ident: id, codigos: [] },
    { ecu: 0x7D2, nombre: 'Módulo IBU', ident: { hmc: M._leerDescripcionHMC(bytes('JA  IBU 1.00 95400-G6010')) }, codigos: [] },
    { ecu: 0x7C6, nombre: 'Instrumentos / tablero', ident: { referencia: '94003G6920' }, codigos: [] },
  ] };
  const pend = M._modulosSinNombre(scan).map(m => m.ecu);
  ok('no le pregunta a la IA por lo que el módulo ya dijo (MDPS)', !pend.includes(0x7D4));
  ok('sí por la sigla sin traducir (IBU)', pend.includes(0x7D2));
  ok('0x7C6 en Kia ya tiene nombre verificado por dirección: no gasta IA', !pend.includes(0x7C6));

  const ev = M._evidenciaModulo(scan.por_modulo[1], 'Kia');
  ok('la IA recibe la cadena del módulo como evidencia', /IBU/.test(ev.descripcion_hyundai_kia_22F100) && /95400-G6010/.test(ev.numero_de_pieza_F187 || ev.descripcion_hyundai_kia_22F100));

  fin();
})();
