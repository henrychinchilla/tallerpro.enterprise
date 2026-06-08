/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/db.js — Capa de datos Supabase
═══════════════════════════════════════════════════════ */

let _sb = null;

function getSB() {
  if (_sb) return _sb;
  _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

function getTID() {
  /* Buscar tenant_id en múltiples lugares */
  return window.Auth?.tenant?.id
      || window._cachedTenantId
      || null;
}

function setTenantCache(id) {
  window._cachedTenantId = id;
}

async function waitForTenant(maxMs=5000) {
  const start = Date.now();
  while (!getTID() && Date.now()-start < maxMs) {
    await new Promise(r => setTimeout(r, 150));
  }
  return getTID();
}

function mesActual() {
  const now = new Date();
  const ini = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const fin = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
  return { ini, fin };
}

const DB = {

  /* ── TENANTS ──────────────────────────────────── */
  async getTenant(slug=null, id=null) {
    try {
      let q = getSB().from('tenants').select('*');
      if (id)   q = q.eq('id', id);
      else if (slug) q = q.eq('slug', slug);
      else if (getTID()) q = q.eq('id', getTID());
      else q = q.limit(1);
      const { data } = await q.maybeSingle();
      return data;
    } catch(e) { return null; }
  },

  async updateTenant(fields) {
    const { error } = await getSB().from('tenants').update(fields).eq('id', getTID());
    return !error;
  },

  async buscarTalleres(q) {
    const { data } = await getSB().from('tenants')
      .select('id,slug,name,nit').or(`name.ilike.%${q}%,nit.ilike.%${q}%`).limit(8);
    return data || [];
  },

  /* ── USUARIOS ─────────────────────────────────── */
  async getUsuarios() {
    const tid = await waitForTenant();
    const { data } = await getSB().from('usuarios').select('*')
      .eq('tenant_id', tid)
      .neq('rol','superadmin')
      .neq('email','henry.chinchilla@gmail.com')
      .order('nombre');
    return data || [];
  },

  async upsertUsuario(fields) {
    const { error } = await getSB().from('usuarios')
      .upsert({ ...fields, tenant_id: getTID() }, { onConflict:'id' });
    if (error) console.error('upsertUsuario:', error.message);
    return !error;
  },

  async getConfigFiscal() {
    const key = 'tp_fiscal_' + (getTID()||'demo');
    const local = JSON.parse(localStorage.getItem(key)||'null');
    if (local) return local;
    const { data } = await getSB().from('config_fiscal')
      .select('*').eq('tenant_id', getTID()).maybeSingle();
    if (data) localStorage.setItem(key, JSON.stringify(data));
    return data || {};
  },

  async saveConfigFiscal(fields) {
    const key = 'tp_fiscal_' + (getTID()||'demo');
    localStorage.setItem(key, JSON.stringify(fields));
    const tid = getTID();
    if (!tid || tid==='demo') return true;
    const { error } = await getSB().from('config_fiscal')
      .upsert({ ...fields, tenant_id: tid }, { onConflict:'tenant_id' });
    return !error;
  },

  /* ── CLIENTES ─────────────────────────────────── */
  async getClientes(busca=null) {
    let q = getSB().from('clientes').select('*').eq('tenant_id', getTID()).order('nombre');
    if (busca) q = q.or(`nombre.ilike.%${busca}%,nit.ilike.%${busca}%,tel.ilike.%${busca}%`);
    const { data } = await q;
    return data || [];
  },

  async upsertCliente(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('clientes').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('clientes').insert(payload).select().single();
    return { data, error };
  },

  async deleteCliente(id) {
    const { error } = await getSB().from('clientes').delete().eq('id', id);
    return !error;
  },

  /* ── VEHÍCULOS ────────────────────────────────── */
  async getVehiculos(clienteId=null) {
    let q = getSB().from('vehiculos')
      .select('*, clientes(nombre,tel)').eq('tenant_id', getTID()).order('created_at',{ascending:false});
    if (clienteId) q = q.eq('cliente_id', clienteId);
    const { data } = await q;
    return data || [];
  },

  async upsertVehiculo(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('vehiculos').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('vehiculos').insert(payload).select().single();
    return { data, error };
  },

  async deleteVehiculo(id) {
    const { error } = await getSB().from('vehiculos').delete().eq('id', id);
    return !error;
  },

  /* ── ÓRDENES DE TRABAJO ───────────────────────── */
  async getOrdenes(filtros={}) {
    let q = getSB().from('ordenes')
      .select('*, vehiculos(placa,marca,modelo,anio,color), clientes(nombre,tel,email), empleados(nombre)')
      .eq('tenant_id', getTID()).order('created_at',{ascending:false});
    if (filtros.estado)     q = q.eq('estado', filtros.estado);
    if (filtros.mecanico)   q = q.eq('mecanico_id', filtros.mecanico);
    if (filtros.cliente)    q = q.eq('cliente_id', filtros.cliente);
    if (filtros.vehiculo)   q = q.eq('vehiculo_id', filtros.vehiculo);
    if (filtros.fecha_ini)  q = q.gte('fecha_ingreso', filtros.fecha_ini);
    if (filtros.fecha_fin)  q = q.lte('fecha_ingreso', filtros.fecha_fin);
    const { data } = await q;
    return data || [];
  },

  async getOrden(id) {
    const { data } = await getSB().from('ordenes')
      .select('*, vehiculos(*), clientes(*), empleados(nombre), ot_servicios(*)')
      .eq('id', id).maybeSingle();
    return data;
  },

  async upsertOrden(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('ordenes').update(payload).eq('id', fields.id);
      return { error };
    }
    /* Generar número OT */
    const { count } = await getSB().from('ordenes').select('*',{count:'exact',head:true}).eq('tenant_id',getTID());
    payload.num = `OT-${new Date().getFullYear()}-${String((count||0)+1).padStart(4,'0')}`;
    const { data, error } = await getSB().from('ordenes').insert(payload).select().single();
    return { data, error };
  },

  async updateEstadoOT(id, estado) {
    const { error } = await getSB().from('ordenes').update({ estado, updated_at: new Date().toISOString() }).eq('id', id);
    return !error;
  },

  /* ── INVENTARIO ───────────────────────────────── */
  async getInventario(busca=null, bodega=null) {
    let q = getSB().from('inventario').select('*').eq('tenant_id', getTID()).order('nombre');
    if (busca) q = q.or(`nombre.ilike.%${busca}%,codigo.ilike.%${busca}%`);
    if (bodega) q = q.eq('bodega_id', bodega);
    const { data } = await q;
    return data || [];
  },

  async upsertInventario(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    const { data, error } = await getSB().from('inventario')
      .upsert(payload, { onConflict:'tenant_id,codigo' }).select().single();
    return { data, error };
  },

  async movimientoInventario(fields) {
    const { error } = await getSB().from('inventario_movimientos').insert({
      ...fields, tenant_id: getTID(),
      usuario_id:     window.Auth?.user?.id || null,
      usuario_nombre: window.Auth?.user?.nombre || window.Auth?.user?.email || null
    });
    return !error;
  },

  /* Historial de movimientos de inventario (salidas, entradas, traslados, ajustes) */
  async getMovimientosInventario({ inventarioId = null, tipo = null, limite = 300 } = {}) {
    let q = getSB().from('inventario_movimientos')
      .select('*, inventario(nombre,codigo,unidad)')
      .eq('tenant_id', getTID()).order('created_at', { ascending: false }).limit(limite);
    if (inventarioId) q = q.eq('inventario_id', inventarioId);
    if (tipo) q = q.eq('tipo', tipo);
    const { data } = await q;
    return data || [];
  },

  /* Bitácora de auditoría global */
  async getActividad({ accion = null, entidad = null, limite = 300 } = {}) {
    let q = getSB().from('actividad_log').select('*')
      .eq('tenant_id', getTID()).order('created_at', { ascending: false }).limit(limite);
    if (accion)  q = q.eq('accion', accion);
    if (entidad) q = q.eq('entidad', entidad);
    const { data } = await q;
    return data || [];
  },

  /* ── PROVEEDORES ──────────────────────────────── */
  async getProveedores() {
    const { data } = await getSB().from('proveedores').select('*')
      .eq('tenant_id', getTID()).order('nombre');
    return data || [];
  },

  async upsertProveedor(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('proveedores').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('proveedores').insert(payload).select().single();
    return { data, error };
  },

  /* ── BANCOS ───────────────────────────────────── */
  async getBancos() {
    const { data } = await getSB().from('bancos').select('*')
      .eq('tenant_id', getTID()).order('nombre');
    return data || [];
  },

  async upsertBanco(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('bancos').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('bancos').insert(payload).select().single();
    return { data, error };
  },

  async getMovimientosBanco(bancoId, filtros={}) {
    let q = getSB().from('banco_movimientos').select('*')
      .eq('tenant_id', getTID()).eq('banco_id', bancoId)
      .order('fecha', {ascending: false});
    if (filtros.ini) q = q.gte('fecha', filtros.ini);
    if (filtros.fin) q = q.lte('fecha', filtros.fin);
    const { data } = await q;
    return data || [];
  },

  async upsertMovimientoBanco(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('banco_movimientos').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('banco_movimientos').insert(payload).select().single();
    return { data, error };
  },

  /* ── FINANZAS ─────────────────────────────────── */
  async getIngresos(ini=null, fin=null) {
    const m = mesActual();
    let q = getSB().from('ingresos').select('*').eq('tenant_id', getTID())
      .gte('fecha', ini||m.ini).lte('fecha', fin||m.fin).order('fecha',{ascending:false});
    const { data } = await q;
    return data || [];
  },

  async upsertIngreso(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('ingresos').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('ingresos').insert(payload).select().single();
    return { data, error };
  },

  async getEgresos(ini=null, fin=null) {
    const m = mesActual();
    let q = getSB().from('egresos').select('*').eq('tenant_id', getTID())
      .gte('fecha', ini||m.ini).lte('fecha', fin||m.fin).order('fecha',{ascending:false});
    const { data } = await q;
    return data || [];
  },

  async upsertEgreso(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('egresos').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('egresos').insert(payload).select().single();
    return { data, error };
  },

  /* ── EGRESOS RECURRENTES (gastos programados) ─── */
  async getEgresosRecurrentes() {
    const { data } = await getSB().from('egresos_recurrentes').select('*')
      .eq('tenant_id', getTID()).order('dia_mes');
    return data || [];
  },

  async upsertEgresoRecurrente(fields) {
    const payload = { ...fields, tenant_id: getTID(), updated_at: new Date().toISOString() };
    if (fields.id) {
      const { error } = await getSB().from('egresos_recurrentes').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('egresos_recurrentes').insert(payload).select().single();
    return { data, error };
  },

  /* Genera el egreso de un recurrente para un período (mes/anio) si no existe.
     Devuelve {ok, yaExistia}. Marca ultima_generacion. */
  async generarEgresoRecurrente(rec, mes, anio) {
    const periodo = `${anio}-${String(mes).padStart(2,'0')}`;
    const referencia = `REC-${rec.id.slice(0,8)}-${periodo}`;
    /* ¿Ya se generó este período? */
    const { data: existe } = await getSB().from('egresos')
      .select('id').eq('tenant_id', getTID()).eq('referencia', referencia).limit(1);
    if (existe?.length) return { ok:true, yaExistia:true };
    const dia = Math.min(Math.max(1, rec.dia_mes||1), new Date(anio, mes, 0).getDate());
    const fecha = `${periodo}-${String(dia).padStart(2,'0')}`;
    const { error } = await getSB().from('egresos').insert({
      tenant_id: getTID(),
      concepto:  rec.concepto, categoria: rec.categoria || 'Servicios',
      monto:     rec.monto || 0, fecha,
      metodo_pago: rec.metodo_pago || null, proveedor: rec.proveedor || null,
      referencia, notas: `Gasto recurrente${rec.notas?` — ${rec.notas}`:''}`
    });
    if (error) return { ok:false, error: error.message };
    await getSB().from('egresos_recurrentes')
      .update({ ultima_generacion: `${periodo}-01`, updated_at: new Date().toISOString() })
      .eq('id', rec.id);
    return { ok:true, yaExistia:false };
  },

  /* Documentos de empleados próximos a vencer (o vencidos) para seguimiento */
  async getVencimientosDocumentos(diasAdelante = 60) {
    const hoy = new Date();
    const limite = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + diasAdelante)
      .toISOString().slice(0,10);
    const { data } = await getSB().from('empleado_documentos')
      .select('*, empleados(nombre)')
      .eq('tenant_id', getTID())
      .not('fecha_vencimiento','is', null)
      .lte('fecha_vencimiento', limite)
      .order('fecha_vencimiento');
    return data || [];
  },

  async deleteRegistro(tabla, id) {
    const { error } = await getSB().from(tabla).delete().eq('id', id).eq('tenant_id', getTID());
    return !error;
  },

  /* ── FACTURAS FEL ─────────────────────────────── */
  async getFacturas(ini=null, fin=null) {
    const m = mesActual();
    let q = getSB().from('facturas').select('*,clientes(nombre,nit,email)')
      .eq('tenant_id', getTID())
      .gte('fecha', ini||m.ini).lte('fecha', fin||m.fin)
      .order('fecha',{ascending:false});
    const { data } = await q;
    return data || [];
  },

  async upsertFactura(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('facturas').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('facturas').insert(payload).select().single();
    return { data, error };
  },

  /* Devuelve la factura existente de una OT (para evitar doble facturación) */
  async facturaDeOrden(ordenId) {
    if (!ordenId) return null;
    const { data } = await getSB().from('facturas')
      .select('id,serie,num_fel,orden_id').eq('tenant_id', getTID()).eq('orden_id', ordenId).limit(1);
    return data?.[0] || null;
  },

  async getFacturaItems(facturaId) {
    const { data } = await getSB().from('factura_items').select('*')
      .eq('factura_id', facturaId).order('created_at');
    return data || [];
  },

  async insertFacturaItems(facturaId, items) {
    if (!items?.length) return null;
    const rows = items.map(i => ({
      factura_id: facturaId, tenant_id: getTID(),
      descripcion: i.descripcion || '', cantidad: i.cantidad || 1,
      precio_unit: i.precio_unit || 0, total: i.total || 0,
      inventario_id: i.inventario_id || null
    }));
    const { error } = await getSB().from('factura_items').insert(rows);
    return error;
  },

  /* Descuenta del inventario los repuestos vendidos en una factura y
     registra el movimiento de salida. Solo afecta líneas con inventario_id. */
  async descontarInventarioVenta(items, referencia) {
    const fecha = new Date().toISOString().slice(0, 10);
    let afectados = 0;
    for (const it of (items || [])) {
      const cant = Number(it.cantidad) || 0;
      if (!it.inventario_id || cant <= 0) continue;
      const { data: inv } = await getSB().from('inventario')
        .select('stock').eq('id', it.inventario_id).eq('tenant_id', getTID()).maybeSingle();
      if (!inv) continue;
      const nuevo = Math.max(0, Number(inv.stock) - cant);
      await getSB().from('inventario')
        .update({ stock: nuevo, updated_at: new Date().toISOString() })
        .eq('id', it.inventario_id);
      await this.movimientoInventario({
        inventario_id: it.inventario_id, tipo: 'salida', cantidad: cant,
        referencia, notas: 'Venta en factura', fecha
      });
      afectados++;
    }
    return afectados;
  },

  /* ── EMPLEADOS ────────────────────────────────── */
  async getEmpleados() {
    const { data } = await getSB().from('empleados').select('*')
      .eq('tenant_id', getTID()).order('nombre');
    return data || [];
  },

  async upsertEmpleado(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('empleados').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('empleados').insert(payload).select().single();
    return { data, error };
  },

  async getViaticos(empleadoId=null, ini=null, fin=null) {
    const m = mesActual();
    let q = getSB().from('viaticos').select('*,empleados(nombre)')
      .eq('tenant_id', getTID())
      .gte('fecha', ini||m.ini).lte('fecha', fin||m.fin)
      .order('fecha',{ascending:false});
    if (empleadoId) q = q.eq('empleado_id', empleadoId);
    const { data } = await q;
    return data || [];
  },

  async upsertViatico(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('viaticos').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('viaticos').insert(payload).select().single();
    return { data, error };
  },

  /* ── PRODUCTIVIDAD / KPIs ─────────────────────── */
  async getConfigProductividad() {
    const { data } = await getSB().from('config_productividad')
      .select('settings').eq('tenant_id', getTID()).maybeSingle();
    /* Mezcla con los defaults para tolerar configs parciales */
    return { ...PRODUCTIVIDAD_DEFAULTS, ...(data?.settings || {}) };
  },

  async saveConfigProductividad(settings) {
    const { error } = await getSB().from('config_productividad')
      .upsert({ tenant_id: getTID(), settings, updated_at: new Date().toISOString() }, { onConflict:'tenant_id' });
    if (error) console.error('saveConfigProductividad:', error.message);
    return !error;
  },

  async getKpiEmpleados(mes, anio) {
    const { data } = await getSB().from('kpi_empleado').select('*')
      .eq('tenant_id', getTID()).eq('periodo_mes', mes).eq('periodo_anio', anio);
    return data || [];
  },

  async upsertKpiEmpleado(fields) {
    const payload = { ...fields, tenant_id: getTID(), updated_at: new Date().toISOString() };
    const { data, error } = await getSB().from('kpi_empleado')
      .upsert(payload, { onConflict:'tenant_id,empleado_id,periodo_mes,periodo_anio' }).select().single();
    return { data, error };
  },

  /* OTs del período para KPIs (livianas: solo campos necesarios) */
  async getOrdenesPeriodo(ini, fin) {
    const { data } = await getSB().from('ordenes')
      .select('id,mecanico_id,estado,total,fecha_ingreso,fecha_estimada,fecha_entrega')
      .eq('tenant_id', getTID())
      .gte('fecha_ingreso', ini).lte('fecha_ingreso', fin);
    return data || [];
  },

  async getPagosNomina(mes, anio) {
    const { data } = await getSB().from('pagos_nomina').select('*,empleados(nombre,cargo)')
      .eq('tenant_id', getTID()).eq('periodo_mes', mes).eq('periodo_anio', anio);
    return data || [];
  },

  async upsertPagoNomina(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    const { data, error } = await getSB().from('pagos_nomina')
      .upsert(payload, { onConflict:'empleado_id,periodo_mes,periodo_anio' }).select().single();
    return { data, error };
  },

  async getDocumentosEmpleado(empleadoId) {
    const { data } = await getSB().from('empleado_documentos').select('*')
      .eq('empleado_id', empleadoId).order('tipo');
    return data || [];
  },

  async upsertDocumento(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('empleado_documentos').update(payload).eq('id', fields.id);
      return { error };
    }
    /* Buscar por empleado+tipo para no duplicar */
    const { data: existing } = await getSB().from('empleado_documentos')
      .select('id').eq('tenant_id', getTID())
      .eq('empleado_id', fields.empleado_id).eq('tipo', fields.tipo).maybeSingle();
    if (existing?.id) {
      const { error } = await getSB().from('empleado_documentos').update(payload).eq('id', existing.id);
      return { error };
    }
    const { data, error } = await getSB().from('empleado_documentos').insert(payload).select().single();
    return { data, error };
  },

  /* ── PRESUPUESTO / BUDGET ─────────────────────── */
  async getPresupuesto(anio) {
    const { data } = await getSB().from('presupuesto').select('*')
      .eq('tenant_id', getTID()).eq('anio', anio).order('created_at');
    return data || [];
  },

  async upsertPresupuesto(fields) {
    const payload = { ...fields, tenant_id: getTID(), updated_at: new Date().toISOString() };
    if (fields.id) {
      const { error } = await getSB().from('presupuesto').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('presupuesto').insert(payload).select().single();
    return { data, error };
  },

  /* Reemplaza las líneas de presupuesto de un año (borra y reinserta) */
  async guardarPresupuesto(anio, lineas) {
    await getSB().from('presupuesto').delete().eq('tenant_id', getTID()).eq('anio', anio);
    if (!lineas.length) return { error:null };
    const rows = lineas.map(l => ({ ...l, anio, tenant_id: getTID() }));
    const { error } = await getSB().from('presupuesto').insert(rows);
    return { error };
  },

  /* Consumo de insumos/repuestos usados en OTs en un rango (por ot_items) */
  async getConsumoInsumos(ini, fin) {
    const { data } = await getSB().from('ot_items')
      .select('total,cantidad,tipo,inventario_id,created_at')
      .eq('tenant_id', getTID())
      .gte('created_at', ini).lte('created_at', fin+'T23:59:59');
    const items = (data||[]).filter(i => i.inventario_id || i.tipo==='repuesto');
    return {
      monto:    items.reduce((s,i)=>s+(Number(i.total)||0),0),
      lineas:   items.length,
      unidades: items.reduce((s,i)=>s+(Number(i.cantidad)||0),0)
    };
  },

  /* ── ACTIVOS (herramientas, maquinaria, depreciación) ── */
  async getActivos() {
    const { data } = await getSB().from('activos').select('*')
      .eq('tenant_id', getTID()).order('created_at', { ascending:false });
    return data || [];
  },

  async upsertActivo(fields) {
    const payload = { ...fields, tenant_id: getTID(), updated_at: new Date().toISOString() };
    if (fields.id) {
      const { error } = await getSB().from('activos').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('activos').insert(payload).select().single();
    return { data, error };
  },

  /* ── BODEGAS ──────────────────────────────────── */
  async getBodegas() {
    const { data } = await getSB().from('bodegas').select('*')
      .eq('tenant_id', getTID()).order('nombre');
    return data || [];
  },

  async upsertBodega(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('bodegas').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('bodegas').insert(payload).select().single();
    return { data, error };
  },

  /* ── MARKETING ────────────────────────────────── */
  async getCombos() {
    const { data } = await getSB().from('combos').select('*')
      .eq('tenant_id', getTID()).order('nombre');
    return data || [];
  },

  async upsertCombo(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('combos').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('combos').insert(payload).select().single();
    return { data, error };
  },

  async getPromociones() {
    const { data } = await getSB().from('promociones').select('*')
      .eq('tenant_id', getTID()).order('fecha_inicio',{ascending:false});
    return data || [];
  },

  async upsertPromocion(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('promociones').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('promociones').insert(payload).select().single();
    return { data, error };
  },

  /* ── CITAS ────────────────────────────────────── */
  async getCitas(ini=null, fin=null) {
    let q = getSB().from('citas')
      .select('*, clientes(nombre,tel), vehiculos(placa,marca,modelo), empleados(nombre)')
      .eq('tenant_id', getTID()).order('fecha_cita');
    if (ini) q = q.gte('fecha_cita', ini);
    if (fin) q = q.lte('fecha_cita', fin);
    const { data } = await q;
    return data || [];
  },

  async upsertCita(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('citas').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('citas').insert(payload).select().single();
    return { data, error };
  },

  /* ── LICENCIAS ────────────────────────────────── */
  async getLicencia() {
    const { data } = await getSB().from('licencias')
      .select('*').eq('tenant_id', getTID()).maybeSingle();
    return data;
  },

  async activarLicencia(codigo, email) {
    const { data: existente } = await getSB().from('licencias')
      .select('tenant_id').eq('codigo', codigo).maybeSingle();
    if (existente) return { ok:false, error:'Código ya utilizado' };
    const { error } = await getSB().from('licencias').update({
      tipo:'completa', codigo, activa:true, activada_por:email,
      fecha_vencimiento:null, updated_at:new Date().toISOString()
    }).eq('tenant_id', getTID());
    return { ok:!error, error:error?.message };
  },

  /* ── KPIs DASHBOARD ───────────────────────────── */
  async getKPIs() {
    const { ini, fin } = mesActual();
    const tid = getTID();
    const [
      { count: clientes },
      { count: otsActivas },
      { data: facturas },
      { data: ingresos },
      { data: invBajo }
    ] = await Promise.all([
      getSB().from('clientes').select('*',{count:'exact',head:true}).eq('tenant_id',tid),
      getSB().from('ordenes').select('*',{count:'exact',head:true}).eq('tenant_id',tid).not('estado','in','("entregado","cancelado")'),
      getSB().from('facturas').select('total').eq('tenant_id',tid).gte('fecha',ini).lte('fecha',fin),
      getSB().from('ingresos').select('monto').eq('tenant_id',tid).gte('fecha',ini).lte('fecha',fin),
      getSB().from('inventario').select('id,nombre,stock,min_stock').eq('tenant_id',tid).filter('stock','lte','min_stock')
    ]);
    const ingFact = (facturas||[]).reduce((s,f)=>s+(f.total||0),0);
    const ingDir  = (ingresos||[]).reduce((s,i)=>s+(i.monto||0),0);
    return {
      clientes:   clientes||0,
      otsActivas: otsActivas||0,
      ingresos:   ingFact+ingDir,
      invBajo:    invBajo||[],
      mesIni:     ini,
      mesFin:     fin
    };
  },

  /* ── DATOS PARA GRÁFICAS DEL DASHBOARD ─────────── */
  async getDashboardData() {
    const tid = getTID();
    const hoy = new Date();
    /* Inicio del rango: primer día del mes hace 5 meses (6 meses en total) */
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
    const desdeStr = desde.toISOString().slice(0, 10);

    const [
      { data: ingresos },
      { data: egresos },
      { data: facturas },
      { data: ordenes }
    ] = await Promise.all([
      getSB().from('ingresos').select('monto,fecha,clientes(nombre)').eq('tenant_id', tid).gte('fecha', desdeStr),
      getSB().from('egresos').select('monto,fecha').eq('tenant_id', tid).gte('fecha', desdeStr),
      getSB().from('facturas').select('total,fecha,clientes(nombre)').eq('tenant_id', tid).gte('fecha', desdeStr),
      getSB().from('ordenes').select('estado').eq('tenant_id', tid)
    ]);

    /* Buckets de los últimos 6 meses */
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      meses.push({
        key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('es-GT', { month: 'short' }),
        ingresos: 0, egresos: 0
      });
    }
    const idx = k => meses.find(m => m.key === k);
    const bucket = (arr, campo, tipo) => (arr || []).forEach(r => {
      const m = idx((r.fecha || '').slice(0, 7));
      if (m) m[tipo] += Number(r[campo] || 0);
    });
    bucket(ingresos, 'monto', 'ingresos');
    bucket(facturas, 'total', 'ingresos');
    bucket(egresos,  'monto', 'egresos');

    /* Conteo de órdenes por estado */
    const porEstado = {};
    (ordenes || []).forEach(o => { porEstado[o.estado] = (porEstado[o.estado] || 0) + 1; });

    /* Ingresos por día del mes actual */
    const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const ingresosDiarios = Array.from({ length: diasMes }, (_, i) => ({ dia: i + 1, monto: 0 }));
    const addDia = (arr, campo) => (arr || []).forEach(r => {
      const d = new Date((r.fecha || '') + 'T12:00:00');
      if (!isNaN(d) && d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth())
        ingresosDiarios[d.getDate() - 1].monto += Number(r[campo] || 0);
    });
    addDia(ingresos, 'monto');
    addDia(facturas, 'total');

    /* Top clientes por facturación (6 meses) */
    const porCliente = {};
    const addCli = (arr, campo) => (arr || []).forEach(r => {
      const nom = r.clientes?.nombre;
      if (nom) porCliente[nom] = (porCliente[nom] || 0) + Number(r[campo] || 0);
    });
    addCli(ingresos, 'monto');
    addCli(facturas, 'total');
    const topClientes = Object.entries(porCliente)
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return { meses, porEstado, ingresosDiarios, topClientes };
  }
};
