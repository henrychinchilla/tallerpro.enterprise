/* Paso 1 y 2 del catálogo de DTC por módulo (2026-09-22).

   1. Filtro de respuesta: sin ATCRA el ELM entregaba lo que dijera cualquier
      módulo. En el Picanto la dirección 0x7D4 salió con P0115, P0106, P0782,
      B0001 y U39FF (motor, transmisión, airbag) y en el escaneo siguiente con
      ninguno.
   2. El catálogo: 19 0A devuelve TODOS los códigos que el módulo puede
      reportar; se guarda por marca/modelo/módulo.

   Parte del banco de pruebas del modulo OBD — ver harness.js. */
const { cargar, ok, fin } = require('./harness');

(async () => {
  const { M } = cargar();
  M._esELM = () => true;
  M._trazaNota = () => {};

  /* ── Con la dirección de respuesta esperada: filtra y contesta ── */
  let enviados = [];
  M._cmd = async c => {
    enviados.push(c);
    if (c === '1902FF') return '7DC\r0:5902FFC11016\r1:08000000\r\r';   // no importa el formato: _parsearRespELM
    return 'OK';
  };
  M._respAprendida = {};
  const d1 = await M._udsPedirELM(0x7D4, null, [0x19, 0x02, 0xFF]);
  ok('filtra por la respuesta de ESE módulo (pedido + 8)', enviados.includes('ATCRA 7DC'));
  ok('y devuelve lo que contestó', d1 && d1[0] === 0x59);

  /* ── Nadie en +8: pregunta con cabeceras y aprende quién contesta ── */
  enviados = [];
  let conCabeceras = false;
  M._respAprendida = { [0x7D2]: 0x7DA };            // 0x7D2 ya se sabe que contesta en 0x7DA
  M._cmd = async c => {
    enviados.push(c);
    if (c === 'ATH1') { conCabeceras = true; return 'OK'; }
    if (c === 'ATH0') { conCabeceras = false; return 'OK'; }
    if (c === '1902FF') {
      if (!conCabeceras) return 'NO DATA';
      /* Dos respuestas en el aire: una tardía del 0x7D2 (0x7DA) y la del
         módulo de verdad, que contesta en 0x763 (+0x20). */
      return '7DA0759020115412100\r76306590208C11016\r';
    }
    return 'OK';
  };
  const d2 = await M._udsPedirELM(0x743, null, [0x19, 0x02, 0xFF]);
  ok('aprende que 0x743 contesta en 0x763', M._respAprendida[0x743] === 0x763);
  ok('y se queda con SUS tramas, no con la tardía del 0x7D2',
     d2 && d2[0] === 0x59 && d2[2] === 0x08 && d2[3] === 0xC1);
  ok('vuelve a apagar las cabeceras', enviados.lastIndexOf('ATH0') > enviados.indexOf('ATH1'));

  /* ── Una respuesta de 0x7E8 no se toma por la de un módulo que no es de emisiones ── */
  M._respAprendida = {};
  M._cmd = async c => (c === '1902FF' ? (enviados.includes('ATH1') && conCabeceras ? '7E8065902FF01154121\r' : 'NO DATA')
                                       : (c === 'ATH1' ? (conCabeceras = true, 'OK') : c === 'ATH0' ? (conCabeceras = false, 'OK') : 'OK'));
  enviados = ['ATH1'];
  const d3 = await M._udsPedirELM(0x7D4, null, [0x19, 0x02, 0xFF]);
  ok('lo que dice el motor (0x7E8) NO se atribuye a la dirección 0x7D4', d3 === null && M._respAprendida[0x7D4] === undefined);

  /* ── Al salir del modo módulo se quita el filtro ── */
  enviados = [];
  M._cmd = async c => { enviados.push(c); return 'OK'; };
  await M._elmModoModulo(false);
  ok('al terminar vuelve a escuchar a todos (ATAR) y sin cabeceras (ATH0)',
     enviados.includes('ATAR') && enviados.includes('ATH0') && enviados.includes('ATSH 7DF'));

  /* ── 19 0A: el catálogo completo, activos o no ── */
  const r = [0x59, 0x0A, 0xFF,
             0x51, 0x02, 0x16, 0x00,     // C1102-16, sin fallar
             0x9A, 0x00, 0x00, 0x08,     // B1A00, confirmado
             0x01, 0x15, 0x00, 0x40,     // P0115, monitor sin correr
             0x51, 0x02, 0x16, 0x00];    // repetido
  const sop = M._dtcsSoportados(r);
  ok('toma TODOS los códigos, sin filtrar por estado', sop.length === 3);
  ok('separa código y tipo de falla', sop[0].codigo === 'C1102' && sop[0].ftb === '16' && sop[2].codigo === 'P0115' && sop[2].ftb === '');
  ok('una respuesta de 19 02 no se lee como catálogo', M._dtcsSoportados([0x59, 0x02, 0xFF, 0xC1, 0x10, 0x16, 0x08]).length === 0);

  /* ── Se guarda por marca/modelo/módulo ── */
  let guardado = null;
  M._guardarCatalogoDTC = M._guardarCatalogoDTC.bind(M);
  const ctxDB = { upsertDTCsModulo: async f => { guardado = f; return { error: null }; } };
  global.DB = ctxDB;
  const { M: M2, ctx } = cargar();
  ctx.DB.upsertDTCsModulo = ctxDB.upsertDTCsModulo;
  const n = await M2._guardarCatalogoDTC([
    { ecu: 0x7D4, soportados: sop },
    { ecu: 0x7D2, soportados: [] },
    { ecu: 0x18DA10F1, ext: true, soportados: sop },   // 29 bits: fuera por ahora
  ], { marca: 'Kia', modelo: 'Picanto' });
  ok('guarda una fila por código del módulo', n === 3 && guardado.length === 3);
  ok('con marca, modelo, dirección y tipo de falla',
     guardado[0].marca === 'Kia' && guardado[0].modelo === 'Picanto' && guardado[0].req === 0x7D4 &&
     guardado[0].codigo === 'C1102' && guardado[0].ftb === '16' && guardado[0].fuente === '19 0A');
  ok('sin marca no guarda nada (no se sabría de qué vehículo es)',
     (await M2._guardarCatalogoDTC([{ ecu: 0x7D4, soportados: sop }], { marca: null })) === 0);

  fin();
})();
