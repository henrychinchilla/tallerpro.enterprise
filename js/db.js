/* ═══════════════════════════════════════════════════════
   db.js — Capa de datos conectada a Supabase
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://oanguccrxleznozumpbi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hbmd1Y2NyeGxlem5venVtcGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODk4MzEsImV4cCI6MjA5Mjk2NTgzMX0.DcQS5AMHV3s4k-tvLlpb8ZWzkODPOSaiQjP1rLJVPAs';

/* ── CLIENTE SUPABASE (via CDN en index.html) ───────── */
let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;
  _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _supabase;
}

/* ══════════════════════════════════════════════════════
   getTenantId — MULTI-TENANT REAL
   Lee siempre de Auth.tenant.id (sesión activa).
   Cada usuario ve SOLO los datos de su taller.
   Se resetea al hacer logout.
══════════════════════════════════════════════════════ */
function getTenantId() {
  /* Auth.tenant.id se establece al hacer login en auth.js */
  const id = (typeof Auth !== 'undefined') ? Auth?.tenant?.id : null;

  if (!id) {
    /* Sin sesión activa — no devolver ningún tenant para no filtrar datos de otro */
    console.warn('getTenantId: sin sesión de taller activa');
    return Promise.resolve(null);
  }

  return Promise.resolve(id);
}

/* Resetear caché al cambiar de taller/sesión */
function resetTenantCache() {
  /* Ya no hay caché que resetear — siempre lee de Auth.tenant.id */
  console.log('Session tenant:', typeof Auth !== 'undefined' ? Auth?.tenant?.name : 'none');
}

/* Expose getSupabase for direct use in modules */
window.getSupabase = getSupabase;
window.getTenantId = getTenantId;

/* ═══════════════════════════════════════════════════════
   DB — API unificada para todos los módulos
═══════════════════════════════════════════════════════ */
const DB = {

  /* ── UTILIDADES ───────────────────────────────────── */
  uid() {
    return crypto.randomUUID();
  },

  nextOTNum(total) {
    return 'OT-' + new Date().getFullYear() + '-' + String(140 + total + 1).padStart(4, '0');
  },

  nextFacturaNum(total) {
    return 'FEL-' + new Date().getFullYear() + '-' + String(456 + total + 1).padStart(6, '0');
  },

  /* ── TENANTS ──────────────────────────────────────── */
  async getTenant() {
    const { data } = await getSupabase()
      .from('tenants')
      .select('*')
      .eq('slug', TENANT_SLUG)
      .single();
    return data;
  },

  async updateTenant(fields) {
    const id = await getTenantId();
    const { error } = await getSupabase()
      .from('tenants')
      .update(fields)
      .eq('id', id);
    return !error;
  },

  /* ── CLIENTES ─────────────────────────────────────── */
  async getClientes() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('clientes')
      .select('*')
      .eq('tenant_id', id)
      .eq('activo', true)
      .order('nombre');
    return data || [];
  },

  async insertCliente(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase()
      .from('clientes')
      .insert({ ...fields, tenant_id: id })
      .select()
      .single();
    return { data, error };
  },

  async updateCliente(clienteId, fields) {
    const { error } = await getSupabase()
      .from('clientes')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', clienteId);
    return !error;
  },

  /* ── VEHÍCULOS ────────────────────────────────────── */
  async getVehiculos() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('vehiculos')
      .select('*, clientes(nombre, tel)')
      .eq('tenant_id', id)
      .order('placa');
    return data || [];
  },

  async getVehiculosByCliente(clienteId) {
    const { data } = await getSupabase()
      .from('vehiculos')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('placa');
    return data || [];
  },

  async insertVehiculo(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase()
      .from('vehiculos')
      .insert({ ...fields, tenant_id: id })
      .select()
      .single();
    return { data, error };
  },

  /* ── EMPLEADOS ────────────────────────────────────── */
  async getEmpleados() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('empleados')
      .select('*')
      .eq('tenant_id', id)
      .eq('activo', true)
      .order('nombre');
    return data || [];
  },

  async insertEmpleado(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase()
      .from('empleados')
      .insert({ ...fields, tenant_id: id })
      .select()
      .single();
    return { data, error };
  },

  /* ── ÓRDENES ──────────────────────────────────────── */
  async getOrdenes() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('ordenes')
      .select(`
        *,
        vehiculos(placa, marca, modelo, anio, kilometraje),
        clientes(nombre, tel),
        empleados(nombre)
      `)
      .eq('tenant_id', id)
      .order('created_at', { ascending: false });
    return data || [];
  },

  async getOrden(ordenId) {
    const { data } = await getSupabase()
      .from('ordenes')
      .select(`
        *,
        vehiculos(*),
        clientes(*),
        empleados(nombre, cargo),
        ot_servicios(*),
        ot_repuestos(*, inventario(nombre, codigo))
      `)
      .eq('id', ordenId)
      .single();
    return data;
  },

  async insertOrden(fields) {
    const id  = await getTenantId();
    const all = await this.getOrdenes();
    const num = this.nextOTNum(all.length);
    const { data, error } = await getSupabase()
      .from('ordenes')
      .insert({ ...fields, tenant_id: id, num })
      .select()
      .single();
    return { data, error };
  },

  async updateOrdenEstado(ordenId, estado) {
    const { error } = await getSupabase()
      .from('ordenes')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', ordenId);
    return !error;
  },

  async updateOrden(ordenId, fields) {
    const { error } = await getSupabase()
      .from('ordenes')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', ordenId);
    return !error;
  },

  /* ── INVENTARIO ───────────────────────────────────── */
  async getInventario() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('inventario')
      .select('*')
      .eq('tenant_id', id)
      .eq('activo', true)
      .order('nombre');
    return data || [];
  },

  async insertProducto(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase()
      .from('inventario')
      .insert({ ...fields, tenant_id: id })
      .select()
      .single();
    return { data, error };
  },

  async updateStock(productoId, delta, tipo, referencia = '') {
    const tid = await getTenantId();
    const { data: prod } = await getSupabase()
      .from('inventario')
      .select('stock')
      .eq('id', productoId)
      .single();

    const nuevoStock = (prod?.stock || 0) + delta;
    if (nuevoStock < 0) return { error: 'Stock insuficiente' };

    await getSupabase()
      .from('inventario')
      .update({ stock: nuevoStock, updated_at: new Date().toISOString() })
      .eq('id', productoId);

    await getSupabase()
      .from('inv_movimientos')
      .insert({
        tenant_id:   tid,
        repuesto_id: productoId,
        tipo,
        cantidad:    Math.abs(delta),
        referencia
      });

    return { error: null };
  },

  /* ── CITAS ────────────────────────────────────────── */
  async getCitas() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('citas')
      .select('*, clientes(nombre), vehiculos(placa, marca, modelo)')
      .eq('tenant_id', id)
      .order('fecha')
      .order('hora');
    return data || [];
  },

  async insertCita(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase()
      .from('citas')
      .insert({ ...fields, tenant_id: id })
      .select()
      .single();
    return { data, error };
  },

  /* ── FACTURAS ─────────────────────────────────────── */
  async getFacturas() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('facturas')
      .select('*, clientes(nombre)')
      .eq('tenant_id', id)
      .order('created_at', { ascending: false });
    return data || [];
  },

  async insertFactura(fields) {
    const id  = await getTenantId();
    const all = await this.getFacturas();
    const num = this.nextFacturaNum(all.length);
    const { data, error } = await getSupabase()
      .from('facturas')
      .insert({ ...fields, tenant_id: id, num })
      .select()
      .single();
    return { data, error };
  },

  async updateFactura(facturaId, fields) {
    const { error } = await getSupabase()
      .from('facturas')
      .update(fields)
      .eq('id', facturaId);
    return !error;
  },

  /* ── DASHBOARD KPIs ───────────────────────────────── */
  async getKPIs() {
    const id = await getTenantId();

    /* Mes actual — solo mostrar datos del mes en curso */
    const ahora   = new Date();
    const mesIni  = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().slice(0,10);
    const mesFin  = new Date(ahora.getFullYear(), ahora.getMonth()+1, 0).toISOString().slice(0,10);

    const [
      { count: totalClientes },
      { count: otActivas },
      { data: facturasMes },
      { data: ingresosMes },
      { data: invData }
    ] = await Promise.all([
      getSupabase().from('clientes').select('*', { count:'exact', head:true }).eq('tenant_id', id).eq('activo', true),
      getSupabase().from('ordenes').select('*',  { count:'exact', head:true }).eq('tenant_id', id).not('estado','in','("entregado","cancelado")'),
      getSupabase().from('facturas').select('total').eq('tenant_id', id).eq('estado','certificada').gte('fecha', mesIni).lte('fecha', mesFin),
      getSupabase().from('ingresos').select('monto').eq('tenant_id', id).gte('fecha', mesIni).lte('fecha', mesFin),
      getSupabase().from('inventario').select('id,nombre,stock,min_stock').eq('tenant_id', id).eq('activo', true)
    ]);

    /* Ingresos = facturas certificadas del mes + ingresos directos del mes */
    const ingFact = (facturasMes || []).reduce((s,f) => s+(f.total||0), 0);
    const ingDir  = (ingresosMes || []).reduce((s,i) => s+(i.monto||0), 0);
    const ingresos  = ingFact + ingDir;
    const stockBajo = (invData || []).filter(i => (i.stock||0) <= (i.min_stock||2));

    return { totalClientes: totalClientes||0, otActivas: otActivas||0, ingresos, stockBajo, mesIni, mesFin };
  },

  /* ── PROVEEDORES ──────────────────────────────────── */
  async getProveedores() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('proveedores')
      .select('*')
      .eq('tenant_id', id)
      .eq('activo', true)
      .order('nombre');
    return data || [];
  },

  async insertProveedor(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase()
      .from('proveedores')
      .insert({ ...fields, tenant_id: id })
      .select().single();
    return { data, error };
  },

  async updateProveedor(proveedorId, fields) {
    const { error } = await getSupabase()
      .from('proveedores')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', proveedorId);
    return !error;
  },

  /* ── ENTRADAS DE INVENTARIO ───────────────────────── */
  async getEntradas() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('entradas_inventario')
      .select('*, proveedores(nombre)')
      .eq('tenant_id', id)
      .order('created_at', { ascending: false });
    return data || [];
  },

  async getEntradasByProveedor(proveedorId) {
    const { data } = await getSupabase()
      .from('entradas_inventario')
      .select('*')
      .eq('proveedor_id', proveedorId)
      .order('fecha', { ascending: false });
    return data || [];
  },

  async insertEntrada(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase()
      .from('entradas_inventario')
      .insert({ ...fields, tenant_id: id })
      .select().single();
    return { data, error };
  },

  async insertEntradaDetalle(fields) {
    const { data, error } = await getSupabase()
      .from('entradas_detalle')
      .insert(fields)
      .select().single();
    return { data, error };
  },

  /* ── VIÁTICOS ─────────────────────────────────────── */
  async getViaticos(empleadoId = null) {
    const id = await getTenantId();
    let q = getSupabase().from('viaticos')
      .select('*, empleados(nombre, cargo)')
      .eq('tenant_id', id)
      .order('fecha', { ascending: false });
    if (empleadoId) q = q.eq('empleado_id', empleadoId);
    const { data } = await q;
    return data || [];
  },
  async insertViatico(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase().from('viaticos')
      .insert({ ...fields, tenant_id: id }).select().single();
    return { data, error };
  },
  async updateViatico(viaticoId, fields) {
    const { error } = await getSupabase().from('viaticos').update(fields).eq('id', viaticoId);
    return !error;
  },

  /* ── ENTRENAMIENTOS ───────────────────────────────── */
  async getEntrenamientos(empleadoId = null) {
    const id = await getTenantId();
    let q = getSupabase().from('entrenamientos')
      .select('*, empleados(nombre)')
      .eq('tenant_id', id)
      .order('fecha_inicio', { ascending: false });
    if (empleadoId) q = q.eq('empleado_id', empleadoId);
    const { data } = await q;
    return data || [];
  },
  async insertEntrenamiento(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase().from('entrenamientos')
      .insert({ ...fields, tenant_id: id }).select().single();
    return { data, error };
  },

  /* ── LLAMADAS DE ATENCIÓN ─────────────────────────── */
  async getLlamadasAtencion(empleadoId = null) {
    const id = await getTenantId();
    let q = getSupabase().from('llamadas_atencion')
      .select('*, empleados(nombre)')
      .eq('tenant_id', id)
      .order('fecha', { ascending: false });
    if (empleadoId) q = q.eq('empleado_id', empleadoId);
    const { data } = await q;
    return data || [];
  },
  async insertLlamadaAtencion(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase().from('llamadas_atencion')
      .insert({ ...fields, tenant_id: id }).select().single();
    return { data, error };
  },

  /* ── LIQUIDACIONES ────────────────────────────────── */
  async getLiquidaciones() {
    const id = await getTenantId();
    const { data } = await getSupabase().from('liquidaciones')
      .select('*, empleados(nombre, cargo, fecha_ingreso)')
      .eq('tenant_id', id)
      .order('created_at', { ascending: false });
    return data || [];
  },
  async insertLiquidacion(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase().from('liquidaciones')
      .insert({ ...fields, tenant_id: id }).select().single();
    return { data, error };
  },
  async updateLiquidacion(id, fields) {
    const { error } = await getSupabase().from('liquidaciones').update(fields).eq('id', id);
    return !error;
  },

  /* ── FEL IMPORTADOS ───────────────────────────────── */
  async getFelImportados() {
    const id = await getTenantId();
    const { data } = await getSupabase().from('fel_importados')
      .select('*').eq('tenant_id', id)
      .order('fecha', { ascending: false });
    return data || [];
  },
  async insertFelImportados(rows) {
    const id = await getTenantId();
    const payload = rows.map(r => ({ ...r, tenant_id: id }));
    const { data, error } = await getSupabase().from('fel_importados')
      .upsert(payload, { onConflict: 'tenant_id,serie,numero_dte' }).select();
    return { data, error };
  },

  /* ── CITAS (update con campos nuevos) ─────────────── */
  async updateCita(citaId, fields) {
    const { error } = await getSupabase().from('citas').update(fields).eq('id', citaId);
    return !error;
  },
  async deleteCita(citaId) {
    const { error } = await getSupabase().from('citas').delete().eq('id', citaId);
    return !error;
  },

  /* ── DOCUMENTOS DE EMPLEADOS ──────────────────────── */
  async getDocumentosEmpleado(empleadoId) {
    const { data } = await getSupabase()
      .from('empleado_documentos')
      .select('*')
      .eq('empleado_id', empleadoId)
      .order('tipo');
    return data || [];
  },
  async upsertDocumento(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase()
      .from('empleado_documentos')
      .upsert({ ...fields, tenant_id: id }, { onConflict: 'empleado_id,tipo' })
      .select().single();
    return { data, error };
  },
  async deleteDocumento(docId) {
    const { error } = await getSupabase().from('empleado_documentos').delete().eq('id', docId);
    return !error;
  },

  /* ── LICENCIAS ────────────────────────────────────── */
  async verificarLicencia(tenantId) {
    try {
      const { data, error } = await getSupabase()
        .rpc('verificar_licencia', { p_tenant_id: tenantId });
      if (error) throw error;
      return data;
    } catch(e) {
      console.warn('verificarLicencia error:', e);
      // Fallback: asumir demo válido si no se puede verificar
      return { valida: true, tipo: 'demo', dias_restantes: 30, mensaje: 'Modo local' };
    }
  },

  async getLicencia(tenantId) {
    const { data } = await getSupabase()
      .from('licencias')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return data;
  },

  async activarLicencia(tenantId, codigo, activadoPor) {
    // Verificar que el código no esté en uso
    const { data: existing } = await getSupabase()
      .from('licencias')
      .select('tenant_id')
      .eq('codigo', codigo)
      .maybeSingle();
    if (existing) return { ok: false, error: 'Este código ya fue utilizado' };

    const { error } = await getSupabase()
      .from('licencias')
      .update({
        tipo:             'completa',
        codigo,
        activa:           true,
        activada_por:     activadoPor,
        fecha_vencimiento:null,
        updated_at:       new Date().toISOString()
      })
      .eq('tenant_id', tenantId);
    return { ok: !error, error: error?.message };
  },

  /* ── CREAR TALLER NUEVO ───────────────────────────── */
  async crearTaller(nombre, nit, email) {
    try {
      const { data, error } = await getSupabase()
        .rpc('crear_taller', {
          p_nombre: nombre,
          p_nit:    nit || null,
          p_email:  email || null
        });
      if (error) throw error;
      return { ok: true, tenantId: data };
    } catch(e) {
      // Fallback manual si la función RPC no existe aún
      const slug = nombre.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').slice(0,40)
                   + '-' + Date.now().toString(36);
      const { data: tenant, error: tErr } = await getSupabase()
        .from('tenants')
        .insert({ slug, name: nombre, nit: nit||null, email: email||null })
        .select().single();
      if (tErr) return { ok: false, error: tErr.message };
      // Crear licencia demo
      await getSupabase().from('licencias').insert({
        tenant_id: tenant.id, tipo: 'demo',
        fecha_inicio: new Date().toISOString().slice(0,10),
        fecha_vencimiento: new Date(Date.now()+30*86400000).toISOString().slice(0,10)
      });
      // Crear config fiscal
      await getSupabase().from('config_fiscal')
        .insert({ tenant_id: tenant.id, regimen_iva: 'general', tasa_iva: 0.12, tasa_isr: 0.05 });
      return { ok: true, tenantId: tenant.id, tenant };
    }
  },

  /* ── BUSCAR TALLER ────────────────────────────────── */
  async buscarTalleres(query) {
    const { data } = await getSupabase()
      .from('tenants')
      .select('id,slug,name,nit,logo_base64')
      .or(`name.ilike.%${query}%,nit.ilike.%${query}%`)
      .limit(8);
    return data || [];
  },

  /* ── PAGOS DE NÓMINA ──────────────────────────────── */
  async getPagosNomina(empleadoId = null) {
    const id = await getTenantId();
    let q = getSupabase().from('pagos_nomina')
      .select('*, empleados(nombre,cargo,banco,num_cuenta,nombre_cuenta)')
      .eq('tenant_id', id)
      .order('periodo_anio', { ascending: false })
      .order('periodo_mes',  { ascending: false });
    if (empleadoId) q = q.eq('empleado_id', empleadoId);
    const { data } = await q;
    return data || [];
  },
  async insertPagoNomina(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase()
      .from('pagos_nomina')
      .insert({ ...fields, tenant_id: id })
      .select().single();
    return { data, error };
  },
  async updatePagoNomina(pagoId, fields) {
    const { error } = await getSupabase().from('pagos_nomina').update(fields).eq('id', pagoId);
    return !error;
  },

  /* ── ACTUALIZAR EMPLEADO ──────────────────────────── */
  async updateEmpleado(empleadoId, fields) {
    const { error } = await getSupabase()
      .from('empleados')
      .update(fields)
      .eq('id', empleadoId);
    return !error;
  },

  /* ── CONFIG FISCAL ────────────────────────────────── */
  async getConfigFiscal() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('config_fiscal')
      .select('*')
      .eq('tenant_id', id)
      .single();
    return data || {};
  },

  async updateConfigFiscal(fields) {
    /* Siempre guardar en localStorage primero (funciona en demo Y en prod) */
    localStorage.setItem('tp_config_fiscal', JSON.stringify(fields));

    /* Intentar guardar en Supabase solo si hay tenant real (UUID válido) */
    const id = await getTenantId();
    const isRealUUID = id && id.length === 36 && id.includes('-') && id !== 'demo-tenant-id';
    if (!isRealUUID) return true; // En demo: localStorage es suficiente

    const payload = {
      tenant_id:        id,
      regimen_iva:      fields.regimen_iva      || 'general',
      tasa_iva:         fields.tasa_iva         ?? 0.12,
      tasa_isr:         fields.tasa_isr         ?? 0.05,
      num_patrono_igss: fields.num_patrono_igss || '',
      cuota_laboral:    fields.cuota_laboral    ?? 0.0483,
      cuota_patronal:   fields.cuota_patronal   ?? 0.1267,
      intecap:          fields.intecap          ?? 0.01,
      aplica_irtra:     fields.aplica_irtra     ?? true,
      updated_at:       new Date().toISOString()
    };

    const { error } = await getSupabase()
      .from('config_fiscal')
      .upsert(payload, { onConflict: 'tenant_id' });

    if (error) console.error('updateConfigFiscal Supabase:', error.message);
    return !error;
  },

  /* getConfigFiscal — lee Supabase primero, localStorage como fallback */
  async getConfigFiscal() {
    const id = await getTenantId();
    const isRealUUID = id && id.length === 36 && id !== 'demo-tenant-id';
    if (isRealUUID) {
      const { data } = await getSupabase()
        .from('config_fiscal').select('*').eq('tenant_id', id).maybeSingle();
      if (data) {
        localStorage.setItem('tp_config_fiscal', JSON.stringify(data));
        return data;
      }
    }
    /* Fallback a localStorage */
    try { return JSON.parse(localStorage.getItem('tp_config_fiscal') || '{}'); }
    catch(e) { return {}; }
  },

  getPOSConfig() {
    try { return JSON.parse(localStorage.getItem('tp_pos_config') || '{}'); }
    catch(e) { return {}; }
  },

  /* ── INGRESOS ─────────────────────────────────────── */
  async getIngresos() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('ingresos')
      .select('*, clientes(nombre), ordenes(num)')
      .eq('tenant_id', id)
      .order('fecha', { ascending: false });
    return data || [];
  },

  async insertIngreso(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase()
      .from('ingresos')
      .insert({ ...fields, tenant_id: id })
      .select().single();
    return { data, error };
  },

  async deleteIngreso(ingresoId) {
    const { error } = await getSupabase()
      .from('ingresos').delete().eq('id', ingresoId);
    return !error;
  },

  /* ── EGRESOS ──────────────────────────────────────── */
  async getEgresos() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('egresos')
      .select('*')
      .eq('tenant_id', id)
      .order('fecha', { ascending: false });
    return data || [];
  },

  async insertEgreso(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase()
      .from('egresos')
      .insert({ ...fields, tenant_id: id })
      .select().single();
    return { data, error };
  },

  async deleteEgreso(egresoId) {
    const { error } = await getSupabase()
      .from('egresos').delete().eq('id', egresoId);
    return !error;
  },

  /* ── CUENTAS POR COBRAR ───────────────────────────── */
  async getCuentasCobrar() {
    const id = await getTenantId();
    const { data } = await getSupabase()
      .from('cuentas_cobrar')
      .select('*, clientes(nombre), ordenes(num)')
      .eq('tenant_id', id)
      .order('created_at', { ascending: false });
    return data || [];
  },

  async insertCXC(fields) {
    const id = await getTenantId();
    const { data, error } = await getSupabase()
      .from('cuentas_cobrar')
      .insert({ ...fields, tenant_id: id })
      .select().single();
    return { data, error };
  },

  async insertAbono(fields) {
    const id = await getTenantId();
    // Insertar abono
    const { error } = await getSupabase()
      .from('abonos')
      .insert({ ...fields, tenant_id: id });
    if (error) return { error };
    // Actualizar monto pagado en cuenta
    const { data: cuenta } = await getSupabase()
      .from('cuentas_cobrar').select('monto_total, monto_pagado').eq('id', fields.cuenta_id).single();
    if (cuenta) {
      const nuevoPagado = (cuenta.monto_pagado || 0) + fields.monto;
      const estado = nuevoPagado >= cuenta.monto_total ? 'pagada' : 'parcial';
      await getSupabase().from('cuentas_cobrar')
        .update({ monto_pagado: nuevoPagado, estado })
        .eq('id', fields.cuenta_id);
    }
    return { error: null };
  },

  /* ── ACTUALIZAR VEHÍCULO ──────────────────────────── */
  async updateVehiculo(vehiculoId, fields) {
    const { error } = await getSupabase()
      .from('vehiculos')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', vehiculoId);
    return !error;
  }
};
