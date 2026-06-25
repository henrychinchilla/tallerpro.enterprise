/* Dashboard Module */
Modulos.dashboard = {
  _mes: null,

  _setMes(ym) { if (ym) { this._mes = ym; this.render(); } },

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el, 'Cargando dashboard...');

    const ahora = new Date();
    if (!this._mes) this._mes = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`;
    const esMesActual = this._mes === `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`;

    const hoyStr = new Date().toISOString().slice(0, 10);
    const [kpi, dd, citas, ordenes, fb] = await Promise.all([
      DB.getKPIs(this._mes),
      DB.getDashboardData(this._mes),
      DB.getCitas(hoyStr, hoyStr).catch(() => []),
      DB.getOrdenes().catch(() => []),
      DB.getFeedback().catch(() => [])
    ]);
    const [my, mm] = this._mes.split('-').map(Number);
    const mes = new Date(my, mm-1, 1).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
    const h = ahora.getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const nombre = (Auth.user?.nombre || '').split(' ')[0] || '';

    /* Utilidad del mes actual (último bucket) y del anterior, para variación y sparkline */
    const actual = dd.meses[dd.meses.length - 1] || { ingresos: 0, egresos: 0 };
    const previo  = dd.meses[dd.meses.length - 2] || null;
    const utilidad     = actual.ingresos - actual.egresos;
    const utilidadPrev = previo ? (previo.ingresos - previo.egresos) : null;
    const utilidadDelta = (utilidadPrev !== null && utilidadPrev !== 0)
      ? (utilidad - utilidadPrev) / Math.abs(utilidadPrev) * 100 : null;
    const utilidadSpark = dd.meses.map(m => m.ingresos - m.egresos);

    /* Métricas BI para las tarjetas hero (anillos de %) */
    const margen      = kpi.ingresos > 0 ? Math.round(utilidad / kpi.ingresos * 100) : 0;
    const totalOT     = ordenes.length;
    const entregadas  = ordenes.filter(o => o.estado === 'entregado').length;
    const pctEntreg   = totalOT ? Math.round(entregadas / totalOT * 100) : 0;
    const rts = [];
    const _aspK = ['rating_servicio','rating_instalaciones','rating_limpieza','rating_entrega','rating_documentos','rating_productos'];
    fb.forEach(f => _aspK.forEach(k => { if (f[k]) rts.push(f[k]); }));
    const satis = rts.length ? Math.round(rts.filter(r => r >= 4).length / rts.length * 100) : 0;

    const heroHtml = `
      <div class="dash-hero">
        <div class="dash-hero-left">
          <div class="dash-hero-saludo">${saludo}${nombre ? ', ' + nombre : ''}</div>
          <div class="dash-hero-fecha">${esMesActual ? ahora.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Periodo: ' + mes}</div>
          <div class="dash-hero-stats">
            <div class="dash-hero-stat">
              <div class="dash-hero-stat-val text-green">${UI.q(kpi.ingresos)}</div>
              <div class="dash-hero-stat-label">Facturación</div>
            </div>
            <div class="dash-hero-sep"></div>
            <div class="dash-hero-stat">
              <div class="dash-hero-stat-val text-cyan">${entregadas}/${totalOT}</div>
              <div class="dash-hero-stat-label">OTs entregadas</div>
            </div>
            <div class="dash-hero-sep"></div>
            <div class="dash-hero-stat">
              <div class="dash-hero-stat-val text-purple">${satis}%</div>
              <div class="dash-hero-stat-label">Satisfacción</div>
            </div>
            <div class="dash-hero-sep"></div>
            <div class="dash-hero-stat">
              <div class="dash-hero-stat-val ${utilidad >= 0 ? 'text-green' : 'text-red'}">${UI.q(utilidad)}</div>
              <div class="dash-hero-stat-label">Utilidad</div>
            </div>
          </div>
        </div>
        <div class="dash-hero-gauges">
          <div class="dash-hero-gauge-wrap">
            ${Charts.gauge({ pct: margen, colorVar: 'green', size: 90, grosor: 11 })}
            <div class="dash-hero-gauge-label">Margen</div>
          </div>
          <div class="dash-hero-gauge-wrap">
            ${Charts.gauge({ pct: pctEntreg, colorVar: 'cyan', size: 90, grosor: 11 })}
            <div class="dash-hero-gauge-label">Entregas</div>
          </div>
          <div class="dash-hero-gauge-wrap">
            ${Charts.gauge({ pct: satis, colorVar: 'purple', size: 90, grosor: 11 })}
            <div class="dash-hero-gauge-label">Satisf.</div>
          </div>
        </div>
      </div>`;

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
      ? Charts.barrasV({
          labels: dd.ingresosDiarios.map(d => d.dia),
          valores: dd.ingresosDiarios.map(d => d.monto),
          colorVar: 'cyan', alto: 200, money: true
        })
      : UI.vacio('📅', 'Sin ingresos este mes', 'Aún no hay movimientos registrados');

    /* Top clientes (6 meses) */
    const topCli = dd.topClientes.length
      ? Charts.barrasH({ data: dd.topClientes.map(c => ({ label: c.nombre, valor: c.total })), colorVar: 'amber' })
      : UI.vacio('🏆', 'Sin facturación', 'Top de clientes aparecerá aquí');

    /* Órdenes recientes (5) */
    const recientes = ordenes.slice(0, 5);

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">// ${esMesActual ? ahora.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' : 'Periodo: '}${mes}${esMesActual ? '' : ' (histórico)'}</p>
        </div>
        <div class="page-actions">
          <input type="month" class="form-input" style="width:160px" value="${this._mes}" title="Ver otro mes" onchange="Modulos.dashboard._setMes(this.value)">
          ${esMesActual ? '' : `<button class="btn btn-ghost" onclick="Modulos.dashboard._setMes('${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}')" title="Volver al mes actual">📅 Mes actual</button>`}
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

        <!-- HERO BI: banner resumen del mes -->
        ${heroHtml}

        <div class="kpi-grid">
          ${UI.kpiCard({ icon:'💹', clase: utilidad >= 0 ? 'green' : 'red', label:'Utilidad del Mes', value: utilidad, money:true,
            trend: 'Ingresos − egresos', destino:'finanzas', delta: utilidadDelta, spark: utilidadSpark })}
          ${UI.kpiCard({ icon:'🔧', clase:'cyan', label:'Órdenes Activas', value: kpi.otsActivas,
            trend:'En proceso actualmente', destino:'ordenes' })}
          ${UI.kpiCard({ icon:'👥', clase:'amber', label:'Clientes', value: kpi.clientes,
            trend:'Registrados', destino:'clientes' })}
          ${UI.kpiCard({ icon: kpi.invBajo.length > 0 ? '⚠️' : '📦', clase: kpi.invBajo.length > 0 ? 'red' : 'gray', label:'Stock Bajo', value: kpi.invBajo.length,
            trend: kpi.invBajo.length > 0 ? 'Artículos bajo mínimo' : 'Inventario OK', destino:'inventario' })}
        </div>

        <div class="dash-charts">
          <div class="card">
            <div class="card-sub mb-4">📈 Ingresos vs Egresos · 6 meses hasta ${mes}</div>
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
            <div class="card-sub mb-4">📅 Ingresos por día · ${mes}</div>
            ${diario}
          </div>
          <div class="card">
            <div class="card-sub mb-4">🏆 Top clientes · 6 meses hasta ${mes}</div>
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
