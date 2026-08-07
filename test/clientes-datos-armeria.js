/* Los datos personales largos del cliente son sólo para armería.

   Desde que el expediente de armería vive en su PROPIO módulo
   (js/modulos/especializados/clientes-armeria.js), la separación ya no
   depende de un `if` dentro del formulario común: son dos pantallas
   distintas. La prueba cubre las dos y, sobre todo, lo que puede salir mal:

   1) Que un taller mecánico o una venta de granos tenga que ver campos de
      fecha de nacimiento, estado civil y recibos de servicios que no le
      sirven de nada. Eso es ruido.

   2) Que al NO dibujarse esos campos, guardar el cliente los mande como
      null y BORRE lo que ya estaba guardado. Ausente ≠ vacío: si el input
      no existe en la pantalla, la clave no debe viajar al update — porque
      PostgREST hace update parcial y omitirla es justo lo que preserva el
      dato. Un comercio que apague armería un rato perdería el expediente
      de todos sus clientes.

   3) Que subir la foto de un documento NO llene los campos. Es lo que más
      duele en el mostrador: se toma la foto, el archivo se guarda, y los
      datos siguen en blanco. Los casos de abajo recorren esa cadena entera
      con la IA simulada. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);

let guardado = null, htmlModal = '';
const campos = {};   // simula el DOM: sólo existe lo que el formulario dibujó

const ctx = {
  console,
  Modulos: { btnAccion: () => '' },
  UI: { esc: v => String(v ?? ''), modal: (t, h) => { htmlModal = h; }, cerrarModal() {}, toast() {},
        fecha: v => String(v ?? ''), fechaHora: v => String(v ?? '') },
  NIT: { validarLocal: () => ({ valido: true }) },
  Docs: { render() {}, listar: async () => [] },
  Auth: { tenant: { modulos_activos: [] } },
  DB: {
    upsertCliente: async (f) => { guardado = f; return { data: { id: 'c1' }, error: null } ; },
    getClientes: async () => [],
    getTenencias: async () => [],
  },
  document: { getElementById: (id) => (id in campos ? campos[id] : null), querySelector: () => null },
};
ctx.window = ctx;
vm.createContext(ctx);
/* El catálogo geográfico va ANTES, como en el navegador: el expediente lo usa
   para traducir el código ISO del DPI ("GTM" → "Guatemalteca") y para derivar
   el código postal. Sin él, la traducción cae al valor crudo. */
vm.runInContext(fs.readFileSync(raiz('js', 'core', 'geo-guatemala.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'modulos', 'operacion', 'clientes.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'modulos', 'especializados', 'clientes-armeria.js'), 'utf8'), ctx);
const CLI = ctx.Modulos.clientes;             // alta básica, cualquier vertical
const ARM = ctx.Modulos.clientesArmeria;      // expediente de armería
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

/* ── El alta BÁSICA nunca muestra los datos de armería ────────────────────
   Ya no por un `if`, sino porque esos campos viven en otro módulo. La
   prueba se mantiene igual de estricta: lo que importa es que el taller no
   los vea, no cómo se logra. */
{
  ctx.Auth.tenant.modulos_activos = ['ordenes', 'vehiculos', 'inventario'];
  ok('un taller no pide datos de armería', CLI._pideDatosArmeria() === false);

  CLI._data = [];
  await CLI.modalForm();
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

  /* Y con armería encendida el alta básica TAMPOCO los muestra: para eso
     está el expediente aparte. Lo que sí aparece es cómo llegar a él. */
  ctx.Auth.tenant.modulos_activos = ['ordenes', 'armeria', 'inventario'];
  CLI._data = [{ id: 'c1', nombre: 'Juan Pérez' }];
  await CLI.modalForm('c1');
  ok('con armería, el alta básica sigue sin mostrar el DPI', !/id="cli-fnac"/.test(htmlModal));
  ok('...pero ofrece abrir el expediente de armería',
     /clientesArmeria\.modalForm/.test(htmlModal));
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
    ok(`el alta básica no manda "${clave}" (si lo mandara, borraría el expediente)`,
       !(clave in guardado));
  }
  ok('sí manda los campos que sí existen', guardado.nombre === 'Juan Pérez' && guardado.direccion === 'Zona 1');
}

/* ── El EXPEDIENTE de armería sí los pide y sí los guarda ─────────────────── */
{
  ctx.Auth.tenant.modulos_activos = ['ordenes', 'armeria', 'inventario'];
  ARM._data = [{ id: 'c1', nombre: 'Juan Pérez' }];
  await ARM.modalForm('c1');
  ok('el expediente muestra fecha de nacimiento', /id="cli-fnac"/.test(htmlModal));
  ok('...y estado civil, profesión, nacionalidad',
     /id="cli-estado-civil"/.test(htmlModal) && /id="cli-profesion"/.test(htmlModal) &&
     /id="cli-nacionalidad"/.test(htmlModal));
  ok('...y el tipo de vivienda', /id="cli-vivienda"/.test(htmlModal));
  ok('...y los documentos de identificación', /Documentos de identificaci[óo]n/.test(htmlModal));
  ok('...y la licencia de DIGECAM', /id="cli-lic-tipo"/.test(htmlModal));

  domBase();
  campos['cli-fnac'] = { value: '1990-06-15' };
  campos['cli-estado-civil'] = { value: 'casado(a)' };
  campos['cli-profesion'] = { value: 'Comerciante' };
  campos['cli-nacionalidad'] = { value: 'Guatemalteca' };
  campos['cli-dpi'] = { value: '1234567890101' };
  campos['cli-vivienda'] = { value: 'propia' };

  guardado = null;
  await ARM.guardar('c1');
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
  await ARM.guardar('c1');
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
  /* _leerDocumento recibe el File directo: quien lo llama es _subirDoc, que
     ya lo sacó del input y lo archivó primero. */
  const archivo = { size: 1000, type: 'image/jpeg' };
  ctx.FileReader = function () {
    this.readAsDataURL = () => { this.result = 'data:image/jpeg;base64,AAA'; this.onload(); };
  };

  const prepararDom = (valores) => {
    domBase();
    campos['cli-lectura-aviso'] = { innerHTML: '', style: {} };
    for (const [k, v] of Object.entries(valores)) campos[k] = { value: v };
  };

  /* Campos vacíos: se llenan. */
  prepararDom({ 'cli-dpi': '', 'cli-fnac': '', 'cli-estado-civil': '', 'cli-nacionalidad': '',
                'cli-nac-depto': '', 'cli-nac-muni': '', 'cli-edad': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  conDatos({ cui: '1605755322205', nombre_completo: 'Ana María Gómez', fecha_nacimiento: '1990-06-15',
             estado_civil: 'soltero(a)', nacionalidad: 'GTM',
             nacimiento_departamento: 'GUATEMALA', nacimiento_municipio: 'MIXCO' });
  await ARM._leerDPI(archivo);
  ok('llena el DPI que estaba vacío', campos['cli-dpi'].value === '1605755322205');
  ok('llena la fecha de nacimiento', campos['cli-fnac'].value === '1990-06-15');
  ok('llena el estado civil', campos['cli-estado-civil'].value === 'soltero(a)');
  /* El lugar de nacimiento ya no es un texto suelto: el DPI lo trae en dos
     lineas y se guarda partido, para poder derivar el codigo postal. */
  ok('llena el departamento de nacimiento', campos['cli-nac-depto'].value === 'GUATEMALA');
  /* El DPI grita en MAYUSCULAS ("MIXCO") y el catalogo postal lo escribe
     "Mixco". Se guarda la forma del CATALOGO: si no, el mismo municipio
     entraria de dos maneras y los codigos postales dejarian de cuadrar. */
  ok('llena el municipio de nacimiento, normalizado al catalogo',
     campos['cli-nac-muni'].value === 'Mixco');
  /* El DPI imprime el codigo ISO: una declaracion jurada no puede decir
     "de nacionalidad GTM". */
  ok('traduce GTM a Guatemalteca', campos['cli-nacionalidad'].value === 'Guatemalteca');
  ok('avisa cuántos campos llenó', /campo\(s\) llenados/.test(campos['cli-lectura-aviso'].innerHTML));

  /* Campo YA escrito y el documento dice otra cosa: NO se pisa, se reporta. */
  prepararDom({ 'cli-dpi': '9999999999999', 'cli-fnac': '', 'cli-estado-civil': '', 'cli-nacionalidad': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  conDatos({ cui: '1605755322205', fecha_nacimiento: '1990-06-15' });
  await ARM._leerDPI(archivo);
  ok('NO pisa el DPI que el usuario ya había escrito', campos['cli-dpi'].value === '9999999999999');
  ok('pero reporta la diferencia para que la persona decida',
     /Diferencias/.test(campos['cli-lectura-aviso'].innerHTML) && /1605755322205/.test(campos['cli-lectura-aviso'].innerHTML));
  ok('y sí llena los que estaban vacíos', campos['cli-fnac'].value === '1990-06-15');

  /* El prompt ordena devolver null en lo que no se lea con claridad: un
     null no debe llenar nada ni escribir "null" en el campo. */
  prepararDom({ 'cli-dpi': '', 'cli-fnac': '', 'cli-estado-civil': '', 'cli-nacionalidad': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  conDatos({ cui: null, fecha_nacimiento: null, estado_civil: null });
  await ARM._leerDPI(archivo);
  ok('un dato ilegible (null) NO llena el campo', campos['cli-dpi'].value === '');
  ok('y nunca escribe la palabra "null"', campos['cli-fnac'].value !== 'null');
  /* CERO campos leídos es un FALLO, no un resultado: la IA contesta "ok" con
     todo en null cuando la foto sale movida u oscura, y antes eso se
     despachaba con un renglón gris indistinguible de "la app no hizo nada". */
  ok('cero datos leídos se avisa como fallo, no como resultado',
     /No se pudo sacar ningún dato/.test(campos['cli-lectura-aviso'].innerHTML));
  ok('...y dice qué hacer (repetir la foto)',
     /Volvé a tomarla/.test(campos['cli-lectura-aviso'].innerHTML));

  /* Respuesta que no es JSON: no revienta, avisa. */
  prepararDom({ 'cli-dpi': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  ctx.IA = { escanearDPI: async () => ({ ok: true, texto: 'no soy json' }) };
  await ARM._leerDPI(archivo);
  ok('una respuesta ilegible no revienta, avisa', /no se leyó con claridad/.test(campos['cli-lectura-aviso'].innerHTML));

  /* Y si la Edge Function contesta un ERROR (sesión, plan, modo no válido),
     el aviso tiene que DECIRLO — no quedarse mudo. Es exactamente lo que
     pasó con el modo "licencia", que el servidor rechazaba y en pantalla
     sólo se veía que no pasaba nada. */
  prepararDom({ 'cli-dpi': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  ctx.IA = { escanearDPI: async () => ({ ok: false, error: 'Falta el mensaje' }) };
  await ARM._leerDPI(archivo);
  ok('un error del servidor se muestra tal cual en pantalla',
     /Falta el mensaje/.test(campos['cli-lectura-aviso'].innerHTML));

  /* El modelo suele envolver el JSON en ```json — debe limpiarse. */
  prepararDom({ 'cli-dpi': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  ctx.IA = { escanearDPI: async () => ({ ok: true, texto: '```json\n{"cui":"1234567890101"}\n```' }) };
  await ARM._leerDPI(archivo);
  ok('limpia el ```json que a veces envuelve la respuesta', campos['cli-dpi'].value === '1234567890101');

  /* El recibo sólo debe tocar la dirección. */
  prepararDom({ 'cli-dir': '', 'cli-dpi': 'NO-TOCAR' });
  campos['cli-edad'] = { textContent: '', style: {} };
  ctx.IA = { escanearRecibo: async () => ({ ok: true, texto: JSON.stringify({ direccion: '5a calle 3-40 zona 1', titular: 'Otro Nombre' }) }) };
  await ARM._leerRecibo(archivo);
  ok('el recibo llena la dirección', campos['cli-dir'].value === '5a calle 3-40 zona 1');
  ok('el recibo NO toca el DPI', campos['cli-dpi'].value === 'NO-TOCAR');

  /* Imagen demasiado grande: se rechaza antes de gastar una llamada de IA. */
  prepararDom({ 'cli-dpi': '' });
  campos['cli-edad'] = { textContent: '', style: {} };
  let llamo = false;
  ctx.IA = { escanearDPI: async () => { llamo = true; return { ok: true, texto: '{}' }; } };
  await ARM._leerDPI({ size: 9 * 1024 * 1024, type: 'image/jpeg' });
  ok('una imagen de 9MB se rechaza sin gastar una llamada de IA', llamo === false);
  ok('y lo dice', /más de 5 MB/.test(campos['cli-lectura-aviso'].innerHTML));
}

/* ── LICENCIA: el caso que estuvo roto en el servidor ─────────────────────
   El modo "licencia" existía en el frontend pero la Edge Function lo
   rechazaba con "Falta el mensaje" porque no estaba en la lista de modos
   que no llevan texto. Acá se cubre el lado del cliente: que mande el modo
   correcto y que llene el tipo, el número y el vencimiento. */
{
  const archivo = { size: 1000, type: 'image/jpeg' };
  domBase();
  campos['cli-lectura-aviso'] = { innerHTML: '', style: {} };
  campos['cli-edad'] = { textContent: '', style: {} };
  campos['cli-lic-tipo'] = { value: '' };
  campos['cli-lic-num'] = { value: '' };
  campos['cli-lic-vence'] = { value: '' };
  campos['cli-armas-reg'] = { value: '' };
  campos['cli-lic-aviso'] = { innerHTML: '', style: {} };

  ctx.IA = { escanearLicencia: async () => ({ ok: true, texto: JSON.stringify({
    tipo: 'portación', numero: 'LIC-99887', fecha_vencimiento: '2030-01-15', armas_registradas: 2 }) }) };
  await ARM._leerLicencia(archivo);
  ok('la licencia llena el tipo', campos['cli-lic-tipo'].value === 'portación');
  ok('...el número', campos['cli-lic-num'].value === 'LIC-99887');
  ok('...y el vencimiento', campos['cli-lic-vence'].value === '2030-01-15');
  ok('...y las armas registradas', campos['cli-armas-reg'].value === '2');

  /* Si la IA no distingue tenencia de portación manda null, y eso hay que
     gritarlo: de ese dato depende cuánta munición se puede entregar. */
  campos['cli-lic-tipo'] = { value: '' };
  campos['cli-lic-num'] = { value: '' };
  campos['cli-lectura-aviso'] = { innerHTML: '', style: {} };
  ctx.IA = { escanearLicencia: async () => ({ ok: true, texto: JSON.stringify({ tipo: null, numero: 'LIC-1' }) }) };
  await ARM._leerLicencia(archivo);
  ok('si no distingue el tipo de licencia, lo dice fuerte',
     /tenencia<\/b> o de <b>portación/.test(campos['cli-lectura-aviso'].innerHTML));
}

/* ── Una sola subida: archiva Y lee ──────────────────────────────────────
   Antes había dos caminos separados (un botón para leer, otro para
   adjuntar) y el usuario tenía que dar la misma foto dos veces.
   Éste es EL caso que se rompe en el mostrador: se sube la foto y los
   campos quedan en blanco. */
{
  ctx.Auth.tenant = { modulos_activos: ['armeria'] };
  const subidos = [];
  ctx.Docs = {
    subirArchivo: async (ent, cid, tipo, titulo) => { subidos.push({ cid, tipo, titulo }); return {}; },
    render() {}, listar: async () => [],
  };
  ctx.IA = { escanearDPI: async () => ({ ok: true, texto: JSON.stringify({ cui: '1111111111111' }) }),
             escanearRecibo: async () => ({ ok: true, texto: JSON.stringify({ direccion: 'Zona 5' }) }) };

  /* Cliente EXISTENTE: archiva de una vez y lee. */
  domBase();
  campos['cli-lectura-aviso'] = { innerHTML: '', style: {} };
  campos['cli-dpi'] = { value: '' };
  campos['cli-edad'] = { textContent: '', style: {} };
  subidos.length = 0;
  await ARM._subirDoc('c1', 'dpi_frente', { files: [{ size: 1000, type: 'image/jpeg' }], value: '' });
  ok('con cliente existente, archiva el documento', subidos.length === 1 && subidos[0].tipo === 'dpi_frente');
  ok('...y en la MISMA acción lee los datos', campos['cli-dpi'].value === '1111111111111');

  /* EL REVERSO TAMBIÉN SE LEE. Se pide justamente porque NO trae la misma
     información que el anverso: de atrás salen la vecindad, el estado civil,
     el asiento L:F:P:, el número de serie y la fecha de vencimiento. Antes se
     archivaba sin leerse y esos campos quedaban en blanco para siempre. */
  let leyoReverso = false;
  ctx.IA = { escanearDPI: async () => { leyoReverso = true; return { ok: true, texto: JSON.stringify({
    vecindad_departamento: 'GUATEMALA', estado_civil: 'casado(a)', registro_libro: '102' }) }; } };
  campos['cli-vec-depto'] = { value: '' };
  campos['cli-estado-civil'] = { value: '' };
  campos['cli-reg-libro'] = { value: '' };
  subidos.length = 0;
  await ARM._subirDoc('c1', 'dpi_reverso', { files: [{ size: 1000, type: 'image/jpeg' }], value: '' });
  ok('el reverso se archiva', subidos.length === 1 && subidos[0].tipo === 'dpi_reverso');
  ok('...y SÍ se manda a leer (trae lo que el anverso no tiene)', leyoReverso === true);
  ok('...y llena los datos que sólo están atrás', campos['cli-estado-civil'].value === 'casado(a)');

  /* Un PDF SI se lee. Antes se archivaba y se saltaba en silencio, y por eso
     la direccion nunca se llenaba: los recibos de EEGSA vienen en PDF. */
  let leyo = false;
  ctx.IA = { escanearDPI: async () => { leyo = true; return { ok: true, texto: '{}' }; } };
  subidos.length = 0;
  await ARM._subirDoc('c1', 'dpi_frente', { files: [{ size: 1000, type: 'application/pdf' }], value: '' });
  ok('un PDF se archiva igual', subidos.length === 1);
  ok('...y TAMBIEN se manda a leer (los recibos vienen en PDF)', leyo === true);
}

/* ── Fotos tomadas ANTES de que el cliente exista ────────────────────────
   Un cliente nuevo no tiene id, y el archivo se guarda en una carpeta con
   ese id. Se retienen y se suben al crearlo, para no pedir la foto dos
   veces. */
{
  const subidos = [];
  ctx.Docs = { subirArchivo: async (e, cid, tipo) => { subidos.push({ cid, tipo }); return {}; },
               render() {}, listar: async () => [] };
  ctx.IA = { escanearDPI: async () => ({ ok: true, texto: JSON.stringify({ cui: '2222222222222' }) }) };

  ARM._docsPendientes = {};
  domBase();
  campos['cli-lectura-aviso'] = { innerHTML: '', style: {} };
  campos['cli-dpi'] = { value: '' };
  campos['cli-edad'] = { textContent: '', style: {} };
  campos['cli-docs-box'] = { innerHTML: '' };

  subidos.length = 0;
  await ARM._subirDoc('', 'dpi_frente', { files: [{ size: 1000, type: 'image/jpeg' }], value: '' });
  ok('sin cliente todavía, NO intenta archivar (no hay carpeta donde)', subidos.length === 0);
  ok('pero retiene la foto para después', !!ARM._docsPendientes.dpi_frente);
  ok('y LEE los datos igual, sin esperar a guardar', campos['cli-dpi'].value === '2222222222222');

  /* Al crear el cliente, lo pendiente se adjunta solo. */
  guardado = null;
  await ARM.guardar('');
  ok('al crear el cliente se adjunta lo pendiente', subidos.length === 1 && subidos[0].tipo === 'dpi_frente');
  ok('...con el id del cliente recién creado', subidos[0].cid === 'c1');
  ok('y la lista de pendientes queda limpia', Object.keys(ARM._docsPendientes).length === 0);
}

/* ── Si el archivado FALLA, no se puede decir que se adjuntó ──────────────
   El error se tragaba en silencio y el aviso contaba la cola, no los
   éxitos: la foto se perdía y en pantalla decía "adjuntado". */
{
  ctx.Docs = { subirArchivo: async () => ({ error: { message: 'RLS denegado' } }),
               render() {}, listar: async () => [] };
  ARM._docsPendientes = { dpi_frente: { file: { size: 10, type: 'image/jpeg' }, titulo: 'DPI — anverso' } };
  const r = await ARM._subirPendientes('c1');
  ok('un archivado fallido NO se cuenta como éxito', r.exitosos.length === 0);
  ok('...se reporta como fallido', r.fallidos.length === 1);
  ok('...y la foto NO se pierde: queda pendiente para reintentar',
     !!ARM._docsPendientes.dpi_frente);
}

/* ── Abrir una ficha nueva descarta lo pendiente de otra ──────────────────
   Si no, una foto tomada para un cliente terminaría en el siguiente. */
{
  ctx.Docs = { subirArchivo: async () => ({}), render() {}, listar: async () => [] };
  ARM._docsPendientes = { dpi_frente: { file: {}, titulo: 'DPI' } };
  ARM._data = [];
  await ARM.modalForm();
  ok('abrir una ficha nueva descarta lo pendiente de la anterior',
     Object.keys(ARM._docsPendientes).length === 0);
}

/* ── Ya no hay dos caminos para la misma foto ────────────────────────────── */
{
  ctx.Auth.tenant = { modulos_activos: ['armeria'] };
  ARM._data = [{ id: 'c1', nombre: 'Juan Pérez' }];
  await ARM.modalForm('c1');
  ok('el expediente ofrece cámara para cada documento', /capture="environment"/.test(htmlModal));
  ok('y también subir archivo', /cli-doc-dpi_frente-gal/.test(htmlModal));
  ok('marca cuáles documentos se leen solos', /se lee solo/.test(htmlModal));
  ok('ya NO existe un botón aparte de "Leer del DPI"', !/Leer del DPI/.test(htmlModal));
  ok('ni uno aparte para el recibo', !/Leer dirección del recibo/.test(htmlModal));
  ok('los datos personales explican de dónde se llenan', /Se llenan solos al adjuntar/.test(htmlModal));
  ok('se puede imprimir el expediente completo', /imprimirExpediente/.test(htmlModal));

  /* Abrir la ficha de un id que no está en la lista cargada no debe tumbar
     la pantalla: pasa si otro módulo la abre con una lista distinta. */
  ARM._data = [];
  let reventó = false;
  try { await ARM.modalForm('id-que-no-existe'); } catch (_) { reventó = true; }
  ok('un id ausente no tumba el expediente', reventó === false);
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
