/* Ningún número que el vehículo no dijo (2026-09-22).

   Henry vio presión de llantas en un Picanto que no tiene TPMS. Venía de tres
   lugares: valores FIJOS de relleno (32.5 PSI), una tabla de direcciones de
   Hyundai aplicada a toda marca (0x7D2 = TPMS; en el Picanto es la carrocería)
   y lecturas UDS 22 con identificadores supuestos. Además las "pruebas activas"
   mandaban un comando inventado a cualquier módulo y decían "correcto" sin
   haber transmitido. Esto fija que no vuelva.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');
const { M } = cargar();

(async () => {
  /* ── Nada se lee por UDS 22 sin definición verificada ── */
  let transmitido = 0;
  M._udsPedir = async () => { transmitido++; return [0x62, 0xC0, 0x01, 160, 160, 160, 160]; };
  for (const req of [0x7D2, 0x758, 0x7E1, 0x7D4, 0x710]) {
    const r = await M._leerParametrosUDSModulo({ req, resp: req + 8 });
    ok(`0x${req.toString(16).toUpperCase()}: no devuelve parámetros supuestos`, Object.keys(r).length === 0);
  }
  ok('y no transmite nada para intentarlo', transmitido === 0);
  ok('ya no existe el relleno con valores fijos', typeof M._sintetizarParametrosOEM === 'undefined');

  /* ── Pruebas activas: nunca transmiten un identificador inventado ── */
  transmitido = 0;
  M._puedePuntoAPunto = () => ({ ok: true });
  M._elmPuntoAPunto = async fn => fn();
  await M.ejecutarPruebaActuador(0x7D1, 'abs_bomba_motor', true);
  ok('la prueba activa no transmite', transmitido === 0);

  /* ── Direcciones: la genérica solo trae lo legislado ── */
  ok('la tabla genérica solo tiene motor y transmisión',
     Object.keys(M._UDS_NOMBRES).map(Number).sort().join() === [0x7E0, 0x7E1].join());
  ok('en Kia 0x7D2 no se nombra por dirección (no está verificado)', M._sugerenciaPorDireccion(0x7D2, 'Kia') === null);
  ok('en Kia 0x7D4 es UNA cosa, no "esto o aquello"', !/\so\s/.test(M._sugerenciaPorDireccion(0x7D4, 'Kia').nombre));

  /* ── Un marcador guardado no tapa la identificación real ── */
  M._modulosDeclarados = [
    { req: 0x7B3, nombre: 'Sin identificar 0x7B3' },
    { req: 0x7C6, nombre: 'Pieza 94003G6920' },
    { req: 0x7A5, nombre: 'Llave inteligente' },
  ];
  const kia = { marca: 'Kia' };
  const r7B3 = M._nombreResuelto({ ecu: 0x7B3, ident: null, codigos: [] }, kia.marca);
  ok('0x7B3 guardado como "Sin identificar" se llama Climatización', /Climatizaci/.test(r7B3.nombre));
  ok('y no dice "nombrado por el taller"', !/taller/.test(r7B3.origen));
  const r7C6 = M._nombreResuelto({ ecu: 0x7C6, ident: { referencia: '94003G6920' }, codigos: [] }, kia.marca);
  ok('0x7C6 guardado como "Pieza 94003G6920" se llama Tablero', /Tablero/.test(r7C6.nombre));
  const r7A5 = M._nombreResuelto({ ecu: 0x7A5, ident: null, codigos: [] }, kia.marca);
  ok('un nombre REAL del taller sí gana', r7A5.nombre === 'Llave inteligente' && /taller/.test(r7A5.origen));

  /* ── Las pantallas y el informe usan el mismo nombre ── */
  const s = { protocolo: 'ISO 15765-4', por_modulo: [
    { ecu: 0x7B3, nombre: 'Sin identificar 0x7B3', codigos: [] },
    { ecu: 0x7D2, nombre: 'Presión de Neumáticos (TPMS)', codigos: [{ codigo: 'B2500' }] },
  ] };
  M._modulosDeclarados = [];
  M._resolverNombres(s, kia);
  ok('un escaneo guardado con el cálculo viejo se corrige al mostrarse',
     /Climatizaci/.test(s.por_modulo[0].nombre) && s.por_modulo[1].nombre === 'Carrocería');
  ok('ya no aparece TPMS en la carrocería del Picanto', !/TPMS/.test(JSON.stringify(s)));

  fin();
})();
