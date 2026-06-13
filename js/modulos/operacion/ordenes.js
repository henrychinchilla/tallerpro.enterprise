/* TallerPro v3.0 — ordenes/index.js */
Modulos.ordenes = {
  _data:[], _vehiculos:[], _clientes:[], _mecanicos:[],
  _tab:'lista', _fotos:[],

  async render(filtros={}) {
    const el = document.getElementById('page-content');
    UI.loading(el);
    [this._data, this._vehiculos, this._clientes, this._mecanicos] = await Promise.all([
      DB.getOrdenes(filtros), DB.getVehiculos(), DB.getClientes(), DB.getEmpleados()
    ]);
    const activas   = this._data.filter(o=>!['entregado','cancelado'].includes(o.estado)).length;
    const pendFact  = this._data.filter(o=>o.estado==='listo').length;

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">📋 Órdenes de Trabajo</h1>
          <p class="page-subtitle">// ${this._data.length} total · ${activas} activas${pendFact>0?` · <span style="color:var(--amber)">${pendFact} pendiente facturar</span>`:''}</p>
        </div>
        <div class="page-actions">
          <input class="form-input" style="width:160px" id="ot-busca" placeholder="🔍 Buscar OT/placa..."
                 oninput="Modulos.ordenes._filtrarTabla(this.value)">
          <select class="form-select" style="width:130px" onchange="Modulos.ordenes.render({estado:this.value})">
            <option value="">Todos los estados</option>
            ${Object.entries(ESTADOS_OT).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}
          </select>
          <button class="btn btn-ghost" onclick="Modulos.ordenes._ir('kanban')" title="Kanban">⬛</button>
          <button class="btn btn-ghost" onclick="Modulos.ordenes._ir('lista')" title="Lista">☰</button>
          <button class="btn btn-ghost" onclick="window.print()">🖨️</button>
          <button class="btn btn-amber" onclick="Modulos.ordenes.modalForm()">＋ Nueva OT</button>
        </div>
      </div>
      <div class="page-body">
        ${this._tab==='kanban' ? this._renderKanban() : this._renderLista()}
      </div>`;
  },

  _ir(t){ this._tab=t; App._subActivo=t; App._guardarRuta(); App.renderSidebar(); this.render(); },

  _filtrarTabla(busca) {
    const rows = document.querySelectorAll('#ot-tbody tr');
    rows.forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(busca.toLowerCase()) ? '' : 'none';
    });
  },

  _renderLista() {
    return `<div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>OT</th><th>Vehículo</th><th>Cliente</th><th>Estado</th><th>Mecánico</th><th>Fecha</th><th>Total</th><th>Acciones</th></tr></thead>
        <tbody id="ot-tbody">
          ${this._data.map(o=>`<tr onclick="Modulos.ordenes.verDetalle('${o.id}')" style="cursor:pointer">
            <td class="mono-sm"><b style="color:var(--amber)">${o.num}</b></td>
            <td>${o.vehiculos?.placa||'—'}<br><small class="text-muted">${o.vehiculos?.marca||''} ${o.vehiculos?.modelo||''}</small></td>
            <td>${o.clientes?.nombre||'—'}</td>
            <td onclick="event.stopPropagation()">
              <select class="badge" style="border:none;background:transparent;cursor:pointer;font-size:11px;color:var(--text)"
                      onchange="Modulos.ordenes.cambiarEstado('${o.id}',this.value)">
                ${Object.entries(ESTADOS_OT).map(([k,v])=>`<option value="${k}" ${o.estado===k?'selected':''}>${v.label}</option>`).join('')}
              </select>
            </td>
            <td>${o.empleados?.nombre||'—'}</td>
            <td>${UI.fecha(o.fecha_ingreso)}</td>
            <td class="mono-sm text-amber">${UI.q(o.total)}</td>
            <td onclick="event.stopPropagation()">
              <div style="display:flex;gap:4px">
                <button class="btn btn-sm btn-cyan" onclick="Modulos.ordenes.verDetalle('${o.id}')" title="Ver">👁 Ver</button>
                <button class="btn btn-sm btn-ghost" onclick="Modulos.ordenes.compartirWA('${o.id}')" title="WhatsApp">💬</button>
                <button class="btn btn-sm btn-ghost" onclick="Modulos.ordenes.imprimirOT('${o.id}')" title="Imprimir">🖨️</button>
                <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();Modulos.ordenes.eliminarOT('${o.id}')" title="Eliminar">🗑️</button>
                ${o.estado==='listo'?`<button class="btn btn-sm btn-green" onclick="Modulos.ordenes.enviarFacturacion('${o.id}')">🧾 Facturar</button>`:''}
              </div>
            </td>
          </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin órdenes</td></tr>'}
        </tbody>
      </table>
    </div>`;
  },

  _renderKanban() {
    return `<div class="kanban-board" style="display:flex;gap:16px;overflow-x:auto;padding-bottom:16px">
      ${Object.entries(ESTADOS_OT).map(([est,info])=>{
        const ots = this._data.filter(o=>o.estado===est);
        return `<div class="kanban-col" style="min-width:220px;flex-shrink:0">
          <div style="font-weight:700;font-size:11px;color:var(--${info.color});margin-bottom:10px;letter-spacing:.05em;text-transform:uppercase">
            ${info.label} (${ots.length})
          </div>
          ${ots.map(o=>`<div class="card" style="margin-bottom:10px;cursor:pointer;border-left:3px solid var(--${info.color})"
              onclick="Modulos.ordenes.verDetalle('${o.id}')">
            <div class="mono-sm text-amber">${o.num}</div>
            <div style="font-size:12px;margin:4px 0">${o.vehiculos?.placa} · ${o.vehiculos?.marca}</div>
            <div style="font-size:11px;color:var(--text3)">${o.clientes?.nombre||''}</div>
            <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px">
              <span>${o.empleados?.nombre||'Sin asignar'}</span>
              <span class="text-amber">${UI.q(o.total)}</span>
            </div>
          </div>`).join('')}
        </div>`;
      }).join('')}
    </div>`;
  },

  async verDetalle(id) {
    const o = await DB.getOrden(id);
    if (!o) return;
    /* Cargar ítems */
    const { data: items } = await getSB().from('ot_items').select('*')
      .eq('orden_id', id).order('orden_pos');
    const itemsList = items || [];
    const trabajos = await DB.getTrabajosExternos(id);

    const est = ESTADOS_OT[o.estado] || { label:o.estado, color:'gray', pct:50 };
    let fotos = [];
    try { fotos = typeof o.fotos_recepcion==='string' ? JSON.parse(o.fotos_recepcion) : (o.fotos_recepcion||[]); } catch(e){}

    const totalItems = itemsList.reduce((s,i)=>s+(i.total||0),0);

    UI.modal(`📋 ${o.num} — Detalle Completo`, `
      <!-- HEADER -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-size:17px;font-weight:800">${o.vehiculos?.placa} · ${o.vehiculos?.marca} ${o.vehiculos?.modelo} ${o.vehiculos?.anio||''}</div>
          <div style="font-size:13px;color:var(--text2)">${o.clientes?.nombre||''} · ${o.clientes?.tel||''}</div>
          <div style="font-size:12px;color:var(--text3)">Mecánico: ${o.empleados?.nombre||'Sin asignar'}</div>
        </div>
        <div style="text-align:right">
          <select class="form-select" style="font-size:12px;padding:6px"
                  onchange="Modulos.ordenes._cambiarEstadoDetalle('${id}',this.value)">
            ${Object.entries(ESTADOS_OT).map(([k,v])=>`<option value="${k}" ${o.estado===k?'selected':''}>${v.label}</option>`).join('')}
          </select>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Ingreso: ${UI.fecha(o.fecha_ingreso)}</div>
        </div>
      </div>

      ${o.es_garantia?`<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">🛡️</div><div class="alert-body" style="font-size:12px">OT de <b>garantía</b>${o.garantia_responsable?` · Responsable: <b>${o.garantia_responsable==='taller'?'Taller — se declara como costo, no se factura':'Cliente — facturable'}</b>`:''}.</div></div>`:''}

      <!-- PROGRESO -->
      <div style="background:var(--surface2);border-radius:8px;height:8px;margin-bottom:16px;overflow:hidden">
        <div style="height:100%;width:${est.pct}%;background:var(--${est.color});border-radius:8px;transition:width .5s"></div>
      </div>

      <!-- DESCRIPCIÓN -->
      ${o.descripcion?`<div style="font-size:13px;color:var(--text2);margin-bottom:16px;padding:10px;background:var(--surface2);border-radius:8px">${o.descripcion}</div>`:''}

      <!-- ITEMS DE TRABAJO -->
      <div style="border-top:1px solid var(--border);padding-top:14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-weight:800;font-size:12px;color:var(--amber);text-transform:uppercase;letter-spacing:.08em">
            🔧 Trabajos / Repuestos / Mano de Obra
          </div>
          <button class="btn btn-amber btn-sm" onclick="Modulos.ordenes.modalAddItem('${id}')">＋ Agregar</button>
        </div>
        <div id="items-list">
          ${itemsList.length ? itemsList.map(item=>`
            <div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border);font-size:12px"
                 id="item-${item.id}">
              <input type="checkbox" ${item.ejecutado?'checked':''}
                     onchange="Modulos.ordenes.toggleEjecutado('${item.id}',this.checked,'${id}')"
                     title="Marcar como ejecutado"
                     style="accent-color:var(--green);width:16px;height:16px;flex-shrink:0">
              <div style="flex:1">
                <div style="font-weight:600;${item.ejecutado?'text-decoration:line-through;color:var(--text3)':''}">${item.descripcion}</div>
                <div style="color:var(--text3);font-size:11px">${item.tipo} · Cant: ${item.cantidad} · Unit: ${UI.q(item.precio_unit)}</div>
                ${item.es_extra?`<span style="font-size:10px;background:var(--amber-dim);color:var(--amber);padding:1px 6px;border-radius:4px">Extra</span>`:''}
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-weight:700;color:var(--amber)">${UI.q(item.total)}</div>
                ${item.es_extra?`
                <label style="font-size:10px;display:flex;align-items:center;gap:4px;color:var(--text3);cursor:pointer">
                  <input type="checkbox" ${item.autorizado?'checked':''} style="accent-color:var(--cyan)"
                         onchange="Modulos.ordenes.toggleAutorizado('${item.id}',this.checked,'${id}')">
                  Cliente autoriza
                </label>`:''}
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0">
                <button class="btn btn-sm btn-cyan" onclick="Modulos.ordenes.modalAddItem('${id}','${item.id}')" title="Editar ítem">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="Modulos.ordenes.eliminarItem('${item.id}','${id}')" title="Eliminar ítem">🗑️</button>
              </div>
            </div>`).join('') : '<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px">Sin ítems — Agrega trabajos, repuestos o mano de obra</div>'}
        </div>

        <!-- TOTALES -->
        ${itemsList.length?`
        <div style="padding:10px 8px;border-top:2px solid var(--border);margin-top:4px">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span class="text-muted">Subtotal ítems:</span>
            <span>${UI.q(totalItems)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800">
            <span>Total OT:</span>
            <span class="text-amber">${UI.q(o.total||totalItems)}</span>
          </div>
        </div>`:''}
      </div>

      ${this._renderTrabajosExternos(trabajos, id)}

      <!-- DOCUMENTOS FIRMADOS -->
      <div style="border-top:1px solid var(--border);padding-top:14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-weight:800;font-size:12px;color:var(--green);text-transform:uppercase;letter-spacing:.08em">📄 Documentos firmados</div>
          <button class="btn btn-sm btn-green" onclick="Modulos.ordenes.firmarEntrega('${id}')">✍️ Firmar entrega</button>
        </div>
        <div id="ot-docs"></div>
      </div>

      <!-- FOTOS -->
      ${fotos.length?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        ${fotos.map(f=>`<img src="${f}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`).join('')}
      </div>`:''}

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        <button class="btn btn-ghost" onclick="Modulos.ordenes.compartirWA('${id}')">💬 WhatsApp</button>
        <button class="btn btn-ghost" onclick="Modulos.ordenes.avisarEmail('${id}')">📧 Avisar por email</button>
        <button class="btn btn-ghost" onclick="Modulos.ordenes.imprimirOT('${id}')">🖨 Imprimir</button>
        <button class="btn btn-cyan" onclick="UI.cerrarModal();Modulos.ordenes.modalForm('${id}')">✏️ Editar</button>
        ${!o.es_garantia?`<button class="btn btn-ghost" onclick="Modulos.ordenes.modalGarantia('${id}')">🛡️ Garantía</button>`:''}
        ${o.es_garantia && o.garantia_responsable==='taller'
          ? (o.estado!=='entregado' ? `<button class="btn btn-amber" onclick="Modulos.ordenes.cerrarGarantiaCosto('${id}')">🛡️ Cerrar como costo del taller</button>` : '')
          : (o.estado==='listo' ? `<button class="btn btn-green" onclick="Modulos.ordenes.enviarFacturacion('${id}')">🧾 Enviar a Facturación</button>` : '')}
      </div>`,'720px');
    Docs.render('orden', id, 'ot-docs');
  },

  /* Firma de entrega del vehículo (cliente + taller) → PDF en historial */
  async firmarEntrega(id) {
    const o = await DB.getOrden(id);
    if (!o) return;
    const { data: items } = await getSB().from('ot_items').select('*').eq('orden_id', id).order('orden_pos');
    const doc = await Docs.firmarYGuardar({
      entidad:'orden', entidadId:id, tipo:'entrega', titulo:`Entrega OT ${o.num||''}`,
      firmantes:[ {key:'cliente',label:'Cliente', nombre:o.clientes?.nombre||''}, {key:'taller',label:'Por el taller', nombre:Auth.user?.nombre||''} ],
      def:{ titulo:`Entrega de vehículo — OT ${o.num||''}`,
        subtitulo:`${o.vehiculos?.placa||''} ${o.vehiculos?.marca||''} ${o.vehiculos?.modelo||''} ${o.vehiculos?.anio||''}`,
        lineas:[{label:'Cliente',value:o.clientes?.nombre||'—'},{label:'NIT',value:o.clientes?.nit||'CF'},{label:'Total',value:UI.q(o.total)},{label:'Fecha',value:new Date().toLocaleString('es-GT')}],
        tabla:{ head:['Trabajo','Cant','Total'], rows:(items||[]).map(i=>[i.descripcion, String(i.cantidad), UI.q(i.total)]) },
        nota:'El cliente recibe conforme el vehículo y los trabajos detallados.' }
    });
    if (doc) this.verDetalle(id);
  },

  /* ── ITEMS ────────────────────────────────── */
  async modalAddItem(ordenId, itemId = null) {
    this._inventario = await DB.getInventario();
    const esEdicion = !!itemId;
    let item = {};
    if (esEdicion) {
      const { data, error } = await getSB().from('ot_items').select('*').eq('id', itemId).single();
      if (error) { UI.toast('Error al cargar ítem: ' + error.message, 'error'); return; }
      item = data || {};
    }

    const calc = `
      const c = parseFloat(document.getElementById('item-cant').value) || 1;
      const p = parseFloat(document.getElementById('item-precio').value) || 0;
      document.getElementById('item-total').value = (c * p).toFixed(2);
    `;

    UI.modal(`${esEdicion ? '✏️ Editar' : '＋ Agregar'} Ítem a OT`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo *</label>
          <select class="form-select" id="item-tipo" onchange="Modulos.ordenes._onTipoItem()">
            <option value="servicio" ${item.tipo === 'servicio' ? 'selected' : ''}>🔧 Servicio</option>
            <option value="repuesto" ${item.tipo === 'repuesto' ? 'selected' : ''}>📦 Repuesto</option>
            <option value="mano_obra" ${item.tipo === 'mano_obra' ? 'selected' : ''}>👷 Mano de Obra</option>
            <option value="diagnostico" ${item.tipo === 'diagnostico' ? 'selected' : ''}>🔍 Diagnóstico</option>
            <option value="otro" ${item.tipo === 'otro' ? 'selected' : ''}>📝 Otro</option>
          </select></div>
        <div class="form-group"><label class="form-label">¿Es trabajo extra?</label>
          <label style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--surface2);border-radius:8px;cursor:pointer;height:40px">
            <input type="checkbox" id="item-extra" ${item.es_extra ? 'checked' : ''} style="accent-color:var(--amber)">
            <span style="font-size:13px">Trabajo extra no presupuestado</span>
          </label></div>
      </div>
      <div class="form-group" id="item-inv-row" style="${item.tipo === 'repuesto' ? '' : 'display:none'}">
        <label class="form-label">Artículo de inventario (descuenta stock al facturar)</label>
        <select class="form-select" id="item-inv" onchange="Modulos.ordenes._onPickInventario()">
          <option value="">— Repuesto libre (no afecta inventario) —</option>
          ${this._inventario.map(a=>`<option value="${a.id}" ${item.inventario_id === a.id ? 'selected' : ''} data-precio="${a.precio_venta||0}" data-nombre="${(a.nombre||'').replace(/"/g,'&quot;')}">${a.nombre} — stock: ${a.stock} ${a.unidad||''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Descripción *</label>
        <input class="form-input" id="item-desc" value="${(item.descripcion || '').replace(/"/g, '&quot;')}" placeholder="Cambio de filtro de aceite, revisión de frenos..."></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cantidad</label>
          <input class="form-input" id="item-cant" type="number" value="${item.cantidad !== undefined ? item.cantidad : '1'}" min="0.01" step="0.01"
                 oninput="${calc}"></div>
        <div class="form-group"><label class="form-label">Precio Unitario (Q)</label>
          <input class="form-input" id="item-precio" type="number" min="0" step="0.01" value="${item.precio_unit !== undefined ? item.precio_unit : ''}" placeholder="0.00"
                 oninput="${calc}"></div>
      </div>
      <div class="form-group"><label class="form-label">Total (Q)</label>
        <input class="form-input" id="item-total" type="number" min="0" step="0.01" value="${item.total !== undefined ? item.total : ''}" placeholder="0.00"
               style="font-size:16px;font-weight:700;color:var(--amber)"></div>
      <div id="item-autorizar-row" style="${item.es_extra ? '' : 'display:none'}">
        <label style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--amber-dim);border-radius:8px;cursor:pointer;border:1px solid var(--amber-border)">
          <input type="checkbox" id="item-autorizado" ${item.autorizado !== false ? 'checked' : ''} style="accent-color:var(--cyan)">
          <span style="font-size:12px"><b>Cliente autoriza</b> este trabajo extra</span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="Modulos.ordenes.verDetalle('${ordenId}')">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.ordenes.guardarItem('${ordenId}', ${esEdicion ? `'${itemId}'` : 'null'})">${esEdicion ? 'Guardar Cambios' : 'Agregar Ítem'}</button>
      </div>`);

    document.getElementById('item-extra')?.addEventListener('change', function() {
      document.getElementById('item-autorizar-row').style.display = this.checked ? 'block' : 'none';
    });
  },

  /* Muestra el selector de inventario solo cuando el ítem es un repuesto */
  _onTipoItem() {
    const tipo = document.getElementById('item-tipo')?.value;
    const row = document.getElementById('item-inv-row');
    if (row) row.style.display = tipo === 'repuesto' ? 'block' : 'none';
  },

  /* Al elegir un artículo de inventario, autocompleta descripción y precio */
  _onPickInventario() {
    const sel = document.getElementById('item-inv');
    const opt = sel?.options[sel.selectedIndex];
    if (!opt || !sel.value) return;
    const desc   = document.getElementById('item-desc');
    const precio = document.getElementById('item-precio');
    const cant   = document.getElementById('item-cant');
    const total  = document.getElementById('item-total');
    if (desc && !desc.value.trim()) desc.value = opt.dataset.nombre || '';
    if (precio) {
      precio.value = opt.dataset.precio || '0';
      const c = parseFloat(cant?.value) || 1;
      if (total) total.value = (c * (parseFloat(precio.value) || 0)).toFixed(2);
    }
  },

  async guardarItem(ordenId, itemId = null) {
    const desc  = document.getElementById('item-desc')?.value.trim();
    const total = parseFloat(document.getElementById('item-total')?.value)||0;
    if (!desc) { UI.toast('La descripción es obligatoria','error'); return; }

    const cant    = parseFloat(document.getElementById('item-cant')?.value)||1;
    const precio  = parseFloat(document.getElementById('item-precio')?.value)||0;
    const esExtra = document.getElementById('item-extra')?.checked||false;

    const esRepuesto = document.getElementById('item-tipo')?.value === 'repuesto';
    const invId = esRepuesto ? (document.getElementById('item-inv')?.value || null) : null;
    
    const payload = {
      tenant_id:   getTID(),
      orden_id:    ordenId,
      tipo:        document.getElementById('item-tipo')?.value||'servicio',
      descripcion: desc,
      cantidad:    cant,
      precio_unit: precio,
      total:       total||cant*precio,
      inventario_id: invId,
      es_extra:    esExtra,
      autorizado:  esExtra ? (document.getElementById('item-autorizado')?.checked||false) : true
    };

    if (itemId) {
      const { error } = await getSB().from('ot_items').update(payload).eq('id', itemId);
      if (error) { UI.toast('Error: '+error.message,'error'); return; }
    } else {
      const { error } = await getSB().from('ot_items').insert({ ...payload, ejecutado: false });
      if (error) { UI.toast('Error: '+error.message,'error'); return; }
    }

    /* Actualizar total de la OT */
    const { data: allItems } = await getSB().from('ot_items').select('total')
      .eq('orden_id', ordenId);
    const nuevoTotal = (allItems||[]).reduce((s,i)=>s+(i.total||0),0);
    await getSB().from('ordenes').update({ total:nuevoTotal, updated_at:new Date().toISOString() }).eq('id',ordenId);

    UI.cerrarModal();
    this.verDetalle(ordenId);
  },

  async toggleEjecutado(itemId, checked, ordenId) {
    await getSB().from('ot_items').update({ ejecutado: checked }).eq('id', itemId);
  },

  async toggleAutorizado(itemId, checked, ordenId) {
    await getSB().from('ot_items').update({ autorizado: checked }).eq('id', itemId);
  },

  async eliminarItem(itemId, ordenId) {
    await getSB().from('ot_items').delete().eq('id', itemId);
    const { data: allItems } = await getSB().from('ot_items').select('total').eq('orden_id', ordenId);
    const nuevoTotal = (allItems||[]).reduce((s,i)=>s+(i.total||0),0);
    await getSB().from('ordenes').update({ total:nuevoTotal }).eq('id',ordenId);
    this.verDetalle(ordenId);
  },

  async _cambiarEstadoDetalle(id, estado) {
    await DB.updateEstadoOT(id, estado);
    UI.toast('Estado actualizado ✓');
    UI.cerrarModal();
    this.render();
  },

  /* ── TRABAJOS EXTERNOS (torno, subcontratos) ───────── */
  _renderTrabajosExternos(trabajos, ordenId) {
    const estInfo = {
      pendiente:   ['amber','⏳ Pendiente autorización'],
      autorizado:  ['green','✓ Autorizado'],
      rechazado:   ['red','✗ Rechazado por el cliente'],
      en_proceso:  ['cyan','🔧 En proceso'],
      completado:  ['green','✓ Completado'],
    };
    return `
      <div style="border-top:1px solid var(--border);padding-top:14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-weight:800;font-size:12px;color:var(--cyan);text-transform:uppercase;letter-spacing:.08em">
            🛠️ Trabajos externos / subcontratos
          </div>
          <button class="btn btn-cyan btn-sm" onclick="Modulos.ordenes.modalTrabajoExterno('${ordenId}')">＋ Agregar</button>
        </div>
        ${trabajos.length ? trabajos.map(t=>{
          const [col,lbl] = estInfo[t.estado] || ['gray',t.estado];
          const base = (Number(t.costo_servicio)||0)+(Number(t.costo_envio)||0);
          return `<div style="padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;font-size:12px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div style="flex:1">
                <div style="font-weight:700">${t.descripcion}${t.proveedor?` <span class="text-muted">· ${t.proveedor}</span>`:''}</div>
                <div style="color:var(--text3);margin-top:2px">
                  Costo: ${UI.q(base)} ${t.comision_monto>0?`· Comisión: ${UI.q(t.comision_monto)} (${t.comision_pct||0}%)`:''} · <b class="text-amber">Total cliente: ${UI.q(t.total_cliente)}</b>
                </div>
                ${t.respuesta?`<div style="color:var(--text3);margin-top:2px">🗣️ ${t.respuesta}${t.respondido_at?` · ${UI.fecha(t.respondido_at.slice(0,10))}`:''}</div>`:''}
                ${t.notificado_at?`<div style="color:var(--text3);font-size:11px">📤 Notificado ${UI.fechaHora(t.notificado_at)}</div>`:''}
                ${t.cargado_ot?'<div style="color:var(--green);font-size:11px">🧾 Cargado a la OT</div>':''}
              </div>
              <span class="badge badge-${col}">${lbl}</span>
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px">
              ${t.estado==='pendiente' && t.requiere_autorizacion ? `<button class="btn btn-sm btn-ghost" onclick="Modulos.ordenes.notificarTrabajoExterno('${ordenId}','${t.id}')" title="Notificar al cliente">📤 Notificar</button>`:''}
              ${(t.estado==='pendiente') ? `
                <button class="btn btn-sm btn-green" onclick="Modulos.ordenes.responderTrabajoExterno('${ordenId}','${t.id}',true)">✓ Cliente autorizó</button>
                <button class="btn btn-sm btn-danger" onclick="Modulos.ordenes.responderTrabajoExterno('${ordenId}','${t.id}',false)">✗ Cliente rechazó</button>`:''}
              ${(['autorizado','en_proceso','completado'].includes(t.estado) && !t.cargado_ot) ? `<button class="btn btn-sm btn-amber" onclick="Modulos.ordenes.cargarTrabajoAOT('${ordenId}','${t.id}')" title="Agregar el costo a la OT/factura">🧾 Cargar a OT</button>`:''}
              ${t.estado!=='rechazado' ? `<button class="btn btn-sm btn-ghost" onclick="Modulos.ordenes.envioDeTrabajo('${ordenId}','${t.id}')" title="Registrar envío al proveedor">🚚 Envío</button>`:''}
              <button class="btn btn-sm btn-ghost" onclick="Modulos.ordenes.modalTrabajoExterno('${ordenId}','${t.id}')" title="Editar">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="Modulos.eliminarRegistro('trabajos_externos','${t.id}','${(t.descripcion||'').replace(/'/g,"\\'")}',()=>Modulos.ordenes.verDetalle('${ordenId}'))" title="Eliminar">🗑️</button>
            </div>
          </div>`;
        }).join('') : '<div style="padding:10px;text-align:center;color:var(--text3);font-size:12px">Sin trabajos externos. Úsalo para enviar piezas al torno, subcontratar trabajos, etc.</div>'}
      </div>`;
  },

  modalTrabajoExterno(ordenId, id='') {
    const cargar = async () => {
      const te = id ? (await DB.getTrabajosExternos(ordenId)).find(x=>x.id===id) || {} : {};
      const calc = `Modulos.ordenes._calcTE()`;
      UI.modal(`${id?'✏️ Editar':'＋'} Trabajo externo`, `
        <div class="form-group"><label class="form-label">Descripción *</label>
          <input class="form-input" id="te-desc" value="${(te.descripcion||'').replace(/"/g,'&quot;')}" placeholder="Enviar discos de freno al torno"></div>
        <div class="form-group"><label class="form-label">Proveedor / taller externo</label>
          <input class="form-input" id="te-prov" value="${(te.proveedor||'').replace(/"/g,'&quot;')}" placeholder="Torno El Progreso"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Costo del servicio (Q)</label>
            <input class="form-input" id="te-cs" type="number" min="0" step="0.01" value="${te.costo_servicio||0}" oninput="${calc}"></div>
          <div class="form-group"><label class="form-label">Costo de envío (Q)</label>
            <input class="form-input" id="te-ce" type="number" min="0" step="0.01" value="${te.costo_envio||0}" oninput="${calc}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Comisión del taller (%)</label>
            <input class="form-input" id="te-pct" type="number" min="0" step="0.5" value="${te.comision_pct!=null?te.comision_pct:10}" oninput="${calc}"></div>
          <div class="form-group"><label class="form-label">Canal de notificación</label>
            <select class="form-select" id="te-canal">
              ${['whatsapp','email','ambos','ninguno'].map(c=>`<option value="${c}" ${te.canal===c?'selected':''}>${c==='whatsapp'?'WhatsApp':c==='email'?'Correo':c==='ambos'?'WhatsApp + Correo':'No notificar'}</option>`).join('')}
            </select></div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--amber-dim);border-radius:8px;cursor:pointer;border:1px solid var(--amber-border)">
          <input type="checkbox" id="te-req" ${te.requiere_autorizacion!==false?'checked':''} style="accent-color:var(--amber)">
          <span style="font-size:12px"><b>Requiere autorización del cliente</b> antes de ejecutar</span>
        </label>
        <div id="te-calc" class="card" style="background:var(--surface2);font-size:12px;margin-top:12px"></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
          <button class="btn btn-cyan" onclick="Modulos.ordenes.guardarTrabajoExterno('${ordenId}','${id}')">${id?'Guardar':'Agregar'}</button>
        </div>`, '560px');
      this._calcTE();
    };
    cargar();
  },

  _calcTE() {
    const n = id => parseFloat(document.getElementById(id)?.value)||0;
    const base = n('te-cs')+n('te-ce');
    const pct = n('te-pct');
    const comision = Math.round(base*pct/100*100)/100;
    const total = base+comision;
    const el = document.getElementById('te-calc');
    if (el) el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
      <div><div style="color:var(--text2);font-weight:700">${UI.q(base)}</div><div style="font-size:10px;color:var(--text3)">Costo externo</div></div>
      <div><div style="color:var(--cyan);font-weight:700">${UI.q(comision)}</div><div style="font-size:10px;color:var(--text3)">Comisión</div></div>
      <div><div style="color:var(--amber);font-weight:800">${UI.q(total)}</div><div style="font-size:10px;color:var(--text3)">Total al cliente</div></div>
    </div>`;
  },

  async guardarTrabajoExterno(ordenId, id='') {
    const desc = document.getElementById('te-desc')?.value.trim();
    if (!desc) { UI.toast('La descripción es obligatoria','error'); return; }
    const cs = parseFloat(document.getElementById('te-cs')?.value)||0;
    const ce = parseFloat(document.getElementById('te-ce')?.value)||0;
    const pct = parseFloat(document.getElementById('te-pct')?.value)||0;
    const base = cs+ce;
    const comision = Math.round(base*pct/100*100)/100;
    const requiere = document.getElementById('te-req')?.checked ?? true;
    const fields = {
      orden_id: ordenId, descripcion: desc,
      proveedor: document.getElementById('te-prov')?.value.trim()||null,
      costo_servicio: cs, costo_envio: ce, comision_pct: pct,
      comision_monto: comision, total_cliente: base+comision,
      requiere_autorizacion: requiere,
      canal: document.getElementById('te-canal')?.value||'whatsapp'
    };
    if (id) fields.id = id; else fields.estado = requiere ? 'pendiente' : 'autorizado';
    const { error } = await DB.upsertTrabajoExterno(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal();
    UI.toast(id?'Trabajo externo actualizado ✓':'Trabajo externo agregado ✓');
    this.verDetalle(ordenId);
  },

  /* Notifica al cliente para pedir su visto bueno (WhatsApp y/o correo) */
  async notificarTrabajoExterno(ordenId, teId) {
    const [o, lista] = await Promise.all([DB.getOrden(ordenId), DB.getTrabajosExternos(ordenId)]);
    const te = lista.find(x=>x.id===teId);
    if (!te || !o) return;
    const cli = o.clientes || {};
    const taller = Auth.tenant?.name || 'el taller';
    const canal = te.canal || 'whatsapp';
    const texto =
      `🔧 *${taller}*\nHola ${cli.nombre||''}, en su vehículo ${o.vehiculos?.placa||''} (${o.num||''}) `+
      `detectamos un trabajo adicional:\n\n*${te.descripcion}*${te.proveedor?` — ${te.proveedor}`:''}\n`+
      `Costo total con gestión: *${UI.q(te.total_cliente)}*\n\n¿Autoriza que lo realicemos? Responda *SÍ* o *NO*. ¡Gracias!`;
    let hizo = false;
    if ((canal==='email'||canal==='ambos') && cli.email) {
      const html = `<div style="font-family:Arial,sans-serif;max-width:520px">`+
        `<h2 style="color:#0891b2">🔧 ${taller}</h2>`+
        `<p>Hola ${cli.nombre||''}, en su vehículo <b>${o.vehiculos?.placa||''}</b> (${o.num||''}) detectamos un trabajo adicional:</p>`+
        `<p style="font-size:15px"><b>${te.descripcion}</b>${te.proveedor?` — ${te.proveedor}`:''}</p>`+
        `<p>Costo total con gestión: <b>${UI.q(te.total_cliente)}</b></p>`+
        `<p>¿Autoriza que lo realicemos? Por favor responda a este correo con <b>SÍ</b> o <b>NO</b>.</p></div>`;
      Email.enviar(cli.email, `${taller} — Autorización de trabajo (${o.num||''})`, { html, referencia_id:o.id });
      hizo = true;
    }
    if (canal==='whatsapp'||canal==='ambos') {
      const tel = (cli.tel||'').replace(/[^0-9]/g,'');
      window.open(`https://wa.me/${tel?'502'+tel:''}?text=${encodeURIComponent(texto)}`,'_blank');
      hizo = true;
    }
    if (!hizo) { UI.toast('El cliente no tiene el medio de contacto seleccionado','error'); return; }
    await DB.upsertTrabajoExterno({ id:teId, notificado_at:new Date().toISOString() });
    UI.toast('Cliente notificado ✓ — registra su respuesta cuando conteste');
    this.verDetalle(ordenId);
  },

  /* Registra la respuesta del cliente (autoriza / rechaza) */
  async responderTrabajoExterno(ordenId, teId, autoriza) {
    const fields = {
      id: teId,
      estado: autoriza ? 'autorizado' : 'rechazado',
      respuesta: autoriza ? 'El cliente autorizó el trabajo' : 'El cliente rechazó el trabajo (no se ejecuta)',
      respondido_at: new Date().toISOString()
    };
    const { error } = await DB.upsertTrabajoExterno(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(autoriza ? 'Autorización registrada ✓' : 'Rechazo documentado ✓ — sin nuevas acciones');
    this.verDetalle(ordenId);
  },

  /* Abre el registro de envío al proveedor pre-llenado desde el trabajo externo */
  async envioDeTrabajo(ordenId, teId) {
    const te = (await DB.getTrabajosExternos(ordenId)).find(x=>x.id===teId);
    if (!te || !Modulos.envios) { UI.toast('Módulo de envíos no disponible','error'); return; }
    Modulos.envios.modalForm('', {
      tipo: 'proveedor',
      descripcion: `Envío a proveedor: ${te.descripcion}`,
      destinatario: te.proveedor || '',
      orden_id: ordenId,
      trabajo_externo_id: teId
    });
  },

  /* Vuelca el costo (servicio + envío + comisión) a la OT como ítems → factura */
  async cargarTrabajoAOT(ordenId, teId) {
    const te = (await DB.getTrabajosExternos(ordenId)).find(x=>x.id===teId);
    if (!te) return;
    if (te.estado==='rechazado') { UI.toast('Este trabajo fue rechazado por el cliente','error'); return; }
    if (te.cargado_ot) { UI.toast('Ya fue cargado a la OT','info'); return; }
    const base = (Number(te.costo_servicio)||0)+(Number(te.costo_envio)||0);
    const rows = [{
      tenant_id: getTID(), orden_id: ordenId, tipo: 'servicio',
      descripcion: `Trabajo externo: ${te.descripcion}${te.proveedor?` (${te.proveedor})`:''}`,
      cantidad: 1, precio_unit: base, total: base,
      ejecutado: false, es_extra: true, autorizado: te.estado!=='pendiente'
    }];
    if ((Number(te.comision_monto)||0) > 0) {
      rows.push({
        tenant_id: getTID(), orden_id: ordenId, tipo: 'otro',
        descripcion: `Comisión por gestión (${te.descripcion})`,
        cantidad: 1, precio_unit: te.comision_monto, total: te.comision_monto,
        ejecutado: false, es_extra: true, autorizado: te.estado!=='pendiente'
      });
    }
    const { error } = await getSB().from('ot_items').insert(rows);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    const { data: allItems } = await getSB().from('ot_items').select('total').eq('orden_id', ordenId);
    const total = (allItems||[]).reduce((s,i)=>s+(i.total||0),0);
    await getSB().from('ordenes').update({ total, updated_at:new Date().toISOString() }).eq('id', ordenId);
    await DB.upsertTrabajoExterno({ id:teId, cargado_ot:true, estado: te.estado==='autorizado'?'completado':te.estado });
    UI.toast('Trabajo externo cargado a la OT ✓');
    this.verDetalle(ordenId);
  },

  /* ── GARANTÍA ─────────────────────────────── */
  /* El cliente regresa el vehículo inconforme → nueva OT de garantía
     ligada a la original. Si es responsabilidad del taller, la mano de
     obra y repuestos se declaran como COSTO (no se facturan); si no,
     o si hay costos adicionales, se factura normalmente. */
  modalGarantia(otOrigenId) {
    UI.modal('🛡️ Registrar garantía', `
      <div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">ℹ️</div>
        <div class="alert-body" style="font-size:11px">Se creará una nueva OT de <b>garantía</b> para este vehículo, ligada a la OT original, para registrar la revisión por inconformidad.</div></div>
      <div class="form-group"><label class="form-label">¿De quién es la responsabilidad? *</label>
        <select class="form-select" id="gar-resp">
          <option value="taller">Del taller (nuestra responsabilidad → se declara como costo, NO se factura)</option>
          <option value="cliente">Del cliente / no cubierta por garantía (se factura)</option>
        </select></div>
      <div class="form-group"><label class="form-label">Motivo / inconformidad</label>
        <textarea class="form-input" id="gar-motivo" rows="2" placeholder="Ej: ruido persiste tras cambio de balatas"></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.ordenes.registrarGarantia('${otOrigenId}')">Crear OT de garantía</button>
      </div>`);
  },

  async registrarGarantia(otOrigenId) {
    const o = await DB.getOrden(otOrigenId);
    if (!o) return;
    const resp = document.getElementById('gar-resp')?.value || 'taller';
    const motivo = document.getElementById('gar-motivo')?.value.trim() || 'revisión por inconformidad';
    const res = await DB.upsertOrden({
      vehiculo_id: o.vehiculo_id, cliente_id: o.cliente_id, mecanico_id: o.mecanico_id || null,
      descripcion: `Garantía de ${o.num}: ${motivo}`,
      estado: 'garantia', prioridad: 'alta',
      es_garantia: true, ot_origen_id: otOrigenId, garantia_responsable: resp, total: 0
    });
    if (res.error || !res.data) { UI.toast('Error: '+(res.error?.message||''),'error'); return; }
    await getSB().from('ot_items').insert({
      tenant_id: getTID(), orden_id: res.data.id, tipo: 'mano_obra',
      descripcion: 'Mano de obra (garantía)', cantidad: 1, precio_unit: 0, total: 0,
      ejecutado: false, es_extra: false, autorizado: true, orden_pos: 0
    });
    UI.cerrarModal();
    UI.toast(`OT de garantía ${res.data.num} creada ✓`);
    this.verDetalle(res.data.id);
  },

  /* Cierra la garantía como costo del taller: descuenta inventario,
     registra el gasto (no factura) y marca la OT entregada. */
  async cerrarGarantiaCosto(id) {
    const o = await DB.getOrden(id);
    if (!o) return;
    const { data: items } = await getSB().from('ot_items').select('*').eq('orden_id', id);
    const itemsList = items || [];
    const total = itemsList.reduce((s,i)=>s+(i.total||0),0) || Number(o.total) || 0;
    const ok = await UI.confirmar(
      `Cerrar la garantía <b>${o.num}</b> como <b>costo del taller</b> por <b>${UI.q(total)}</b>.<br>Se descontará el inventario usado y se registrará el gasto (no se factura al cliente). ¿Continuar?`,
      'Cerrar garantía'
    );
    if (!ok) return;
    const descontados = await DB.descontarInventarioVenta(itemsList, `Garantía ${o.num}`);
    if (total > 0) {
      await DB.upsertEgreso({
        concepto: `Garantía ${o.num} — costo del taller`, categoria: 'Garantías',
        monto: total, fecha: new Date().toISOString().slice(0,10), referencia: `GAR-${o.num}`,
        notas: o.descripcion || null
      });
    }
    await DB.updateEstadoOT(id, 'entregado');
    UI.cerrarModal();
    UI.toast(`Garantía cerrada como costo ✓${descontados?` · ${descontados} repuesto(s) descontado(s)`:''}`);
    this.render();
  },

  /* ── FACTURACIÓN ──────────────────────────── */
  async enviarFacturacion(id) {
    const o = await DB.getOrden(id);
    if (!o) return;

    if (o.estado !== 'listo') {
      UI.toast('La OT debe estar en estado "Listo" para facturar','error');
      return;
    }

    /* Evitar doble facturación (y doble descuento de inventario) */
    const yaFact = await DB.facturaDeOrden(id);
    if (yaFact) { UI.toast(`Esta OT ya fue facturada (${yaFact.num||'—'})`,'error'); return; }

    /* Cargar ítems */
    const { data: items } = await getSB().from('ot_items').select('*').eq('orden_id', id);
    const itemsList = items || [];

    /* Verificar que todos los extras estén autorizados */
    const noAutorizados = itemsList.filter(i=>i.es_extra && !i.autorizado);
    if (noAutorizados.length > 0) {
      const ok = await UI.confirmar(
        `Hay <b>${noAutorizados.length} trabajo(s) extra sin autorización del cliente</b>.<br>¿Continuar de todas formas?`,
        'Continuar'
      );
      if (!ok) return;
    }

    /* Crear descripción para factura */
    const descripcionFEL = itemsList.map(i=>
      `${i.descripcion} (${i.cantidad} x ${UI.q(i.precio_unit)})`
    ).join(' | ');

    const total   = itemsList.reduce((s,i)=>s+(i.total||0), 0) || o.total;
    const subtotal = Math.round(total/1.12*100)/100;
    const iva      = Math.round((total-subtotal)*100)/100;

    /* Crear factura (num/nit los completa DB.upsertFactura) */
    const cli = o.clientes || {};
    const { data: factura, error } = await DB.upsertFactura({
      cliente_id: o.cliente_id,
      ot_id:      id,
      nit:        cli.nit?.trim() || 'CF',
      nombre_receptor: cli.nombre || 'Consumidor Final',
      tipo_cliente: (cli.nit && cli.nit.toUpperCase()!=='CF') ? 'NIT' : 'CF',
      subtotal,
      iva,
      total,
      estado:     'pendiente',
      fecha:      new Date().toISOString().slice(0,10),
      descripcion: descripcionFEL.slice(0,500)
    });

    if (error || !factura) { UI.toast('Error al crear factura: '+(error?.message||'desconocido'),'error'); return; }

    /* Desglose de la factura + descuento de inventario de los repuestos */
    const nro = `Factura ${factura.num||factura.id.slice(0,8)}`;
    await DB.insertFacturaItems(factura.id, itemsList.map(i=>({
      descripcion: i.descripcion, cantidad: i.cantidad,
      precio_unit: i.precio_unit, total: i.total, inventario_id: i.inventario_id || null
    })));
    const descontados = await DB.descontarInventarioVenta(itemsList, nro);

    /* Fidelización: acumula según la política del taller */
    if (cli?.programa_puntos) {
      const pts = Math.floor((Number(total) || 0) * (Number(fidelizacionCfg().puntos_por_q)||0));
      if (pts > 0) await DB.registrarPuntos(o.cliente_id, pts, { tipo:'gana', motivo:'OT facturada', referencia:factura.num, factura_id:factura.id });
    }

    /* Cambiar estado OT a entregado */
    await DB.updateEstadoOT(id, 'entregado');

    UI.cerrarModal();
    UI.toast(`OT enviada a Facturación ✓ — Factura creada${descontados?` · ${descontados} repuesto(s) descontado(s)`:''}`);
    App.navegarA('facturacion');
  },

  /* ── COMPARTIR WA ─────────────────────────── */
  async compartirWA(id) {
    const o = this._data.find(x=>x.id===id) || await DB.getOrden(id);
    if (!o) return;
    const tel   = o.clientes?.tel?.replace(/[^0-9]/g,'') || '';
    const est   = ESTADOS_OT[o.estado];
    const msg   = `🔧 *TallerPro — ${Auth.tenant?.name}*\n\n`+
      `Estimado(a) *${o.clientes?.nombre||'cliente'}*,\n\n`+
      `Su vehículo *${o.vehiculos?.placa} ${o.vehiculos?.marca} ${o.vehiculos?.modelo}* `+
      `se encuentra en estado: *${est?.label||o.estado}*\n\n`+
      `OT: ${o.num}\n`+
      (o.fecha_estimada?`Entrega estimada: ${UI.fecha(o.fecha_estimada)}\n`:'')+
      `Total estimado: *${UI.q(o.total)}*\n\n`+
      `¡Gracias por confiar en nosotros! 🙏\n`+
      `Tel: ${Auth.tenant?.tel||''}`;

    if (tel) {
      window.open(`https://wa.me/502${tel}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
  },

  /* ── AVISAR POR EMAIL (Edge Function email-send) ──── */
  async avisarEmail(id) {
    const o = this._data.find(x=>x.id===id) || await DB.getOrden(id);
    if (!o) return;
    if (!o.clientes?.email) { UI.toast('El cliente no tiene email registrado','error'); return; }
    UI.toast('Enviando aviso por email...','info');
    const r = await Email.notificarEstadoOT(o, o.clientes);
    if (r.ok) UI.toast(`Aviso enviado a ${o.clientes.email} ✓`);
    else UI.toast('No se pudo enviar: '+r.error,'error');
  },

  /* ── IMPRIMIR ─────────────────────────────── */
  async imprimirOT(id) {
    const o = await DB.getOrden(id);
    if (!o) return;
    const { data: items } = await getSB().from('ot_items').select('*').eq('orden_id', id).order('orden_pos');

    const win = window.open('','_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>OT ${o.num}</title>
      <meta charset="UTF-8">
      <style>
        body{font-family:Arial,sans-serif;padding:20px;max-width:700px;margin:0 auto;color:#111}
        h2{text-align:center;border-bottom:2px solid #3B82F6;padding-bottom:8px}
        .header{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
        .section{border:1px solid #ddd;border-radius:6px;padding:12px;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#3B82F6;color:#fff;padding:6px 8px;text-align:left}
        td{padding:6px 8px;border-bottom:1px solid #eee}
        .total{font-size:16px;font-weight:bold;text-align:right;margin-top:8px;color:#2563EB}
        .firma{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
        .firma-line{border-top:1px solid #111;padding-top:4px;text-align:center;font-size:12px}
        .check{color:green;font-weight:bold}
        .pending{color:orange}
        @media print{button{display:none}}
      </style></head><body>
      <h2>${Auth.tenant?.name||'TallerPro Enterprise'}</h2>
      <p style="text-align:center;color:#666;margin-top:-8px">NIT: ${Auth.tenant?.nit||'—'} · ${Auth.tenant?.tel||''}</p>

      <div class="header">
        <div class="section">
          <b>ORDEN DE TRABAJO: ${o.num}</b><br>
          Estado: ${ESTADOS_OT[o.estado]?.label||o.estado}<br>
          Fecha ingreso: ${UI.fecha(o.fecha_ingreso)}<br>
          Entrega estimada: ${UI.fecha(o.fecha_estimada)||'—'}<br>
          Mecánico: ${o.empleados?.nombre||'—'}
        </div>
        <div class="section">
          <b>CLIENTE</b><br>
          ${o.clientes?.nombre||'—'}<br>
          NIT: ${o.clientes?.nit||'CF'}<br>
          Tel: ${o.clientes?.tel||'—'}<br><br>
          <b>VEHÍCULO</b><br>
          ${o.vehiculos?.placa} · ${o.vehiculos?.marca} ${o.vehiculos?.modelo} ${o.vehiculos?.anio||''}
        </div>
      </div>

      <div class="section">
        <b>DESCRIPCIÓN DEL TRABAJO:</b><br>
        <p>${o.descripcion||'—'}</p>
      </div>

      <div class="section">
        <b>TRABAJOS REALIZADOS:</b>
        <table style="margin-top:8px">
          <thead><tr><th>✓</th><th>Descripción</th><th>Tipo</th><th>Cant</th><th>Precio</th><th>Total</th></tr></thead>
          <tbody>
            ${(items||[]).map(i=>`<tr>
              <td class="${i.ejecutado?'check':'pending'}">${i.ejecutado?'✓':'○'}</td>
              <td>${i.descripcion}${i.es_extra?' <b>[EXTRA]</b>':''}</td>
              <td>${i.tipo}</td>
              <td>${i.cantidad}</td>
              <td>Q${(i.precio_unit||0).toFixed(2)}</td>
              <td>Q${(i.total||0).toFixed(2)}</td>
            </tr>`).join('')||'<tr><td colspan="6" style="text-align:center">Sin ítems</td></tr>'}
          </tbody>
        </table>
        <div class="total">TOTAL: Q${(o.total||0).toFixed(2)}</div>
      </div>

      <div class="firma">
        <div class="firma-line">Firma y sello del taller</div>
        <div class="firma-line">Firma y DPI del cliente</div>
      </div>

      <script>window.print();</script>
      </body></html>`);
    win.document.close();
  },

  /* Opciones del select de vehículos filtradas por cliente */
  _opcionesVehiculo(clienteId, selVeh) {
    if (!clienteId) return '<option value="">Primero elige un cliente...</option>';
    const vehs = this._vehiculos.filter(v => v.cliente_id === clienteId);
    if (!vehs.length) return '<option value="">Este cliente no tiene vehículos — regístralo en Vehículos</option>';
    return '<option value="">Seleccionar vehículo...</option>' +
      vehs.map(v=>`<option value="${v.id}" ${selVeh===v.id?'selected':''}>${v.placa} · ${v.marca} ${v.modelo} ${v.anio||''}</option>`).join('');
  },

  /* Tarjeta con los datos de contacto del cliente seleccionado */
  _clienteInfoHtml(clienteId) {
    const c = clienteId ? this._clientes.find(x=>x.id===clienteId) : null;
    if (!c) return '';
    return `<div class="card" style="background:var(--surface2);padding:10px 12px;margin-bottom:12px;font-size:12px">
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <span><b>👤 ${c.nombre}</b></span>
        <span class="text-muted">📞 ${c.tel||'—'}</span>
        <span class="text-muted">🆔 NIT: ${c.nit||'CF'}</span>
        ${c.email?`<span class="text-muted">✉️ ${c.email}</span>`:''}
      </div></div>`;
  },

  /* Al cambiar el cliente: filtra sus vehículos y muestra su info */
  _onClienteChange() {
    const cliId = document.getElementById('ot-cli')?.value || null;
    const veh = document.getElementById('ot-veh');
    if (veh) veh.innerHTML = this._opcionesVehiculo(cliId, null);
    const info = document.getElementById('ot-cli-info');
    if (info) info.innerHTML = this._clienteInfoHtml(cliId);
  },

  /* ── MODAL FORM ───────────────────────────── */
  async modalForm(id=null, vehiculoId=null) {
    let o = id ? (this._data.find(x=>x.id===id)||await DB.getOrden(id)) : {};
    /* OT nueva desde un vehículo: preseleccionar su cliente y vehículo */
    if (!id && vehiculoId) {
      const v = this._vehiculos.find(x=>x.id===vehiculoId);
      if (v) o = { vehiculo_id: v.id, cliente_id: v.cliente_id };
    }
    const esEdicion = !!id;
    this._fotos = [];

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nueva'} Orden de Trabajo`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual de la orden.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cliente *</label>
          <select class="form-select" id="ot-cli" onchange="Modulos.ordenes._onClienteChange()">
            <option value="">Seleccionar cliente...</option>
            ${this._clientes.map(c=>`<option value="${c.id}" ${o.cliente_id===c.id?'selected':''}>${c.nombre}${c.nit?` — NIT ${c.nit}`:''}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Vehículo del cliente *</label>
          <select class="form-select" id="ot-veh">
            ${this._opcionesVehiculo(o.cliente_id||null, o.vehiculo_id||null)}
          </select></div>
      </div>
      <div id="ot-cli-info">${this._clienteInfoHtml(o.cliente_id)}</div>
      <div class="form-group"><label class="form-label">Mecánico asignado</label>
        <select class="form-select" id="ot-mec">
          <option value="">Sin asignar</option>
          ${this._mecanicos.filter(e=>e.activo!==false).map(e=>`<option value="${e.id}" ${o.mecanico_id===e.id?'selected':''}>${e.nombre}${e.cargo?` — ${e.cargo}`:''}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Descripción del Trabajo *</label>
        <textarea class="form-input" id="ot-desc" rows="3" placeholder="Descripción general del trabajo a realizar...">${o.descripcion||''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Estado</label>
          <select class="form-select" id="ot-estado">
            ${Object.entries(ESTADOS_OT).map(([k,v])=>`<option value="${k}" ${(o.estado||'recibido')===k?'selected':''}>${v.label}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Prioridad</label>
          <select class="form-select" id="ot-prio">
            ${['baja','media','alta','urgente'].map(p=>`<option value="${p}" ${(o.prioridad||'media')===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha Estimada Entrega</label>
          <input class="form-input" id="ot-fecha" type="date" value="${o.fecha_estimada||''}"></div>
        <div class="form-group"><label class="form-label">Total (Q)</label>
          <input class="form-input" id="ot-total" type="number" value="${o.total||''}" min="0" step="0.01"></div>
      </div>
      ${!esEdicion?`
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
        <label class="form-label">📸 Fotos de Recepción</label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <label style="width:70px;height:70px;border:2px dashed var(--border);border-radius:8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:20px;color:var(--text3)">
            📷<span style="font-size:9px">Agregar</span>
            <input type="file" accept="image/*" multiple class="hidden" onchange="Modulos.ordenes._agregarFotos(this)">
          </label>
          <div id="ot-fotos-preview" style="display:flex;gap:6px;flex-wrap:wrap"></div>
        </div>
      </div>`:''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        ${esEdicion?`<button class="btn btn-danger btn-sm" onclick="Modulos.ordenes.eliminarOT('${id}')">Eliminar OT</button>`:''}
        <button class="btn btn-amber" onclick="Modulos.ordenes.guardar('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear OT'}
        </button>
      </div>`,'640px');
  },

  _agregarFotos(input) {
    const preview = document.getElementById('ot-fotos-preview');
    Array.from(input.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        this._fotos.push(e.target.result);
        if (preview) {
          const d = document.createElement('div');
          d.innerHTML = `<img src="${e.target.result}" style="width:70px;height:70px;object-fit:cover;border-radius:6px">`;
          preview.appendChild(d);
        }
      };
      reader.readAsDataURL(file);
    });
  },

  async guardar(id='') {
    const cliId  = document.getElementById('ot-cli')?.value || null;
    const vehId  = document.getElementById('ot-veh')?.value || null;
    const desc   = document.getElementById('ot-desc')?.value.trim();
    if (!cliId)  { UI.toast('Selecciona un cliente','error'); return; }
    if (!vehId)  { UI.toast('Selecciona el vehículo del cliente','error'); return; }
    if (!desc)   { UI.toast('La descripción es obligatoria','error'); return; }

    const fields = {
      vehiculo_id:    vehId,
      cliente_id:     cliId,
      mecanico_id:    document.getElementById('ot-mec')?.value||null,
      descripcion:    desc,
      estado:         document.getElementById('ot-estado')?.value||'recibido',
      prioridad:      document.getElementById('ot-prio')?.value||'media',
      fecha_estimada: document.getElementById('ot-fecha')?.value||null,
      total:          parseFloat(document.getElementById('ot-total')?.value)||0,
      fotos_recepcion:this._fotos.length?JSON.stringify(this._fotos):null
    };
    if (id) fields.id = id;
    const res = await DB.upsertOrden(fields);
    this._fotos = [];
    if (res.error) { UI.toast('Error: '+res.error.message,'error'); return; }

    const ordenId = id || res.data?.id;
    const num = id ? (this._data.find(o=>o.id===id)?.num) : res.data?.num;
    const veh = this._vehiculos.find(v=>v.id===vehId);

    /* OT nueva: agregar el ítem de Mano de Obra por defecto */
    if (!id && ordenId) {
      await getSB().from('ot_items').insert({
        tenant_id: getTID(), orden_id: ordenId, tipo: 'mano_obra',
        descripcion: 'Mano de obra', cantidad: 1, precio_unit: 0, total: 0,
        ejecutado: false, es_extra: false, autorizado: true, orden_pos: 0
      });
    }

    /* Fecha de entrega → cita en el calendario (seguimiento) */
    await DB.syncCitaEntrega({
      id: ordenId, num, cliente_id: cliId, vehiculo_id: vehId,
      mecanico_id: fields.mecanico_id, fecha_estimada: fields.fecha_estimada, placa: veh?.placa
    }).catch(()=>{});

    UI.cerrarModal();
    UI.toast(id?'OT actualizada ✓':'OT creada ✓ — se agregó Mano de obra y la fecha al calendario');
    this.render();
    if (id) {
      setTimeout(() => this.verDetalle(id), 250);
    }
  },

  async eliminarOT(id) {
    const ok = await UI.confirmar('¿Eliminar esta Orden de Trabajo? Esta acción no se puede deshacer.','Eliminar');
    if (!ok) return;
    await getSB().from('ot_items').delete().eq('orden_id', id);
    await getSB().from('ordenes').delete().eq('id', id);
    UI.cerrarModal();
    UI.toast('OT eliminada');
    this.render();
  },

  async cambiarEstado(id, estado) {
    await DB.updateEstadoOT(id, estado);
    UI.toast('Estado actualizado ✓');
    const o = this._data.find(x=>x.id===id);
    if (o) o.estado = estado;
  }
};
