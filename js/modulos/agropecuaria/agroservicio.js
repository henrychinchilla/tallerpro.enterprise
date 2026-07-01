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
              <td>${p.clientes?.nombre||'—'}</td>
              <td><span class="badge badge-green">${this._TIPOS[p.tipo_servicio]||p.tipo_servicio}</span>${p.cantidad>1?` ×${p.cantidad}`:''}<div style="font-size:11px;color:var(--text3)">${p.tipo_inicio==='directo'?'⚡ Directo':'📋 Cotización'}</div></td>
              <td style="font-size:12px;max-width:200px">${p.descripcion||'—'}</td>
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
        <div><div style="font-size:11px;color:var(--text3)">Cliente</div><div style="font-weight:700">${p.clientes?.nombre||'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Servicio</div><div>${this._TIPOS[p.tipo_servicio]||p.tipo_servicio}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Estado</div><div><span class="badge badge-${this._colorEstado(p.estado)}">${this._ESTADOS[p.estado]||p.estado}</span></div></div>
        <div><div style="font-size:11px;color:var(--text3)">Inicio</div><div>${p.tipo_inicio==='directo'?'⚡ Directo':'📋 Cotización'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Descripción</div><div>${p.descripcion||'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Cantidad</div><div>${p.cantidad}  ${p.unidad||'unid.'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Fecha Entrega</div><div>${p.fecha_entrega?UI.fecha(p.fecha_entrega):'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Precio Venta</div><div class="mono-sm" style="font-weight:700">${UI.q(p.precio_venta)}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Anticipo (50%)</div><div class="mono-sm" style="font-weight:700;color:var(--green)">${UI.q(p.anticipo)}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Saldo</div><div class="mono-sm" style="font-weight:700;color:var(--${p.saldo>0?'red':'green'})">${UI.q(p.saldo)}</div></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
      </div>`, '520px');
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
          <textarea class="form-input" id="form-desc" style="min-height:60px">${p?.descripcion||''}</textarea>
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
          <div class="alert-body">Anticipo: se calcula como 50% del precio venta. Saldo se genera automáticamente.</div>
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

    const anticipo = precio_venta * 0.5;
    const saldo = precio_venta - anticipo;

    const payload = {
      cliente_id, tipo_servicio, descripcion, cantidad, unidad,
      precio_venta, anticipo, saldo, fecha_entrega, tipo_inicio, estado
    };

    if (id) {
      const ok = await DB.updateAgroservicio(id, payload);
      if (ok) { UI.toast('Servicio actualizado ✓'); UI.cerrarModal(); Modulos.agroservicio.render(Modulos.agroservicio._filtroEstado); }
      else UI.toast('Error al actualizar', 'error');
    } else {
      const num = 'AGRO-' + String(Math.floor(Math.random()*1000000)).padStart(6,'0');
      const ok = await DB.crearAgroservicio({ num, ...payload });
      if (ok) {
        UI.toast('✓ Servicio creado. Generando OT...', 'success');
        UI.cerrarModal();
        Modulos.agroservicio.render();
        if (tipo_inicio === 'directo') {
          await Modulos._especialOT.crearOT(ok, 'agroservicio', cliente_id, `${tipo_servicio}: ${descripcion}`);
        }
      } else UI.toast('Error al crear', 'error');
    }
  },

  async _accionAnticipo(id) {
    const p = this._data.find(x=>x.id===id); if (!p) return;
    UI.modal('💰 Registrar Anticipo', `
      <div style="display:grid;gap:10px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><div style="font-size:11px;color:var(--text3)">Precio Venta</div><div class="mono-sm" style="font-weight:700">${UI.q(p.precio_venta)}</div></div>
          <div><div style="font-size:11px;color:var(--text3)">Anticipo Esperado (50%)</div><div class="mono-sm" style="font-weight:700;color:var(--green)">${UI.q(p.anticipo)}</div></div>
          <div><div style="font-size:11px;color:var(--text3)">Saldo Pendiente</div><div class="mono-sm" style="font-weight:700;color:var(--red)">${UI.q(p.saldo)}</div></div>
        </div>
        <div class="form-group">
          <label class="form-label">Monto Recibido (Q)</label>
          <input class="form-input" type="number" id="anticipo-monto" value="${p.anticipo}" min="0" step="0.01">
        </div>
        <div class="form-group">
          <label class="form-label">Medio de Pago</label>
          <select class="form-input" id="anticipo-pago">
            <option value="efectivo">💵 Efectivo</option>
            <option value="deposito">🏦 Depósito/Transferencia</option>
            <option value="cheque">📄 Cheque</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Notas (opcional)</label>
          <textarea class="form-input" id="anticipo-notas" style="min-height:50px"></textarea>
        </div>
      </div>`, '500px', [
      { label:'Cancelar', onclick:() => UI.cerrarModal(), clase:'ghost' },
      { label:'Registrar Anticipo', onclick:() => {
        const monto = parseFloat(document.getElementById('anticipo-monto').value)||0;
        const pago = document.getElementById('anticipo-pago').value;
        const notas = document.getElementById('anticipo-notas').value;
        if (monto<=0) { UI.toast('Ingresa un monto', 'error'); return; }
        DB.crearPagoAgroservicio(id, { monto, tipo_pago: pago, notas }).then(ok=>{
          if (ok) { UI.toast('✓ Anticipo registrado'); UI.cerrarModal(); Modulos.agroservicio.render(Modulos.agroservicio._filtroEstado); }
          else UI.toast('Error', 'error');
        });
      }, clase:'amber' }
    ]);
  }
};
