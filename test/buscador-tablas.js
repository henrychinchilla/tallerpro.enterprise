/* El buscador que se inyecta solo sobre las tablas de todos los módulos.

   Lo que puede salir mal no es que no encuentre — es que ESCONDA. Una fila
   que el filtro deja en display:none sin que nadie la busque es un registro
   que para el taller dejó de existir. Por eso se prueba sobre todo que al
   limpiar la caja vuelva TODO, y que la fila de "sin registros" no se quede
   pegada mintiendo que la lista está vacía. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

/* js/core/app.js corre `window.Modulos = {}` y luego usa `Modulos` pelado:
   el contexto tiene que ser su propio window para que esa global exista. */
function cargarApp() {
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date,
    MutationObserver: function () { this.observe = () => {}; },
    document: { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    navigator: {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'app.js'), 'utf8'), ctx);
  return vm.runInContext('App', ctx);
}

/* Doble de una fila: sólo lo que el filtro toca. */
const fila = (texto, opts = {}) => ({ textContent: texto, dataset: opts.vacia ? { sinFiltro: '1' } : {}, style: {} });
const visibles = filas => filas.filter(f => f.style.display !== 'none').map(f => f.textContent);

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const App = cargarApp();

/* ── Normalización ──────────────────────────────────────────────────────── */
ok('ignora mayúsculas', App._normalizarBusqueda('MÓVIL') === App._normalizarBusqueda('móvil'));
ok('ignora tildes: "movil" tiene que encontrar "Móvil"', App._normalizarBusqueda('Móvil') === 'movil');
/* La ñ también se dobla a n. Es a propósito: en el taller se escribe sin
   tildes y sin ñ, y un buscador que exige teclear "cañón" no sirve. El precio
   es que "peña" también saca "pena", que en una caja de búsqueda no molesta. */
ok('la ñ se dobla: buscar "canon" encuentra "cañón"',
   App._normalizarBusqueda('Cañón').includes(App._normalizarBusqueda('canon')));
ok('null no revienta', App._normalizarBusqueda(null) === '');

/* ── Filtrado ───────────────────────────────────────────────────────────── */
{
  const filas = [fila('P0300 Nissan Rogue 2017'), fila('P0171 Montero 2004'), fila('Toyota Hilux 2019')];
  ok('caja vacía = se ve todo', App._filtrarFilas(filas, '') === 3 && visibles(filas).length === 3);

  App._filtrarFilas(filas, 'montero');
  ok('filtra por texto de cualquier columna', visibles(filas).join() === 'P0171 Montero 2004');

  App._filtrarFilas(filas, 'nissan 2017');
  ok('dos palabras = las dos tienen que estar', visibles(filas).join() === 'P0300 Nissan Rogue 2017');

  App._filtrarFilas(filas, 'nissan 2004');
  ok('dos palabras de filas distintas no arman una coincidencia', visibles(filas).length === 0);

  ok('sin coincidencias devuelve 0', App._filtrarFilas(filas, 'zzz') === 0);

  /* El caso que importa: nada se queda escondido al limpiar. */
  App._filtrarFilas(filas, '');
  ok('limpiar la búsqueda devuelve TODAS las filas', visibles(filas).length === 3);

  App._filtrarFilas(filas, '   ');
  ok('sólo espacios se trata como vacío, no esconde nada', visibles(filas).length === 3);
}

/* ── Acentos de verdad, como vienen de la BD ────────────────────────────── */
{
  const filas = [fila('Bujías de encendido'), fila('Filtro de aire')];
  App._filtrarFilas(filas, 'bujias');
  ok('busca sin tildes y encuentra con tildes', visibles(filas).join() === 'Bujías de encendido');
  App._filtrarFilas(filas, 'BUJÍAS');
  ok('y al revés también', visibles(filas).join() === 'Bujías de encendido');
}

/* ── La fila de "Sin registros" ─────────────────────────────────────────── */
{
  const filas = [fila('Sin registros', { vacia: true })];
  App._filtrarFilas(filas, 'algo');
  ok('mientras se busca, "Sin registros" se esconde', visibles(filas).length === 0);
  ok('y no cuenta como resultado', App._filtrarFilas(filas, 'algo') === 0);
  App._filtrarFilas(filas, '');
  ok('al limpiar vuelve (si no, la lista se ve vacía sin estarlo)', visibles(filas).length === 1);
}

/* ── Umbral: listas de 1-2 filas no llevan buscador ─────────────────────── */
ok('el mínimo de filas es explícito', App._MIN_FILAS_BUSCADOR === 3);

/* ── El filtro no sobrevive al cambio de módulo ─────────────────────────── */
{
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'app.js'), 'utf8');
  ok('navegarA limpia lo buscado (si no, se entra a otro módulo ya filtrado)',
     /App\.paginaActual = pagina;[\s\S]{0,200}App\._busquedaTabla = \{\}/.test(fuente));
  ok('el buscador se cuelga del observador de render que ya existía',
     /_initRenderHooks[\s\S]{0,300}_ponerBuscadores\(\)/.test(fuente));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
