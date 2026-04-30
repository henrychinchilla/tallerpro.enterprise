/* ═══════════════════════════════════════════════════════
   modules/finanzas.js — Dashboard Financiero Completo
   TallerPro Enterprise v2.0
   Incluye: P&L, Ingresos, Egresos, CxC, Fiscal
═══════════════════════════════════════════════════════ */

/* ── TAB ACTIVO ─────────────────────────────────────── */
let _finTab = 'dashboard';

Pages.finanzas = async function (tab = 'dashboard') {
  _finTab = tab;
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Finanzas</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const [ingresos, egresos, cxc, config] = await Promise.all([
    DB.getIngresos(),
    DB.getEgresos(),
    DB.getCuentasCobrar(),
    DB.getConfigFiscal()
  ]);

  Pages._finIngresos = ingresos;
  Pages._finEgresos  = egresos;
  Pages._finCXC      = cxc;
  Pages._finConfig   = config;

  const tabs = [
    { id: 'dashboard',  icon: '📊', label: 'Dashboard'        },
    { id: 'ingresos',   icon: '💰', label: 'Ingresos'         },
    { id: 'egresos',    icon: '📉', label: 'Egresos'          },
    { id: 'cxc',        icon: '📋', label: 'Cuentas x Cobrar' },
    { id: 'resultados', icon: '📈', label: 'Estado de Resultados' },
    { id: 'fiscal',     icon: '🏛️', label: 'Fiscal & IGSS'    }
  ];

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Finanzas</h1>
        <p class="page-subtitle">// CONTROL FINANCIERO INTEGRAL · ${FINANZAS.regimen(config)}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" onclick="Pages.modalNuevoEgreso()">＋ Egreso</button>
        <button class="btn btn-amber" onclick="Pages.modalNuevoIngreso()">＋ Ingreso</button>
      </div>
    </div>
    <div class="page-body">

      <!-- TABS -->
      <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:0">
        ${tabs.map(t => `
        <button onclick="Pages.finanzas('${t.id}')"
          style="padding:10px 18px;border:none;background:none;cursor:pointer;font-family:'Manrope',sans-serif;
                 font-size:13px;font-weight:600;border-bottom:2px solid ${_finTab===t.id?'var(--amber)':'transparent'};
                 color:${_finTab===t.id?'var(--amber)':'var(--text2)'};transition:all .2s">
          ${t.icon} ${t.label}
        </button>`).join('')}
      </div>

      <!-- CONTENIDO DEL TAB -->
      <div id="fin-content">
        ${_finTab === 'dashboard' ? FINANZAS.renderDashboard(ingresos, egresos, cxc, config) : ''}
        ${_finTab === 'ingresos'  ? FINANZAS.renderIngresos(ingresos) : ''}
        ${_finTab === 'egresos'   ? FINANZAS.renderEgresos(egresos) : ''}
        ${_finTab === 'cxc'       ? FINANZAS.renderCXC(cxc) : ''}
        ${_finTab === 'resultados'? FINANZAS.renderResultados(ingresos, egresos, config) : ''}
        ${_finTab === 'fiscal'    ? FINANZAS.renderFiscal(ingresos, egresos, config) : ''}
      </div>
    </div>`;

  /* Inicializar charts si es dashboard */
  if (_finTab === 'dashboard') {
    setTimeout(() => FINANZAS.initCharts(ingresos, egresos), 100);
  }
};

/* ══════════════════════════════════════════════════════
   FINANZAS — Objeto con todos los renders y helpers
══════════════════════════════════════════════════════ */
const FINANZAS = {

  /* ── HELPERS ──────────────────────────────────────── */
  regimen(config) {
    const map = {
      general: 'Régimen General',
      rose:    'ROSE',
      rsu:     'Régimen Sobre Utilidades',
      repc:    'Pequeño Contribuyente'
    };
    return map[config?.regimen_iva] || 'Régimen General';
  },

  mesActual() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  },

  filtrarMes(arr, campo = 'fecha') {
    const mes = this.mesActual();
    return arr.filter(x => (x[campo]||'').startsWith(mes));
  },

  totalMes(arr) {
    return this.filtrarMes(arr).reduce((s, x) => s + (x.monto || 0), 0);
  },

  calcularIVA(monto, config) {
    const tasa = config?.tasa_iva || 0.12;
    if (config?.regimen_iva === 'repc') return monto * 0.05;
    return monto - (monto / (1 + tasa));
  },

  calcularISR(utilidad, config) {
    if (!config) return 0;
    switch (config.regimen_iva) {
      case 'general':
      case 'rose':
        return utilidad <= 30000 ? utilidad * 0.05 : 1500 + (utilidad - 30000) * 0.07;
      case 'rsu':
        return utilidad * 0.25;
      case 'repc':
        return 0;
      default:
        return utilidad * 0.05;
    }
  },

  /* ── DASHBOARD ────────────────────────────────────── */
  renderDashboard(ingresos, egresos, cxc, config) {
    const ingMes  = this.totalMes(ingresos);
    const egMes   = this.totalMes(egresos);
    const util    = ingMes - egMes;
    const ivaMes  = this.calcularIVA(ingMes, config);
    const isrMes  = this.calcularISR(util, config);
    const cxcPend = cxc.filter(c => c.estado !== 'pagada').reduce((s,c) => s + (c.saldo||c.monto_total - c.monto_pagado||0), 0);
    const utilPct = ingMes > 0 ? ((util/ingMes)*100).toFixed(1) : '0.0';

    return `
      <!-- KPIs financieros -->
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
        <div class="kpi-card amber">
          <div class="kpi-label">Ingresos del Mes</div>
          <div class="kpi-val amber">${UI.q(ingMes)}</div>
          <div class="kpi-trend">Cobros realizados</div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-label">Egresos del Mes</div>
          <div class="kpi-val red">${UI.q(egMes)}</div>
          <div class="kpi-trend down">Gastos y compras</div>
        </div>
        <div class="kpi-card ${util >= 0 ? 'green' : 'red'}">
          <div class="kpi-label">Utilidad Neta</div>
          <div class="kpi-val ${util >= 0 ? 'green' : 'red'}">${UI.q(util)}</div>
          <div class="kpi-trend ${util < 0 ? 'down' : ''}">Margen: ${utilPct}%</div>
        </div>
        <div class="kpi-card cyan">
          <div class="kpi-label">Cuentas x Cobrar</div>
          <div class="kpi-val cyan">${UI.q(cxcPend)}</div>
          <div class="kpi-trend">Pendiente de cobro</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">IVA a Pagar</div>
          <div class="kpi-val" style="font-size:28px">${UI.q(ivaMes)}</div>
          <div class="kpi-trend">Este mes</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">ISR Estimado</div>
          <div class="kpi-val" style="font-size:28px">${UI.q(isrMes)}</div>
          <div class="kpi-trend">${this.regimen(config)}</div>
        </div>
      </div>

      <!-- Charts -->
      <div class="grid-2" style="margin-bottom:20px">
        <div class="chart-box">
          <div class="chart-title">Ingresos vs Egresos</div>
          <div class="chart-sub">ÚLTIMOS 6 MESES · Q GUATEMALTECOS</div>
          <div class="chart-canvas"><canvas id="chart-fin-pnl"></canvas></div>
        </div>
        <div class="chart-box">
          <div class="chart-title">Distribución de Egresos</div>
          <div class="chart-sub">POR CATEGORÍA</div>
          <div class="chart-canvas"><canvas id="chart-fin-egresos"></canvas></div>
        </div>
      </div>

      <!-- Últimas transacciones -->
      <div class="grid-2">
        <div>
          <div style="font-weight:700;font-size:13px;margin-bottom:10px">💰 Últimos Ingresos</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Método</th><th>Monto</th></tr></thead>
              <tbody>
                ${ingresos.slice(0,5).map(i => `<tr>
                  <td class="mono-sm">${i.fecha}</td>
                  <td>${i.concepto}</td>
                  <td><span class="badge badge-gray">${FINANZAS.labelPago(i.metodo_pago)}</span></td>
                  <td class="mono-sm text-green">${UI.q(i.monto)}</td>
                </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px">Sin ingresos registrados</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div style="font-weight:700;font-size:13px;margin-bottom:10px">📉 Últimos Egresos</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Monto</th></tr></thead>
              <tbody>
                ${egresos.slice(0,5).map(e => `<tr>
                  <td class="mono-sm">${e.fecha}</td>
                  <td>${e.concepto}</td>
                  <td><span class="badge badge-gray">${FINANZAS.labelCategoria(e.categoria)}</span></td>
                  <td class="mono-sm text-red">-${UI.q(e.monto)}</td>
                </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px">Sin egresos registrados</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  labelPago(m) {
    const map = {
      efectivo:'Efectivo', tarjeta_debito:'T. Débito',
      tarjeta_credito:'T. Crédito', cheque:'Cheque',
      transferencia:'Transferencia', credito:'Crédito'
    };
    return map[m] || m;
  },

  labelCategoria(c) {
    const map = {
      compra_inventario:'Inventario', nomina:'Nómina',
      igss:'IGSS', alquiler:'Alquiler', servicios:'Servicios',
      combustible:'Combustible', herramientas:'Herramientas',
      publicidad:'Publicidad', impuestos:'Impuestos', otros:'Otros'
    };
    return map[c] || c;
  },

  /* ── INGRESOS ─────────────────────────────────────── */
  renderIngresos(ingresos) {
    const total = ingresos.reduce((s,i) => s+i.monto, 0);
    return `
      <div class="flex items-center justify-between mb-4">
        <div>
          <span style="font-weight:700;font-size:14px">Registro de Ingresos</span>
          <span class="mono-sm text-muted" style="margin-left:12px">Total: ${UI.q(total)}</span>
        </div>
        <button class="btn btn-amber btn-sm" onclick="Pages.modalNuevoIngreso()">＋ Nuevo Ingreso</button>
      </div>
      <div class="search-bar">
        <input class="search-input" placeholder="🔍 Buscar..." id="search-ing" oninput="Pages.filterFin('ing-tbody','search-ing')">
        <select class="filter-select" id="filter-ing-mes" onchange="Pages.filterFinMes('ing-tbody','filter-ing-mes')">
          <option value="">Todos los meses</option>
          ${FINANZAS.mesesOpciones(ingresos)}
        </select>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th>Método de Pago</th><th>IVA</th><th>Monto</th><th></th></tr></thead>
          <tbody id="ing-tbody">
            ${ingresos.map(i => `<tr data-text="${i.concepto} ${i.fecha}" data-mes="${(i.fecha||'').slice(0,7)}">
              <td class="mono-sm">${i.fecha}</td>
              <td>${i.concepto}</td>
              <td><span class="badge badge-cyan">${FINANZAS.labelTipoIngreso(i.tipo)}</span></td>
              <td><span class="badge badge-gray">${FINANZAS.labelPago(i.metodo_pago)}</span></td>
              <td class="mono-sm text-muted">${UI.q(i.iva||0)}</td>
              <td class="mono-sm text-green">${UI.q(i.monto)}</td>
              <td><button class="btn btn-sm btn-danger" onclick="Pages.eliminarIngreso('${i.id}')">✕</button></td>
            </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px">Sin ingresos. <span class="text-amber" style="cursor:pointer" onclick="Pages.modalNuevoIngreso()">Registrar primero →</span></td></tr>'}
          </tbody>
        </table>
      </div>`;
  },

  labelTipoIngreso(t) {
    const map = { cobro_ot:'Cobro OT', anticipo:'Anticipo', abono:'Abono', otro:'Otro' };
    return map[t] || t;
  },

  /* ── EGRESOS ──────────────────────────────────────── */
  renderEgresos(egresos) {
    const total = egresos.reduce((s,e) => s+e.monto, 0);
    return `
      <div class="flex items-center justify-between mb-4">
        <div>
          <span style="font-weight:700;font-size:14px">Registro de Egresos</span>
          <span class="mono-sm text-muted" style="margin-left:12px">Total: ${UI.q(total)}</span>
        </div>
        <button class="btn btn-amber btn-sm" onclick="Pages.modalNuevoEgreso()">＋ Nuevo Egreso</button>
      </div>
      <div class="search-bar">
        <input class="search-input" placeholder="🔍 Buscar..." id="search-eg" oninput="Pages.filterFin('eg-tbody','search-eg')">
        <select class="filter-select" onchange="Pages.filterFinMes('eg-tbody',this.id)" id="filter-eg-mes">
          <option value="">Todos los meses</option>
          ${FINANZAS.mesesOpciones(egresos)}
        </select>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Proveedor</th><th>Método</th><th>Monto</th><th></th></tr></thead>
          <tbody id="eg-tbody">
            ${egresos.map(e => `<tr data-text="${e.concepto} ${e.proveedor||''} ${e.fecha}" data-mes="${(e.fecha||'').slice(0,7)}">
              <td class="mono-sm">${e.fecha}</td>
              <td>${e.concepto}</td>
              <td><span class="badge badge-purple">${FINANZAS.labelCategoria(e.categoria)}</span></td>
              <td class="text-muted" style="font-size:12px">${e.proveedor||'—'}</td>
              <td><span class="badge badge-gray">${FINANZAS.labelPago(e.metodo_pago)}</span></td>
              <td class="mono-sm text-red">-${UI.q(e.monto)}</td>
              <td><button class="btn btn-sm btn-danger" onclick="Pages.eliminarEgreso('${e.id}')">✕</button></td>
            </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px">Sin egresos. <span class="text-amber" style="cursor:pointer" onclick="Pages.modalNuevoEgreso()">Registrar primero →</span></td></tr>'}
          </tbody>
        </table>
      </div>`;
  },

  /* ── CUENTAS POR COBRAR ───────────────────────────── */
  renderCXC(cxc) {
    const pendiente = cxc.filter(c=>c.estado!=='pagada').reduce((s,c)=>s+(c.saldo||c.monto_total-c.monto_pagado),0);
    return `
      <div class="flex items-center justify-between mb-4">
        <div>
          <span style="font-weight:700;font-size:14px">Cuentas por Cobrar</span>
          <span class="mono-sm text-muted" style="margin-left:12px">Pendiente: ${UI.q(pendiente)}</span>
        </div>
        <button class="btn btn-amber btn-sm" onclick="Pages.modalNuevaCXC()">＋ Nueva Cuenta</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Cliente</th><th>Concepto</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${cxc.map(c => {
              const saldo = c.saldo || (c.monto_total - c.monto_pagado);
              const est = {
                pendiente:'badge-amber', parcial:'badge-cyan',
                pagada:'badge-green', vencida:'badge-red'
              }[c.estado]||'badge-gray';
              return `<tr>
                <td>${c.clientes?.nombre||'—'}</td>
                <td>${c.concepto}</td>
                <td class="mono-sm">${UI.q(c.monto_total)}</td>
                <td class="mono-sm text-green">${UI.q(c.monto_pagado)}</td>
                <td class="mono-sm text-amber">${UI.q(saldo)}</td>
                <td class="mono-sm text-muted">${c.fecha_vencimiento||'—'}</td>
                <td><span class="badge ${est}">${c.estado}</span></td>
                <td>
                  ${c.estado!=='pagada'?`<button class="btn btn-sm btn-success" onclick="Pages.modalAbonar('${c.id}','${UI.q(saldo)}')">Abonar</button>`:''}
                </td>
              </tr>`;
            }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">Sin cuentas por cobrar</td></tr>'}
          </tbody>
        </table>
      </div>`;
  },

  /* ── FISCAL ───────────────────────────────────────── */
  renderFiscal(ingresos, egresos, config) {
    const ingMes    = FINANZAS.totalMes(ingresos);
    const egMes     = FINANZAS.totalMes(egresos);
    const util      = ingMes - egMes;
    const iva       = FINANZAS.calcularIVA(ingMes, config);
    const isr       = FINANZAS.calcularISR(util, config);
    const sal       = egMes * 0.4; // estimado salarios
    const igssLab   = sal * (config?.cuota_laboral || 0.0483);
    const igssPatr  = sal * (config?.cuota_patronal || 0.1267);
    const intecap   = sal * (config?.intecap || 0.01);
    const irtra     = config?.aplica_irtra ? sal * (config?.irtra || 0.01) : 0;
    const now       = new Date();
    const mes       = now.toLocaleDateString('es-GT',{month:'long',year:'numeric'});

    return `
      <!-- Régimen fiscal -->
      <div class="card card-amber mb-4">
        <div class="card-sub mb-3">🏛️ Régimen Fiscal Activo — ${FINANZAS.regimen(config)}</div>
        <div class="grid-4" style="gap:12px">
          ${[
            {l:'IVA Mensual',    v:iva,     c:'amber'},
            {l:'ISR Estimado',   v:isr,     c:'cyan'},
            {l:'IGSS Patronal',  v:igssPatr,c:'green'},
            {l:'INTECAP (1%)',   v:intecap, c:'gray'}
          ].map(k=>`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:14px">
            <div class="kpi-label">${k.l}</div>
            <div class="kpi-val ${k.c}" style="font-size:24px">${UI.q(k.v)}</div>
          </div>`).join('')}
        </div>
      </div>

      <!-- Tabla de obligaciones del mes -->
      <div style="font-weight:700;font-size:14px;margin-bottom:12px">📅 Obligaciones — ${mes}</div>
      <div class="table-wrap mb-4">
        <table class="data-table">
          <thead><tr><th>Obligación</th><th>Base</th><th>Tasa</th><th>Monto</th><th>Vencimiento</th><th>Estado</th></tr></thead>
          <tbody>
            <tr>
              <td><b>IVA</b> — Declaración mensual</td>
              <td class="mono-sm">${UI.q(ingMes)}</td>
              <td class="mono-sm">${((config?.tasa_iva||0.12)*100).toFixed(0)}%</td>
              <td class="mono-sm text-amber">${UI.q(iva)}</td>
              <td class="mono-sm">Día 30 del mes</td>
              <td><span class="badge badge-amber">Pendiente</span></td>
            </tr>
            <tr>
              <td><b>ISR</b> — ${config?.regimen_iva==='rsu'?'Trimestral':'Mensual'}</td>
              <td class="mono-sm">${UI.q(util)}</td>
              <td class="mono-sm">${((config?.tasa_isr||0.05)*100).toFixed(0)}%</td>
              <td class="mono-sm text-amber">${UI.q(isr)}</td>
              <td class="mono-sm">${config?.regimen_iva==='rsu'?'Último día del trimestre':'Día 30 del mes'}</td>
              <td><span class="badge badge-amber">Pendiente</span></td>
            </tr>
            <tr>
              <td><b>IGSS</b> — Cuota patronal (12.67%)</td>
              <td class="mono-sm">${UI.q(sal)}</td>
              <td class="mono-sm">12.67%</td>
              <td class="mono-sm text-amber">${UI.q(igssPatr)}</td>
              <td class="mono-sm">Día 20 del mes</td>
              <td><span class="badge badge-amber">Pendiente</span></td>
            </tr>
            <tr>
              <td><b>INTECAP</b> — 1% sobre salarios</td>
              <td class="mono-sm">${UI.q(sal)}</td>
              <td class="mono-sm">1%</td>
              <td class="mono-sm text-amber">${UI.q(intecap)}</td>
              <td class="mono-sm">Día 20 del mes</td>
              <td><span class="badge badge-amber">Pendiente</span></td>
            </tr>
            ${config?.aplica_irtra?`<tr>
              <td><b>IRTRA</b> — 1% sobre salarios</td>
              <td class="mono-sm">${UI.q(sal)}</td>
              <td class="mono-sm">1%</td>
              <td class="mono-sm text-amber">${UI.q(irtra)}</td>
              <td class="mono-sm">Día 20 del mes</td>
              <td><span class="badge badge-amber">Pendiente</span></td>
            </tr>`:''}
          </tbody>
          <tfoot>
            <tr style="background:var(--surface2);font-weight:700">
              <td colspan="3">TOTAL OBLIGACIONES DEL MES</td>
              <td class="mono-sm text-amber">${UI.q(iva+isr+igssPatr+intecap+irtra)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Config IGSS -->
      <div class="card card-cyan">
        <div class="card-sub mb-3">⚙️ Configuración IGSS Patrono</div>
        <div class="grid-2" style="gap:14px">
          <div class="form-group">
            <label class="form-label">Número de Patrono IGSS</label>
            <input class="form-input" id="cfg-igss-num" value="${config?.num_patrono_igss||''}" placeholder="P-12345678">
          </div>
          <div class="form-group">
            <label class="form-label">Régimen Fiscal SAT</label>
            <select class="form-select" id="cfg-regimen">
              <option value="general" ${config?.regimen_iva==='general'?'selected':''}>Régimen General (IVA 12% + ISR 5%/7%)</option>
              <option value="rose"    ${config?.regimen_iva==='rose'   ?'selected':''}>ROSE (IVA 12% + retención ISR)</option>
              <option value="rsu"     ${config?.regimen_iva==='rsu'    ?'selected':''}>Régimen Sobre Utilidades (ISR 25%)</option>
              <option value="repc"    ${config?.regimen_iva==='repc'   ?'selected':''}>Pequeño Contribuyente (IVA 5%)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Cuota Laboral IGSS (%)</label>
            <input class="form-input" id="cfg-igss-lab" type="number" step="0.01" value="${((config?.cuota_laboral||0.0483)*100).toFixed(2)}">
          </div>
          <div class="form-group">
            <label class="form-label">Cuota Patronal IGSS (%)</label>
            <input class="form-input" id="cfg-igss-pat" type="number" step="0.01" value="${((config?.cuota_patronal||0.1267)*100).toFixed(2)}">
          </div>
          <div class="form-group">
            <label class="form-label">INTECAP (%)</label>
            <input class="form-input" id="cfg-intecap" type="number" step="0.01" value="${((config?.intecap||0.01)*100).toFixed(2)}">
          </div>
          <div class="form-group">
            <label class="form-label">
              <input type="checkbox" id="cfg-irtra" ${config?.aplica_irtra?'checked':''} style="margin-right:8px">
              Aplica IRTRA (1%)
            </label>
          </div>
        </div>

        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
          <div class="card-sub mb-3">💳 Configuración POS</div>
          <div class="grid-2" style="gap:14px">
            <div class="form-group">
              <label class="form-label">Proveedor POS Principal</label>
              <select class="form-select" id="cfg-pos-proveedor">
                <option value="visanet"    ${config?.pos_proveedor==='visanet'   ?'selected':''}>Visanet Guatemala</option>
                <option value="credomatic" ${config?.pos_proveedor==='credomatic'?'selected':''}>BAC Credomatic</option>
                <option value="ambos"      ${config?.pos_proveedor==='ambos'     ?'selected':''}>Ambos</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Cargo Mensual POS (Q)</label>
              <input class="form-input" id="cfg-pos-mensual" type="number" step="0.01"
                     value="${config?.pos_cargo_mensual||0}" placeholder="0.00">
            </div>
            <div class="form-group">
              <label class="form-label">Comisión Débito Visanet (%)</label>
              <input class="form-input" id="cfg-com-debito-visa" type="number" step="0.01"
                     value="${config?.com_debito_visanet||2.50}" placeholder="2.50">
            </div>
            <div class="form-group">
              <label class="form-label">Comisión Crédito Visanet (%)</label>
              <input class="form-input" id="cfg-com-credito-visa" type="number" step="0.01"
                     value="${config?.com_credito_visanet||3.00}" placeholder="3.00">
            </div>
            <div class="form-group">
              <label class="form-label">Comisión Débito Credomatic (%)</label>
              <input class="form-input" id="cfg-com-debito-credo" type="number" step="0.01"
                     value="${config?.com_debito_credomatic||2.50}" placeholder="2.50">
            </div>
            <div class="form-group">
              <label class="form-label">Comisión Crédito Credomatic (%)</label>
              <input class="form-input" id="cfg-com-credito-credo" type="number" step="0.01"
                     value="${config?.com_credito_credomatic||3.00}" placeholder="3.00">
            </div>
          </div>
          <div class="alert alert-cyan" style="margin-top:12px">
            <div class="alert-icon">💡</div>
            <div><div class="alert-title">Cuotas Visa / MasterCuotas</div>
            <div class="alert-body">Las cuotas (3, 6, 10, 12, 18 meses) son financiadas por el banco emisor.
            El taller recibe el monto completo menos la comisión por transacción. Solo se registran como referencia.</div></div>
          </div>
        </div>
        <button class="btn btn-amber mt-3" onclick="Pages.guardarConfigFiscal()">Guardar Configuración Fiscal</button>
      </div>`;
  },

  /* ── ESTADO DE RESULTADOS ────────────────────────── */
  renderResultados(ingresos, egresos, config) {
    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const ahora = new Date();
    const mes   = ahora.getMonth();
    const anio  = ahora.getFullYear();
    const mesStr= `${anio}-${String(mes+1).padStart(2,'0')}`;

    /* Agrupar ingresos y egresos por categoría */
    const ingMes  = ingresos.filter(i=>(i.fecha||'').startsWith(mesStr));
    const egMes   = egresos.filter(e=>(e.fecha||'').startsWith(mesStr));

    const totalIngresos   = ingMes.reduce((s,i)=>s+i.monto,0);
    const costoServicios  = egMes.filter(e=>['compra_inventario','herramientas'].includes(e.categoria)).reduce((s,e)=>s+e.monto,0);
    const utilBruta       = totalIngresos - costoServicios;
    const gastoNomina     = egMes.filter(e=>e.categoria==='nomina').reduce((s,e)=>s+e.monto,0);
    const gastoIGSS       = egMes.filter(e=>e.categoria==='igss').reduce((s,e)=>s+e.monto,0);
    const gastoAlquiler   = egMes.filter(e=>e.categoria==='alquiler').reduce((s,e)=>s+e.monto,0);
    const gastoServicios  = egMes.filter(e=>e.categoria==='servicios').reduce((s,e)=>s+e.monto,0);
    const gastoPublicidad = egMes.filter(e=>e.categoria==='publicidad').reduce((s,e)=>s+e.monto,0);
    const gastoOtros      = egMes.filter(e=>['combustible','otros'].includes(e.categoria)).reduce((s,e)=>s+e.monto,0);
    const gastoImpuestos  = egMes.filter(e=>e.categoria==='impuestos').reduce((s,e)=>s+e.monto,0);
    const totalGastosOp   = gastoNomina+gastoIGSS+gastoAlquiler+gastoServicios+gastoPublicidad+gastoOtros;
    const utilOperativa   = utilBruta - totalGastosOp;
    const isr             = FINANZAS.calcularISR(utilOperativa>0?utilOperativa:0, config);
    const utilNeta        = utilOperativa - isr - gastoImpuestos;
    const margenNeto      = totalIngresos>0 ? (utilNeta/totalIngresos*100).toFixed(1) : '0.0';

    const fila = (label, monto, indent=0, bold=false, color='', separador=false) => `
      <tr style="${separador?'border-top:2px solid var(--border);':''}${bold?'font-weight:700;':''}${color?'color:'+color+';':''}">
        <td style="padding:7px 12px;padding-left:${12+indent*20}px;font-size:13px">${label}</td>
        <td style="padding:7px 16px;text-align:right;font-family:'DM Mono',monospace;font-size:13px;${color?'color:'+color+';':''}">${monto>=0?'':'-'}${UI.q(Math.abs(monto))}</td>
        <td style="padding:7px 8px;text-align:right;font-size:11px;color:var(--text3)">${totalIngresos>0?(monto/totalIngresos*100).toFixed(1)+'%':''}</td>
      </tr>`;

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;font-size:15px">📈 Estado de Resultados</div>
          <div class="text-muted" style="font-size:12px">Período: ${MESES[mes]} ${anio} · ${config?FINANZAS.regimen(config):'—'}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="FINANZAS.imprimirResultados()">🖨️ Imprimir</button>
      </div>

      <!-- Alertas y recomendaciones SAT -->
      ${margenNeto < 10 && totalIngresos > 0 ? `
      <div class="alert alert-amber mb-4">
        <div class="alert-icon">💡</div>
        <div>
          <div class="alert-title">Margen neto bajo (${margenNeto}%)</div>
          <div class="alert-body" style="font-size:12px">
            Un taller mecánico saludable debería tener un margen neto entre 15-25%.
            Revisa los gastos operativos y considera ajustar precios de mano de obra.
          </div>
        </div>
      </div>` : ''}

      <div id="estado-resultados-tabla">
        <table style="width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:var(--surface2)">
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--text3);letter-spacing:.06em;text-transform:uppercase">Concepto</th>
              <th style="padding:10px 16px;text-align:right;font-size:11px;color:var(--text3);letter-spacing:.06em;text-transform:uppercase">Monto (Q)</th>
              <th style="padding:10px 8px;text-align:right;font-size:11px;color:var(--text3);letter-spacing:.06em;text-transform:uppercase">% Ing.</th>
            </tr>
          </thead>
          <tbody>
            <!-- INGRESOS -->
            ${fila('INGRESOS POR SERVICIOS', 0, 0, true, 'var(--text2)')}
            ${fila('Cobros de Órdenes de Trabajo', ingMes.filter(i=>i.tipo==='cobro_ot').reduce((s,i)=>s+i.monto,0), 1)}
            ${fila('Anticipos y Abonos', ingMes.filter(i=>['anticipo','abono'].includes(i.tipo)).reduce((s,i)=>s+i.monto,0), 1)}
            ${fila('Otros Ingresos', ingMes.filter(i=>i.tipo==='otro').reduce((s,i)=>s+i.monto,0), 1)}
            ${fila('TOTAL INGRESOS', totalIngresos, 0, true, 'var(--green)', true)}

            <!-- COSTO DE SERVICIOS -->
            ${fila('COSTO DE SERVICIOS Y REPUESTOS', 0, 0, true, 'var(--text2)')}
            ${fila('Compra de Repuestos e Insumos', egMes.filter(e=>e.categoria==='compra_inventario').reduce((s,e)=>s+e.monto,0), 1)}
            ${fila('Herramientas y Equipos', egMes.filter(e=>e.categoria==='herramientas').reduce((s,e)=>s+e.monto,0), 1)}
            ${fila('COSTO TOTAL', costoServicios, 0, true, 'var(--red)', true)}
            ${fila('UTILIDAD BRUTA', utilBruta, 0, true, utilBruta>=0?'var(--green)':'var(--red)', true)}

            <!-- GASTOS OPERATIVOS -->
            ${fila('GASTOS OPERATIVOS', 0, 0, true, 'var(--text2)')}
            ${fila('Sueldos y Salarios', gastoNomina, 1)}
            ${fila('Cuotas IGSS / INTECAP / IRTRA', gastoIGSS, 1)}
            ${fila('Alquiler del Local', gastoAlquiler, 1)}
            ${fila('Servicios (agua, luz, internet, tel.)', gastoServicios, 1)}
            ${fila('Publicidad y Mercadeo', gastoPublicidad, 1)}
            ${fila('Combustible y Otros', gastoOtros, 1)}
            ${fila('TOTAL GASTOS OPERATIVOS', totalGastosOp, 0, true, 'var(--red)', true)}
            ${fila('UTILIDAD OPERATIVA', utilOperativa, 0, true, utilOperativa>=0?'var(--green)':'var(--red)', true)}

            <!-- IMPUESTOS -->
            ${fila('IMPUESTOS Y OBLIGACIONES FISCALES', 0, 0, true, 'var(--text2)')}
            ${fila('ISR Estimado (' + (config?.regimen_iva==='rsu'?'25%':config?.regimen_iva==='repc'?'N/A':'5-7%') + ')', isr, 1)}
            ${fila('Otros Impuestos SAT', gastoImpuestos, 1)}

            <!-- UTILIDAD NETA -->
            ${fila('UTILIDAD NETA DEL PERÍODO', utilNeta, 0, true, utilNeta>=0?'var(--green)':'var(--red)', true)}
          </tbody>
          <tfoot>
            <tr style="background:var(--surface2);border-top:2px solid var(--border)">
              <td colspan="3" style="padding:12px;font-size:12px;color:var(--text2)">
                <b>Margen Bruto:</b> ${totalIngresos>0?(utilBruta/totalIngresos*100).toFixed(1):0}% &nbsp;·&nbsp;
                <b>Margen Operativo:</b> ${totalIngresos>0?(utilOperativa/totalIngresos*100).toFixed(1):0}% &nbsp;·&nbsp;
                <b>Margen Neto:</b> <b>${margenNeto}%</b> &nbsp;&nbsp;·&nbsp;&nbsp;
                Régimen: ${FINANZAS.regimen(config)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- RECOMENDACIONES SAT GUATEMALA -->
      <div class="card card-purple mt-5">
        <div class="card-sub mb-4">💡 Guía de Cumplimiento Fiscal — SAT Guatemala</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">
          ${[
            {icon:'🗓️', titulo:'Declaración IVA', desc:'Presentar mensualmente antes del día 30. Régimen General: diferencia débito-crédito. Pequeño Contribuyente: 5% sobre ingresos (Formulario SAT-2046).'},
            {icon:'📊', titulo:'ISR Mensual/Trimestral', desc:`${config?.regimen_iva==='rsu'?'Régimen Utilidades: 25% sobre utilidad neta. Pagos trimestrales. Cierre fiscal anual en diciembre.':config?.regimen_iva==='repc'?'Pequeño Contribuyente: IVA incluido al 5%. Sin ISR separado. Límite Q150,000/año.':'Régimen General/ROSE: 5% ingresos ≤Q30,000 trimestre, 7% sobre excedente.'}`},
            {icon:'🏛️', titulo:'IGSS Patronal', desc:'Reportar y pagar antes del día 20 de cada mes. Cuota patronal 12.67%, laboral 4.83%. INTECAP 1%, IRTRA 1% sobre planilla.'},
            {icon:'📚', titulo:'Libros Contables SAT', desc:'Obligatorio llevar: Diario, Mayor, Compras y Ventas. Deben estar habilitados por la SAT. Conservar por 4 años.'},
            {icon:'🧾', titulo:'FEL Obligatorio', desc:'Toda factura debe ser FEL (Factura Electrónica en Línea). CF solo para montos ≤Q2,500. Arriba de ese monto, NIT o DPI del cliente obligatorio.'},
            {icon:'⚠️', titulo:'Multas y Sanciones', desc:'Omisión de declaración: multa de Q1,000 a Q10,000 + intereses. Retención IVA no declarado: 100% del impuesto. Lleva tu contabilidad al día.'}
          ].map(r=>`
            <div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:14px">
              <div style="font-size:20px;margin-bottom:6px">${r.icon}</div>
              <div style="font-weight:700;font-size:13px;margin-bottom:4px">${r.titulo}</div>
              <div style="font-size:12px;color:var(--text2);line-height:1.5">${r.desc}</div>
            </div>`).join('')}
        </div>
      </div>`;
  },

  imprimirResultados() {
    const tabla = document.getElementById('estado-resultados-tabla');
    if (!tabla) return;
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Estado de Resultados</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;margin:2cm;color:#000}
    table{width:100%;border-collapse:collapse;margin:12px 0}
    th{background:#f3f4f6;padding:7px;border:1px solid #ddd;text-align:left}
    td{padding:6px 10px;border:1px solid #ddd}
    .header{border-bottom:2px solid #000;margin-bottom:16px;padding-bottom:8px;display:flex;justify-content:space-between}
    @media print{body{margin:1cm}}</style></head><body>
    <div class="header">
      <div><b>${Auth.tenant?.name}</b> · NIT: ${Auth.tenant?.nit||'—'}</div>
      <div>Estado de Resultados · ${new Date().toLocaleDateString('es-GT')}</div>
    </div>
    ${tabla.innerHTML.replace(/style="[^"]*color:[^"]*"/g,'').replace(/<button[^>]*>[^<]*<\/button>/g,'')}
    </body></html>`;
    const win=window.open('','_blank');win.document.write(html);win.document.close();setTimeout(()=>win.print(),400);
  },

  /* ── CHARTS ───────────────────────────────────────── */
  initCharts(ingresos, egresos) {
    const meses = ['Nov','Dic','Ene','Feb','Mar','Abr'];
    const gridColor = 'rgba(30,45,61,0.6)', tickColor = '#7A9BB5';

    const ctx1 = document.getElementById('chart-fin-pnl');
    if (ctx1) {
      App.charts.finPnl = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: meses,
          datasets: [
            { label:'Ingresos', data:[18200,22400,19800,24100,21500,FINANZAS.totalMes(ingresos)||0],
              backgroundColor:'rgba(16,185,129,0.3)', borderColor:'#10B981', borderWidth:2, borderRadius:4 },
            { label:'Egresos', data:[12100,15300,13200,16800,14500,FINANZAS.totalMes(egresos)||0],
              backgroundColor:'rgba(239,68,68,0.3)', borderColor:'#EF4444', borderWidth:2, borderRadius:4 }
          ]
        },
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{labels:{color:tickColor,font:{size:10}}}},
          scales:{
            x:{grid:{color:gridColor},ticks:{color:tickColor,font:{size:10}}},
            y:{grid:{color:gridColor},ticks:{color:tickColor,font:{size:10},callback:v=>'Q'+v.toLocaleString()}}
          }
        }
      });
    }

    const ctx2 = document.getElementById('chart-fin-egresos');
    if (ctx2) {
      const cats = {};
      egresos.forEach(e => { cats[e.categoria] = (cats[e.categoria]||0) + e.monto; });
      const labels = Object.keys(cats).map(c => FINANZAS.labelCategoria(c));
      const data   = Object.values(cats);
      App.charts.finEg = new Chart(ctx2, {
        type:'doughnut',
        data:{labels, datasets:[{data, backgroundColor:['#F59E0B','#06B6D4','#10B981','#8B5CF6','#EF4444','#3D5570','#F472B6'],borderWidth:0}]},
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{position:'right',labels:{color:tickColor,font:{size:10},boxWidth:10}}}}
      });
    }
  },

  /* ── MESES OPCIONES ───────────────────────────────── */
  mesesOpciones(arr) {
    const meses = [...new Set(arr.map(x => (x.fecha||'').slice(0,7)).filter(Boolean))].sort().reverse();
    return meses.map(m => `<option value="${m}">${m}</option>`).join('');
  }
};

/* ══════════════════════════════════════════════════════
   MODALES Y ACCIONES
══════════════════════════════════════════════════════ */

Pages.filterFin = function (tbodyId, inputId) {
  const q = (document.getElementById(inputId)?.value||'').toLowerCase();
  document.querySelectorAll('#'+tbodyId+' tr').forEach(r => {
    r.style.display = (r.dataset.text||r.textContent).toLowerCase().includes(q) ? '' : 'none';
  });
};

Pages.filterFinMes = function (tbodyId, selectId) {
  const mes = document.getElementById(selectId)?.value || '';
  document.querySelectorAll('#'+tbodyId+' tr').forEach(r => {
    r.style.display = !mes || r.dataset.mes === mes ? '' : 'none';
  });
};

Pages.modalNuevoIngreso = async function () {
  const clientes = await DB.getClientes();
  const ordenes  = (await DB.getOrdenes()).filter(o => o.estado === 'listo' || o.estado === 'entregado');

  UI.openModal('Nuevo Ingreso', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tipo *</label>
        <select class="form-select" id="ni-tipo">
          <option value="cobro_ot">Cobro OT</option>
          <option value="anticipo">Anticipo</option>
          <option value="abono">Abono a crédito</option>
          <option value="otro">Otro ingreso</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-input" id="ni-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Concepto *</label>
      <input class="form-input" id="ni-concepto" placeholder="Descripción del ingreso">
    </div>
    <div class="form-group">
      <label class="form-label">OT Asociada (opcional)</label>
      <select class="form-select" id="ni-ot" onchange="Pages.llenarMontoOT(this)">
        <option value="">Sin OT</option>
        ${ordenes.map(o=>{const v=o.vehiculos;return`<option value="${o.id}" data-total="${o.total}">${o.num} — ${v?.placa||''} Q${o.total}</option>`}).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Cliente</label>
      <select class="form-select" id="ni-cliente">
        <option value="">Seleccionar...</option>
        ${clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Monto Total (Q) *</label>
        <input class="form-input" id="ni-monto" type="number" min="0" step="0.01" placeholder="0.00"
               oninput="Pages.calcularComisionTarjeta()">
      </div>
      <div class="form-group">
        <label class="form-label">Método de Pago *</label>
        <select class="form-select" id="ni-metodo" onchange="Pages.toggleCamposTarjeta()">
          <option value="efectivo">💵 Efectivo</option>
          <option value="tarjeta_debito">💳 Tarjeta Débito</option>
          <option value="tarjeta_credito">💳 Tarjeta Crédito</option>
          <option value="cheque">🗒️ Cheque</option>
          <option value="transferencia">🏦 Transferencia</option>
          <option value="credito">📋 Crédito (CxC)</option>
        </select>
      </div>
    </div>

    <!-- Campos tarjeta (se muestran solo con tarjeta) -->
    <div id="campos-tarjeta" class="hidden">
      <div class="card" style="padding:14px;margin-bottom:4px;border-color:var(--cyan-border)">
        <div class="card-sub mb-3">💳 Detalles de Tarjeta</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Proveedor POS</label>
            <select class="form-select" id="ni-pos" onchange="Pages.calcularComisionTarjeta()">
              <option value="visanet">Visanet</option>
              <option value="credomatic">BAC Credomatic</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Comisión del POS (%)</label>
            <input class="form-input" id="ni-comision" type="number" step="0.01" value="3.00" min="0" max="10"
                   oninput="Pages.calcularComisionTarjeta()">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cuotas (solo referencia)</label>
            <select class="form-select" id="ni-cuotas">
              <option value="1">Contado (1 cuota)</option>
              <option value="3">3 cuotas</option>
              <option value="6">6 cuotas</option>
              <option value="10">10 cuotas</option>
              <option value="12">12 cuotas</option>
              <option value="18">18 cuotas</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">No. de Autorización</label>
            <input class="form-input" id="ni-autorizacion" placeholder="123456">
          </div>
        </div>
        <!-- Resumen comisión -->
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:12px;margin-top:4px">
          <div class="flex items-center justify-between mb-2">
            <span class="text-muted" style="font-size:12px">Monto bruto</span>
            <span class="mono-sm" id="ni-monto-bruto">Q0.00</span>
          </div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-muted" style="font-size:12px">Comisión POS</span>
            <span class="mono-sm text-red" id="ni-monto-comision">-Q0.00</span>
          </div>
          <div class="flex items-center justify-between" style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
            <span style="font-weight:700;font-size:12px">Ingreso neto</span>
            <span class="mono-sm text-green" id="ni-monto-neto">Q0.00</span>
          </div>
        </div>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Referencia / No. Documento</label>
      <input class="form-input" id="ni-ref" placeholder="No. cheque, autorización, etc.">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarIngreso()">Registrar Ingreso</button>
    </div>`
  );
};

Pages.llenarMontoOT = function (sel) {
  const total = sel.options[sel.selectedIndex]?.dataset.total || '';
  if (total) document.getElementById('ni-monto').value = parseFloat(total).toFixed(2);
};


Pages.toggleCamposTarjeta = function () {
  const metodo = document.getElementById('ni-metodo')?.value || '';
  const campos = document.getElementById('campos-tarjeta');
  if (!campos) return;
  const esTarjeta = metodo === 'tarjeta_debito' || metodo === 'tarjeta_credito';
  campos.classList.toggle('hidden', !esTarjeta);
  if (esTarjeta) Pages.calcularComisionTarjeta();
};

Pages.calcularComisionTarjeta = function () {
  const monto    = parseFloat(document.getElementById('ni-monto')?.value || 0);
  const comPct   = parseFloat(document.getElementById('ni-comision')?.value || 0) / 100;
  const comMonto = monto * comPct;
  const neto     = monto - comMonto;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('ni-monto-bruto',    UI.q(monto));
  setEl('ni-monto-comision', '-' + UI.q(comMonto));
  setEl('ni-monto-neto',     UI.q(neto));
};

Pages.guardarIngreso = async function () {
  const concepto = document.getElementById('ni-concepto').value.trim();
  const montoBruto = parseFloat(document.getElementById('ni-monto').value) || 0;
  const metodo     = document.getElementById('ni-metodo').value;
  if (!concepto)     { UI.toast('El concepto es obligatorio', 'error'); return; }
  if (montoBruto <= 0){ UI.toast('El monto debe ser mayor a 0', 'error'); return; }

  const config = Pages._finConfig;
  let montoNeto = montoBruto;
  let comisionMonto = 0;
  let referencia = document.getElementById('ni-ref').value.trim() || null;
  let notas = '';

  // Calcular comisión si es tarjeta
  if (metodo === 'tarjeta_debito' || metodo === 'tarjeta_credito') {
    const comisionPct = parseFloat(document.getElementById('ni-comision')?.value || 0) / 100;
    comisionMonto = montoBruto * comisionPct;
    montoNeto     = montoBruto - comisionMonto;
    const proveedor = document.getElementById('ni-pos')?.value || '';
    const cuotas    = document.getElementById('ni-cuotas')?.value || '1';
    const autorizacion = document.getElementById('ni-autorizacion')?.value.trim() || '';
    referencia = autorizacion || referencia;
    notas = `Proveedor POS: ${proveedor} | Comisión: ${(comisionPct*100).toFixed(2)}% (Q${comisionMonto.toFixed(2)}) | Cuotas: ${cuotas} | Bruto: Q${montoBruto.toFixed(2)}`;

    // Registrar egreso de comisión automáticamente
    if (comisionMonto > 0) {
      await DB.insertEgreso({
        categoria:   'otros',
        concepto:    `Comisión POS ${proveedor} — ${concepto}`,
        monto:       parseFloat(comisionMonto.toFixed(2)),
        fecha:       document.getElementById('ni-fecha').value,
        proveedor:   proveedor === 'visanet' ? 'Visanet Guatemala' : proveedor === 'credomatic' ? 'BAC Credomatic' : 'POS',
        metodo_pago: 'transferencia',
        notas:       `Comisión automática por pago con tarjeta`
      });
    }

    // Si es crédito (CxC), crear cuenta por cobrar
    if (metodo === 'credito') {
      const clienteId = document.getElementById('ni-cliente').value;
      if (clienteId) {
        await DB.insertCXC({
          cliente_id:  clienteId,
          ot_id:       document.getElementById('ni-ot').value || null,
          concepto,
          monto_total: montoBruto,
          monto_pagado:0,
          estado:      'pendiente'
        });
      }
    }
  }

  const iva = FINANZAS.calcularIVA(montoNeto, config);

  const { error } = await DB.insertIngreso({
    tipo:        document.getElementById('ni-tipo').value,
    concepto,
    monto:       parseFloat(montoNeto.toFixed(2)),
    iva:         parseFloat(iva.toFixed(2)),
    fecha:       document.getElementById('ni-fecha').value,
    ot_id:       document.getElementById('ni-ot').value || null,
    cliente_id:  document.getElementById('ni-cliente').value || null,
    metodo_pago: metodo,
    referencia,
    notas
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast(`Ingreso registrado ✓ Neto: ${UI.q(montoNeto)}`);
  Pages.finanzas(_finTab);
};

Pages.eliminarIngreso = async function (id) {
  UI.confirm('¿Eliminar este ingreso? No se puede deshacer.', async () => {
    const ok = await DB.deleteIngreso(id);
    if (ok) { UI.closeModal(); UI.toast('Ingreso eliminado'); Pages.finanzas('ingresos'); }
    else UI.toast('Error al eliminar', 'error');
  });
};

Pages.modalNuevoEgreso = function () {
  UI.openModal('Nuevo Egreso', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Categoría *</label>
        <select class="form-select" id="ne2-cat">
          <option value="compra_inventario">📦 Compra de Inventario</option>
          <option value="nomina">👤 Nómina</option>
          <option value="igss">🏛️ IGSS</option>
          <option value="alquiler">🏢 Alquiler</option>
          <option value="servicios">💡 Servicios (agua, luz, internet)</option>
          <option value="combustible">⛽ Combustible</option>
          <option value="herramientas">🔧 Herramientas y Equipo</option>
          <option value="publicidad">📢 Publicidad</option>
          <option value="impuestos">🏛️ Impuestos (SAT)</option>
          <option value="otros">📋 Otros</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-input" id="ne2-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Concepto *</label>
      <input class="form-input" id="ne2-concepto" placeholder="Descripción del egreso">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Proveedor</label>
        <input class="form-input" id="ne2-prov" placeholder="Nombre del proveedor">
      </div>
      <div class="form-group">
        <label class="form-label">No. Factura / Documento</label>
        <input class="form-input" id="ne2-nfact" placeholder="FEL-2025-000123">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Monto (Q) *</label>
        <input class="form-input" id="ne2-monto" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label">Método de Pago</label>
        <select class="form-select" id="ne2-metodo">
          <option value="efectivo">💵 Efectivo</option>
          <option value="tarjeta_debito">💳 Tarjeta Débito</option>
          <option value="tarjeta_credito">💳 Tarjeta Crédito</option>
          <option value="cheque">🗒️ Cheque</option>
          <option value="transferencia">🏦 Transferencia</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <input class="form-input" id="ne2-notas" placeholder="Observaciones adicionales">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarEgreso()">Registrar Egreso</button>
    </div>`
  );
};

Pages.guardarEgreso = async function () {
  const concepto = document.getElementById('ne2-concepto').value.trim();
  const monto    = parseFloat(document.getElementById('ne2-monto').value) || 0;
  if (!concepto) { UI.toast('El concepto es obligatorio', 'error'); return; }
  if (monto <= 0){ UI.toast('El monto debe ser mayor a 0', 'error'); return; }

  const { error } = await DB.insertEgreso({
    categoria:   document.getElementById('ne2-cat').value,
    concepto,
    monto,
    fecha:       document.getElementById('ne2-fecha').value,
    proveedor:   document.getElementById('ne2-prov').value.trim() || null,
    num_factura: document.getElementById('ne2-nfact').value.trim() || null,
    metodo_pago: document.getElementById('ne2-metodo').value,
    notas:       document.getElementById('ne2-notas').value.trim() || null
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Egreso registrado ✓');
  Pages.finanzas(_finTab);
};

Pages.eliminarEgreso = async function (id) {
  UI.confirm('¿Eliminar este egreso?', async () => {
    const ok = await DB.deleteEgreso(id);
    if (ok) { UI.closeModal(); UI.toast('Egreso eliminado'); Pages.finanzas('egresos'); }
    else UI.toast('Error al eliminar', 'error');
  });
};

Pages.modalNuevaCXC = async function () {
  const clientes = await DB.getClientes();
  const ordenes  = await DB.getOrdenes();

  UI.openModal('Nueva Cuenta por Cobrar', `
    <div class="form-group">
      <label class="form-label">Cliente *</label>
      <select class="form-select" id="cxc-cli">
        <option value="">Seleccionar...</option>
        ${clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">OT Asociada (opcional)</label>
      <select class="form-select" id="cxc-ot" onchange="Pages.llenarMontoOT2(this)">
        <option value="">Sin OT</option>
        ${ordenes.map(o=>{const v=o.vehiculos;return`<option value="${o.id}" data-total="${o.total}">${o.num} — ${v?.placa||''} Q${o.total}</option>`}).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Concepto *</label>
      <input class="form-input" id="cxc-concepto" placeholder="Descripción del crédito">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Monto Total (Q) *</label>
        <input class="form-input" id="cxc-monto" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label">Fecha Vencimiento</label>
        <input class="form-input" id="cxc-vence" type="date">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarCXC()">Crear Cuenta</button>
    </div>`
  );
};

Pages.llenarMontoOT2 = function (sel) {
  const total = sel.options[sel.selectedIndex]?.dataset.total || '';
  if (total) document.getElementById('cxc-monto').value = parseFloat(total).toFixed(2);
};

Pages.guardarCXC = async function () {
  const cliId    = document.getElementById('cxc-cli').value;
  const concepto = document.getElementById('cxc-concepto').value.trim();
  const monto    = parseFloat(document.getElementById('cxc-monto').value) || 0;
  if (!cliId)    { UI.toast('Selecciona un cliente', 'error'); return; }
  if (!concepto) { UI.toast('El concepto es obligatorio', 'error'); return; }
  if (monto <= 0){ UI.toast('El monto debe ser mayor a 0', 'error'); return; }

  const { error } = await DB.insertCXC({
    cliente_id:        cliId,
    ot_id:             document.getElementById('cxc-ot').value || null,
    concepto,
    monto_total:       monto,
    monto_pagado:      0,
    fecha_vencimiento: document.getElementById('cxc-vence').value || null,
    estado:            'pendiente'
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Cuenta por cobrar creada ✓');
  Pages.finanzas('cxc');
};

Pages.modalAbonar = function (cuentaId, saldoLabel) {
  UI.openModal('Registrar Abono', `
    <div class="alert alert-cyan" style="margin-bottom:16px">
      <div class="alert-icon">💰</div>
      <div><div class="alert-title">Saldo Pendiente</div>
      <div class="alert-body">${saldoLabel}</div></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Monto del Abono (Q) *</label>
        <input class="form-input" id="ab-monto" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label">Método de Pago</label>
        <select class="form-select" id="ab-metodo">
          <option value="efectivo">💵 Efectivo</option>
          <option value="tarjeta_debito">💳 Tarjeta Débito</option>
          <option value="tarjeta_credito">💳 Tarjeta Crédito</option>
          <option value="cheque">🗒️ Cheque</option>
          <option value="transferencia">🏦 Transferencia</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Referencia</label>
      <input class="form-input" id="ab-ref" placeholder="No. cheque, autorización...">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.registrarAbono('${cuentaId}')">Registrar Abono</button>
    </div>`
  );
};

Pages.registrarAbono = async function (cuentaId) {
  const monto = parseFloat(document.getElementById('ab-monto').value) || 0;
  if (monto <= 0) { UI.toast('El monto debe ser mayor a 0', 'error'); return; }

  const { error } = await DB.insertAbono({
    cuenta_id:  cuentaId,
    monto,
    metodo_pago:document.getElementById('ab-metodo').value,
    referencia: document.getElementById('ab-ref').value.trim() || null,
    fecha:      new Date().toISOString().slice(0,10)
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Abono registrado ✓');
  Pages.finanzas('cxc');
};

Pages.guardarConfigFiscal = async function () {
  const regimen = document.getElementById('cfg-regimen').value;
  const ok = await DB.updateConfigFiscal({
    num_patrono_igss:      document.getElementById('cfg-igss-num').value.trim(),
    regimen_iva:           regimen,
    tasa_iva:              regimen === 'repc' ? 0.05 : 0.12,
    tasa_isr:              regimen === 'rsu'  ? 0.25 : 0.05,
    cuota_laboral:         parseFloat(document.getElementById('cfg-igss-lab').value) / 100,
    cuota_patronal:        parseFloat(document.getElementById('cfg-igss-pat').value) / 100,
    intecap:               parseFloat(document.getElementById('cfg-intecap').value) / 100,
    aplica_irtra:          document.getElementById('cfg-irtra').checked,
    pos_proveedor:         document.getElementById('cfg-pos-proveedor')?.value || 'visanet',
    pos_cargo_mensual:     parseFloat(document.getElementById('cfg-pos-mensual')?.value || 0),
    com_debito_visanet:    parseFloat(document.getElementById('cfg-com-debito-visa')?.value || 2.5),
    com_credito_visanet:   parseFloat(document.getElementById('cfg-com-credito-visa')?.value || 3),
    com_debito_credomatic: parseFloat(document.getElementById('cfg-com-debito-credo')?.value || 2.5),
    com_credito_credomatic:parseFloat(document.getElementById('cfg-com-credito-credo')?.value || 3)
  });

  if (ok) { UI.toast('Configuración fiscal y POS guardada ✓'); Pages.finanzas('fiscal'); }
  else UI.toast('Error al guardar', 'error');
};
