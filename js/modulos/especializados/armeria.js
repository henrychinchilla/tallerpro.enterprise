/* ═══════════════════════════════════════════════════════════════════════════
   NexusPro v3.0 — especializados/armeria.js
   Módulo vertical: Armería. Venta y compra de armas y municiones con los
   datos de cumplimiento que exige DIGECAM en cada transacción.

   No usa Modulos._especialOT (proyecto con anticipo/estado): la venta de un
   arma es una entrega directa, no un trabajo por fases. Sigue el patrón de
   venta_granos.js — lista única con tipo venta/compra — porque es el mismo
   caso: comercialización directa de un artículo físico, no fabricación.

   Marco legal — Decreto 15-2009, Ley de Armas y Municiones (LAM) arts. 79-90,
   reglamentado por el Acuerdo Gubernativo 85-2011. Ver modalAsesoria() para
   el resumen con fuentes. La app NO se conecta a SIDIGECAM (sin API pública):
   este módulo lleva el control interno, pero la notificación real a DIGECAM
   sigue siendo responsabilidad del taller.
   ═══════════════════════════════════════════════════════════════════════════ */
Modulos.armeria = {
  _data: [], _clientes: [], _proveedores: [], _filtroTipo: '',

  _CATEGORIAS: {
    pistola: 'Pistola', 'revólver': 'Revólver', rifle: 'Rifle', escopeta: 'Escopeta',
    'munición': 'Munición', accesorio: 'Accesorio',
  },
  _LICENCIAS: { tenencia: 'Tarjeta de tenencia', 'portación': 'Licencia de portación' },

  /* Solo el arma en sí lleva número de serie propio. */
  _esArma(categoria) { return ['pistola', 'revólver', 'rifle', 'escopeta'].includes(categoria); },

  /* Tope legal de venta de munición por mes (Ley de Armas y Municiones,
     según reportaje de Prensa Libre — la ley no cita el artículo en esa
     nota; confirmar directo con DIGECAM antes de tomarlo como definitivo).
     Sin licencia no se puede vender munición (ver _validar), así que ese
     caso no debería llegar aquí. */
  _limiteMunicionMes(tipoLicencia) {
    return { tenencia: 200, 'portación': 250 }[tipoLicencia] || 0;
  },

  /* Validación pura (sin DOM), para poder probarla sin levantar un modal.
     Refleja EXACTAMENTE lo que exige la migración (constraints de la BD);
     así el usuario ve el error claro en vez de un 23514 genérico de Postgres. */
  _validar(f) {
    if (!['venta', 'compra'].includes(f.tipo)) return { ok: false, error: 'Tipo de operación inválido' };
    if (f.tipo === 'venta' && !f.cliente_id) return { ok: false, error: 'Selecciona el cliente que compra' };
    if (f.tipo === 'compra' && !f.cliente_id && !f.proveedor_id) return { ok: false, error: 'Selecciona a quién se le compra (cliente o proveedor)' };
    if (!f.categoria) return { ok: false, error: 'Selecciona la categoría del artículo' };
    if (this._esArma(f.categoria) && !String(f.numero_serie || '').trim()) {
      return { ok: false, error: 'El número de serie es obligatorio en armas — DIGECAM lo exige para registrar la venta en SIDIGECAM' };
    }
    if (f.tipo === 'venta' && f.categoria !== 'accesorio') {
      if (!String(f.contraparte_licencia_num || '').trim()) {
        return { ok: false, error: 'Para vender armas o munición hay que registrar la tarjeta de tenencia o licencia de portación del comprador (Ley de Armas y Municiones, venta de munición incluida)' };
      }
      if (!String(f.contraparte_dpi || '').trim()) {
        return { ok: false, error: 'El DPI del comprador es obligatorio en venta de armas o munición — SIDIGECAM lo exige junto con la licencia' };
      }
    }
    if (!(Number(f.cantidad) > 0)) return { ok: false, error: 'La cantidad debe ser mayor a cero' };
    if (Number(f.precio_unit) < 0) return { ok: false, error: 'El precio no puede ser negativo' };
    return { ok: true };
  },

  _colorTipo(t) { return t === 'compra' ? 'purple' : 'cyan'; },

  async render(filtroTipo = '') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._filtroTipo = filtroTipo;
    [this._data, this._clientes, this._proveedores] = await Promise.all([
      DB.getArmeriaOperaciones(filtroTipo ? { tipo: filtroTipo } : {}),
      DB.getClientes(),
      DB.getProveedores(),
    ]);

    const ventas = this._data.filter(o => o.tipo === 'venta');
    const compras = this._data.filter(o => o.tipo === 'compra');
    const ingresoVentas = ventas.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const pendientesDigecam = this._data.filter(o => !o.notificado_digecam).length;

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🎯 Armería</h1>
        <p class="page-subtitle">// ${this._data.length} operaciones registradas</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.inventario.abrirGiro('armeria')" title="Ver y cargar sólo los artículos de este giro">📦 Inventario de armería</button>
          <button class="btn btn-ghost" onclick="Modulos.armeria.modalAsesoria()">⚖️ Asesoría DIGECAM</button>
          <button class="btn btn-ghost" onclick="Modulos.armeria.imprimirLibro()">🖨️ Libro de registro</button>
          <button class="btn btn-amber" onclick="Modulos.armeria.modalForm()">＋ Nueva Operación</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon: '🔺', clase: 'cyan', label: 'Ventas', value: ventas.length })}
          ${UI.kpiCard({ icon: '🔽', clase: 'purple', label: 'Compras', value: compras.length })}
          ${UI.kpiCard({ icon: '💰', clase: 'green', label: 'Ingreso en ventas', value: ingresoVentas, money: true })}
          ${UI.kpiCard({ icon: pendientesDigecam ? '⚠️' : '✅', clase: pendientesDigecam ? 'red' : 'green', label: 'Sin notificar a DIGECAM', value: pendientesDigecam })}
        </div>
        <div style="background:var(--card2);border-left:3px solid var(--amber);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px">
          ⚖️ Este módulo lleva el control interno de cumplimiento (número de serie, licencia del comprador).
          <b>No sustituye el registro en SIDIGECAM</b>: esa notificación la hace el taller directo con DIGECAM.
          Ver <a href="#" onclick="event.preventDefault();Modulos.armeria.modalAsesoria()" style="color:var(--cyan)">Asesoría DIGECAM</a>.
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-sm ${!filtroTipo ? 'btn-cyan' : 'btn-ghost'}" onclick="Modulos.armeria.render('')">Todas</button>
          <button class="btn btn-sm ${filtroTipo === 'venta' ? 'btn-cyan' : 'btn-ghost'}" onclick="Modulos.armeria.render('venta')">🔺 Ventas</button>
          <button class="btn btn-sm ${filtroTipo === 'compra' ? 'btn-cyan' : 'btn-ghost'}" onclick="Modulos.armeria.render('compra')">🔽 Compras</button>
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>No.</th><th>Tipo</th><th>Contraparte</th><th>Artículo</th><th>Serie</th><th>Total</th><th>DIGECAM</th><th>Fecha</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._data.map(o => `<tr>
              <td class="mono-sm"><b>${o.num || '—'}</b></td>
              <td><span class="badge badge-${this._colorTipo(o.tipo)}">${o.tipo === 'compra' ? '🔽 Compra' : '🔺 Venta'}</span></td>
              <td>${o.clientes?.nombre || o.proveedores?.nombre || '—'}</td>
              <td><span class="badge badge-gray">${this._CATEGORIAS[o.categoria] || o.categoria}</span><div style="font-size:11px;color:var(--text3)">${[o.marca, o.modelo, o.calibre].filter(Boolean).join(' · ') || '—'}</div></td>
              <td class="mono-sm">${o.numero_serie || '—'}</td>
              <td class="mono-sm" style="font-weight:700">${UI.q(o.total)}</td>
              <td>${o.notificado_digecam
                ? `<span class="badge badge-green" title="${o.folio_notificacion_digecam ? 'Folio ' + o.folio_notificacion_digecam : ''}">✅ Notificado</span>`
                : `<button class="btn btn-sm btn-ghost" onclick="Modulos.armeria._accionNotificar('${o.id}')" title="Marcar como notificado a DIGECAM">⚠️ Pendiente</button>`}</td>
              <td class="mono-sm">${UI.fecha(o.fecha)}</td>
              <td><div style="display:flex;gap:4px;flex-wrap:wrap">
                ${Modulos.btnAccion('ver', `Modulos.armeria.verDetalle('${o.id}')`)}
                ${Modulos.btnAccion('editar', `Modulos.armeria.modalForm('${o.id}')`)}
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('armeria_operaciones','${o.id}','la operación ${o.num || ''}',()=>Modulos.armeria.render(Modulos.armeria._filtroTipo))`)}
              </div></td>
            </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text3)">Sin operaciones. Registra la primera con "＋ Nueva Operación".</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  },

  async verDetalle(id) {
    const o = this._data.find(x => x.id === id); if (!o) return;
    UI.modal(`📋 Operación ${o.num || ''}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><div style="font-size:11px;color:var(--text3)">Tipo</div><div><span class="badge badge-${this._colorTipo(o.tipo)}">${o.tipo === 'compra' ? '🔽 Compra' : '🔺 Venta'}</span></div></div>
        <div><div style="font-size:11px;color:var(--text3)">Contraparte</div><div style="font-weight:700">${o.clientes?.nombre || o.proveedores?.nombre || '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Categoría</div><div>${this._CATEGORIAS[o.categoria] || o.categoria}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Marca / Modelo / Calibre</div><div>${[o.marca, o.modelo, o.calibre].filter(Boolean).join(' · ') || '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Número de serie</div><div class="mono-sm">${o.numero_serie || '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">País de origen</div><div>${o.pais_origen || '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Cantidad</div><div>${UI.numero ? UI.numero(o.cantidad) : o.cantidad}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Total</div><div style="font-weight:700;color:var(--green)">${UI.q(o.total)}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">DPI</div><div class="mono-sm">${o.contraparte_dpi || '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Licencia de la contraparte</div><div>${o.contraparte_licencia_tipo ? `${this._LICENCIAS[o.contraparte_licencia_tipo]} · ${o.contraparte_licencia_num || '—'}${o.contraparte_licencia_vencimiento ? ' · vence ' + UI.fecha(o.contraparte_licencia_vencimiento) : ''}` : '—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Foto / Huella en el local</div><div>${o.foto_tomada ? '📷 sí' : '📷 no'} · ${o.huella_tomada ? '👆 sí' : '👆 no'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">DIGECAM</div><div>${o.notificado_digecam ? `✅ Notificado${o.fecha_notificacion_digecam ? ' el ' + UI.fecha(o.fecha_notificacion_digecam) : ''}${o.folio_notificacion_digecam ? ' · folio ' + o.folio_notificacion_digecam : ''}` : '⚠️ Pendiente de notificar'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Fecha</div><div>${UI.fecha(o.fecha)}</div></div>
      </div>
      ${o.notas ? `<div style="background:var(--card2);padding:10px;border-radius:6px;margin-bottom:12px;font-size:13px">${o.notas}</div>` : ''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        ${!o.notificado_digecam ? `<button class="btn btn-cyan" onclick="UI.cerrarModal();Modulos.armeria._accionNotificar('${o.id}')">⚠️ Marcar notificado</button>` : ''}
        <button class="btn btn-amber" onclick="UI.cerrarModal();Modulos.armeria.modalForm('${o.id}')">✏️ Editar</button>
      </div>`, '640px');
  },

  async modalForm(id = null) {
    const o = id ? this._data.find(x => x.id === id) || {} : {};
    if (!this._clientes.length) this._clientes = await DB.getClientes();
    if (!this._proveedores.length) this._proveedores = await DB.getProveedores();
    const esEdicion = !!id;
    const tipo = o.tipo || 'venta';

    UI.modal(`${esEdicion ? '✏️ Editar' : '＋ Nueva'} Operación de Armería`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo de operación *</label>
          <select class="form-select" id="arm-tipo" onchange="Modulos.armeria._toggleContraparte()">
            <option value="venta" ${tipo === 'venta' ? 'selected' : ''}>🔺 Venta a cliente</option>
            <option value="compra" ${tipo === 'compra' ? 'selected' : ''}>🔽 Compra (particular o proveedor)</option>
          </select></div>
        <div class="form-group"><label class="form-label">Categoría *</label>
          <select class="form-select" id="arm-categoria" onchange="Modulos.armeria._toggleSerie()">
            <option value="">— Selecciona —</option>
            ${Object.entries(this._CATEGORIAS).map(([k, l]) => `<option value="${k}" ${o.categoria === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row" id="arm-grupo-cliente">
        <div class="form-group"><label class="form-label">Cliente ${tipo === 'venta' ? '*' : '(si el vendedor es particular)'}</label>
          <select class="form-select" id="arm-cliente">
            <option value="">— Selecciona —</option>
            ${this._clientes.map(c => `<option value="${c.id}" ${o.cliente_id === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group" id="arm-grupo-proveedor" style="${tipo === 'venta' ? 'display:none' : ''}"><label class="form-label">Proveedor (si es compra a mayorista)</label>
          <select class="form-select" id="arm-proveedor">
            <option value="">— Selecciona —</option>
            ${this._proveedores.map(p => `<option value="${p.id}" ${o.proveedor_id === p.id ? 'selected' : ''}>${p.nombre}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Marca</label>
          <input class="form-input" id="arm-marca" value="${o.marca || ''}" placeholder="Glock, Smith &amp; Wesson, Remington..."></div>
        <div class="form-group"><label class="form-label">Modelo</label>
          <input class="form-input" id="arm-modelo" value="${o.modelo || ''}"></div>
        <div class="form-group"><label class="form-label">Calibre</label>
          <input class="form-input" id="arm-calibre" value="${o.calibre || ''}" placeholder="9mm, .38, .22LR, 12 gauge..."></div>
      </div>
      <div class="form-row">
        <div class="form-group" id="arm-grupo-serie"><label class="form-label">Número de serie <span id="arm-serie-req" style="color:var(--red)">${this._esArma(o.categoria) ? '*' : ''}</span></label>
          <input class="form-input" id="arm-serie" value="${o.numero_serie || ''}"
            style="font-family:monospace" placeholder="Obligatorio en armas — lo exige DIGECAM">
          <div style="font-size:11px;color:var(--text3);margin-top:2px">DIGECAM exige el número de serie de cada arma para registrar la venta en SIDIGECAM.</div></div>
        <div class="form-group"><label class="form-label">País de origen</label>
          <input class="form-input" id="arm-origen" value="${o.pais_origen || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cantidad *</label>
          <input class="form-input" id="arm-cantidad" type="number" min="1" step="1" value="${o.cantidad || 1}" onchange="Modulos.armeria._calcTotal()"></div>
        <div class="form-group"><label class="form-label">Precio unitario (Q) *</label>
          <input class="form-input" id="arm-precio" type="number" min="0" step="0.01" value="${o.precio_unit || 0}" onchange="Modulos.armeria._calcTotal()"></div>
        <div class="form-group"><label class="form-label">Total (Q)</label>
          <input class="form-input" id="arm-total" type="number" readonly value="${o.total || 0}" style="background:var(--card2);font-weight:700"></div>
      </div>
      <div style="background:var(--card2);border-radius:8px;padding:10px 12px;margin:8px 0">
        <div style="font-size:12px;font-weight:700;margin-bottom:8px">⚖️ Cumplimiento DIGECAM de la contraparte</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">DPI del comprador/vendedor</label>
            <input class="form-input" id="arm-dpi" value="${o.contraparte_dpi || ''}" placeholder="0000 00000 0000" style="font-family:monospace"></div>
          <div class="form-group"><label class="form-label">Licencia presentada</label>
            <select class="form-select" id="arm-lic-tipo">
              <option value="">— Ninguna (solo accesorios) —</option>
              ${Object.entries(this._LICENCIAS).map(([k, l]) => `<option value="${k}" ${o.contraparte_licencia_tipo === k ? 'selected' : ''}>${l}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Número de licencia</label>
            <input class="form-input" id="arm-lic-num" value="${o.contraparte_licencia_num || ''}"></div>
          <div class="form-group"><label class="form-label">Vence</label>
            <input class="form-input" id="arm-lic-vence" type="date" value="${o.contraparte_licencia_vencimiento || ''}"></div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">DPI y licencia son obligatorios para vender armas o munición (no para accesorios) — es lo que SIDIGECAM registra del comprador.</div>
        <div style="display:flex;gap:16px;margin-top:6px">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="arm-foto" ${o.foto_tomada ? 'checked' : ''}> Foto tomada en el local</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="arm-huella" ${o.huella_tomada ? 'checked' : ''}> Huella tomada en el local</label>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Forma de pago</label>
          <select class="form-select" id="arm-forma">
            <option value="efectivo" ${(o.forma_pago || 'efectivo') === 'efectivo' ? 'selected' : ''}>💵 Efectivo</option>
            <option value="tarjeta" ${o.forma_pago === 'tarjeta' ? 'selected' : ''}>💳 Tarjeta</option>
            <option value="transferencia" ${o.forma_pago === 'transferencia' ? 'selected' : ''}>🏦 Transferencia</option>
          </select></div>
        <div class="form-group"><label class="form-label">Fecha</label>
          <input class="form-input" id="arm-fecha" type="date" value="${(o.fecha || new Date().toISOString()).slice(0, 10)}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="arm-notas" rows="2">${o.notas || ''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.armeria.guardar('${id || ''}')">${esEdicion ? 'Guardar Cambios' : 'Crear Operación'}</button>
      </div>`, '760px');
  },

  /* Muestra/oculta cliente vs. proveedor según el tipo de operación. */
  _toggleContraparte() {
    const tipo = document.getElementById('arm-tipo')?.value;
    const grupoProv = document.getElementById('arm-grupo-proveedor');
    if (grupoProv) grupoProv.style.display = tipo === 'compra' ? '' : 'none';
  },

  /* Marca visualmente el número de serie como obligatorio si la categoría es un arma. */
  _toggleSerie() {
    const categoria = document.getElementById('arm-categoria')?.value;
    const req = document.getElementById('arm-serie-req');
    if (req) req.textContent = this._esArma(categoria) ? '*' : '';
  },

  _calcTotal() {
    const cant = parseFloat(document.getElementById('arm-cantidad')?.value) || 0;
    const precio = parseFloat(document.getElementById('arm-precio')?.value) || 0;
    const t = document.getElementById('arm-total');
    if (t) t.value = (cant * precio).toFixed(2);
  },

  async guardar(id = '') {
    const fields = {
      tipo: document.getElementById('arm-tipo')?.value || 'venta',
      cliente_id: document.getElementById('arm-cliente')?.value || null,
      proveedor_id: document.getElementById('arm-proveedor')?.value || null,
      categoria: document.getElementById('arm-categoria')?.value || '',
      marca: document.getElementById('arm-marca')?.value || null,
      modelo: document.getElementById('arm-modelo')?.value || null,
      calibre: document.getElementById('arm-calibre')?.value || null,
      numero_serie: document.getElementById('arm-serie')?.value || null,
      pais_origen: document.getElementById('arm-origen')?.value || null,
      cantidad: parseFloat(document.getElementById('arm-cantidad')?.value) || 0,
      precio_unit: parseFloat(document.getElementById('arm-precio')?.value) || 0,
      contraparte_dpi: document.getElementById('arm-dpi')?.value || null,
      contraparte_licencia_tipo: document.getElementById('arm-lic-tipo')?.value || null,
      contraparte_licencia_num: document.getElementById('arm-lic-num')?.value || null,
      contraparte_licencia_vencimiento: document.getElementById('arm-lic-vence')?.value || null,
      foto_tomada: !!document.getElementById('arm-foto')?.checked,
      huella_tomada: !!document.getElementById('arm-huella')?.checked,
      forma_pago: document.getElementById('arm-forma')?.value || 'efectivo',
      fecha: document.getElementById('arm-fecha')?.value || null,
      notas: document.getElementById('arm-notas')?.value || null,
    };
    fields.total = Math.round(fields.cantidad * fields.precio_unit * 100) / 100;
    if (fields.tipo === 'venta') fields.proveedor_id = null;

    const v = this._validar(fields);
    if (!v.ok) { UI.toast(v.error, 'error'); return; }

    if (fields.tipo === 'venta' && fields.categoria === 'munición') {
      const limite = this._limiteMunicionMes(fields.contraparte_licencia_tipo);
      const yaVendido = await DB.getConsumoMunicionMes(fields.contraparte_dpi, id || null);
      const nuevoTotal = yaVendido + fields.cantidad;
      if (limite && nuevoTotal > limite) {
        UI.toast(`Excede el tope legal: este DPI ya lleva ${yaVendido} cartuchos este mes y el límite con ${this._LICENCIAS[fields.contraparte_licencia_tipo].toLowerCase()} es ${limite}/mes (máximo ${Math.max(0, limite - yaVendido)} más)`, 'error');
        return;
      }
    }

    if (id) fields.id = id;
    const { error } = await DB.upsertArmeriaOperacion(fields);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.cerrarModal();
    UI.toast(id ? 'Operación actualizada ✓' : 'Operación creada ✓');
    this.render(this._filtroTipo);
  },

  /* Registrar que la notificación a DIGECAM ya se hizo (control interno;
     la app no envía nada a SIDIGECAM — no hay API pública). */
  async _accionNotificar(id) {
    const o = this._data.find(x => x.id === id); if (!o) return;
    UI.modal('⚠️ Marcar como notificado a DIGECAM', `
      <div style="font-size:13px;color:var(--text3);margin-bottom:12px">Operación <b>${o.num || ''}</b> — registra la fecha y el folio con que el taller reportó esta transacción a DIGECAM.</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha de notificación</label>
          <input class="form-input" id="arm-not-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label class="form-label">Folio / referencia</label>
          <input class="form-input" id="arm-not-folio" placeholder="Número de trámite, folio SIDIGECAM..."></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-cyan" onclick="Modulos.armeria._guardarNotificacion('${id}')">💾 Guardar</button>
      </div>`, '480px');
  },

  async _guardarNotificacion(id) {
    const fecha_notificacion_digecam = document.getElementById('arm-not-fecha')?.value || null;
    const folio_notificacion_digecam = document.getElementById('arm-not-folio')?.value || null;
    const { error } = await DB.upsertArmeriaOperacion({ id, notificado_digecam: true, fecha_notificacion_digecam, folio_notificacion_digecam });
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.cerrarModal();
    UI.toast('Notificación registrada ✓');
    this.render(this._filtroTipo);
  },

  /* Libro de registro imprimible: lo que un inspector de DIGECAM pide ver
     en cualquier visita. No es el libro oficial de DIGECAM (ese lo define
     DIGECAM), es el respaldo que este módulo puede ofrecer de una vez. */
  imprimirLibro() {
    const hoy = new Date().toLocaleDateString('es-GT');
    const filas = this._data.map(o => `<tr>
      <td>${o.num || '—'}</td><td>${o.tipo === 'compra' ? 'Compra' : 'Venta'}</td>
      <td>${o.clientes?.nombre || o.proveedores?.nombre || '—'}</td>
      <td>${o.contraparte_dpi || '—'}</td>
      <td>${this._CATEGORIAS[o.categoria] || o.categoria}</td>
      <td>${[o.marca, o.modelo, o.calibre].filter(Boolean).join(' ')}</td>
      <td>${o.numero_serie || '—'}</td>
      <td>${o.contraparte_licencia_num || '—'}</td>
      <td>${UI.q(o.total)}</td>
      <td>${o.notificado_digecam ? 'Sí' : 'No'}</td>
      <td>${UI.fecha(o.fecha)}</td>
    </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Libro de Registro — Armería</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;padding:20px;font-size:11px}
      h2{margin:0 0 4px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #999;padding:4px 6px;text-align:left}
      th{background:#eee}
    </style></head><body>
    <h2>NexusPro — Libro de Registro de Armería</h2>
    <p>Generado ${hoy} · ${this._data.length} operaciones</p>
    <table><thead><tr><th>No.</th><th>Tipo</th><th>Contraparte</th><th>DPI</th><th>Categoría</th><th>Marca/Modelo/Calibre</th><th>Serie</th><th>Licencia</th><th>Total</th><th>DIGECAM</th><th>Fecha</th></tr></thead>
    <tbody>${filas || '<tr><td colspan="11">Sin operaciones</td></tr>'}</tbody></table>
    </body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  },

  /* Asesoría legal estática: resumen de la Ley de Armas y Municiones y los
     trámites DIGECAM que le tocan a una armería. Contenido fijo con fuentes
     citadas — no es un asesor dinámico, es referencia rápida para el
     mostrador. Las cifras de trámites (costos, plazos, inversión) vienen de
     fuentes secundarias (prensa/portales de trámites), no del texto legal:
     verificar directo en digecam.mil.gt antes de tomarlas como definitivas. */
  modalAsesoria() {
    UI.modal('⚖️ Asesoría DIGECAM — Ley de Armas y Municiones', `
      <div style="font-size:13px;line-height:1.6">
        <p><b>Base legal:</b> Decreto 15-2009, Ley de Armas y Municiones (LAM) — arts. 79 a 90 regulan la licencia de comercialización/compraventa. Reglamento: Acuerdo Gubernativo 85-2011. DIGECAM (Dirección General de Control de Armas y Municiones, Ministerio de la Defensa) es la única entidad que emite licencias de tenencia y portación, autoriza importación/venta y hace pruebas balísticas.</p>

        <p><b>Licencia de la armería (comercialización/compraventa):</b> solo se otorga a personas jurídicas (sociedad mercantil con patente de comercio y NIT vigentes). Vender, intermediar o almacenar armas/municiones con fines comerciales sin esta licencia es delito (6 a 10 años de prisión). El trámite exige inspección física del local y aprobación de la Comisión Interinstitucional de Armas.</p>

        <p><b>En cada venta, DIGECAM/SIDIGECAM exige registrar:</b></p>
        <ul style="margin:4px 0 8px 18px">
          <li>Datos del comprador: nombre, DPI, dirección, teléfono, foto y huella tomadas en el local</li>
          <li>Número y vigencia de su licencia (tarjeta de tenencia o licencia de portación)</li>
          <li>Datos del arma: marca, modelo, calibre, número de serie, país de origen, tipo</li>
          <li>Datos de la munición si aplica: calibre, marca, cantidad, lote</li>
          <li>Número de factura y forma de pago, fecha y hora de la entrega</li>
        </ul>

        <p><b>Munición:</b> se puede vender con solo mostrar la tarjeta de tenencia o la licencia de portación del arma — no requiere un trámite de licencia aparte.</p>

        <p><b>⚠️ Tope legal de venta de munición por mes</b> (este módulo lo controla automáticamente por DPI al guardar una venta):</p>
        <ul style="margin:4px 0 8px 18px">
          <li><b>200 cartuchos/mes</b> a quien presenta tarjeta de <b>tenencia</b></li>
          <li><b>250 cartuchos/mes</b> a quien presenta licencia de <b>portación</b></li>
          <li>Venta libre solo dentro de un polígono de tiro, para uso ahí mismo (no aplica a mostrador)</li>
        </ul>
        <p style="font-size:11px;color:var(--text3);margin-top:-4px">Cifra según reportaje de Prensa Libre sobre la ley (no cita el número de artículo) — confirmar directo con DIGECAM. La armería debe llevar, además, un libro con cuánta munición y a quién se le vendió: es lo que genera 🖨️ Libro de registro con el DPI de cada comprador.</p>

        <p><b>Licencia de portación (del cliente) — requisitos para tramitarla</b> (útil para orientar a un cliente, no lo tramita esta app):</p>
        <ul style="margin:4px 0 8px 18px">
          <li>Nombre completo, edad, estado civil, nacionalidad, profesión, residencia, DPI y lugar para notificaciones</li>
          <li>Carecer de antecedentes penales y policiales vigentes</li>
          <li>Declaración jurada ante notario: no padecer enfermedad mental, no ser desertor del Ejército ni haber abandonado empleo en la PNC</li>
          <li>Certificación de evaluación teórica, práctica y psicológica aprobada</li>
          <li>Datos del arma a registrar: marca, modelo, calibre, largo de cañón, número de serie</li>
          <li>Vigencia de la licencia: 1 a 3 años, renovable</li>
        </ul>
        <p style="font-size:11px;color:var(--text3);margin-top:-4px">Guatemala emite el DPI a partir de los 18 años (RENAP) — exigir DPI ya filtra mayoría de edad; la ley no precisó un número de edad distinto en las fuentes consultadas.</p>

        <p><b>Compraventa entre particulares</b> (fuera de una armería, vía notario): el testimonio de la escritura debe presentarse a DIGECAM dentro de 8 días de celebrado el contrato; el notario debe avisar del contrato dentro de 15 días.</p>

        <p><b>Prohibido:</b> armas de guerra, automáticas, de uso exclusivo del Ejército, munición de guerra (explosiva, incendiaria, perforante, expansiva prohibida), armas con número de serie alterado o borrado.</p>

        <p><b>Formatos oficiales de referencia</b> (para ver el trámite tal como lo pide el gobierno, no una copia hecha por esta app):</p>
        <ul style="margin:4px 0 8px 18px;font-size:12px">
          <li>Registro de tenencia con contrato de compraventa (persona individual): tramites.gob.gt/servicio/1640</li>
          <li>Evaluación y primera licencia de portación de arma de fuego: tramites.gob.gt/servicio/1642</li>
          <li>Renovación de licencia de portación: tramites.gob.gt/servicio/1643</li>
          <li>Licencia de compraventa (armería): catálogo de trámites de DIGECAM, digecam.mil.gt/web/tramites.php</li>
        </ul>

        <p style="color:var(--text3);font-size:11px;margin-top:10px">Este resumen es orientativo y no sustituye asesoría legal ni la verificación directa con DIGECAM (digecam.mil.gt) antes de operar. Fuentes: Decreto 15-2009 y su reglamento (Acuerdo Gubernativo 85-2011); trámites y cifras de costos/plazos/límites tomados de portales de trámites y prensa — confirmar vigencia antes de usarlos como requisito del negocio.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
      </div>`, '640px');
  },
};
