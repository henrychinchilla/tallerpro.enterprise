/* Dashboard Module */
Modulos.dashboard = {
  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el, 'Cargando dashboard...');

    const hoyStr = new Date().toISOString().slice(0, 10);
    const [kpi, dd, citas, ordenes] = await Promise.all([
      DB.getKPIs(),
      DB.getDashboardData(),
      DB.getCitas(hoyStr, hoyStr).catch(() => []),
      DB.getOrdenes().catch(() => [])
    ]);
    const ahora = new Date();
    const mes = ahora.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
    const h = ahora.getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const nombre = (Auth.user?.nombre || '').split(' ')[0] || '';

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

    /* Ingresos por día (mes actual) */
    const totalDiario = dd.ingresosDiarios.reduce((s, d) => s + d.monto, 0);
    const diario = totalDiario > 0
      ? Charts.areaLineas({
          labels: dd.ingresosDiarios.map(d => d.dia),
          series: [{ nombre: 'Ingresos', colorVar: 'cyan', area: true, valores: dd.ingresosDiarios.map(d => d.monto) }],
          alto: 200
        })
      : UI.vacio('📅', 'Sin ingresos este mes', 'Aún no hay movimientos registrados');

    /* Top clientes (6 meses) */
    const topCli = dd.topClientes.length
      ? Charts.barrasH({ data: dd.topClientes.map(c => ({ label: c.nombre, valor: c.total })), colorVar: 'amber' })
      : UI.vacio('🏆', 'Sin facturación', 'Top de clientes aparecerá aquí');

    /* Órdenes recientes (5) */
    const recientes = ordenes.slice(0, 5);

    /* KPI clicable con contador animado (data-count) */
    const kpiCard = (clase, label, valor, trend, destino, money = false) => `
      <div class="kpi-card ${clase}" ${destino ? `onclick="App.navegarA('${destino}')" style="cursor:pointer"` : ''}>
        <div class="kpi-label">${label}</div>
        <div class="kpi-val ${clase}" data-count="${valor}" data-money="${money ? 1 : 0}">${money ? UI.q(valor) : valor}</div>
        <div class="kpi-trend">${trend}</div>
      </div>`;

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${saludo}${nombre ? ', ' + nombre : ''} 👋</h1>
          <p class="page-subtitle">// ${ahora.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' })} · ${mes}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.dashboard.render()" title="Actualizar">🔄 Actualizar</button>
        </div>
      </div>
      <div class="page-body">

        <!-- ACCIONES RÁPIDAS -->
        <div class="quick-actions">
          ${tieneAcceso('ordenes')    ? `<button class="quick-btn" onclick="App.navegarA('ordenes');setTimeout(()=>Modulos.ordenes?.modalForm?.(),250)"><span class="quick-ico">📋</span>Nueva OT</button>` : ''}
          ${tieneAcceso('facturacion')? `<button class="quick-btn" onclick="App.navegarA('facturacion');setTimeout(()=>Modulos.facturacion?.modalFactura?.(),250)"><span class="quick-ico">🧾</span>Nueva Factura</button>` : ''}
          ${tieneAcceso('clientes')   ? `<button class="quick-btn" onclick="App.navegarA('clientes');setTimeout(()=>Modulos.clientes?.modalForm?.(),250)"><span class="quick-ico">👥</span>Nuevo Cliente</button>` : ''}
          ${tieneAcceso('vehiculos')  ? `<button class="quick-btn" onclick="App.navegarA('vehiculos');setTimeout(()=>Modulos.vehiculos?.modalForm?.(),250)"><span class="quick-ico">🚗</span>Nuevo Vehículo</button>` : ''}
          ${tieneAcceso('calendario') ? `<button class="quick-btn" onclick="App.navegarA('calendario')"><span class="quick-ico">📅</span>Agenda</button>` : ''}
        </div>

        <div class="kpi-grid">
          ${kpiCard('amber', 'Ingresos del Mes', kpi.ingresos, 'Facturas + ingresos directos', 'finanzas', true)}
          ${kpiCard(utilidad >= 0 ? 'green' : 'red', 'Utilidad del Mes', utilidad, 'Ingresos − egresos', 'finanzas', true)}
          ${kpiCard('cyan', 'Órdenes Activas', kpi.otsActivas, 'En proceso actualmente', 'ordenes')}
          ${kpiCard(kpi.invBajo.length > 0 ? 'red' : 'gray', 'Stock Bajo', kpi.invBajo.length, kpi.invBajo.length > 0 ? 'Artículos bajo mínimo' : 'Inventario OK', 'inventario')}
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

        <!-- HOY: CITAS + ÓRDENES RECIENTES -->
        <div class="dash-charts">
          <div class="card">
            <div class="card-sub mb-3">📅 Citas de hoy <span class="badge badge-${citas.length?'cyan':'gray'}" style="margin-left:6px">${citas.length}</span></div>
            ${citas.length ? citas.slice(0, 6).map(c => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
                <div>
                  <div style="font-weight:700">${c.clientes?.nombre || 'Cliente'}</div>
                  <div style="font-size:11px;color:var(--text3)">${c.vehiculos?.placa || ''} ${c.motivo || c.servicio || ''}</div>
                </div>
                <span class="badge badge-cyan">${(c.fecha_cita || '').slice(11, 16) || '—'}</span>
              </div>`).join('') : UI.vacio('📅', 'Sin citas hoy', 'Agenda una cita desde el calendario')}
          </div>
          <div class="card">
            <div class="card-sub mb-3">🛠️ Órdenes recientes</div>
            ${recientes.length ? recientes.map(o => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;cursor:pointer" onclick="App.navegarA('ordenes')">
                <div>
                  <div style="font-weight:700">${o.num || '—'} · ${o.vehiculos?.placa || ''}</div>
                  <div style="font-size:11px;color:var(--text3)">${o.clientes?.nombre || ''}</div>
                </div>
                <span class="badge badge-${ESTADOS_OT[o.estado]?.color || 'gray'}">${ESTADOS_OT[o.estado]?.label || o.estado}</span>
              </div>`).join('') : UI.vacio('🛠️', 'Sin órdenes', 'Crea tu primera orden de trabajo')}
          </div>
        </div>

        <div class="dash-charts">
          <div class="card">
            <div class="card-sub mb-4">📅 Ingresos por día · este mes</div>
            ${diario}
          </div>
          <div class="card">
            <div class="card-sub mb-4">🏆 Top clientes · últimos 6 meses</div>
            ${topCli}
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

    this._animarKPIs();
  },

  /* Animación de conteo ascendente para los KPIs numéricos */
  _animarKPIs() {
    document.querySelectorAll('.kpi-val[data-count]').forEach(node => {
      const target = parseFloat(node.dataset.count) || 0;
      const money = node.dataset.money === '1';
      if (target === 0) return;
      const dur = 700, t0 = performance.now();
      const fmt = v => money ? UI.q(v) : Math.round(v).toLocaleString('es-GT');
      const step = now => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        node.textContent = fmt(target * eased);
        if (p < 1) requestAnimationFrame(step);
        else node.textContent = fmt(target);
      };
      requestAnimationFrame(step);
    });
  }
};
