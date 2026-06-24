/* TallerPro v3.0 — especializados/herreria.js
   Módulo vertical: Herrería Industrial y Ventanería PVC/Aluminio.
   Proyectos de fabricación e instalación (portones, barandas, estructuras
   metálicas, ventanería PVC/aluminio) con seguimiento de estado y cobro. */
Modulos.herreria = {
  _data: [], _clientes: [], _filtroEstado: '',

  _TIPOS: { porton:'Portón', baranda:'Baranda/Barandal', escalera:'Escalera metálica', estructura_metalica:'Estructura metálica', techo_metalico:'Techo/Lámina metálica', ventana_pvc:'Ventana PVC', puerta_pvc:'Puerta PVC', ventana_aluminio:'Ventana Aluminio', puerta_aluminio:'Puerta Aluminio', cancel:'Cancel', otro:'Otro' },
  _ESTADOS: { cotizado:'Cotizado', aprobado:'Aprobado', en_fabricacion:'En Fabricación', en_instalacion:'En Instalación', entregado:'Entregado', cancelado:'Cancelado', garantia:'Garantía' },
  _colorEstado(e) { return { cotizado:'gray', aprobado:'cyan', en_fabricacion:'amber', en_instalacion:'amber', entregado:'green', cancelado:'red', garantia:'purple' }[e]||'gray'; },

  async render(filtroEstado='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._filtroEstado = filtroEstado;
    [this._data, this._clientes] = await Promise.all([
      DB.getHerreriaProyectos(filtroEstado ? { estado: filtroEstado } : {}),
      DB.getClientes()
    ]);

    const activos = this._data.filter(p=>!['entregado','cancelado'].includes(p.estado));
    const enProceso = this._data.filter(p=>['en_fabricacion','en_instalacion'].includes(p.estado));
    const saldoPorCobrar = this._data.reduce((s,p)=>s+(Number(p.saldo)||0),0);
    const mesActual = new Date().toISOString().slice(0,7);
    const entregadosMes = this._data.filter(p=>p.estado==='entregado' && (p.updated_at||'').slice(0,7)===mesActual).length;

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">⚒️ Herrería y Ventanería</h1>
        <p class="page-subtitle">// ${this._data.length} proyectos registrados</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.herreria.modalForm()">＋ Nuevo Proyecto</button>
        </div>
      </div>
      <div class="page-body">
        <div class="kpi-grid" style="margin-bottom:16px">
          ${UI.kpiCard({ icon:'⚒️', clase:'cyan', label:'Proyectos activos', value: activos.length })}
          ${UI.kpiCard({ icon:'🏗️', clase:'amber', label:'En fabricación/instalación', value: enProceso.length })}
          ${UI.kpiCard({ icon:'💰', clase: saldoPorCobrar?'red':'gray', label:'Saldo por cobrar', value: saldoPorCobrar, money:true })}
          ${UI.kpiCard({ icon:'✅', clase:'green', label:'Entregados este mes', value: entregadosMes })}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-sm ${!filtroEstado?'btn-cyan':'btn-ghost'}" onclick="Modulos.herreria.render('')">Todos</button>
          ${Object.entries(this._ESTADOS).map(([k,l])=>`<button class="btn btn-sm ${filtroEstado===k?'btn-cyan':'btn-ghost'}" onclick="Modulos.herreria.render('${k}')">${l}</button>`).join('')}
        </div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>No.</th><th>Cliente</th><th>Tipo</th><th>Medidas</th><th>Compromiso</th><th>Precio</th><th>Saldo</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${this._data.map(p=>`<tr>
              <td class="mono-sm">${p.num||'—'}</td>
              <td>${p.clientes?.nombre||'—'}</td>
              <td><span class="badge badge-gray">${this._TIPOS[p.tipo_trabajo]||p.tipo_trabajo}</span></td>
              <td class="mono-sm">${p.ancho_m&&p.alto_m?`${p.ancho_m}×${p.alto_m} m (${p.area_m2||(p.ancho_m*p.alto_m*(p.cantidad||1)).toFixed(2)} m²)`:'—'}</td>
              <td class="mono-sm">${p.fecha_compromiso?UI.fecha(p.fecha_compromiso):'—'}</td>
              <td class="mono-sm">${UI.q(p.precio_venta)}</td>
              <td class="mono-sm ${p.saldo>0?'text-red':'text-green'}">${UI.q(p.saldo)}</td>
              <td><span class="badge badge-${this._colorEstado(p.estado)}">${this._ESTADOS[p.estado]||p.estado}</span></td>
              <td><div style="display:flex;gap:4px">
                ${Modulos.btnAccion('editar', `Modulos.herreria.modalForm('${p.id}')`)}
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('herreria_proyectos','${p.id}','el proyecto ${p.num||''}',()=>Modulos.herreria.render(Modulos.herreria._filtroEstado))`)}
              </div></td>
            </tr>`).join('')||'<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text3)">Sin proyectos. Registra el primero con "＋ Nuevo Proyecto".</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  },

  async modalForm(id=null) {
    const p = id ? this._data.find(x=>x.id===id) : {};
    if (!this._clientes.length) this._clientes = await DB.getClientes();
    const esEdicion = !!id;

    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Proyecto de Herrería`, `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cliente *</label>
          <select class="form-select" id="her-cliente">
            <option value="">— Selecciona —</option>
            ${this._clientes.map(c=>`<option value="${c.id}" ${p.cliente_id===c.id?'selected':''}>${c.nombre}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Tipo de trabajo *</label>
          <select class="form-select" id="her-tipo">
            ${Object.entries(this._TIPOS).map(([k,l])=>`<option value="${k}" ${p.tipo_trabajo===k?'selected':''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Descripción del trabajo</label>
        <textarea class="form-input" id="her-desc" rows="2" placeholder="Portón corredizo 2 hojas, tubo cuadrado 2x2...">${p.descripcion||''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Ancho (m)</label>
          <input class="form-input" id="her-ancho" type="number" min="0" step="0.01" value="${p.ancho_m||''}"></div>
        <div class="form-group"><label class="form-label">Alto (m)</label>
          <input class="form-input" id="her-alto" type="number" min="0" step="0.01" value="${p.alto_m||''}"></div>
        <div class="form-group"><label class="form-label">Cantidad</label>
          <input class="form-input" id="her-cantidad" type="number" min="1" step="1" value="${p.cantidad||1}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Material</label>
          <input class="form-input" id="her-material" value="${p.material||''}" placeholder="Tubo cuadrado, lámina, perfil PVC..."></div>
        <div class="form-group"><label class="form-label">Color / Acabado</label>
          <input class="form-input" id="her-color" value="${p.color||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Ubicación en la propiedad</label>
          <input class="form-input" id="her-ubicacion" value="${p.ubicacion_instalacion||''}" placeholder="Fachada, patio, balcón 2do nivel..."></div>
        <div class="form-group"><label class="form-label">Dirección de instalación</label>
          <input class="form-input" id="her-direccion" value="${p.direccion_instalacion||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Estado</label>
          <select class="form-select" id="her-estado">
            ${Object.entries(this._ESTADOS).map(([k,l])=>`<option value="${k}" ${(p.estado||'cotizado')===k?'selected':''}>${l}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Fecha compromiso</label>
          <input class="form-input" id="her-fecha" type="date" value="${p.fecha_compromiso||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Costo materiales (Q)</label>
          <input class="form-input" id="her-costo-mat" type="number" min="0" step="0.01" value="${p.costo_materiales||0}"></div>
        <div class="form-group"><label class="form-label">Costo mano de obra (Q)</label>
          <input class="form-input" id="her-costo-mo" type="number" min="0" step="0.01" value="${p.costo_mano_obra||0}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Precio de venta (Q)</label>
          <input class="form-input" id="her-precio" type="number" min="0" step="0.01" value="${p.precio_venta||0}"></div>
        <div class="form-group"><label class="form-label">Anticipo recibido (Q)</label>
          <input class="form-input" id="her-anticipo" type="number" min="0" step="0.01" value="${p.anticipo||0}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="her-notas" rows="2">${p.notas||''}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.herreria.guardar('${id||''}')">${esEdicion?'Guardar Cambios':'Crear Proyecto'}</button>
      </div>`, '700px');
  },

  async guardar(id='') {
    const clienteId = document.getElementById('her-cliente')?.value;
    if (!clienteId) { UI.toast('Selecciona un cliente','error'); return; }
    const ancho = parseFloat(document.getElementById('her-ancho')?.value)||0;
    const alto = parseFloat(document.getElementById('her-alto')?.value)||0;
    const cantidad = parseFloat(document.getElementById('her-cantidad')?.value)||1;
    const precio = parseFloat(document.getElementById('her-precio')?.value)||0;
    const anticipo = parseFloat(document.getElementById('her-anticipo')?.value)||0;
    const fields = {
      cliente_id: clienteId,
      tipo_trabajo: document.getElementById('her-tipo')?.value||'otro',
      descripcion: document.getElementById('her-desc')?.value||null,
      ancho_m: ancho||null, alto_m: alto||null, cantidad,
      area_m2: (ancho&&alto) ? Math.round(ancho*alto*cantidad*100)/100 : null,
      material: document.getElementById('her-material')?.value||null,
      color: document.getElementById('her-color')?.value||null,
      ubicacion_instalacion: document.getElementById('her-ubicacion')?.value||null,
      direccion_instalacion: document.getElementById('her-direccion')?.value||null,
      estado: document.getElementById('her-estado')?.value||'cotizado',
      fecha_compromiso: document.getElementById('her-fecha')?.value||null,
      costo_materiales: parseFloat(document.getElementById('her-costo-mat')?.value)||0,
      costo_mano_obra: parseFloat(document.getElementById('her-costo-mo')?.value)||0,
      precio_venta: precio, anticipo, saldo: Math.max(0, precio-anticipo),
      notas: document.getElementById('her-notas')?.value||null
    };
    if (id) fields.id = id;
    const { error } = await DB.upsertHerreriaProyecto(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.cerrarModal(); UI.toast(id?'Proyecto actualizado ✓':'Proyecto creado ✓');
    this.render(this._filtroEstado);
  }
};
