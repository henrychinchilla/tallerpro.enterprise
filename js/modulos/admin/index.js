/* TallerPro v3.0 — admin/index.js */
Modulos.admin = {
  async render() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">🗄️ Administración</h1>
      </div>
      <div class="page-body">
        <div class="grid-2">
          <div class="card card-cyan">
            <div class="card-sub mb-3">🏢 Multi-Taller</div>
            <p style="font-size:13px;color:var(--text2);margin-bottom:12px">
              TallerPro soporta múltiples talleres en una sola instancia. Cada taller tiene sus propios datos, usuarios y configuración.
            </p>
            <div style="padding:12px;background:var(--surface2);border-radius:8px;font-size:13px">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span class="text-muted">Taller activo:</span>
                <b>${Auth.tenant?.name||'—'}</b>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span class="text-muted">ID:</span>
                <span class="mono-sm">${Auth.tenant?.id?.slice(0,8)||'—'}...</span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span class="text-muted">Slug:</span>
                <span class="mono-sm">${Auth.tenant?.slug||'—'}</span>
              </div>
            </div>
          </div>

          <div class="card card-amber">
            <div class="card-sub mb-3">🔑 Licencia</div>
            <div style="font-size:13px;color:var(--text2);margin-bottom:12px">
              ${Auth.licencia?.tipo==='completa'
                ? '<span class="badge badge-green">✓ Licencia Completa</span>'
                : `<span class="badge badge-amber">Demo · ${Auth.licencia?.dias_restantes||0} días</span>`}
            </div>
            <button class="btn btn-amber" style="width:100%" onclick="App.activarLicencia()">🔑 Activar Licencia</button>
          </div>

          <div class="card">
            <div class="card-sub mb-3">💾 Exportar Datos</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <button class="btn btn-ghost" onclick="Modulos.admin.exportar('clientes')">⬇ Exportar Clientes (CSV)</button>
              <button class="btn btn-ghost" onclick="Modulos.admin.exportar('vehiculos')">⬇ Exportar Vehículos (CSV)</button>
              <button class="btn btn-ghost" onclick="Modulos.admin.exportar('ordenes')">⬇ Exportar Órdenes (CSV)</button>
              <button class="btn btn-ghost" onclick="Modulos.admin.exportar('inventario')">⬇ Exportar Inventario (CSV)</button>
            </div>
          </div>

          <div class="card">
            <div class="card-sub mb-3">📊 Estado del Sistema</div>
            <div id="admin-stats" style="font-size:13px;color:var(--text2)">Cargando...</div>
          </div>
        </div>
      </div>`;

    this._cargarStats();
  },

  async _cargarStats() {
    const el = document.getElementById('admin-stats');
    if (!el) return;
    const [cli,veh,ot,inv] = await Promise.all([
      getSB().from('clientes').select('*',{count:'exact',head:true}).eq('tenant_id',getTID()),
      getSB().from('vehiculos').select('*',{count:'exact',head:true}).eq('tenant_id',getTID()),
      getSB().from('ordenes').select('*',{count:'exact',head:true}).eq('tenant_id',getTID()),
      getSB().from('inventario').select('*',{count:'exact',head:true}).eq('tenant_id',getTID())
    ]);
    el.innerHTML = [
      ['👥 Clientes', cli.count||0],
      ['🚗 Vehículos', veh.count||0],
      ['📋 Órdenes', ot.count||0],
      ['📦 Artículos', inv.count||0]
    ].map(([k,v])=>`
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
        <span>${k}</span><b style="color:var(--amber)">${v}</b>
      </div>`).join('');
  },

  async exportar(tabla) {
    UI.toast(`Exportando ${tabla}...`, 'info');
    const { data } = await getSB().from(tabla).select('*').eq('tenant_id', getTID());
    if (!data?.length) { UI.toast('Sin datos para exportar','warn'); return; }
    const cols = Object.keys(data[0]).filter(k=>!['tenant_id','id'].includes(k));
    const csv  = [cols.join(','), ...data.map(r=>cols.map(c=>JSON.stringify(r[c]??'')).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download = `${tabla}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    UI.toast(`${tabla} exportado ✓`);
  }
};
