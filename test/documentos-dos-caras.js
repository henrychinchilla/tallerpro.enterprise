/* DPI y licencia van por las DOS CARAS.

   Lo notó Henry: el expediente pedía "DPI" y "licencia" como un solo archivo,
   pero los dos documentos tienen anverso y reverso, y DIGECAM y el notario los
   piden completos. Con una sola cara el expediente se daba por bueno.

   OJO CON UN DETALLE QUE ES FÁCIL SUPONER AL REVÉS: en el DPI de Guatemala los
   datos van casi todos en el ANVERSO —CUI, nombres, fecha y lugar de
   nacimiento, vecindad, estado civil, vencimiento—. El reverso es sobre todo
   zona legible por máquina. Así que la segunda foto sirve para completar el
   expediente, NO para sacar campos nuevos: mandarla al lector gastaría una
   llamada de IA para devolver nulos y, si devolviera algo mal leído,
   sobrescribiría lo bueno.

   Y lo que más se rompe al partir un tipo en dos: los expedientes YA cargados.
   Nadie debería tener que volver a fotografiar lo que ya entregó. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
/* Los documentos de identificación viven en el EXPEDIENTE de armería desde
   que se separó del alta común (js/modulos/especializados/clientes-armeria.js). */
const srcCli = fs.readFileSync(path.join(raiz, 'js', 'modulos', 'especializados', 'clientes-armeria.js'), 'utf8');
const srcArm = fs.readFileSync(path.join(raiz, 'js', 'modulos', 'especializados', 'armeria.js'), 'utf8');
const srcIA  = fs.readFileSync(path.join(raiz, 'supabase', 'functions', 'ai-assistant', 'index.ts'), 'utf8');

/* Se cargan los catálogos reales del módulo, no una copia. */
const ctx = { console, Math, Date, JSON, String, Number, Object, Array, RegExp };
ctx.window = ctx; ctx.Modulos = {}; ctx.UI = { esc: v => String(v ?? '') };
ctx.DB = {}; ctx.Auth = { tenant: {}, user: {} }; ctx.Docs = {}; ctx.IA = {};
vm.createContext(ctx);
/* El catálogo geográfico va ANTES, como en el navegador: de ahí sale
   normalizarGeo(), que es lo que hace calzar el "SACATEPEQUEZ" del DPI con el
   "Sacatepéquez" del catálogo. Sin él, la comparación cae al fallback sin
   tildes y el <select> se queda vacío. */
vm.runInContext(fs.readFileSync(path.join(raiz, 'js', 'core', 'geo-guatemala.js'), 'utf8'), ctx);
vm.runInContext(srcCli, ctx);
const C = ctx.Modulos.clientesArmeria;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── Están las dos caras ────────────────────────────────────────────────── */
{
  const tipos = Object.keys(C._DOCS_CLIENTE || {});
  ['dpi_frente', 'dpi_reverso', 'licencia_frente', 'licencia_reverso']
    .forEach(t => ok(`existe el tipo ${t}`, tipos.includes(t)));

  ok('el DPI ya no es un solo archivo', !tipos.includes('dpi'));
  ok('la licencia tampoco', !tipos.includes('licencia_arma'));
  ok('el pasaporte sigue siendo uno (es una hoja de datos)', tipos.includes('pasaporte'));
  ok('el recibo de servicios sigue siendo uno', tipos.includes('recibo_servicios'));

  /* Las etiquetas tienen que decir CUÁL cara: "DPI" y "DPI" en la pantalla
     dejaría al usuario adivinando cuál subir en cada botón. */
  ok('la etiqueta del anverso lo dice', /anverso/i.test(C._DOCS_CLIENTE.dpi_frente.label));
  ok('la del reverso lo dice', /reverso/i.test(C._DOCS_CLIENTE.dpi_reverso.label));
  ok('lo mismo en la licencia',
     /anverso/i.test(C._DOCS_CLIENTE.licencia_frente.label) &&
     /reverso/i.test(C._DOCS_CLIENTE.licencia_reverso.label));
}

/* ── LAS DOS CARAS SE LEEN ───────────────────────────────────────────────
   Antes sólo se leía el anverso, con la premisa de que el reverso "no trae
   datos". Es FALSO y costó semanas de campos en blanco: verificado contra la
   lectura real de un DPI, el anverso devuelve CUI, nombre, fecha de
   nacimiento, nacionalidad, sexo y versión — y null en todo lo demás, porque
   el lugar de nacimiento, la vecindad, el estado civil, el asiento L:F:P:,
   el número de serie y la fecha de vencimiento están impresos ATRÁS.
   Ocho campos del expediente no se podían llenar nunca. */
{
  ok('el anverso del DPI se lee', C._LECTOR_DOC.dpi_frente === 'dpi');
  ok('y el REVERSO del DPI TAMBIÉN (ahí viven vecindad, estado civil y L:F:P:)',
     C._LECTOR_DOC.dpi_reverso === 'dpi');
  /* La licencia SÍ se lee desde que sus datos viven en la ficha del cliente
     (migración 127). Antes no se leía porque no había dónde volcarlos. */
  ok('el anverso de la licencia se lee', C._LECTOR_DOC.licencia_frente === 'licencia');
  ok('y el reverso de la licencia también', C._LECTOR_DOC.licencia_reverso === 'licencia');
  ok('el pasaporte se lee como un DPI', C._LECTOR_DOC.pasaporte === 'dpi');
  ok('el recibo se lee para la dirección', C._LECTOR_DOC.recibo_servicios === 'recibo');

  /* El prompt NO debe seguir ordenando devolver todo null ante un reverso:
     esa sola frase anulaba la lectura de la cara que más datos trae. */
  ok('el prompt ya NO manda devolver todo null si le dan el reverso',
     !/REVERSO del DPI \(zona legible por máquina, sin fotografía\), devuelve todos los campos como null/.test(srcIA));
  ok('el prompt dice explícitamente que lea la cara que le den',
     /Puede ser el ANVERSO o el REVERSO/.test(srcIA));
  ok('...y nombra los datos que sólo están en el reverso',
     /REVERSO es igual de importante[\s\S]{0,220}registro civil/.test(srcIA));
  ok('existe el modo de lectura de licencia', /licencia:\s*"Analiza/.test(srcIA));
}

/* ── Un <select> descarta en silencio un valor que no calza ──────────────
   El DPI escribe "GUATEMALA" y el catálogo "Guatemala": asignar el crudo
   dejaba el campo VACÍO sin error. Se ve sólo con <select> de verdad; las
   pruebas con DOM simulado (objetos {value:''}) aceptan cualquier texto y
   por eso esto pasó desapercibido. */
{
  ok('existe el ponedor de valores que respeta los <select>', typeof C._ponerValor === 'function');

  const opciones = ['Guatemala', 'Jutiapa', 'Sacatepéquez'];
  const selectFalso = (valor = '') => ({
    tagName: 'SELECT', value: valor, dataset: {},
    options: opciones.map(o => ({ value: o })),
  });

  const s1 = selectFalso();
  ok('un valor en MAYÚSCULAS calza con la opción del catálogo',
     C._ponerValor(s1, 'GUATEMALA') === true && s1.value === 'Guatemala');

  const s2 = selectFalso();
  ok('...y tolera las tildes ("SACATEPEQUEZ" → "Sacatepéquez")',
     C._ponerValor(s2, 'SACATEPEQUEZ') === true && s2.value === 'Sacatepéquez');

  /* Si la lista aún no está poblada (los municipios dependen del
     departamento), el dato NO se pierde: queda anotado para que
     _sincronizarMunicipios lo recoja al llenar las opciones. */
  const s3 = { tagName: 'SELECT', value: '', dataset: {}, options: [] };
  ok('si la lista aún no existe, el dato no se pierde',
     C._ponerValor(s3, 'MIXCO') === false && s3.dataset.pendiente === 'MIXCO');

  const inp = { tagName: 'INPUT', value: '' };
  ok('un input normal se llena tal cual',
     C._ponerValor(inp, '2206011432203') === true && inp.value === '2206011432203');
}

/* ── Los expedientes ya cargados siguen valiendo ────────────────────────── */
{
  ok('hay un mapa de tipos heredados', !!C._DOCS_HEREDADOS);
  ok('el viejo "dpi" cuenta como anverso', C._DOCS_HEREDADOS.dpi === 'dpi_frente');
  ok('la vieja "licencia_arma" también', C._DOCS_HEREDADOS.licencia_arma === 'licencia_frente');

  /* La verificación del expediente en Armería debe aceptarlos, si no le
     pediría el anverso a quien ya lo entregó. */
  /* La traduccion ya no se repite en armeria.js con literales: usa el MAPA
     que declara el expediente (clientes-armeria.js). Tenerlo en dos lados es
     como se rompe la compatibilidad la proxima vez que se parta un documento
     en dos caras. */
  ok('la verificación usa el mapa de tipos heredados, no literales sueltos',
     /Modulos\.clientesArmeria\?\._DOCS_HEREDADOS/.test(srcArm));
  ok('...y traduce cada tipo viejo a su equivalente nuevo',
     /if \(tipos\.has\(viejo\)\) tipos\.add\(nuevo\)/.test(srcArm));
}

/* ── El expediente incompleto se nota ───────────────────────────────────── */
{
  ok('avisa cuando falta el reverso del DPI', /DPI — falta el REVERSO/.test(srcArm));
  ok('avisa cuando falta el reverso de la licencia', /Licencia de arma — falta el REVERSO/.test(srcArm));
  /* Distinto de "falta el DPI": si ya subieron el anverso, decirle que falta
     el DPI entero lo manda a repetir la foto que ya tomó. */
  ok('distingue "falta el DPI" de "falta el reverso"',
     /if \(!anversoDPI\)[\s\S]{0,140}else if \(!reversoDPI\)/.test(srcArm));
  ok('el pasaporte cubre las dos caras (es una sola hoja)',
     /reversoDPI = hay\('dpi_reverso'\) \|\| hay\('pasaporte'\)/.test(srcArm));
  ok('el mensaje de expediente completo menciona ambas caras',
     /ambas caras/.test(srcArm));
}

/* ── La pantalla ────────────────────────────────────────────────────────── */
{
  ok('avisa que van las dos caras', /las dos caras/.test(srcCli));
  ok('el reverso se dibuja pegado a su anverso', /esReverso/.test(srcCli));
  ok('cada cara tiene su botón de cámara', /capture="environment"/.test(srcCli));
  ok('y su botón de archivo (para PDF o galería)', /accept="image\/\*,application\/pdf"/.test(srcCli));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
