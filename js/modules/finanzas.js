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
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'ingresos',  icon: '💰', label: 'Ingresos'  },
    { id: 'egresos',   icon: '📉', label: 'Egresos'   },
    { id: 'cxc',       icon: '📋', label: 'Cuentas x Cobrar' },
    { id: 'fiscal',    icon: '🏛️', label: 'Fiscal & IGSS' }
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
        <button class="btn btn-amber mt-3" onclick="Pages.guardarConfigFiscal()">Guardar Configuración Fiscal</button>
      </div>`;
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
        <input class="form-input" id="ni-monto" type="number" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label">Método de Pago *</label>
        <select class="form-select" id="ni-metodo">
          <option value="efectivo">💵 Efectivo</option>
          <option value="tarjeta_debito">💳 Tarjeta Débito</option>
          <option value="tarjeta_credito">💳 Tarjeta Crédito</option>
          <option value="cheque">🗒️ Cheque</option>
          <option value="transferencia">🏦 Transferencia</option>
          <option value="credito">📋 Crédito</option>
        </select>
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

Pages.guardarIngreso = async function () {
  const concepto = document.getElementById('ni-concepto').value.trim();
  const monto    = parseFloat(document.getElementById('ni-monto').value) || 0;
  if (!concepto)   { UI.toast('El concepto es obligatorio', 'error'); return; }
  if (monto <= 0)  { UI.toast('El monto debe ser mayor a 0', 'error'); return; }

  const config = Pages._finConfig;
  const iva    = FINANZAS.calcularIVA(monto, config);

  const { error } = await DB.insertIngreso({
    tipo:       document.getElementById('ni-tipo').value,
    concepto,
    monto,
    iva:        parseFloat(iva.toFixed(2)),
    fecha:      document.getElementById('ni-fecha').value,
    ot_id:      document.getElementById('ni-ot').value || null,
    cliente_id: document.getElementById('ni-cliente').value || null,
    metodo_pago:document.getElementById('ni-metodo').value,
    referencia: document.getElementById('ni-ref').value.trim() || null
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast('Ingreso registrado ✓');
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
  const ok = await DB.updateConfigFiscal({
    num_patrono_igss: document.getElementById('cfg-igss-num').value.trim(),
    regimen_iva:      document.getElementById('cfg-regimen').value,
    tasa_iva:         document.getElementById('cfg-regimen').value === 'repc' ? 0.05 : 0.12,
    tasa_isr:         document.getElementById('cfg-regimen').value === 'rsu'  ? 0.25 : 0.05,
    cuota_laboral:    parseFloat(document.getElementById('cfg-igss-lab').value) / 100,
    cuota_patronal:   parseFloat(document.getElementById('cfg-igss-pat').value) / 100,
    intecap:          parseFloat(document.getElementById('cfg-intecap').value) / 100,
    aplica_irtra:     document.getElementById('cfg-irtra').checked
  });

  if (ok) { UI.toast('Configuración fiscal guardada ✓'); Pages.finanzas('fiscal'); }
  else UI.toast('Error al guardar', 'error');
};
