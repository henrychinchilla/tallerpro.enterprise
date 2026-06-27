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

/* Rango ini/fin de un mes dado en formato 'YYYY-MM' (default: mes actual) */
function rangoMes(ym) {
  if (!ym) return mesActual();
  const [y,m] = ym.split('-').map(Number);
  return {
    ini: `${ym}-01`,
    fin: new Date(y, m, 0).toISOString().slice(0,10)
  };
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
    const { data } = await getSB().rpc('buscar_talleres', { q });
    return data || [];
  },

  /* ── SUPERADMIN / SaaS ────────────────────────────
     (todo esto pasa por RLS: tenants y tenant_pagos solo el superadmin) */
  async getTenantsAdmin() {
    const { data } = await getSB().from('tenants').select('*').order('created_at',{ascending:false});
    return data || [];
  },

  async crearTenant(fields) {
    const { data, error } = await getSB().from('tenants').insert(fields).select().single();
    return { data, error };
  },

  async updateTenantById(id, fields) {
    const { error } = await getSB().from('tenants').update(fields).eq('id', id);
    return { error };
  },

  /* Solo para rollback del alta de taller (si falla la creación del admin) */
  async deleteTenantById(id) {
    const { error } = await getSB().from('tenants').delete().eq('id', id);
    return { error };
  },

  async getTenantPagos(tenantId=null) {
    let q = getSB().from('tenant_pagos').select('*').order('fecha',{ascending:false});
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data } = await q;
    return data || [];
  },

  async upsertTenantPago(fields) {
    const { data, error } = await getSB().from('tenant_pagos').insert(fields).select().single();
    return { data, error };
  },

  async deleteTenantPago(id) {
    const { error } = await getSB().from('tenant_pagos').delete().eq('id', id);
    return !error;
  },

  /* ── RESPALDOS ────────────────────────────────────
     Bitácora (tabla) + exportación on-demand de los datos del taller. */
  async getBackups(tenantId=null) {
    let q = getSB().from('tenant_backups').select('*').order('fecha',{ascending:false});
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data } = await q;
    return data || [];
  },

  async registrarBackup(fields) {
    const { data, error } = await getSB().from('tenant_backups')
      .insert({ ...fields, tenant_id: fields.tenant_id || getTID() }).select().single();
    return { data, error };
  },

  /* Exporta los datos principales del taller en sesión (para descarga JSON). */
  async exportarDatosTenant() {
    const tid = getTID();
    /* Tablas con tenant_id, en orden de inserción (padres antes que hijos
       según sus llaves foráneas). 'entradas_detalle' no tiene tenant_id
       (depende de entradas_inventario) y se exporta por separado. */
    const TABLAS = [
      'clientes','proveedores','bodegas','bancos','combos','vacantes','documentos',
      'tenant_users','retenciones','licencias','mensajes','obligaciones_fiscales',
      'presupuesto','fel_importados','egresos_recurrentes','config_fiscal',
      'config_integraciones','config_productividad','activos','actividad_log',
      'ai_conversaciones','documentos_empresa','usuarios',
      'vehiculos','empleados','inventario','compras','entradas_inventario','egresos',
      'promociones','aplicantes','puntos_movimientos','feedback',
      'ordenes','compra_items','inv_movimientos','inventario_movimientos','asistencia',
      'disciplina','empleado_asignaciones','empleado_documentos','entrenamientos',
      'horas_extra','kpi_empleado','liquidaciones','llamadas_atencion','nomina',
      'pagos_nomina','vacaciones_movimientos','viaticos',
      'citas','facturas','cuentas_cobrar','ot_items','ot_repuestos','ot_servicios',
      'trabajos_externos',
      'factura_items','ingresos','abonos','envios',
      'banco_movimientos','traslados',
      'traslado_items',
    ];
    const dump = { _meta: { tenant_id: tid, generado: new Date().toISOString(), tablas: {} } };
    let totalReg = 0;
    for (const t of TABLAS) {
      try {
        const { data } = await getSB().from(t).select('*').eq('tenant_id', tid);
        dump[t] = data || [];
        dump._meta.tablas[t] = (data||[]).length;
        totalReg += (data||[]).length;
      } catch(_) { dump[t] = []; dump._meta.tablas[t] = 0; }
    }
    /* entradas_detalle no tiene tenant_id: depende de entradas_inventario */
    try {
      const ids = (dump['entradas_inventario']||[]).map(r=>r.id);
      let detalle = [];
      if (ids.length) {
        const { data } = await getSB().from('entradas_detalle').select('*').in('entrada_id', ids);
        detalle = data || [];
      }
      dump['entradas_detalle'] = detalle;
      dump._meta.tablas['entradas_detalle'] = detalle.length;
      totalReg += detalle.length;
    } catch(_) { dump['entradas_detalle'] = []; dump._meta.tablas['entradas_detalle'] = 0; }
    dump._meta.total_registros = totalReg;
    return dump;
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

  /* Lectura SIN caché (la usa Contabilidad: el régimen debe estar al día) */
  async getConfigFiscalFresh() {
    const { data } = await getSB().from('config_fiscal')
      .select('*').eq('tenant_id', getTID()).maybeSingle();
    if (data) localStorage.setItem('tp_fiscal_' + (getTID()||'demo'), JSON.stringify(data));
    return data;
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

  /* ── TRABAJOS EXTERNOS (subcontratados: torno, etc.) ── */
  async getTrabajosExternos(ordenId) {
    const { data } = await getSB().from('trabajos_externos').select('*')
      .eq('tenant_id', getTID()).eq('orden_id', ordenId).order('created_at');
    return data || [];
  },

  async upsertTrabajoExterno(fields) {
    const payload = { ...fields, tenant_id: getTID(), updated_at: new Date().toISOString() };
    if (fields.id) {
      const { error } = await getSB().from('trabajos_externos').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('trabajos_externos').insert(payload).select().single();
    return { data, error };
  },

  /* ── COTIZACIÓN DE SERVICIOS (universal, cualquier vertical) ── */
  async getCotizaciones(filtros={}) {
    let q = getSB().from('cotizaciones')
      .select('*, clientes(nombre,tel,email), vehiculos(placa,marca,modelo)')
      .eq('tenant_id', getTID()).order('created_at',{ascending:false});
    if (filtros.estado)        q = q.eq('estado', filtros.estado);
    if (filtros.modulo_origen) q = q.eq('modulo_origen', filtros.modulo_origen);
    const { data } = await q;
    return data || [];
  },

  async getCotizacion(id) {
    const { data } = await getSB().from('cotizaciones')
      .select('*, clientes(*), vehiculos(*), cotizacion_items(*)')
      .eq('id', id).maybeSingle();
    return data;
  },

  /* Guarda cabecera + reemplaza todas sus líneas (cotizacion_items) */
  async guardarCotizacion(fields, items=[]) {
    const payload = { ...fields, tenant_id: getTID(), updated_at: new Date().toISOString() };
    let cotId = fields.id;
    if (cotId) {
      const { error } = await getSB().from('cotizaciones').update(payload).eq('id', cotId);
      if (error) return { error };
    } else {
      const { count } = await getSB().from('cotizaciones').select('*',{count:'exact',head:true}).eq('tenant_id',getTID());
      payload.num = `COT-${new Date().getFullYear()}-${String((count||0)+1).padStart(4,'0')}`;
      const { data, error } = await getSB().from('cotizaciones').insert(payload).select().single();
      if (error) return { error };
      cotId = data.id;
    }
    await getSB().from('cotizacion_items').delete().eq('cotizacion_id', cotId);
    if (items.length) {
      const filas = items.map(it => ({ ...it, tenant_id: getTID(), cotizacion_id: cotId }));
      const { error: errItems } = await getSB().from('cotizacion_items').insert(filas);
      if (errItems) return { error: errItems };
    }
    return { data: { id: cotId } };
  },

  /* Convierte una cotización en una Orden de Trabajo (la marca "convertida") */
  async convertirCotizacionAOrden(id) {
    const cot = await this.getCotizacion(id);
    if (!cot) return { error: { message: 'Cotización no encontrada' } };
    const descripcion = (cot.cotizacion_items||[]).map(i=>`${i.cantidad}x ${i.descripcion}`).join('; ') || cot.notas || 'Generado desde cotización';
    const { data: orden, error } = await this.upsertOrden({
      cliente_id: cot.cliente_id, vehiculo_id: cot.vehiculo_id,
      descripcion, total: cot.total, saldo: cot.total
    });
    if (error) return { error };
    await getSB().from('cotizaciones').update({
      estado:'convertida', convertida_orden_id: orden.id, updated_at: new Date().toISOString()
    }).eq('id', id);
    return { data: orden };
  },

  /* ── HERRERÍA INDUSTRIAL Y VENTANERÍA PVC/ALUMINIO ───── */
  async getHerreriaProyectos(filtros={}) {
    let q = getSB().from('herreria_proyectos').select('*, clientes(nombre,tel,email), ordenes(num)')
      .eq('tenant_id', getTID()).order('created_at',{ascending:false});
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    const { data } = await q;
    return (data||[]).map(r=>({ ...r, ot_num: r.ordenes?.num||null }));
  },

  async upsertHerreriaProyecto(fields) {
    const payload = { ...fields, tenant_id: getTID(), updated_at: new Date().toISOString() };
    if (fields.id) {
      const { error } = await getSB().from('herreria_proyectos').update(payload).eq('id', fields.id);
      return { error };
    }
    const { count } = await getSB().from('herreria_proyectos').select('*',{count:'exact',head:true}).eq('tenant_id',getTID());
    payload.num = `HER-${new Date().getFullYear()}-${String((count||0)+1).padStart(4,'0')}`;
    const { data, error } = await getSB().from('herreria_proyectos').insert(payload).select().single();
    return { data, error };
  },

  /* ── PELETERÍA ────────────────────────────────────────── */
  async getPeleteriaPedidos(filtros={}) {
    let q = getSB().from('peleteria_pedidos').select('*, clientes(nombre,tel,email), ordenes(num)')
      .eq('tenant_id', getTID()).order('created_at',{ascending:false});
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    const { data } = await q;
    return (data||[]).map(r=>({ ...r, ot_num: r.ordenes?.num||null }));
  },

  async upsertPeleteriaPedido(fields) {
    const payload = { ...fields, tenant_id: getTID(), updated_at: new Date().toISOString() };
    if (fields.id) {
      const { error } = await getSB().from('peleteria_pedidos').update(payload).eq('id', fields.id);
      return { error };
    }
    const { count } = await getSB().from('peleteria_pedidos').select('*',{count:'exact',head:true}).eq('tenant_id',getTID());
    payload.num = `PEL-${new Date().getFullYear()}-${String((count||0)+1).padStart(4,'0')}`;
    const { data, error } = await getSB().from('peleteria_pedidos').insert(payload).select().single();
    return { data, error };
  },

  /* ── REPARACIONES ELECTRÓNICAS ───────────────────────── */
  async getReparacionesElectronicas(filtros={}) {
    let q = getSB().from('reparaciones_electronicas').select('*, clientes(nombre,tel,email), ordenes(num)')
      .eq('tenant_id', getTID()).order('created_at',{ascending:false});
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    const { data } = await q;
    return (data||[]).map(r=>({ ...r, ot_num: r.ordenes?.num||null }));
  },

  async upsertReparacionElectronica(fields) {
    const payload = { ...fields, tenant_id: getTID(), updated_at: new Date().toISOString() };
    if (fields.id) {
      const { error } = await getSB().from('reparaciones_electronicas').update(payload).eq('id', fields.id);
      return { error };
    }
    const { count } = await getSB().from('reparaciones_electronicas').select('*',{count:'exact',head:true}).eq('tenant_id',getTID());
    payload.num = `REP-${new Date().getFullYear()}-${String((count||0)+1).padStart(4,'0')}`;
    const { data, error } = await getSB().from('reparaciones_electronicas').insert(payload).select().single();
    return { data, error };
  },

  /* ── REPARACIÓN DE REFRIGERACIÓN Y A/C (vehicular/domiciliar/industrial) ── */
  async getRefrigeracionServicios(filtros={}) {
    let q = getSB().from('refrigeracion_servicios').select('*, clientes(nombre,tel,email), vehiculos(placa,marca,modelo), ordenes(num)')
      .eq('tenant_id', getTID()).order('created_at',{ascending:false});
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    const { data } = await q;
    return (data||[]).map(r=>({ ...r, ot_num: r.ordenes?.num||null }));
  },

  async upsertRefrigeracionServicio(fields) {
    const payload = { ...fields, tenant_id: getTID(), updated_at: new Date().toISOString() };
    if (fields.id) {
      const { error } = await getSB().from('refrigeracion_servicios').update(payload).eq('id', fields.id);
      return { error };
    }
    const { count } = await getSB().from('refrigeracion_servicios').select('*',{count:'exact',head:true}).eq('tenant_id',getTID());
    payload.num = `REF-${new Date().getFullYear()}-${String((count||0)+1).padStart(4,'0')}`;
    const { data, error } = await getSB().from('refrigeracion_servicios').insert(payload).select().single();
    return { data, error };
  },

  /* ── FIDELIZACIÓN / PUNTOS ─────────────────────── */
  /* Registra un movimiento de puntos y actualiza el saldo del cliente.
     puntos: positivo = gana, negativo = canje. Devuelve el nuevo saldo. */
  async registrarPuntos(clienteId, puntos, { tipo='gana', motivo=null, referencia=null, factura_id=null } = {}) {
    if (!clienteId || !puntos) return null;
    await getSB().from('puntos_movimientos').insert({
      tenant_id: getTID(), cliente_id: clienteId, tipo, puntos,
      motivo, referencia, factura_id, fecha: new Date().toISOString().slice(0,10)
    });
    const { data: c } = await getSB().from('clientes').select('puntos_saldo').eq('id', clienteId).maybeSingle();
    const nuevo = Math.max(0, (Number(c?.puntos_saldo)||0) + Number(puntos));
    await getSB().from('clientes').update({ puntos_saldo: nuevo, updated_at: new Date().toISOString() }).eq('id', clienteId);
    return nuevo;
  },

  async getPuntosMovimientos(clienteId, limite=100) {
    const { data } = await getSB().from('puntos_movimientos').select('*')
      .eq('tenant_id', getTID()).eq('cliente_id', clienteId)
      .order('created_at', { ascending:false }).limit(limite);
    return data || [];
  },

  /* ── ENVÍOS / FLETES (logística) ───────────────── */
  async getEnvios({ archivado = false } = {}) {
    const { data } = await getSB().from('envios').select('*')
      .eq('tenant_id', getTID()).eq('archivado', archivado)
      .order('fecha_envio', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    return data || [];
  },

  async upsertEnvio(fields) {
    const payload = { ...fields, tenant_id: getTID(), updated_at: new Date().toISOString() };
    if (fields.id) {
      const { error } = await getSB().from('envios').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('envios').insert(payload).select().single();
    return { data, error };
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
    /* codigo es obligatorio y es la clave de conflicto; generarlo si falta */
    if (!payload.codigo) payload.codigo = 'ART-' + Date.now().toString(36).toUpperCase();
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
      .select('*, inventario(nombre,codigo,unidad_medida)')
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

  /* ── RETENCIONES (ISR / IVA) ──────────────────── */
  async getRetenciones(ini=null, fin=null) {
    const m = mesActual();
    const { data } = await getSB().from('retenciones').select('*')
      .eq('tenant_id', getTID()).gte('fecha', ini||m.ini).lte('fecha', fin||m.fin)
      .order('fecha', { ascending:false });
    return data || [];
  },
  async upsertRetencion(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { error } = await getSB().from('retenciones').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('retenciones').insert(payload).select().single();
    return { data, error };
  },

  /* ── COMPRAS ──────────────────────────────────── */
  async getCompras() {
    const { data } = await getSB().from('compras').select('*')
      .eq('tenant_id', getTID()).order('fecha',{ascending:false}).order('created_at',{ascending:false});
    return data || [];
  },
  async getCompraItems(compraId) {
    const { data } = await getSB().from('compra_items').select('*').eq('compra_id', compraId);
    return data || [];
  },
  /* Presupuesto planificado de compras del año (categorías de insumos) */
  async getPresupuestoCompras(anio) {
    const { data } = await getSB().from('presupuesto').select('categoria,monto_plan,tipo')
      .eq('tenant_id', getTID()).eq('anio', anio);
    return (data||[]).filter(p => /compra|repuesto|insumo|aceite|inventario/i.test(p.categoria||''))
      .reduce((s,p)=>s+(Number(p.monto_plan)||0),0);
  },
  /* Registra una compra: cabecera + items, actualiza inventario (stock+costo)
     y crea el egreso (categoría Compras) que sale de la cuenta de egresos. */
  async registrarCompra({ cabecera, items }) {
    const tid = getTID();
    const { count } = await getSB().from('compras').select('*',{count:'exact',head:true}).eq('tenant_id',tid);
    const num = `CMP-${new Date().getFullYear()}-${String((count||0)+1).padStart(4,'0')}`;
    const total = items.reduce((s,i)=>s+(Number(i.total)||0),0);
    const subtotal = Math.round(total/1.12*100)/100;
    const iva = Math.round((total-subtotal)*100)/100;
    const fecha = cabecera.fecha || new Date().toISOString().slice(0,10);
    const { data: compra, error } = await getSB().from('compras').insert({
      tenant_id:tid, num, proveedor_id:cabecera.proveedor_id||null, proveedor_nombre:cabecera.proveedor_nombre||null,
      num_factura:cabecera.num_factura||null, fecha, subtotal, iva, total, estado:'recibida', notas:cabecera.notas||null,
      num_dua:cabecera.num_dua||null, cif_valor:cabecera.cif_valor||0,
      dai_monto:cabecera.dai_monto||0, iva_frontera:cabecera.iva_frontera||0,
      es_importacion:!!cabecera.es_importacion
    }).select().single();
    if (error || !compra) return { error };
    const rows = items.map(i=>({ tenant_id:tid, compra_id:compra.id, inventario_id:i.inventario_id||null,
      descripcion:i.descripcion, categoria:i.categoria||null, cantidad:i.cantidad, costo_unit:i.costo_unit, total:i.total }));
    await getSB().from('compra_items').insert(rows);
    /* Inventario: suma stock y actualiza el costo del artículo */
    for (const i of items) {
      if (!i.inventario_id || !(i.cantidad>0)) continue;
      const { data: inv } = await getSB().from('inventario').select('stock').eq('id', i.inventario_id).maybeSingle();
      if (!inv) continue;
      await getSB().from('inventario').update({
        stock: (Number(inv.stock)||0)+Number(i.cantidad), precio_costo: i.costo_unit, updated_at:new Date().toISOString()
      }).eq('id', i.inventario_id);
      await this.movimientoInventario({ inventario_id:i.inventario_id, tipo:'entrada', cantidad:i.cantidad,
        referencia:`Compra ${num}`, notas:cabecera.proveedor_nombre||null, fecha });
    }
    /* Egreso (categoría Compras) → cuenta de egresos + Finanzas */
    const eg = await this.upsertEgreso({
      concepto:`Compra ${num}${cabecera.proveedor_nombre?` — ${cabecera.proveedor_nombre}`:''}`,
      categoria:'Compras', monto:total, fecha, referencia:cabecera.num_factura||num
    });
    if (eg?.data?.id) await getSB().from('compras').update({ egreso_id: eg.data.id }).eq('id', compra.id);
    return { data: compra };
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

  /* Cuenta bancaria predeterminada para 'ingresos' o 'egresos'.
     Marca la cuenta con bandera; si no hay bandera pero existe UNA sola
     cuenta activa, esa es la predeterminada; con varias se decide por tipo:
     'ahorro' para ingresos y 'monetaria' para egresos; si queda una sola, esa toma el rol. */
  async _cuentaDefault(tipo) {
    const { data } = await getSB().from('bancos')
      .select('id,activa,tipo,predeterminada_ingresos,predeterminada_egresos').eq('tenant_id', getTID());
    const activas = (data||[]).filter(b => b.activa !== false);
    if (!activas.length) return null;
    if (activas.length === 1) return activas[0].id;

    // Buscar bandera explícita primero
    const flagged = activas.find(b => tipo==='ingresos' ? b.predeterminada_ingresos : b.predeterminada_egresos);
    if (flagged) return flagged.id;

    // Si no hay bandera, decidir por tipo de cuenta
    if (tipo === 'ingresos') {
      const ahorro = activas.find(b => b.tipo === 'ahorro' || b.tipo === 'ahorros');
      if (ahorro) return ahorro.id;
    } else {
      const monetaria = activas.find(b => b.tipo === 'monetaria');
      if (monetaria) return monetaria.id;
    }

    // Fallback: usar la primera activa
    return activas[0].id;
  },

  /* Registra automáticamente el movimiento bancario de un ingreso/egreso.
     (Deshabilitado en frontend; ahora manejado por triggers automáticos en la base de datos). */
  async _registrarBancoAuto(tipoMov, { monto, concepto, referencia, fecha }) {
    // No-op (manejado por triggers de base de datos para sincronización en tiempo real)
    return;
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
      if (!error && fields.estado === 'anulada') {
        const { data: fact } = await getSB().from('facturas').select('num').eq('id', fields.id).maybeSingle();
        if (fact?.num) {
          const { data: ing } = await getSB().from('ingresos').select('id').eq('tenant_id', getTID()).eq('referencia', fact.num).maybeSingle();
          if (ing?.id) {
            await getSB().from('ingresos').delete().eq('id', ing.id);
          }
          await getSB().from('banco_movimientos').delete().eq('tenant_id', getTID()).eq('referencia', fact.num);
        }
      }
      return { error };
    }
    /* Generar número correlativo (la columna num es obligatoria) */
    if (!payload.num) {
      const { count } = await getSB().from('facturas')
        .select('*',{count:'exact',head:true}).eq('tenant_id',getTID());
      payload.num = `FEL-${new Date().getFullYear()}-${String((count||0)+1).padStart(6,'0')}`;
    }
    /* El NIT del receptor es obligatorio; CF por defecto */
    if (!payload.nit) payload.nit = 'CF';
    const { data, error } = await getSB().from('facturas').insert(payload).select().single();
    if (data) {
      // Registrar como ingreso, lo cual registrará automáticamente el movimiento bancario en la cuenta de ahorros
      await this.upsertIngreso({
        concepto: `Factura ${data.num||''}`.trim(),
        categoria: 'Ventas',
        monto: data.total,
        referencia: data.num,
        cliente_id: data.cliente_id,
        orden_id: data.ot_id || data.orden_id,
        fecha: data.fecha,
        notas: data.notas || data.descripcion || `Facturado correlativo ${data.num||''}`
      });
      if (data.cliente_id) await this._retencionAutoFactura(data);
    }
    return { data, error };
  },

  /* Retención automática cuando el cliente es agente de retención (ISR/IVA).
     Crea retenciones 'sufridas' (nos las retuvieron, acreditables). */
  async _retencionAutoFactura(f) {
    const { data: c } = await getSB().from('clientes')
      .select('nombre,agente_retencion,ret_iva_pct,ret_isr_pct').eq('id', f.cliente_id).maybeSingle();
    if (!c || !c.agente_retencion) return;
    const base = Number(f.subtotal)||0, iva = Number(f.iva)||0;
    const rows = [];
    if (Number(c.ret_iva_pct)>0 && iva>0) rows.push({
      tenant_id:getTID(), fecha:f.fecha, tipo:'IVA', naturaleza:'sufrida', documento:f.num, contraparte:c.nombre,
      base:iva, porcentaje:c.ret_iva_pct, monto:Math.round(iva*c.ret_iva_pct/100*100)/100, notas:'Retención automática en factura'
    });
    if (Number(c.ret_isr_pct)>0 && base>0) rows.push({
      tenant_id:getTID(), fecha:f.fecha, tipo:'ISR', naturaleza:'sufrida', documento:f.num, contraparte:c.nombre,
      base, porcentaje:c.ret_isr_pct, monto:Math.round(base*c.ret_isr_pct/100*100)/100, notas:'Retención automática en factura'
    });
    if (rows.length) await getSB().from('retenciones').insert(rows);
  },

  /* Devuelve la factura existente de una OT (para evitar doble facturación) */
  async facturaDeOrden(ordenId) {
    if (!ordenId) return null;
    const { data } = await getSB().from('facturas')
      .select('id,num,fel_serie,fel_numero,ot_id').eq('tenant_id', getTID()).eq('ot_id', ordenId).limit(1);
    return data?.[0] || null;
  },

  /* Devuelve la factura existente de una cotización (para evitar doble facturación) */
  async facturaDeCotizacion(cotizacionId) {
    if (!cotizacionId) return null;
    const { data } = await getSB().from('facturas')
      .select('id,num,fel_serie,fel_numero,cotizacion_id').eq('tenant_id', getTID()).eq('cotizacion_id', cotizacionId).limit(1);
    return data?.[0] || null;
  },

  /* Marca la cotización como convertida tras facturarla directamente (sin pasar por OT) */
  async marcarCotizacionConvertida(cotizacionId, facturaId) {
    await getSB().from('cotizaciones').update({
      estado: 'convertida', convertida_factura_id: facturaId, updated_at: new Date().toISOString()
    }).eq('id', cotizacionId);
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

  /* ── CAPACITACIÓN (entrenamientos/seminarios/cursos) ── */
  async getEntrenamientos(empleadoId=null) {
    let q = getSB().from('entrenamientos').select('*,empleados(nombre,cargo)')
      .eq('tenant_id', getTID()).order('fecha_inicio', { ascending:false });
    if (empleadoId) q = q.eq('empleado_id', empleadoId);
    const { data } = await q;
    return data || [];
  },

  async upsertEntrenamiento(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (payload.id) {
      const { id, ...resto } = payload;
      const { error } = await getSB().from('entrenamientos').update(resto).eq('id', id);
      return { error };
    }
    const { data, error } = await getSB().from('entrenamientos').insert(payload).select().single();
    return { data, error };
  },

  /* ── ASIGNACIONES AL EMPLEADO (acta de entrega) ── */
  async getAsignaciones(empleadoId=null) {
    let q = getSB().from('empleado_asignaciones').select('*,empleados(nombre,cargo,dpi,email)')
      .eq('tenant_id', getTID()).order('fecha_entrega', { ascending:false });
    if (empleadoId) q = q.eq('empleado_id', empleadoId);
    const { data } = await q;
    return data || [];
  },

  async upsertAsignacion(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (payload.id) {
      const { id, ...resto } = payload;
      const { error } = await getSB().from('empleado_asignaciones').update(resto).eq('id', id);
      return { error };
    }
    const { data, error } = await getSB().from('empleado_asignaciones').insert(payload).select().single();
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
    const { data } = await getSB().from('pagos_nomina').select('*,empleados(nombre,cargo,igss,dpi)')
      .eq('tenant_id', getTID()).eq('periodo_mes', mes).eq('periodo_anio', anio);
    return data || [];
  },

  /* ── KPI MECÁNICOS — HORA-HOMBRE ─────────────────── */
  async getOtHoras(ordenId) {
    const { data } = await getSB().from('ot_horas')
      .select('*, empleados(nombre,cargo)')
      .eq('orden_id', ordenId)
      .eq('tenant_id', getTID())
      .order('fecha', { ascending: false });
    return data || [];
  },

  async upsertOtHoras({ orden_id, mecanico_id, fecha, horas, notas }) {
    const payload = { tenant_id: getTID(), orden_id, mecanico_id, fecha, horas, notas,
                      updated_at: new Date().toISOString() };
    const { data, error } = await getSB().from('ot_horas')
      .upsert(payload, { onConflict: 'tenant_id,orden_id,mecanico_id,fecha' })
      .select().single();
    return { data, error };
  },

  async deleteOtHoras(id) {
    const { error } = await getSB().from('ot_horas').delete()
      .eq('id', id).eq('tenant_id', getTID());
    return !error;
  },

  async getKpiMecanicos(ini, fin) {
    /* Horas por mecánico + OTs en el período */
    const [{ data: horas }, { data: ots }] = await Promise.all([
      getSB().from('ot_horas')
        .select('mecanico_id, horas, orden_id, fecha')
        .eq('tenant_id', getTID())
        .gte('fecha', ini).lte('fecha', fin),
      getSB().from('ordenes')
        .select('id, mecanico_id, estado, total, fecha_ingreso, fecha_estimada, fecha_entrega, es_garantia')
        .eq('tenant_id', getTID())
        .gte('fecha_ingreso', ini).lte('fecha_ingreso', fin)
    ]);
    return { horas: horas || [], ots: ots || [] };
  },

  async getOtHorasMecanicoDia(mecanicoId, fecha) {
    /* Horas que ya tiene un mecánico registradas en un día — para sugerir distribución */
    const { data } = await getSB().from('ot_horas')
      .select('horas, orden_id')
      .eq('tenant_id', getTID())
      .eq('mecanico_id', mecanicoId)
      .eq('fecha', fecha);
    return data || [];
  },

  /* Historial de scores/bonos para la tendencia del dashboard de KPIs */
  async getKpiHistorial() {
    const { data } = await getSB().from('kpi_empleado')
      .select('empleado_id,periodo_mes,periodo_anio,score,bono,aprobado')
      .eq('tenant_id', getTID());
    return data || [];
  },

  async upsertPagoNomina(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    /* Con id → UPDATE directo (ej. marcar pagado); sin id → upsert por periodo */
    if (payload.id) {
      const { id, ...resto } = payload;
      const { data, error } = await getSB().from('pagos_nomina')
        .update(resto).eq('id', id).select().single();
      return { data, error };
    }
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

  /* ── DOCUMENTOS LEGALES DE LA EMPRESA ──────────── */
  async getDocumentosEmpresa() {
    const { data } = await getSB().from('documentos_empresa').select('*')
      .eq('tenant_id', getTID()).order('created_at',{ ascending:false });
    return data || [];
  },

  async upsertDocumentoEmpresa(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { id, ...resto } = payload;
      const { error } = await getSB().from('documentos_empresa').update(resto).eq('id', id);
      return { error };
    }
    const { data, error } = await getSB().from('documentos_empresa').insert(payload).select().single();
    return { data, error };
  },

  /* ── RECLUTAMIENTO: vacantes + aplicantes ──────── */
  async getVacantes() {
    const { data } = await getSB().from('vacantes').select('*')
      .eq('tenant_id', getTID()).order('created_at',{ ascending:false });
    return data || [];
  },
  async upsertVacante(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { id, ...resto } = payload;
      const { error } = await getSB().from('vacantes').update(resto).eq('id', id);
      return { error };
    }
    const { data, error } = await getSB().from('vacantes').insert(payload).select().single();
    return { data, error };
  },
  async getAplicantes(vacanteId) {
    /* Solo aplicantes del último mes (visible en pantalla); los más
       antiguos quedan en historial para no cargar el sistema */
    const corte = new Date(); corte.setMonth(corte.getMonth() - 1);
    let q = getSB().from('aplicantes').select('*').eq('tenant_id', getTID())
      .gte('created_at', corte.toISOString());
    if (vacanteId) q = q.eq('vacante_id', vacanteId);
    const { data } = await q.order('created_at',{ ascending:false });
    return data || [];
  },
  async getAplicantesHistorial(vacanteId) {
    const corte = new Date(); corte.setMonth(corte.getMonth() - 1);
    let q = getSB().from('aplicantes').select('*').eq('tenant_id', getTID())
      .lt('created_at', corte.toISOString());
    if (vacanteId) q = q.eq('vacante_id', vacanteId);
    const { data } = await q.order('created_at',{ ascending:false });
    return data || [];
  },
  async upsertAplicante(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { id, ...resto } = payload;
      const { error } = await getSB().from('aplicantes').update(resto).eq('id', id);
      return { error };
    }
    const { data, error } = await getSB().from('aplicantes').insert(payload).select().single();
    return { data, error };
  },

  /* ── DISCIPLINA (Código de Trabajo) ─────────────── */
  async getDisciplina(empleadoId) {
    let q = getSB().from('disciplina').select('*,empleados(nombre)').eq('tenant_id', getTID());
    if (empleadoId) q = q.eq('empleado_id', empleadoId);
    const { data } = await q.order('fecha',{ ascending:false });
    return data || [];
  },
  async upsertDisciplina(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { id, ...resto } = payload;
      const { error } = await getSB().from('disciplina').update(resto).eq('id', id);
      return { error };
    }
    const { data, error } = await getSB().from('disciplina').insert(payload).select().single();
    return { data, error };
  },

  /* ── VACACIONES: movimientos de goce/pago ──────── */
  async getVacacionesMovimientos(empleadoId) {
    let q = getSB().from('vacaciones_movimientos').select('*,empleados(nombre)').eq('tenant_id', getTID());
    if (empleadoId) q = q.eq('empleado_id', empleadoId);
    const { data } = await q.order('created_at',{ ascending:false });
    return data || [];
  },
  async upsertVacacionMovimiento(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { id, ...resto } = payload;
      const { error } = await getSB().from('vacaciones_movimientos').update(resto).eq('id', id);
      return { error };
    }
    const { data, error } = await getSB().from('vacaciones_movimientos').insert(payload).select().single();
    return { data, error };
  },

  /* ── HORAS EXTRA / TRABAJO EN DÍA FERIADO ──────── */
  async getHorasExtra(mes, anio, soloPendientes) {
    let q = getSB().from('horas_extra').select('*,empleados(nombre)').eq('tenant_id', getTID());
    if (mes && anio) {
      const ini = `${anio}-${String(mes).padStart(2,'0')}-01`;
      const fin = `${anio}-${String(mes).padStart(2,'0')}-31`;
      q = q.gte('fecha', ini).lte('fecha', fin);
    }
    if (soloPendientes) q = q.eq('pagada', false);
    const { data } = await q.order('fecha',{ ascending:false });
    return data || [];
  },
  async upsertHoraExtra(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (fields.id) {
      const { id, ...resto } = payload;
      const { error } = await getSB().from('horas_extra').update(resto).eq('id', id);
      return { error };
    }
    const { data, error } = await getSB().from('horas_extra').insert(payload).select().single();
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

  /* ── TRASLADOS (workflow con firmas) ───────────── */
  async getTraslados() {
    const { data } = await getSB().from('traslados').select('*')
      .eq('tenant_id', getTID()).order('created_at', { ascending:false });
    return data || [];
  },
  async getTrasladoItems(trasladoId) {
    const { data } = await getSB().from('traslado_items').select('*').eq('traslado_id', trasladoId);
    return data || [];
  },
  async upsertTraslado(fields) {
    const payload = { ...fields, tenant_id: getTID(), updated_at: new Date().toISOString() };
    if (fields.id) {
      const { error } = await getSB().from('traslados').update(payload).eq('id', fields.id);
      return { error };
    }
    const { count } = await getSB().from('traslados').select('*',{count:'exact',head:true}).eq('tenant_id',getTID());
    payload.num = `TR-${new Date().getFullYear()}-${String((count||0)+1).padStart(4,'0')}`;
    const { data, error } = await getSB().from('traslados').insert(payload).select().single();
    return { data, error };
  },
  async insertTrasladoItems(trasladoId, items) {
    if (!items?.length) return;
    const rows = items.map(i => ({
      tenant_id: getTID(), traslado_id: trasladoId, inventario_id: i.inventario_id||null,
      nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad||null
    }));
    await getSB().from('traslado_items').insert(rows);
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

  /* ── FEEDBACK / ENCUESTAS ─────────────────────── */
  async getFeedback(limite=200) {
    const { data } = await getSB().from('feedback').select('*, clientes(nombre)')
      .eq('tenant_id', getTID()).order('created_at', { ascending:false }).limit(limite);
    return data || [];
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
    /* Las columnas fecha y hora son NOT NULL; derivarlas de fecha_cita */
    if (payload.fecha_cita) {
      if (!payload.fecha) payload.fecha = String(payload.fecha_cita).slice(0,10);
      if (!payload.hora)  payload.hora  = (String(payload.fecha_cita).slice(11,19) || '09:00:00');
    }
    if (fields.id) {
      const { error } = await getSB().from('citas').update(payload).eq('id', fields.id);
      return { error };
    }
    const { data, error } = await getSB().from('citas').insert(payload).select().single();
    return { data, error };
  },

  /* Sincroniza la cita de "entrega" de una OT en el calendario.
     - Si la OT tiene fecha estimada, crea/actualiza la cita.
     - Si se quitó la fecha, elimina la cita de entrega previa. */
  async syncCitaEntrega(orden) {
    if (!orden?.id) return;
    const { data: existentes } = await getSB().from('citas')
      .select('id').eq('tenant_id', getTID()).eq('ot_id', orden.id).eq('tipo','entrega_ot').limit(1);
    const existing = existentes?.[0];
    if (!orden.fecha_estimada) {
      if (existing) await getSB().from('citas').delete().eq('id', existing.id);
      return;
    }
    const payload = {
      titulo:      `🚗 Entrega ${orden.num||'OT'}${orden.placa?` · ${orden.placa}`:''}`,
      tipo:        'entrega_ot',
      ot_id:       orden.id,
      cliente_id:  orden.cliente_id || null,
      vehiculo_id: orden.vehiculo_id || null,
      empleado_id: orden.mecanico_id || null,
      fecha_cita:  `${orden.fecha_estimada}T09:00:00`,
      duracion_min: 60,
      estado:      'pendiente'
    };
    if (existing) payload.id = existing.id;
    return this.upsertCita(payload);
  },

  /* ── LICENCIAS ────────────────────────────────── */
  async getLicencia() {
    const { data } = await getSB().from('licencias')
      .select('*').eq('tenant_id', getTID()).maybeSingle();
    return data;
  },

  /* ── CONTABILIDAD / SAT ───────────────────────────
     Datos del periodo para la hoja de IVA (SAT-2237), ISR y los
     libros de compras y ventas. */
  async getFacturasPeriodo(ini, fin) {
    const { data } = await getSB().from('facturas')
      .select('id,num,fel_serie,fel_numero,fecha,nit,nombre_receptor,subtotal,iva,total,estado')
      .eq('tenant_id', getTID()).gte('fecha', ini).lte('fecha', fin).order('fecha');
    return data || [];
  },

  async getComprasPeriodo(ini, fin) {
    const { data } = await getSB().from('compras')
      .select('id,num,proveedor_nombre,num_factura,fecha,subtotal,iva,total,estado,es_importacion,num_dua,cif_valor,dai_monto,iva_frontera,es_combustible,petroleo')
      .eq('tenant_id', getTID()).gte('fecha', ini).lte('fecha', fin).order('fecha');
    return data || [];
  },

  async getEgresosIvaPeriodo(ini, fin) {
    const { data } = await getSB().from('egresos')
      .select('id,concepto,proveedor,num_factura,fecha,monto,iva_credito')
      .eq('tenant_id', getTID()).gt('iva_credito', 0)
      .gte('fecha', ini).lte('fecha', fin).order('fecha');
    return data || [];
  },

  async getRetencionesPeriodo(ini, fin) {
    const { data } = await getSB().from('retenciones')
      .select('*').eq('tenant_id', getTID())
      .gte('fecha', ini).lte('fecha', fin).order('fecha');
    return data || [];
  },

  async getObligaciones(anio) {
    const { data } = await getSB().from('obligaciones_fiscales')
      .select('*').eq('tenant_id', getTID())
      .like('periodo', `${anio}%`).order('fecha_vencimiento');
    return data || [];
  },

  /* FEL importado de SAT (Consulta FEL → CSV) */
  async getFelImportados(ini, fin, naturaleza=null) {
    let q = getSB().from('fel_importados').select('*')
      .eq('tenant_id', getTID()).gte('fecha', ini).lte('fecha', fin).order('fecha');
    if (naturaleza) q = q.eq('naturaleza', naturaleza);
    const { data } = await q;
    return data || [];
  },

  async insertFelImportados(rows) {
    const tid = getTID();
    /* upsert idempotente: inserta solo los DTE nuevos, ignora los ya cargados
       (clave única tenant_id, serie, numero_dte). ignoreDuplicates evita duplicar. */
    const { data, error } = await getSB().from('fel_importados')
      .upsert(rows.map(r => ({ ...r, tenant_id: tid })),
              { onConflict: 'tenant_id,serie,numero_dte', ignoreDuplicates: true })
      .select('id');
    return { count: data?.length||0, error };
  },

  async deleteFelPeriodo(ini, fin, naturaleza) {
    const { error } = await getSB().from('fel_importados').delete()
      .eq('tenant_id', getTID()).eq('naturaleza', naturaleza)
      .gte('fecha', ini).lte('fecha', fin);
    return { error };
  },

  async upsertObligacion(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (payload.id) {
      const { id, ...resto } = payload;
      const { data, error } = await getSB().from('obligaciones_fiscales')
        .update(resto).eq('id', id).select().single();
      return { data, error };
    }
    const { data, error } = await getSB().from('obligaciones_fiscales')
      .insert(payload).select().single();
    return { data, error };
  },

  /* Formularios SAT (DeclaraGuate) — declaraciones llenables */
  async getFormulariosTributarios() {
    const { data } = await getSB().from('formularios_tributarios')
      .select('*').eq('tenant_id', getTID()).order('created_at', { ascending: false });
    return data || [];
  },

  async upsertFormularioTributario(fields) {
    const payload = { ...fields, tenant_id: getTID() };
    if (payload.id) {
      const { id, ...resto } = payload;
      const { data, error } = await getSB().from('formularios_tributarios')
        .update(resto).eq('id', id).select().single();
      return { data, error };
    }
    const { data, error } = await getSB().from('formularios_tributarios')
      .insert(payload).select().single();
    return { data, error };
  },

  /* ── KPIs DASHBOARD ───────────────────────────── */
  async getKPIs(ym=null) {
    const { ini, fin } = rangoMes(ym);
    const tid = getTID();
    const [
      { count: clientes },
      { count: otsActivas },
      { data: ingresos },
      { data: invBajo }
    ] = await Promise.all([
      getSB().from('clientes').select('*',{count:'exact',head:true}).eq('tenant_id',tid),
      getSB().from('ordenes').select('*',{count:'exact',head:true}).eq('tenant_id',tid).not('estado','in','("entregado","cancelado")'),
      getSB().from('ingresos').select('monto').eq('tenant_id',tid).gte('fecha',ini).lte('fecha',fin),
      getSB().from('inventario').select('id,nombre,stock,min_stock').eq('tenant_id',tid).limit(500)
    ]);
    const ingDir  = (ingresos||[]).reduce((s,i)=>s+(i.monto||0),0);
    const invBajoFiltrado = (invBajo||[]).filter(i => (i.stock ?? 0) <= (i.min_stock ?? 0));
    return {
      clientes:   clientes||0,
      otsActivas: otsActivas||0,
      ingresos:   ingDir,
      invBajo:    invBajoFiltrado,
      mesIni:     ini,
      mesFin:     fin
    };
  },

  /* ── DATOS PARA GRÁFICAS DEL DASHBOARD ─────────── */
  async getDashboardData(ym=null) {
    const tid = getTID();
    /* Mes ancla: el seleccionado o el actual */
    const anc = ym ? new Date(Number(ym.split('-')[0]), Number(ym.split('-')[1]) - 1, 1) : new Date();
    const ancY = anc.getFullYear(), ancM = anc.getMonth();
    /* Ventana de 6 meses que TERMINA en el mes ancla */
    const desde = new Date(ancY, ancM - 5, 1);
    const desdeStr = desde.toISOString().slice(0, 10);
    const hastaStr = new Date(ancY, ancM + 1, 0).toISOString().slice(0, 10);

    const [
      { data: ingresos },
      { data: egresos },
      { data: ordenes }
    ] = await Promise.all([
      getSB().from('ingresos').select('monto,fecha,clientes(nombre)').eq('tenant_id', tid).gte('fecha', desdeStr).lte('fecha', hastaStr),
      getSB().from('egresos').select('monto,fecha').eq('tenant_id', tid).gte('fecha', desdeStr).lte('fecha', hastaStr),
      getSB().from('ordenes').select('estado').eq('tenant_id', tid)
    ]);

    /* Buckets de los 6 meses que terminan en el mes ancla */
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ancY, ancM - i, 1);
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
    bucket(ingresos, 'monto', 'ingresos');   // las facturas ya entran como ingreso 'Ventas'
    bucket(egresos,  'monto', 'egresos');

    /* Conteo de órdenes por estado */
    const porEstado = {};
    (ordenes || []).forEach(o => { porEstado[o.estado] = (porEstado[o.estado] || 0) + 1; });

    /* Ingresos por día del mes ancla */
    const diasMes = new Date(ancY, ancM + 1, 0).getDate();
    const ingresosDiarios = Array.from({ length: diasMes }, (_, i) => ({ dia: i + 1, monto: 0 }));
    const addDia = (arr, campo) => (arr || []).forEach(r => {
      const d = new Date((r.fecha || '') + 'T12:00:00');
      if (!isNaN(d) && d.getFullYear() === ancY && d.getMonth() === ancM)
        ingresosDiarios[d.getDate() - 1].monto += Number(r[campo] || 0);
    });
    addDia(ingresos, 'monto');

    /* Top clientes por facturación (6 meses que terminan en el mes ancla) */
    const porCliente = {};
    const addCli = (arr, campo) => (arr || []).forEach(r => {
      const nom = r.clientes?.nombre;
      if (nom) porCliente[nom] = (porCliente[nom] || 0) + Number(r[campo] || 0);
    });
    addCli(ingresos, 'monto');
    const topClientes = Object.entries(porCliente)
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return { meses, porEstado, ingresosDiarios, topClientes };
  },

  /* ── HISTORIAL BETO IA (CRUD) ─────────────────── */
  async getBetoHistorial(limite = 10) {
    const uid = window.Auth?.user?.id;
    let q = getSB().from('ai_conversaciones')
      .select('id, modo, pregunta, respuesta, created_at')
      .eq('tenant_id', getTID())
      .order('created_at', { ascending: false })
      .limit(limite);
    if (uid) q = q.eq('usuario_id', uid);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async deleteBetoConversacion(id) {
    const { error } = await getSB().from('ai_conversaciones')
      .delete()
      .eq('id', id)
      .eq('tenant_id', getTID());
    if (error) throw error;
  },

  /* ── Sincronizar FEL con Compras ──────────────────────────── */
  async getFelSinImportar(naturaleza = 'recibida') {
    const tid = getTID();
    const [felResp, importResp] = await Promise.all([
      getSB().from('fel_importados')
        .select('*')
        .eq('tenant_id', tid)
        .eq('naturaleza', naturaleza)
        .order('fecha', { ascending: false }),
      getSB().from('compras')
        .select('fel_importado_id')
        .eq('tenant_id', tid)
        .not('fel_importado_id', 'is', null)
    ]);
    if (felResp.error) throw felResp.error;
    const importadosSet = new Set((importResp.data||[]).map(c => c.fel_importado_id));
    return (felResp.data||[]).filter(f => !importadosSet.has(f.id));
  },

  _felACompra(fel, tid) {
    return {
      tenant_id: tid,
      fel_importado_id: fel.id,
      proveedor_nombre: fel.nombre_emisor,
      num_factura: `${fel.serie||''} ${fel.numero_dte||''}`.trim(),
      fecha: fel.fecha,
      subtotal: Math.round((fel.gran_total - (fel.iva||0)) * 100) / 100,
      iva: Math.round((fel.iva||0) * 100) / 100,
      total: fel.gran_total,
      estado: /anulad/i.test(fel.estado||'') ? 'anulada' : 'recibida',
      es_importacion: false,
      es_combustible: !!fel.es_combustible,
      petroleo: Number(fel.petroleo)||0,
      notas: `Importada desde FEL del SAT - ${fel.numero_autorizacion||''}`
    };
  },

  /* Crea compras desde una lista de FEL ids — idempotente (upsert ignora duplicados).
     Devuelve { count: nuevas creadas, omitidas: ya existían, errors }. */
  async crearComprasDesdeFeL(felIds) {
    const tid = getTID();
    if (!felIds?.length) return { count: 0, omitidas: 0, errors: 0 };
    const { data: fels, error: felErr } = await getSB().from('fel_importados')
      .select('*').eq('tenant_id', tid).in('id', felIds);
    if (felErr) { console.error('crearComprasDesdeFeL:', felErr); return { count: 0, omitidas: 0, errors: 1 }; }

    const compras = (fels||[]).map(f => this._felACompra(f, tid));
    let count = 0, errors = 0;
    for (let i = 0; i < compras.length; i += 200) {
      const { data, error } = await getSB().from('compras')
        .upsert(compras.slice(i, i+200),
                { onConflict: 'tenant_id,fel_importado_id', ignoreDuplicates: true })
        .select('id');
      if (error) { errors++; console.error('crearComprasDesdeFeL upsert:', error.message); }
      count += data?.length || 0;
    }
    return { count, omitidas: compras.length - count, errors };
  }
};
