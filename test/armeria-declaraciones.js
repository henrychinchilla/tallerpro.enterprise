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
