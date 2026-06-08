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
          <input type="date" class="form-input" style="width:140px" value="${this._ini}" onchange="Modulos.finanzas._ini=this.value;Modulos.finanzas._renderTab()">
          <input type="date" class="form-input" style="width:140px" value="${this._fin}" onchange="Modulos.finanzas._fin=this.value;Modulos.finanzas._renderTab()">
        </div>
      </div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='dashboard'?'active':''}" onclick="Modulos.finanzas._tab='dashboard';Modulos.finanzas._renderTab()">📊 Resumen</button>
          <button class="tab-btn ${this._tab==='ingresos'?'active':''}" onclick="Modulos.finanzas._tab='ingresos';Modulos.finanzas._renderTab()">📈 Ingresos</button>
          <button class="tab-btn ${this._tab==='egresos'?'active':''}" onclick="Modulos.finanzas._tab='egresos';Modulos.finanzas._renderTab()">📉 Egresos</button>
          <button class="tab-btn ${this._tab==='viaticos'?'active':''}" onclick="Modulos.finanzas._tab='viaticos';Modulos.finanzas._renderTab()">🚗 Viáticos</button>
          <button class="tab-btn ${this._tab==='balance'?'active':''}" onclick="Modulos.finanzas._tab='balance';Modulos.finanzas._renderTab()">📋 Estado de Resultados</button>
          <button class="tab-btn ${this._tab==='fiscal'?'active':''}" onclick="Modulos.finanzas._tab='fiscal';Modulos.finanzas._renderTab()">🏛️ Fiscal SAT</button>
        </div>
        <div id="fin-content"><div class="empty-state">⏳ Cargando...</div></div>
      </div>`;
    await this._renderTab();
  },

  async _getData() {
    const [ingresos, egresos] = await Promise.all([DB.getIngresos(this._ini,this._fin), DB.getEgresos(this._ini,this._fin)]);
    const totalIng = ingresos.reduce((s,i)=>s+(i.monto||0),0);
    const totalEgr = egresos.reduce((s,e)=>s+(e.monto||0),0);
    return { ingresos, egresos, totalIng, totalEgr, utilidad: totalIng-totalEgr };
  },

  async _renderTab() {
    const el = document.getElementById('fin-content');
    if (!el) return;
    const { ingresos, egresos, totalIng, totalEgr, utilidad } = await this._getData();

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
            ${agrupar(ingresos,'categoria').map(([k,v])=>`
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
          <tbody>${ingresos.map(i=>`<tr>
            <td>${UI.fecha(i.fecha)}</td><td>${i.concepto}</td>
            <td><span class="badge badge-green">${i.categoria||'General'}</span></td>
            <td class="mono-sm">${i.referencia||'—'}</td>
            <td class="mono-sm text-green"><b>${UI.q(i.monto)}</b></td>
            <td><div style="display:flex;gap:4px">
              <button class="btn btn-sm btn-cyan" onclick="Modulos.finanzas.modalIngreso('${i.id}')" title="Editar">✏️ Editar</button>
              <button class="btn btn-sm btn-danger" onclick="Modulos.finanzas.eliminar('ingresos','${i.id}')" title="Eliminar">🗑️</button>
            </div></td>
          </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin ingresos</td></tr>'}</tbody>
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

    else if (this._tab==='balance') {
      const ini  = new Date(this._ini+'T00:00:00');
      const fin  = new Date(this._fin+'T23:59:59');
      const meses = Math.round((fin-ini)/(1000*60*60*24*30))+1;
      const periodo = meses<=1?'Mensual':meses<=3?'Trimestral':meses<=6?'Semestral':'Anual';

      // Gastos por categoría agrupados
      const gastos = agrupar(egresos,'categoria');
      const ventas  = agrupar(ingresos,'categoria');
      const costo   = egresos.filter(e=>['Compras','Repuestos'].includes(e.categoria)).reduce((s,e)=>s+(e.monto||0),0);
      const gastoOp = egresos.filter(e=>!['Compras','Repuestos'].includes(e.categoria)).reduce((s,e)=>s+(e.monto||0),0);
      const utilBruta = totalIng - costo;
      const utilOp    = utilBruta - gastoOp;

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
          <div style="display:flex;justify-content:space-between;padding:8px 12px;font-weight:800;font-size:14px;border-top:2px solid var(--border)">
            <span>Utilidad Operativa</span><span class="${utilOp>=0?'text-green':'text-red'}">${UI.q(utilOp)}</span>
          </div>

          <!-- UTILIDAD NETA -->
          <div style="display:flex;justify-content:space-between;padding:16px 12px;font-weight:800;font-size:18px;border-top:3px solid var(--amber);margin-top:8px;background:var(--amber-dim);border-radius:0 0 8px 8px">
            <span>UTILIDAD NETA</span>
            <span class="${utilidad>=0?'text-amber':'text-red'}">${UI.q(utilidad)}</span>
          </div>
        </div>`;
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

      const calc = _calcImpuesto(regimen, totalIng, utilidad);

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
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
            <span>Utilidad</span><span class="${utilidad>=0?'text-green':'text-red'}">${UI.q(utilidad)}</span>
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
            <span>Utilidad después de impuestos</span><span class="${(utilidad-calc.total)>=0?'text-amber':'text-red'}">${UI.q(utilidad-calc.total)}</span>
          </div>

          <div class="alert alert-cyan" style="margin-top:16px">
            <div class="alert-icon">ℹ️</div>
            <div class="alert-body" style="font-size:11px">
              Este es un estimado orientativo. Consulta a un contador autorizado para declaraciones oficiales ante la SAT de Guatemala.
              Régimen actual seleccionado: <b>${REGIMENES.find(r=>r.id===regimen)?.label}</b>
            </div>
          </div>
        </div>`;
    }
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
  }
};
