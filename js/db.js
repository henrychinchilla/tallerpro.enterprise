/* ═══════════════════════════════════════════════════════
   db.js — Capa de datos conectada a Supabase
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://oanguccrxleznozumpbi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hbmd1Y2NyeGxlem5venVtcGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODk4MzEsImV4cCI6MjA5Mjk2NTgzMX0.DcQS5AMHV3s4k-tvLlpb8ZWzkODPOSaiQjP1rLJVPAs';

const TENANT_SLUG = 'automotriz-torres';

/* ── CLIENTE SUPABASE (via CDN en index.html) ───────── */
let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;
  _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _supabase;
}

/* ── TENANT ID (se carga una vez) ───────────────────── */
let _tenantId = null;

async function getTenantId() {
  if (_tenantId) return _tenantId;
  const { data } = await getSupabase()
    .from('tenants')
    .select('id')
    .eq('slug', TENANT_SLUG)
    .single();
  _tenantId = data?.id;
  return _tenantId;
}

/* Expose getSupabase for direct use in modules */
window.getSupabase = getSupabase;

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
    const [
      { count: totalClientes },
      { count: otActivas },
      { data: facturasCert },
      { data: invData }
    ] = await Promise.all([
      getSupabase().from('clientes').select('*',  { count: 'exact', head: true }).eq('tenant_id', id).eq('activo', true),
      getSupabase().from('ordenes').select('*',   { count: 'exact', head: true }).eq('tenant_id', id).not('estado', 'in', '("entregado","cancelado")'),
      getSupabase().from('facturas').select('total').eq('tenant_id', id).eq('estado', 'certificada'),
      getSupabase().from('inventario').select('id, nombre, stock, min_stock').eq('tenant_id', id).eq('activo', true)
    ]);

    const ingresos  = (facturasCert || []).reduce((s, f) => s + (f.total || 0), 0);
    const stockBajo = (invData || []).filter(i => i.stock <= i.min_stock);

    return { totalClientes: totalClientes || 0, otActivas: otActivas || 0, ingresos, stockBajo };
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
    const id = await getTenantId();
    // Check if config exists
    const { data: existing } = await getSupabase()
      .from('config_fiscal').select('id').eq('tenant_id', id).single();
    
    let error;
    if (existing?.id) {
      // Update existing record
      ({ error } = await getSupabase()
        .from('config_fiscal')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('tenant_id', id));
    } else {
      // Insert new record
      ({ error } = await getSupabase()
        .from('config_fiscal')
        .insert({ ...fields, tenant_id: id }));
    }
    return !error;
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
