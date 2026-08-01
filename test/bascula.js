/* Lectura de báscula digital.

   En granos la venta ES el peso, así que un error acá se cobra mal. Dos cosas
   se prueban en serio:

   1. INTERPRETAR LA TRAMA. Cada fabricante la arma distinto y llega cortada
      por el puerto. Si se lee mal, se factura mal.
   2. NO TOMAR UN PESO INESTABLE. Mientras el grano se acomoda la báscula
      oscila; tomar ese número es pesar de menos o de más. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, Math, navigator: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'bascula.js'), 'utf8'), ctx);
const B = ctx.Bascula;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── Tramas de básculas reales ──────────────────────────────────────────── */
{
  const t = B.parsear('ST,GS,+  12.345kg');
  ok('Toledo/CAS: lee el peso', t && t.peso === 12.345);
  ok('...y la unidad', t.unidad === 'kg');
  ok('...y que la báscula lo declara estable', t.estable === true);

  const inest = B.parsear('US,GS,+   8.100kg');
  ok('US se entiende como inestable', inest.estable === false);

  const lb = B.parsear('ST,NT,-   1.20 lb');
  ok('lee libras', lb.unidad === 'lb');
  ok('y el signo negativo (tara)', lb.peso === -1.2);

  ok('sólo el número también sirve', B.parsear('12.345').peso === 12.345);
  ok('con signo y ceros a la izquierda', B.parsear('+00012.34 kg').peso === 12.34);
  ok('coma decimal (básculas en formato europeo)', B.parsear('7,250 kg').peso === 7.25);
  ok('gramos se distingue de kilos', B.parsear('850 g').unidad === 'g');

  /* Entre pesada y pesada llegan encabezados y basura: no puede tomarse como
     peso cero, porque cero es una venta valida y esto no lo es. */
  ok('una línea sin número no es una lectura', B.parsear('CAS ---- READY') === null);
  ok('la línea vacía tampoco', B.parsear('') === null);
  ok('null no revienta', B.parsear(null) === null);

  ok('guarda la trama cruda para poder diagnosticar', /12.345kg/.test(t.crudo));
}

/* ── No tomar un peso que todavía se mueve ──────────────────────────────── */
{
  B._estables = [];
  ok('si la báscula dice ST, se confirma de una', B._confirmar({ peso: 10, estable: true }) === true);

  B._estables = [];
  ok('si dice US, no se confirma', B._confirmar({ peso: 10, estable: false }) === false);

  /* Bascula muda: hay que ver el mismo numero repetido. */
  B._estables = [];
  ok('primera lectura suelta no alcanza', B._confirmar({ peso: 12.5, estable: null }) === false);
  ok('segunda tampoco', B._confirmar({ peso: 12.5, estable: null }) === false);
  ok('a la tercera igual, ya se confirma', B._confirmar({ peso: 12.5, estable: null }) === true);

  B._estables = [];
  B._confirmar({ peso: 12.5, estable: null });
  B._confirmar({ peso: 12.6, estable: null });
  ok('si el número cambia, no se confirma', B._confirmar({ peso: 12.7, estable: null }) === false);

  /* Un US en medio tiene que borrar lo acumulado: si no, se confirmaria un
     peso viejo apenas la bascula se calme un instante. */
  B._estables = [];
  B._confirmar({ peso: 12.5, estable: null });
  B._confirmar({ peso: 12.5, estable: null });
  B._confirmar({ peso: 12.5, estable: false });
  ok('un aviso de inestable borra lo acumulado', B._confirmar({ peso: 12.5, estable: null }) === false);
}

/* ── Convertir a la unidad de la venta ──────────────────────────────────── */
{
  ok('45.359 kg son 1 quintal', B.aUnidad({ peso: 45.359237, unidad: 'kg' }, 'quintal') === 1);
  ok('100 libras también son 1 quintal', B.aUnidad({ peso: 100, unidad: 'lb' }, 'quintal') === 1);
  ok('1 kg son 2.205 libras', B.aUnidad({ peso: 1, unidad: 'kg' }, 'lb') === 2.205);
  ok('850 g son 0.85 kg', B.aUnidad({ peso: 850, unidad: 'g' }, 'kg') === 0.85);
  ok('redondea a milésimas, como el POS', B.aUnidad({ peso: 1.23456, unidad: 'kg' }, 'kg') === 1.235);

  /* La bascula da masa: pedirle metros no tiene respuesta, y devolver un
     numero seria inventarlo. */
  ok('no convierte masa a metro lineal', B.aUnidad({ peso: 10, unidad: 'kg' }, 'metro lineal') === null);
  ok('ni a "pieza"', B.aUnidad({ peso: 10, unidad: 'kg' }, 'pieza') === null);
  ok('sin lectura devuelve null', B.aUnidad(null, 'kg') === null);
}

/* ── Sin soporte del navegador se avisa, no se rompe ────────────────────── */
{
  ok('sin Web Serial, disponible() es false', B.disponible() === false);
  B.conectar().then(r => {
    ok('conectar avisa con un mensaje entendible', r.ok === false && /Chrome|mano/i.test(r.error));
    console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
    if (fallidas) process.exitCode = 1;
  });
}
