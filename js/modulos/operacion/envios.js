/* TallerPro v3.0 — operacion/envios.js
   Logística: traslados internos, fletes externos, envíos a proveedores
   (torno, rectificadora) y couriers (Cargo Expreso, Guatex, Forza,
   PedidosYa...). Con fecha de entrega estimada (seguimiento en calendario),
   cierre y archivo a historial. */
Modulos.envios = {
  _data: [], _ordenes: [], _tab: 'activos',

  _TIPOS: {
    interno:   ['cyan',  '🏠 Interno'],
    externo:   ['amber', '🚚 Flete externo'],
    proveedor: ['purple','🏭 A proveedor'],
    courier:   ['green', '📦 Courier'],
  },
  _ESTADOS: {
    programado:  ['gray',  'Programado'],
    en_transito: ['amber', 'En tránsito'],
    entregado:   ['green', 'Entregado'],
    cerrado:     ['cyan',  'Cerrado'],
  },
  _COURIERS: ['Cargo Expreso','Guatex','Forza Delivery','PedidosYa','Hugo','Uber Flash','Otro'],

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    const archivado = this._tab === 'historial';
    [this._data, this._ordenes] = await Promise.all([
      DB.getEnvios({ archivado }), DB.getOrdenes().catch(()=>[])
    ]);

    const enTransito = this._data.filter(e=>e.estado==='en_transito').length;
    const programados = this._data.filter(e=>e.estado==='programado').length;
    const costoTotal = this._data.reduce((s,e)=>s+(Number(e.costo_total)||0),0);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🚚 Envíos / Fletes</h1>
        <p class="page-subtitle">// ${this._data.length} ${archivado?'archivados':'activos'}${enTransito?` · ${enTransito} en tránsito`:''}</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.envios.modalForm()">＋ Nuevo Envío</button>
        </div>
      </div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='activos'?'active':''}" onclick="Modulos.envios._tab='activos';Modulos.envios.render()">🚚 Activos</button>
          <button class="tab-btn ${this._tab==='historial'?'active':''}" onclick="Modulos.envios._tab='historial';Modulos.envios.render()">🗄️ Historial</button>
        </div>
        ${!archivado?`<div class="kpi-grid" style="margin-bottom:16px">
          <div class="kpi-card"><div class="kpi-label">Programados</div><div class="kpi-val gray">${programados}</div></div>
          <div class="kpi-card"><div class="kpi-label">En tránsito</div><div class="kpi-val amber">${enTransito}</div></div>
          <div class="kpi-card"><div class="kpi-label">Costo total (fletes)</div><div class="kpi-val red">${UI.q(costoTotal)}</div></div>
        </div>`:''}
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Destino / Empresa</th><th>Medio</th><th>Costo</th><th>No. envío</th><th>Entrega est.</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._data.map(e=>this._fila(e)).join('')||`<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text3)">Sin envíos ${archivado?'archivados':'activos'}</td></tr>`}
          </tbody>
        </table></div>
      </div>`;
  },

  _fila(e) {
    const [tc,tl] = this._TIPOS[e.tipo] || ['gray', e.tipo];
    const [ec,el] = this._ESTADOS[e.estado] || ['gray', e.estado];
    const venc = e.fecha_entrega_estimada && !['entregado','cerrado'].includes(e.estado)
      && e.fecha_entrega_estimada < new Date().toISOString().slice(0,10);
    const destino = e.destinatario || e.empresa_transporte || '—';
    return `<tr>
      <td class="mono-sm">${UI.fecha(e.fecha_envio)}</td>
      <td><span class="badge badge-${tc}">${tl}</span></td>
      <td><b>${e.descripcion}</b>${e.num_factura?`<br><small class="text-muted">Fact: ${e.num_factura}</small>`:''}</td>
      <td>${destino}</td>
      <td>${e.medio?this._medioLabel(e.medio):'—'}</td>
      <td class="mono-sm text-red">${UI.q(e.costo_total)}</td>
      <td class="mono-sm">${e.numero_envio||'—'}</td>
      <td class="mono-sm ${venc?'text-red':''}">${UI.fecha(e.fecha_entrega_estimada)}${venc?' ⚠️':''}</td>
      <td><span class="badge badge-${ec}">${el}</span></td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap">
        ${e.estado==='programado'?`<button class="btn btn-sm btn-ghost" onclick="Modulos.envios.marcar('${e.id}','en_transito')" title="Marcar en tránsito">🚚</button>`:''}
        ${['programado','en_transito'].includes(e.estado)?`<button class="btn btn-sm btn-green" onclick="Modulos.envios.marcar('${e.id}','entregado')" title="Marcar entregado">📦</button>`:''}
        ${e.estado==='entregado'?`<button class="btn btn-sm btn-cyan" onclick="Modulos.envios.marcar('${e.id}','cerrado')" title="Cerrar">✅</button>`:''}
        ${!e.archivado && ['entregado','cerrado'].includes(e.estado)?`<button class="btn btn-sm btn-ghost" onclick="Modulos.envios.archivar('${e.id}',true)" title="Archivar">🗄️</button>`:''}
        ${e.archivado?`<button class="btn btn-sm btn-ghost" onclick="Modulos.envios.archivar('${e.id}',false)" title="Desarchivar">↩️</button>`:''}
        ${Modulos.btnAccion('editar', `Modulos.envios.modalForm('${e.id}')`, {stop:false})}
        ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('envios','${e.id}','${(e.descripcion||'').replace(/'/g,"\\'")}',()=>Modulos.envios.render())`, {stop:false})}
      </div></td>
    </tr>`;
  },

  _medioLabel(m) {
    return ({moto:'🏍️ Moto',vehiculo:'🚗 Vehículo',camion:'🚛 Camión',cabezal:'🚜 Cabezal',otro:'Otro'})[m]||m;
  },

  async modalForm(id='', prefill={}) {
    if (!this._ordenes.length) this._ordenes = await DB.getOrdenes().catch(()=>[]);
    const e = id ? this._data.find(x=>x.id===id)||{} : prefill;
    const esEd = !!id;
    UI.modal(`${esEd?'✏️ Editar':'＋ Nuevo'} Envío`, `
      <input type="hidden" id="env-te" value="${e.trabajo_externo_id||''}">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo de envío *</label>
          <select class="form-select" id="env-tipo" onchange="Modulos.envios._onTipo()">
            ${Object.entries(this._TIPOS).map(([k,v])=>`<option value="${k}" ${e.tipo===k?'selected':''}>${v[1]}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Orden de trabajo (opcional)</label>
          <select class="form-select" id="env-ot">
            <option value="">Sin OT</option>
            ${this._ordenes.map(o=>`<option value="${o.id}" ${e.orden_id===o.id?'selected':''}>${o.num} — ${o.vehiculos?.placa||''}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Descripción de lo enviado *</label>
        <input class="form-input" id="env-desc" value="${(e.descripcion||'').replace(/"/g,'&quot;')}" placeholder="Discos de freno / repuestos a Bodega Norte"></div>
      <div class="form-group"><label class="form-label">Destinatario (proveedor / cliente / bodega)</label>
        <input class="form-input" id="env-dest" value="${(e.destinatario||'').replace(/"/g,'&quot;')}" placeholder="Torno El Progreso / Bodega Norte"></div>

      <!-- INTERNO -->
      <div id="env-interno">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Medio de transporte</label>
            <select class="form-select" id="env-medio">
              ${['moto','vehiculo','camion','cabezal','otro'].map(m=>`<option value="${m}" ${e.medio===m?'selected':''}>${this._medioLabel(m)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Responsable / piloto</label>
            <input class="form-input" id="env-resp" value="${(e.responsable||'').replace(/"/g,'&quot;')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Viáticos (Q)</label>
            <input class="form-input" id="env-viaticos" type="number" min="0" step="0.01" value="${e.viaticos||0}" oninput="Modulos.envios._calc()"></div>
          <div class="form-group"><label class="form-label">Combustible (Q)</label>
            <input class="form-input" id="env-combustible" type="number" min="0" step="0.01" value="${e.combustible||0}" oninput="Modulos.envios._calc()"></div>
        </div>
      </div>

      <!-- EXTERNO / PROVEEDOR / COURIER -->
      <div id="env-externo">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Empresa de transporte</label>
            <input class="form-input" id="env-empresa" list="env-couriers" value="${(e.empresa_transporte||'').replace(/"/g,'&quot;')}" placeholder="Cargo Expreso / transporte propio">
            <datalist id="env-couriers">${this._COURIERS.map(c=>`<option value="${c}">`).join('')}</datalist></div>
          <div class="form-group"><label class="form-label">Costo del flete (Q)</label>
            <input class="form-input" id="env-flete" type="number" min="0" step="0.01" value="${e.costo_flete||0}" oninput="Modulos.envios._calc()"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">No. de envío / guía</label>
            <input class="form-input" id="env-num" value="${(e.numero_envio||'').replace(/"/g,'&quot;')}" placeholder="Tracking / guía"></div>
          <div class="form-group"><label class="form-label">No. de factura</label>
            <input class="form-input" id="env-fact" value="${(e.num_factura||'').replace(/"/g,'&quot;')}"></div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha de envío</label>
          <input class="form-input" id="env-fecha" type="date" value="${e.fecha_envio||new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Entrega estimada (seguimiento)</label>
          <input class="form-input" id="env-est" type="date" value="${e.fecha_entrega_estimada||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="env-notas" rows="2">${e.notas||''}</textarea></div>
      <div id="env-calc" class="card" style="background:var(--surface2);font-size:12px;margin-bottom:12px"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.envios.guardar('${id}')">${esEd?'Guardar':'Registrar Envío'}</button>
      </div>`, '600px');
    this._onTipo();
  },

  _onTipo() {
    const tipo = document.getElementById('env-tipo')?.value;
    const interno = document.getElementById('env-interno');
    const externo = document.getElementById('env-externo');
    if (interno) interno.style.display = tipo==='interno' ? 'block' : 'none';
    if (externo) externo.style.display = tipo==='interno' ? 'none' : 'block';
    this._calc();
  },

  _calc() {
    const n = id => parseFloat(document.getElementById(id)?.value)||0;
    const tipo = document.getElementById('env-tipo')?.value;
    const total = tipo==='interno' ? n('env-viaticos')+n('env-combustible') : n('env-flete');
    const el = document.getElementById('env-calc');
    if (el) el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <span style="color:var(--text3)">Costo total del envío</span>
      <span style="font-weight:800" class="text-amber">${UI.q(total)}</span></div>`;
  },

  async guardar(id='') {
    const desc = document.getElementById('env-desc')?.value.trim();
    if (!desc) { UI.toast('La descripción es obligatoria','error'); return; }
    const tipo = document.getElementById('env-tipo')?.value||'externo';
    const n = elId => parseFloat(document.getElementById(elId)?.value)||0;
    const viaticos = tipo==='interno' ? n('env-viaticos') : 0;
    const combustible = tipo==='interno' ? n('env-combustible') : 0;
    const flete = tipo==='interno' ? 0 : n('env-flete');
    const fields = {
      tipo, descripcion: desc,
      destinatario: document.getElementById('env-dest')?.value.trim()||null,
      orden_id: document.getElementById('env-ot')?.value||null,
      trabajo_externo_id: document.getElementById('env-te')?.value||null,
      empresa_transporte: tipo==='interno' ? null : (document.getElementById('env-empresa')?.value.trim()||null),
      medio: tipo==='interno' ? (document.getElementById('env-medio')?.value||null) : null,
      responsable: tipo==='interno' ? (document.getElementById('env-resp')?.value.trim()||null) : null,
      costo_flete: flete, viaticos, combustible, costo_total: flete+viaticos+combustible,
      numero_envio: tipo==='interno' ? null : (document.getElementById('env-num')?.value.trim()||null),
      num_factura: tipo==='interno' ? null : (document.getElementById('env-fact')?.value.trim()||null),
      fecha_envio: document.getElementById('env-fecha')?.value||null,
      fecha_entrega_estimada: document.getElementById('env-est')?.value||null,
      notas: document.getElementById('env-notas')?.value||null
    };
    if (id) fields.id = id;
    const { error } = await DB.upsertEnvio(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal();
    UI.toast(id?'Envío actualizado ✓':'Envío registrado ✓');
    this.render();
  },

  async marcar(id, estado) {
    const fields = { id, estado };
    if (estado==='entregado') fields.fecha_entrega_real = new Date().toISOString().slice(0,10);
    const { error } = await DB.upsertEnvio(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(estado==='cerrado'?'Envío cerrado ✓':estado==='entregado'?'Marcado como entregado ✓':'En tránsito ✓');
    this.render();
  },

  async archivar(id, archivar) {
    const { error } = await DB.upsertEnvio({ id, archivado: archivar });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(archivar?'Archivado al historial ✓':'Restaurado ✓');
    this.render();
  }
};
