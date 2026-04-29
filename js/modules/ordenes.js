/* ═══════════════════════════════════════════════════════
   modules/ordenes.js — Órdenes de Trabajo (Supabase)
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

let _otVistaKanban = true;

Pages.ordenes = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Órdenes de Trabajo</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const ordenes = await DB.getOrdenes();
  const activas = ordenes.filter(o => o.estado !== 'entregado' && o.estado !== 'cancelado').length;
  Pages._ordenesData = ordenes;

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Órdenes de Trabajo</h1>
        <p class="page-subtitle">// ${activas} OTs ACTIVAS</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" id="btn-toggle-view" onclick="Pages.toggleOTView()">📋 Vista Lista</button>
        <button class="btn btn-amber" onclick="Pages.modalNuevaOT()">＋ Nueva OT</button>
      </div>
    </div>
    <div class="page-body">
      <div id="ot-kanban">${Pages._buildKanban(ordenes)}</div>
      <div id="ot-lista" class="hidden">${Pages._buildTablaOT(ordenes)}</div>
    </div>`;
};

Pages._buildKanban = function (ordenes) {
  let html = '<div class="kanban">';
  Object.entries(ESTADOS_OT).forEach(([key, s]) => {
    const cols = ordenes.filter(o => o.estado === key);
    html += `
      <div class="kanban-col">
        <div class="kanban-head">
          <span class="kanban-head-title">${s.label}</span>
          <span class="kanban-count">${cols.length}</span>
        </div>
        <div class="kanban-body">
          ${cols.length === 0
            ? '<div class="kanban-empty">Sin órdenes</div>'
            : cols.map(o => {
                const v = o.vehiculos;
                const c = o.clientes;
                return `<div class="ot-card" onclick="Pages.verOT('${o.id}')">
                  <div class="ot-card-num">${o.num}
                    <span onclick="event.stopPropagation();Pages.eliminarOT('${o.id}','${o.num}')"
                      style="float:right;cursor:pointer;color:var(--text3);font-size:12px" title="Eliminar">🗑</span>
                  </div>
                  <div class="ot-card-vehicle">${v?.marca||'—'} ${v?.modelo||''}</div>
                  <div class="ot-card-client">${v?.placa||''} · ${c?.nombre||'—'}</div>
                  <div class="ot-card-footer">
                    <span class="ot-card-total">${UI.q(o.total)}</span>
                    ${UI.prioDot(o.prioridad)}
                  </div>
                </div>`;
              }).join('')}
        </div>
      </div>`;
  });
  return html + '</div>';
};

Pages._buildTablaOT = function (ordenes) {
  const pColors = { alta:'red', media:'amber', baja:'green', urgente:'red' };
  const rows = ordenes.map(o => {
    const v = o.vehiculos;
    const c = o.clientes;
    const m = o.empleados;
    return `<tr onclick="Pages.verOT('${o.id}')" data-text="${o.num} ${v?.placa||''} ${v?.marca||''} ${c?.nombre||''}" data-estado="${o.estado}">
      <td class="mono-sm text-amber">${o.num}</td>
      <td><b>${v?.marca||'—'} ${v?.modelo||''}</b><br>
          <span class="mono-sm text-muted">${v?.placa||''}</span></td>
      <td>${c?.nombre || '—'}</td>
      <td>${m?.nombre || '<span class="text-muted">Sin asignar</span>'}</td>
      <td>${UI.estadoBadge(o.estado)}</td>
      <td><span class="badge badge-${pColors[o.prioridad]||'gray'}">${o.prioridad}</span></td>
      <td class="mono-sm">${UI.q(o.total)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="search-bar">
      <input class="search-input" placeholder="🔍 Buscar OT, vehículo, cliente, descripción..."
             id="search-ot" oninput="Pages.filterOT()">
      <select class="filter-select" id="filter-ot-estado" onchange="Pages.filterOT()">
        <option value="">Todos los estados</option>
        ${Object.entries(ESTADOS_OT).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-ot-prio" onchange="Pages.filterOT()">
        <option value="">Todas las prioridades</option>
        <option value="urgente">🔴 Urgente</option>
        <option value="alta">🟠 Alta</option>
        <option value="media">🟡 Media</option>
        <option value="baja">🟢 Baja</option>
      </select>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Número</th><th>Vehículo</th><th>Cliente</th><th>Mecánico</th><th>Estado</th><th>Prioridad</th><th>Total</th><th></th></tr></thead>
        <tbody id="ot-tbody">${rows || `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px">Sin órdenes. <span class="text-amber" style="cursor:pointer" onclick="Pages.modalNuevaOT()">Crear primera OT →</span></td></tr>`}</tbody>
      </table>
    </div>`;
};

Pages.toggleOTView = function () {
  _otVistaKanban = !_otVistaKanban;
  document.getElementById('ot-kanban').classList.toggle('hidden', !_otVistaKanban);
  document.getElementById('ot-lista').classList.toggle('hidden',  _otVistaKanban);
  document.getElementById('btn-toggle-view').textContent = _otVistaKanban ? '📋 Vista Lista' : '📌 Vista Kanban';
};

Pages.filterOT = function () {
  const q      = (document.getElementById('search-ot')?.value || '').toLowerCase();
  const estado = document.getElementById('filter-ot-estado')?.value || '';
  const prio   = document.getElementById('filter-ot-prio')?.value || '';
  document.querySelectorAll('#ot-tbody tr').forEach(r => {
    const text     = (r.dataset.text || r.textContent).toLowerCase();
    const matchQ   = !q      || text.includes(q);
    const matchE   = !estado || r.dataset.estado === estado;
    const matchP   = !prio   || r.dataset.prio   === prio;
    r.style.display = matchQ && matchE && matchP ? '' : 'none';
  });
};

Pages.verOT = async function (id) {
  const o = await DB.getOrden(id);
  if (!o) return;

  const v = o.vehiculos;
  const c = o.clientes;
  const m = o.empleados;

  const serviciosHtml = (o.ot_servicios || []).map(s =>
    `<div class="flex items-center gap-2" style="padding:5px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--text2)">
      <span style="color:var(--green)">✓</span> ${s.descripcion}
      <span class="mono-sm text-muted" style="margin-left:auto">${UI.q(s.cantidad * s.precio_unitario)}</span>
    </div>`
  ).join('');

  const repsHtml = (o.ot_repuestos || []).map(r =>
    `<tr>
      <td>${r.inventario?.nombre || '—'}</td>
      <td class="mono-sm text-muted">${r.inventario?.codigo || ''}</td>
      <td class="mono-sm">${r.cantidad}</td>
      <td class="mono-sm">${UI.q(r.cantidad * r.precio_unitario)}</td>
    </tr>`
  ).join('');

  UI.openModal('Orden de Trabajo', `
    <div class="flex items-center gap-2 mb-4" style="flex-wrap:wrap">
      <span class="mono-sm text-amber" style="font-size:15px">${o.num}</span>
      ${UI.estadoBadge(o.estado)}
      <span class="badge badge-${{alta:'red',media:'amber',baja:'green',urgente:'red'}[o.prioridad]||'gray'}">
        Prioridad ${o.prioridad}
      </span>
      <span class="mono-sm text-muted" style="margin-left:auto">Ingreso: ${o.fecha_ingreso || '—'}</span>
    </div>

    <div class="grid-2 mb-4">
      <div class="detail-section">
        <div class="detail-section-header">Vehículo</div>
        <div class="detail-row"><div class="detail-key">Placa</div><div class="detail-val mono-sm text-amber">${v?.placa || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">Vehículo</div><div class="detail-val">${v?.marca || '—'} ${v?.modelo || ''} ${v?.anio || ''}</div></div>
        <div class="detail-row"><div class="detail-key">Km</div><div class="detail-val mono-sm">${(v?.kilometraje||0).toLocaleString()} km</div></div>
      </div>
      <div class="detail-section">
        <div class="detail-section-header">Cliente & Mecánico</div>
        <div class="detail-row"><div class="detail-key">Cliente</div><div class="detail-val">${c?.nombre || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">Teléfono</div><div class="detail-val">${c?.tel || '—'}</div></div>
        <div class="detail-row"><div class="detail-key">Mecánico</div><div class="detail-val">${m?.nombre || '<span class="text-muted">Sin asignar</span>'}</div></div>
      </div>
    </div>

    <div class="detail-section mb-4">
      <div class="detail-section-header">Descripción</div>
      <div style="padding:14px 18px;font-size:13px;color:var(--text2)">${o.descripcion}</div>
      ${o.notas ? `<div style="padding:0 18px 14px;font-size:12px;color:var(--text3);font-style:italic">Nota: ${o.notas}</div>` : ''}
    </div>

    ${serviciosHtml ? `
    <div class="detail-section mb-4">
      <div class="detail-section-header">Servicios</div>
      <div style="padding:10px 18px">${serviciosHtml}</div>
    </div>` : ''}

    ${repsHtml ? `
    <div class="detail-section mb-4">
      <div class="detail-section-header">Repuestos</div>
      <table class="data-table">
        <thead><tr><th>Repuesto</th><th>Código</th><th>Cant.</th><th>Subtotal</th></tr></thead>
        <tbody>${repsHtml}</tbody>
      </table>
    </div>` : ''}

    <div class="flex items-center justify-between" style="padding-top:12px;border-top:1px solid var(--border)">
      <div>
        <label class="form-label" style="margin-bottom:6px">Cambiar estado</label>
        ${UI.estadoSelect(o.estado, `Pages.cambiarEstado('${o.id}', this.value)`)}
      </div>
      <div class="mono" style="font-size:20px;color:var(--amber);font-weight:700">Total: ${UI.q(o.total)}</div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-cyan" onclick="Pages.enviarWAOT('${o.id}')">💬 WhatsApp</button>
      <button class="btn btn-ghost" onclick="UI.closeModal();Pages.modalEditarOT('${o.id}')">✏️ Editar</button>
      <button class="btn btn-amber" onclick="UI.toast('Generando PDF...','info')">🖨️ Imprimir OT</button>
    </div>
  `, 'modal-lg');
};

Pages.cambiarEstado = async function (otId, nuevoEstado) {
  const ok = await DB.updateOrdenEstado(otId, nuevoEstado);
  if (!ok) { UI.toast('Error al actualizar', 'error'); return; }

  UI.toast('Estado actualizado: ' + ESTADOS_OT[nuevoEstado].label);

  // Notificar al cliente si OT está lista
  if (nuevoEstado === 'listo') {
    try {
      const o = await DB.getOrden(otId);
      if (o) {
        const r = await NOTIF.notificarOTLista(o, o.clientes, o.vehiculos);
        if (r.wa?.simulado || r.em?.simulado) {
          UI.toast('Preview de notificación generado (modo dev)', 'info');
        } else if (r.wa?.ok) {
          UI.toast('Cliente notificado por WhatsApp ✓', 'info');
        }
      }
    } catch(e) { console.warn('Notif error:', e); }
  }
};

Pages.modalNuevaOT = async function () {
  const [vehiculos, empleados] = await Promise.all([
    DB.getVehiculos(),
    DB.getEmpleados()
  ]);
  const mecanicos = empleados.filter(e => e.rol === 'mecanico');

  UI.openModal('Nueva Orden de Trabajo', `
    <div class="form-group">
      <label class="form-label">Vehículo *</label>
      <select class="form-select" id="not-vehiculo">
        <option value="">Seleccionar vehículo...</option>
        ${vehiculos.map(v => `<option value="${v.id}" data-cliente="${v.cliente_id}">
          ${v.placa} — ${v.marca} ${v.modelo} ${v.anio || ''}
        </option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Mecánico</label>
        <select class="form-select" id="not-mec">
          <option value="">Sin asignar</option>
          ${mecanicos.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Prioridad</label>
        <select class="form-select" id="not-prio">
          <option value="baja">Baja</option>
          <option value="media" selected>Media</option>
          <option value="alta">Alta</option>
          <option value="urgente">Urgente</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción del Trabajo *</label>
      <textarea class="form-input form-textarea" id="not-desc" rows="3"
                placeholder="Describir el trabajo solicitado..."></textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha Estimada Entrega</label>
        <input class="form-input" id="not-fecha" type="date">
      </div>
      <div class="form-group">
        <label class="form-label">Total Estimado (Q)</label>
        <input class="form-input" id="not-total" type="number" min="0" placeholder="0.00">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.guardarOT()">Crear OT</button>
    </div>`
  );
};

Pages.guardarOT = async function () {
  const sel  = document.getElementById('not-vehiculo');
  const vid  = sel?.value;
  const desc = document.getElementById('not-desc').value.trim();
  if (!vid)  { UI.toast('Selecciona un vehículo', 'error'); return; }
  if (!desc) { UI.toast('La descripción es obligatoria', 'error'); return; }

  const cid = sel.options[sel.selectedIndex]?.dataset.cliente || null;

  const { data, error } = await DB.insertOrden({
    vehiculo_id:    vid,
    cliente_id:     cid,
    mecanico_id:    document.getElementById('not-mec').value || null,
    prioridad:      document.getElementById('not-prio').value,
    descripcion:    desc,
    estado:         'recibido',
    fecha_estimada: document.getElementById('not-fecha').value || null,
    total:          parseFloat(document.getElementById('not-total').value) || 0
  });

  if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
  UI.closeModal();
  UI.toast((data?.num || 'OT') + ' creada exitosamente ✓');

  // Notificar recepción al cliente
  try {
    if (data?.id) {
      const o = await DB.getOrden(data.id);
      if (o?.clientes) await NOTIF.notificarOTRecibida(o, o.clientes, o.vehiculos);
    }
  } catch(e) { console.warn('Notif error:', e); }

  Pages.ordenes();
};

/* ── ELIMINAR OT ──────────────────────────────────── */
Pages.eliminarOT = function (id, num) {
  UI.confirm(`¿Eliminar la OT <b>${num}</b>? Esta acción no se puede deshacer.`, async () => {
    const { error } = await getSupabase().from('ordenes').delete().eq('id', id);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.closeModal();
    UI.toast('OT ' + num + ' eliminada');
    Pages.ordenes();
  });
};

/* ── EDITAR OT ────────────────────────────────────── */
Pages.modalEditarOT = async function (id) {
  const o = await DB.getOrden(id); if (!o) return;
  const empleados = (await DB.getEmpleados()).filter(e => e.rol === 'mecanico');

  UI.openModal('✏️ Editar OT: ' + o.num, `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Estado</label>
        ${UI.estadoSelect(o.estado, `Pages._otEditEstado = this.value`)}
      </div>
      <div class="form-group">
        <label class="form-label">Prioridad</label>
        <select class="form-select" id="eot-prio">
          ${['baja','media','alta','urgente'].map(p =>
            `<option value="${p}" ${o.prioridad===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Mecánico Asignado</label>
      <select class="form-select" id="eot-mec">
        <option value="">Sin asignar</option>
        ${empleados.map(e => `<option value="${e.id}" ${o.mecanico_id===e.id?'selected':''}>${e.nombre}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción del Trabajo</label>
      <textarea class="form-input form-textarea" id="eot-desc" rows="3">${o.descripcion}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha Estimada Entrega</label>
        <input class="form-input" id="eot-fecha" type="date" value="${o.fecha_estimada||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Total (Q)</label>
        <input class="form-input" id="eot-total" type="number" min="0" value="${o.total||0}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas Internas</label>
      <textarea class="form-input form-textarea" id="eot-notas" rows="2">${o.notas||''}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.actualizarOT('${id}')">Guardar Cambios</button>
    </div>`
  );
  Pages._otEditEstado = o.estado;
};

Pages.actualizarOT = async function (id) {
  const ok = await DB.updateOrden(id, {
    estado:         Pages._otEditEstado || 'recibido',
    prioridad:      document.getElementById('eot-prio').value,
    mecanico_id:    document.getElementById('eot-mec').value || null,
    descripcion:    document.getElementById('eot-desc').value.trim(),
    fecha_estimada: document.getElementById('eot-fecha').value || null,
    total:          parseFloat(document.getElementById('eot-total').value) || 0,
    notas:          document.getElementById('eot-notas').value.trim() || null
  });
  if (!ok) { UI.toast('Error al actualizar', 'error'); return; }
  UI.closeModal();
  UI.toast('OT actualizada ✓');
  Pages.ordenes();
};

/* ── WHATSAPP DESDE OT ────────────────────────────── */
Pages.enviarWAOT = async function (otId) {
  const o = await DB.getOrden(otId); if (!o) return;
  const v = o.vehiculos, c = o.clientes;
  if (!c?.tel) { UI.toast('El cliente no tiene teléfono registrado', 'warn'); return; }
  await NOTIF.notificarOTLista(o, c, v);
};
