/* POS con cantidades decimales y catálogo por giro.

   Acá el error se paga en plata todos los días: con parseInt, vender "12.5
   quintales" cobraba 12 y el comercio regalaba medio quintal en cada venta.
   Y al revés, una cola de coma flotante (0.1 + 0.2 = 0.30000000000000004) en
   la pantalla de cobro parece un sistema roto delante del cliente.

   También se cuida que el límite de stock siga mandando: vender más de lo que
   hay descuadra el inventario y el POS no puede permitirlo. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);

const avisos = [];
const ctx = {
  console,
  UI: { toast: (m, t) => avisos.push(m), q: (n) => 'Q' + Number(n).toFixed(2), esc: (v) => String(v ?? '') },
  DB: {}, Auth: { tenant: {}, user: {} },
  document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  setTimeout: (fn) => {}, addEventListener: () => {}, navigator: {},
  fidelizacionCfg: () => ({}),
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'core', 'giros.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'pos', 'pos.js'), 'utf8'), ctx);
/* `const POS` no se cuelga del contexto (solo lo hacen var y las funciones):
   se lee evaluando dentro del sandbox, igual que en la prueba de version. */
const POS = vm.runInContext('POS', ctx);
POS._pintarCart = () => {};
POS._pintarGrid = () => {};

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const carrito = (cant, stock) => { POS._cart = [{ id: 'x', nombre: 'Maíz blanco', precio: 202.5, cant, stock, unidad: 'quintal' }]; };

/* ── Cantidades con decimales ───────────────────────────────────────────── */
{
  carrito(1, 100);
  POS.setCant('x', '12.5');
  ok('se puede vender 12.5 quintales', POS._cart[0].cant === 12.5);

  POS.setCant('x', '3,75');
  ok('la coma también sirve (así se teclea acá)', POS._cart[0].cant === 3.75);

  POS.setCant('x', '0.001');
  ok('acepta hasta la milésima', POS._cart[0].cant === 0.001);

  POS.setCant('x', '1.23456');
  ok('redondea a milésimas, que es lo que guarda la base', POS._cart[0].cant === 1.235);
}

/* ── El límite de stock sigue mandando ──────────────────────────────────── */
{
  carrito(1, 10);
  avisos.length = 0;
  POS.setCant('x', '15');
  ok('no deja vender más de lo que hay', POS._cart[0].cant === 10);
  ok('y avisa por qué', avisos.some(a => /stock/i.test(a)));

  carrito(1, 10.5);
  POS.setCant('x', '10.5');
  ok('el tope también admite decimales', POS._cart[0].cant === 10.5);
}

/* ── Cantidad inválida o cero saca la línea ─────────────────────────────── */
{
  carrito(5, 100);
  POS.setCant('x', '0');
  ok('poner 0 quita la línea del carrito', POS._cart.length === 0);

  carrito(5, 100);
  POS.setCant('x', 'abc');
  ok('texto basura no deja una cantidad NaN en la venta', POS._cart.length === 0);

  carrito(5, 100);
  POS.setCant('x', '-3');
  ok('una cantidad negativa tampoco pasa', POS._cart.length === 0);
}

/* ── Los botones + y − no dejan colas de coma flotante ──────────────────── */
{
  carrito(0.1, 100);
  POS.cambiarCant('x', 0.2);
  ok('0.1 + 0.2 da 0.3 y no 0.30000000000000004', POS._cart[0].cant === 0.3);
}

/* ── Filtro por giro en el catálogo ─────────────────────────────────────── */
{
  POS._prod = [
    { id: '1', nombre: 'Maíz', tipo_item: 'granos', categoria: 'Maíz' },
    { id: '2', nombre: 'Filtro', tipo_item: 'mecanico', categoria: 'Filtros' },
  ];
  POS._busca = ''; POS._cat = ''; POS._giro = '';
  ok('sin filtro se ven los dos artículos', POS._filtrados().length === 2);

  POS._giro = 'granos';
  ok('filtrando por granos sólo queda el maíz',
     POS._filtrados().length === 1 && POS._filtrados()[0].nombre === 'Maíz');

  ok('el comercio con dos giros ve las dos pastillas', POS._girosPOS().length === 2);

  /* Un taller puro no tiene por qué llenarse de botones de filtro. */
  POS._prod = [{ id: '1', nombre: 'Filtro', tipo_item: 'mecanico' }];
  ok('con un solo giro no se muestra ninguna pastilla', POS._girosPOS().length === 0);

  /* Un artículo sin clasificar no puede desaparecer del POS: es mercadería
     que existe y hay que poder venderla. */
  POS._prod = [{ id: '1', nombre: 'Algo', tipo_item: null }];
  POS._giro = '';
  ok('un artículo sin giro sigue apareciendo', POS._filtrados().length === 1);
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
