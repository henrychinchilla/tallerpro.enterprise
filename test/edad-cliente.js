/* Cálculo de la edad del cliente a partir de su fecha de nacimiento.

   La edad va en una declaración jurada que se firma ante notario. Si sale
   mal, el documento lleva un dato falso — y el error clásico es dividir los
   días entre 365.25, que se equivoca justo alrededor del cumpleaños (que es
   cuando la edad cambia y cuando más importa). Por eso acá se comparan mes
   y día, y por eso se prueban los bordes: el día antes, el día del, el día
   después, y el 29 de febrero. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = {
  console, Modulos: {}, UI: { esc: v => String(v ?? '') }, DB: {}, Docs: {}, NIT: {}, Auth: {},
  document: { getElementById: () => null, querySelector: () => null },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'modulos', 'operacion', 'clientes.js'), 'utf8'), ctx);
const CLI = ctx.Modulos.clientes;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const el = (y, m, d) => new Date(y, m - 1, d);

/* ── El cumpleaños ───────────────────────────────────────────────────────
   Nacido el 15 de junio de 1990, mirado desde 2026. */
ok('el día ANTES del cumpleaños todavía tiene 35', CLI.edadDe('1990-06-15', el(2026, 6, 14)) === 35);
ok('el DÍA del cumpleaños ya tiene 36',            CLI.edadDe('1990-06-15', el(2026, 6, 15)) === 36);
ok('el día DESPUÉS sigue con 36',                  CLI.edadDe('1990-06-15', el(2026, 6, 16)) === 36);

/* Un mes antes / un mes después, para descartar que sólo funcione en el día. */
ok('un mes antes del cumpleaños tiene 35', CLI.edadDe('1990-06-15', el(2026, 5, 15)) === 35);
ok('un mes después tiene 36',              CLI.edadDe('1990-06-15', el(2026, 7, 15)) === 36);

/* ── Bordes de fin y principio de año ────────────────────────────────────── */
ok('nacido el 31 de diciembre, el 30 de diciembre aún no cumple',
   CLI.edadDe('2000-12-31', el(2026, 12, 30)) === 25);
ok('nacido el 31 de diciembre, ese día cumple 26',
   CLI.edadDe('2000-12-31', el(2026, 12, 31)) === 26);
ok('nacido el 1 de enero, el 1 de enero cumple',
   CLI.edadDe('2000-01-01', el(2026, 1, 1)) === 26);

/* ── 29 de febrero — el caso que rompe los cálculos por división ─────────
   Nacido en año bisiesto; en años no bisiestos no existe su fecha exacta. */
ok('nacido el 29-feb, el 28-feb de un año no bisiesto aún NO cumplió',
   CLI.edadDe('2000-02-29', el(2026, 2, 28)) === 25);
ok('nacido el 29-feb, el 1-mar de un año no bisiesto ya cumplió',
   CLI.edadDe('2000-02-29', el(2026, 3, 1)) === 26);
ok('nacido el 29-feb, el 29-feb de un año bisiesto cumple',
   CLI.edadDe('2000-02-29', el(2024, 2, 29)) === 24);

/* ── La mayoría de edad, que es lo que se mira en el mostrador ──────────── */
ok('el día que cumple 18 ya es mayor de edad', CLI.edadDe('2008-08-04', el(2026, 8, 4)) === 18);
ok('el día anterior todavía tiene 17',         CLI.edadDe('2008-08-04', el(2026, 8, 3)) === 17);

/* ── Datos ausentes o inválidos: null, nunca un número inventado ────────── */
ok('sin fecha devuelve null', CLI.edadDe(null) === null);
ok('cadena vacía devuelve null', CLI.edadDe('') === null);
ok('una fecha basura devuelve null', CLI.edadDe('no-es-fecha') === null);
ok('el mismo día de nacer da 0, no null', CLI.edadDe('2026-08-04', el(2026, 8, 4)) === 0);

/* ── Zona horaria: la fecha viene de un <input type=date> como 'YYYY-MM-DD'.
   Sin fijar la hora, el navegador la interpreta en UTC y en Guatemala
   (UTC-6) el cliente "nace" el día anterior — restando un año entero justo
   en el cumpleaños. */
ok('una fecha ISO no se corre por zona horaria',
   CLI.edadDe('1990-06-15', el(2026, 6, 15)) === 36);

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
