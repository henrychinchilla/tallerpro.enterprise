/* El trámite de importación de armas: DIGECAM **y** SAT.

   Lo pidió Henry, que además preguntó si era con la SAT o con la DIGECAM. Son
   LAS DOS, y esa es la confusión que esto tiene que dejar resuelta:
     · DIGECAM autoriza (licencia de importación), toma huellas balísticas,
       emite tarjetas de tenencia y TROQUELA con las letras GUA (art. 35).
     · SAT cobra aranceles y custodia en el almacén fiscal (arts. 44 a 46).
   Sin licencia de DIGECAM la SAT no desalmacena; sin pagar aranceles la
   DIGECAM no recibe nada (art. 43).

   La ley reparte esto en once artículos de tres capítulos distintos, así que
   lo que se prueba acá no es sólo que los artículos existan, sino que los
   PASOS estén completos, en orden, y que cada uno cite el artículo que lo
   respalda — un paso sin respaldo es una invención con apariencia de trámite. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ctx = { console, Math, Date, JSON, String, Number, Object, Array, RegExp };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'js', 'core', 'ley-armas.js'), 'utf8'), ctx);
const { LEY_ARMAS, PASOS_IMPORTACION, pasosImportacion, buscarLeyArmas } = ctx;

const srcArm = fs.readFileSync(path.join(raiz, 'js', 'modulos', 'especializados', 'armeria.js'), 'utf8');
const srcIA  = fs.readFileSync(path.join(raiz, 'supabase', 'functions', 'ai-assistant', 'index.ts'), 'utf8');

const art = n => LEY_ARMAS.articulos.find(a => a.num === n);

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── Los artículos del capítulo de importación ──────────────────────────── */
{
  [32, 33, 34, 35, 37, 38, 39, 43, 44, 45, 46, 47]
    .forEach(n => ok(`está el artículo ${n}`, !!art(n)));
  ok('todos van marcados como tema importación',
     [32, 33, 34, 35, 37, 38, 39, 43, 44, 45, 46, 47].every(n => art(n).tema === 'importacion'));
  ok('el tema está declarado en el catálogo', !!LEY_ARMAS.temas.importacion);
}

/* ── EL TROQUELADO: las letras GUA (art. 35) ────────────────────────────── */
{
  const a = art(35);
  ok('el art. 35 es el del troquelado', /marcadas por la DIGECAM con las letras GUA/.test(a.texto));
  ok('...y dice que es a costo del importador', /a costo del importador/.test(a.texto));
  ok('...y que antes se toman huellas balísticas', /huellas balísticas/.test(a.texto));
  ok('...y que se emite tarjeta de tenencia a nombre del importador',
     /tarjetas de tenencia a nombre del importador/.test(a.texto));
  /* Sólo se troquela lo que se va a comercializar: una importación para uso
     personal no lleva GUA, y confundirlo haría prometer un paso que no toca. */
  ok('el GUA es sólo para las que se comercializan',
     /propósito de ser comercializadas/.test(a.texto));
}

/* ── Qué necesita licencia y qué no (arts. 37 y 38) ─────────────────────── */
{
  ok('los accesorios NO necesitan licencia', /sin necesidad de licencia/.test(art(37).texto));
  ok('...e incluye repuestos, miras y cargadores',
     /Accesorios y repuestos/.test(art(37).texto) &&
     /Sistemas de puntería/.test(art(37).texto) &&
     /Tolvas, cargadores/.test(art(37).texto));
  ok('los componentes específicos SÍ la necesitan',
     /deberá contar con la licencia de importación/.test(art(38).texto));
  ok('...y son cañones, marcos y cajones de mecanismos',
     /Cañones/.test(art(38).texto) && /Marcos/.test(art(38).texto) &&
     /Cajones de mecanismos/.test(art(38).texto));
}

/* ── La SAT y el almacén fiscal ─────────────────────────────────────────── */
{
  ok('el transportista avisa a DIGECAM Y a la SAT al arribo',
     /DIGECAM y Superintendencia de Administración Tributaria/.test(art(44).texto));
  ok('la mercadería se marchama en el almacén fiscal', /marchamado/.test(art(45).texto));
  ok('el plazo es de OCHO días hábiles', /ocho \(8\) días hábiles/.test(art(46).texto));
  ok('vencido el plazo pasa a la DIGECAM', /trasladarse a la DIGECAM/.test(art(46).texto));
  ok('el desalmacenaje exige la licencia Y el pago de aranceles',
     /licencia de importación/.test(art(43).texto) && /pagos arancelarios/.test(art(43).texto));
  ok('el traslado va bajo custodia y lo paga el importador',
     /custodiado por el personal de seguridad de la DIGECAM/.test(art(47).texto) &&
     /serán cubiertos por el importador/.test(art(47).texto));
}

/* ── El 2% en repuestos (art. 39) ───────────────────────────────────────── */
{
  ok('quien vende al público debe incluir 2% en repuestos',
     /dos por ciento \(2%\)/.test(art(39).texto));
  ok('...en CADA pedido, no una vez al año', /en cada pedido/.test(art(39).texto));
}

/* ── Las armas de excepción llevan al Ministerio de la Defensa ──────────── */
{
  ok('las automáticas van por establecimiento autorizado',
     /por medio de un establecimiento debidamente autorizado/.test(art(33).texto));
  ok('...y exigen dictamen del Ministerio de la Defensa Nacional',
     /Ministerio de la Defensa Nacional/.test(art(33).texto));
}

/* ── LOS PASOS: completos, en orden y con respaldo ──────────────────────── */
{
  const p = pasosImportacion();
  ok('hay pasos', p.length >= 10);
  ok('están numerados en orden sin saltos',
     p.every((x, i) => x.n === i + 1));
  ok('cada paso cita al menos un artículo',
     p.every(x => Array.isArray(x.arts) && x.arts.length > 0));
  /* Un paso que cita un artículo inexistente es peor que uno sin cita: da
     confianza falsa. */
  ok('todos los artículos citados existen de verdad',
     p.every(x => x.arts.every(n => !!art(n))));
  ok('cada paso dice de quién es el trámite',
     p.every(x => /DIGECAM|SAT/.test(x.entidad)));
  ok('cada paso tiene título y detalle', p.every(x => x.titulo && x.detalle));

  const entidades = new Set(p.map(x => x.entidad));
  ok('aparecen las DOS entidades',
     [...entidades].some(e => e.includes('DIGECAM')) && [...entidades].some(e => e.includes('SAT')));

  /* El orden que importa: el troquelado es lo ÚLTIMO, después de aduana.
     Ponerlo antes haría creer que se puede vender apenas llega el contenedor. */
  /* Se busca por el ARTÍCULO, no por texto: /GUA/i también hacía juego con
     "guarda" del paso del almacén fiscal y daba por troquelado el paso 7. */
  const troquelado = p.find(x => x.arts.includes(35));
  const aduana = p.find(x => x.arts.includes(46));
  ok('el troquelado aparece como paso', !!troquelado);
  ok('el troquelado va DESPUÉS del almacén fiscal', troquelado.n > aduana.n);
  ok('el último paso deja claro que hasta ahí no se puede vender',
     /no se puede vender/i.test(p[p.length - 1].detalle));

  /* La licencia se pide ANTES de que llegue la mercadería: pedirla después
     es justo lo que deja el contenedor varado en el almacén fiscal. */
  const licencia = p.find(x => x.arts.includes(34));
  ok('la licencia se tramita antes del arribo', licencia.n < aduana.n);
}

/* ── La ley se puede consultar por importación ──────────────────────────── */
{
  ok('buscar "importación" trae artículos',
     buscarLeyArmas('importación').length >= 5);
  ok('buscar por número trae el artículo del troquelado',
     buscarLeyArmas('35').some(a => a.num === 35));
  ok('buscar "GUA" encuentra el troquelado',
     buscarLeyArmas('letras GUA').some(a => a.num === 35));
}

/* ── La pantalla ────────────────────────────────────────────────────────── */
{
  ok('hay botón para ver el trámite', /modalImportacion\(\)/.test(srcArm));
  ok('la pantalla aclara que son DOS entidades', /Son DOS entidades, no una/.test(srcArm));
  /* Los formularios y tasas los fija la DIGECAM y cambian sin que cambie la
     ley: prometer que esto es el trámite oficial sería mentir. */
  ok('advierte que no reemplaza al trámite oficial', /no reemplaza al trámite oficial/.test(srcArm));
  ok('manda a verificar en digecam.mil.gt', /digecam\.mil\.gt/.test(srcArm));
}

/* ── Nexus ya no repite el tope viejo de munición ───────────────────────── */
{
  /* Venía del reportaje de prensa que el texto oficial desmintió: decía
     "250 al mes" a secas cuando el art. 60 dice 250 POR ARMA. */
  ok('la persona de armería ya no cita el reportaje de prensa',
     !/Prensa Libre/.test(srcIA));
  ok('dice que el 250 es POR ARMA REGISTRADA', /250 al mes POR ARMA REGISTRADA/.test(srcIA));
  ok('menciona el tope real de 750 con portación', /750/.test(srcIA));
  ok('advierte que la cuota es nacional', /cuota es NACIONAL/.test(srcIA));
  ok('conoce el troquelado con GUA', /letras GUA/.test(srcIA));
  ok('sabe que la SAT interviene en la aduana', /SAT interviene en la aduana/.test(srcIA));
  /* No hay registro oficial guatemalteco de especificaciones: si Nexus las
     busca, tiene que citar de dónde las sacó. */
  ok('debe citar la fuente al dar características de un arma',
     /CITA la fuente/.test(srcIA));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
