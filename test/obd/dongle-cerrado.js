/* Un dongle que no habla ELM327 hay que decirlo ANTES, no después.

   Reportado el 2026-09-20: con un Thinkdiag TKD01, la app Android abría el
   Bluetooth —el dongle hasta cambiaba de color— y después fallaba. El mensaje
   mandaba a revisar si había elegido "manos libres, audífonos, balanza, el
   celular de alguien": o sea, a buscar un error que no existía. La elección
   estaba bien; lo que pasa es que los Thinkdiag/Thinkcar (y los Launch X431)
   usan el protocolo propietario de su marca, atado a su propia app, y no
   entienden ni ATI ni ATZ.

   Peor todavía: el selector lo etiquetaba en color como "🔌 Escáner Thinkcar",
   o sea le prometía que servía.

   Lo que se cuida: que el reconocedor no se pase de ancho (un vLinker NO puede
   quedar marcado como incompatible, es el que sí funciona) ni se quede corto. */
const { cargar, ok, fin } = require('./harness');

const { M } = cargar();

/* ── Los que de verdad no sirven ─────────────────────────────────────────── */
for (const n of ['THINKDIAG', 'Thinkdiag TKD01', 'thinkcar', 'ThinkTool Mini',
                 'LAUNCH X431', 'X-431 PRO', 'DBSCar', 'golo easydiag']) {
  ok(`"${n}" se reconoce como dongle cerrado`, M._esDongleCerrado(n) === true);
}

/* ── Y los que sí, que no se pueden marcar por error ─────────────────────── */
for (const n of ['vLinker MS', 'Vgate iCar Pro', 'OBDII', 'ELM327 v2.3',
                 'OBDLink MX+', 'Veepeak', 'STN1110', '', null, undefined]) {
  ok(`"${n}" NO se marca como cerrado`, M._esDongleCerrado(n) === false);
}

fin();
