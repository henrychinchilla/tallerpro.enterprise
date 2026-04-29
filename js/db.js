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

  /* ── ACTUALIZAR VEHÍCULO ──────────────────────────── */
  async updateVehiculo(vehiculoId, fields) {
    const { error } = await getSupabase()
      .from('vehiculos')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', vehiculoId);
    return !error;
  }
};
