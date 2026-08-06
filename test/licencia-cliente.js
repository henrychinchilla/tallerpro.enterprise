/* La licencia de arma guardada en la ficha del cliente.

   Antes sus datos —tipo, número, vencimiento, armas registradas— se tecleaban
   de nuevo en CADA operación y CADA entrega, aunque son del cliente y no de la
   venta. Tres costos: se vuelven a escribir con el error de dedo que eso trae,
   nadie ve de un vistazo si una licencia ya venció, y la foto de la licencia
   se archivaba sin servir para nada más.

   LO QUE MÁS IMPORTA ACÁ es el vencimiento y el tipo:
     · del TIPO sale el tope mensual de munición (art. 60): tenencia 200,
       portación 250 por arma. Un tipo mal leído autoriza una entrega ilegal.
     · una licencia VENCIDA no habilita comprar arma ni munición, y eso no es
       "un campo faltante": es un impedimento legal y debe verse como tal. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const srcCli = fs.readFileSync(path.join(raiz, 'js', 'modulos', 'operacion', 'clientes.js'), 'utf8');
const srcArm = fs.readFileSync(path.join(raiz, 'js', 'modulos', 'especializados', 'armeria.js'), 'utf8');
const srcIA  = fs.readFileSync(path.join(raiz, 'supabase', 'functions', 'ai-assistant', 'index.ts'), 'utf8');
const srcInt = fs.readFileSync(path.join(raiz, 'js', 'core', 'integraciones.js'), 'utf8');
const mig    = fs.readFileSync(path.join(raiz, 'db', 'migrations', '127_clientes_licencia_arma.sql'), 'utf8');

const ctx = { console, Math, Date, JSON, String, Number, Object, Array, RegExp, isNaN };
ctx.window = ctx; ctx.Modulos = {}; ctx.UI = { esc: v => String(v ?? '') };
ctx.DB = {}; ctx.Auth = { tenant: {}, user: {} }; ctx.Docs = {}; ctx.IA = {};
vm.createContext(ctx);
vm.runInContext(srcCli, ctx);
const C = ctx.Modulos.clientes;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── La migración ───────────────────────────────────────────────────────── */
{
  ['licencia_tipo', 'licencia_num', 'licencia_vencimiento', 'armas_registradas']
    .forEach(c => ok(`la migración agrega ${c}`, mig.includes(c)));
  ok('el tipo sólo acepta tenencia o portación',
     /licencia_tipo in \('tenencia','portación'\)/.test(mig));
  ok('las armas registradas topan en 3 (art. 72)',
     /armas_registradas between 1 and 3/.test(mig));
  ok('null sigue siendo válido (no todo cliente tiene licencia)',
     /licencia_tipo is null or/.test(mig) && /armas_registradas is null or/.test(mig));
}

/* ── El cálculo del vencimiento ─────────────────────────────────────────── */
{
  const hoy = new Date(2026, 7, 5);          // 5-ago-2026, hora LOCAL
  const d = (v) => C.diasLicencia(v, hoy);

  ok('sin fecha no dice nada', d(null) === null && d('') === null);
  ok('una fecha basura no revienta', d('no-es-fecha') === null);
  ok('vence hoy → 0 días, NO vencida', d('2026-08-05') === 0);
  ok('venció ayer → -1', d('2026-08-04') === -1);
  ok('vence en 10 días', d('2026-08-15') === 10);
  ok('vence el año que viene', d('2027-08-05') === 365);

  /* El bug que esto evita: construir la fecha en UTC desde Guatemala (UTC-6)
     corre el día, y una licencia que vence HOY aparecería vencida. */
  ok('en UTC-6 la fecha no se corre un día', d('2026-08-05') >= 0);
  ok('acepta un timestamp completo, no sólo YYYY-MM-DD',
     d('2026-08-15T00:00:00.000Z') === 10);
}

/* ── El lector ──────────────────────────────────────────────────────────── */
{
  ok('el anverso de la licencia dispara el lector', C._LECTOR_DOC.licencia_frente === 'licencia');
  ok('el reverso no', !C._LECTOR_DOC.licencia_reverso);
  ok('existe IA.escanearLicencia', /escanearLicencia/.test(srcInt));
  ok('llama al modo correcto', /modo: 'licencia'/.test(srcInt));
  ok('los datos caen en los campos del formulario',
     /'cli-lic-tipo': datos\.tipo/.test(srcCli) &&
     /'cli-lic-vence': datos\.fecha_vencimiento/.test(srcCli) &&
     /'cli-armas-reg': datos\.armas_registradas/.test(srcCli));

  /* Si la IA no distinguió el tipo, hay que decirlo FUERTE: de eso depende
     cuánta munición se puede entregar. */
  ok('avisa en rojo si no se pudo distinguir tenencia de portación',
     /cual === 'licencia' && !datos\.tipo/.test(srcCli));
}

/* ── El prompt no puede adivinar el tipo ────────────────────────────────── */
{
  ok('el prompt de licencia existe', /licencia: `Eres un asistente/.test(srcIA));
  ok('exige exactamente tenencia o portación', /'tenencia' o 'portación'/.test(srcIA));
  ok('manda null antes que adivinar el tipo',
     /no lo distingues con total seguridad, null/.test(srcIA));
  ok('explica por qué importa (tope de munición del art. 60)', /art[íi]culo 60/.test(srcIA));
  ok('no supone la cantidad de armas cuando el documento no lo dice', /no supongas/.test(srcIA));

  /* Estructura real de la tarjeta, verificada contra dos ejemplares que dio
     Henry: una Glock de 2019 en papel y una escopeta de 2024 electrónica. */
  ok('el prompt conoce la tarjeta de tenencia real', /TARJETA DE TENENCIA DE ARMA DE FUEGO/.test(srcIA));
  ok('sabe que la tenencia NO vence', /NO TIENE FECHA DE VENCIMIENTO/.test(srcIA));
  ok('...y que no debe usar la emisión como vencimiento',
     /NO tomes la fecha de emisión/.test(srcIA));
  ok('reconoce la leyenda CIVIL ART. 9', /CIVIL ART\. 9/.test(srcIA));
  ok('lee el MARCAJE GUA (troquelado del art. 35)', /MARCAJE GUA/.test(srcIA));
  ok('lee la huella balística', /huella_balistica/.test(srcIA));
  ok('lee el No. PROPIETARIO que asigna DIGECAM', /no_propietario/.test(srcIA));
  /* El largo del cañón viene en mm en la tarjeta: convertirlo a pulgadas
     haría que el inventario no cuadre con el documento (art. 58). */
  ok('el largo del cañón se lee en MILÍMETROS', /arma_largo_canon_mm/.test(srcIA));
  ok('...y avisa de no convertirlo a pulgadas', /NO lo conviertas a pulgadas/.test(srcIA));
}

/* ── La tenencia no vence: no se le puede avisar "vencida" ──────────────── */
{
  const srcGiros = fs.readFileSync(path.join(raiz, 'js', 'core', 'giros.js'), 'utf8');
  ok('el largo del cañón del inventario está en mm',
     /label: 'Largo del cañón \(mm\)'/.test(srcGiros));
  ok('...con un ejemplo real de la tarjeta (102 mm)', /ph: '102'/.test(srcGiros));

  ok('la ficha del cliente no marca vencida una tenencia',
     /tipo === 'tenencia'[\s\S]{0,220}no vence/.test(srcCli));
  ok('la verificación del expediente sólo mira el vencimiento en portación',
     /cli\?\.licencia_tipo === 'portación' && Modulos\.clientes\?\.diasLicencia/.test(srcArm));
  ok('la entrega de munición, igual',
     /cli\.licencia_tipo === 'portación' && Modulos\.clientes\?\.diasLicencia/.test(srcArm));
}

/* ── LOS DOS DISEÑOS DE DPI ─────────────────────────────────────────────── */
{
  /* Henry lo pidió explícito: circulan el diseño anterior y el nuevo, y los
     dos son válidos. Rechazar el viejo dejaría fuera a media clientela. */
  ok('el prompt menciona los dos diseños', /DOS DISEÑOS DE DPI/.test(srcIA));
  ok('describe el diseño anterior', /Diseño ANTERIOR/.test(srcIA));
  ok('describe el diseño nuevo', /Diseño NUEVO/.test(srcIA));
  ok('dice que el anterior SIGUE VIGENTE', /sigue vigente/i.test(srcIA));
  ok('advierte de no duplicar los rótulos bilingües', /no lo dupliques/.test(srcIA));
  /* Sólo el diseño nuevo puede traer dirección: pedirla siempre haría que el
     modelo la inventara en los DPI viejos. */
  ok('la dirección se pide sólo si aparece impresa',
     /SÓLO si el documento la trae impresa/.test(srcIA));
  ok('el formulario recibe la dirección del DPI nuevo', /'cli-dir': datos\.direccion/.test(srcCli));
}

/* ── Se guarda sin borrar lo que no se muestra ──────────────────────────── */
{
  /* Mismo cuidado que el resto de campos de armería: si el bloque no se
     dibuja, no se manda la clave — mandar null BORRARÍA lo guardado. */
  ['cli-lic-tipo', 'cli-lic-num', 'cli-lic-vence', 'cli-armas-reg']
    .forEach(id => ok(`${id} se guarda con siExiste`, new RegExp(`siExiste\\('${id}'`).test(srcCli)));
  /* '' a una columna integer revienta el insert. */
  ok('armas registradas se manda como entero o null',
     /siExiste\('cli-armas-reg', 'armas_registradas', v => \(v \? Number\(v\) : null\)\)/.test(srcCli));
  ok('el bloque sólo se dibuja para armería',
     /\$\{!armeria \? '' : `[\s\S]{0,400}Licencia de arma \(DIGECAM\)/.test(srcCli));
  /* Con 48 campos, el alta se pliega en secciones: <details> nativo, sin JS. */
  ok('la licencia vive en su propia sección plegable',
     /_seccion\('🔫', 'Licencia y tenencias'/.test(srcCli));
}

/* ── La entrega la trae puesta, pero guarda su propia copia ─────────────── */
{
  ok('la entrega lee la licencia de la ficha del cliente',
     /const lic = cli\.licencia_tipo \|\| 'tenencia'/.test(srcArm));
  ok('las armas registradas también, topadas en 3',
     /Math\.min\(3, Math\.max\(1, Number\(cli\.armas_registradas\) \|\| 1\)\)/.test(srcArm));
  ok('el número y el vencimiento vienen precargados',
     /value="\$\{UI\.esc\(cli\.licencia_num \|\| ''\)\}"/.test(srcArm) &&
     /value="\$\{cli\.licencia_vencimiento \|\| ''\}"/.test(srcArm));
  /* Que quede claro que corregirlo acá no toca la ficha: cada comprobante
     conserva lo que había el día que se firmó. */
  ok('explica que corregir acá no cambia la ficha', /la ficha no se toca/.test(srcArm));
  ok('avisa si el cliente no tiene licencia guardada', /no tiene licencia guardada en su ficha/.test(srcArm));
}

/* ── Una licencia vencida se ve como impedimento, no como campo faltante ── */
{
  ok('el expediente pide el tipo de licencia',
     /falta\.push\('Tipo de licencia/.test(srcArm));
  ok('la licencia vencida se avisa aparte y en rojo',
     /La licencia venció hace \$\{Math\.abs\(dias\)\}/.test(srcArm));
  ok('avisa también cuando está por vencer (30 días)', /dias <= 30/.test(srcArm));
  ok('la entrega de munición muestra el mismo aviso',
     /La licencia de este cliente venció hace/.test(srcArm));
  ok('el formulario del cliente avisa al cambiar la fecha', /_avisarLicencia/.test(srcCli));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
