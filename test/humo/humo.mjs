/* HUMO: abre CADA módulo en un navegador de verdad y falla si algo revienta.
   ═══════════════════════════════════════════════════════════════════════════

   POR QUÉ EXISTE. Todas las demás pruebas de este repo leen el código como
   TEXTO y le aplican expresiones regulares: nunca ejecutan una pantalla. Por
   eso podían decir "todo verde" mientras el POS no mostraba el total. Los
   últimos tres bugs que llegaron al usuario fueron exactamente eso:

     · UI.numero(...)        — la lista de granos moría al pintar la 1ª fila
     · UI.escUI.jsAttr(...)  — la pantalla de fórmulas reventaba entera
     · this._montosRapidos() — el POS dejaba de mostrar el TOTAL al agregar el
                               primer producto (con el carrito vacío se veía
                               bien, por eso costó tanto verlo)

   Ninguno es un error de sintaxis: `node --check` los da por buenos. Sólo
   aparecen al EJECUTAR. Esta prueba ejecuta.

   QUÉ VERIFICA en cada módulo:
     1. que no salte ningún error de JavaScript,
     2. que la pantalla no quede vacía,
     3. que no se cuele "undefined", "NaN" ni "[object Object]" en el texto
        visible — eso delata una cuenta o una plantilla rota.
   Y en el POS, además, LA MATEMÁTICA: agrega producto, cambia cantidad y
   comprueba que el total mostrado sea el número correcto.

   CÓMO SE USA:  npm run humo        (arranca el servidor local solo)
   Corre contra un comercio de PRUEBAS con su propio usuario y productos, así
   que jamás toca datos reales. Las credenciales van en test/humo/credenciales.json
   (fuera de git). Si el archivo no está, la prueba lo dice y no falla el deploy.
═══════════════════════════════════════════════════════════════════════════ */
import { abrirSesion, marcador, cerrar, BASE } from './ayuda.mjs';

/* Mismo recorrido, distinto tamaño de pantalla. En teléfono es donde se tapan
   las cosas: las categorías del POS sobre los productos, el total fuera de
   vista. `npm run humo:movil` corre esto en 390x844, que es un teléfono real. */
const MOVIL = process.env.HUMO_MOVIL === '1';
const viewport = MOVIL ? { width: 390, height: 844 } : { width: 1440, height: 900 };
console.log(MOVIL ? 'Pantalla de TELÉFONO (390x844)' : 'Pantalla de escritorio (1440x900)');

const sesion = await abrirSesion({ viewport });
if (!sesion) { console.log('⚠️  Sin credenciales o sin poder entrar — el humo no corre.'); process.exit(0); }
const { pagina, errores, CRED } = sesion;

const fallos = [];
const anotar = (modulo, motivo, detalle) => {
  fallos.push({ modulo, motivo, detalle });
  console.log(`FAIL — ${modulo}: ${motivo}`);
  if (detalle) console.log('        ↳ ' + String(detalle).replace(/\s+/g, ' ').slice(0, 220));
};


/* Los módulos que se abren: la lista de MODULOS de config.js menos los
   encabezados de grupo (no son pantallas) y mi_ot (portal del cliente, con su
   propio login). */
const MODULOS = [
  'dashboard', 'clientes', 'vehiculos', 'diagnostico_obd', 'bitacora', 'ordenes',
  'cotizaciones', 'inventario', 'bodegas', 'proveedores', 'activos', 'envios',
  'herreria', 'peleteria', 'electronica', 'refrigeracion', 'armeria',
  'agroservicio', 'venta_granos', 'facturacion', 'bancos', 'finanzas',
  'presupuesto', 'contabilidad', 'rrhh', 'marketing', 'calendario',
  'comunicaciones', 'configuracion', 'usuarios', 'admin', 'respaldos', 'descarga',
];

/* ── Cada módulo ────────────────────────────────────────────────────────── */
for (const mod of MODULOS) {
  errores.length = 0;
  try {
    await pagina.evaluate((m) => App.navegarA(m), mod);
    /* Los módulos cargan datos: se espera a que el "cargando" se vaya o a que
       haya contenido. 4 s es de sobra contra una base real. */
    await pagina.waitForFunction(() => {
      const el = document.getElementById('page-content');
      return el && el.innerText.trim().length > 0 && !/^\s*(cargando|⏳)/i.test(el.innerText);
    }, null, { timeout: 6000 }).catch(() => {});

    const info = await pagina.evaluate(() => {
      const el = document.getElementById('page-content');
      const txt = el ? el.innerText : '';
      return { largo: txt.trim().length, texto: txt.slice(0, 4000) };
    });

    if (errores.length) anotar(mod, 'error de JavaScript al abrir', errores[0]);
    else if (info.largo === 0) anotar(mod, 'la pantalla quedó VACÍA');
    else {
      const sucio = /\bundefined\b|\bNaN\b|\[object Object\]/.exec(info.texto);
      if (sucio) anotar(mod, `muestra "${sucio[0]}" en pantalla`, info.texto.slice(Math.max(0, sucio.index - 60), sucio.index + 60));
      else console.log(`PASS — ${mod}`);
    }
  } catch (e) {
    anotar(mod, 'no se pudo abrir', e.message);
  }
}

/* ── EL POS Y SU MATEMÁTICA ─────────────────────────────────────────────── */
{
  errores.length = 0;
  const mod = 'pos (total y cambio)';
  try {
    await pagina.goto(BASE + '/pos.html', { waitUntil: 'domcontentloaded' });
    await pagina.waitForFunction(() => typeof POS !== 'undefined', null, { timeout: 20000 }).catch(() => {});
    /* Si pide abrir caja, se abre: es parte del camino real del cajero. */
    const abrir = pagina.getByRole('button', { name: /Abrir caja/i });
    if (await abrir.count()) { await abrir.first().click(); }
    /* El catálogo se carga DESPUÉS de abrir la caja: esperar a que haya
       productos, no un tiempo fijo (un tiempo fijo falla el día que la base
       tarda un segundo más). */
    await pagina.waitForFunction(
      () => typeof POS !== 'undefined' && (POS._prod || []).length > 0 && document.getElementById('pos-totales'),
      null, { timeout: 20000 }).catch(() => {});

    const r = await pagina.evaluate((codigo) => {
      const p = (POS._prod || []).find(x => x.codigo === codigo);
      if (!p) return { error: 'el producto de prueba no está en el inventario' };
      POS._cart = [];
      POS.addToCart(p.id);
      POS.setCant(p.id, 3);
      const tot = document.getElementById('pos-totales');
      return {
        precio: Number(p.precio_venta),
        total: POS._totales().total,
        enPantalla: tot ? tot.innerText.replace(/\s+/g, ' ') : '',
      };
    }, CRED.producto || 'PRB-001');

    if (r.error) anotar(mod, r.error);
    else if (errores.length) anotar(mod, 'error de JavaScript al cobrar', errores[0]);
    else {
      const esperado = +(r.precio * 3).toFixed(2);
      const enPantalla = r.enPantalla.includes(`Q${esperado.toFixed(2)}`);
      if (Math.abs(r.total - esperado) > 0.001) anotar(mod, `la cuenta da mal: ${r.total} y debería dar ${esperado}`);
      else if (!enPantalla) anotar(mod, `el total NO aparece en pantalla (se esperaba Q${esperado.toFixed(2)})`, r.enPantalla);
      else console.log(`PASS — ${mod}: 3 x Q${r.precio} = Q${esperado.toFixed(2)} en pantalla`);
    }
  } catch (e) {
    anotar(mod, 'no se pudo probar el cobro', e.message);
  }
}

/* ── Resultado ──────────────────────────────────────────────────────────── */
if (fallos.length) {
  const shot = path.join(RAIZ, 'humo-fallo.png');
  await pagina.screenshot({ path: shot }).catch(() => {});
  console.log(`\n${fallos.length} pantalla(s) con problema. Captura: humo-fallo.png`);
} else {
  console.log(`\n${MODULOS.length + 1} pantallas abiertas, ninguna rota.`);
}
if (!fallos.length) await cerrar(sesion, 0);
process.exit(fallos.length ? 1 : 0);
