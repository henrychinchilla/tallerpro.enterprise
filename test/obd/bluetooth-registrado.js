/* Escaneo por Bluetooth = el escáner registrado en esta PC (2026-09-22).

   Henry: «si doy escaneo por Bluetooth es porque usaré ESE Bluetooth» (el
   vLinker MS emparejado en Windows); si no está, que pregunte cuál; y un botón
   para forzar el registrado. Windows crea un COM entrante y uno saliente por
   equipo, así que "reusar si hay UNO autorizado" casi nunca se cumplía y el
   selector se abría siempre. Ahora se reconoce el escáner por lo que contesta.

   También: el VIN se pedía una sola vez (el Picanto lo dio a las 00:51 y no a
   las 00:27) y el costo del escaneo sale del reporte.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */
const { cargar, ok, fin } = require('./harness');
const dormir = ms => new Promise(r => setTimeout(r, ms));

/* Puerto doble: `responde` decide si del otro lado hay un ELM327. */
function puerto(nombre, responde) {
  const pend = [], cola = [];
  let cerrada = false;
  const bombear = () => {
    while (pend.length && cola.length) pend.shift()({ value: cola.shift(), done: false });
    if (cerrada) while (pend.length) pend.shift()({ value: null, done: true });
  };
  const p = {
    nombre, abierto: false, aperturas: 0,
    async open() { p.aperturas++; if (p.abierto) throw new Error('already open'); p.abierto = true; cerrada = false; },
    async close() { p.abierto = false; },
    get readable() { return p.abierto && !cerrada ? { getReader: () => ({
      read: () => new Promise(res => { pend.push(res); bombear(); }),
      cancel: async () => { cerrada = true; bombear(); }, releaseLock: () => {} }) } : null; },
    get writable() { return p.abierto ? { getWriter: () => ({
      write: async b => { const t = new TextDecoder().decode(b);
        if (responde && /ATI/.test(t)) setTimeout(() => { cola.push(new TextEncoder().encode('ATI\rELM327 v2.3\r\r>')); bombear(); }, 5); },
      abort: async () => {}, releaseLock: () => {} }) } : null; },
  };
  return p;
}

function entorno(puertos, almacen = {}) {
  let pedidos = 0;
  const { M } = cargar({
    TextEncoder, TextDecoder,
    localStorage: { getItem: k => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = String(v); } },
    navigator: { clipboard: { writeText: async () => {} },
      serial: { getPorts: async () => puertos, requestPort: async () => { pedidos++; return puertos[puertos.length - 1]; } } },
  });
  M._via = 'serial';
  return { M, almacen, pedidos: () => pedidos };
}

(async () => {
  /* ── Dos COM autorizados: el entrante (mudo) y el del vLinker ── */
  const entrante = puerto('COM5 entrante', false), vlinker = puerto('COM6 vLinker', true);
  const e1 = entorno([entrante, vlinker]);
  const r = await e1.M._serialInit(() => {});
  ok('entra directo al que contesta como escáner, sin abrir el selector', e1.pedidos() === 0 && e1.M._webSerialPort === vlinker);
  ok('reporta lo que contestó el escáner', /ELM327 v2\.3/.test(r.nombre));
  ok('recuerda cuál fue', JSON.parse(e1.almacen.obd_puerto_bt).indice === 1);
  ok('el puerto mudo quedó cerrado', entrante.abierto === false);
  e1.M._desconectar(); await dormir(250);

  /* ── La vez siguiente prueba PRIMERO el registrado ── */
  entrante.aperturas = 0;
  const e2 = entorno([entrante, vlinker], e1.almacen);
  await e2.M._serialInit(() => {});
  ok('con el puerto registrado ya ni toca el entrante', entrante.aperturas === 0 && e2.M._webSerialPort === vlinker);
  e2.M._desconectar(); await dormir(250);

  /* ── Forzar el registrado: si no contesta, error claro y SIN selector ── */
  const apagado = puerto('COM6 vLinker apagado', false);
  const e3 = entorno([apagado]);
  let err = null;
  await e3.M._serialInit(() => {}, 'conocido').catch(x => { err = x.message; });
  ok('forzar el registrado no abre el selector', e3.pedidos() === 0);
  ok('y dice qué revisar', /no contestó/i.test(err || '') && /Elegir otro escáner/.test(err || ''));

  /* ── Sin forzar: si el registrado no contesta, pregunta cuál usar ── */
  const otro = puerto('COM9 otro escáner', true);
  const e4 = entorno([apagado, otro]);
  e4.M._serialInit = e4.M._serialInit.bind(e4.M);
  await e4.M._serialInit(() => {});
  ok('encuentra al que sí contesta', e4.M._webSerialPort === otro);
  e4.M._desconectar(); await dormir(250);

  /* ── "Elegir otro escáner" va directo al selector ── */
  const e5 = entorno([vlinker]);
  await e5.M._serialInit(() => {}, 'elegir');
  ok('elegir otro abre el selector de Windows', e5.pedidos() === 1);
  e5.M._desconectar(); await dormir(250);

  /* ── VIN: se reintenta y solo vale completo ── */
  const { M } = cargar();
  let n = 0;
  M._cmd = async () => (++n < 3 ? 'SEARCHING...\rNO DATA' : '014\r0: 49 02 01 4B 4E 41\r1: 42 32 35 31 32 41 4B\r2: 54 33 31 31 37 36 36');
  M._hexLines = s => s.split(/\r/).map(l => l.replace(/^[0-9A-F]{1,2}:/i, '').replace(/[^0-9A-F]/gi, '').toUpperCase()).filter(l => l.length >= 2);
  const vin = await M._leerVIN();
  ok('si al primer intento no contesta, reintenta y lo obtiene', vin === 'KNAB2512AKT311766' && n === 3);
  n = 0;
  M._cmd = async () => '49 02 01 4B 4E 41 42 32 35';
  ok('un VIN a medias NO se da por VIN', (await M._leerVIN()) === null);

  /* ── Costo fuera del reporte ── */
  ok('ya no existe la tarjeta de costo', typeof M._costoHTML === 'undefined');

  fin();
})();
