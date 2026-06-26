/* TallerPro v3.0 — especializados/refrigeracion.js
   Módulo vertical: Reparación de Refrigeración y Aire Acondicionado —
   vehicular, domiciliar e industrial (incluye cámaras frías/congeladores).
   OT automática al crear servicio directo; anticipo 50% con comprobante. */
Modulos.refrigeracion = {
  _data: [], _clientes: [], _vehiculos: [], _empleados: [], _filtroEstado: '',

  _SISTEMAS: { ac_vehicular:'A/C Vehicular', ac_domiciliar:'A/C Domiciliar', ac_industrial:'A/C Industrial', refrigeracion_comercial:'Refrigeración Comercial', camara_fria:'Cámara Fría', congelador:'Congelador', otro:'Otro' },
  _SERVICIOS: { mantenimiento:'Mantenimiento', instalacion:'Instalación', reparacion:'Reparación', carga_gas:'Carga de Gas', diagnostico:'Diagnóstico', limpieza:'Limpieza' },
  _GASES: ['R134a','R410A','R22','R404A','R32','R600a','Otro'],
  _ESTADOS: { pendiente:'Pendiente', en_proceso:'En Proceso', completado:'Completado', garantia:'Garantía', cancelado:'Cancelado' },
  _colorEstado(e) { return { pendiente:'gray', en_proceso:'amber', completado:'green', garantia:'purple', cancelado:'red' }[e]||'gray'; },

  async render(filtroEstado='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._filtroEstado = filtroEstado;
    [this._data, this._clientes, this._empleados] = await Promise.all([
      DB.getRefrigeracionServicios(filtroEstado ? { estado: filtroEstado } : {}),
      DB.getClientes(), DB.getEmpleados().catch(()=>[])
    ]);

    const pendientes = this._data.filter(s=>s.estado==='pendiente').length;
    const enProceso = this._data.filter(s=>s.estado==='en_proceso').length;
    const mesActual = new Date().toISOString().slice(0,7);
    const completadosMes = this._data.filter(s=>s.estado==='completado' && (s.updated_at||'').slice(0,7)===mesActual).length;
    const saldoPorCobrar = this._data.reduce((s,r)=>s+(Number(r.saldo)||0),0);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">❄️ Refrigeración y A/C</h1>
        <p class="page-subtitle">// ${this._data.length} servicios registrados</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.refrigeracion.modalForm()">＋ Nuevo Servicio</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'⏳', clase:'amber', label:'Pendientes', value: pendientes })}
          ${UI.kpiCard({ icon:'🛠️', clase:'cyan', label:'En proceso', value: enProceso })}
          ${UI.kpiCard({ icon:'✅', clase:'green', label:'Completados este mes', value: completadosMes })}
          ${UI.kpiCard({ icon:'💰', clase: saldoPorCobrar?'red':'gray', label:'Saldo por cobrar', value: saldoPorCobrar, money:true })}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-sm ${!filtroEstado?'btn-cyan':'btn-ghost'}" onclick="Modulos.refrigeracion.render('')">Todos</button>
          ${Object.entries(this._ESTADOS).map(([k,l])=>`<button class="btn btn-sm ${filtroEstado===k?'btn-cyan':'btn-ghost'}" onclick="Modulos.refrigeracion.render('${k}')">${l}</button>`).join('')}
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>No.</th><th>Cliente</th><th>Sistema</th><th>Servicio</th><th>Fecha</th><th>Total</th><th>Anticipo</th><th>Saldo</th><th>OT</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._data.map(s=>`<tr>
              <td class="mono-sm"><b>${s.num||'—'}</b></td>
              <td>${s.clientes?.nombre||'—'}</td>
              <td><span class="badge badge-gray">${this._SISTEMAS[s.tipo_sistema]||s.tipo_sistema}</span>${s.vehiculos?`<div style="font-size:11px;color:var(--text3)">${s.vehiculos.placa}</div>`:''}<div style="font-size:11px;color:var(--text3)">${s.tipo_inicio==='directo'?'⚡ Directo':'📋 Cotización'}</div></td>
              <td>${this._SERVICIOS[s.tipo_servicio]||s.tipo_servicio}</td>
              <td class="mono-sm">${UI.fecha(s.fecha_servicio)}</td>
              <td class="mono-sm">${UI.q(s.precio_total)}</td>
              <td class="mono-sm ${s.anticipo>0?'text-green':''}">${UI.q(s.anticipo)}</td>
              <td class="mono-sm ${s.saldo>0?'text-red':'text-green'}">${UI.q(s.saldo)}</td>
              <td>${Modulos._especialOT.btnOT(s,'refrigeracion')}</td>
              <td><span class="badge badge-${this._colorEstado(s.estado)}">${this._ESTADOS[s.estado]||s.estado}</span></td>
              <td><div style="display:flex;gap:4px;flex-wrap:wrap">
                ${Modulos.btnAccion('ver', `Modulos.refrigeracion.verDetalle('${s.id}')`)}
                ${Modulos.btnAccion('editar', `Modulos.refrigeracion.modalForm('${s.id}')`)}
                <button class="btn btn-sm btn-cyan" onclick="Modulos.refrigeracion._accionAnticipo('${s.id}')" title="Registrar anticipo">💰</button>
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('refrigeracion_servicios','${s.id}','el servicio ${s.num||''}',()=>Modulos.refrigeracion.render(Modulos.refrigeracion._filtroEstado))`)}
              </div></td>
            </tr>`).join('')||'<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--text3)">Sin servicios registrados. Registra el primero con "＋ Nuevo Servicio".</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  },

  async verDetalle(id) {
    const s = this._data.find(x=>x.id===id); if (!s) return;
    UI.modal(`❄️ Servicio ${s.num||''}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><div style="font-size:11px;color:var(--text3)">Cliente</div><div style="font-weight:700">${s.clientes?.nombre||'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Sistema</div><div>${this._SISTEMAS[s.tipo_sistema]||s.tipo_sistema}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Estado</div><div><span class="badge badge-${this._colorEstado(s.estado)}">${this._ESTADOS[s.estado]||s.estado}</span></div></div>
        <div><div style="font-size:11px;color:var(--text3)">Inicio</div><div>${s.tipo_inicio==='directo'?'⚡ Directo':'📋 Cotización'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Servicio</div><div>${this._SERVICIOS[s.tipo_servicio]||s.tipo_servicio}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Gas / Lbs</div><div>${s.tipo_gas||'—'} ${s.cantidad_gas_lb?` · ${s.cantidad_gas_lb} lb`:''}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Equipo</div><div>${[s.marca_equipo,s.modelo_equipo].filter(Boolean).join(' ')||'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Fecha</div><div>${s.fecha_servicio?UI.fecha(s.fecha_servicio):'—'}</div></div>
      </div>
      ${s.falla_reportada?`<div style="margin-bottom:8px"><div style="font-size:11px;color:var(--text3)">Falla</div><div style="background:var(--card2);padding:8px 12px;border-radius:6px;font-size:13px">${s.falla_reportada}</div></div>`:''}
      <div class="kpi-grid" style="margin-bottom:14px">
        ${UI.kpiCard({icon:'🏷️',clase:'gray',label:'Total',value:s.precio_total,money:true})}
        ${UI.kpiCard({icon:'💰',clase:'green',label:'Anticipo',value:s.anticipo,money:true})}
        ${UI.kpiCard({icon:'⚠️',clase:s.saldo>0?'red':'green',label:'Saldo',value:s.saldo,money:true})}
      </div>
      ${s.orden_id?`<div style="background:var(--card2);padding:10px;border-radius:6px;display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="font-size:20px">🔧</span>
        <div><div style="font-size:11px;color:var(--text3)">OT vinculada</div><div style="font-weight:700;color:var(--cyan)">${s.ot_num||s.orden_id}</div></div>
      </div>`:`<div style="color:var(--text3);font-size:12px;margin-bottom:10px">Sin OT. Se genera al guardar (si es directo) o al iniciar proceso.</div>`}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        ${!s.orden_id?`<button class="btn btn-cyan" onclick="UI.cerrarModal();Modulos.refrigeracion._accionGenerarOT('${s.id}')">🔧 Generar OT</button>`:''}
        <button class="btn btn-ghost" onclick="UI.cerrarModal();Modulos.refrigeracion._accionAnticipo('${s.id}')">💰 Anticipo</button>
        <button class="btn btn-amber" onclick="UI.cerrarModal();Modulos.refrigeracion.modalForm('${s.id}')">✏️ Editar</button>
      </div>`, '600px');
  },

  async modalForm(id=null) {
    const s = id ? this._data.find(x=>x.id===id)||{} : {};
    if (!this._clientes.length) this._clientes = await DB.getClientes();
    this._vehiculos = s.cliente_id ? await DB.getVehiculos(s.cliente_id) : [];
    const esEdicion = !!id;
    const esVehicular = (s.tipo_sistema||'')==='ac_vehicular';

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Servicio de Refrigeración`, `
      ${s.orden_id?`<div style="background:var(--card2);padding:8px 12px;border-radius:6px;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <span style="color:var(--cyan);font-weight:700">🔧 OT: ${s.ot_num||s.orden_id}</span>
        <span style="font-size:11px;color:var(--text3)">Servicio con OT activa</span></div>`:''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo de inicio</label>
          <select class="form-select" id="ref-inicio">
            <option value="directo" ${(s.tipo_inicio||'directo')==='directo'?'selected':''}>⚡ Directo → OT inmediata</option>
            <option value="cotizacion" ${s.tipo_inicio==='cotizacion'?'selected':''}>📋 Cotización → requiere aprobación</option>
          </select></div>
        <div class="form-group"><label class="form-label">Estado</label>
          <select class="form-select" id="ref-estado">
            ${Object.entries(this._ESTADOS).map(([k,l])=>`<option value="${k}" ${(s.estado||'pendiente')===k?'selected':''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cliente *</label>
          <select class="form-select" id="ref-cliente" onchange="Modulos.refrigeracion._cambiarCliente(this.value)">
            <option value="">— Selecciona —</option>
            ${this._clientes.map(c=>`<option value="${c.id}" ${s.cliente_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Tipo de sistema *</label>
          <select class="form-select" id="ref-sistema" onchange="Modulos.refrigeracion._toggleVehiculo(this.value)">
            ${Object.entries(this._SISTEMAS).map(([k,l])=>`<option value="${k}" ${s.tipo_sistema===k?'selected':''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group" id="ref-vehiculo-box" style="${esVehicular?'':'display:none'}">
        <label class="form-label">Vehículo</label>
        <select class="form-select" id="ref-vehiculo">
          <option value="">—</option>
          ${this._vehiculos.map(v=>`<option value="${v.id}" ${s.vehiculo_id===v.id?'selected':''}>${v.placa} — ${v.marca} ${v.modelo}</option>`).join('')}
        </select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Tipo de servicio *</label>
          <select class="form-select" id="ref-servicio">
            ${Object.entries(this._SERVICIOS).map(([k,l])=>`<option value="${k}" ${(s.tipo_servicio||'reparacion')===k?'selected':''}>${l}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Marca del equipo</label>
          <input class="form-input" id="ref-marca" value="${s.marca_equipo||''}"></div>
        <div class="form-group"><label class="form-label">Modelo del equipo</label>
          <input class="form-input" id="ref-modelo" value="${s.modelo_equipo||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Gas refrigerante</label>
          <select class="form-select" id="ref-gas">
            <option value="">—</option>
            ${this._GASES.map(g=>`<option ${s.tipo_gas===g?'selected':''}>${g}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Cantidad gas (lb)</label>
          <input class="form-input" id="ref-gas-lb" type="number" min="0" step="0.01" value="${s.cantidad_gas_lb||''}"></div>
        <div class="form-group"><label class="form-label">Presión alta / baja (psi)</label>
          <div style="display:flex;gap:6px">
            <input class="form-input" id="ref-presion-alta" type="number" step="0.1" placeholder="Alta" value="${s.presion_alta||''}">
            <input class="form-input" id="ref-presion-baja" type="number" step="0.1" placeholder="Baja" value="${s.presion_baja||''}">
          </div></div>
      </div>
      <div class="form-group"><label class="form-label">Falla reportada</label>
        <textarea class="form-input" id="ref-falla" rows="2">${s.falla_reportada||''}</textarea></div>
      <div class="form-group"><label class="form-label">Diagnóstico / Trabajo realizado</label>
        <textarea class="form-input" id="ref-trabajo" rows="2">${s.trabajo_realizado||s.diagnostico||''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Técnico asignado</label>
          <select class="form-select" id="ref-tecnico">
            <option value="">—</option>
            ${this._empleados.map(e=>`<option value="${e.id}" ${s.tecnico_id===e.id?'selected':''}>${e.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Dirección del servicio</label>
          <input class="form-input" id="ref-direccion" value="${s.direccion_servicio||''}" placeholder="Para servicio a domicilio"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha del servicio</label>
          <input class="form-input" id="ref-fecha" type="date" value="${s.fecha_servicio||new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Próxima revisión</label>
          <input class="form-input" id="ref-proxima" type="date" value="${s.proxima_revision||''}"></div>
        <div class="form-group"><label class="form-label">Garantía (días)</label>
          <input class="form-input" id="ref-garantia" type="number" min="0" value="${s.garantia_dias??30}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Costo servicio (Q)</label>
          <input class="form-input" id="ref-costo-serv" type="number" min="0" step="0.01" value="${s.costo_servicio||0}"></div>
        <div class="form-group"><label class="form-label">Costo repuestos (Q)</label>
          <input class="form-input" id="ref-costo-rep" type="number" min="0" step="0.01" value="${s.costo_repuestos||0}"></div>
        <div class="form-group"><label class="form-label">Costo gas (Q)</label>
          <input class="form-input" id="ref-costo-gas" type="number" min="0" step="0.01" value="${s.costo_gas||0}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Precio total a cobrar (Q)</label>
          <input class="form-input" id="ref-precio" type="number" min="0" step="0.01" value="${s.precio_total||0}"></div>
        <div class="form-group"><label class="form-label">Anticipo recibido (Q)</label>
          <input class="form-input" id="ref-anticipo" type="number" min="0" step="0.01" value="${s.anticipo||0}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="ref-notas" rows="2">${s.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.refrigeracion.guardar('${id||''}')">${esEdicion?'Guardar Cambios':'Crear Servicio'}</button>
      </div>`, '740px');
  },

  _toggleVehiculo(tipo) {
    const box = document.getElementById('ref-vehiculo-box');
    if (box) box.style.display = tipo==='ac_vehicular' ? '' : 'none';
  },

  async _cambiarCliente(clienteId) {
    this._vehiculos = clienteId ? await DB.getVehiculos(clienteId) : [];
    const sel = document.getElementById('ref-vehiculo');
    if (sel) sel.innerHTML = `<option value="">—</option>${this._vehiculos.map(v=>`<option value="${v.id}">${v.placa} — ${v.marca} ${v.modelo}</option>`).join('')}`;
  },

  async guardar(id='') {
    const clienteId = document.getElementById('ref-cliente')?.value;
    if (!clienteId) { UI.toast('Selecciona un cliente','error'); return; }
    const tipoSistema = document.getElementById('ref-sistema')?.value||'otro';
    const precio = parseFloat(document.getElementById('ref-precio')?.value)||0;
    const anticipo = parseFloat(document.getElementById('ref-anticipo')?.value)||0;
    const estadoPrev = id ? (this._data.find(x=>x.id===id)?.estado||'pendiente') : 'pendiente';
    const prevOrdenId = id ? this._data.find(x=>x.id===id)?.orden_id : null;
    const fields = {
      cliente_id: clienteId,
      tipo_inicio: document.getElementById('ref-inicio')?.value||'directo',
      vehiculo_id: tipoSistema==='ac_vehicular' ? (document.getElementById('ref-vehiculo')?.value||null) : null,
      tipo_sistema: tipoSistema,
      tipo_servicio: document.getElementById('ref-servicio')?.value||'reparacion',
      marca_equipo: document.getElementById('ref-marca')?.value||null,
      modelo_equipo: document.getElementById('ref-modelo')?.value||null,
      tipo_gas: document.getElementById('ref-gas')?.value||null,
      cantidad_gas_lb: parseFloat(document.getElementById('ref-gas-lb')?.value)||null,
      presion_alta: parseFloat(document.getElementById('ref-presion-alta')?.value)||null,
      presion_baja: parseFloat(document.getElementById('ref-presion-baja')?.value)||null,
      falla_reportada: document.getElementById('ref-falla')?.value||null,
      trabajo_realizado: document.getElementById('ref-trabajo')?.value||null,
      tecnico_id: document.getElementById('ref-tecnico')?.value||null,
      direccion_servicio: document.getElementById('ref-direccion')?.value||null,
      estado: document.getElementById('ref-estado')?.value||'pendiente',
      fecha_servicio: document.getElementById('ref-fecha')?.value||null,
      proxima_revision: document.getElementById('ref-proxima')?.value||null,
      costo_servicio: parseFloat(document.getElementById('ref-costo-serv')?.value)||0,
      costo_repuestos: parseFloat(document.getElementById('ref-costo-rep')?.value)||0,
      costo_gas: parseFloat(document.getElementById('ref-costo-gas')?.value)||0,
      precio_total: precio, anticipo, saldo: Math.max(0, precio-anticipo),
      garantia_dias: parseInt(document.getElementById('ref-garantia')?.value)||0,
      notas: document.getElementById('ref-notas')?.value||null,
    };
    if (id) fields.id = id;
    const { data: saved, error } = await DB.upsertRefrigeracionServicio(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Servicio actualizado ✓':'Servicio creado ✓');

    const estadoNuevo = fields.estado;
    const debeOT = !prevOrdenId && (
      fields.tipo_inicio === 'directo' ||
      (estadoPrev === 'pendiente' && estadoNuevo === 'en_proceso')
    );
    if (debeOT) {
      const proyecto = { ...fields, id: saved?.id||id, clientes: { nombre: this._clientes.find(c=>c.id===clienteId)?.nombre||'' }, orden_id: null };
      const ot = await Modulos._especialOT.generarOT(
        'refrigeracion_servicios', proyecto, 'precio_total', 'refrigeracion',
        s => `REFR ${s.num||''}: ${this._SISTEMAS[s.tipo_sistema]||s.tipo_sistema} — ${this._SERVICIOS[s.tipo_servicio]||s.tipo_servicio} ${s.marca_equipo||''}`.slice(0,200)
      );
      if (ot) await Modulos._especialOT.modalAnticipo('refrigeracion_servicios', { ...proyecto, orden_id: ot.id }, 'precio_total', 'refrigeracion', 'refrigeracion', ot.num);
    }
    this.render(this._filtroEstado);
  },

  async _accionGenerarOT(id) {
    const s = this._data.find(x=>x.id===id); if (!s) return;
    const ot = await Modulos._especialOT.generarOT(
      'refrigeracion_servicios', s, 'precio_total', 'refrigeracion',
      sv => `REFR ${sv.num||''}: ${this._SISTEMAS[sv.tipo_sistema]||sv.tipo_sistema} — ${sv.falla_reportada||''}`.slice(0,200)
    );
    if (ot) {
      await getSB().from('refrigeracion_servicios').update({ estado:'en_proceso' }).eq('id',id);
      await Modulos._especialOT.modalAnticipo('refrigeracion_servicios', { ...s, orden_id: ot.id }, 'precio_total', 'refrigeracion', 'refrigeracion', ot.num);
    }
    this.render(this._filtroEstado);
  },

  async _accionAnticipo(id) {
    const s = this._data.find(x=>x.id===id); if (!s) return;
    await Modulos._especialOT.modalAnticipo('refrigeracion_servicios', s, 'precio_total', 'refrigeracion', 'refrigeracion', s.ot_num||'');
  },
};
