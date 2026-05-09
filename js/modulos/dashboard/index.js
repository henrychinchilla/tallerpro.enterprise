/* Dashboard Module */
Modulos.dashboard = {
  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el, 'Cargando dashboard...');
    const kpi = await DB.getKPIs();
    const mes = new Date().toLocaleDateString('es-GT',{month:'long',year:'numeric'});
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">📊 Dashboard</h1>
        <p class="page-subtitle">// ${mes}</p>
      </div>
      <div class="page-body">
        <div class="kpi-grid">
          <div class="kpi-card amber">
            <div class="kpi-label">Ingresos del Mes</div>
            <div class="kpi-val amber">${UI.q(kpi.ingresos)}</div>
            <div class="kpi-trend">${kpi.ingresos===0?'Sin ingresos registrados':'Facturas + ingresos directos'}</div>
          </div>
          <div class="kpi-card cyan">
            <div class="kpi-label">Órdenes Activas</div>
            <div class="kpi-val cyan">${kpi.otsActivas}</div>
            <div class="kpi-trend">En proceso actualmente</div>
          </div>
          <div class="kpi-card green">
            <div class="kpi-label">Total Clientes</div>
            <div class="kpi-val green">${kpi.clientes}</div>
            <div class="kpi-trend">Clientes registrados</div>
          </div>
          <div class="kpi-card ${kpi.invBajo.length>0?'red':'gray'}">
            <div class="kpi-label">Stock Bajo</div>
            <div class="kpi-val ${kpi.invBajo.length>0?'red':'green'}">${kpi.invBajo.length}</div>
            <div class="kpi-trend">${kpi.invBajo.length>0?'Artículos bajo mínimo':'Inventario OK'}</div>
          </div>
        </div>
        ${kpi.invBajo.length>0?`
        <div class="card card-red" style="margin-top:16px">
          <div class="card-sub mb-3">⚠️ Artículos con Stock Bajo</div>
          ${kpi.invBajo.map(i=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>${i.nombre}</span><span class="text-red">Stock: ${i.stock} / Min: ${i.min_stock}</span>
          </div>`).join('')}
        </div>`:''}
      </div>`;
  }
};
