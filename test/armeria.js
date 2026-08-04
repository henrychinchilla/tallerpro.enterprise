/* Cumplimiento DIGECAM del módulo de armería, en código puro.

   Lo que de verdad puede doler acá: vender un arma sin número de serie o
   sin licencia del comprador no es un typo, es lo que la Ley de Armas y
   Municiones castiga. _validar() espeja los mismos checks que la migración
   109 pone en la base de datos, para que el error se vea claro en el
   formulario y no como un 23514 de Postgres. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, Modulos: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'modulos', 'especializados', 'armeria.js'), 'utf8'), ctx);
const ARM = ctx.Modulos.armeria;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const base = { tipo: 'venta', cliente_id: 'c1', categoria: 'accesorio', cantidad: 1, precio_unit: 50 };

/* ── Serie obligatoria en armas ──────────────────────────────────────── */
ok('una funda (accesorio) no exige número de serie', ARM._validar({ ...base }).ok);
ok('una pistola SIN serie se rechaza', ARM._validar({ ...base, categoria: 'pistola', numero_serie: '', contraparte_licencia_num: 'L1' }).ok === false);
ok('una pistola CON serie y licencia pasa', ARM._validar({ ...base, categoria: 'pistola', numero_serie: 'ABC123', contraparte_licencia_num: 'L1' }).ok);
ok('un rifle sin serie da el mensaje de DIGECAM, no uno genérico',
   /serie/i.test(ARM._validar({ ...base, categoria: 'rifle', contraparte_licencia_num: 'L1' }).error || ''));

/* ── Licencia obligatoria al VENDER arma o munición (no en accesorios) ── */
ok('vender munición sin licencia del comprador se rechaza',
   ARM._validar({ ...base, categoria: 'munición', contraparte_licencia_num: '' }).ok === false);
ok('vender munición CON licencia pasa', ARM._validar({ ...base, categoria: 'munición', contraparte_licencia_num: 'TEN-1' }).ok);
ok('vender un accesorio NO exige licencia (la ley no la pide)',
   ARM._validar({ ...base, categoria: 'accesorio', contraparte_licencia_num: '' }).ok);
ok('COMPRAR (no vender) munición a un proveedor no exige licencia del comprador',
   ARM._validar({ tipo: 'compra', proveedor_id: 'p1', categoria: 'munición', cantidad: 1, precio_unit: 10 }).ok);

/* ── Contraparte según tipo ──────────────────────────────────────────── */
ok('una venta sin cliente se rechaza', ARM._validar({ ...base, cliente_id: '' }).ok === false);
ok('una compra sin cliente NI proveedor se rechaza',
   ARM._validar({ tipo: 'compra', categoria: 'accesorio', cantidad: 1, precio_unit: 10 }).ok === false);
ok('una compra a un proveedor (sin cliente) es válida',
   ARM._validar({ tipo: 'compra', proveedor_id: 'p1', categoria: 'accesorio', cantidad: 1, precio_unit: 10 }).ok);

/* ── Cantidades ──────────────────────────────────────────────────────── */
ok('cantidad cero se rechaza', ARM._validar({ ...base, cantidad: 0 }).ok === false);
ok('precio negativo se rechaza', ARM._validar({ ...base, precio_unit: -1 }).ok === false);

/* ── Clasificación de qué es "arma" ──────────────────────────────────── */
ok('pistola, revólver, rifle y escopeta son armas',
   ['pistola', 'revólver', 'rifle', 'escopeta'].every(c => ARM._esArma(c)));
ok('munición y accesorio NO son armas', !ARM._esArma('munición') && !ARM._esArma('accesorio'));

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
