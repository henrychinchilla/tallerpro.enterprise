/* Declaraciones juradas de armería.

   Esto genera un documento que una persona firma ante notario y presenta
   ante DIGECAM. Si el texto afirma algo que la ley no dice, o rotula un
   documento como obligación legal que no existe, el daño no es un bug de
   pantalla: es un trámite rechazado o una obligación inventada.

   Por eso se prueba (a) que cada declaración cite el artículo del que sale,
   (b) que el texto diga lo que la ley manda decir, y (c) que la declaración
   de origen de fondos NO se presente como formulario de la IVE — porque el
   art. 18 del Decreto 67-2001 no incluye a las armerías entre las personas
   obligadas. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);

let impreso = '';
const ctx = {
  console,
  Modulos: {},
  UI: {
    esc: v => String(v ?? ''),
    q: v => 'Q' + Number(v || 0).toFixed(2),
    fecha: v => String(v || ''),
    modal: (t, h) => { impreso = h; },
    cerrarModal() {},
  },
  DB: {},
  document: { getElementById: () => null },
  setTimeout: (fn) => { try { fn(); } catch (_) {} },
};
ctx.window = ctx;
ctx.window.open = () => ({ document: { write: h => { impreso = h; }, close() {} }, focus() {}, print() {} });
ctx.window.Auth = { tenant: { name: 'ARMERÍA DEMO, S.A.', nit: '1234567-8' } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'core', 'ley-armas.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'modulos', 'especializados', 'armeria.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'modulos', 'especializados', 'armeria-declaraciones.js'), 'utf8'), ctx);
const ARM = ctx.Modulos.armeria;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* Datos de trabajo */
ARM._clientes = [{ id: 'c1', nombre: 'Juan Pérez López', nit: '9876543-2',
                   direccion: '5a calle 3-40 zona 1, Guatemala', vivienda: 'propia' }];
ARM._inventario = [{ id: 'i1', nombre: 'Glock 19', atributos: { largo_canon: 4.02, conversiones_calibre: '.22LR con kit' } }];
ARM._data = [{ id: 'op1', num: 'ARM-2026-0001', cliente_id: 'c1', inventario_id: 'i1',
               categoria: 'pistola', marca: 'Glock', modelo: '19', calibre: '9mm',
               numero_serie: 'ABC123', pais_origen: 'Austria',
               contraparte_dpi: '1234567890101', contraparte_nit: '9876543-2' }];

/* ── Declaración de ingresos (art. 59) ───────────────────────────────────
   La ley: "deberá presentar declaración jurada prestada ante notario
   público, declarando sus ingresos y la actividad de la que los obtiene". */
{
  ARM.imprimirDeclaracion('ingresos', 'op1');
  const doc = impreso;
  ok('la declaración de ingresos cita el artículo 59', /[Aa]rt[íi]culo 59/.test(doc));
  ok('declara los ingresos, como manda la ley', /ingresos mensuales/i.test(doc));
  ok('y la actividad de la que los obtiene', /actividad econ[óo]mica/i.test(doc));
  ok('explica por qué no presenta constancia de empleo (el supuesto del art. 59)',
     /no me es\s*\n?\s*posible presentar constancia de empleo/i.test(doc.replace(/\s+/g, ' ')));
  ok('lleva los datos del cliente ya llenos', /Juan Pérez López/.test(doc));
  ok('lleva el DPI de la operación', /1234567890101/.test(doc));
  ok('lleva la dirección registrada', /5a calle 3-40 zona 1/.test(doc));
  ok('incluye el detalle del arma con su número de serie', /ABC123/.test(doc));
  ok('incluye el largo del cañón que pide la ley (arts. 63 y 72)', /4\.02"/.test(doc));
  ok('deja espacio de firma para el notario', /Firma y sello del Notario/.test(doc));
  ok('pide el número de colegiado del notario', /Colegiado/.test(doc));
  ok('aclara que la fe pública la da el notario, no el sistema',
     /fe p[úu]blica la otorga el notario/i.test(doc));
}

/* ── Declaración para portación (art. 72 a) 3) ────────────────────────────
   La ley pide declarar: no padecer enfermedades mentales, no ser desertor
   del Ejército, no haber abandonado empleo en la PNC. Las tres. */
{
  ARM.imprimirDeclaracion('portacion', 'op1');
  const doc = impreso;
  ok('la declaración de portación cita el artículo 72', /art[íi]culo 72/i.test(doc));
  ok('declara no padecer enfermedades mentales', /enfermedades mentales/i.test(doc));
  ok('declara no ser desertor del Ejército', /desertor del Ej[ée]rcito/i.test(doc));
  ok('declara no haber abandonado empleo en la PNC', /Polic[íi]a Nacional Civil/i.test(doc));
  ok('declara que la información remitida a DIGECAM es verídica', /ver[íi]dica/i.test(doc));
}

/* ── Origen de fondos: honesto sobre lo que NO es ─────────────────────────
   El art. 18 del Decreto 67-2001 lista las personas obligadas ante la IVE y
   las armerías no están. Rotular esto como "formulario IVE" le inventaría
   al negocio una obligación que la ley no le impone. */
{
  ARM.imprimirDeclaracion('origen_fondos', 'op1');
  const doc = impreso;
  ok('pregunta por el origen de los fondos (lo que Henry necesita)', /origen de los fondos/i.test(doc));
  ok('pregunta si actúa por cuenta propia o de un tercero', /por cuenta propia/i.test(doc));
  ok('ACLARA que no es un formulario de la IVE', /no es un formulario de la Intendencia/i.test(doc));
  ok('explica que el art. 18 no incluye a las armerías', /art[íi]culo 18 del Decreto 67-2001/.test(doc));
  /* La evidencia fuerte: el reglamento (AG 118-2002) lista los dos grupos
     completos y ahí tampoco están. Citarlo hace la afirmación verificable. */
  ok('cita también el reglamento AG 118-2002', /Acuerdo Gubernativo 118-2002/.test(doc));
  ok('menciona que revisó ambos grupos', /Grupo A y Grupo B/.test(doc));
  ok('avisa de la fecha del Decreto 15-2026', /15-2026/.test(doc));
  ok('recomienda verificar con asesor legal', /asesor legal/i.test(doc));
  ok('NO se presenta como obligación legal del negocio', /control interno voluntario/i.test(doc));
  /* El detalle del arma no aplica a un documento de origen de fondos. */
  ok('no mete la tabla del arma donde no corresponde', !/Arma objeto de la operaci[óo]n/.test(doc));
}

/* ── El menú describe correctamente cada documento ───────────────────────── */
{
  ARM.modalDeclaraciones('op1');
  const menu = impreso;
  ok('el menú lista las tres declaraciones',
     /Declaraci[óo]n jurada de ingresos/.test(menu) &&
     /licencia de portaci[óo]n/.test(menu) &&
     /origen de fondos/i.test(menu));
  ok('el menú dice de qué artículo sale cada una', /Art[íi]culo 59/.test(menu) && /Art[íi]culo 72/.test(menu));
  ok('el menú marca la de origen de fondos como NO exigida',
     /No exigida por la Ley de Armas/.test(menu));
  ok('el menú recuerda que se firman ante notario', /ante notario p[úu]blico/i.test(menu));
  ok('muestra los datos del cliente vinculado', /Juan Pérez López/.test(menu));
}

/* ── Los datos del cliente llenan la identificación ──────────────────────
   La ley describe cómo debe identificarse quien declara: edad, estado
   civil, nacionalidad, profesión, DPI y domicilio (art. 55 a) de la ley,
   art. 17 b) del reglamento). Antes salían como rayas para llenar a mano
   en cada declaración aunque fueran siempre los mismos del mismo cliente. */
{
  /* Se carga clientes.js para que la declaración pueda derivar la edad. */
  vm.runInContext(fs.readFileSync(raiz('js', 'modulos', 'operacion', 'clientes.js'), 'utf8'), ctx);

  /* La fecha se arma con los componentes LOCALES, no con toISOString():
     éste convierte a UTC y en Guatemala (UTC-6) devuelve el día siguiente,
     con lo que el cliente "todavía no cumple" y la edad sale un año menos.
     Es la misma trampa que el propio edadDe() está escrito para evitar. */
  const hoyL = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const nacidoISO = `${hoyL.getFullYear() - 40}-${p2(hoyL.getMonth() + 1)}-${p2(hoyL.getDate())}`;
  ARM._clientes = [{
    id: 'c9', nombre: 'María López', nit: '111-2', dpi: '2233445566778',
    direccion: 'Av. Reforma 10-00 zona 9', vivienda: 'rentada',
    fecha_nacimiento: nacidoISO,
    estado_civil: 'casada(a)', profesion: 'Contadora', nacionalidad: 'guatemalteca',
  }];
  ARM._data = [];

  ARM.imprimirDeclaracion('ingresos', '', 'c9');
  const doc = impreso;
  ok('la declaración calcula la EDAD sola desde la fecha de nacimiento', /de <b>40<\/b> años de edad/.test(doc));
  ok('lleva el estado civil del cliente', /casada\(a\)/.test(doc));
  ok('lleva la profesión', /Contadora/.test(doc));
  ok('lleva la nacionalidad', /guatemalteca/.test(doc));
  ok('lleva el DPI de la ficha del cliente', /2233445566778/.test(doc));
  ok('lleva el NIT', /111-2/.test(doc));
  ok('lleva la dirección y si la vivienda es propia o rentada',
     /Av\. Reforma 10-00/.test(doc) && /vivienda rentada/.test(doc));
  ok('ya no quedan rayas en blanco para esos datos: van en negrita',
     /<b>Contadora<\/b>/.test(doc) && /<b>casada\(a\)<\/b>/.test(doc));

  /* Un cliente sin esos datos sigue generando el documento, con rayas. */
  ARM._clientes.push({ id: 'c10', nombre: 'Sin Datos' });
  ARM.imprimirDeclaracion('ingresos', '', 'c10');
  ok('sin fecha de nacimiento deja la raya de la edad, no un "null"',
     !/null/.test(impreso) && /border-bottom:1px solid #000/.test(impreso));
}

/* ── Editable antes de imprimir ──────────────────────────────────────────
   Henry pidió poder corregir el documento antes de mandarlo al notario.
   Se usa contenteditable (nativo) y NO se dispara la impresión sola: hacerlo
   volvería inútil la edición. */
{
  ARM.imprimirDeclaracion('ingresos', '', 'c9');
  const doc = impreso;
  ok('el documento es editable', /contenteditable="true"/.test(doc));
  ok('tiene su propio botón de imprimir', /window\.print\(\)/.test(doc));
  ok('avisa que los cambios no se guardan en la ficha', /no se guardan/.test(doc));
  ok('la barra de edición NO sale impresa', /@media print \{ \.barra\{display:none\}/.test(doc));
}

/* ── Declaración A DEMANDA, sin venta de por medio ───────────────────────
   Un cliente puede necesitar sólo la declaración: la del art. 72 es para
   tramitar la licencia de portación de un arma que YA tiene, y ahí no hay
   compra alguna. Amarrar las declaraciones a una operación dejaba ese caso
   sin salida — que es justo lo que Henry preguntó. */
{
  ARM._data = [];   // sin ninguna operación registrada
  ARM._clientes = [{ id: 'c1', nombre: 'Juan Pérez López', nit: '9876543-2',
                     direccion: '5a calle 3-40 zona 1, Guatemala', dpi: '1234567890101' }];

  ARM.modalDeclaraciones();
  ok('se puede abrir el menú sin ninguna operación', /Declaraci[óo]n jurada de ingresos/.test(impreso));
  ok('ofrece elegir el cliente cuando no hay venta', /<select/.test(impreso) && /Juan Pérez López/.test(impreso));
  ok('explica que no hace falta una venta', /No hace falta una venta/.test(impreso));

  /* Elegido el cliente, el documento sale con SUS datos aunque no haya venta. */
  ARM.imprimirDeclaracion('portacion', '', 'c1');
  ok('la declaración de portación sale con los datos del cliente elegido',
     /Juan Pérez López/.test(impreso));
  ok('...y con su DPI, tomado de la ficha del cliente', /1234567890101/.test(impreso));
  ok('...sin inventar una operación que no existe', !/Arma objeto de la operaci[óo]n/.test(impreso));
  ok('sigue citando el artículo 72', /art[íi]culo 72/i.test(impreso));
}

/* ── Sin cliente vinculado no revienta: sale para llenar a mano ──────────── */
{
  ARM._data = [{ id: 'op2', num: 'ARM-2', cliente_id: null }];
  ARM.modalDeclaraciones('op2');
  ok('sin cliente avisa que saldrá en blanco', /espacios en blanco/i.test(impreso));
  ARM.imprimirDeclaracion('ingresos', 'op2');
  ok('el documento igual se genera, con rayas para llenar', /border-bottom:1px solid #000/.test(impreso));
  ok('y no escribe "undefined" en los huecos', !/undefined/.test(impreso));
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
