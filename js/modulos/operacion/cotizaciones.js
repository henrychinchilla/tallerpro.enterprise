/* TallerPro v3.0 — operacion/cotizaciones.js
   Cotización de Servicios: módulo UNIVERSAL, aplica a cualquier vertical
   del taller (mecánica, herrería, peletería, electrónica, refrigeración...).
   Flujo: pendiente → aprobada/rechazada → (aprobada) se puede convertir en
   una Orden de Trabajo con un clic. */
Modulos.cotizaciones = {
  _data: [], _clientes: [], _vehiculos: [], _filtroEstado: '', _items: [],

  _ESTADOS: { pendiente:'Pendiente', aprobada:'Aprobada', rechazada:'Rechazada', vencida:'Vencida', convertida:'Convertida' },
  _ORIGENES: { general:'General', taller:'Taller mecánico', herreria:'Herrería / Ventanería', peleteria:'Peletería', electronica:'Reparación Electrónica', refrigeracion:'Refrigeración y A/C' },

  async render(filtroEstado='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._filtroEstado = filtroEstado;
    [this._data, this._clientes] = await Promise.all([
      DB.getCotizaciones(filtroEstado ? { estado: filtroEstado } : {}),
      DB.getClientes()
    ]);

    const hoy = new Date().toISOString().slice(0,10);
    const pendientes = this._data.filter(c=>c.estado==='pendiente');
    const aprobadas  = this._data.filter(c=>c.estado==='aprobada');
    const montoPendiente = pendientes.reduce((s,c)=>s+(Number(c.total)||0),0);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">📝 Cotizaciones</h1>
        <p class="page-subtitle">// ${this._data.length} registradas</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.cotizaciones.modalForm()">＋ Nueva Cotización</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'📝', clase:'cyan', label:'Cotizaciones', value:this._data.length })}
          ${UI.kpiCard({ icon:'⏳', clase:'amber', label:'Pendientes', value:pendientes.length, trend:UI.q(montoPendiente)+' por aprobar' })}
          ${UI.kpiCard({ icon:'✅', clase:'green', label:'Aprobadas', value:aprobadas.length })}
          ${UI.kpiCard({ icon:'🔁', clase:'purple', label:'Convertidas a OT', value:this._data.filter(c=>c.estado==='convertida').length })}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-sm ${!filtroEstado?'btn-cyan':'btn-ghost'}" onclick="Modulos.cotizaciones.render('')">Todas</button>
          ${Object.entries(this._ESTADOS).map(([k,l])=>`<button class="btn btn-sm ${filtroEstado===k?'btn-cyan':'btn-ghost'}" onclick="Modulos.cotizaciones.render('${k}')">${l}</button>`).join('')}
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>No.</th><th>Cliente</th><th>Origen</th><th>Fecha</th><th>Vence</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._data.map(c=>{
              const vence = this._fechaVencimiento(c);
              const vencida = c.estado==='pendiente' && vence && vence < hoy;
              const estadoMostrar = vencida ? 'vencida' : c.estado;
              return `<tr>
                <td class="mono-sm">${c.num||'—'}</td>
                <td>${c.clientes?.nombre||'—'}</td>
                <td><span class="badge badge-gray">${this._origenLabel(c.modulo_origen)}</span></td>
                <td class="mono-sm">${UI.fecha(c.fecha)}</td>
                <td class="mono-sm ${vencida?'text-red':''}">${vence?UI.fecha(vence):'—'}${vencida?' ⚠️':''}</td>
                <td class="mono-sm"><b>${UI.q(c.total)}</b></td>
                <td><span class="badge badge-${this._colorEstado(estadoMostrar)}">${this._ESTADOS[estadoMostrar]||c.estado}</span></td>
                <td><div style="display:flex;gap:4px;flex-wrap:wrap">
                  ${Modulos.btnAccion('ver', `Modulos.cotizaciones.verDetalle('${c.id}')`)}
                  ${c.estado!=='convertida'?Modulos.btnAccion('editar', `Modulos.cotizaciones.modalForm('${c.id}')`):''}
                  ${c.estado==='aprobada'?`<button class="btn btn-sm btn-green" title="Convertir a Orden de Trabajo" onclick="Modulos.cotizaciones.convertirAOrden('${c.id}')">🔁 OT</button>`:''}
                  ${c.estado!=='convertida'?Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('cotizaciones','${c.id}','la cotización ${c.num||''}',()=>Modulos.cotizaciones.render(Modulos.cotizaciones._filtroEstado))`):''}
                </div></td>
              </tr>`;
            }).join('')||'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Sin cotizaciones registradas</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  },

  _origenLabel(m) { return this._ORIGENES[m] || 'General'; },
  _colorEstado(e) { return { pendiente:'amber', aprobada:'green', rechazada:'red', vencida:'red', convertida:'purple' }[e]||'gray'; },
  _fechaVencimiento(c) {
    if (!c.fecha) return null;
    const d = new Date(c.fecha+'T00:00:00');
    d.setDate(d.getDate()+(Number(c.validez_dias)||8));
    return d.toISOString().slice(0,10);
  },

  async verDetalle(id) {
    const c = await DB.getCotizacion(id);
    if (!c) return;
    UI.modal(`📝 Cotización ${c.num||''}`, `
      <div style="font-size:13px;line-height:1.6">
        <div><b>Cliente:</b> ${c.clientes?.nombre||'—'}</div>
        ${c.vehiculos?`<div><b>Vehículo:</b> ${c.vehiculos.placa} — ${c.vehiculos.marca} ${c.vehiculos.modelo}</div>`:''}
        <div><b>Origen:</b> ${this._origenLabel(c.modulo_origen)}</div>
        <div><b>Fecha:</b> ${UI.fecha(c.fecha)} · <b>Válida hasta:</b> ${UI.fecha(this._fechaVencimiento(c))}</div>
      </div>
      <div class="table-wrap" style="margin:12px 0"><table class="data-table">
        <thead><tr><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead>
        <tbody>
          ${(c.cotizacion_items||[]).map(i=>`<tr><td>${i.descripcion}</td><td class="mono-sm">${i.cantidad}</td><td class="mono-sm">${UI.q(i.precio_unit)}</td><td class="mono-sm">${UI.q(i.total)}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--text3)">Sin ítems</td></tr>'}
        </tbody>
      </table></div>
      <div style="text-align:right;font-size:13px;line-height:1.6">
        <div>Subtotal: ${UI.q(c.subtotal)}</div>
        ${c.descuento_monto?`<div>Descuento: -${UI.q(c.descuento_monto)}</div>`:''}
        <div>IVA (12%): ${UI.q(c.iva)}</div>
        <div style="font-size:16px;font-weight:800">Total: ${UI.q(c.total)}</div>
      </div>
      ${c.notas?`<div style="margin-top:10px;font-size:12px;color:var(--text3)"><b>Notas:</b> ${c.notas}</div>`:''}
      ${c.condiciones?`<div style="margin-top:4px;font-size:12px;color:var(--text3)"><b>Condiciones:</b> ${c.condiciones}</div>`:''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        ${c.estado==='pendiente'?`<button class="btn btn-danger" onclick="Modulos.cotizaciones.cambiarEstado('${c.id}','rechazada')">✗ Rechazar</button>`:''}
        ${c.estado==='pendiente'?`<button class="btn btn-green" onclick="Modulos.cotizaciones.cambiarEstado('${c.id}','aprobada')">✓ Aprobar</button>`:''}
        ${c.estado==='aprobada'?`<button class="btn btn-amber" onclick="UI.cerrarModal();Modulos.cotizaciones.convertirAOrden('${c.id}')">🔁 Convertir a OT</button>`:''}
      </div>`, '640px');
  },

  async cambiarEstado(id, estado) {
    const { error } = await DB.guardarCotizacion({ id, estado });
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(estado==='aprobada'?'Cotización aprobada ✓':'Cotización rechazada');
    this.render(this._filtroEstado);
  },

  async convertirAOrden(id) {
    if (!confirm('¿Convertir esta cotización en una Orden de Trabajo?')) return;
    const { data, error } = await DB.convertirCotizacionAOrden(id);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(`Orden de Trabajo ${data.num} creada ✓`);
    this.render(this._filtroEstado);
  },

  async modalForm(id=null) {
    const c = id ? await DB.getCotizacion(id) : {};
    this._items = id && (c.cotizacion_items||[]).length
      ? c.cotizacion_items.map(i=>({...i}))
      : [{ descripcion:'', cantidad:1, precio_unit:0, descuento_pct:0 }];
    if (!this._clientes.length) this._clientes = await DB.getClientes();
    this._vehiculos = c.cliente_id ? await DB.getVehiculos(c.cliente_id) : [];
    const esEdicion = !!id;
    const origenSel = c.modulo_origen || 'general';

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nueva'} Cotización`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cliente *</label>
          <select class="form-select" id="cot-cliente" onchange="Modulos.cotizaciones._cambiarCliente(this.value)">
            <option value="">— Selecciona —</option>
            ${this._clientes.map(cl=>`<option value="${cl.id}" ${c.cliente_id===cl.id?'selected':''}>${cl.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Vehículo (opcional)</label>
          <select class="form-select" id="cot-vehiculo">
            <option value="">—</option>
            ${this._vehiculos.map(v=>`<option value="${v.id}" ${c.vehiculo_id===v.id?'selected':''}>${v.placa} — ${v.marca} ${v.modelo}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Origen</label>
          <select class="form-select" id="cot-origen">
            ${Object.entries(this._ORIGENES).map(([k,l])=>`<option value="${k}" ${origenSel===k?'selected':''}>${l}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Validez (días)</label>
          <input class="form-input" id="cot-validez" type="number" min="1" value="${c.validez_dias||8}"></div>
        <div class="form-group"><label class="form-label">Descuento global (%)</label>
          <input class="form-input" id="cot-desc-pct" type="number" min="0" max="100" step="0.01" value="${c.descuento_pct||0}" oninput="Modulos.cotizaciones._recalcular()"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Ítems</label>
        <div id="cot-items"></div>
        <button type="button" class="btn btn-sm btn-ghost" style="margin-top:6px" onclick="Modulos.cotizaciones._agregarItem()">＋ Agregar línea</button>
      </div>
      <div id="cot-totales" style="text-align:right;font-size:13px;margin-top:10px;line-height:1.6"></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="cot-notas" rows="2">${c.notas||''}</textarea></div>
      <div class="form-group"><label class="form-label">Condiciones</label>
        <textarea class="form-input" id="cot-condiciones" rows="2">${c.condiciones||'Precios sujetos a cambio sin previo aviso. Anticipo del 50% para iniciar el trabajo.'}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.cotizaciones.guardar('${id||''}')">${esEdicion?'Guardar Cambios':'Crear Cotización'}</button>
      </div>`, '720px');
    this._renderItems();
  },

  async _cambiarCliente(clienteId) {
    this._vehiculos = clienteId ? await DB.getVehiculos(clienteId) : [];
    const sel = document.getElementById('cot-vehiculo');
    if (sel) sel.innerHTML = `<option value="">—</option>${this._vehiculos.map(v=>`<option value="${v.id}">${v.placa} — ${v.marca} ${v.modelo}</option>`).join('')}`;
  },

  _renderItems() {
    const el = document.getElementById('cot-items');
    if (!el) return;
    el.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Descripción</th><th style="width:80px">Cant.</th><th style="width:110px">Precio U.</th><th style="width:90px">Desc. %</th><th style="width:100px">Total</th><th></th></tr></thead>
      <tbody>
        ${this._items.map((it,i)=>`<tr>
          <td><input class="form-input" value="${(it.descripcion||'').replace(/"/g,'&quot;')}" oninput="Modulos.cotizaciones._items[${i}].descripcion=this.value"></td>
          <td><input class="form-input" type="number" min="0" step="0.01" value="${it.cantidad||1}" oninput="Modulos.cotizaciones._items[${i}].cantidad=parseFloat(this.value)||0;Modulos.cotizaciones._recalcular()"></td>
          <td><input class="form-input" type="number" min="0" step="0.01" value="${it.precio_unit||0}" oninput="Modulos.cotizaciones._items[${i}].precio_unit=parseFloat(this.value)||0;Modulos.cotizaciones._recalcular()"></td>
          <td><input class="form-input" type="number" min="0" max="100" step="0.01" value="${it.descuento_pct||0}" oninput="Modulos.cotizaciones._items[${i}].descuento_pct=parseFloat(this.value)||0;Modulos.cotizaciones._recalcular()"></td>
          <td class="mono-sm">${UI.q(this._totalItem(it))}</td>
          <td><button type="button" class="btn btn-sm btn-danger" onclick="Modulos.cotizaciones._quitarItem(${i})">🗑️</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
    this._recalcular();
  },

  _totalItem(it) {
    const base = (Number(it.cantidad)||0) * (Number(it.precio_unit)||0);
    return base - base*((Number(it.descuento_pct)||0)/100);
  },

  _agregarItem() { this._items.push({ descripcion:'', cantidad:1, precio_unit:0, descuento_pct:0 }); this._renderItems(); },
  _quitarItem(i) {
    this._items.splice(i,1);
    if (!this._items.length) this._items.push({ descripcion:'', cantidad:1, precio_unit:0, descuento_pct:0 });
    this._renderItems();
  },

  /* Los precios de línea ya incluyen IVA (estándar de venta al público en
     Guatemala); el subtotal e IVA que se guardan se desglosan del total
     final, igual que en Facturación FEL. */
  _recalcular() {
    const rawSum = this._items.reduce((s,it)=>s+this._totalItem(it),0);
    const descPct = parseFloat(document.getElementById('cot-desc-pct')?.value)||0;
    const descMonto = Math.round(rawSum*(descPct/100)*100)/100;
    const totalConIva = rawSum - descMonto;
    const subtotal = Math.round(totalConIva/(1+GT.iva_general)*100)/100;
    const iva = Math.round((totalConIva - subtotal)*100)/100;
    const elT = document.getElementById('cot-totales');
    if (elT) elT.innerHTML = `
      <div>Subtotal: ${UI.q(subtotal)}</div>
      ${descMonto?`<div>Descuento (${descPct}%): -${UI.q(descMonto)}</div>`:''}
      <div>IVA (12%): ${UI.q(iva)}</div>
      <div style="font-size:16px;font-weight:800">Total: ${UI.q(totalConIva)}</div>`;
    return { subtotal, descMonto, iva, total: totalConIva };
  },

  async guardar(id='') {
    const clienteId = document.getElementById('cot-cliente')?.value;
    if (!clienteId) { UI.toast('Selecciona un cliente','error'); return; }
    const items = this._items.filter(it=>it.descripcion?.trim());
    if (!items.length) { UI.toast('Agrega al menos un ítem','error'); return; }
    const { subtotal, descMonto, iva, total } = this._recalcular();
    const fields = {
      cliente_id: clienteId,
      vehiculo_id: document.getElementById('cot-vehiculo')?.value || null,
      modulo_origen: document.getElementById('cot-origen')?.value || 'general',
      validez_dias: parseInt(document.getElementById('cot-validez')?.value)||8,
      descuento_pct: parseFloat(document.getElementById('cot-desc-pct')?.value)||0,
      descuento_monto: descMonto, subtotal, iva, total,
      notas: document.getElementById('cot-notas')?.value||null,
      condiciones: document.getElementById('cot-condiciones')?.value||null
    };
    if (id) fields.id = id;
    const itemsPayload = items.map(it=>({
      descripcion: it.descripcion, cantidad: Number(it.cantidad)||1,
      precio_unit: Number(it.precio_unit)||0, descuento_pct: Number(it.descuento_pct)||0,
      total: this._totalItem(it)
    }));
    const { error } = await DB.guardarCotizacion(fields, itemsPayload);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Cotización actualizada ✓':'Cotización creada ✓');
    this.render(this._filtroEstado);
  }
};
