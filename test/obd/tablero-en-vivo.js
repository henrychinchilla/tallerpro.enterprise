/* Tablero en vivo ("modo GOD", 2026-09-22).

   Reglas que no se pueden romper:
     · solo relojes de sensores que el vehículo SOPORTA; sin dato, "—";
     · el ciclo en vivo no rehace el tablero (borraría el mapa y la foto);
     · el mapa existe solo con datos en vivo, y el recorrido se guarda con la
       grabación;
     · la foto es de Wikimedia Commons, del modelo, sin interiores ni logos, y
       con su autor y licencia.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { cargar, ok, fin } = require('./harness');

/* DOM mínimo: elementos por id, creados a pedido. */
function dom() {
  const els = {};
  const el = id => (els[id] = els[id] || { id, innerHTML: '', textContent: '', style: {},
    querySelector: sel => (el(id + ' ' + sel)), appendChild() {} });
  return { els, el, getElementById: id => els[id] || null, querySelector: () => null,
           createElement: () => ({ style: {} }), head: { appendChild() {} } };
}

(async () => {
  const d = dom();
  const guardado = {};
  const watchers = [];
  const { M, ctx } = cargar({
    document: d,
    localStorage: { getItem: k => guardado[k] || null, setItem: (k, v) => { guardado[k] = v; } },
    navigator: {
      clipboard: { writeText: async () => {} },
      geolocation: {
        watchPosition: (ok) => { watchers.push(ok); return watchers.length; },
        clearWatch: () => { watchers.length = 0; },
      },
    },
    fetch: async url => ({ ok: true, json: async () => ({ query: { pages: {
      1: { index: 1, title: 'File:Kia Picanto JA interior.jpg', imageinfo: [{ mime: 'image/jpeg', url: 'x', thumburl: 'interior.jpg' }] },
      2: { index: 2, title: 'File:Kia Picanto logo.png', imageinfo: [{ mime: 'image/png', url: 'x', thumburl: 'logo.png' }] },
      3: { index: 3, title: 'File:2019 Kia Picanto GT-Line.jpg', imageinfo: [{ mime: 'image/jpeg', url: 'full.jpg', thumburl: 'picanto.jpg',
           descriptionurl: 'https://commons.wikimedia.org/wiki/File:2019_Kia_Picanto_GT-Line.jpg',
           extmetadata: { Artist: { value: '<a>Vauxford</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] },
    } } }) }),
  });
  ctx.Image = function () { this.style = {}; };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'modulos', 'operacion', 'diagnostico_tablero.js'), 'utf8'), ctx);

  M._vehiculos = [{ id: 'v1', marca: 'Kia', modelo: 'Picanto', anio: 2019, color: 'Rojo', placa: 'P-332JPT' }];
  M._scan = { vehiculo_id: 'v1', vin: 'KNAB2512AKT311766', datos: { rpm: 780, temp: 42 } };
  M._sop = ['0C', '05', '2F', '42'];          // el Picanto NO reporta velocidad en esta prueba
  M._hist = {};

  /* ── Solo lo soportado ── */
  const html = M._tableroHTML();
  ok('dibuja reloj de RPM y temperatura (soportados)', /tab-g-rpm/.test(html) && /tab-g-temp/.test(html));
  ok('NO dibuja velocidad si el vehículo no la reporta', !/tab-g-vel/.test(html) && !/tab-c-vel/.test(html));
  ok('muestra el VIN y el color de la ficha', /KNAB2512AKT311766/.test(html) && /Rojo/.test(html));
  ok('el mapa arranca oculto', /id="tab-mapa-wrap"[^>]*display:none/.test(html));

  /* ── Sin dato no hay número ── */
  ok('el valor sale del escaneo si no hay monitor', M._valorTablero('rpm') === 780);
  ok('un sensor sin dato devuelve null, no un número de relleno', M._valorTablero('comb') === null);

  /* ── El ciclo no rehace el tablero ── */
  M._vistaMon = 'tablero';
  d.el('obd-vivo');
  d.el('tab-root');
  ok('con el tablero pintado, el ciclo solo actualiza (devuelve null)', M._tilesMonitor() === null);
  d.els['obd-vivo'].innerHTML = 'TABLERO';
  M._pintarVivo(d.els['obd-vivo']);
  ok('...y no borra lo que ya está dibujado', d.els['obd-vivo'].innerHTML === 'TABLERO');

  /* ── Mapa solo con datos en vivo ── */
  M._liveTimer = null;
  M._abrirTablero();
  ok('sin monitor en vivo no se pide el GPS', watchers.length === 0);
  M._liveTimer = 1;
  M._rec = { muestras: [], t0: Date.now() };
  M._iniciarGPS();
  ok('con monitor en vivo se sigue el GPS', watchers.length === 1);
  watchers[0]({ coords: { latitude: 14.6, longitude: -90.5 } });
  ok('el recorrido queda en la ruta', M._ruta.length === 1 && M._ruta[0].lat === 14.6);
  ok('y se guarda con la grabación', M._rec.ruta && M._rec.ruta.length === 1);
  M._liveTimer = null;
  M._detenerGPS();
  ok('al detener, se deja de seguir el GPS', watchers.length === 0 && M._gpsWatch === null);

  /* ── La foto ── */
  const foto = await M._fotoVehiculo({ marca: 'Kia', modelo: 'Picanto', anio: 2019, color: 'Rojo' });
  ok('elige la foto del modelo, no el interior ni el logo', foto && foto.url === 'picanto.jpg');
  ok('con autor y licencia (lo exige la licencia libre)', foto.autor === 'Vauxford' && foto.licencia === 'CC BY-SA 4.0');
  ok('queda guardada para no volver a buscarla', Object.keys(guardado).some(k => k.startsWith('obd_foto_kia|picanto')));

  fin();
})();
