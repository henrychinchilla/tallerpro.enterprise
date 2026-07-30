/* J1939 por Bluetooth — ELM327 en protocolo A.

   Lo que se prueba acá es la traducción, que es donde está todo el riesgo: la
   trama del ELM327 (ID de 29 bits + datos) tiene que quedar con la MISMA forma
   que entrega el RP1210, porque el decodificador J1939 que ya existe está
   escrito contra esa forma. Si la traducción corre un byte, el camión "no tiene
   fallas" — que es la peor manera de fallar que tiene esta pantalla.

   Ningún bus real se toca: se le dan líneas tal como las escupe un ELM327. */
const { cargar, ok, fin } = require('./harness');

const { M } = cargar();

/* Estado limpio del acumulador J1939, igual que lo arma el escaneo */
const nuevoJ39 = () => ({ datos:{}, pgns:{}, esperas:{}, sas:{}, dm1:{}, dm2:{},
                          tp:{}, claim:{}, vin:null, comp:null });

/* ── 1. PDU2 (difusión): el PS SÍ es parte del PGN ───────────────────────── */
M._j39 = nuevoJ39();
/* 18FECA00 = prioridad 6, PF=0xFE, PS=0xCA, SA=0 → DM1 (PGN 65226) del motor */
let t = M._j39LineaELM('18FECA0050FF64000101FFFF');
ok('PDU2: PGN sale 65226 (DM1)', t && (t[4] | (t[5] << 8) | (t[6] << 16)) === 65226);
ok('PDU2: origen es el motor (SA 0)', t && t[8] === 0);
ok('PDU2: destino es difusión (255)', t && t[9] === 255);
ok('PDU2: prioridad 6', t && t[7] === 6);
ok('la trama tiene forma RP1210 (10 + datos)', t && t.length === 10 + 8);
ok('los datos arrancan en el byte 10', t && t[10] === 0x50 && t[11] === 0xFF);

/* ── 2. PDU1 (dirigido): el PS NO es parte del PGN ───────────────────────── */
/* El error clásico. 18EA00F9 es un Request (PGN 59904) que la herramienta (0xF9)
   le manda al motor (0x00). Si el PS se metiera en el PGN saldría 59904+0 por
   casualidad acá, así que se prueba con un destino que NO sea cero. */
M._j39 = nuevoJ39();
t = M._j39LineaELM('18EA0BF9CAFE00');
ok('PDU1: PGN sale 59904, sin el destino adentro', t && (t[4] | (t[5] << 8) | (t[6] << 16)) === 59904);
ok('PDU1: el destino queda aparte (0x0B = ABS)', t && t[9] === 0x0B);
ok('PDU1: el origen es la herramienta (0xF9)', t && t[8] === 0xF9);

/* TP.CM y TP.DT son PDU1 (0xEC / 0xEB). Si se trataran como PDU2, el
   multipaquete no se rearmaría NUNCA y el VIN no aparecería jamás. */
M._j39 = nuevoJ39();
t = M._j39LineaELM('1CECFF0020120003FFECFE00');
ok('TP.CM se reconoce como PGN 60416', t && (t[4] | (t[5] << 8) | (t[6] << 16)) === 60416);
M._j39 = nuevoJ39();
t = M._j39LineaELM('1CEBFF000133414B4A474C44');
ok('TP.DT se reconoce como PGN 60160', t && (t[4] | (t[5] << 8) | (t[6] << 16)) === 60160);

/* ── 3. Lo que dice el ELM de sí mismo no son tramas del camión ──────────── */
M._j39 = nuevoJ39();
for (const basura of ['NO DATA', 'STOPPED', 'BUFFER FULL', 'CAN ERROR', 'OK', '>', 'SEARCHING...', 'UNABLE TO CONNECT'])
  ok(`rechaza "${basura}"`, M._j39LineaELM(basura) === null);
ok('rechaza línea vacía', M._j39LineaELM('') === null);
ok('rechaza sólo el ID sin datos', M._j39LineaELM('18FECA00') === null);
ok('rechaza cantidad impar de hex', M._j39LineaELM('18FECA0050F') === null);
ok('no cuenta ninguna trama de la basura', M._j39.total === undefined || M._j39.total === 0);

/* ── 4. De la línea cruda al código de falla, sin escalas ─────────────────── */
M._j39 = nuevoJ39();
M._j39LineaELM('18FECA0050FF64000101FFFF');
ok('el DM1 queda guardado por módulo', !!M._j39.dm1[0]);
let dtcs = M._j39DTCs(M._j39.dm1[0]);
ok('sale exactamente 1 falla', dtcs.length === 1);
ok('SPN y FMI bien leídos', dtcs[0] && dtcs[0].codigo === 'SPN 100 FMI 1');
ok('la falla se describe en español', dtcs[0] && /presi[oó]n/i.test(dtcs[0].desc));

/* Dos módulos distintos difundiendo: el segundo no puede pisar al primero.
   Con el ABS averiado y el motor hablando 10 veces más seguido, guardarlos en
   una sola variable hacía desaparecer las fallas de frenos. */
M._j39LineaELM('18FECA0B50FF2C0104020000');
ok('el DM1 del ABS no pisa al del motor', !!M._j39.dm1[0] && !!M._j39.dm1[0x0B]);
const todos = M._j39DTCsTodos(M._j39.dm1);
ok('las fallas salen con su módulo', todos.length === 2 && todos.some(d => d.modulo === 'Frenos / ABS'));

/* ── 5. Multipaquete (BAM): el VIN no entra en 8 bytes ────────────────────── */
M._j39 = nuevoJ39();
M._j39LineaELM('1CECFF0020120003FFECFE00');   // anuncia 18 bytes en 3 paquetes del PGN 65260
M._j39LineaELM('1CEBFF000133414B4A474C44');   // "3AKJGLD"
M._j39LineaELM('1CEBFF000252384653465631');   // "R8FSFV1"
M._j39LineaELM('1CEBFF00033233342AFFFFFF');   // "234*" + relleno
ok('el BAM se rearmó', M._j39.bam === 1);
ok('el VIN sale completo y limpio', M._j39VIN() === '3AKJGLDR8FSFV1234');

/* Un anuncio nuevo cancela el anterior: acumular pedazos de dos sesiones daría
   un mensaje corrupto que parecería datos buenos. */
M._j39 = nuevoJ39();
M._j39LineaELM('1CECFF0020120003FFECFE00');
M._j39LineaELM('1CEBFF000133414B4A474C44');
M._j39LineaELM('1CECFF0020120003FFECFE00');   // vuelve a anunciar
ok('el anuncio nuevo descarta los pedazos viejos',
   M._j39.tp[0] && Object.keys(M._j39.tp[0].partes).length === 0);

/* ── 6. Preparar el adaptador: sin cabeceras no se sabe quién habló ───────── */
async function pruebaIniciar() {
  const dichos = [];
  M._cmd = async c => { dichos.push(c); return /ATSPA/i.test(c) ? 'OK' : 'OK'; };
  await M._j39BleIniciar(null);
  ok('pide cabeceras (ATH1)', dichos.includes('ATH1'));
  ok('apaga el formateo ISO-TP (ATCAF0)', dichos.includes('ATCAF0'));
  ok('selecciona el protocolo A (J1939)', dichos.includes('ATSPA'));
  ok('deja anotado el protocolo 10 (A)', M._protoNum === 10);

  /* Un dongle que no sabe J1939 tiene que decirlo acá y no dejar creer que el
     camión está sano. */
  M._cmd = async c => (/ATSPA/i.test(c) ? '?' : 'OK');
  let err = null;
  try { await M._j39BleIniciar(null); } catch (e) { err = e.message; }
  ok('si el dongle no acepta el protocolo A, falla claro', !!err && /J1939/.test(err));
  ok('el error dice qué hacer', !!err && /USB-Link|vLinker/.test(err));
}

/* ── 7. Monitoreo continuo: el ELM no manda prompt hasta que se lo corta ──── */
async function pruebaMonitor() {
  const escrito = [];
  M._escribirBLE = async txt => { escrito.push(txt); };
  M._traza = null;
  const vistas = [];
  await M._monInicio(l => vistas.push(l));
  ok('arranca el volcado con ATMA', escrito[0] === 'ATMA\r');
  ok('queda un oyente activo', typeof M._monLinea === 'function');

  /* Dos llamadas seguidas no pueden mandar ATMA dos veces: la segunda dejaría al
     adaptador con un comando pendiente y la escucha muerta. */
  await M._monInicio(l => vistas.push(l));
  ok('no reabre un monitoreo ya abierto', escrito.length === 1);

  await M._monFin();
  ok('lo corta mandando un carácter', escrito[1] === '\r');
  ok('el oyente queda apagado', M._monLinea === null);
  await M._monFin();
  ok('cortar dos veces no manda nada de más', escrito.length === 2);
}

/* ── 8. Preguntar por Bluetooth arma el Request de J1939 ──────────────────── */
async function pruebaSolicitar() {
  M._j39 = nuevoJ39();
  M._j39BLE = true;
  M._monLinea = null;
  const dichos = [];
  M._cmd = async c => { dichos.push(c); return 'NO DATA'; };

  await M._j39Solicitar(65226);                       // DM1 a todos
  ok('fija la cabecera del Request global', dichos.includes('ATSH EAFFF9'));
  ok('el PGN va en 3 bytes, el menor primero', dichos.includes('CAFE00'));
  ok('fija la prioridad 6 (ATCP18)', dichos.includes('ATCP18'));

  dichos.length = 0;
  await M._j39Solicitar(65227, 0x0B);                 // DM2 sólo al ABS
  ok('a un módulo puntual, el destino va en la cabecera', dichos.includes('ATSH EA0BF9'));

  /* Por USB no debe tocar el ELM: son dos transportes distintos y mezclarlos
     dejaría al puente recibiendo comandos AT. */
  M._j39BLE = false;
  dichos.length = 0;
  let usado = null;
  M._puenteOp = async obj => { usado = obj; return { ok:true }; };
  await M._j39Solicitar(65226);
  ok('por USB sigue yendo por el puente', usado && usado.op === 'enviar');
  ok('por USB no manda comandos AT', dichos.length === 0);
}

(async () => {
  await pruebaIniciar();
  await pruebaMonitor();
  await pruebaSolicitar();
  fin();
})();
