/* Clientes Module */
Modulos.clientes = {
  _data: [],

  async render(busca='') {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._data = await DB.getClientes(busca||null);

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">👥 Clientes</h1>
        <p class="page-subtitle">// ${this._data.length} registrados</p></div>
        <div class="page-actions">
          <select class="form-select" style="width:130px" onchange="Modulos.clientes.render(document.getElementById('cli-busca')?.value,this.value)">
            <option value="">Todos los tipos</option>
            <option value="individual">Individual</option>
            <option value="empresa">Empresa</option>
          </select>
          <button class="btn btn-ghost" onclick="window.print()">🖨 Imprimir</button>
          <button class="btn btn-amber" onclick="Modulos.clientes.modalForm()">＋ Nuevo Cliente</button>
        </div>
      </div>
      <div class="page-body">
        <div class="search-bar" style="margin-bottom:16px">
          <input class="form-input" id="cli-busca" placeholder="🔍 Buscar nombre, NIT, teléfono..." style="margin-bottom:12px"
                 value="${busca}" oninput="Modulos.clientes.render(this.value)">
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Nombre</th><th>Tipo</th><th>NIT</th><th>Teléfono</th><th>Email</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              ${this._data.map(c=>`<tr>
                <td><b>${c.nombre}</b>${c.nombre_empresa?'<br><small>'+c.nombre_empresa+'</small>':''}</td>
                <td><span class="badge badge-${c.tipo==='empresa'?'amber':'cyan'}">${c.tipo==='empresa'?'Empresa':'Individual'}</span></td>
                <td class="mono-sm">${c.nit||'CF'}</td>
                <td>${c.tel||'—'}</td>
                <td>${c.email||'—'}</td>
                <td onclick="event.stopPropagation()">
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-sm btn-cyan" onclick="Modulos.clientes.modalForm('${c.id}')" title="Editar">✏️ Editar</button>
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.clientes.whatsapp('${c.tel}','${c.nombre}')" title="WhatsApp">💬</button>
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.clientes.verVehiculos('${c.id}','${c.nombre}')" title="Vehículos">🚗</button>
                    <button class="btn btn-sm btn-danger" onclick="Modulos.clientes.eliminar('${c.id}','${c.nombre}')" title="Eliminar">🗑️</button>
                  </div>
                </td>
              </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">Sin clientes registrados</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  async modalForm(id=null) {
    const c = id ? this._data.find(x=>x.id===id) : {};
    const esEdicion = !!id;
    UI.modal(`${esEdicion?'✏️ Editar':'＋ Nuevo'} Cliente`, `
      ${esEdicion?'<div class="alert alert-amber" style="margin-bottom:12px"><div class="alert-icon">⚠️</div><div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del cliente.</div></div>':''}
      <div style="display:flex;gap:12px;margin-bottom:12px">
        <label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px;background:var(--surface2);border-radius:8px;cursor:pointer">
          <input type="radio" name="cli-tipo" value="individual" ${(!c.tipo||c.tipo==='individual')?'checked':''} onchange="document.getElementById('cli-empresa-row').style.display='none'"> Individual
        </label>
        <label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px;background:var(--surface2);border-radius:8px;cursor:pointer">
          <input type="radio" name="cli-tipo" value="empresa" ${c.tipo==='empresa'?'checked':''} onchange="document.getElementById('cli-empresa-row').style.display='grid'"> Empresa
        </label>
      </div>
      <div id="cli-empresa-row" class="form-row" style="display:${c.tipo==='empresa'?'grid':'none'}">
        <div class="form-group"><label class="form-label">Nombre de Empresa</label>
          <input class="form-input" id="cli-empresa" value="${c.nombre_empresa||''}"></div>
        <div class="form-group"><label class="form-label">Representante</label>
          <input class="form-input" id="cli-representante" value="${c.representante||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre Completo *</label>
          <input class="form-input" id="cli-nombre" value="${c.nombre||''}"></div>
        <div class="form-group"><label class="form-label">NIT</label>
          <div style="display:flex;gap:6px">
            <input class="form-input" id="cli-nit" value="${c.nit||''}" placeholder="CF" style="flex:1">
            <button type="button" class="btn btn-ghost" onclick="Modulos.verificarNIT('cli-nit','cli-nit-status','cli-nombre')" title="Verificar NIT con la SAT">🔎</button>
          </div>
          <div id="cli-nit-status" style="margin-top:4px;min-height:14px"></div></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Teléfono *</label>
          <input class="form-input" id="cli-tel" value="${c.tel||''}" placeholder="5501-1234"></div>
        <div class="form-group"><label class="form-label">Email</label>
          <input class="form-input" id="cli-email" value="${c.email||''}" type="email"></div>
      </div>
      <div class="form-group"><label class="form-label">Dirección</label>
        <input class="form-input" id="cli-dir" value="${c.direccion||''}"></div>
      <div class="form-group"><label class="form-label">Notas</label>
        <textarea class="form-input" id="cli-notas" rows="2">${c.notas||''}</textarea></div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="cli-puntos" ${c.programa_puntos?'checked':''}>
          <span class="form-label" style="margin:0">⭐ Inscrito en programa de puntos${esEdicion&&c.programa_puntos?` — saldo: <b>${c.puntos_saldo||0}</b> pts`:''}</span>
        </label>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Acumula Q1 = 1 punto en cada compra; canje 10 puntos = Q1.</div>
      </div>
      ${!esEdicion?`
      <div class="card" style="background:var(--amber-dim);border-color:var(--amber-border);margin-top:4px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="cli-tracking">
          <div><b>🔍 Activar seguimiento de OTs</b>
          <div style="font-size:11px;color:var(--text2)">El cliente puede ver el avance de sus órdenes. Usuario: email · Pass: teléfono</div></div>
        </label>
      </div>`:''}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.clientes.guardar('${id||''}')">
          ${esEdicion?'Guardar Cambios':'Crear Cliente'}
        </button>
      </div>`,'640px');
  },

  async guardar(id='') {
    const tipo   = document.querySelector('input[name="cli-tipo"]:checked')?.value||'individual';
    const nombre = document.getElementById('cli-nombre')?.value.trim();
    const tel    = document.getElementById('cli-tel')?.value.trim();
    if (!nombre||!tel) { UI.toast('Nombre y teléfono son obligatorios','error'); return; }

    const fields = {
      tipo, nombre, tel,
      nit:            document.getElementById('cli-nit')?.value.trim()||null,
      email:          document.getElementById('cli-email')?.value.trim()||null,
      direccion:      document.getElementById('cli-dir')?.value.trim()||null,
      notas:          document.getElementById('cli-notas')?.value.trim()||null,
      nombre_empresa: tipo==='empresa'?document.getElementById('cli-empresa')?.value.trim():null,
      representante:  tipo==='empresa'?document.getElementById('cli-representante')?.value.trim():null,
      programa_puntos: document.getElementById('cli-puntos')?.checked || false
    };
    if (id) fields.id = id;

    /* Aviso (no bloquea) si el NIT tiene dígito verificador inválido */
    if (fields.nit && !NIT.validarLocal(fields.nit).valido) {
      UI.toast('Aviso: el dígito verificador del NIT no parece válido','warn');
    }

    const tracking = !id && document.getElementById('cli-tracking')?.checked;

    const { error } = await DB.upsertCliente(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }

    /* Acceso de seguimiento: usuario = email, contraseña = su teléfono */
    if (tracking) {
      const passDigits = (fields.tel||'').replace(/\D/g,'');
      if (!fields.email) {
        UI.toast('Para el acceso de seguimiento el cliente necesita un email','warn');
      } else if (passDigits.length < 6) {
        UI.toast('El teléfono necesita al menos 6 dígitos para usarse como contraseña','warn');
      } else {
        UI.toast('Creando acceso de seguimiento...','info');
        const r = await Auth.crearUsuario({
          nombre: fields.nombre, email: fields.email, rol: 'cliente',
          telefono: fields.tel, avatar: '🚗', password: passDigits
        });
        if (r.ok) {
          /* La contraseña ES su teléfono: no forzar cambio en el primer ingreso */
          if (r.id) await DB.upsertUsuario({ id: r.id, debe_cambiar_password: false });
          UI.toast(`Acceso creado ✓ — usuario: ${fields.email} · contraseña: su teléfono`);
        } else {
          UI.toast('Cliente guardado; el acceso no se pudo crear: '+r.error,'warn');
        }
      }
    }

    UI.cerrarModal();
    UI.toast(id?'Cliente actualizado ✓':'Cliente creado ✓');
    this.render();
  },

  async eliminar(id, nombre) {
    const ok = await UI.confirmar(`¿Eliminar cliente <b>${nombre}</b>? Esta acción no se puede deshacer.`, 'Eliminar');
    if (!ok) return;
    const r = await DB.deleteCliente(id);
    if (r) { UI.toast('Cliente eliminado'); this.render(); }
    else UI.toast('Error al eliminar','error');
  },

  verVehiculos(clienteId, nombre) {
    App.navegarA('vehiculos');
    setTimeout(() => Modulos.vehiculos?.render(clienteId), 300);
  },

  imprimir() { window.print(); },

  whatsapp(tel, nombre) {
    if (!tel) { UI.toast('Este cliente no tiene teléfono registrado','warn'); return; }
    const num = tel.replace(/[^0-9]/g,'');
    const msg = `Hola ${nombre}, le contactamos desde ${Auth.tenant?.name||'el taller'}.`;
    window.open(`https://wa.me/502${num}?text=${encodeURIComponent(msg)}`, '_blank');
  }
};
