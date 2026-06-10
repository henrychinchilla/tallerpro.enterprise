/* TallerPro v3.0 — finanzas/index.js */
Modulos.finanzas = {
  _tab: 'dashboard', _ini: null, _fin: null, _empleados: [],

  async render() {
    const el = document.getElementById('page-content');
    const now = new Date();
    if (!this._ini) {
      this._ini = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
      this._fin = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
    }
    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">💰 Finanzas</h1></div>
        <div class="page-actions">
          <input type="month" class="form-input" style="width:150px" value="${this._ini.slice(0,7)}" title="Ver un mes" onchange="Modulos.finanzas._setMes(this.value)">
          <input type="date" class="form-input" style="width:140px" value="${this._ini}" title="Desde" onchange="Modulos.finanzas._ini=this.value;Modulos.finanzas._renderTab()">
          <input type="date" class="form-input" style="width:140px" value="${this._fin}" title="Hasta" onchange="Modulos.finanzas._fin=this.value;Modulos.finanzas._renderTab()">
        </div>
      </div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='dashboard'?'active':''}" onclick="Modulos.finanzas._tab='dashboard';Modulos.finanzas._renderTab()">📊 Resumen</button>
          <button class="tab-btn ${this._tab==='ingresos'?'active':''}" onclick="Modulos.finanzas._tab='ingresos';Modulos.finanzas._renderTab()">📈 Ingresos</button>
          <button class="tab-btn ${this._tab==='egresos'?'active':''}" onclick="Modulos.finanzas._tab='egresos';Modulos.finanzas._renderTab()">📉 Egresos</button>
          <button class="tab-btn ${this._tab==='viaticos'?'active':''}" onclick="Modulos.finanzas._tab='viaticos';Modulos.finanzas._renderTab()">🚗 Viáticos</button>
          <button class="tab-btn ${this._tab==='recurrentes'?'active':''}" onclick="Modulos.finanzas._tab='recurrentes';Modulos.finanzas._renderTab()">🔁 Recurrentes</button>
          <button class="tab-btn ${this._tab==='balance'?'active':''}" onclick="Modulos.finanzas._tab='balance';Modulos.finanzas._renderTab()">📋 Estado de Resultados</button>
          <button class="tab-btn ${this._tab==='libros'?'active':''}" onclick="Modulos.finanzas._tab='libros';Modulos.finanzas._renderTab()">📚 Libro IVA</button>
          <button class="tab-btn ${this._tab==='retenciones'?'active':''}" onclick="Modulos.finanzas._tab='retenciones';Modulos.finanzas._renderTab()">🧾 Retenciones / ISR</button>
          <button class="tab-btn ${this._tab==='fiscal'?'active':''}" onclick="Modulos.finanzas._tab='fiscal';Modulos.finanzas._renderTab()">🏛️ Fiscal SAT</button>
        </div>
        <div id="fin-content"><div class="empty-state">⏳ Cargando...</div></div>
      </div>`;
    await this._renderTab();
  },

  /* Fija el periodo a un mes completo (YYYY-MM) y re-dibuja */
  _setMes(ym) {
    if (!ym) return;
    const [y,m] = ym.split('-').map(Number);
    this._ini = `${ym}-01`;
    this._fin = new Date(y, m, 0).toISOString().slice(0,10);
    this.render();
  },

  async _getData() {
    const [ingresos, egresos, facturas] = await Promise.all([
      DB.getIngresos(this._ini,this._fin),
      DB.getEgresos(this._ini,this._fin),
      DB.getFacturas(this._ini,this._fin).catch(()=>[])
    ]);
    const facturasVivas = facturas.filter(f => f.estado !== 'anulada');
    const totalFact   = facturasVivas.reduce((s,f)=>s+(Number(f.total)||0),0);
    const totalIngDir = ingresos.reduce((s,i)=>s+(Number(i.monto)||0),0);
    const totalIng    = totalIngDir;   // Las facturas ya están registradas en ingresos (bajo categoría 'Ventas'), por lo que totalIngDir las incluye
    const totalEgr    = egresos.reduce((s,e)=>s+(Number(e.monto)||0),0);
    return { ingresos, egresos, facturas: facturasVivas, totalFact, totalIngDir, totalIng, totalEgr, utilidad: totalIng-totalEgr };
  },

  /* Ingresos por categoría (las facturas ya están registradas en ingresos con categoría 'Ventas') */
  _ventasCats(ingresos, totalFact) {
    const m = {};
    ingresos.forEach(i => {
      // Mostrar la categoría de Ventas como 'Facturación (ventas)' para mantener consistencia visual
      const k = i.categoria === 'Ventas' ? 'Facturación (ventas)' : (i.categoria || 'General');
      m[k] = (m[k]||0) + (Number(i.monto)||0);
    });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },

  async _renderTab() {
    const el = document.getElementById('fin-content');
    if (!el) return;
    const { ingresos, egresos, totalIng, totalEgr, utilidad, totalFact, facturas } = await this._getData();

    const agrupar = (items,campo) => {
      const m={};
      items.forEach(i=>{const k=i[campo]||'General';m[k]=(m[k]||0)+(i.monto||0);});
      return Object.entries(m).sort((a,b)=>b[1]-a[1]);
    };

    if (this._tab==='dashboard') {
      el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:20px">
          <div class="kpi-card"><div class="kpi-label">Ingresos</div><div class="kpi-val green">${UI.q(totalIng)}</div><div class="kpi-trend">${ingresos.length} registros</div></div>
          <div class="kpi-card"><div class="kpi-label">Egresos</div><div class="kpi-val red">${UI.q(totalEgr)}</div><div class="kpi-trend">${egresos.length} registros</div></div>
          <div class="kpi-card"><div class="kpi-label">Utilidad Bruta</div><div class="kpi-val ${utilidad>=0?'amber':'red'}">${UI.q(utilidad)}</div><div class="kpi-trend">${totalIng>0?Math.round(utilidad/totalIng*100):0}% margen</div></div>
          <div class="kpi-card"><div class="kpi-label">Período</div><div class="kpi-val amber" style="font-size:18px">${UI.fecha(this._ini)}</div><div class="kpi-trend">al ${UI.fecha(this._fin)}</div></div>
        </div>
        <div class="grid-2">
          <div class="card">
            <div class="card-sub mb-3">📈 Ingresos por Categoría</div>
            ${this._ventasCats(ingresos, totalFact).map(([k,v])=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
                <span>${k}</span>
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:60px;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${totalIng>0?Math.round(v/totalIng*100):0}%;background:var(--green);border-radius:3px"></div>
                  </div>
                  <span class="text-green">${UI.q(v)}</span>
                </div>
              </div>`).join('')||'<div class="text-muted">Sin datos</div>'}
          </div>
          <div class="card">
            <div class="card-sub mb-3">📉 Egresos por Categoría</div>
            ${agrupar(egresos,'categoria').map(([k,v])=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
                <span>${k}</span>
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:60px;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${totalEgr>0?Math.round(v/totalEgr*100):0}%;background:var(--red);border-radius:3px"></div>
                  </div>
                  <span class="text-red">${UI.q(v)}</span>
                </div>
              </div>`).join('')||'<div class="text-muted">Sin datos</div>'}
          </div>
        </div>`;
    }

    else if (this._tab==='ingresos') {
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--green)">${UI.q(totalIng)}</div>
          <button class="btn btn-green" onclick="Modulos.finanzas.modalIngreso()">＋ Nuevo Ingreso</button>
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Referencia</th><th>Monto</th><th>Acciones</th></tr></thead>
          <tbody>
            ${ingresos.map(i=>`<tr>
            <td>${UI.fecha(i.fecha)}</td><td>${i.concepto}</td>
            <td><span class="badge badge-green">${i.categoria||'General'}</span></td>
            <td class="mono-sm">${i.referencia||'—'}</td>
            <td class="mono-sm text-green"><b>${UI.q(i.monto)}</b></td>
            <td><div style="display:flex;gap:4px">
              <button class="btn btn-sm btn-cyan" onclick="Modulos.finanzas.modalIngreso('${i.id}')" title="Editar">✏️ Editar</button>
              <button class="btn btn-sm btn-danger" onclick="Modulos.finanzas.eliminar('ingresos','${i.id}')" title="Eliminar">🗑️</button>
            </div></td>
          </tr>`).join('')}
            ${(!ingresos.length)?'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin ingresos en este período</td></tr>':''}
          </tbody>
        </table></div>`;
    }

    else if (this._tab==='egresos') {
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--red)">${UI.q(totalEgr)}</div>
          <button class="btn btn-danger" onclick="Modulos.finanzas.modalEgreso()">＋ Nuevo Egreso</button>
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Referencia</th><th>Monto</th><th>Acciones</th></tr></thead>
          <tbody>${egresos.map(e=>`<tr>
            <td>${UI.fecha(e.fecha)}</td><td>${e.concepto}</td>
            <td><span class="badge badge-red">${e.categoria||'General'}</span></td>
            <td class="mono-sm">${e.referencia||'—'}</td>
            <td class="mono-sm text-red"><b>${UI.q(e.monto)}</b></td>
            <td><div style="display:flex;gap:4px">
              <button class="btn btn-sm btn-cyan" onclick="Modulos.finanzas.modalEgreso('${e.id}')" title="Editar">✏️ Editar</button>
              <button class="btn btn-sm btn-danger" onclick="Modulos.finanzas.eliminar('egresos','${e.id}')" title="Eliminar">🗑️</button>
            </div></td>
          </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin egresos</td></tr>'}</tbody>
        </table></div>`;
    }

    else if (this._tab==='viaticos') {
      const [viaticos, empleados] = await Promise.all([
        DB.getViaticos(null, this._ini, this._fin),
        DB.getEmpleados()
      ]);
      this._empleados = empleados;
      const totalVia = viaticos.reduce((s,v)=>s+(v.monto||0),0);
      const aprobados = viaticos.filter(v=>v.aprobado).reduce((s,v)=>s+(v.monto||0),0);
      const pend = totalVia - aprobados;
      el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:16px">
          <div class="kpi-card"><div class="kpi-label">Total Viáticos</div><div class="kpi-val amber">${UI.q(totalVia)}</div><div class="kpi-trend">${viaticos.length} registros</div></div>
          <div class="kpi-card"><div class="kpi-label">Aprobados</div><div class="kpi-val green">${UI.q(aprobados)}</div><div class="kpi-trend">Cargados a egresos</div></div>
          <div class="kpi-card"><div class="kpi-label">Pendientes</div><div class="kpi-val red">${UI.q(pend)}</div><div class="kpi-trend">Por aprobar</div></div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
          <button class="btn btn-amber" onclick="Modulos.finanzas.modalViatico()">＋ Nuevo Viático</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Fecha</th><th>Empleado</th><th>Concepto</th><th>Tipo</th><th>Monto</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${viaticos.map(v=>`<tr>
                <td>${UI.fecha(v.fecha)}</td>
                <td>${v.empleados?.nombre||'—'}</td>
                <td>${v.concepto}</td>
                <td><span class="badge badge-gray">${v.tipo||'—'}</span></td>
                <td class="mono-sm text-amber">${UI.q(v.monto)}</td>
                <td><span class="badge badge-${v.aprobado?'green':'amber'}">${v.aprobado?'Aprobado':'Pendiente'}</span></td>
                <td><div style="display:flex;gap:4px">
                  ${v.aprobado?'':`<button class="btn btn-sm btn-green" onclick="Modulos.finanzas.aprobarViatico('${v.id}')" title="Aprobar y cargar a egresos">✓ Aprobar</button>`}
                  ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('viaticos','${v.id}','este viático',()=>Modulos.finanzas._renderTab())`)}
                </div></td>
              </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin viáticos en este período</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="alert alert-cyan" style="margin-top:12px">
          <div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:12px">Al <b>aprobar</b> un viático se registra automáticamente como egreso en la categoría <b>Viáticos</b>.</div>
        </div>`;
    }

    else if (this._tab==='recurrentes') {
      const recs = await DB.getEgresosRecurrentes();
      const now = new Date();
      const mesActualKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const nombreMes = now.toLocaleDateString('es-GT',{month:'long',year:'numeric'});
      const activos = recs.filter(r=>r.activo);
      const totalMensual = activos.filter(r=>r.frecuencia==='mensual').reduce((s,r)=>s+(r.monto||0),0);
      const pendientes = activos.filter(r => (r.ultima_generacion||'') < mesActualKey);
      const FREQ = { mensual:'Mensual', bimestral:'Bimestral', trimestral:'Trimestral', anual:'Anual' };
      el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:16px">
          <div class="kpi-card"><div class="kpi-label">Gastos Recurrentes</div><div class="kpi-val cyan">${activos.length}</div><div class="kpi-trend">activos</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Mensual</div><div class="kpi-val red">${UI.q(totalMensual)}</div><div class="kpi-trend">compromiso fijo/mes</div></div>
          <div class="kpi-card"><div class="kpi-label">Pendientes de ${nombreMes}</div><div class="kpi-val amber">${pendientes.length}</div><div class="kpi-trend">por generar</div></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px;flex-wrap:wrap">
          <div style="font-size:12px;color:var(--text3)">Renta, energía, teléfono, internet, nómina... se cargan como egreso cada período.</div>
          <div style="display:flex;gap:8px">
            ${pendientes.length?`<button class="btn btn-green" onclick="Modulos.finanzas.generarRecurrentesPendientes()">⚡ Generar pendientes del mes (${pendientes.length})</button>`:''}
            <button class="btn btn-amber" onclick="Modulos.finanzas.modalRecurrente()">＋ Nuevo Recurrente</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Concepto</th><th>Categoría</th><th>Frecuencia</th><th>Día</th><th>Monto</th><th>Estado mes</th><th>Acciones</th></tr></thead>
            <tbody>
              ${recs.map(r=>{
                const generadoEsteMes = (r.ultima_generacion||'') >= mesActualKey;
                return `<tr style="${r.activo?'':'opacity:.5'}">
                  <td style="font-weight:700">${r.concepto}</td>
                  <td><span class="badge badge-gray">${r.categoria||'—'}</span></td>
                  <td>${FREQ[r.frecuencia]||r.frecuencia}</td>
                  <td class="mono-sm" style="text-align:center">${r.dia_mes||1}</td>
                  <td class="mono-sm text-red">${UI.q(r.monto)}</td>
                  <td>${r.activo?`<span class="badge badge-${generadoEsteMes?'green':'amber'}">${generadoEsteMes?'Generado':'Pendiente'}</span>`:'<span class="badge badge-gray">Inactivo</span>'}</td>
                  <td><div style="display:flex;gap:4px">
                    ${(r.activo && !generadoEsteMes)?`<button class="btn btn-sm btn-green" onclick="Modulos.finanzas.generarRecurrente('${r.id}')" title="Generar egreso de este mes">⚡ Generar</button>`:''}
                    ${Modulos.btnAccion('editar', `Modulos.finanzas.modalRecurrente('${r.id}')`)}
                    ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('egresos_recurrentes','${r.id}','${(r.concepto||'').replace(/'/g,"\\'")}',()=>Modulos.finanzas._renderTab())`)}
                  </div></td>
                </tr>`;
              }).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin gastos recurrentes. Crea el primero con “＋ Nuevo Recurrente”.</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="alert alert-cyan" style="margin-top:12px">
          <div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:12px">Al <b>generar</b>, el gasto se registra como egreso del período (categoría correspondiente) y no se duplica si ya fue generado.</div>
        </div>`;
    }

    else if (this._tab==='balance') {
      const ini  = new Date(this._ini+'T00:00:00');
      const fin  = new Date(this._fin+'T23:59:59');
      const meses = Math.round((fin-ini)/(1000*60*60*24*30))+1;
      const periodo = meses<=1?'Mensual':meses<=3?'Trimestral':meses<=6?'Semestral':'Anual';

      // Gastos por categoría agrupados
      const gastos = agrupar(egresos,'categoria');
      const ventas  = this._ventasCats(ingresos, totalFact);
      const costo   = egresos.filter(e=>['Compras','Repuestos'].includes(e.categoria)).reduce((s,e)=>s+(e.monto||0),0);
      const gastoOp = egresos.filter(e=>!['Compras','Repuestos'].includes(e.categoria)).reduce((s,e)=>s+(e.monto||0),0);
      /* Depreciación del período (activos) — gasto no monetario */
      const activosFin   = await DB.getActivos();
      const depreciacion = activosFin.reduce((s,a)=>s+depEnRango(a, this._ini, this._fin),0);
      const utilBruta = totalIng - costo;
      const utilOp    = utilBruta - gastoOp - depreciacion;
      const utilNeta  = utilOp;

      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div>
            <span class="badge badge-cyan" style="margin-right:8px">${periodo}</span>
            <span style="font-size:13px;color:var(--text3)">${UI.fecha(this._ini)} — ${UI.fecha(this._fin)}</span>
          </div>
          <button class="btn btn-ghost" onclick="window.print()">🖨️ Imprimir</button>
        </div>

        <div class="card" style="max-width:700px">
          <div style="text-align:center;margin-bottom:20px">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--amber)">${Auth.tenant?.name||'TallerPro Enterprise'}</div>
            <div style="font-size:13px;color:var(--text3)">Estado de Resultados ${periodo}</div>
            <div style="font-size:12px;color:var(--text3)">${UI.fecha(this._ini)} al ${UI.fecha(this._fin)}</div>
          </div>

          <!-- INGRESOS -->
          <div style="font-weight:800;font-size:12px;color:var(--green);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Ingresos</div>
          ${ventas.map(([k,v])=>`
            <div style="display:flex;justify-content:space-between;padding:5px 12px;font-size:13px">
              <span class="text-muted">${k}</span><span>${UI.q(v)}</span>
            </div>`).join('')}
          <div style="display:flex;justify-content:space-between;padding:8px 12px;font-weight:800;font-size:14px;border-top:2px solid var(--border);margin-top:4px">
            <span>Total Ingresos</span><span class="text-green">${UI.q(totalIng)}</span>
          </div>

          <!-- COSTO DE VENTAS -->
          <div style="font-weight:800;font-size:12px;color:var(--red);text-transform:uppercase;letter-spacing:.08em;margin:12px 0 6px">Costo de Ventas</div>
          ${egresos.filter(e=>['Compras','Repuestos'].includes(e.categoria)).length?
            agrupar(egresos.filter(e=>['Compras','Repuestos'].includes(e.categoria)),'categoria').map(([k,v])=>`
            <div style="display:flex;justify-content:space-between;padding:5px 12px;font-size:13px">
              <span class="text-muted">${k}</span><span class="text-red">(${UI.q(v)})</span>
            </div>`).join(''):
            '<div style="padding:5px 12px;font-size:13px;color:var(--text3)">Sin costos de venta registrados</div>'}
          <div style="display:flex;justify-content:space-between;padding:8px 12px;font-weight:800;font-size:14px;border-top:2px solid var(--border)">
            <span>Utilidad Bruta</span><span class="${utilBruta>=0?'text-green':'text-red'}">${UI.q(utilBruta)}</span>
          </div>

          <!-- GASTOS OPERATIVOS -->
          <div style="font-weight:800;font-size:12px;color:var(--amber);text-transform:uppercase;letter-spacing:.08em;margin:12px 0 6px">Gastos Operativos</div>
          ${egresos.filter(e=>!['Compras','Repuestos'].includes(e.categoria)).length?
            agrupar(egresos.filter(e=>!['Compras','Repuestos'].includes(e.categoria)),'categoria').map(([k,v])=>`
            <div style="display:flex;justify-content:space-between;padding:5px 12px;font-size:13px">
              <span class="text-muted">${k}</span><span class="text-red">(${UI.q(v)})</span>
            </div>`).join(''):
            '<div style="padding:5px 12px;font-size:13px;color:var(--text3)">Sin gastos operativos</div>'}
          ${depreciacion>0?`<div style="display:flex;justify-content:space-between;padding:5px 12px;font-size:13px">
              <span class="text-muted">Depreciación de activos</span><span class="text-red">(${UI.q(depreciacion)})</span>
            </div>`:''}
          <div style="display:flex;justify-content:space-between;padding:8px 12px;font-weight:800;font-size:14px;border-top:2px solid var(--border)">
            <span>Utilidad Operativa</span><span class="${utilOp>=0?'text-green':'text-red'}">${UI.q(utilOp)}</span>
          </div>

          <!-- UTILIDAD NETA -->
          <div style="display:flex;justify-content:space-between;padding:16px 12px;font-weight:800;font-size:18px;border-top:3px solid var(--amber);margin-top:8px;background:var(--amber-dim);border-radius:0 0 8px 8px">
            <span>UTILIDAD NETA</span>
            <span class="${utilNeta>=0?'text-amber':'text-red'}">${UI.q(utilNeta)}</span>
          </div>
        </div>`;
    }

    else if (this._tab==='libros') {
      const compras = (await DB.getCompras())
        .filter(c => c.estado !== 'anulada' && (c.fecha||'') >= this._ini && (c.fecha||'') <= this._fin);
      const ivaDebito  = facturas.reduce((s,f)=>s+(Number(f.iva)||0),0);
      const baseVentas = facturas.reduce((s,f)=>s+(Number(f.subtotal)||0),0);
      const ivaCredito = compras.reduce((s,c)=>s+(Number(c.iva)||0),0);
      const baseCompras= compras.reduce((s,c)=>s+(Number(c.subtotal)||0),0);
      const regimen = localStorage.getItem('tp_regimen') || 'general';
      const esPequeno = regimen === 'pequeno';
      const ivaPagar = esPequeno ? totalFact * 0.05 : (ivaDebito - ivaCredito);

      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div><span class="badge badge-cyan">${UI.fecha(this._ini)} — ${UI.fecha(this._fin)}</span>
            <span style="font-size:12px;color:var(--text3);margin-left:8px">Régimen: <b>${esPequeno?'Pequeño Contribuyente (5%)':'General (débito − crédito)'}</b></span></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-green" onclick="Modulos.finanzas.exportExcelContador()">⬇ Excel (contador)</button>
            <button class="btn btn-ghost" onclick="Modulos.finanzas.exportLibro('ventas')">Ventas CSV</button>
            <button class="btn btn-ghost" onclick="Modulos.finanzas.exportLibro('compras')">Compras CSV</button>
            <button class="btn btn-ghost" onclick="window.print()">🖨️</button>
          </div>
        </div>
        <div class="kpi-grid" style="margin-bottom:18px">
          <div class="kpi-card"><div class="kpi-label">IVA Débito (ventas)</div><div class="kpi-val green">${UI.q(ivaDebito)}</div><div class="kpi-trend">base ${UI.q(baseVentas)}</div></div>
          ${esPequeno?'':`<div class="kpi-card"><div class="kpi-label">IVA Crédito (compras)</div><div class="kpi-val cyan">${UI.q(ivaCredito)}</div><div class="kpi-trend">base ${UI.q(baseCompras)}</div></div>`}
          <div class="kpi-card"><div class="kpi-label">IVA a pagar del mes</div><div class="kpi-val ${ivaPagar>=0?'red':'green'}">${UI.q(ivaPagar)}</div><div class="kpi-trend">${esPequeno?'5% sobre ventas':'débito − crédito'}</div></div>
        </div>

        <div class="card-sub mb-3">🧾 Libro de Ventas (facturación del mes)</div>
        <div class="table-wrap" style="margin-bottom:20px"><table class="data-table" style="font-size:12px">
          <thead><tr><th>Fecha</th><th>Documento</th><th>NIT</th><th>Cliente</th><th style="text-align:right">Base</th><th style="text-align:right">IVA</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>
            ${facturas.map(f=>`<tr>
              <td class="mono-sm">${UI.fecha(f.fecha)}</td>
              <td class="mono-sm">${f.num||(f.fel_serie?`${f.fel_serie}-${f.fel_numero||''}`:'—')}</td>
              <td class="mono-sm">${f.nit||'CF'}</td>
              <td>${f.nombre_receptor||f.clientes?.nombre||'CF'}</td>
              <td class="mono-sm" style="text-align:right">${UI.q(f.subtotal)}</td>
              <td class="mono-sm" style="text-align:right">${UI.q(f.iva)}</td>
              <td class="mono-sm text-green" style="text-align:right"><b>${UI.q(f.total)}</b></td>
            </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--text3)">Sin ventas en el mes</td></tr>'}
          </tbody>
          ${facturas.length?`<tfoot><tr style="font-weight:800;border-top:2px solid var(--border)"><td colspan="4">TOTALES</td><td class="mono-sm" style="text-align:right">${UI.q(baseVentas)}</td><td class="mono-sm" style="text-align:right">${UI.q(ivaDebito)}</td><td class="mono-sm text-green" style="text-align:right">${UI.q(totalFact)}</td></tr></tfoot>`:''}
        </table></div>

        <div class="card-sub mb-3">🛒 Libro de Compras (del mes)</div>
        <div class="table-wrap"><table class="data-table" style="font-size:12px">
          <thead><tr><th>Fecha</th><th>Factura</th><th>Proveedor</th><th style="text-align:right">Base</th><th style="text-align:right">IVA</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>
            ${compras.map(c=>`<tr>
              <td class="mono-sm">${UI.fecha(c.fecha)}</td>
              <td class="mono-sm">${c.num_factura||c.num||'—'}</td>
              <td>${c.proveedor_nombre||'—'}</td>
              <td class="mono-sm" style="text-align:right">${UI.q(c.subtotal)}</td>
              <td class="mono-sm" style="text-align:right">${UI.q(c.iva)}</td>
              <td class="mono-sm text-red" style="text-align:right"><b>${UI.q(c.total)}</b></td>
            </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--text3)">Sin compras en el mes</td></tr>'}
          </tbody>
          ${compras.length?`<tfoot><tr style="font-weight:800;border-top:2px solid var(--border)"><td colspan="3">TOTALES</td><td class="mono-sm" style="text-align:right">${UI.q(baseCompras)}</td><td class="mono-sm" style="text-align:right">${UI.q(ivaCredito)}</td><td class="mono-sm text-red" style="text-align:right">${UI.q(compras.reduce((s,c)=>s+(Number(c.total)||0),0))}</td></tr></tfoot>`:''}
        </table></div>

        <div class="alert alert-cyan" style="margin-top:14px"><div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:11px">${esPequeno
            ? 'Como <b>Pequeño Contribuyente</b>, el IVA es el <b>5% sobre las ventas</b> del mes (no se acredita el IVA de compras). Cambia el régimen en la pestaña Fiscal SAT.'
            : 'IVA a pagar = <b>IVA débito (ventas) − IVA crédito (compras)</b> del mes. Las compras alimentan el crédito desde el módulo Compras. Cambia el régimen en Fiscal SAT.'}</div></div>`;
    }

    else if (this._tab==='retenciones') {
      const rets = await DB.getRetenciones(this._ini, this._fin);
      const sum = (tipo,nat) => rets.filter(r=>r.tipo===tipo && r.naturaleza===nat).reduce((s,r)=>s+(Number(r.monto)||0),0);
      const sufISR = sum('ISR','sufrida'), sufIVA = sum('IVA','sufrida');
      const efeISR = sum('ISR','efectuada'), efeIVA = sum('IVA','efectuada');
      const regimen = localStorage.getItem('tp_regimen') || 'general';
      let isrMes = 0, isrNota = '';
      if (regimen === 'simplificado') { isrMes = totalIng<=30000 ? totalIng*0.05 : 30000*0.05+(totalIng-30000)*0.07; isrNota = '5% hasta Q30k · 7% excedente'; }
      else if (regimen === 'utilidades') { isrMes = Math.max(0,utilidad)*0.25; isrNota = '25% sobre utilidad'; }
      else { isrMes = 0; isrNota = regimen==='pequeno' ? 'Pequeño Contribuyente: sin ISR' : 'Régimen general: sin ISR sobre utilidades'; }
      const isrNeto = Math.max(0, isrMes - sufISR);
      const natBadge = n => n==='sufrida' ? '<span class="badge badge-cyan">Sufrida (nos retuvieron)</span>' : '<span class="badge badge-amber">Efectuada (retuvimos)</span>';

      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <span class="badge badge-cyan">${UI.fecha(this._ini)} — ${UI.fecha(this._fin)}</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-ghost" onclick="Modulos.finanzas.exportRetenciones()">⬇ CSV</button>
            <button class="btn btn-amber" onclick="Modulos.finanzas.modalRetencion()">＋ Nueva Retención</button>
          </div>
        </div>
        <div class="kpi-grid" style="margin-bottom:8px">
          <div class="kpi-card"><div class="kpi-label">ISR del mes (estimado)</div><div class="kpi-val amber">${UI.q(isrMes)}</div><div class="kpi-trend">${isrNota}</div></div>
          <div class="kpi-card"><div class="kpi-label">ISR retenido (sufrido)</div><div class="kpi-val green">${UI.q(sufISR)}</div><div class="kpi-trend">acreditable</div></div>
          <div class="kpi-card"><div class="kpi-label">ISR neto a pagar</div><div class="kpi-val red">${UI.q(isrNeto)}</div><div class="kpi-trend">ISR − retenciones</div></div>
          <div class="kpi-card"><div class="kpi-label">IVA retenido (sufrido)</div><div class="kpi-val cyan">${UI.q(sufIVA)}</div><div class="kpi-trend">crédito de IVA</div></div>
        </div>
        ${(efeISR>0||efeIVA>0)?`<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:12px">Retenciones <b>efectuadas</b> por enterar a la SAT: ISR ${UI.q(efeISR)} · IVA ${UI.q(efeIVA)}.</div></div>`:''}
        <div class="table-wrap"><table class="data-table" style="font-size:12px">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Naturaleza</th><th>Documento</th><th>Contraparte</th><th style="text-align:right">Base</th><th style="text-align:right">%</th><th style="text-align:right">Monto</th><th>Acciones</th></tr></thead>
          <tbody>
            ${rets.map(r=>`<tr>
              <td class="mono-sm">${UI.fecha(r.fecha)}</td>
              <td><span class="badge badge-${r.tipo==='ISR'?'purple':'cyan'}">${r.tipo}</span></td>
              <td>${natBadge(r.naturaleza)}</td>
              <td class="mono-sm">${r.documento||'—'}</td>
              <td>${r.contraparte||'—'}</td>
              <td class="mono-sm" style="text-align:right">${UI.q(r.base)}</td>
              <td class="mono-sm" style="text-align:right">${r.porcentaje||0}%</td>
              <td class="mono-sm text-amber" style="text-align:right"><b>${UI.q(r.monto)}</b></td>
              <td><div style="display:flex;gap:4px">
                ${Modulos.btnAccion('editar', `Modulos.finanzas.modalRetencion('${r.id}')`)}
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('retenciones','${r.id}','esta retención',()=>Modulos.finanzas._renderTab())`)}
              </div></td>
            </tr>`).join('')||'<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--text3)">Sin retenciones en el mes</td></tr>'}
          </tbody>
        </table></div>
        <div class="alert alert-cyan" style="margin-top:12px"><div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:11px"><b>Sufridas</b>: te las retuvo un cliente/agente retenedor (se acreditan a tu ISR/IVA). <b>Efectuadas</b>: tú las retuviste y debes enterarlas a la SAT. El ISR del mes depende del régimen (cámbialo en Fiscal SAT).</div></div>`;
    }

    else if (this._tab==='fiscal') {
      const regimen = localStorage.getItem('tp_regimen') || 'pequeno';
      const _calcImpuesto = (reg, ing, util) => {
        switch(reg) {
          case 'pequeno':   return { iva: ing*0.05, isr: 0,         total: ing*0.05 };
          case 'general':   return { iva: ing*0.12, isr: 0,         total: ing*0.12 };
          case 'simplificado': {
            const b1 = Math.min(ing*12, 30000*12);
            const b2 = Math.max(ing*12-30000*12, 0);
            const isr = (b1*0.05 + b2*0.07)/12;
            return { iva: ing*0.12, isr, total: ing*0.12+isr };
          }
          case 'utilidades': {
            const isr = Math.max(util,0)*0.25;
            return { iva: ing*0.12, isr: isr/4, total: ing*0.12+isr/4 };
          }
          default: return { iva:0, isr:0, total:0 };
        }
      };

      const REGIMENES = [
        { id:'pequeno',      label:'Pequeño Contribuyente',          desc:'IVA 5% mensual · Sin ISR · Ingresos ≤ Q150,000/año', color:'green'  },
        { id:'general',      label:'Régimen General IVA',            desc:'IVA 12% mensual · Sin ISR sobre utilidades',          color:'cyan'   },
        { id:'simplificado', label:'Régimen Simplificado Opcional',  desc:'ISR 5% hasta Q30k/mes · 7% sobre el excedente',       color:'amber'  },
        { id:'utilidades',   label:'Régimen Sobre las Utilidades',   desc:'ISR 25% sobre utilidades · Declaración trimestral',    color:'purple' }
      ];

      /* La depreciación reduce la utilidad imponible (régimen sobre utilidades) */
      const activosFis  = await DB.getActivos();
      const depFiscal   = activosFis.reduce((s,a)=>s+depEnRango(a, this._ini, this._fin),0);

      /* Planilla / IGSS — sobre empleados activos (mensual) */
      const empleadosFis = (await DB.getEmpleados()).filter(e=>e.activo!==false);
      const plSalarios = empleadosFis.reduce((s,e)=>s+(Number(e.salario_base)||0),0);
      const plBonif    = empleadosFis.reduce((s,e)=>s+(Number(e.bonificacion)||0),0);
      const IGSS_LAB = 0.0483, IGSS_PAT = 0.1267;   // patronal: 10.67% IGSS + 1% IRTRA + 1% INTECAP
      const plIgssLab = plSalarios*IGSS_LAB;
      const plIgssPat = plSalarios*IGSS_PAT;
      const plLiquido = plSalarios + plBonif - plIgssLab;
      const plCostoPatronal = plSalarios + plBonif + plIgssPat;
      const utilFiscal  = utilidad - depFiscal;
      const calc = _calcImpuesto(regimen, totalIng, utilFiscal);

      el.innerHTML = `
        <div class="grid-2" style="margin-bottom:20px">
          ${REGIMENES.map(r=>`
            <div class="card ${r.id===regimen?'card-'+r.color:''}" style="cursor:pointer;border:2px solid ${r.id===regimen?'var(--'+r.color+')':'var(--border)'}"
                 onclick="localStorage.setItem('tp_regimen','${r.id}');Modulos.finanzas._renderTab()">
              <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                  <div style="font-weight:800;font-size:13px;color:var(--${r.color})">${r.label}</div>
                  <div style="font-size:11px;color:var(--text3);margin-top:4px">${r.desc}</div>
                </div>
                ${r.id===regimen?'<span class="badge badge-'+r.color+'">✓ Activo</span>':''}
              </div>
            </div>`).join('')}
        </div>

        <div class="card" style="max-width:600px">
          <div class="card-sub mb-3">📋 Estimado de Impuestos — ${REGIMENES.find(r=>r.id===regimen)?.label}</div>
          <div style="font-size:13px;color:var(--text3);margin-bottom:16px">
            Período: ${UI.fecha(this._ini)} al ${UI.fecha(this._fin)}
          </div>

          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>Ingresos del período</span><span>${UI.q(totalIng)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>Egresos del período</span><span class="text-red">(${UI.q(totalEgr)})</span>
          </div>
          ${depFiscal>0?`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>Depreciación de activos</span><span class="text-red">(${UI.q(depFiscal)})</span>
          </div>`:''}
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>Utilidad imponible</span><span class="${utilFiscal>=0?'text-green':'text-red'}">${UI.q(utilFiscal)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>IVA estimado</span><span class="text-red">${UI.q(calc.iva)}</span>
          </div>
          ${calc.isr>0?`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>ISR estimado</span><span class="text-red">${UI.q(calc.isr)}</span>
          </div>`:''}
          <div style="display:flex;justify-content:space-between;padding:12px 0;font-weight:800;font-size:16px;border-top:2px solid var(--border);margin-top:4px">
            <span>Total Impuestos Estimados</span><span class="text-red">${UI.q(calc.total)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:12px;font-weight:800;font-size:18px;background:var(--amber-dim);border-radius:8px;margin-top:8px">
            <span>Utilidad después de impuestos</span><span class="${(utilFiscal-calc.total)>=0?'text-amber':'text-red'}">${UI.q(utilFiscal-calc.total)}</span>
          </div>

          <div class="alert alert-cyan" style="margin-top:16px">
            <div class="alert-icon">ℹ️</div>
            <div class="alert-body" style="font-size:11px">
              Este es un estimado orientativo. Consulta a un contador autorizado para declaraciones oficiales ante la SAT de Guatemala.
              Régimen actual seleccionado: <b>${REGIMENES.find(r=>r.id===regimen)?.label}</b>
            </div>
          </div>
        </div>

        <div class="card" style="max-width:600px;margin-top:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div class="card-sub">👷 Planilla / IGSS — mensual</div>
            <button class="btn btn-sm btn-ghost" onclick="Modulos.finanzas.exportPlanilla()">⬇️ Excel</button>
          </div>
          <div style="font-size:13px;color:var(--text3);margin-bottom:16px">
            ${empleadosFis.length} empleado(s) activo(s) · Cuota laboral ${(IGSS_LAB*100).toFixed(2)}% · patronal ${(IGSS_PAT*100).toFixed(2)}%
          </div>
          ${!empleadosFis.length?`<div style="text-align:center;padding:16px;color:var(--text3)">Sin empleados activos registrados</div>`:`
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>Salarios base (afecto a IGSS)</span><span>${UI.q(plSalarios)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>Bonificación incentivo (no afecto)</span><span>${UI.q(plBonif)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>IGSS laboral (descuento al empleado)</span><span class="text-red">(${UI.q(plIgssLab)})</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;font-weight:700">
            <span>Líquido a pagar a empleados</span><span class="text-green">${UI.q(plLiquido)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>IGSS patronal (cuota del taller)</span><span class="text-red">(${UI.q(plIgssPat)})</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:12px;font-weight:800;font-size:16px;background:var(--amber-dim);border-radius:8px;margin-top:8px">
            <span>Costo patronal total</span><span class="text-amber">${UI.q(plCostoPatronal)}</span>
          </div>`}
          <div class="alert alert-cyan" style="margin-top:16px">
            <div class="alert-icon">ℹ️</div>
            <div class="alert-body" style="font-size:11px">
              IGSS laboral 4.83% y patronal 12.67% (incluye 1% IRTRA + 1% INTECAP) sobre el salario base.
              La bonificación incentivo (Q250) no es afecta a IGSS. Estimado mensual orientativo.
            </div>
          </div>
        </div>`;
    }
  },

  async exportPlanilla() {
    const empleados = (await DB.getEmpleados()).filter(e=>e.activo!==false);
    if (!empleados.length) { UI.toast('Sin empleados activos','warn'); return; }
    const IGSS_LAB = 0.0483, IGSS_PAT = 0.1267;
    const r2 = n => Math.round(n*100)/100;
    const rows = [['Empleado','Cargo','DPI','No. IGSS','Salario base','Bonificación','IGSS laboral 4.83%','Líquido a pagar','IGSS patronal 12.67%','Costo patronal']];
    const tot = {sal:0,bon:0,lab:0,liq:0,pat:0,cost:0};
    empleados.forEach(e=>{
      const sal=Number(e.salario_base)||0, bon=Number(e.bonificacion)||0, lab=sal*IGSS_LAB, pat=sal*IGSS_PAT;
      tot.sal+=sal; tot.bon+=bon; tot.lab+=lab; tot.liq+=sal+bon-lab; tot.pat+=pat; tot.cost+=sal+bon+pat;
      rows.push([e.nombre||'', e.cargo||'', e.dpi||'', e.igss||'', r2(sal), r2(bon), r2(lab), r2(sal+bon-lab), r2(pat), r2(sal+bon+pat)]);
    });
    rows.push(['TOTAL','','','',r2(tot.sal),r2(tot.bon),r2(tot.lab),r2(tot.liq),r2(tot.pat),r2(tot.cost)]);
    await Modulos._descargarXLSX([{ nombre:'Planilla IGSS', rows }], `planilla_igss_${this._ini.slice(0,7)}.xlsx`);
    UI.toast('Planilla exportada ✓');
  },

  modalIngreso(id=null) {
    UI.modal(`${id?'✏️ Editar':'＋ Nuevo'} Ingreso`, `
      ${id?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán el ingreso actual.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Concepto *</label>
          <input class="form-input" id="ing-concepto" placeholder="Servicio de mantenimiento"></div>
        <div class="form-group"><label class="form-label">Categoría</label>
          <select class="form-select" id="ing-cat">
            ${['Servicio','Repuestos','Mantenimiento','Garantía','Otro'].map(c=>`<option>${c}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Monto (Q) *</label>
          <input class="form-input" id="ing-monto" type="number" min="0" step="0.01"></div>
        <div class="form-group"><label class="form-label">Fecha *</label>
          <input class="form-input" id="ing-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="form-group"><label class="form-label">Referencia</label>
        <input class="form-input" id="ing-ref" placeholder="OT-2026-0001"></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="ing-notas" rows="2"></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-green" onclick="Modulos.finanzas.guardarIngreso('${id||''}')">
          ${id?'Guardar Cambios':'Registrar Ingreso'}
        </button>
      </div>`);
  },

  async guardarIngreso(id='') {
    const concepto = document.getElementById('ing-concepto')?.value.trim();
    const monto    = parseFloat(document.getElementById('ing-monto')?.value)||0;
    if (!concepto||monto<=0) { UI.toast('Concepto y monto son obligatorios','error'); return; }
    const fields = { concepto, monto,
      categoria:  document.getElementById('ing-cat')?.value,
      fecha:      document.getElementById('ing-fecha')?.value,
      referencia: document.getElementById('ing-ref')?.value||null,
      notas:      document.getElementById('ing-notas')?.value||null
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertIngreso(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Actualizado ✓':'Registrado ✓');
    this._tab='ingresos'; this._renderTab();
  },

  modalEgreso(id=null) {
    UI.modal(`${id?'✏️ Editar':'＋ Nuevo'} Egreso`, `
      ${id?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán el egreso actual.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Concepto *</label>
          <input class="form-input" id="egr-concepto" placeholder="Compra de repuestos"></div>
        <div class="form-group"><label class="form-label">Categoría</label>
          <select class="form-select" id="egr-cat">
            ${['Compras','Repuestos','Nómina','Servicios','Renta','Combustible','Viáticos','Impuestos','Otro'].map(c=>`<option>${c}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Monto (Q) *</label>
          <input class="form-input" id="egr-monto" type="number" min="0" step="0.01"></div>
        <div class="form-group"><label class="form-label">Fecha *</label>
          <input class="form-input" id="egr-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="form-group"><label class="form-label">Referencia</label>
        <input class="form-input" id="egr-ref" placeholder="No. factura proveedor"></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="egr-notas" rows="2"></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="Modulos.finanzas.guardarEgreso('${id||''}')">
          ${id?'Guardar Cambios':'Registrar Egreso'}
        </button>
      </div>`);
  },

  async guardarEgreso(id='') {
    const concepto = document.getElementById('egr-concepto')?.value.trim();
    const monto    = parseFloat(document.getElementById('egr-monto')?.value)||0;
    if (!concepto||monto<=0) { UI.toast('Concepto y monto son obligatorios','error'); return; }
    const fields = { concepto, monto,
      categoria:  document.getElementById('egr-cat')?.value,
      fecha:      document.getElementById('egr-fecha')?.value,
      referencia: document.getElementById('egr-ref')?.value||null,
      notas:      document.getElementById('egr-notas')?.value||null
    };
    if (id) fields.id = id;
    const {error} = await DB.upsertEgreso(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Actualizado ✓':'Registrado ✓');
    this._tab='egresos'; this._renderTab();
  },

  async eliminar(tabla, id) {
    const ok = await UI.confirmar('¿Eliminar este registro? Esta acción no se puede deshacer.','Eliminar');
    if (!ok) return;
    const r = await DB.deleteRegistro(tabla, id);
    if (r) { UI.toast('Eliminado ✓'); this._renderTab(); }
    else UI.toast('Error al eliminar','error');
  },

  /* ── EXPORTACIÓN DE LIBROS (CSV para el contador) ── */
  async exportLibro(tipo) {
    if (tipo === 'ventas') {
      const facturas = (await DB.getFacturas(this._ini, this._fin)).filter(f=>f.estado!=='anulada');
      const rows = [['Fecha','Documento','NIT','Cliente','Base','IVA','Total']];
      facturas.forEach(f => rows.push([
        f.fecha, f.num || (f.fel_serie?`${f.fel_serie}-${f.fel_numero||''}`:''),
        f.nit||'CF', f.nombre_receptor||f.clientes?.nombre||'CF',
        Number(f.subtotal)||0, Number(f.iva)||0, Number(f.total)||0
      ]));
      Modulos._descargarCSV(rows, `libro-ventas-${this._ini}.csv`);
    } else {
      const compras = (await DB.getCompras()).filter(c=>c.estado!=='anulada' && (c.fecha||'')>=this._ini && (c.fecha||'')<=this._fin);
      const rows = [['Fecha','Factura','Proveedor','Base','IVA','Total']];
      compras.forEach(c => rows.push([
        c.fecha, c.num_factura||c.num||'', c.proveedor_nombre||'',
        Number(c.subtotal)||0, Number(c.iva)||0, Number(c.total)||0
      ]));
      Modulos._descargarCSV(rows, `libro-compras-${this._ini}.csv`);
    }
    UI.toast('Libro exportado ✓');
  },

  /* Exporta un Excel real con hojas Ventas, Compras y Retenciones */
  async exportExcelContador() {
    UI.toast('Generando Excel...','info');
    const [facturasRaw, comprasRaw, rets] = await Promise.all([
      DB.getFacturas(this._ini, this._fin), DB.getCompras(), DB.getRetenciones(this._ini, this._fin)
    ]);
    const facturas = facturasRaw.filter(f=>f.estado!=='anulada');
    const compras = comprasRaw.filter(c=>c.estado!=='anulada' && (c.fecha||'')>=this._ini && (c.fecha||'')<=this._fin);
    const ventasRows = [['Fecha','Documento','NIT','Cliente','Base','IVA','Total']];
    facturas.forEach(f => ventasRows.push([f.fecha, f.num||(f.fel_serie?`${f.fel_serie}-${f.fel_numero||''}`:''), f.nit||'CF', f.nombre_receptor||f.clientes?.nombre||'CF', Number(f.subtotal)||0, Number(f.iva)||0, Number(f.total)||0]));
    const comprasRows = [['Fecha','Factura','Proveedor','Base','IVA','Total']];
    compras.forEach(c => comprasRows.push([c.fecha, c.num_factura||c.num||'', c.proveedor_nombre||'', Number(c.subtotal)||0, Number(c.iva)||0, Number(c.total)||0]));
    const retRows = [['Fecha','Tipo','Naturaleza','Documento','Contraparte','Base','%','Monto']];
    rets.forEach(r => retRows.push([r.fecha, r.tipo, r.naturaleza, r.documento||'', r.contraparte||'', Number(r.base)||0, Number(r.porcentaje)||0, Number(r.monto)||0]));
    await Modulos._descargarXLSX([
      { nombre:'Libro Ventas', rows: ventasRows },
      { nombre:'Libro Compras', rows: comprasRows },
      { nombre:'Retenciones', rows: retRows }
    ], `libros-${this._ini.slice(0,7)}.xlsx`);
    UI.toast('Excel generado ✓');
  },

  async exportRetenciones() {
    const rets = await DB.getRetenciones(this._ini, this._fin);
    const rows = [['Fecha','Tipo','Naturaleza','Documento','Contraparte','Base','Porcentaje','Monto']];
    rets.forEach(r => rows.push([r.fecha, r.tipo, r.naturaleza, r.documento||'', r.contraparte||'', Number(r.base)||0, Number(r.porcentaje)||0, Number(r.monto)||0]));
    Modulos._descargarCSV(rows, `retenciones-${this._ini}.csv`);
    UI.toast('Retenciones exportadas ✓');
  },

  /* ── RETENCIONES ──────────────────────────────── */
  async modalRetencion(id=null) {
    const r = id ? (await DB.getRetenciones('2000-01-01','2999-12-31')).find(x=>x.id===id)||{} : {};
    UI.modal(`${id?'✏️ Editar':'＋ Nueva'} Retención`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Impuesto *</label>
          <select class="form-select" id="ret-tipo">${['ISR','IVA'].map(t=>`<option ${r.tipo===t?'selected':''}>${t}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Naturaleza *</label>
          <select class="form-select" id="ret-nat">
            <option value="sufrida" ${r.naturaleza==='sufrida'?'selected':''}>Sufrida (nos retuvieron)</option>
            <option value="efectuada" ${r.naturaleza==='efectuada'?'selected':''}>Efectuada (retuvimos)</option>
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha</label>
          <input class="form-input" id="ret-fecha" type="date" value="${r.fecha||new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Documento / Constancia</label>
          <input class="form-input" id="ret-doc" value="${r.documento||''}" placeholder="No. factura o constancia"></div>
      </div>
      <div class="form-group"><label class="form-label">Contraparte</label>
        <input class="form-input" id="ret-contra" value="${(r.contraparte||'').replace(/"/g,'&quot;')}" placeholder="Cliente / proveedor / agente"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Base (Q)</label>
          <input class="form-input" id="ret-base" type="number" min="0" step="0.01" value="${r.base||''}" oninput="Modulos.finanzas._calcRet()"></div>
        <div class="form-group"><label class="form-label">Porcentaje %</label>
          <input class="form-input" id="ret-pct" type="number" min="0" step="0.01" value="${r.porcentaje||''}" oninput="Modulos.finanzas._calcRet()"></div>
      </div>
      <div class="form-group"><label class="form-label">Monto retenido (Q) *</label>
        <input class="form-input" id="ret-monto" type="number" min="0" step="0.01" value="${r.monto||''}" style="font-weight:800;color:var(--amber)"></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="ret-notas" rows="2">${r.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.finanzas.guardarRetencion('${id||''}')">${id?'Guardar':'Registrar'}</button>
      </div>`);
  },

  _calcRet() {
    const base = parseFloat(document.getElementById('ret-base')?.value)||0;
    const pct  = parseFloat(document.getElementById('ret-pct')?.value)||0;
    if (pct > 0) {
      const m = document.getElementById('ret-monto');
      if (m) m.value = (Math.round(base*pct/100*100)/100).toFixed(2);
    }
  },

  async guardarRetencion(id='') {
    const base = parseFloat(document.getElementById('ret-base')?.value)||0;
    const pct  = parseFloat(document.getElementById('ret-pct')?.value)||0;
    let monto  = parseFloat(document.getElementById('ret-monto')?.value)||0;
    if (!monto && pct) monto = Math.round(base*pct/100*100)/100;
    if (monto <= 0) { UI.toast('Ingresa el monto (o base y porcentaje)','error'); return; }
    const fields = {
      tipo:       document.getElementById('ret-tipo')?.value||'ISR',
      naturaleza: document.getElementById('ret-nat')?.value||'sufrida',
      fecha:      document.getElementById('ret-fecha')?.value,
      documento:  document.getElementById('ret-doc')?.value||null,
      contraparte:document.getElementById('ret-contra')?.value||null,
      base, porcentaje: pct, monto,
      notas:      document.getElementById('ret-notas')?.value||null
    };
    if (id) fields.id = id;
    const { error } = await DB.upsertRetencion(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Retención actualizada ✓':'Retención registrada ✓');
    this._tab = 'retenciones'; this._renderTab();
  },

  /* ── VIÁTICOS ─────────────────────────────────── */
  modalViatico() {
    UI.modal('＋ Nuevo Viático', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Empleado *</label>
          <select class="form-select" id="via-emp">
            <option value="">Seleccionar...</option>
            ${(this._empleados||[]).filter(e=>e.activo).map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Tipo</label>
          <select class="form-select" id="via-tipo">
            ${['alimentacion','transporte','hospedaje','combustible','otro'].map(t=>`<option>${t}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Concepto *</label>
          <input class="form-input" id="via-concepto" placeholder="Almuerzo en visita a cliente"></div>
        <div class="form-group"><label class="form-label">Monto (Q) *</label>
          <input class="form-input" id="via-monto" type="number" min="0" step="0.01"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha</label>
          <input class="form-input" id="via-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Referencia / Factura</label>
          <input class="form-input" id="via-ref"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.finanzas.guardarViatico()">Registrar</button>
      </div>`);
  },

  async guardarViatico() {
    const empId = document.getElementById('via-emp')?.value;
    const conc  = document.getElementById('via-concepto')?.value.trim();
    const monto = parseFloat(document.getElementById('via-monto')?.value)||0;
    if (!empId||!conc||monto<=0) { UI.toast('Completa empleado, concepto y monto','error'); return; }
    const {error} = await DB.upsertViatico({
      empleado_id: empId, concepto: conc, monto,
      tipo:        document.getElementById('via-tipo')?.value,
      fecha:       document.getElementById('via-fecha')?.value,
      referencia:  document.getElementById('via-ref')?.value||null,
      aprobado:    false
    });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast('Viático registrado ✓');
    this._tab='viaticos'; this._renderTab();
  },

  async aprobarViatico(id) {
    const viaticos = await DB.getViaticos(null, this._ini, this._fin);
    const v = viaticos.find(x=>x.id===id);
    if (!v) return;
    const ok = await UI.confirmar(`¿Aprobar el viático <b>${v.concepto}</b> por <b>${UI.q(v.monto)}</b>? Se registrará como egreso.`,'Aprobar');
    if (!ok) return;
    const { error } = await DB.upsertViatico({ id, aprobado: true });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    /* Registrar el viático aprobado como egreso (categoría Viáticos) */
    await DB.upsertEgreso({
      concepto:   `Viático: ${v.concepto}${v.empleados?.nombre?` — ${v.empleados.nombre}`:''}`,
      monto:      v.monto,
      categoria:  'Viáticos',
      fecha:      v.fecha || new Date().toISOString().slice(0,10),
      referencia: v.referencia || `VIA-${id.slice(0,8)}`
    });
    UI.toast('Viático aprobado y cargado a egresos ✓');
    this._renderTab();
  },

  /* ── EGRESOS RECURRENTES ──────────────────────── */
  async modalRecurrente(id=null) {
    const recs = await DB.getEgresosRecurrentes();
    const r = id ? recs.find(x=>x.id===id)||{} : {};
    const esEdicion = !!id;
    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Gasto Recurrente`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Concepto *</label>
          <input class="form-input" id="rec-concepto" value="${r.concepto||''}" placeholder="Renta del local / Energía eléctrica"></div>
        <div class="form-group"><label class="form-label">Categoría</label>
          <select class="form-select" id="rec-cat">
            ${['Renta','Servicios','Combustible','Nómina','Impuestos','Internet/Teléfono','Mantenimiento','Contador','Certificación FEL','Otro'].map(c=>`<option ${r.categoria===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Monto (Q) *</label>
          <input class="form-input" id="rec-monto" type="number" min="0" step="0.01" value="${r.monto||''}"></div>
        <div class="form-group"><label class="form-label">Frecuencia</label>
          <select class="form-select" id="rec-freq">
            ${[['mensual','Mensual'],['bimestral','Bimestral'],['trimestral','Trimestral'],['anual','Anual']].map(([v,l])=>`<option value="${v}" ${(r.frecuencia||'mensual')===v?'selected':''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Día de pago/vencimiento</label>
          <input class="form-input" id="rec-dia" type="number" min="1" max="31" value="${r.dia_mes||1}"></div>
        <div class="form-group"><label class="form-label">Método de pago</label>
          <select class="form-select" id="rec-metodo">
            ${['Transferencia','Efectivo','Cheque','Tarjeta','Débito automático'].map(m=>`<option ${r.metodo_pago===m?'selected':''}>${m}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Proveedor / Acreedor</label>
        <input class="form-input" id="rec-prov" value="${r.proveedor||''}" placeholder="Empresa Eléctrica / Arrendante"></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="rec-notas" rows="2">${r.notas||''}</textarea></div>
      ${esEdicion?`<div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="rec-activo" ${r.activo!==false?'checked':''}>
          <span class="form-label" style="margin:0">Activo (se genera cada período)</span>
        </label></div>`:''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.finanzas.guardarRecurrente('${id||''}')">${esEdicion?'Guardar Cambios':'Crear'}</button>
      </div>`);
  },

  async guardarRecurrente(id='') {
    const concepto = document.getElementById('rec-concepto')?.value.trim();
    const monto = parseFloat(document.getElementById('rec-monto')?.value)||0;
    if (!concepto||monto<=0) { UI.toast('Concepto y monto son obligatorios','error'); return; }
    const fields = {
      concepto, monto,
      categoria:   document.getElementById('rec-cat')?.value,
      frecuencia:  document.getElementById('rec-freq')?.value||'mensual',
      dia_mes:     parseInt(document.getElementById('rec-dia')?.value)||1,
      metodo_pago: document.getElementById('rec-metodo')?.value||null,
      proveedor:   document.getElementById('rec-prov')?.value||null,
      notas:       document.getElementById('rec-notas')?.value||null,
      activo:      id ? (document.getElementById('rec-activo')?.checked ?? true) : true
    };
    if (id) fields.id = id;
    const { error } = await DB.upsertEgresoRecurrente(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Recurrente actualizado ✓':'Recurrente creado ✓');
    this._tab='recurrentes'; this._renderTab();
  },

  async generarRecurrente(id) {
    const recs = await DB.getEgresosRecurrentes();
    const r = recs.find(x=>x.id===id);
    if (!r) return;
    const now = new Date();
    const res = await DB.generarEgresoRecurrente(r, now.getMonth()+1, now.getFullYear());
    if (!res.ok) { UI.toast('Error: '+res.error,'error'); return; }
    UI.toast(res.yaExistia ? 'Ya estaba generado este mes' : `Egreso de "${r.concepto}" generado ✓`);
    this._renderTab();
  },

  async generarRecurrentesPendientes() {
    const recs = await DB.getEgresosRecurrentes();
    const now = new Date();
    const mesKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const pend = recs.filter(r => r.activo && (r.ultima_generacion||'') < mesKey);
    if (!pend.length) { UI.toast('No hay recurrentes pendientes','info'); return; }
    const ok = await UI.confirmar(`¿Generar <b>${pend.length}</b> egreso(s) recurrente(s) de este mes?`, 'Generar');
    if (!ok) return;
    let n = 0;
    for (const r of pend) {
      const res = await DB.generarEgresoRecurrente(r, now.getMonth()+1, now.getFullYear());
      if (res.ok && !res.yaExistia) n++;
    }
    UI.toast(`${n} egreso(s) recurrente(s) generado(s) ✓`);
    this._renderTab();
  }
};
