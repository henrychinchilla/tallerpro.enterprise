/* El texto de la Ley de Armas y Municiones que la app muestra y del que saca
   sus topes.

   Lo que puede doler acá no es un bug de pantalla: es que la app le diga a un
   armero un requisito legal equivocado. El negocio se juega el cierre del
   establecimiento (art. 58) o una pena de prisión, así que las cifras que el
   sistema aplica tienen que coincidir con el texto literal del decreto —
   estas pruebas comparan una contra la otra en vez de confiar en que quien
   escribió el código copió bien. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'ley-armas.js'), 'utf8'), ctx);
const { LEY_ARMAS, topeMunicionMensual, buscarLeyArmas } = ctx;
ctx.articulosLeyArmas = ctx.articulosLeyArmas || ctx.window.articulosLeyArmas;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const art = (n) => LEY_ARMAS.articulos.find(a => a.num === n);

/* ── Integridad del catálogo ─────────────────────────────────────────────── */
ok('es el Decreto 15-2009', LEY_ARMAS.decreto.includes('15-2009'));
ok('cada artículo tiene número, título, tema y texto',
   LEY_ARMAS.articulos.every(a => a.num && a.titulo && a.tema && a.texto));
ok('no hay artículos repetidos',
   new Set(LEY_ARMAS.articulos.map(a => a.num)).size === LEY_ARMAS.articulos.length);
ok('todos los temas usados están declarados',
   LEY_ARMAS.articulos.every(a => LEY_ARMAS.temas[a.tema]));
ok('ningún texto quedó truncado a media palabra del PDF',
   LEY_ARMAS.articulos.every(a => a.texto.trim().length > 80));

/* ── Los topes que la app aplica salen del texto, no de memoria ──────────
   Art. 60: "hasta doscientas cincuenta (250) unidades de munición por cada
   una de las armas debidamente registradas en su licencia de portación o
   doscientas (200) unidades con su registro de tenencia". */
{
  const a60 = art(60);
  ok('el art. 60 está incluido', !!a60);
  ok('el texto del art. 60 dice 250 por cada arma de la licencia de portación',
     /doscientas cincuenta \(250\) unidades de munición por cada una de las armas/.test(a60.texto));
  ok('...y 200 con registro de tenencia', /doscientas \(200\) unidades con su registro de tenencia/.test(a60.texto));
  ok('la función respeta el 250 por arma', topeMunicionMensual('portación', 2) === 500);
  ok('la función respeta el 200 de tenencia', topeMunicionMensual('tenencia') === 200);

  /* Art. 72: "La licencia puede cubrir y amparar hasta tres (3) armas". */
  ok('el art. 72 dice que la licencia ampara hasta 3 armas',
     /hasta tres \(3\) armas/.test(art(72).texto));
  ok('la función no pasa de 3 armas aunque le pidan más', topeMunicionMensual('portación', 99) === 750);

  ok('el art. 60 prohíbe el traspaso de municiones entre particulares',
     /prohibida cualquier transferencia de dominio de municiones entre particulares/i.test(a60.texto));
  ok('el art. 60 exige NIT y dirección en la factura',
     /número de identificación tributaria -NIT-/.test(a60.texto) && /su dirección/.test(a60.texto));
}

/* ── El plazo de DIGECAM que el módulo modela como estados ───────────────── */
{
  const a59 = art(59);
  ok('el art. 59 fija el plazo de 5 días hábiles de DIGECAM',
     /no mayor de cinco \(5\) días hábiles/.test(a59.texto));
  ok('el art. 59 dice que el vendedor remite documentación y arma a DIGECAM',
     /El vendedor remitirá esta documentación y el arma a la DIGECAM/.test(a59.texto));
}

/* ── La distinción legal que el módulo advierte ──────────────────────────
   "Armería" en esta ley es el taller de REPARACIÓN (art. 85) y tiene
   PROHIBIDO vender (art. 88). Vender es otra licencia (arts. 55-56). Si esto
   se pierde, el módulo estaría diciéndole a un negocio que opere con la
   licencia equivocada. */
{
  ok('el art. 85 define armería como reparación y servicio',
     /se dediquen a la reparación y servicio de armas de fuego/.test(art(85).texto));
  ok('el art. 88 prohíbe a las armerías hacer compraventa',
     /no están autorizadas para efectuar compraventas de armas/.test(art(88).texto));
  ok('el art. 55 es el de la licencia de compraventa',
     /deseen dedicarse a la compraventa de armas de fuego y municiones/.test(art(55).texto));
}

/* ── Inventario exacto: el motivo de la trazabilidad ─────────────────────── */
ok('el art. 58 exige inventario exacto y castiga la diferencia con cierre',
   /deberá ser exacto/.test(art(58).texto) && /cierre temporal del establecimiento/.test(art(58).texto));

/* ── Prohibiciones que el módulo cita al validar ─────────────────────────── */
ok('el art. 82 prohíbe armas sin número de registro o alterado',
   /sin número de registro o registro borrado, alterado o tachado/.test(art(82).texto));

/* ── Reglamento (Acuerdo Gubernativo 85-2011) ────────────────────────────
   La ley delega en el reglamento las obligaciones del día a día. El art. 21
   es el más importante del módulo entero: obliga a verificar el cupo de
   munición EN EL SISTEMA DE DIGECAM antes de cada venta, no en los propios
   registros — porque el cliente pudo comprar en otra armería. */
{
  const reg = (n) => LEY_ARMAS.articulosReglamento.find(a => a.num === n);
  ok('el reglamento está incluido', Array.isArray(LEY_ARMAS.articulosReglamento) && LEY_ARMAS.articulosReglamento.length > 0);
  ok('todos los artículos del reglamento se marcan como tales',
     LEY_ARMAS.articulosReglamento.every(a => a.reglamento === true));
  ok('los de la ley NO se marcan como reglamento',
     LEY_ARMAS.articulos.every(a => !a.reglamento));

  const a21 = reg(21);
  ok('incluye el art. 21 del reglamento', !!a21);
  ok('el art. 21 manda verificar EN LÍNEA con DIGECAM antes de cada venta',
     /previo a cada venta/.test(a21.texto) && /sistema en línea con DIGECAM/.test(a21.texto));
  ok('...y obtener un código de autorización', /código de autorización de venta/.test(a21.texto));
  ok('...que debe anotarse en la factura', /anotarse en la factura de venta/.test(a21.texto));

  ok('el art. 20 exige conexión TODOS LOS DÍAS al sistema de DIGECAM',
     /todos los días conectados en línea/.test(reg(20).texto));
  ok('el art. 22 lista las medidas de seguridad físicas del local',
     /caja fuerte o bóveda/i.test(reg(22).texto) && /extinguidor/i.test(reg(22).texto));
  ok('el art. 23 explica el permiso especial para más munición',
     /permiso especial/i.test(reg(23).texto));
  ok('el art. 17 fija la vigencia de la licencia en 5 años',
     /vigencia de cinco \(5\) años/.test(reg(17).texto));

  /* Ley y reglamento se consultan juntos pero sin confundirse: son
     numeraciones distintas y un "art. 21" no significa lo mismo en cada uno. */
  const todos = ctx.articulosLeyArmas();
  ok('la consulta combina ley y reglamento',
     todos.length === LEY_ARMAS.articulos.length + LEY_ARMAS.articulosReglamento.length);
  ok('cada artículo sabe de qué fuente viene',
     todos.every(a => a.fuente === 'ley' || a.fuente === 'reglamento'));
  ok('buscar "21" trae el del reglamento sin borrar los de la ley',
     buscarLeyArmas('21').some(a => a.num === 21 && a.reglamento));
}

/* ── Buscador ────────────────────────────────────────────────────────────── */
{
  ok('buscar "60" encuentra el artículo 60', buscarLeyArmas('60').some(a => a.num === 60));
  ok('buscar "munición" encuentra el art. 60', buscarLeyArmas('munición').some(a => a.num === 60));
  ok('buscar por título funciona', buscarLeyArmas('Portación').some(a => a.num === 70));
  ok('sin búsqueda devuelve todo (ley + reglamento)',
     buscarLeyArmas('').length === LEY_ARMAS.articulos.length + LEY_ARMAS.articulosReglamento.length);
  ok('una búsqueda sin resultados devuelve lista vacía, no revienta',
     Array.isArray(buscarLeyArmas('zzzzz-no-existe')) && buscarLeyArmas('zzzzz-no-existe').length === 0);
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
