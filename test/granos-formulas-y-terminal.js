/* Lo que Henry pidió en el módulo de granos, y el POS que no abría.

   CINCO COSAS, y cada una tiene su forma de fallar:

   1) TODOS los precios se pueden editar, incluso los que bajan solos del MAGA.
      El MAGA publica un promedio mayorista NACIONAL; el comercio compra a su
      proveedor, en su departamento. Antes sólo se podía corregir el precio
      "tentativo" de menudeo: el del MAGA no tenía botón, así que el costo de
      la fórmula nunca era el suyo.

   2) Fórmulas propias PARA CUALQUIER ANIMAL. Las especies eran una constante
      del código (aves, cerdos, bovinos, equinos). Un agroservicio real formula
      para conejos, tilapia u ovejas — y sobre todo AJUSTA la de referencia.

   3) El CRUD completo (regla 1 de CLAUDE.md): crear, ver, editar y eliminar.

   4) El POS de El Granjero no abría. No era permisos: el negocio tenía CERO
      terminales y no existía NINGUNA pantalla en toda la app para crear una.
      El POS decía "pedíselo al administrador" y el administrador era él.

   5) La app le decía "taller" a un negocio de granos.

   El caso peligroso que cuidan las pruebas de abajo: que una fórmula propia
   pierda las ADVERTENCIAS por ingrediente. La urea mata a un caballo. Que el
   aviso dependa de si la fórmula la escribió el usuario o venía en el código
   sería el peor lugar imaginable para una inconsistencia. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);
const leer = (...f) => fs.readFileSync(raiz(...f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── El módulo, corriendo de verdad ─────────────────────────────────────── */
const modales = [];
const ctx = {
  console, Math, Date, JSON, String, Number, Object, Array, RegExp, isNaN, isFinite, Promise, setTimeout,
  UI: {
    esc: v => String(v ?? ''), jsAttr: v => String(v ?? ''), q: v => 'Q' + Number(v || 0).toFixed(2),
    modal: (t, h) => modales.push({ t, h }), cerrarModal() {}, toast() {}, loading() {},
    confirmar: async () => true,
  },
  Modulos: { btnAccion: (tipo) => `<button data-accion="${tipo}"></button>`, eliminarRegistro() {} },
  DB: {},
  Auth: { tenant: {}, user: { rol: 'admin' } },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(leer('js', 'modulos', 'agropecuaria', 'formulas_alimento.js'), ctx);
const F = ctx.Modulos.formulas_alimento;

/* ── 1. TODO PRECIO SE PUEDE PISAR ──────────────────────────────────────── */
{
  F._insumos = [];
  F._ref = { 'Maíz amarillo, de primera': { precio: 210 } };
  F._mercado = { melaza: { precio_kg: 37, nombre: 'Melaza 1kg', fuente: 'super', fecha: '2026-08-08' } };
  F._propias = [];

  const maiz = F._precioDe('Maíz amarillo');
  ok('el maíz toma el precio del MAGA', maiz && maiz.q === 210 && maiz.fuente === 'MAGA');
  ok('...y el MAGA cuenta como precio firme', maiz.firme === true);

  const melaza = F._precioDe('Melaza de caña');
  ok('la melaza cae al menudeo cuando no hay otro', melaza && melaza.fuente === 'menudeo');
  ok('...y viaja marcada como NO firme (es de supermercado, no de finca)', melaza.firme === false);

  /* El comercio carga su precio: tiene que ganarle al del MAGA. */
  F._insumos = [{ id: 'i1', nombre: 'Maíz amarillo', precio_quintal: 185 }];
  const propio = F._precioDe('Maíz amarillo');
  ok('el precio que carga el comercio le GANA al del MAGA', propio.q === 185 && propio.fuente === 'tuyo');
  ok('...y trae el id, que es lo que permite editarlo y soltarlo', propio.insumoId === 'i1');

  ok('un ingrediente sin ningún precio devuelve null (no inventa un número)',
     F._precioDe('Fosfato dicálcico') === null);

  /* La fila del MAGA tiene que traer botón: es el pedido exacto de Henry. */
  const html = F._formulaHTML({ nombre: 'Prueba', animal: 'pollo', consumo: 0.1, ing: { maiz: 100 } });
  ok('la fila con precio del MAGA trae botón para editarlo', /_ajustar\(/.test(html));
  const soloMaga = (() => { F._insumos = []; return F._formulaHTML({ nombre: 'X', animal: 'pollo', consumo: 0.1, ing: { maiz: 100 } }); })();
  ok('...aunque el precio NO sea tentativo', /_ajustar\(/.test(soloMaga));
  F._insumos = [{ id: 'i1', nombre: 'Maíz amarillo', precio_quintal: 185 }];
  ok('cuando el precio ya es tuyo, se puede volver al automático',
     /_soltarPrecio\(/.test(F._formulaHTML({ nombre: 'X', animal: 'pollo', consumo: 0.1, ing: { maiz: 100 } })));
}

/* ── 2. FÓRMULAS PROPIAS, DE CUALQUIER ANIMAL ───────────────────────────── */
{
  /* Un grupo que la app NO trae: es el caso que Henry pidió — "toda clase de
     animales", no sólo los cuatro que estaban escritos en el código. */
  F._propias = [{
    id: 'f1', especie: 'cuyes', especie_label: '🐹 Cuyes', nombre: 'Cuy — engorde',
    animal: 'cuy', consumo: 0.06,
    ingredientes: [{ nombre: 'Maíz amarillo', pct: 50 }, { nombre: 'Pasta de soya (44-48% PC)', pct: 30 },
                   { nombre: 'Salvado / afrecho de trigo', pct: 20 }],
  }, {
    /* Y una propia dentro de un grupo que SÍ existe: tiene que convivir con
       las de referencia, no reemplazarlas. */
    id: 'f2', especie: 'aves', nombre: 'Pollo — mi mezcla', animal: 'pollo', consumo: 0.1,
    ingredientes: [{ nombre: 'Maíz amarillo', pct: 60 }, { nombre: 'Pasta de soya (44-48% PC)', pct: 40 }],
  }];
  const esp = F._especies();
  ok('las especies de referencia siguen estando', !!esp.aves && !!esp.porcinos && !!esp.bovinos && !!esp.equinos);
  ok('y la que inventó el comercio aparece como pestaña', !!esp.cuyes);
  ok('...con la etiqueta que él le puso', esp.cuyes.label === '🐹 Cuyes');
  ok('...y su fórmula adentro', esp.cuyes.formulas.length === 1);
  ok('una fórmula propia convive con las de referencia del mismo grupo',
     esp.aves.formulas.length === 4 && esp.aves.formulas.some(f => f.id === 'f2'));
  ok('...sin borrar ninguna de referencia',
     esp.aves.formulas.filter(f => !f.id).length === 3);

  /* Los dos formatos de ingredientes tienen que leerse igual. */
  const deReferencia = F._ingredientes({ ing: { maiz: 60, soya: 40 } });
  const propia = F._ingredientes(F._propias[0]);
  ok('los ingredientes de una fórmula de referencia salen con su nombre',
     deReferencia[0].nombre === 'Maíz amarillo' && deReferencia[0].pct === 60);
  ok('los de una propia también', propia[0].nombre === 'Maíz amarillo' && propia[0].pct === 50);
  ok('un ingrediente vacío no se cuela', F._ingredientes({ ingredientes: [{ nombre: '', pct: 10 }] }).length === 0);

  /* LO QUE MÁS IMPORTA: las advertencias no dependen de quién escribió la
     fórmula. La urea es tóxica en cerdos, aves y caballos. */
  ok('la advertencia de la urea existe', /RUMIANTES/i.test(F._avisoDe('Urea (NPN)')));
  const conUrea = F._formulaHTML({
    id: 'f9', nombre: 'Mía con urea', animal: 'vaca', consumo: 5,
    ingredientes: [{ nombre: 'Maíz amarillo', pct: 99 }, { nombre: 'Urea (NPN)', pct: 1 }],
  });
  ok('una fórmula PROPIA con urea muestra la misma advertencia', /RUMIANTES/i.test(conUrea));
  ok('...y marca el ingrediente con ⚠️', /⚠️/.test(conUrea));
}

/* ── 3. CRUD COMPLETO (regla 1 de CLAUDE.md) ────────────────────────────── */
{
  const src = leer('js', 'modulos', 'agropecuaria', 'formulas_alimento.js');
  ok('Crear: hay botón de nueva fórmula', /＋ Nueva fórmula/.test(src));
  ok('Editar: la fórmula propia trae el botón', /btnAccion\('editar', `Modulos\.formulas_alimento\.modalFormula/.test(src));
  ok('Eliminar: también', /btnAccion\('eliminar', `Modulos\.formulas_alimento\.eliminarFormula/.test(src));
  ok('...y usa el helper estándar', /eliminarRegistro\('agro_formulas'/.test(src));

  const propiaHTML = F._formulaHTML(F._propias[0]);
  ok('la propia se distingue de la de referencia', /Tuya/.test(propiaHTML));
  ok('la de referencia ofrece copiarse para ajustarla',
     /Copiar y ajustar/.test(F._formulaHTML({ nombre: 'Ref', animal: 'pollo', consumo: 0.1, ing: { maiz: 100 } })));
  ok('la de referencia NO ofrece editarse (no es suya)',
     !/modalFormula/.test(F._formulaHTML({ nombre: 'Ref', animal: 'pollo', consumo: 0.1, ing: { maiz: 100 } })));

  /* La tabla y sus permisos. Un GRANT olvidado deja el módulo mudo: la fila no
     se guarda y el error se ve como "no pasó nada" (ver migración 100). */
  const mig = leer('db', 'migrations', '134_agro_formulas_propias.sql');
  ok('la migración crea agro_formulas', /create table if not exists public\.agro_formulas/.test(mig));
  ok('...con RLS por tenant', /enable row level security/.test(mig) && /current_tenant_id\(\)/.test(mig));
  ok('...y los CUATRO permisos a authenticated',
     /grant select, insert, update, delete on public\.agro_formulas to authenticated/.test(mig));
  ok('...sin dejársela a anon', /revoke all on public\.agro_formulas from anon/.test(mig));
  ok('el consumo no puede ser cero (se divide por él)', /consumo[\s\S]{0,60}check \(consumo > 0\)/.test(mig));
}

/* ── 4. EL POS QUE NO ABRÍA ─────────────────────────────────────────────── */
{
  const pos = leer('js', 'pos', 'pos.js');
  const cfg = leer('js', 'modulos', 'admin', 'configuracion.js');
  const db = leer('js', 'core', 'db.js');

  ok('el POS deja crear la primera terminal desde la misma pantalla',
     /crearPrimeraTerminal/.test(pos));
  ok('...sólo a quien administra (un cajero cobra, no configura)',
     /_puedeAdministrar\(\)/.test(pos) && /'superadmin', 'admin'/.test(pos));
  ok('...y existe la función que la guarda', /async guardarTerminalPOS/.test(db));
  ok('la pantalla ya no manda a pedírselo a un administrador que no tiene dónde crearla',
     !/El administrador del taller debe crear/.test(pos));

  /* CRUD de terminales en Configuración: sin esto, crear la primera desde el
     POS sería un parche y no una solución. */
  ok('Configuración lista las terminales', /_terminalesHTML/.test(cfg));
  ok('Crear', /＋ Nueva terminal/.test(cfg));
  ok('Editar', /modalTerminal\(/.test(cfg));
  ok('Eliminar', /eliminarTerminal/.test(cfg) && /eliminarRegistro\('pos_terminales'/.test(cfg));
  ok('...y se puede apagar sin borrar (una caja con ventas es historial)',
     /alternarTerminal/.test(cfg));
  ok('la lista incluye las apagadas (si no, no se podrían reencender)',
     /getTodasTerminalesPOS/.test(cfg) && /async getTodasTerminalesPOS/.test(db));
}

/* ── 5. LA APP YA NO LE DICE "TALLER" A UN NEGOCIO DE GRANOS ────────────── */
{
  /* Se prueba la REGLA, no una frase: ninguna pantalla COMPARTIDA puede llamar
     taller al negocio. Los módulos del vertical mecánico quedan fuera a
     propósito: ahí un taller es un taller. */
  const COMPARTIDAS = [
    ['js', 'pos', 'pos.js'],
    ['js', 'modulos', 'admin', 'configuracion.js'],
    ['js', 'modulos', 'herramientas', 'comunicaciones.js'],
    ['js', 'modulos', 'rrhh', 'rrhh.js'],
    ['js', 'modulos', 'operacion', 'bodegas.js'],
    ['js', 'modulos', 'marketing', 'marketing.js'],
  ];
  const sobrantes = [];
  COMPARTIDAS.forEach(f => {
    leer(...f).split('\n').forEach((linea, i) => {
      /* Sólo la palabra suelta y en PROSA:
         · seleccionarTaller / taller_pos son identificadores (el \b ya los deja
           fuera porque la palabra va pegada a otra).
         · 'taller' entre comillas y solo es un VALOR guardado (scope del KPI,
           tipo de capacitación: ahí "Taller" es un curso, no el negocio).
         · "taller mecánico" es correcto donde aparezca. */
      const limpia = linea
        .replace(/\b[Tt]aller(es)?\s+mec[áa]nic[oa]s?\b/g, '')
        .replace(/(['"])[Tt]aller(es)?\1/g, '');
      if (/\b[Tt]aller(es)?\b/.test(limpia)) sobrantes.push(`${f.join('/')}:${i + 1}`);
    });
  });
  ok(`ninguna pantalla compartida le dice "taller" al negocio (quedan: ${sobrantes.length})`, sobrantes.length === 0);
  sobrantes.slice(0, 8).forEach(s => console.log('        ↳ ' + s));

  /* Y el mensaje que Henry señaló, por su nombre. */
  const pos = leer('js', 'pos', 'pos.js');
  ok('el mensaje del administrador ya no habla de un taller',
     !/administrador del taller/i.test(pos));
  ok('...y le habla al negocio', /administra el negocio/.test(pos));
}

/* ── 6. EL CORREO DEL MAGA ES DE CADA NEGOCIO ───────────────────────────── */
{
  const cfg = leer('js', 'modulos', 'admin', 'configuracion.js');
  const maga = leer('js', 'modulos', 'agropecuaria', 'precios_maga.js');
  ok('el correo del resumen diario se configura desde Configuración', /_correoMagaHTML/.test(cfg));
  ok('...reutilizando la MISMA tarjeta del módulo (no una copia)',
     /Modulos\.precios_maga\?\._configCorreoHTML/.test(cfg));
  ok('...y sólo si el negocio maneja granos', /includes\('venta_granos'\)/.test(cfg));
  ok('quien administra el negocio puede cambiarlo', /'admin', 'superadmin'/.test(maga));
  ok('lo que se guarda es el correo del negocio, no el nuestro',
     /email_reporte_maga/.test(leer('js', 'core', 'db.js')));
}

/* ── 7. EL ALTA DE FÓRMULA TIENE QUE SERVIRLE A ALGUIEN QUE NO SABE ────────
   Henry abrió "＋ Nueva fórmula" y encontró: una parrilla en blanco (ninguna
   sugerencia) y un dropdown de grupo con UNA sola opción. Lo segundo no era
   falta de datos: el campo venía precargado con "aves" y el navegador FILTRA
   el datalist por lo que el campo ya trae, así que escondía los otros tres.
   Por eso el grupo va en un <select> y no en un input con datalist. */
{
  F._propias = [];
  modales.length = 0;
  F._especie = 'aves';
  F.modalFormula();
  const html = modales[modales.length - 1].h;

  ok('el grupo es un <select> y no un input con datalist (que se filtraba solo)',
     /<select[^>]*id="form-f-especie"/.test(html) && !/id="form-f-especie"[^>]*list=/.test(html));
  ['aves', 'porcinos', 'bovinos', 'equinos', 'conejos', 'ovinos', 'patos', 'peces']
    .forEach(k => ok(`...y ofrece el grupo ${k}`, new RegExp(`<option value="${k}"`).test(html)));
  ok('...más la opción de inventar uno', /value="__nuevo"/.test(html));

  ok('hay sugerencias para partir de una fórmula', /Partir de una fórmula de referencia/.test(html));
  ok('...y son todas las de referencia, no las de una especie',
     F._sugerencias().length === Object.values(F._ESPECIES).reduce((s, e) => s + e.formulas.length, 0));
  ok('...bastantes como para que sirva de verdad', F._sugerencias().length >= 12);

  /* Elegir una sugerencia tiene que dejar el formulario LLENO. */
  modales.length = 0;
  const conejo = F._sugerencias().find(s => s.f.animal === 'conejo');
  F._sugerir(conejo.clave);
  const conBase = modales[modales.length - 1].h;
  ok('elegir una sugerencia trae el animal', /value="conejo"/.test(conBase));
  ok('...el consumo', /id="form-f-consumo"[^>]*value="0.12"/.test(conBase));
  ok('...y los ingredientes con sus porcentajes',
     /value="Harina de alfalfa"/.test(conBase) && /value="40"/.test(conBase));
  ok('...dejando claro que es una copia para ajustar', /\(ajustada\)/.test(conBase));
  ok('elegir "en blanco" no revienta', (() => { try { F._sugerir(''); return true; } catch (_) { return false; } })());
}

/* ── 8. LAS FÓRMULAS NUEVAS SON CORRECTAS ─────────────────────────────────
   Son alimento para animales vivos: una fórmula mal sumada o con un
   ingrediente tóxico para esa especie no es un bug de pantalla. */
{
  const especies = Object.entries(F._ESPECIES);
  const labels = Object.values(F._ING).map(i => i.label);

  especies.forEach(([k, esp]) => {
    esp.formulas.forEach(f => {
      const suma = Object.values(f.ing).reduce((s, p) => s + p, 0);
      ok(`${k} · "${f.nombre}" suma 100%`, Math.abs(suma - 100) < 0.05);
      ok(`${k} · "${f.nombre}" dice a qué animal y cuánto come`,
         !!f.animal && typeof f.consumo === 'number' && f.consumo > 0);
      const desconocidos = Object.keys(f.ing).filter(c => !F._ING[c]);
      ok(`${k} · "${f.nombre}" no usa ingredientes que no existen`, desconocidos.length === 0);
    });
  });

  /* LA QUE MÁS IMPORTA: la urea es tóxica en monogástricos. Sólo puede
     aparecer en rumiantes, y ni siquiera en todos — en ovinos y caprinos el
     margen entre dosis útil y tóxica es más chico, por eso van sin ella. */
  const conUrea = especies.filter(([, esp]) =>
    esp.formulas.some(f => Object.keys(f.ing).includes('urea'))).map(([k]) => k);
  ok(`la urea sólo aparece en bovinos (está en: ${conUrea.join(', ') || 'ninguna'})`,
     conUrea.length === 1 && conUrea[0] === 'bovinos');

  ok('el conejo lleva fibra de verdad (alfalfa ≥ 35%)',
     F._ESPECIES.conejos.formulas.every(f => (f.ing.alfalfa || 0) >= 35));
  ok('...y la alfalfa avisa que no se cambia por grano', /diarreas/i.test(F._avisoDe('Harina de alfalfa')));
  ok('la tilapia avisa que hay que peletizar (en harina se pierde en el agua)',
     /PELETIZAR/i.test(F._ESPECIES.peces.nota));
  ok('el nombre del ingrediente de cada fórmula existe en el catálogo',
     especies.every(([, esp]) => esp.formulas.every(f =>
       F._ingredientes(f).every(i => labels.includes(i.nombre)))));
}

/* ── 9. VARIOS CORREOS PARA EL MISMO NEGOCIO, SEPARADOS POR ";" ───────────── */
{
  const mctx = {
    console, Math, Date, JSON, String, Number, Object, Array, RegExp, isNaN, Promise, Set, Map,
    UI: { esc: v => String(v ?? ''), toast() {}, fecha: v => String(v ?? '') },
    Modulos: {}, DB: {}, Auth: { tenant: {}, user: { rol: 'admin' } },
    document: { getElementById: () => null },
  };
  mctx.window = mctx;
  vm.createContext(mctx);
  vm.runInContext(leer('js', 'modulos', 'agropecuaria', 'precios_maga.js'), mctx);
  const M = mctx.Modulos.precios_maga;

  ok('un solo correo sigue funcionando', JSON.stringify(M._correosDe('a@b.com')) === '["a@b.com"]');
  ok('dos correos separados por ;',
     JSON.stringify(M._correosDe('a@b.com;c@d.com')) === '["a@b.com","c@d.com"]');
  ok('...con espacios de por medio', JSON.stringify(M._correosDe(' a@b.com ; c@d.com ')) === '["a@b.com","c@d.com"]');
  ok('un ";" de más no genera un destinatario vacío',
     JSON.stringify(M._correosDe('a@b.com;;')) === '["a@b.com"]');
  ok('vacío no revienta', JSON.stringify(M._correosDe('')) === '[]');
  ok('null tampoco', JSON.stringify(M._correosDe(null)) === '[]');

  const maga = leer('js', 'modulos', 'agropecuaria', 'precios_maga.js');
  ok('la pantalla lo explica', /separados por punto y coma/.test(maga));
  /* type="email" rechaza una lista: el navegador marcaba el campo inválido. */
  ok('el campo ya no es type="email" (invalidaba la lista)',
     !/id="maga-rep-email" type="email"/.test(maga));
  ok('se valida cada correo por separado y se dice cuál está mal', /malos\.join/.test(maga));

  /* Y quien manda el correo tiene que partirlos: guardarlos y mandar la cadena
     entera como un solo destinatario no le llegaría a nadie. */
  const fn = leer('supabase', 'functions', 'maga-alertas', 'index.ts');
  ok('la Edge Function separa los destinatarios', /function destinatarios/.test(fn));
  ok('...y los manda como arreglo (un correo con todos, no uno por cada uno)',
     /const destino = destinatarios\(/.test(fn));
  ok('...también en la alerta mensual', (fn.match(/destinatarios\(/g) || []).length >= 3);
  ok('sin correos no intenta enviar', /if \(!destino\.length\)/.test(fn));
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
