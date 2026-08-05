/* NexusPro v3.0 — agropecuaria/agroservicio.js
   Módulo vertical: Agroservicio. Venta y asesoramiento de semillas, fertilizantes,
   plaguicidas, herramientas agrícolas y servicios técnicos.
   OT automática al crear; anticipo 50% con comprobante imprimible. */
Modulos.agroservicio = {
  _data: [], _clientes: [], _filtroEstado: '',

  _TIPOS: {
    semillas:'Semillas Certificadas', fertilizante:'Fertilizante',
    plaguicida:'Plaguicida/Herbicida', herramienta:'Herramientas Agrícolas',
    asesoramiento:'Asesoramiento Técnico', otro:'Otro'
  },
  _ESTADOS: { solicitado:'Solicitado', en_proceso:'En Proceso', completado:'Completado', entregado:'Entregado', cancelado:'Cancelado' },
  _colorEstado(e) { return { solicitado:'gray', en_proceso:'amber', completado:'cyan', entregado:'green', cancelado:'red' }[e]||'gray'; },

  async render(filtroEstado='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._filtroEstado = filtroEstado;
    [this._data, this._clientes] = await Promise.all([
      DB.getAgroservicioPedidos(filtroEstado ? { estado: filtroEstado } : {}),
      DB.getClientes()
    ]);

    const activos = this._data.filter(p=>!['entregado','cancelado'].includes(p.estado));
    const enProceso = this._data.filter(p=>p.estado==='en_proceso').length;
    const saldoPorCobrar = this._data.reduce((s,p)=>s+(Number(p.saldo)||0),0);
    const hoy = new Date().toISOString().slice(0,10);
    const atrasados = this._data.filter(p=>p.fecha_entrega && p.fecha_entrega<hoy && !['entregado','cancelado'].includes(p.estado)).length;

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🌾 Agroservicio</h1>
        <p class="page-subtitle">// ${this._data.length} servicios/productos registrados</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" onclick="Modulos.inventario.abrirGiro('agroservicio')" title="Ver y cargar sólo los artículos de este giro">📦 Inventario del agroservicio</button>
          <button class="btn btn-amber" onclick="Modulos.agroservicio.modalForm()">＋ Nuevo Servicio</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'🌾', clase:'cyan', label:'Servicios activos', value: activos.length })}
          ${UI.kpiCard({ icon:'🔧', clase:'amber', label:'En proceso', value: enProceso })}
          ${UI.kpiCard({ icon:'💰', clase: saldoPorCobrar?'red':'gray', label:'Saldo por cobrar', value: saldoPorCobrar, money:true })}
          ${UI.kpiCard({ icon:'⚠️', clase: atrasados?'red':'gray', label:'Atrasados', value: atrasados })}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-sm ${!filtroEstado?'btn-cyan':'btn-ghost'}" onclick="Modulos.agroservicio.render('')">Todos</button>
          ${Object.entries(this._ESTADOS).map(([k,l])=>`<button class="btn btn-sm ${filtroEstado===k?'btn-cyan':'btn-ghost'}" onclick="Modulos.agroservicio.render('${k}')">${l}</button>`).join('')}
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>No.</th><th>Cliente</th><th>Servicio/Producto</th><th>Descripción</th><th>Entrega</th><th>Precio</th><th>Anticipo</th><th>Saldo</th><th>OT</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._data.map(p=>`<tr>
              <td class="mono-sm"><b>${p.num||'—'}</b></td>
              <td>${UI.esc(p.clientes?.nombre||'—')}</td>
              <td><span class="badge badge-green">${this._TIPOS[p.tipo_servicio]||p.tipo_servicio}</span>${p.cantidad>1?` ×${p.cantidad}`:''}<div style="font-size:11px;color:var(--text3)">${p.tipo_inicio==='directo'?'⚡ Directo':'📋 Cotización'}</div></td>
              <td style="font-size:12px;max-width:200px">${UI.esc(p.descripcion||'—')}</td>
              <td class="mono-sm">${p.fecha_entrega?UI.fecha(p.fecha_entrega):'—'}</td>
              <td class="mono-sm">${UI.q(p.precio_venta)}</td>
              <td class="mono-sm ${p.anticipo>0?'text-green':''}">${UI.q(p.anticipo)}</td>
              <td class="mono-sm ${p.saldo>0?'text-red':'text-green'}">${UI.q(p.saldo)}</td>
              <td>${Modulos._especialOT.btnOT(p,'agroservicio')}</td>
              <td><span class="badge badge-${this._colorEstado(p.estado)}">${this._ESTADOS[p.estado]||p.estado}</span></td>
              <td><div style="display:flex;gap:4px;flex-wrap:wrap">
                ${Modulos.btnAccion('ver', `Modulos.agroservicio.verDetalle('${p.id}')`)}
                ${Modulos.btnAccion('editar', `Modulos.agroservicio.modalForm('${p.id}')`)}
                <button class="btn btn-sm btn-cyan" onclick="Modulos.agroservicio._accionAnticipo('${p.id}')" title="Registrar anticipo">💰</button>
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('agroservicio_servicios','${p.id}','el servicio ${p.num||''}',()=>Modulos.agroservicio.render(Modulos.agroservicio._filtroEstado))`)}
              </div></td>
            </tr>`).join('')||'<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--text3)">Sin servicios. Registra el primero con "＋ Nuevo Servicio".</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  },

  async verDetalle(id) {
    const p = this._data.find(x=>x.id===id); if (!p) return;
    UI.modal(`📋 Servicio ${p.num||''}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><div style="font-size:11px;color:var(--text3)">Cliente</div><div style="font-weight:700">${UI.esc(p.clientes?.nombre||'—')}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Servicio</div><div>${this._TIPOS[p.tipo_servicio]||p.tipo_servicio}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Estado</div><div><span class="badge badge-${this._colorEstado(p.estado)}">${this._ESTADOS[p.estado]||p.estado}</span></div></div>
        <div><div style="font-size:11px;color:var(--text3)">Inicio</div><div>${p.tipo_inicio==='directo'?'⚡ Directo':'📋 Cotización'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Descripción</div><div>${UI.esc(p.descripcion||'—')}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Cantidad</div><div>${p.cantidad}  ${p.unidad||'unid.'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Fecha Entrega</div><div>${p.fecha_entrega?UI.fecha(p.fecha_entrega):'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Precio Venta</div><div class="mono-sm" style="font-weight:700">${UI.q(p.precio_venta)}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Abonado</div><div class="mono-sm" style="font-weight:700;color:var(--green)">${UI.q(p.anticipo)}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Saldo</div><div class="mono-sm" style="font-weight:700;color:var(--${p.saldo>0?'red':'green'})">${UI.q(p.saldo)}</div></div>
      </div>
      ${p.orden_id?`<div style="background:var(--card2);padding:10px;border-radius:6px;display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="font-size:20px">🔧</span>
        <div><div style="font-size:11px;color:var(--text3)">OT vinculada</div><div style="font-weight:700;color:var(--cyan)">${p.ot_num||p.orden_id}</div></div>
      </div>`:`<div style="color:var(--text3);font-size:12px;margin-bottom:10px">Sin OT. Se genera al guardar (si es directo) o al iniciar proceso.</div>`}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        ${!p.orden_id?`<button class="btn btn-cyan" onclick="UI.cerrarModal();Modulos.agroservicio._accionGenerarOT('${p.id}')">🔧 Generar OT</button>`:''}
        <button class="btn btn-ghost" onclick="UI.cerrarModal();Modulos.agroservicio._accionAnticipo('${p.id}')">💰 Abono</button>
        <button class="btn btn-amber" onclick="UI.cerrarModal();Modulos.agroservicio.modalForm('${p.id}')">✏️ Editar</button>
      </div>`, '560px');
  },

  modalForm(id=null) {
    const p = id ? this._data.find(x=>x.id===id) : null;
    const titulo = id ? `✏️ Editar: ${p.num||''}` : '🌾 Nuevo Servicio';

    const form = `
      <div style="display:grid;gap:10px">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cliente *</label>
            <select class="form-input" id="form-cliente">
              <option value="">— Seleccionar cliente —</option>
              ${this._clientes.map(c=>`<option value="${c.id}" ${p?.cliente_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tipo de Servicio *</label>
            <select class="form-input" id="form-tipo">
              <option value="">— Seleccionar —</option>
              ${Object.entries(this._TIPOS).map(([k,v])=>`<option value="${k}" ${p?.tipo_servicio===k?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Descripción (semilla, fertilizante, etc.)</label>
          <textarea class="form-input" id="form-desc" style="min-height:60px">${UI.esc(p?.descripcion||'')}</textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cantidad *</label>
            <div style="display:flex;gap:6px">
              <input class="form-input" type="number" id="form-cant" value="${p?.cantidad||1}" min="0.01" step="0.01">
              <select class="form-input" id="form-unidad" style="flex:0 0 100px">
                <option value="kg" ${p?.unidad==='kg'?'selected':''}>kg</option>
                <option value="lt" ${p?.unidad==='lt'?'selected':''}>lt</option>
                <option value="bolsa" ${p?.unidad==='bolsa'?'selected':''}>bolsa</option>
                <option value="unid." ${!p?.unidad || p?.unidad==='unid.'?'selected':''}>unid.</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Precio Venta (Q) *</label>
            <input class="form-input" type="number" id="form-precio" value="${p?.precio_venta||0}" min="0" step="0.01">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Fecha Entrega *</label>
            <input class="form-input" type="date" id="form-fecha" value="${p?.fecha_entrega||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Tipo de Inicio *</label>
            <select class="form-input" id="form-inicio">
              <option value="directo" ${p?.tipo_inicio==='directo'?'selected':''}>⚡ Directo (sin cotización)</option>
              <option value="cotizacion" ${p?.tipo_inicio==='cotizacion'?'selected':''}>📋 Vía cotización</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-input" id="form-estado">
            ${Object.entries(this._ESTADOS).map(([k,v])=>`<option value="${k}" ${p?.estado===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>

        <div class="alert alert-cyan" style="margin-top:8px;font-size:11px">
          <div class="alert-icon">💡</div>
          <div class="alert-body">El anticipo se registra con el botón 💰 cuando entra el dinero (sugerido 50%), y emite comprobante imprimible. Al crear "⚡ Directo" se genera la OT automáticamente.</div>
        </div>
      </div>`;

    UI.modal(titulo, form, '600px', [
      { label:'Cancelar', onclick:() => UI.cerrarModal(), clase:'ghost' },
      { label: id?'Guardar Cambios':'Crear Servicio', onclick:() => Modulos.agroservicio._guardar(id), clase:'amber' }
    ]);
  },

  async _guardar(id) {
    const cliente_id = document.getElementById('form-cliente').value;
    const tipo_servicio = document.getElementById('form-tipo').value;
    const descripcion = document.getElementById('form-desc').value;
    const cantidad = parseFloat(document.getElementById('form-cant').value) || 0;
    const unidad = document.getElementById('form-unidad').value || 'unid.';
    const precio_venta = parseFloat(document.getElementById('form-precio').value) || 0;
    const fecha_entrega = document.getElementById('form-fecha').value;
    const tipo_inicio = document.getElementById('form-inicio').value;
    const estado = document.getElementById('form-estado').value;

    if (!cliente_id||!tipo_servicio||!cantidad||!precio_venta||!fecha_entrega) {
      UI.toast('Completa los campos obligatorios (*)', 'error'); return;
    }

    const prev = id ? this._data.find(x=>x.id===id) : null;
    const estadoPrev = prev?.estado || 'solicitado';
    const prevOrdenId = prev?.orden_id || null;
    /* El anticipo se registra cuando entra el dinero (modal de abono),
       no se asume 50% al crear: antes el saldo nacía cobrado a medias. */
    const anticipo = Number(prev?.anticipo) || 0;

    const payload = {
      cliente_id, tipo_servicio, descripcion, cantidad, unidad,
      precio_venta, anticipo, saldo: Math.max(0, precio_venta - anticipo),
      fecha_entrega, tipo_inicio, estado
    };
    if (id) payload.id = id;

    const { data: saved, error } = await DB.upsertAgroservicio(payload);
    if (error) { UI.toast('Error: '+error.message, 'error'); return; }
    UI.cerrarModal();
    UI.toast(id ? 'Servicio actualizado ✓' : 'Servicio creado ✓');

    const debeOT = !prevOrdenId && (
      tipo_inicio === 'directo' ||
      (estadoPrev === 'solicitado' && estado === 'en_proceso')
    );
    if (debeOT) {
      const proyecto = {
        ...prev, ...payload, ...(saved||{}), id: saved?.id||id,
        clientes: { nombre: this._clientes.find(c=>c.id===cliente_id)?.nombre||'' },
        orden_id: null,
      };
      const ot = await Modulos._especialOT.generarOT(
        'agroservicio_servicios', proyecto, 'precio_venta', 'agroservicio',
        s => `AGRO ${s.num||''}: ${this._TIPOS[s.tipo_servicio]||s.tipo_servicio} — ${s.descripcion||''}`.slice(0,200)
      );
      if (ot) await Modulos._especialOT.modalAnticipo(
        'agroservicio_servicios', { ...proyecto, orden_id: ot.id },
        'precio_venta', 'agroservicio', 'agroservicio', ot.num
      );
    }
    this.render(this._filtroEstado);
  },

  async _accionGenerarOT(id) {
    const p = this._data.find(x=>x.id===id); if (!p) return;
    const ot = await Modulos._especialOT.generarOT(
      'agroservicio_servicios', p, 'precio_venta', 'agroservicio',
      s => `AGRO ${s.num||''}: ${this._TIPOS[s.tipo_servicio]||s.tipo_servicio} — ${s.descripcion||''}`.slice(0,200)
    );
    if (ot) {
      await getSB().from('agroservicio_servicios').update({ estado:'en_proceso' }).eq('id',id);
      await Modulos._especialOT.modalAnticipo(
        'agroservicio_servicios', { ...p, orden_id: ot.id },
        'precio_venta', 'agroservicio', 'agroservicio', ot.num
      );
    }
    this.render(this._filtroEstado);
  },

  /* Usa el modal compartido: acumula abonos, deja histórico e imprime comprobante */
  async _accionAnticipo(id) {
    const p = this._data.find(x=>x.id===id); if (!p) return;
    await Modulos._especialOT.modalAnticipo(
      'agroservicio_servicios', p, 'precio_venta', 'agroservicio', 'agroservicio', p.ot_num||''
    );
  }
};
