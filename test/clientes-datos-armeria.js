/* Los datos personales largos del cliente son sólo para armería.

   Dos cosas que pueden salir mal, y la segunda es la que duele:

   1) Que un taller mecánico o una venta de granos tenga que ver campos de
      fecha de nacimiento, estado civil y recibos de servicios que no le
      sirven de nada. Eso es ruido.

   2) Que al NO dibujarse esos campos, guardar el cliente los mande como
      null y BORRE lo que ya estaba guardado. Ausente ≠ vacío: si el input
      no existe en la pantalla, la clave no debe viajar al update — porque
      PostgREST hace update parcial y omitirla es justo lo que preserva el
      dato. Un comercio que apague armería un rato perdería el expediente
      de todos sus clientes. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);

let guardado = null, htmlModal = '';
const campos = {};   // simula el DOM: sólo existe lo que el formulario dibujó

const ctx = {
  console,
  Modulos: {},
  UI: { esc: v => String(v ?? ''), modal: (t, h) => { htmlModal = h; }, cerrarModal() {}, toast() {} },
  NIT: { validarLocal: () => ({ valido: true }) },
  Docs: { render() {} },
  Auth: { tenant: { modulos_activos: [] } },
  DB: {
    upsertCliente: async (f) => { guardado = f; return { data: { id: 'c1' }, error: null } ; },
    getClientes: async () => [],
  },
  document: { getElementById: (id) => (id in campos ? campos[id] : null), querySelector: () => null },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'modulos', 'operacion', 'clientes.js'), 'utf8'), ctx);
const CLI = ctx.Modulos.clientes;
CLI.render = async () => {};   // no hay página que pintar en la prueba

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* Deja en el "DOM" sólo los campos base que cualquier comercio tiene. */
function domBase() {
  for (const k of Object.keys(campos)) delete campos[k];
  campos['cli-nombre'] = { value: 'Juan Pérez' };
  campos['cli-tel'] = { value: '5555-1234' };
  campos['cli-nit'] = { value: '123456-7' };
  campos['cli-dir'] = { value: 'Zona 1' };
}

/* guardar() es async y esto es CommonJS (sin await de nivel superior), así
   que todo el cuerpo va dentro de una función async. */
(async () => {

/* ── Comercio SIN armería: no se piden esos datos ────────────────────────── */
{
  ctx.Auth.tenant.modulos_activos = ['ordenes', 'vehiculos', 'inventario'];
  ok('un taller no pide datos de armería', CLI._pideDatosArmeria() === false);

  CLI._data = [];
  CLI.modalForm();
  ok('el formulario NO muestra fecha de nacimiento', !/id="cli-fnac"/.test(htmlModal));
  ok('...ni estado civil', !/id="cli-estado-civil"/.test(htmlModal));
  ok('...ni profesión ni nacionalidad',
     !/id="cli-profesion"/.test(htmlModal) && !/id="cli-nacionalidad"/.test(htmlModal));
  ok('...ni el tipo de vivienda', !/id="cli-vivienda"/.test(htmlModal));
  ok('...ni la sección de documentos de identificación',
     !/Documentos de identificaci[óo]n/.test(htmlModal));
  ok('pero sí sigue pidiendo lo de siempre (nombre, teléfono, NIT, dirección)',
     /id="cli-nombre"/.test(htmlModal) && /id="cli-tel"/.test(htmlModal) &&
     /id="cli-nit"/.test(htmlModal) && /id="cli-dir"/.test(htmlModal));
}

/* ── Y guardar NO debe borrar lo que ya estaba ───────────────────────────
   Éste es el caso peligroso: los inputs no existen, así que si guardar()
   los leyera igual mandaría null y machacaría el expediente guardado. */
{
  domBase();
  guardado = null;
  await CLI.guardar('c1');
  ok('se guardó algo', !!guardado);
  for (const clave of ['fecha_nacimiento', 'estado_civil', 'profesion', 'nacionalidad', 'dpi', 'vivienda']) {
    ok(`no manda "${clave}" cuando el campo no existe (si lo mandara, lo borraría)`,
       !(clave in guardado));
  }
  ok('sí manda los campos que sí existen', guardado.nombre === 'Juan Pérez' && guardado.direccion === 'Zona 1');
}

/* ── Comercio CON armería: sí se piden y sí se guardan ───────────────────── */
{
  ctx.Auth.tenant.modulos_activos = ['ordenes', 'armeria', 'inventario'];
  ok('un comercio con armería sí los pide', CLI._pideDatosArmeria() === true);

  CLI._data = [];
  CLI.modalForm();
  ok('el formulario muestra fecha de nacimiento', /id="cli-fnac"/.test(htmlModal));
  ok('...y estado civil, profesión, nacionalidad',
     /id="cli-estado-civil"/.test(htmlModal) && /id="cli-profesion"/.test(htmlModal) &&
     /id="cli-nacionalidad"/.test(htmlModal));
  ok('...y el tipo de vivienda', /id="cli-vivienda"/.test(htmlModal));
  ok('...y los documentos de identificación', /Documentos de identificaci[óo]n/.test(htmlModal));

  domBase();
  campos['cli-fnac'] = { value: '1990-06-15' };
  campos['cli-estado-civil'] = { value: 'casado(a)' };
  campos['cli-profesion'] = { value: 'Comerciante' };
  campos['cli-nacionalidad'] = { value: 'Guatemalteca' };
  campos['cli-dpi'] = { value: '1234567890101' };
  campos['cli-vivienda'] = { value: 'propia' };

  guardado = null;
  await CLI.guardar('c1');
  ok('guarda la fecha de nacimiento', guardado.fecha_nacimiento === '1990-06-15');
  ok('guarda el estado civil', guardado.estado_civil === 'casado(a)');
  ok('guarda la profesión', guardado.profesion === 'Comerciante');
  ok('guarda la nacionalidad', guardado.nacionalidad === 'Guatemalteca');
  ok('guarda el DPI', guardado.dpi === '1234567890101');
  ok('guarda el tipo de vivienda', guardado.vivienda === 'propia');

  /* Un campo dibujado pero vacío SÍ debe viajar como null: ahí el usuario
     está borrando a propósito, que es distinto de que el campo no exista. */
  campos['cli-profesion'] = { value: '' };
  guardado = null;
  await CLI.guardar('c1');
  ok('un campo visible y vacío sí se limpia (borrar a propósito ≠ ausente)',
     'profesion' in guardado && guardado.profesion === null);
}

/* ── Lectura del DPI: NUNCA pisar lo que el usuario ya escribió ──────────
   Un OCR que sobreescribe un dato correcto es peor que no leer nada — y
   esto alimenta una declaración jurada que se firma ante notario. La regla
   es: llenar sólo lo vacío, y REPORTAR lo que difiere para que decida la
   persona. */
{
  const conDatos = (obj) => { ctx.IA = { escanearDPI: async () => ({ ok: true, texto: JSON.stringify(obj) }),
                                         escanearRecibo: async () => ({ ok: true, texto: JSON.stringify(obj) }) }; };
  const archivo = { files: [{ size: 1000 }], value: '' };
  ctx.FileReader = function () {
    this.readAsDataURL = () => { this.result = 'data:image/jpeg;base64,AAA'; this.onload(); };
  };

  const prepararDom = (valores) => {
    domBase();
    campos['cli-lectura-aviso'] = { innerHTML: '', style: {} };
    for (const [k, v] of Object.entries(valores)) campos[k] = { value: v };
  };

  /* Campos vacíos: se llenan. */
  prepararDom({ 'cli-dpi': '', 'cli-fnac': '', 'cli-estado-civil': '', 'cli-nacionalidad': '', 'cli-lugar-nac': '', 'cli-edad': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  conDatos({ cui: '1605755322205', nombre_completo: 'Ana María Gómez', fecha_nacimiento: '1990-06-15',
             estado_civil: 'soltero(a)', nacionalidad: 'Guatemalteca', lugar_nacimiento: 'Mixco, Guatemala' });
  await CLI._leerDPI(archivo);
  ok('llena el DPI que estaba vacío', campos['cli-dpi'].value === '1605755322205');
  ok('llena la fecha de nacimiento', campos['cli-fnac'].value === '1990-06-15');
  ok('llena el estado civil', campos['cli-estado-civil'].value === 'soltero(a)');
  ok('llena el lugar de nacimiento', campos['cli-lugar-nac'].value === 'Mixco, Guatemala');
  ok('avisa cuántos campos llenó', /campo\(s\) llenados/.test(campos['cli-lectura-aviso'].innerHTML));

  /* Campo YA escrito y el documento dice otra cosa: NO se pisa, se reporta. */
  prepararDom({ 'cli-dpi': '9999999999999', 'cli-fnac': '', 'cli-estado-civil': '', 'cli-nacionalidad': '', 'cli-lugar-nac': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  conDatos({ cui: '1605755322205', fecha_nacimiento: '1990-06-15' });
  await CLI._leerDPI(archivo);
  ok('NO pisa el DPI que el usuario ya había escrito', campos['cli-dpi'].value === '9999999999999');
  ok('pero reporta la diferencia para que la persona decida',
     /Diferencias/.test(campos['cli-lectura-aviso'].innerHTML) && /1605755322205/.test(campos['cli-lectura-aviso'].innerHTML));
  ok('y sí llena los que estaban vacíos', campos['cli-fnac'].value === '1990-06-15');

  /* El prompt ordena devolver null en lo que no se lea con claridad: un
     null no debe llenar nada ni escribir "null" en el campo. */
  prepararDom({ 'cli-dpi': '', 'cli-fnac': '', 'cli-estado-civil': '', 'cli-nacionalidad': '', 'cli-lugar-nac': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  conDatos({ cui: null, fecha_nacimiento: null, estado_civil: null });
  await CLI._leerDPI(archivo);
  ok('un dato ilegible (null) NO llena el campo', campos['cli-dpi'].value === '');
  ok('y nunca escribe la palabra "null"', campos['cli-fnac'].value !== 'null');
  ok('avisa que no aportó datos', /no aportó datos/.test(campos['cli-lectura-aviso'].innerHTML));

  /* Respuesta que no es JSON: no revienta, avisa. */
  prepararDom({ 'cli-dpi': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  ctx.IA = { escanearDPI: async () => ({ ok: true, texto: 'no soy json' }) };
  await CLI._leerDPI(archivo);
  ok('una respuesta ilegible no revienta, avisa', /no se leyó con claridad/.test(campos['cli-lectura-aviso'].innerHTML));

  /* El modelo suele envolver el JSON en ```json — debe limpiarse. */
  prepararDom({ 'cli-dpi': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  ctx.IA = { escanearDPI: async () => ({ ok: true, texto: '```json\n{"cui":"1234567890101"}\n```' }) };
  await CLI._leerDPI(archivo);
  ok('limpia el ```json que a veces envuelve la respuesta', campos['cli-dpi'].value === '1234567890101');

  /* El recibo sólo debe tocar la dirección. */
  prepararDom({ 'cli-dir': '', 'cli-dpi': 'NO-TOCAR' });
  campos['cli-edad'] = { textContent: '', style: {} };
  ctx.IA = { escanearRecibo: async () => ({ ok: true, texto: JSON.stringify({ direccion: '5a calle 3-40 zona 1', titular: 'Otro Nombre' }) }) };
  await CLI._leerRecibo(archivo);
  ok('el recibo llena la dirección', campos['cli-dir'].value === '5a calle 3-40 zona 1');
  ok('el recibo NO toca el DPI', campos['cli-dpi'].value === 'NO-TOCAR');

  /* Imagen demasiado grande: se rechaza antes de gastar una llamada de IA. */
  prepararDom({ 'cli-dpi': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  let llamo = false;
  ctx.IA = { escanearDPI: async () => { llamo = true; return { ok: true, texto: '{}' }; } };
  await CLI._leerDPI({ files: [{ size: 9 * 1024 * 1024 }], value: '' });
  ok('una imagen de 9MB se rechaza sin gastar una llamada de IA', llamo === false);
  ok('y lo dice', /más de 5 MB/.test(campos['cli-lectura-aviso'].innerHTML));
}

/* ── Sin tenant cargado no revienta ni asume que hay armería ─────────────── */
{
  ctx.Auth.tenant = null;
  ok('sin tenant no pide los datos de armería', CLI._pideDatosArmeria() === false);
  ctx.Auth.tenant = { modulos_activos: [] };
  ok('con modulos_activos vacío tampoco', CLI._pideDatosArmeria() === false);
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;

})();
