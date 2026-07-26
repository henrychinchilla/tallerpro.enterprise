/* Prueba de la aritmética de abonos de los módulos verticales.
   Ejecutar:  node tools/test-abonos.js
   Falla si la lógica de acumulación de anticipos se rompe. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* herreria.js define Modulos._especialOT (helper compartido por los 5 verticales) */
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'modulos', 'especializados', 'herreria.js'), 'utf8');
const sandbox = { Modulos: {}, UI: {}, DB: {}, document: undefined, window: {}, getSB: () => {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const calc = (t, p, m) => sandbox.Modulos._especialOT._calcAbono(t, p, m);

/* Primer abono del 50% */
let r = calc(1000, 0, 500);
assert.strictEqual(r.ok, true);
assert.strictEqual(r.acumulado, 500);
assert.strictEqual(r.saldo, 500);

/* EL BUG: el segundo abono debe SUMARSE, no reemplazar al primero.
   Antes quedaba anticipo=200 y saldo=800; lo correcto es 700 / 300. */
r = calc(1000, 500, 200);
assert.strictEqual(r.acumulado, 700);
assert.strictEqual(r.saldo, 300);

/* Abono final deja saldo exactamente en cero */
r = calc(1000, 700, 300);
assert.strictEqual(r.acumulado, 1000);
assert.strictEqual(r.saldo, 0);

/* No se puede abonar más que el saldo pendiente */
r = calc(1000, 700, 400);
assert.strictEqual(r.ok, false);
assert.match(r.error, /excede/);

/* Montos inválidos */
assert.strictEqual(calc(1000, 0, 0).ok, false);
assert.strictEqual(calc(1000, 0, -50).ok, false);

/* Centavos: tres abonos fraccionados no deben dejar saldo fantasma */
r = calc(100, 0, 33.33);
r = calc(100, r.acumulado, 33.33);
r = calc(100, r.acumulado, 33.34);
assert.strictEqual(r.acumulado, 100);
assert.strictEqual(r.saldo, 0);

/* Un total en 0 no admite abonos */
assert.strictEqual(calc(0, 0, 10).ok, false);

console.log('✓ abonos: acumulación, tope de saldo, centavos y validaciones OK');
