/* TallerPro v3.0 — operacion/mi_ot.js
   Portal del cliente (rol 'cliente'): seguimiento de SUS órdenes.
   Regla: el cliente solo ve la OT mientras no haya sido recibida y pagada,
   es decir, mientras su estado no sea 'entregado' ni 'cancelado'. */
Modulos.mi_ot = {
  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);

    /* Localizar al cliente por su correo (con el que inició sesión) */
    const email = Auth.user?.email || '';
    const { data: clientes } = await getSB().from('clientes')
      .select('*').eq('tenant_id', getTID()).eq('email', email).limit(1);
    const cliente = clientes?.[0];

    if (!cliente) {
      el.innerHTML = `
        <div class="page-header"><h1 class="page-title">🔍 Mis Órdenes</h1></div>
        <div class="page-body">${UI.vacio('🗂️','No encontramos órdenes asociadas a tu cuenta',
          'Si crees que es un error, contacta al taller.')}</div>`;
      return;
    }

    /* Solo órdenes activas: no entregadas ni canceladas (aún no recibidas/pagadas) */
    const { data: ordenes } = await getSB().from('ordenes')
      .select('*, vehiculos(placa,marca,modelo,anio), empleados(nombre)')
      .eq('tenant_id', getTID()).eq('cliente_id', cliente.id)
      .not('estado','in','("entregado","cancelado")')
      .order('created_at', { ascending: false });
    const lista = ordenes || [];

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🔍 Mis Órdenes</h1>
        <p class="page-subtitle">// ${cliente.nombre} · ${lista.length} en proceso</p></div>
      </div>
      <div class="page-body">
        ${lista.length ? `<div class="grid-2">${lista.map(o=>this._card(o)).join('')}</div>`
          : UI.vacio('✅','No tienes órdenes en proceso',
              'Cuando tu vehículo esté en el taller, aquí verás el avance.')}
      </div>`;

    /* Cargar ítems de cada OT (resumen de trabajos) */
    lista.forEach(o => this._cargarItems(o.id));
  },

  _card(o) {
    const est = ESTADOS_OT[o.estado] || { label:o.estado, color:'gray', pct:50 };
    return `<div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div>
          <div class="mono-sm text-amber" style="font-weight:700">${o.num}</div>
          <div style="font-weight:800;font-size:15px">${o.vehiculos?.placa||''} · ${o.vehiculos?.marca||''} ${o.vehiculos?.modelo||''} ${o.vehiculos?.anio||''}</div>
        </div>
        <span class="badge badge-${est.color}">${est.label}</span>
      </div>
      <div style="background:var(--surface2);border-radius:8px;height:8px;margin-bottom:10px;overflow:hidden">
        <div style="height:100%;width:${est.pct}%;background:var(--${est.color});border-radius:8px;transition:width .5s"></div>
      </div>
      <div style="font-size:12px;color:var(--text3);display:flex;flex-wrap:wrap;gap:12px">
        <span>🔧 ${o.empleados?.nombre||'Por asignar'}</span>
        ${o.fecha_estimada?`<span>📅 Entrega estimada: ${UI.fecha(o.fecha_estimada)}</span>`:''}
      </div>
      ${o.descripcion?`<div style="font-size:12px;color:var(--text2);margin-top:8px;padding:8px;background:var(--surface2);border-radius:8px">${o.descripcion}</div>`:''}
      <div id="miot-items-${o.id}" style="margin-top:8px"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
        <span style="font-size:12px;color:var(--text3)">Total estimado</span>
        <span style="font-weight:800" class="text-amber">${UI.q(o.total)}</span>
      </div>
    </div>`;
  },

  async _cargarItems(ordenId) {
    const { data: items } = await getSB().from('ot_items').select('descripcion,tipo,ejecutado,es_extra,autorizado')
      .eq('orden_id', ordenId).order('orden_pos');
    const cont = document.getElementById(`miot-items-${ordenId}`);
    if (!cont || !items?.length) return;
    cont.innerHTML = `<div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Trabajos</div>` +
      items.map(i=>`<div style="font-size:12px;display:flex;align-items:center;gap:6px;padding:2px 0">
        <span>${i.ejecutado?'✅':'⏳'}</span>
        <span style="${i.ejecutado?'color:var(--text3)':''}">${i.descripcion}${i.es_extra?(i.autorizado?'':' <span style="color:var(--amber)">(espera tu autorización)</span>'):''}</span>
      </div>`).join('');
  }
};
