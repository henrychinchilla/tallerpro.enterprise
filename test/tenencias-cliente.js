/* Las tarjetas de tenencia del cliente: una por arma.

   La app permitía subir la LICENCIA pero no las TENENCIAS, y son documentos
   distintos:
     · LICENCIA de portación → del TITULAR. Autoriza llevarla consigo. VENCE.
     · TARJETA DE TENENCIA  → de CADA ARMA. Trae huella balística y marcaje
       GUA, dice "CIVIL ART. 9" y NO VENCE.

   POR QUÉ URGE, y es lo que esta prueba cuida: el tope del art. 60 en
   portación es de 250 cartuchos POR ARMA REGISTRADA, hasta 3 (art. 72). Ese
   número se tecleaba a mano en cada entrega, sin nada que lo respaldara.
   Con las tenencias registradas SALE DE LOS DOCUMENTOS.

   Un arma de más contada = 250 cartuchos de más entregados legalmente mal. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = path.join(__dirname, '..');
const srcCli = fs.readFileSync(path.join(raiz, 'js', 'modulos', 'operacion', 'clientes.js'), 'utf8');
const srcDB  = fs.readFileSync(path.join(raiz, 'js', 'core', 'db.js'), 'utf8');
const mig    = fs.readFileSync(path.join(raiz, 'db', 'migrations', '129_clientes_tenencias.sql'), 'utf8');

const ctx = { console, Math, Date, JSON, String, Number, Object, Array, RegExp, isNaN };
ctx.window = ctx; ctx.Modulos = {}; ctx.UI = { esc: v => String(v ?? '') };
ctx.DB = {}; ctx.Auth = { tenant: {}, user: {} }; ctx.Docs = {}; ctx.IA = {};
ctx.document = { getElementById: () => null, querySelector: () => null };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'js', 'core', 'geo-guatemala.js'), 'utf8'), ctx);
vm.runInContext(srcCli, ctx);
const C = ctx.Modulos.clientes;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── La tabla guarda lo que trae la tarjeta real ────────────────────────── */
{
  ['num_tarjeta', 'huella_balistica', 'no_propietario', 'marcaje_gua',
   'tipo', 'marca', 'modelo', 'calibre', 'numero_serie', 'largo_canon_mm',
   'conversiones', 'pais_origen', 'activa']
    .forEach(c => ok(`la migración guarda ${c}`, mig.includes(c)));

  /* Verificado contra dos tarjetas reales: ninguna trae vencimiento. */
  /* Se busca la DECLARACIÓN de columna, no la palabra: la migración menciona
     fecha_vencimiento en un comentario justamente para explicar por qué no
     existe, y buscar el texto pelado daba rojo por el comentario. */
  const sinComentarios = mig.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
  ok('NO hay columna de vencimiento (la tenencia no vence)',
     !/^\s*fecha_vencimiento\s+\w/m.test(sinComentarios));
  ok('...y está explicado por qué', /no vence/i.test(mig));
  ok('el cañón se guarda en MILÍMETROS', /largo_canon_mm/.test(mig));
  ok('...y advierte de no convertir a pulgadas', /No convertir a pulgadas/.test(mig));
}

/* ── EL NÚMERO DE ARMAS SE CUENTA, NO SE TECLEA ─────────────────────────── */
{
  ok('hay una función que las cuenta', /armas_registradas_cliente/.test(mig));
  /* least(3, ...) es el art. 72: registrar una cuarta tarjeta NO puede subir
     el tope de munición por encima de lo que la ley permite. */
  ok('el conteo topa en 3 (art. 72)', /least\(3, count\(\*\)::int\)/.test(mig));
  ok('sólo cuenta las ACTIVAS', /where cliente_id = p_cliente and activa/.test(mig));
  ok('la pantalla sincroniza el campo desde las tenencias',
     /_sincronizarArmasRegistradas/.test(srcCli));
  /* Si no hay tenencias cargadas no se toca el campo: un comercio que aún no
     las registró no debe quedarse en 0 y perder el tope que su cliente tiene. */
  ok('sin tenencias cargadas NO pisa el valor puesto a mano',
     /if \(!activas\) return;/.test(srcCli));
  ok('y también topa en 3 en la pantalla', /Math\.min\(3, activas\)/.test(srcCli));
}

/* ── Una serie repetida contaría el arma dos veces ──────────────────────── */
{
  ok('el número de serie es único por comercio', /uq_tenencia_serie/.test(mig));
  /* Parcial: durante una captura a medias la serie puede faltar, y dos
     tenencias sin serie no son un duplicado. */
  ok('...pero permite varias sin número de serie',
     /where numero_serie is not null and numero_serie <> ''/.test(mig));
  ok('la pantalla exige el número de serie', /es obligatorio/.test(srcCli));
  ok('...y explica el choque en castellano, no con el error de Postgres',
     /Ya hay una tenencia registrada con el número de serie/.test(srcCli));
}

/* ── Dar de baja, no borrar ─────────────────────────────────────────────── */
{
  ok('existe el estado activa', /activa: document\.getElementById\('ten-activa'\)/.test(srcCli));
  /* Borrar pierde el rastro de un arma que el cliente TUVO; darla de baja lo
     conserva y la saca del conteo, que es lo que importa para la munición. */
  ok('al borrar sugiere dar de BAJA en su lugar', /es mejor darla de BAJA/.test(srcCli));
  ok('las inactivas se ven distintas en la lista', /opacity:\.55/.test(srcCli));
}

/* ── Aislamiento y permisos, como manda la auditoría ────────────────────── */
{
  ok('RLS activo', /enable row level security/.test(mig));
  ok('política por tenant', /tenant_id = current_tenant_id\(\) or is_superadmin\(\)/.test(mig));
  ok('GRANT a authenticated', /grant select, insert, update, delete on public\.cliente_tenencias to authenticated/.test(mig));
  ok('NUNCA a anon', !/to anon/.test(mig));
  ok('las tenencias mueren con el cliente', /references public\.clientes\(id\) on delete cascade/.test(mig));
}

/* ── Las funciones de datos existen ─────────────────────────────────────── */
{
  ['getTenencias', 'guardarTenencia', 'eliminarTenencia']
    .forEach(f => ok(`DB.${f}`, new RegExp(`async ${f}\\(`).test(srcDB)));
  ok('siempre filtra por tenant', /from\('cliente_tenencias'\)[\s\S]{0,120}eq\('tenant_id', getTID\(\)\)/.test(srcDB));
  ok('la pantalla dibuja la lista', typeof C.renderTenencias === 'function');
  ok('y el formulario', typeof C.modalTenencia === 'function');
}

/* ── Se distingue de la licencia ────────────────────────────────────────── */
{
  /* Confundirlas es el error probable: son dos documentos con dos vidas. */
  ok('la pantalla explica la diferencia con la licencia',
     /La <b>licencia<\/b> es del titular y vence/.test(srcCli));
  ok('...y que la tenencia no vence', /la <b>tenencia<\/b> es de cada arma y <b>no vence<\/b>/.test(srcCli));
  ok('el formulario recuerda que el cañón va en mm', /largo del cañón va en milímetros<\/b>/.test(srcCli));
  ok('...con los ejemplos de las tarjetas reales', /102 mm[\s\S]{0,40}530 mm/.test(srcCli));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
