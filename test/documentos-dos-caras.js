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
const srcCli = fs.readFileSync(path.join(raiz, 'js', 'modulos', 'operacion', 'clientes.js'), 'utf8');
const srcArm = fs.readFileSync(path.join(raiz, 'js', 'modulos', 'especializados', 'armeria.js'), 'utf8');
const srcIA  = fs.readFileSync(path.join(raiz, 'supabase', 'functions', 'ai-assistant', 'index.ts'), 'utf8');

/* Se cargan los catálogos reales del módulo, no una copia. */
const ctx = { console, Math, Date, JSON, String, Number, Object, Array, RegExp };
ctx.window = ctx; ctx.Modulos = {}; ctx.UI = { esc: v => String(v ?? '') };
ctx.DB = {}; ctx.Auth = { tenant: {}, user: {} }; ctx.Docs = {}; ctx.IA = {};
vm.createContext(ctx);
vm.runInContext(srcCli, ctx);
const C = ctx.Modulos.clientes;

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

/* ── Sólo se lee el anverso ─────────────────────────────────────────────── */
{
  ok('el anverso del DPI se lee solo', C._LECTOR_DOC.dpi_frente === 'dpi');
  ok('el REVERSO del DPI no se manda a la IA', !C._LECTOR_DOC.dpi_reverso);
  ok('la licencia no se lee (sus datos no viven en la ficha del cliente)',
     !C._LECTOR_DOC.licencia_frente && !C._LECTOR_DOC.licencia_reverso);
  ok('el pasaporte se lee como un DPI', C._LECTOR_DOC.pasaporte === 'dpi');
  ok('el recibo se lee para la dirección', C._LECTOR_DOC.recibo_servicios === 'recibo');

  /* Que el prompt sepa que el reverso no trae datos: si le llega esa foto,
     debe devolver nulos en vez de inventar. */
  ok('el prompt del DPI apunta al ANVERSO', /ANVERSO del DPI/.test(srcIA));
  ok('el prompt sabe qué hacer si le dan el reverso',
     /REVERSO del DPI[\s\S]{0,120}null/.test(srcIA));
  ok('no quedó un modo de licencia sin uso', !/licencia:\s*"Analiza/.test(srcIA));
}

/* ── Los expedientes ya cargados siguen valiendo ────────────────────────── */
{
  ok('hay un mapa de tipos heredados', !!C._DOCS_HEREDADOS);
  ok('el viejo "dpi" cuenta como anverso', C._DOCS_HEREDADOS.dpi === 'dpi_frente');
  ok('la vieja "licencia_arma" también', C._DOCS_HEREDADOS.licencia_arma === 'licencia_frente');

  /* La verificación del expediente en Armería debe aceptarlos, si no le
     pediría el anverso a quien ya lo entregó. */
  ok('la verificación acepta el "dpi" viejo como anverso',
     /hay\('dpi_frente'\) \|\| hay\('dpi'\)/.test(srcArm));
  ok('...y la "licencia_arma" vieja',
     /hay\('licencia_frente'\) \|\| hay\('licencia_arma'\)/.test(srcArm));
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
