/* TallerPro v3.0 — finanzas/index.js */
Modulos.finanzas = {
  _tab: 'dashboard', _ini: null, _fin: null,

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
        </div>
        <div id="fin-content"><div style="padding:40px;text-align:center;color:var(--text3)">⏳ Cargando...</div></div>
      </div>`;
    await this._renderTab();
  },

  async _renderTab() {
    const el = document.getElementById('fin-content');
    if (!el) return;
    const [ingresos, egresos] = await Promise.all([DB.getIngresos(this._ini,this._fin), DB.getEgresos(this._ini,this._fin)]);
    const totalIng = ingresos.reduce((s,i)=>s+(i.monto||0),0);
    const totalEgr = egresos.reduce((s,e)=>s+(e.monto||0),0);
    const utilidad = totalIng - totalEgr;

    if (this._tab==='dashboard') {
      const agrupar = (items,campo) => {
        const m={};
        items.forEach(i=>{const k=i[campo]||'General';m[k]=(m[k]||0)+(i.monto||0);});
        return Object.entries(m).sort((a,b)=>b[1]-a[1]);
      };
      el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:20px">
          <div class="kpi-card"><div class="kpi-label">Ingresos</div><div class="kpi-val green">${UI.q(totalIng)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Egresos</div><div class="kpi-val red">${UI.q(totalEgr)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Utilidad</div><div class="kpi-val ${utilidad>=0?'amber':'red'}">${UI.q(utilidad)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Margen</div><div class="kpi-val ${utilidad>=0?'green':'red'}">${totalIng>0?Math.round(utilidad/totalIng*100):0}%</div></div>
        </div>
        <div class="grid-2">
          <div class="card"><div class="card-sub mb-3">📈 Ingresos por Categoría</div>
            ${agrupar(ingresos,'categoria').map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px"><span>${k}</span><span class="text-green">${UI.q(v)}</span></div>`).join('')||'<div class="text-muted">Sin datos</div>'}
          </div>
          <div class="card"><div class="card-sub mb-3">📉 Egresos por Categoría</div>
            ${agrupar(egresos,'categoria').map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px"><span>${k}</span><span class="text-red">${UI.q(v)}</span></div>`).join('')||'<div class="text-muted">Sin datos</div>'}
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
              <button class="btn btn-sm btn-cyan" onclick="Modulos.finanzas.modalIngreso('${i.id}')">Editar</button>
              <button class="btn btn-sm btn-danger" onclick="Modulos.finanzas.eliminar('ingresos','${i.id}')">✕</button>
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
              <button class="btn btn-sm btn-cyan" onclick="Modulos.finanzas.modalEgreso('${e.id}')">Editar</button>
              <button class="btn btn-sm btn-danger" onclick="Modulos.finanzas.eliminar('egresos','${e.id}')">✕</button>
            </div></td>
          </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin egresos</td></tr>'}</tbody>
        </table></div>`;
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
          <input class="form-input" id="ing-monto" type="number" min="0" step="0.01" placeholder="0.00"></div>
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
          ${id?'Guardar Cambios':'Registrar'}
        </button>
      </div>`);
  },

  async guardarIngreso(id='') {
    const concepto = document.getElementById('ing-concepto')?.value.trim();
    const monto = parseFloat(document.getElementById('ing-monto')?.value)||0;
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
            ${['Compras','Nómina','Servicios','Renta','Combustible','Viáticos','Impuestos','Otro'].map(c=>`<option>${c}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Monto (Q) *</label>
          <input class="form-input" id="egr-monto" type="number" min="0" step="0.01" placeholder="0.00"></div>
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
          ${id?'Guardar Cambios':'Registrar'}
        </button>
      </div>`);
  },

  async guardarEgreso(id='') {
    const concepto = document.getElementById('egr-concepto')?.value.trim();
    const monto = parseFloat(document.getElementById('egr-monto')?.value)||0;
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
  }
};
