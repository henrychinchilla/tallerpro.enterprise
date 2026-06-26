/* TallerPro v3.0 — especializados/electronica.js
   Módulo vertical: Reparaciones Electrónicas (celulares, tablets, laptops,
   TVs, consolas, audio, electrodomésticos...).
   OT se genera cuando el cliente aprueba el diagnóstico (→ en_reparacion).
   Anticipo 50% con comprobante imprimible. */
Modulos.electronica = {
  _data: [], _clientes: [], _empleados: [], _filtroEstado: '',

  _TIPOS: { celular:'Celular', tablet:'Tablet', laptop:'Laptop', computadora:'Computadora', tv:'Televisor', consola:'Consola de videojuegos', audio:'Equipo de audio', electrodomestico:'Electrodoméstico', otro:'Otro' },
  _ESTADOS: { recibido:'Recibido', diagnostico:'Diagnóstico', esperando_aprobacion:'Esperando Aprobación', en_reparacion:'En Reparación', listo:'Listo para Entregar', entregado:'Entregado', sin_reparacion:'Sin Reparación', garantia:'Garantía' },
  _colorEstado(e) { return { recibido:'gray', diagnostico:'cyan', esperando_aprobacion:'amber', en_reparacion:'amber', listo:'green', entregado:'green', sin_reparacion:'red', garantia:'purple' }[e]||'gray'; },

  async render(filtroEstado='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._filtroEstado = filtroEstado;
    [this._data, this._clientes, this._empleados] = await Promise.all([
      DB.getReparacionesElectronicas(filtroEstado ? { estado: filtroEstado } : {}),
      DB.getClientes(), DB.getEmpleados().catch(()=>[])
    ]);

    const activos = this._data.filter(r=>!['entregado','sin_reparacion'].includes(r.estado));
    const enReparacion = this._data.filter(r=>r.estado==='en_reparacion').length;
    const listos = this._data.filter(r=>r.estado==='listo').length;
    const saldoPorCobrar = this._data.reduce((s,r)=>s+(Number(r.saldo)||0),0);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">🔌 Reparación Electrónica</h1>
        <p class="page-subtitle">// ${this._data.length} órdenes registradas</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.electronica.modalForm()">＋ Nuevo Equipo</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'🔌', clase:'cyan', label:'En taller', value: activos.length })}
          ${UI.kpiCard({ icon:'🛠️', clase:'amber', label:'En reparación', value: enReparacion })}
          ${UI.kpiCard({ icon:'✅', clase:'green', label:'Listos para entregar', value: listos })}
          ${UI.kpiCard({ icon:'💰', clase: saldoPorCobrar?'red':'gray', label:'Saldo por cobrar', value: saldoPorCobrar, money:true })}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-sm ${!filtroEstado?'btn-cyan':'btn-ghost'}" onclick="Modulos.electronica.render('')">Todos</button>
          ${Object.entries(this._ESTADOS).map(([k,l])=>`<button class="btn btn-sm ${filtroEstado===k?'btn-cyan':'btn-ghost'}" onclick="Modulos.electronica.render('${k}')">${l}</button>`).join('')}
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>No.</th><th>Cliente</th><th>Equipo</th><th>Falla</th><th>Total</th><th>Anticipo</th><th>Saldo</th><th>OT</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._data.map(r=>`<tr>
              <td class="mono-sm"><b>${r.num||'—'}</b></td>
              <td>${r.clientes?.nombre||'—'}</td>
              <td><span class="badge badge-gray">${this._TIPOS[r.tipo_equipo]||r.tipo_equipo}</span><div style="font-size:11px;color:var(--text3)">${[r.marca,r.modelo].filter(Boolean).join(' ')}</div></td>
              <td style="font-size:12px;max-width:180px">${(r.falla_reportada||'').slice(0,60)}${(r.falla_reportada||'').length>60?'…':''}</td>
              <td class="mono-sm">${UI.q(r.precio_total)}</td>
              <td class="mono-sm ${r.anticipo>0?'text-green':''}">${UI.q(r.anticipo)}</td>
              <td class="mono-sm ${r.saldo>0?'text-red':'text-green'}">${UI.q(r.saldo)}</td>
              <td>${Modulos._especialOT.btnOT(r,'electronica')}</td>
              <td><span class="badge badge-${this._colorEstado(r.estado)}">${this._ESTADOS[r.estado]||r.estado}</span></td>
              <td><div style="display:flex;gap:4px;flex-wrap:wrap">
                ${Modulos.btnAccion('ver', `Modulos.electronica.verDetalle('${r.id}')`)}
                ${Modulos.btnAccion('editar', `Modulos.electronica.modalForm('${r.id}')`)}
                <button class="btn btn-sm btn-cyan" onclick="Modulos.electronica._accionAnticipo('${r.id}')" title="Registrar anticipo">💰</button>
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('reparaciones_electronicas','${r.id}','la orden ${r.num||''}',()=>Modulos.electronica.render(Modulos.electronica._filtroEstado))`)}
              </div></td>
            </tr>`).join('')||'<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text3)">Sin equipos registrados. Recíbelo con "＋ Nuevo Equipo".</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  },

  async verDetalle(id) {
    const r = this._data.find(x=>x.id===id); if (!r) return;
    UI.modal(`🔌 ${r.num||'Equipo'} — ${r.clientes?.nombre||''}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><div style="font-size:11px;color:var(--text3)">Equipo</div><div style="font-weight:700">${this._TIPOS[r.tipo_equipo]||r.tipo_equipo} · ${[r.marca,r.modelo].filter(Boolean).join(' ')||'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Serie / IMEI</div><div class="mono-sm">${r.numero_serie||'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Estado</div><div><span class="badge badge-${this._colorEstado(r.estado)}">${this._ESTADOS[r.estado]||r.estado}</span></div></div>
        <div><div style="font-size:11px;color:var(--text3)">Técnico</div><div>${this._empleados.find(e=>e.id===r.tecnico_id)?.nombre||'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Recibido</div><div>${r.fecha_recibido?UI.fecha(r.fecha_recibido):'—'}</div></div>
        <div><div style="font-size:11px;color:var(--text3)">Accesorios</div><div style="font-size:12px">${r.accesorios_recibidos||'—'}</div></div>
      </div>
      ${r.falla_reportada?`<div style="margin-bottom:8px"><div style="font-size:11px;color:var(--text3)">Falla reportada</div><div style="background:var(--card2);padding:8px 12px;border-radius:6px;font-size:13px">${r.falla_reportada}</div></div>`:''}
      ${r.diagnostico?`<div style="margin-bottom:8px"><div style="font-size:11px;color:var(--text3)">Diagnóstico</div><div style="background:var(--card2);padding:8px 12px;border-radius:6px;font-size:13px">${r.diagnostico}</div></div>`:''}
      <div class="kpi-grid" style="margin-bottom:14px">
        ${UI.kpiCard({icon:'🏷️',clase:'gray',label:'Total',value:r.precio_total,money:true})}
        ${UI.kpiCard({icon:'💰',clase:'green',label:'Anticipo',value:r.anticipo,money:true})}
        ${UI.kpiCard({icon:'⚠️',clase:r.saldo>0?'red':'green',label:'Saldo',value:r.saldo,money:true})}
      </div>
      ${r.orden_id?`<div style="background:var(--card2);padding:10px;border-radius:6px;display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="font-size:20px">🔧</span>
        <div><div style="font-size:11px;color:var(--text3)">OT vinculada</div><div style="font-weight:700;color:var(--cyan)">${r.ot_num||r.orden_id}</div></div>
      </div>`:`<div style="color:var(--text3);font-size:12px;margin-bottom:10px">Sin OT. Se genera cuando el cliente aprueba la reparación (estado: En Reparación).</div>`}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        ${!r.orden_id&&['esperando_aprobacion','en_reparacion','listo'].includes(r.estado)?`<button class="btn btn-cyan" onclick="UI.cerrarModal();Modulos.electronica._accionGenerarOT('${r.id}')">🔧 Generar OT</button>`:''}
        <button class="btn btn-ghost" onclick="UI.cerrarModal();Modulos.electronica._accionAnticipo('${r.id}')">💰 Anticipo</button>
        <button class="btn btn-amber" onclick="UI.cerrarModal();Modulos.electronica.modalForm('${r.id}')">✏️ Editar</button>
      </div>`, '640px');
  },

  async modalForm(id=null) {
    const r = id ? this._data.find(x=>x.id===id)||{} : {};
    if (!this._clientes.length) this._clientes = await DB.getClientes();
    const esEdicion = !!id;

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Equipo`, `
      ${r.orden_id?`<div style="background:var(--card2);padding:8px 12px;border-radius:6px;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <span style="color:var(--cyan);font-weight:700">🔧 OT: ${r.ot_num||r.orden_id}</span>
        <span style="font-size:11px;color:var(--text3)">OT activa para esta reparación</span></div>`:''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cliente *</label>
          <select class="form-select" id="ele-cliente">
            <option value="">— Selecciona —</option>
            ${this._clientes.map(c=>`<option value="${c.id}" ${r.cliente_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Tipo de equipo *</label>
          <select class="form-select" id="ele-tipo">
            ${Object.entries(this._TIPOS).map(([k,l])=>`<option value="${k}" ${r.tipo_equipo===k?'selected':''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Marca</label>
          <input class="form-input" id="ele-marca" value="${r.marca||''}"></div>
        <div class="form-group"><label class="form-label">Modelo</label>
          <input class="form-input" id="ele-modelo" value="${r.modelo||''}"></div>
        <div class="form-group"><label class="form-label">No. de serie / IMEI</label>
          <input class="form-input" id="ele-serie" value="${r.numero_serie||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Accesorios recibidos</label>
        <input class="form-input" id="ele-accesorios" value="${r.accesorios_recibidos||''}" placeholder="Cargador, funda, memoria..."></div>
      <div class="form-group"><label class="form-label">Falla reportada por el cliente *</label>
        <textarea class="form-input" id="ele-falla" rows="2">${r.falla_reportada||''}</textarea></div>
      <div class="form-group"><label class="form-label">Diagnóstico técnico</label>
        <textarea class="form-input" id="ele-diagnostico" rows="2">${r.diagnostico||''}</textarea></div>
      <div class="form-group"><label class="form-label">Trabajo realizado</label>
        <textarea class="form-input" id="ele-trabajo" rows="2">${r.trabajo_realizado||''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Técnico asignado</label>
          <select class="form-select" id="ele-tecnico">
            <option value="">—</option>
            ${this._empleados.map(e=>`<option value="${e.id}" ${r.tecnico_id===e.id?'selected':''}>${e.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Estado</label>
          <select class="form-select" id="ele-estado">
            ${Object.entries(this._ESTADOS).map(([k,l])=>`<option value="${k}" ${(r.estado||'recibido')===k?'selected':''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fecha recibido</label>
          <input class="form-input" id="ele-fecha-recibido" type="date" value="${r.fecha_recibido||new Date().toISOString().slice(0,10)}"></div>
        <div class="form-group"><label class="form-label">Fecha de entrega</label>
          <input class="form-input" id="ele-fecha-entrega" type="date" value="${r.fecha_entrega||''}"></div>
        <div class="form-group"><label class="form-label">Garantía (días)</label>
          <input class="form-input" id="ele-garantia" type="number" min="0" value="${r.garantia_dias??30}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Costo diagnóstico (Q)</label>
          <input class="form-input" id="ele-costo-diag" type="number" min="0" step="0.01" value="${r.costo_diagnostico||0}"></div>
        <div class="form-group"><label class="form-label">Costo repuestos (Q)</label>
          <input class="form-input" id="ele-costo-rep" type="number" min="0" step="0.01" value="${r.costo_repuestos||0}"></div>
        <div class="form-group"><label class="form-label">Costo mano de obra (Q)</label>
          <input class="form-input" id="ele-costo-mo" type="number" min="0" step="0.01" value="${r.costo_mano_obra||0}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Precio total a cobrar (Q)</label>
          <input class="form-input" id="ele-precio" type="number" min="0" step="0.01" value="${r.precio_total||0}"></div>
        <div class="form-group"><label class="form-label">Anticipo recibido (Q)</label>
          <input class="form-input" id="ele-anticipo" type="number" min="0" step="0.01" value="${r.anticipo||0}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="ele-notas" rows="2">${r.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.electronica.guardar('${id||''}')">${esEdicion?'Guardar Cambios':'Registrar Equipo'}</button>
      </div>`, '720px');
  },

  async guardar(id='') {
    const clienteId = document.getElementById('ele-cliente')?.value;
    const falla = document.getElementById('ele-falla')?.value?.trim();
    if (!clienteId) { UI.toast('Selecciona un cliente','error'); return; }
    if (!falla) { UI.toast('Describe la falla reportada','error'); return; }
    const precio = parseFloat(document.getElementById('ele-precio')?.value)||0;
    const anticipo = parseFloat(document.getElementById('ele-anticipo')?.value)||0;
    const estadoPrev = id ? (this._data.find(x=>x.id===id)?.estado||'recibido') : 'recibido';
    const prevOrdenId = id ? this._data.find(x=>x.id===id)?.orden_id : null;
    const fields = {
      cliente_id: clienteId,
      tipo_equipo: document.getElementById('ele-tipo')?.value||'otro',
      marca: document.getElementById('ele-marca')?.value||null,
      modelo: document.getElementById('ele-modelo')?.value||null,
      numero_serie: document.getElementById('ele-serie')?.value||null,
      accesorios_recibidos: document.getElementById('ele-accesorios')?.value||null,
      falla_reportada: falla,
      diagnostico: document.getElementById('ele-diagnostico')?.value||null,
      trabajo_realizado: document.getElementById('ele-trabajo')?.value||null,
      tecnico_id: document.getElementById('ele-tecnico')?.value||null,
      estado: document.getElementById('ele-estado')?.value||'recibido',
      fecha_recibido: document.getElementById('ele-fecha-recibido')?.value||null,
      fecha_entrega: document.getElementById('ele-fecha-entrega')?.value||null,
      garantia_dias: parseInt(document.getElementById('ele-garantia')?.value)||0,
      costo_diagnostico: parseFloat(document.getElementById('ele-costo-diag')?.value)||0,
      costo_repuestos: parseFloat(document.getElementById('ele-costo-rep')?.value)||0,
      costo_mano_obra: parseFloat(document.getElementById('ele-costo-mo')?.value)||0,
      precio_total: precio, anticipo, saldo: Math.max(0, precio-anticipo),
      notas: document.getElementById('ele-notas')?.value||null,
    };
    if (id) fields.id = id;
    const { data: saved, error } = await DB.upsertReparacionElectronica(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Equipo actualizado ✓':'Equipo registrado ✓');

    const estadoNuevo = fields.estado;
    /* OT se genera cuando cliente aprueba diagnóstico → en_reparacion */
    const debeOT = !prevOrdenId && (
      (estadoPrev === 'esperando_aprobacion' && estadoNuevo === 'en_reparacion') ||
      estadoNuevo === 'en_reparacion'
    );
    if (debeOT) {
      const proyecto = { ...fields, id: saved?.id||id, clientes: { nombre: this._clientes.find(c=>c.id===clienteId)?.nombre||'' }, orden_id: null };
      const ot = await Modulos._especialOT.generarOT(
        'reparaciones_electronicas', proyecto, 'precio_total', 'electronica',
        r => `ELEC ${r.num||''}: ${this._TIPOS[r.tipo_equipo]||r.tipo_equipo} ${r.marca||''} ${r.modelo||''} — ${r.falla_reportada||''}`.slice(0,200)
      );
      if (ot) await Modulos._especialOT.modalAnticipo('reparaciones_electronicas', { ...proyecto, orden_id: ot.id }, 'precio_total', 'electronica', 'electronica', ot.num);
    }
    this.render(this._filtroEstado);
  },

  async _accionGenerarOT(id) {
    const r = this._data.find(x=>x.id===id); if (!r) return;
    const ot = await Modulos._especialOT.generarOT(
      'reparaciones_electronicas', r, 'precio_total', 'electronica',
      rec => `ELEC ${rec.num||''}: ${this._TIPOS[rec.tipo_equipo]||rec.tipo_equipo} ${rec.marca||''} — ${rec.falla_reportada||''}`.slice(0,200)
    );
    if (ot) {
      await getSB().from('reparaciones_electronicas').update({ estado:'en_reparacion' }).eq('id',id);
      await Modulos._especialOT.modalAnticipo('reparaciones_electronicas', { ...r, orden_id: ot.id }, 'precio_total', 'electronica', 'electronica', ot.num);
    }
    this.render(this._filtroEstado);
  },

  async _accionAnticipo(id) {
    const r = this._data.find(x=>x.id===id); if (!r) return;
    await Modulos._especialOT.modalAnticipo('reparaciones_electronicas', r, 'precio_total', 'electronica', 'electronica', r.ot_num||'');
  },
};
