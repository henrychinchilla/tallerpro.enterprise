/* Dashboard Module */
Modulos.dashboard = {
  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el, 'Cargando dashboard...');

    const [kpi, dd] = await Promise.all([DB.getKPIs(), DB.getDashboardData()]);
    const mes = new Date().toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });

    /* Utilidad del mes actual (último bucket) */
    const actual = dd.meses[dd.meses.length - 1] || { ingresos: 0, egresos: 0 };
    const utilidad = actual.ingresos - actual.egresos;

    /* Gráfica de tendencia (6 meses) */
    const trend = Charts.areaLineas({
      labels: dd.meses.map(m => m.label),
      series: [
        { nombre: 'Ingresos', colorVar: 'green', area: true, valores: dd.meses.map(m => m.ingresos) },
        { nombre: 'Egresos',  colorVar: 'red',                valores: dd.meses.map(m => m.egresos) }
      ]
    });

    /* Dona de órdenes por estado */
    const estadosData = Object.keys(ESTADOS_OT)
      .map(k => ({ label: ESTADOS_OT[k].label, valor: dd.porEstado[k] || 0, colorVar: ESTADOS_OT[k].color }))
      .filter(d => d.valor > 0);
    const dona = estadosData.length
      ? Charts.dona({ data: estadosData })
      : UI.vacio('📋', 'Sin órdenes', 'Crea tu primera orden de trabajo');

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
            <div class="kpi-trend">Facturas + ingresos directos</div>
          </div>
          <div class="kpi-card ${utilidad >= 0 ? 'green' : 'red'}">
            <div class="kpi-label">Utilidad del Mes</div>
            <div class="kpi-val ${utilidad >= 0 ? 'green' : 'red'}">${UI.q(utilidad)}</div>
            <div class="kpi-trend">Ingresos − egresos</div>
          </div>
          <div class="kpi-card cyan">
            <div class="kpi-label">Órdenes Activas</div>
            <div class="kpi-val cyan">${kpi.otsActivas}</div>
            <div class="kpi-trend">En proceso actualmente</div>
          </div>
          <div class="kpi-card ${kpi.invBajo.length > 0 ? 'red' : 'gray'}">
            <div class="kpi-label">Stock Bajo</div>
            <div class="kpi-val ${kpi.invBajo.length > 0 ? 'red' : 'green'}">${kpi.invBajo.length}</div>
            <div class="kpi-trend">${kpi.invBajo.length > 0 ? 'Artículos bajo mínimo' : 'Inventario OK'}</div>
          </div>
        </div>

        <div class="dash-charts">
          <div class="card">
            <div class="card-sub mb-4">📈 Ingresos vs Egresos · últimos 6 meses</div>
            ${trend}
          </div>
          <div class="card">
            <div class="card-sub mb-4">🧩 Órdenes por estado</div>
            ${dona}
          </div>
        </div>

        ${kpi.invBajo.length > 0 ? `
        <div class="card card-red" style="margin-top:16px">
          <div class="card-sub mb-3">⚠️ Artículos con Stock Bajo</div>
          ${kpi.invBajo.map(i => `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
              <span>${i.nombre}</span><span class="text-red">Stock: ${i.stock} / Min: ${i.min_stock}</span>
            </div>`).join('')}
        </div>` : ''}

      </div>`;
  }
};
