/* Inventario adaptado al giro del negocio.

   El riesgo de esta pieza no es que se vea feo: es que a El Granjero le pida
   "motor compatible" para un quintal de maíz, o —peor— que al cambiar un
   artículo de giro se le queden pegados los datos del giro anterior. Un
   "motor 1.8L" guardado en un saco de fertilizante no es un detalle
   cosmético: después nadie sabe si es dato o basura.

   Se prueba el armado del formulario, que es donde viven esas dos cosas. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);

const ctx = {
  console,
  Modulos: {},
  UI: { esc: (v) => String(v === null || v === undefined ? '' : v) },
  DB: {},
  Auth: { tenant: { modulos_activos: ['venta_granos', 'pos'] } },
  /* El modal, despues de armarse, toca el DOM (pinta el margen sugerido).
     Con un document que no encuentra nada, esa parte se salta sola — que es
     justo lo que hace en el navegador cuando el nodo aun no existe. */
  document: { getElementById: () => null, querySelectorAll: () => [] },
  setTimeout: (fn) => { try { fn(); } catch (_) {} },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'core', 'giros.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(raiz('js', 'modulos', 'operacion', 'inventario.js'), 'utf8'), ctx);
const INV = ctx.Modulos.inventario;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── El Granjero: giro granos ───────────────────────────────────────────── */
{
  ok('un comercio de granos ve el giro granos', INV._giros().includes('granos'));
  ok('y NO ve el de refrigeración', !INV._giros().includes('refrigeracion'));
  ok('un artículo sin clasificar cae en el giro del comercio', INV._giroDe({}) === 'granos');
  ok('un artículo ya clasificado conserva el suyo', INV._giroDe({ tipo_item: 'mecanico' }) === 'mecanico');
  ok('un tipo_item inventado no rompe: cae al del comercio',
     INV._giroDe({ tipo_item: 'zzz_no_existe' }) === 'granos');
}

/* ── Los campos que se piden ────────────────────────────────────────────── */
{
  const granos = INV._camposGiroHTML('granos', {});
  ok('a granos le pide humedad', /Humedad/.test(granos));
  ok('a granos le pide libras por saco (el saco no es peso fijo)', /Libras por saco/.test(granos));
  ok('a granos NO le pide motor compatible', !/[Mm]otor/.test(granos));
  ok('a granos NO le pide compatibilidad con vehículos', !/compat_marca/.test(granos));

  const mec = INV._camposGiroHTML('mecanico', {});
  ok('al taller sí le pide marca compatible', /compat_marca/.test(mec));
  ok('al taller le pide número de parte OEM', /num_parte_oem/.test(mec));

  const refri = INV._camposGiroHTML('refrigeracion', {});
  ok('a refrigeración le pregunta el tipo de gas', /R-134a/.test(refri));
  ok('y cuántas libras trae el cilindro', /Libras por cilindro/.test(refri));

  const agro = INV._camposGiroHTML('agroservicio', {});
  ok('al agroservicio le pide registro MAGA', /Registro MAGA/.test(agro));
  ok('y la fecha de vencimiento del producto', /type="date"/.test(agro));

  ok('el giro general no inventa campos', INV._camposGiroHTML('general', {}) === '');
}

/* ── Los valores guardados vuelven al formulario ────────────────────────── */
{
  /* Los del taller viven en columnas reales; los demás en el jsonb. Si se
     leyeran del lugar equivocado, el usuario editaría un formulario vacío y
     al guardar borraría lo que tenía. */
  const mec = INV._camposGiroHTML('mecanico', { compat_marca: 'Toyota', num_parte_oem: 'X-99' });
  ok('el taller lee sus datos de las columnas', /Toyota/.test(mec) && /X-99/.test(mec));

  const granos = INV._camposGiroHTML('granos', { atributos: { humedad_pct: 13.5, variedad: 'ICTA B-7' } });
  ok('los demás giros leen sus datos del jsonb', /13\.5/.test(granos) && /ICTA B-7/.test(granos));

  const sinNada = INV._camposGiroHTML('granos', {});
  ok('sin datos no escribe "undefined" en las cajas', !/undefined/.test(sinNada));
  ok('null tampoco se escribe', !/>null</.test(INV._camposGiroHTML('granos', { atributos: { variedad: null } })));
}

/* ── Unidades correctas por giro ────────────────────────────────────────── */
{
  ok('el perfil de granos ofrece quintal', INV._perfil('granos').unidades.includes('quintal'));
  ok('el de refrigeración ofrece libra de gas', INV._perfil('refrigeracion').unidades.includes('libra'));
  ok('un giro desconocido no revienta la pantalla',
     Array.isArray(INV._perfil('no_existe').unidades) && INV._perfil('no_existe').unidades.length > 0);
}

/* ── Un comercio con dos giros ──────────────────────────────────────────── */
{
  ctx.Auth.tenant.modulos_activos = ['venta_granos', 'electronica'];
  const gs = INV._giros();
  ok('granos + electrónica: ve los dos giros', gs.includes('granos') && gs.includes('electronica'));
  ok('y puede clasificar cada artículo por separado',
     INV._giroDe({ tipo_item: 'electronica' }) === 'electronica' && INV._giroDe({ tipo_item: 'granos' }) === 'granos');
  ctx.Auth.tenant.modulos_activos = ['venta_granos', 'pos'];
}

/* ── El formulario ENTERO se arma sin reventar ──────────────────────────
   Las pruebas de arriba miran un pedazo. Esto arma el modal completo para
   cada giro, que es lo que ve el usuario: si una plantilla se rompe, la
   pantalla queda en blanco y el comercio no puede cargar inventario. Ya pasó
   con otras pantallas y no se ve hasta que alguien abre el modal. */
{
  let htmlCapturado = '';
  ctx.UI.modal = (titulo, html) => { htmlCapturado = html; };
  ctx.puedeVerCosto = () => true;
  INV._data = [];
  INV._proveedores = [{ id: 'p1', nombre: 'Proveedor X' }];
  INV._bodegas = [{ id: 'b1', nombre: 'Bodega 1' }];
  INV._img = '';

  for (const giro of ['mecanico', 'granos', 'refrigeracion', 'electronica',
                      'herreria', 'peleteria', 'agroservicio', 'ferreteria', 'general']) {
    let error = null;
    try { INV.modalForm(null, giro); } catch (e) { error = e; }
    ok(`el formulario de ${giro} se arma sin error`, !error && htmlCapturado.length > 500);
    ok(`el formulario de ${giro} no deja "undefined" a la vista`, !/>undefined|value="undefined"/.test(htmlCapturado));
  }

  /* El selector de giro sólo aparece si el comercio tiene más de uno: a un
     taller puro no se le pone una pregunta que no tiene sentido. */
  INV.modalForm(null, 'granos');
  ok('con dos giros aparece el selector de tipo de artículo', /id="inv-giro"/.test(htmlCapturado));
  ok('y la unidad quintal está disponible en granos', /quintal/.test(htmlCapturado));
  ok('el stock admite decimales', /id="inv-stock"[^>]*step="0\.001"/.test(htmlCapturado));

  INV.modalForm(null, 'mecanico');
  ok('en el giro mecánico aparecen los campos del taller', /inv-g-compat_marca/.test(htmlCapturado));
  ok('y NO aparecen los de granos', !/inv-g-humedad_pct/.test(htmlCapturado));
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
