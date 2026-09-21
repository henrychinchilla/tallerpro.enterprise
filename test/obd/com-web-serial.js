/* El COM por Web Serial es la vía COM, no una vía aparte.

   Nace de un fallo real (2026-09-20): con el vLinker MS 09327 emparejado en
   Windows, la app conectaba UNA vez desde Chrome y después ya no dejaba —
   mientras que en el teléfono, por el puente nativo, conectaba siempre.

   Dos causas, las dos del mismo tipo: se agregó un transporte nuevo y no se lo
   registró en los lugares que preguntan por `_via`.

     1. `_desconectar()` no cerraba el puerto. Un puerto Web Serial que queda
        abierto NO se puede volver a abrir: el segundo intento revienta con
        "The port is already open" y sólo se arregla recargando la página.
     2. El transporte se guardaba como una vía propia, 'webserial', que no
        figuraba en `_conectado`, `_listo`, `_esELM()` ni en el reparto de
        `_asegurarConexion`. Resultado: el escaneo terminaba bien y de ahí en
        adelante todo decía "desconectado", y la reconexión automática se iba a
        Web Bluetooth — la única vía que a este dongle no lo alcanza nunca.

   Acá no hay dongle: el puerto es un doble que anota lo que se le escribe y
   contesta lo que la prueba le diga. */
const { cargar, ok, fin } = require('./harness');

const dormir = ms => new Promise(r => setTimeout(r, ms));

/* Doble de SerialPort: sólo los métodos que usa el módulo. Se evita la API de
   streams a propósito — lo que hay que probar es el módulo, no el navegador. */
function puertoFalso() {
  const pendientes = [], cola = [];
  let lecturaCerrada = false;
  const bombear = () => {
    while (pendientes.length && cola.length) pendientes.shift()({ value: cola.shift(), done: false });
    if (lecturaCerrada) while (pendientes.length) pendientes.shift()({ value: null, done: true });
  };
  const lector = {
    read: () => new Promise(res => { pendientes.push(res); bombear(); }),
    cancel: async () => { lecturaCerrada = true; bombear(); },
    releaseLock: () => { p.lockLector = false; },
  };
  const escritor = {
    write: async bytes => { p.escrito.push(new TextDecoder().decode(bytes)); },
    abort: async () => {}, releaseLock: () => {},
  };
  const p = {
    abierto: false, cerrado: false, escrito: [], lockLector: false, aperturas: 0,
    async open() {
      p.aperturas++;
      /* Lo que hace el navegador de verdad, y el motivo de toda esta prueba. */
      if (p.abierto) throw new Error('Failed to execute \'open\' on \'SerialPort\': The port is already open.');
      p.abierto = true; lecturaCerrada = false;
    },
    async close() {
      if (p.lockLector) throw new Error('The port is locked');
      p.abierto = false; p.cerrado = true;
    },
    get readable() { return (p.abierto && !lecturaCerrada) ? { getReader: () => { p.lockLector = true; return lector; } } : null; },
    get writable() { return p.abierto ? { getWriter: () => escritor } : null; },
    /* El dongle contesta. El ELM327 cierra cada respuesta con el prompt '>'. */
    contestar(txt) { cola.push(new TextEncoder().encode(txt)); bombear(); },
  };
  return p;
}

(async () => {
  const puerto = puertoFalso();
  let pedidosDePuerto = 0;
  const almacen = {};
  const { M } = cargar({
    TextEncoder, TextDecoder,
    localStorage: {
      getItem: k => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
    },
    navigator: {
      clipboard: { writeText: async () => {} },
      serial: {
        getPorts: async () => [],
        requestPort: async () => { pedidosDePuerto++; return puerto; },
      },
    },
  });

  const bitacora = [];
  const log = m => bitacora.push(String(m));

  /* ── Conectar por COM ─────────────────────────────────────────────────── */
  M._via = 'serial';
  const pInit = M._serialInit(log);
  await dormir(20);
  ok('le escribe ATI al puerto', puerto.escrito.join('').includes('ATI'));
  puerto.contestar('ATI\rELM327 v2.3\r\r>');
  const r = await pInit;

  ok('la vía sigue siendo COM, no una vía nueva sin registrar', M._via === 'serial');
  ok('reporta el escáner', /Web Serial/i.test(r.nombre || ''));
  ok('el módulo se da por conectado', M._conectado === true);
  ok('...y listo para leer', M._listo === true);
  /* Lo que decide si se puede escanear módulo por módulo, ver el mapa de acceso
     y hablarle a un módulo suelto. Con la vía sin registrar daba false y todo
     eso desaparecía en silencio, que es el caso real de taller. */
  ok('...y se le habla como a un ELM327', M._esELM() === true);

  /* ── Dos comandos seguidos no se cruzan ───────────────────────────────── */
  const p1 = M._cmd('0100', 3000);
  await dormir(10);
  puerto.contestar('41 00 BE 3F A8 13\r\r>');
  const r1 = await p1;
  const p2 = M._cmd('010C', 3000);
  await dormir(10);
  puerto.contestar('41 0C 1A F8\r\r>');
  const r2 = await p2;
  ok('cada comando recibe SU respuesta (0100)', /4100BE3FA813/.test(r1.replace(/\s/g, '')));
  ok('cada comando recibe SU respuesta (010C)', /410C1AF8/.test(r2.replace(/\s/g, '')));

  /* ── Desconectar cierra el COM de verdad ──────────────────────────────── */
  M._desconectar();
  await dormir(250);
  ok('desconectar CIERRA el puerto', puerto.cerrado === true);
  ok('...y suelta la referencia', !M._webSerialPort);

  /* Y por eso se puede volver a conectar sin recargar la página: ésta es la
     prueba del síntoma que reportó Henry. */
  M._via = 'serial';
  let segundoFallo = null;
  const pInit2 = M._serialInit(log).catch(e => { segundoFallo = e; return null; });
  await dormir(20);
  puerto.contestar('ATI\rELM327 v2.3\r\r>');
  await pInit2;
  ok('se puede reconectar sin recargar', segundoFallo === null && M._conectado === true);
  ok('...y no fue de suerte: el puerto se abrió dos veces', puerto.aperturas === 2);

  M._desconectar();
  await dormir(250);

  /* ── La vía recordada no puede mandar a Web Bluetooth ─────────────────── */
  almacen['obd_ultima_via'] = JSON.stringify({ via: 'webserial', api: null, fecha: Date.now() });
  ok('una vía "webserial" vieja se lee como COM', M._ultimaVia && M._ultimaVia.via === 'serial');

  /* ── Si el puerto no abre, no queda medio abierto ─────────────────────── */
  const roto = puertoFalso();
  roto.open = async () => { throw new Error('Failed to open serial port.'); };
  const { M: M2 } = cargar({
    TextEncoder, TextDecoder,
    navigator: { clipboard: { writeText: async () => {} },
      serial: { getPorts: async () => [], requestPort: async () => roto } },
  });
  M2._via = 'serial';
  let motivo = null;
  await M2._serialInit(() => {}).catch(e => { motivo = e.message; });
  ok('un puerto que no abre da un error que se entiende', !!motivo && /no se pudo abrir el puerto com/i.test(motivo));
  ok('...y no deja el puerto tomado para el próximo intento', !M2._webSerialPort);

  ok('no se le pidió el puerto al usuario más veces de las necesarias', pedidosDePuerto === 2);

  fin();
})();
