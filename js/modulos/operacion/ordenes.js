/* TallerPro v3.0 — ordenes/index.js */
Modulos.ordenes = {
  _data:[], _vehiculos:[], _clientes:[], _mecanicos:[],
  _vista:'lista', _fotos:[],

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
          <button class="btn btn-ghost" onclick="Modulos.ordenes._vista='kanban';Modulos.ordenes.render()" title="Kanban">⬛</button>
          <button class="btn btn-ghost" onclick="Modulos.ordenes._vista='lista';Modulos.ordenes.render()" title="Lista">☰</button>
          <button class="btn btn-ghost" onclick="window.print()">🖨️</button>
          <button class="btn btn-amber" onclick="Modulos.ordenes.modalForm()">＋ Nueva OT</button>
        </div>
      </div>
      <div class="page-body">
        ${this._vista==='kanban' ? this._renderKanban() : this._renderLista()}
      </div>`;
  },

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
              <button class="btn btn-sm btn-danger" onclick="Modulos.ordenes.eliminarItem('${item.id}','${id}')" style="flex-shrink:0" title="Eliminar ítem">🗑️</button>
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
        ${o.estado==='listo'?`<button class="btn btn-green" onclick="Modulos.ordenes.enviarFacturacion('${id}')">🧾 Enviar a Facturación</button>`:''}
      </div>`,'720px');
  },

  /* ── ITEMS ────────────────────────────────── */
  modalAddItem(ordenId) {
    UI.modal('＋ Agregar Ítem a OT', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo *</label>
          <select class="form-select" id="item-tipo">
            <option value="servicio">🔧 Servicio</option>
            <option value="repuesto">📦 Repuesto</option>
            <option value="mano_obra">👷 Mano de Obra</option>
            <option value="diagnostico">🔍 Diagnóstico</option>
            <option value="otro">📝 Otro</option>
          </select></div>
        <div class="form-group"><label class="form-label">¿Es trabajo extra?</label>
          <label style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--surface2);border-radius:8px;cursor:pointer;height:40px">
            <input type="checkbox" id="item-extra" style="accent-color:var(--amber)">
            <span style="font-size:13px">Trabajo extra no presupuestado</span>
          </label></div>
      </div>
      <div class="form-group"><label class="form-label">Descripción *</label>
        <input class="form-input" id="item-desc" placeholder="Cambio de filtro de aceite, revisión de frenos..."></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cantidad</label>
          <input class="form-input" id="item-cant" type="number" value="1" min="0.01" step="0.01"
                 oninput="const c=parseFloat(this.value)||1;const p=parseFloat(document.getElementById('item-precio').value)||0;document.getElementById('item-total').value=(c*p).toFixed(2)"></div>
        <div class="form-group"><label class="form-label">Precio Unitario (Q)</label>
          <input class="form-input" id="item-precio" type="number" min="0" step="0.01" placeholder="0.00"
                 oninput="const c=parseFloat(document.getElementById('item-cant').value)||1;const p=parseFloat(this.value)||0;document.getElementById('item-total').value=(c*p).toFixed(2)"></div>
      </div>
      <div class="form-group"><label class="form-label">Total (Q)</label>
        <input class="form-input" id="item-total" type="number" min="0" step="0.01" placeholder="0.00"
               style="font-size:16px;font-weight:700;color:var(--amber)"></div>
      <div id="item-autorizar-row" style="display:none">
        <label style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--amber-dim);border-radius:8px;cursor:pointer;border:1px solid var(--amber-border)">
          <input type="checkbox" id="item-autorizado" checked style="accent-color:var(--cyan)">
          <span style="font-size:12px"><b>Cliente autoriza</b> este trabajo extra</span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.ordenes.guardarItem('${ordenId}')">Agregar Ítem</button>
      </div>`);

    document.getElementById('item-extra')?.addEventListener('change', function() {
      document.getElementById('item-autorizar-row').style.display = this.checked ? 'block' : 'none';
    });
  },

  async guardarItem(ordenId) {
    const desc  = document.getElementById('item-desc')?.value.trim();
    const total = parseFloat(document.getElementById('item-total')?.value)||0;
    if (!desc) { UI.toast('La descripción es obligatoria','error'); return; }

    const cant    = parseFloat(document.getElementById('item-cant')?.value)||1;
    const precio  = parseFloat(document.getElementById('item-precio')?.value)||0;
    const esExtra = document.getElementById('item-extra')?.checked||false;

    const { error } = await getSB().from('ot_items').insert({
      tenant_id:   getTID(),
      orden_id:    ordenId,
      tipo:        document.getElementById('item-tipo')?.value||'servicio',
      descripcion: desc,
      cantidad:    cant,
      precio_unit: precio,
      total:       total||cant*precio,
      ejecutado:   false,
      es_extra:    esExtra,
      autorizado:  esExtra ? (document.getElementById('item-autorizado')?.checked||false) : true
    });

    if (error) { UI.toast('Error: '+error.message,'error'); return; }

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

  /* ── FACTURACIÓN ──────────────────────────── */
  async enviarFacturacion(id) {
    const o = await DB.getOrden(id);
    if (!o) return;

    if (o.estado !== 'listo') {
      UI.toast('La OT debe estar en estado "Listo" para facturar','error');
      return;
    }

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

    /* Crear factura */
    const { data: factura, error } = await getSB().from('facturas').insert({
      tenant_id:  getTID(),
      cliente_id: o.cliente_id,
      orden_id:   id,
      serie:      'A',
      subtotal,
      iva,
      total,
      estado:     'pendiente',
      fecha:      new Date().toISOString().slice(0,10),
      notas:      descripcionFEL.slice(0,500)
    }).select().single();

    if (error) { UI.toast('Error al crear factura: '+error.message,'error'); return; }

    /* Cambiar estado OT a entregado */
    await DB.updateEstadoOT(id, 'entregado');

    UI.cerrarModal();
    UI.toast('OT enviada a Facturación ✓ — Factura creada');
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
        h2{text-align:center;border-bottom:2px solid #F59E0B;padding-bottom:8px}
        .header{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
        .section{border:1px solid #ddd;border-radius:6px;padding:12px;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#F59E0B;color:#000;padding:6px 8px;text-align:left}
        td{padding:6px 8px;border-bottom:1px solid #eee}
        .total{font-size:16px;font-weight:bold;text-align:right;margin-top:8px;color:#D97706}
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

  /* ── MODAL FORM ───────────────────────────── */
  async modalForm(id=null) {
    const o = id ? (this._data.find(x=>x.id===id)||await DB.getOrden(id)) : {};
    const esEdicion = !!id;
    this._fotos = [];

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nueva'} Orden de Trabajo`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual de la orden.</div></div>':''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Vehículo *</label>
          <select class="form-select" id="ot-veh">
            <option value="">Seleccionar...</option>
            ${this._vehiculos.map(v=>`<option value="${v.id}" data-cliente="${v.cliente_id}" ${(o.vehiculo_id===v.id)?'selected':''}>${v.placa} · ${v.marca} ${v.modelo}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Mecánico</label>
          <select class="form-select" id="ot-mec">
            <option value="">Sin asignar</option>
            ${this._mecanicos.filter(e=>['mecanico','gerente_tal'].includes(e.rol)).map(e=>`<option value="${e.id}" ${o.mecanico_id===e.id?'selected':''}>${e.nombre}</option>`).join('')}
          </select></div>
      </div>
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
    const vehSel = document.getElementById('ot-veh');
    const vehId  = vehSel?.value;
    const desc   = document.getElementById('ot-desc')?.value.trim();
    if (!vehId)  { UI.toast('Selecciona un vehículo','error'); return; }
    if (!desc)   { UI.toast('La descripción es obligatoria','error'); return; }

    const cliId = vehSel.options[vehSel.selectedIndex]?.dataset.cliente || null;
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
    const { error } = await DB.upsertOrden(fields);
    this._fotos = [];
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'OT actualizada ✓':'OT creada ✓');
    this.render();
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
