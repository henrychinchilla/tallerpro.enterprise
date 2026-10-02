/* DEMO E2E (docs/DEMO-E2E-10MIN.md), bloques 2 y 3, con el robot de PRUEBAS.

   Navegador real contra producción, comercio PRUEBAS. NO está en humo:todo
   a propósito: crea cotización, OT y factura de prueba en cada corrida.
   Uso: node test/humo/demo-e2e.mjs

   Usa las mismas funciones que llaman los botones de la app; UI.confirmar se
   responde solo (y se anota qué preguntó) para no quedar esperando un clic.
   Al final borra lo que guardó en las integraciones (FEL/pagos) y devuelve la
   configuración FEL como estaba. */
import { abrirSesion, marcador, cerrar, BASE } from './ayuda.mjs';

const sesion = await abrirSesion();
if (!sesion) { console.log('⚠️  Sin credenciales — la demo no corre.'); process.exit(0); }
const { pagina, errores, CRED } = sesion;
const { estado, ok } = marcador();
const COD = CRED.producto || 'PRB-001';

const enApp = async () => {
  await pagina.goto(BASE + '/', { waitUntil: 'load' });
  await pagina.waitForFunction(() => typeof DB !== 'undefined' && typeof Modulos !== 'undefined' && Modulos.ordenes && window.Auth?.tenant?.id, null, { timeout: 25000 });
  /* El arranque restaura la ruta y puede navegar una vez más: se espera a que
     la app se asiente antes de evaluar (si no: "Execution context was destroyed"). */
  await pagina.waitForLoadState('networkidle').catch(() => {});
  await pagina.waitForTimeout(1500);
  await pagina.waitForFunction(() => typeof DB !== 'undefined' && window.Auth?.tenant?.id, null, { timeout: 25000 });
  /* UI.confirmar responde lo que diga window.__respuesta (default sí) y anota el texto. */
  await pagina.evaluate(() => {
    window.__preguntas = []; window.__respuesta = true; window.__toasts = [];
    UI.confirmar = async (msg) => { window.__preguntas.push(String(msg)); return window.__respuesta; };
    const t = UI.toast; UI.toast = (m, ...r) => { window.__toasts.push(String(m)); return t.call(UI, m, ...r); };
  });
};

try {
  await enApp();

  /* ── 2a. Cotización → OT con sus ítems y el descuento global ───────── */
  const cot = await pagina.evaluate(async () => {
    /* Toda OT lleva vehículo: se cotiza para un vehículo de PRUEBAS y su dueño. */
    let veh = (await DB.getVehiculos()).find(v => v.placa === 'DEMO-E2E' && v.cliente_id);
    if (!veh) {
      const cli0 = (await DB.getClientes())[0];
      if (!cli0) return { error: 'PRUEBAS no tiene clientes' };
      const { data, error } = await getSB().from('vehiculos').insert({ tenant_id: getTID(), cliente_id: cli0.id,
        placa: 'DEMO-E2E', marca: 'Demo', modelo: 'E2E', anio: 2020 }).select().single();
      if (error) return { error: 'no se pudo crear el vehículo de prueba: ' + error.message };
      veh = data;
    }
    const cli = { id: veh.cliente_id };
    const items = [
      { descripcion: 'DEMO mano de obra', cantidad: 1, precio_unit: 200, descuento_pct: 0, total: 200 },
      { descripcion: 'DEMO filtro', cantidad: 2, precio_unit: 50, descuento_pct: 10, total: 90 },
    ];
    const total = 290 - 14.5;   // 5% global
    const r = await DB.guardarCotizacion({ cliente_id: cli.id, vehiculo_id: veh.id, descuento_pct: 5, descuento_monto: 14.5,
      subtotal: +(total / 1.12).toFixed(2), iva: +(total - total / 1.12).toFixed(2), total, notas: 'DEMO E2E' }, items);
    if (r.error) return { error: r.error.message };
    const o = await DB.convertirCotizacionAOrden(r.data.id);
    if (o.error) return { error: o.error.message };
    const { data: oti } = await getSB().from('ot_items').select('descripcion,total').eq('orden_id', o.data.id);
    return { ot: o.data.id, total, n: oti.length, suma: +oti.reduce((s, i) => s + Number(i.total), 0).toFixed(2),
             desc: oti.some(i => /Descuento de la cotización/.test(i.descripcion)) };
  });
  if (cot.error) throw new Error(cot.error);
  ok('cotización → OT trae las 2 líneas + el descuento', cot.n === 3 && cot.desc, `${cot.n} ítems`);
  ok(`el total de la OT = el cotizado (Q${cot.total})`, Math.abs(cot.suma - cot.total) < 0.01, 'suma ' + cot.suma);

  /* ── 2b. Repuesto con stock + quitar línea pide confirmación ──────── */
  const rep = await pagina.evaluate(async ({ ot, cod }) => {
    const p = (await DB.getInventario()).find(x => x.codigo === cod);
    if (!p) return { error: 'falta ' + cod };
    const { data: it } = await getSB().from('ot_items').insert({ tenant_id: getTID(), orden_id: ot, tipo: 'repuesto',
      descripcion: 'DEMO ' + p.nombre, cantidad: 1, precio_unit: Number(p.precio_venta), total: Number(p.precio_venta),
      inventario_id: p.id }).select().single();
    const { data: todos } = await getSB().from('ot_items').select('total').eq('orden_id', ot);
    await getSB().from('ordenes').update({ total: todos.reduce((s, i) => s + Number(i.total), 0) }).eq('id', ot);
    const { data: linea } = await getSB().from('ot_items').select('id').eq('orden_id', ot).eq('descripcion', 'DEMO mano de obra').single();
    window.__preguntas = []; window.__respuesta = false;          // el usuario cancela
    await Modulos.ordenes.eliminarItem(linea.id, ot);
    const { count } = await getSB().from('ot_items').select('*', { count: 'exact', head: true }).eq('id', linea.id);
    window.__respuesta = true;
    return { stock: Number(p.stock), invId: p.id, pregunto: window.__preguntas.length, sigue: count };
  }, { ot: cot.ot, cod: COD });
  if (rep.error) throw new Error(rep.error);
  ok('quitar una línea de la OT pide confirmación', rep.pregunto === 1);
  ok('...y si se cancela, la línea sigue ahí', rep.sigue === 1);

  /* ── 2c. Facturar la OT: baja el stock exacto ─────────────────────── */
  const fac = await pagina.evaluate(async ({ ot, invId }) => {
    await DB.updateEstadoOT(ot, 'listo');
    await Modulos.ordenes.enviarFacturacion(ot);
    const f = await DB.facturaDeOrden(ot);
    const { data: p } = await getSB().from('inventario').select('stock').eq('id', invId).single();
    return { factura: f?.num || null, stock: Number(p.stock), toasts: window.__toasts.slice(-2) };
  }, { ot: cot.ot, invId: rep.invId });
  ok('la OT se facturó', !!fac.factura, fac.toasts.join(' | '));
  ok(`el stock del repuesto bajó 1 (${rep.stock} → ${rep.stock - 1})`, Math.abs(fac.stock - (rep.stock - 1)) < 0.001, 'quedó ' + fac.stock);

  /* ── 2d. Segunda factura de la misma OT: la base la rechaza ───────── */
  await enApp();
  const dup = await pagina.evaluate(async (ot) => {
    const r = await DB.upsertFactura({ ot_id: ot, nit: 'CF', nombre_receptor: 'DEMO', subtotal: 1, iva: 0, total: 1,
      estado: 'pendiente', fecha: hoyLocal(), descripcion: 'DEMO duplicada' });
    return { error: r.error?.message || null, creo: !!r.data };
  }, cot.ot);
  ok('una segunda factura de la misma OT se rechaza', !dup.creo && /ya tiene una factura/.test(dup.error || ''), dup.error);

  /* ── 2e. POS: vender más que el stock no cobra nada ───────────────── */
  await pagina.goto(BASE + '/pos.html', { waitUntil: 'load' });
  await pagina.waitForFunction(() => typeof POS !== 'undefined', null, { timeout: 20000 }).catch(() => {});
  const abrir = pagina.getByRole('button', { name: /Abrir caja/i });
  if (await abrir.count()) await abrir.first().click();
  await pagina.waitForFunction(() => (POS._prod || []).length > 0 && document.getElementById('pos-totales'), null, { timeout: 20000 });
  const pos = await pagina.evaluate(async (cod) => {
    window.__toasts = []; const t = UI.toast; UI.toast = (m, ...r) => { window.__toasts.push(String(m)); return t.call(UI, m, ...r); };
    const p = POS._prod.find(x => x.codigo === cod);
    const antes = (await DB.getInventario()).find(x => x.id === p.id).stock;
    const { count: fAntes } = await getSB().from('facturas').select('*', { count: 'exact', head: true }).eq('tenant_id', getTID());
    /* El carrito ya limita la cantidad al stock ("Límite de stock"). El caso
       que cuida la guarda atómica es OTRO: el stock baja (otra caja vendió)
       entre armar el carrito y cobrar. Se simula poniendo la cantidad por
       encima del stock real de la base. */
    POS._cart = []; POS.addToCart(p.id); POS.setCant(p.id, 1);
    const linea = POS._cart.find(l => l.id === p.id); linea.cant = Number(antes) + 1;
    POS._setRecibido?.(999999999);
    await POS.cobrar();
    const despues = (await DB.getInventario()).find(x => x.id === p.id).stock;
    const { count: fDesp } = await getSB().from('facturas').select('*', { count: 'exact', head: true }).eq('tenant_id', getTID());
    POS._cart = [];
    return { antes: Number(antes), despues: Number(despues), facturas: fDesp - fAntes, toast: window.__toasts.find(x => /No se cobró/.test(x)) || window.__toasts.join(' | ') };
  }, COD);
  ok('POS: vender más que el stock avisa "Stock insuficiente"', /Stock insuficiente/.test(pos.toast || ''), pos.toast);
  ok('...no crea factura', pos.facturas === 0, pos.facturas + ' facturas nuevas');
  ok('...y el stock no se mueve', pos.antes === pos.despues, `${pos.antes} → ${pos.despues}`);

  /* ── 3. Canal B: FEL y pagos del comercio ─────────────────────────── */
  await enApp();
  const felPrevio = await pagina.evaluate(() => JSON.stringify(Auth.tenant.config_infile || null));
  await pagina.evaluate(() => { Modulos.comunicaciones._tab = 'config'; App.navegarA('comunicaciones'); });
  await pagina.waitForSelector('#cfg-infile-modo', { timeout: 20000 });
  const textos = await pagina.evaluate(() => document.getElementById('page-content').innerText);
  ok('FEL dice "Sin certificador conectado"', /Sin certificador conectado/.test(textos));
  ok('...y ya no dice "NexusPro gestiona" ni "integrado con NexusPro"', !/NexusPro gestiona|integrado con NexusPro/.test(textos));

  const SECRETO = 'demo-e2e-clave-de-prueba-x';
  await pagina.evaluate((s) => {
    document.getElementById('cfg-infile-modo').value = 'propio';
    Modulos.comunicaciones._toggleInfileMode('propio');
    document.getElementById('cfg-infile-user').value = 'demo_robot';
    document.getElementById('cfg-infile-nit').value = '1234567';
    document.getElementById('cfg-infile-pass').value = s;
  }, SECRETO);
  await pagina.evaluate(() => Modulos.comunicaciones.guardarInfile());
  await pagina.waitForTimeout(1500);
  const fel = await pagina.evaluate(async () => {
    const { data: t } = await getSB().from('tenants').select('config_infile').eq('id', getTID()).single();
    const i = await DB.getIntegracion('fel');
    const probar = await DB.probarIntegracion('fel');
    return { cfg: JSON.stringify(t.config_infile), pista: i?.secreto_pista, probar: probar?.error || probar?.detalle };
  });
  ok('la contraseña FEL NO quedó en tenants.config_infile', !fel.cfg.includes(SECRETO) && !/"password"/.test(fel.cfg));
  ok('...quedó cifrada (se ve solo la pista)', /^…/.test(fel.pista || ''), fel.pista);
  ok('Probar conexión FEL → "Sin conector"', /Sin conector/.test(fel.probar || ''), fel.probar);
  await pagina.reload({ waitUntil: 'load' });
  await pagina.waitForFunction(() => typeof Modulos !== 'undefined' && Modulos.comunicaciones && window.Auth?.tenant?.id, null, { timeout: 25000 });
  await pagina.evaluate(() => { Modulos.comunicaciones._tab = 'config'; App.navegarA('comunicaciones'); });
  await pagina.waitForSelector('#cfg-infile-pass', { timeout: 20000 });
  await pagina.waitForTimeout(1000);
  const tras = await pagina.evaluate(() => ({ valor: document.getElementById('cfg-infile-pass').value,
    html: document.getElementById('page-content').innerHTML, pista: document.getElementById('fel-pista')?.innerText }));
  ok('al recargar, la contraseña NO se vuelve a mostrar', tras.valor === '' && !tras.html.includes(SECRETO));
  ok('...y dice que está guardada cifrada', /Guardada cifrada/.test(tras.pista || ''), tras.pista);

  const pagos = await pagina.evaluate(async () => {
    const g = await DB.guardarIntegracion('pagos', { proveedor: 'recurrente', ambiente: 'test',
      publico: { public_key: 'pk_demo' }, secretos: { secret_key: 'demo-secreto-123456' } });
    const p = await DB.probarIntegracion('pagos');
    const b = await DB.borrarIntegracion('pagos');
    return { g: g.ok, probar: p?.error || p?.detalle, borro: b.ok && !(await DB.getIntegracion('pagos')) };
  });
  ok('pagos propios: el admin guarda su pasarela', pagos.g);
  ok('...Probar → "Sin conector"', /Sin conector/.test(pagos.probar || ''), pagos.probar);
  ok('...y Desconectar la borra', pagos.borro);

  /* Limpieza: FEL como estaba */
  await pagina.evaluate(async (prev) => {
    await DB.borrarIntegracion('fel');
    await DB.updateTenant({ config_infile: JSON.parse(prev) });
  }, felPrevio);

  /* Esperados: el 409 de la factura duplicada (índice de la mig 151) y el
     400 del mover_stock que rechaza la sobreventa. */
  const reales = errores.filter(e => !/HTTP 409 en \/rest\/v1\/facturas|HTTP 400 en \/rest\/v1\/rpc\/mover_stock|Stock insuficiente|status of (409|400) \(\)$/.test(e));
  ok('la demo no tiró errores inesperados', reales.length === 0, reales.join(' | '));
} catch (e) {
  ok('la demo se pudo ejecutar completa', false, e.message);
}

console.log(`\n${estado.pasadas} pasadas, ${estado.fallidas} fallidas`);
await cerrar(sesion, estado.fallidas);
process.exit(estado.fallidas ? 1 : 0);
