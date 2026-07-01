/* NexusPro v3.0 — operacion/activos.js
   Herramientas, maquinaria y equipo con depreciación (línea recta).
   Alimenta el estado de resultados y el cálculo trimestral de impuestos. */
Modulos.activos = {
  _data: [], _proveedores: [], _tab: 'activos', _anio: null, _trim: null,

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    [this._data, this._proveedores] = await Promise.all([
      DB.getActivos(), DB.getProveedores().catch(()=>[])
    ]);
    const now = new Date();
    if (!this._anio) this._anio = now.getFullYear();
    if (!this._trim) this._trim = Math.floor(now.getMonth()/3)+1;

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🛠️ Herramientas y Maquinaria</h1>
        <p class="page-subtitle">// ${this._data.length} activos registrados</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.activos.modalForm()">＋ Nuevo Activo</button>
        </div>
      </div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='activos'?'active':''}" onclick="Modulos.activos._ir('activos')">🛠️ Inventario de Activos</button>
          <button class="tab-btn ${this._tab==='depreciacion'?'active':''}" onclick="Modulos.activos._ir('depreciacion')">📉 Depreciación</button>
        </div>
        ${this._tab==='activos' ? this._renderActivos() : this._renderDepreciacion()}
      </div>`;
  },

  _ir(t){ this._tab=t; App._subActivo=t; App._guardarRuta(); App.renderSidebar(); this.render(); },

  _renderActivos() {
    const hoy = new Date().toISOString().slice(0,10);
    const activos = this._data.filter(a=>a.estado==='activo');
    const totalCosto  = this._data.reduce((s,a)=>s+(Number(a.costo)||0),0);
    const totalLibros = this._data.reduce((s,a)=>s+valorEnLibros(a, hoy).libros,0);
    const depMes      = activos.reduce((s,a)=>s+depMensual(a),0);

    return `
      <div class="kpi-grid" style="margin-bottom:16px">
        ${UI.kpiCard({ icon:'🧰', clase:'cyan', label:'Activos', value: this._data.length, trend:`${activos.length} en uso` })}
        ${UI.kpiCard({ icon:'💰', clase:'amber', label:'Valor de Adquisición', value: totalCosto, money:true })}
        ${UI.kpiCard({ icon:'📒', clase:'green', label:'Valor en Libros (hoy)', value: totalLibros, money:true })}
        ${UI.kpiCard({ icon:'📉', clase:'red', label:'Depreciación Mensual', value: depMes, money:true, trend:'gasto operativo/mes' })}
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Activo</th><th>Categoría</th><th>Adquisición</th><th>Costo</th><th>Vida útil</th><th>Dep. mensual</th><th>Valor en libros</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
          ${this._data.map(a=>{
            const vl = valorEnLibros(a, hoy);
            const anios = ((Number(a.vida_util_meses)||0)/12);
            const estCol = a.estado==='activo'?'green':a.estado==='vendido'?'cyan':'gray';
            return `<tr style="${a.estado!=='activo'?'opacity:.6':''}">
              <td><div style="font-weight:700">${a.nombre}</div>${a.codigo?`<div style="font-size:11px;color:var(--text3)">${a.codigo}</div>`:''}</td>
              <td><span class="badge badge-gray">${a.categoria||'—'}</span></td>
              <td class="mono-sm">${UI.fecha(a.fecha_adquisicion)||'—'}</td>
              <td class="mono-sm">${UI.q(a.costo)}</td>
              <td class="mono-sm" style="text-align:center">${anios?anios.toFixed(anios%1?1:0)+' a':'—'}</td>
              <td class="mono-sm text-red">${UI.q(depMensual(a))}</td>
              <td class="mono-sm text-green"><b>${UI.q(vl.libros)}</b><div style="font-size:10px;color:var(--text3)">acum. ${UI.q(vl.acumulada)}</div></td>
              <td><span class="badge badge-${estCol}">${a.estado==='activo'?'Activo':a.estado==='vendido'?'Vendido':'Baja'}</span></td>
              <td><div style="display:flex;gap:4px">
                ${Modulos.btnAccion('editar', `Modulos.activos.modalForm('${a.id}')`)}
                ${a.estado==='activo'?`<button class="btn btn-sm btn-ghost" onclick="Modulos.activos.modalBaja('${a.id}')" title="Dar de baja / vender">📤</button>`:''}
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('activos','${a.id}','${(a.nombre||'').replace(/'/g,"\\'")}',()=>Modulos.activos.render())`)}
              </div></td>
            </tr>`;
          }).join('')||'<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text3)">Sin activos. Registra herramientas, maquinaria y equipo con “＋ Nuevo Activo”.</td></tr>'}
        </tbody>
      </table></div>`;
  },

  _renderDepreciacion() {
    const anio = this._anio, trim = this._trim;
    const trimRangos = { 1:['01-01','03-31'], 2:['04-01','06-30'], 3:['07-01','09-30'], 4:['10-01','12-31'] };
    const [ti, tf] = trimRangos[trim];
    const qIni = `${anio}-${ti}`, qFin = `${anio}-${tf}`;
    const aIni = `${anio}-01-01`, aFin = `${anio}-12-31`;
    const finAnio = `${anio}-12-31`;
    const anios = [anio-2, anio-1, anio, anio+1];

    let totQ=0, totA=0;
    const filas = this._data.map(a=>{
      const dq = depEnRango(a, qIni, qFin);
      const da = depEnRango(a, aIni, aFin);
      const vl = valorEnLibros(a, finAnio);
      totQ += dq; totA += da;
      if (dq===0 && da===0 && a.estado!=='activo') return '';
      return `<tr>
        <td><div style="font-weight:700">${a.nombre}</div><div style="font-size:11px;color:var(--text3)">${a.categoria||''}</div></td>
        <td class="mono-sm">${UI.q(a.costo)}</td>
        <td class="mono-sm text-red">${UI.q(dq)}</td>
        <td class="mono-sm text-red">${UI.q(da)}</td>
        <td class="mono-sm">${UI.q(vl.acumulada)}</td>
        <td class="mono-sm text-green"><b>${UI.q(vl.libros)}</b></td>
      </tr>`;
    }).join('');

    return `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
        <select class="form-select" style="width:auto" onchange="Modulos.activos._trim=parseInt(this.value);Modulos.activos.render()">
          ${[1,2,3,4].map(q=>`<option value="${q}" ${trim===q?'selected':''}>${q}º Trimestre</option>`).join('')}
        </select>
        <select class="form-select" style="width:auto" onchange="Modulos.activos._anio=parseInt(this.value);Modulos.activos.render()">
          ${anios.map(y=>`<option value="${y}" ${anio===y?'selected':''}>${y}</option>`).join('')}
        </select>
        <button class="btn btn-ghost" onclick="window.print()">🖨️ Imprimir</button>
      </div>
      <div class="kpi-grid" style="margin-bottom:16px">
        ${UI.kpiCard({ icon:'📉', clase:'red', label:`Depreciación ${trim}º Trim. ${anio}`, value: totQ, money:true, trend:'deducible trimestral' })}
        ${UI.kpiCard({ icon:'📉', clase:'amber', label:`Depreciación Año ${anio}`, value: totA, money:true })}
        ${UI.kpiCard({ icon:'🧰', clase:'cyan', label:'Activos depreciables', value: this._data.filter(a=>depMensual(a)>0).length })}
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Activo</th><th>Costo</th><th>Dep. ${trim}º Trim.</th><th>Dep. Año</th><th>Dep. Acum.</th><th>Valor en libros</th></tr></thead>
        <tbody>${filas||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin depreciación en el período</td></tr>'}</tbody>
      </table></div>
      <div class="alert alert-cyan" style="margin-top:12px">
        <div class="alert-icon">🏛️</div>
        <div class="alert-body" style="font-size:12px">La depreciación del trimestre (<b>${UI.q(totQ)}</b>) es un gasto deducible. También se refleja automáticamente en <b>Finanzas → Estado de Resultados</b> y reduce la utilidad para el ISR.</div>
      </div>`;
  },

  modalForm(id=null) {
    const a = id ? this._data.find(x=>x.id===id)||{} : {};
    const esEdicion = !!id;
    const cats = Object.keys(VIDA_UTIL_CATEGORIA);
    const aniosVida = a.vida_util_meses ? (a.vida_util_meses/12) : 5;
    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Activo`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del activo.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre *</label>
          <input class="form-input" id="act-nombre" value="${a.nombre||''}" placeholder="Compresor de aire 100L / Scanner OBD2"></div>
        <div class="form-group"><label class="form-label">Código / Serie</label>
          <input class="form-input" id="act-codigo" value="${a.codigo||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Categoría</label>
          <select class="form-select" id="act-cat" onchange="Modulos.activos._sugerirVida(this.value)">
            ${cats.map(c=>`<option ${a.categoria===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Vida útil (años)</label>
          <input class="form-input" id="act-vida" type="number" min="1" step="0.5" value="${aniosVida}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Costo de adquisición (Q) *</label>
          <input class="form-input" id="act-costo" type="number" min="0" step="0.01" value="${a.costo||''}"
                 oninput="Modulos.activos._previewDep()"></div>
        <div class="form-group"><label class="form-label">Valor residual / rescate (Q)</label>
          <input class="form-input" id="act-residual" type="number" min="0" step="0.01" value="${a.valor_residual||0}"
                 oninput="Modulos.activos._previewDep()"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha de adquisición</label>
          <input class="form-input" id="act-fecha" type="date" value="${a.fecha_adquisicion||new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Ubicación</label>
          <input class="form-input" id="act-ubic" value="${a.ubicacion||''}" placeholder="Taller / Bodega 1"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Proveedor</label>
          <input class="form-input" id="act-prov" list="act-prov-list" autocomplete="off" value="${a.proveedor||''}" placeholder="Elige o escribe...">
          <datalist id="act-prov-list">
            ${this._proveedores.map(p=>`<option value="${(p.nombre||'').replace(/"/g,'&quot;')}">`).join('')}
          </datalist>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Selecciona un proveedor registrado o escribe uno nuevo.</div></div>
        <div class="form-group"><label class="form-label">No. Factura</label>
          <input class="form-input" id="act-factura" value="${a.num_factura||''}"></div>
      </div>
      <div id="act-dep-preview" class="card" style="background:var(--surface2);font-size:12px;margin-bottom:12px"></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="act-notas" rows="2">${a.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.activos.guardar('${id||''}')">${esEdicion?'Guardar Cambios':'Crear Activo'}</button>
      </div>`, '640px');
    this._previewDep();
  },

  _sugerirVida(cat) {
    const meses = VIDA_UTIL_CATEGORIA[cat];
    const el = document.getElementById('act-vida');
    if (el && meses) el.value = meses/12;
    this._previewDep();
  },

  _previewDep() {
    const el = document.getElementById('act-dep-preview');
    if (!el) return;
    const costo = parseFloat(document.getElementById('act-costo')?.value)||0;
    const res   = parseFloat(document.getElementById('act-residual')?.value)||0;
    const anios = parseFloat(document.getElementById('act-vida')?.value)||0;
    const meses = anios*12;
    const dm = meses>0 ? Math.max(0,(costo-res))/meses : 0;
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
      <div><div style="color:var(--red);font-weight:700">${UI.q(dm)}</div><div style="font-size:10px;color:var(--text3)">Dep. mensual</div></div>
      <div><div style="color:var(--amber);font-weight:700">${UI.q(dm*12)}</div><div style="font-size:10px;color:var(--text3)">Dep. anual</div></div>
      <div><div style="color:var(--cyan);font-weight:700">${anios||0} años</div><div style="font-size:10px;color:var(--text3)">Vida útil</div></div>
    </div>`;
  },

  async guardar(id='') {
    const nombre = document.getElementById('act-nombre')?.value.trim();
    const costo  = parseFloat(document.getElementById('act-costo')?.value)||0;
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }
    if (costo<=0) { UI.toast('El costo de adquisición es obligatorio','error'); return; }
    const anios = parseFloat(document.getElementById('act-vida')?.value)||5;
    const fields = {
      nombre, costo,
      codigo:          document.getElementById('act-codigo')?.value||null,
      categoria:       document.getElementById('act-cat')?.value,
      valor_residual:  parseFloat(document.getElementById('act-residual')?.value)||0,
      vida_util_meses: Math.round(anios*12),
      fecha_adquisicion: document.getElementById('act-fecha')?.value||null,
      ubicacion:       document.getElementById('act-ubic')?.value||null,
      proveedor:       document.getElementById('act-prov')?.value||null,
      num_factura:     document.getElementById('act-factura')?.value||null,
      notas:           document.getElementById('act-notas')?.value||null
    };
    if (id) fields.id = id; else fields.estado = 'activo';
    const { error } = await DB.upsertActivo(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Activo actualizado ✓':'Activo registrado ✓');
    this.render();
  },

  modalBaja(id) {
    const a = this._data.find(x=>x.id===id);
    if (!a) return;
    const vl = valorEnLibros(a, new Date().toISOString().slice(0,10));
    UI.modal(`📤 Dar de baja — ${a.nombre}`, `
      <div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">ℹ️</div>
        <div class="alert-body" style="font-size:11px">Valor en libros actual: <b>${UI.q(vl.libros)}</b>. La depreciación se detiene en la fecha de baja.</div></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Motivo</label>
          <select class="form-select" id="baja-estado">
            <option value="baja">Baja / desecho</option>
            <option value="vendido">Vendido</option>
          </select></div>
        <div class="form-group"><label class="form-label">Fecha</label>
          <input class="form-input" id="baja-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="form-group"><label class="form-label">Valor de venta (Q, si aplica)</label>
        <input class="form-input" id="baja-valor" type="number" min="0" step="0.01"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.activos.confirmarBaja('${id}')">Confirmar</button>
      </div>`);
  },

  async confirmarBaja(id) {
    const fields = {
      id,
      estado:      document.getElementById('baja-estado')?.value||'baja',
      fecha_baja:  document.getElementById('baja-fecha')?.value||new Date().toISOString().slice(0,10),
      valor_venta: parseFloat(document.getElementById('baja-valor')?.value)||null
    };
    const { error } = await DB.upsertActivo(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    /* Si se vendió, registrar el ingreso por la venta del activo */
    if (fields.estado==='vendido' && fields.valor_venta>0) {
      const a = this._data.find(x=>x.id===id);
      await DB.upsertIngreso({
        concepto: `Venta de activo: ${a?.nombre||''}`, monto: fields.valor_venta,
        categoria: 'Otro', fecha: fields.fecha_baja, referencia: `ACT-${id.slice(0,8)}`
      });
    }
    UI.cerrarModal(); UI.toast('Activo dado de baja ✓');
    this.render();
  }
};
