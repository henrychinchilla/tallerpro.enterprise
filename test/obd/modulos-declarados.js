/* Módulos declarados por el taller: airbag, ABS, EPS, TCM, carrocería…

   El barrido automático solo encuentra lo que contesta en 0x700-0x7EF, y a lo
   que encuentra le pone el nombre que puede deducir. Un módulo en otra red, en
   29 bits o en una dirección propia no aparece nunca por su cuenta, y uno que
   sí aparece salía como "Módulo 0x745" aunque el taller supiera perfectamente
   que ese es el airbag de ese modelo.

   Declarar un módulo NO transmite nada: agrega una dirección a la que se
   pregunta "¿hay alguien?" (Tester Present, 3E 00, de solo lectura) y un
   nombre. Lo que transmite sigue viviendo en el catálogo OEM.

   Parte del banco de pruebas del módulo OBD — ver harness.js. */

const { cargar, ok, fin } = require('./harness');

/* DOM de mentira: los formularios leen valores con getElementById().value y
   pintan con .innerHTML. Con el doble del harness (que devuelve null) no se
   puede probar la validación, que es justamente donde se decide si una
   dirección imposible llega o no a la base. */
function hacerDOM(valores = {}) {
  const nodos = {};
  return {
    pon: (id, val) => { valores[id] = val; },
    nodos,
    getElementById: id => {
      if (!(id in valores) && !(id in nodos)) nodos[id] = { innerHTML: '', value: '', checked: false };
      if (id in valores) {
        const v = valores[id];
        return typeof v === 'boolean'
          ? { checked: v, value: '', innerHTML: '' }
          : { value: String(v), checked: false, innerHTML: '' };
      }
      return nodos[id];
    },
    querySelector: () => null,
  };
}

const guardados = [];
const dom = hacerDOM();
const { M, ctx } = cargar({
  document: dom,
  UI: {
    esc: s => String(s == null ? '' : s),
    jsAttr: s => String(s == null ? '' : s).replace(/'/g, "\\'"),
    fecha: d => new Date(d).toISOString().slice(0, 10),
    toast: (m, t) => { ctx.toasts.push((t || 'ok') + ':' + m); },
    modal: (titulo, html) => { ctx.pintado = { titulo, html }; },
    cerrarModal: () => {}, confirmar: async () => true,
  },
  puedeAccion: () => true,
});
ctx.Modulos.btnAccion = (accion, onclick) => `<button onclick="${onclick}">${accion}</button>`;
ctx.Modulos.eliminarRegistro = () => {};
ctx.Modulos.vehiculos = {
  _marcasPorTipo: { Liviano: ['Toyota', 'Kia'] },
  _modelosPorMarca: { Kia: ['Picanto', 'Rio'] },
  _modelosEspeciales: {},
};
ctx.DB.getVehiculos = async () => M._vehiculos;
ctx.DB.getTodosModulosVehiculo = async () => ctx._declarados;
ctx.DB.getModulosVehiculo = async () => ctx._declarados;
ctx.DB.upsertModuloVehiculo = async f => { guardados.push(f); return { data: f, error: null }; };
ctx._declarados = [];

(async () => {
  /* ── Leer una dirección escrita a mano ── */
  ok('acepta 7E0', M._leerHex('7E0') === 0x7E0);
  ok('acepta 0x7E0', M._leerHex('0x7E0') === 0x7E0);
  ok('acepta minúsculas', M._leerHex('7e0') === 0x7E0);
  ok('vacío es "no pusieron nada", no cero', M._leerHex('') === null && M._leerHex('  ') === null);
  ok('lo que no es hexadecimal se rechaza', Number.isNaN(M._leerHex('ZZ')) && Number.isNaN(M._leerHex('7G0')));
  ok('el 0 es una dirección válida, no un vacío', M._leerHex('0') === 0);

  /* ── Sugerencias de marca y modelo ── */
  M._vehiculos = [{ id: 'v1', marca: 'Kia', modelo: 'Picanto', anio: 2019 },
                  { id: 'v2', marca: 'Mahindra', modelo: 'Scorpio', anio: 2015 }];
  ok('las marcas incluyen el catálogo general', M._marcasConocidas().includes('Toyota'));
  ok('y también las que solo existen en este taller', M._marcasConocidas().includes('Mahindra'));
  ok('los modelos del catálogo salen', M._modelosConocidos('Kia').includes('Rio'));
  ok('y el modelo que solo está en el taller también',
     M._modelosConocidos('Mahindra').includes('Scorpio'));

  /* ── El mapa del modelo mezcla escaneos y declaraciones ── */
  ctx.DB.getDiagnosticosPorModelo = async () => [
    { mapa_acceso: { enlace:'can', via:'usb', bits:11, baud:500, modulos: [
        { req:0x7E0, resp:0x7E8, nombre:'Motor (ECM)' },
        { req:0x745, resp:0x74D, nombre:'Módulo 0x745' } ] } },
  ];
  ctx._declarados = [
    { id:'d1', marca:'Kia', modelo:'Picanto', nombre:'Airbag / SRS', sistema:'srs',
      req:0x745, resp:0x74D, ext:false, red:'hs', protocolo:'uds', activo:true, origen:'manual' },
    { id:'d2', marca:'Kia', modelo:'Picanto', nombre:'Dirección asistida (EPS)', sistema:'eps',
      req:0x7D4, resp:null, ext:false, red:'hs', protocolo:'uds', activo:true, origen:'manual' },
  ];
  const mapa = await M._mapaConocido('v1');
  ok('el mapa junta escaneos y declaraciones', mapa && mapa.modulos.length === 3);
  ok('dice cuántos venían declarados', mapa.declarados === 2);
  ok('el nombre del taller PISA al que dedujo el barrido',
     mapa.modulos.find(m => m.req === 0x745).nombre === 'Airbag / SRS');
  ok('el módulo que solo está declarado entra igual',
     mapa.modulos.some(m => m.req === 0x7D4 && m.declarado));
  ok('y no se le inventa dirección de respuesta',
     mapa.modulos.find(m => m.req === 0x7D4).resp === null);
  ok('el motor que nadie declaró sigue ahí', mapa.modulos.some(m => m.req === 0x7E0));

  /* Sin un solo escaneo previo, las declaraciones bastan para tener mapa: es el
     caso del vehículo que entra por primera vez al taller. */
  ctx.DB.getDiagnosticosPorModelo = async () => [];
  const soloDeclarado = await M._mapaConocido('v1');
  ok('con cero escaneos previos, lo declarado ya es un mapa',
     soloDeclarado && soloDeclarado.modulos.length === 2 && soloDeclarado.n === 0);

  /* Un db.js viejo servido por el Service Worker junto a este archivo nuevo NO
     puede tumbar el mapa conocido, que funcionaba desde antes. */
  const guardarGet = ctx.DB.getModulosVehiculo, guardarTodos = ctx.DB.getTodosModulosVehiculo;
  delete ctx.DB.getModulosVehiculo;
  delete ctx.DB.getTodosModulosVehiculo;
  ctx.DB.getDiagnosticosPorModelo = async () => [
    { mapa_acceso: { enlace:'can', via:'usb', bits:11, baud:500, modulos:[{ req:0x7E0, resp:0x7E8, nombre:'Motor (ECM)' }] } },
  ];
  const sinFuncion = await M._mapaConocido('v1');
  ok('sin la función nueva en db.js, el mapa conocido sigue funcionando',
     sinFuncion && sinFuncion.modulos.length === 1);
  ok('y la lista de declarados queda vacía, no rota',
     (await M._declaradosDelTaller()).length === 0);
  ctx.DB.getModulosVehiculo = guardarGet;
  ctx.DB.getTodosModulosVehiculo = guardarTodos;
  ctx.DB.getDiagnosticosPorModelo = async () => [];
  await M._mapaConocido('v1');      // vuelve a cargar lo declarado

  /* ── El nombre declarado gana en el reporte ── */
  ok('_nombreDeclarado encuentra el nombre del taller', M._nombreDeclarado(0x745) === 'Airbag / SRS');
  ok('el nombre declarado gana sobre la tabla de direcciones comunes',
     M._nombreUDS(0x745, []) === 'Airbag / SRS');
  ok('una dirección sin declarar sigue usando la tabla',
     M._nombreUDS(0x744, []) === 'Airbag / SRS' || /0x744/.test(M._nombreUDS(0x744, [])));
  ctx._declarados = [];
  M._modulosDeclarados = [];
  ok('sin declaraciones no inventa nombres', M._nombreDeclarado(0x745) === null);

  /* ── Guardar: la validación que evita una dirección imposible ── */
  const intentar = async campos => {
    ctx.toasts.length = 0;
    const d = hacerDOM(campos);
    ctx.document = d;
    vmSet(d);
    await M.guardarModuloVehiculo('');
    return ctx.toasts.join(' | ');
  };
  /* El módulo capturó `document` del sandbox al cargarse, así que hay que
     cambiarlo ahí, no solo en la referencia local. */
  function vmSet(d) { ctx.document = d; }

  const base = {
    'mod-marca':'Kia', 'mod-modelo':'Picanto', 'mod-nombre':'Airbag / SRS',
    'mod-sistema':'srs', 'mod-req':'7B3', 'mod-resp':'7BB', 'mod-red':'hs',
    'mod-proto':'uds', 'mod-anio-desde':'', 'mod-anio-hasta':'', 'mod-nota':'',
    'mod-ext': false, 'mod-activo': true,
  };

  guardados.length = 0;
  let msg = await intentar(base);
  ok('guarda un módulo bien formado', guardados.length === 1 && /agregado/i.test(msg));
  ok('y guarda la dirección como número, no como texto',
     guardados[0].req === 0x7B3 && guardados[0].resp === 0x7BB);
  ok('lo escrito a mano queda marcado como manual', guardados[0].origen === 'manual');

  guardados.length = 0;
  msg = await intentar({ ...base, 'mod-nombre':'' });
  ok('sin nombre no guarda', guardados.length === 0 && /nombre/i.test(msg));

  msg = await intentar({ ...base, 'mod-marca':'' });
  ok('sin marca no guarda', guardados.length === 0 && /marca/i.test(msg));

  msg = await intentar({ ...base, 'mod-req':'' });
  ok('sin dirección no guarda', guardados.length === 0 && /direcci/i.test(msg));

  msg = await intentar({ ...base, 'mod-req':'ZZZ' });
  ok('una dirección que no es hexadecimal no guarda', guardados.length === 0 && /hexadecimal/i.test(msg));

  msg = await intentar({ ...base, 'mod-req':'18DA10F1', 'mod-ext': false });
  ok('una dirección de 29 bits sin marcar la casilla no guarda',
     guardados.length === 0 && /11 bits/.test(msg));

  guardados.length = 0;
  msg = await intentar({ ...base, 'mod-req':'18DA10F1', 'mod-ext': true });
  ok('la misma dirección CON la casilla marcada sí guarda',
     guardados.length === 1 && guardados[0].ext === true);

  msg = await intentar({ ...base, 'mod-anio-desde':'2020', 'mod-anio-hasta':'2010' });
  ok('un rango de años invertido no guarda', /año/i.test(msg));

  guardados.length = 0;
  msg = await intentar({ ...base, 'mod-resp':'' });
  ok('sin dirección de respuesta guarda igual (el ELM no la revela)',
     guardados.length === 1 && guardados[0].resp === null);

  /* La colisión la detecta la base; acá se prueba que el mensaje sea legible. */
  ctx.DB.upsertModuloVehiculo = async () => ({ error: { message: 'duplicate key value violates unique constraint (23505)' } });
  msg = await intentar(base);
  ok('una dirección ya declarada se explica en castellano, no con "23505"',
     /ya está declarada/i.test(msg) && !/23505/.test(msg));
  ctx.DB.upsertModuloVehiculo = async f => { guardados.push(f); return { data: f, error: null }; };

  /* ── La pantalla se pinta y ningún botón llama a algo inexistente ── */
  ctx.document = dom;
  ctx._declarados = [
    { id:'d1', marca:'Kia', modelo:'Picanto', nombre:'Airbag / SRS', sistema:'srs',
      req:0x745, resp:0x74D, ext:false, red:'hs', protocolo:'uds', activo:true,
      origen:'manual', created_at:'2026-09-17T00:00:00Z' },
  ];
  let exploto = null;
  try { await M.modalModulosVehiculo(); } catch (e) { exploto = e; }
  ok('la pantalla de módulos se pinta sin reventar', !exploto, exploto && exploto.message);
  const html = (dom.nodos['obd-mods-cuerpo'] || {}).innerHTML || '';
  ok('lista el módulo declarado', /Airbag \/ SRS/.test(html));
  ok('muestra la dirección en hexadecimal', /0x745/.test(html));
  ok('ofrece agregar, ver, editar y eliminar',
     /editarModuloVehiculo\(\)/.test(html) && /verModuloVehiculo\('d1'\)/.test(html) &&
     /editarModuloVehiculo\('d1'\)/.test(html) && /eliminarModuloVehiculo\('d1'/.test(html));
  ok('y tomar los módulos del escaneo', /modalTomarDelEscaneo\(\)/.test(html));

  exploto = null;
  try { M.editarModuloVehiculo('d1'); } catch (e) { exploto = e; }
  ok('el formulario se pinta sin reventar', !exploto, exploto && exploto.message);
  ok('el formulario llega con la dirección ya puesta', /value="745"/.test(ctx.pintado.html));

  exploto = null;
  try { M.verModuloVehiculo('d1'); } catch (e) { exploto = e; }
  ok('la ficha se pinta sin reventar', !exploto, exploto && exploto.message);
  ok('la ficha dice que declarar no transmite nada', /no transmite nada/i.test(ctx.pintado.html));

  const llamadas = [...(html + ctx.pintado.html).matchAll(/Modulos\.diagnostico_obd\.([A-Za-z_$][\w$]*)/g)]
    .map(x => x[1]);
  const muertas = [...new Set(llamadas)].filter(n => typeof M[n] !== 'function');
  ok('ningún botón llama a un método que no existe' +
     (muertas.length ? ` — falta: ${muertas.join(', ')}` : ''), muertas.length === 0);

  fin();
})();
