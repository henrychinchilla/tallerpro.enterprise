/* Inventario ya no muestra TODOS los giros del comercio a cualquier rol.

   El riesgo real: un taller que además activó Armería (multi-negocio) tenía
   el inventario de armas visible para CUALQUIER rol con `inventario:true` —
   incluido un mecánico, que no tiene por qué ver ni tocar esa mercancía.
   giroVisible() (config.js) + Inventario._girosVisibles() cierran eso
   reusando el mismo puedeAccion() que ya decide el menú lateral, no una
   regla nueva. Se prueba con config.js real cargado (no un mock de
   PERMISOS) para no divergir de lo que el menú realmente permite. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);

const ctx = {
  console,
  Modulos: {},
  UI: { esc: v => String(v ?? ''), q: v => 'Q' + v },
  DB: {},
  Auth: { user: { rol: 'mecanico' }, tenant: { modulos_activos: ['ordenes', 'armeria'], plan: 'medida', active: true } },
  document: { getElementById: () => null, querySelectorAll: () => [] },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'core', 'giros.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'core', 'config.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'modulos', 'operacion', 'inventario.js'), 'utf8'), ctx);
const INV = ctx.Modulos.inventario;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* Tenant multi-negocio: taller + armería activos a la vez. */
ok('el tenant sí tiene ambos giros activos (mecanico y armeria)',
   INV._giros().includes('mecanico') && INV._giros().includes('armeria'));

/* ── Rol mecánico: ve su giro, NO ve armería ────────────────────────────── */
ctx.Auth.user.rol = 'mecanico';
ok('mecánico ve el giro mecánico', INV._girosVisibles().includes('mecanico'));
ok('mecánico NO ve el giro armería', !INV._girosVisibles().includes('armeria'));

{
  INV._data = [];
  const data = [
    { id: 'a1', tipo_item: 'mecanico', nombre: 'Filtro de aceite' },
    { id: 'a2', tipo_item: 'armeria', nombre: 'Pistola Glock 19' },
  ];
  const visibles = INV._girosVisibles();
  const filtrado = data.filter(i => visibles.includes(INV._giroDe(i)));
  ok('el filtro real (no solo visual) saca el artículo de armería del arreglo',
     filtrado.length === 1 && filtrado[0].id === 'a1');
}

{
  let html = '';
  ctx.UI.modal = (t, h) => { html = h; };
  ctx.puedeVerCosto = () => true;
  INV._proveedores = []; INV._bodegas = []; INV._img = ''; INV._data = [];
  /* Intento directo de forzar el giro vedado (ej. alguien arma la llamada a
     mano) — no debe quedarse en armería. */
  INV.modalForm(null, 'armeria');
  ok('mecánico no puede abrir el formulario en el giro armería aunque se lo fuercen',
     !/value="armeria" selected/.test(html));
  ok('el selector de tipo de artículo tampoco ofrece armería como opción',
     !/>.*[Aa]rmería<\/option>/.test(html));
}

/* ── Rol admin: ve todo ──────────────────────────────────────────────────── */
ctx.Auth.user.rol = 'admin';
ok('admin sí ve el giro armería', INV._girosVisibles().includes('armeria'));
ok('admin sí ve el giro mecánico', INV._girosVisibles().includes('mecanico'));

{
  let html = '';
  ctx.UI.modal = (t, h) => { html = h; };
  INV.modalForm(null, 'armeria');
  ok('admin sí puede abrir el formulario en el giro armería', /value="armeria" selected/.test(html));
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
