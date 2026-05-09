/* Usuarios Module */
Modulos.usuarios = {
  _data: [],

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._data = await DB.getUsuarios();

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">👥 Usuarios del Sistema</h1>
        <p class="page-subtitle">// ${this._data.length} usuarios</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.usuarios.modalNuevo()">＋ Nuevo Usuario</button>
        </div>
      </div>
      <div class="page-body">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Email</th><th>Teléfono</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${this._data.map(u=>`<tr>
                <td><span style="font-size:18px">${u.avatar||'👤'}</span> <b>${u.nombre}</b></td>
                <td><span class="badge badge-${ROLES[u.rol]?.color||'gray'}">${ROLES[u.rol]?.icon||''} ${ROLES[u.rol]?.label||u.rol}</span></td>
                <td>${u.email}</td>
                <td>${u.telefono||'—'}</td>
                <td><span class="badge badge-${u.activo?'green':'red'}">${u.activo?'Activo':'Inactivo'}</span></td>
                <td>
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-sm btn-cyan" onclick="Modulos.usuarios.modalEditar('${u.id}')">Editar</button>
                    <button class="btn btn-sm btn-ghost" onclick="Modulos.usuarios.modalReset('${u.id}','${u.nombre}')">🔑</button>
                  </div>
                </td>
              </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Sin usuarios</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  modalNuevo() {
    const roles = Object.entries(ROLES).filter(([k])=>k!=='superadmin');
    UI.modal('＋ Nuevo Usuario del Sistema', `
      <div class="alert alert-amber" style="margin-bottom:12px">
        <div class="alert-icon">🔑</div>
        <div class="alert-body" style="font-size:11px">El usuario iniciará sesión con la contraseña temporal y deberá cambiarla en su primer ingreso.</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre Completo *</label>
          <input class="form-input" id="nu-nombre" placeholder="Juan García"></div>
        <div class="form-group"><label class="form-label">Rol *</label>
          <select class="form-select" id="nu-rol">
            ${roles.map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Correo Electrónico *</label>
          <input class="form-input" id="nu-email" type="email" placeholder="usuario@empresa.gt"></div>
        <div class="form-group"><label class="form-label">Teléfono</label>
          <input class="form-input" id="nu-tel" placeholder="5540-1234"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Contraseña Temporal *</label>
          <div style="position:relative">
            <input class="form-input" id="nu-pass" type="password" placeholder="Mínimo 8 caracteres" style="padding-right:44px">
            <button type="button" onclick="UI.togglePass('nu-pass',this)"
              style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;color:var(--text3)">👁</button>
          </div></div>
        <div class="form-group"><label class="form-label">Avatar (emoji)</label>
          <input class="form-input" id="nu-avatar" value="👤" maxlength="2"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.usuarios.crearUsuario()">Crear Usuario</button>
      </div>`,'560px');
  },

  async crearUsuario() {
    const nombre = document.getElementById('nu-nombre')?.value.trim();
    const email  = document.getElementById('nu-email')?.value.trim();
    const rol    = document.getElementById('nu-rol')?.value;
    const tel    = document.getElementById('nu-tel')?.value.trim();
    const pass   = document.getElementById('nu-pass')?.value;
    const avatar = document.getElementById('nu-avatar')?.value||'👤';

    if (!nombre||!email||!rol||!pass) { UI.toast('Completa todos los campos obligatorios','error'); return; }
    if (pass.length<8) { UI.toast('Contraseña mínimo 8 caracteres','error'); return; }

    UI.toast('Creando usuario...','info');
    const r = await Auth.crearUsuario({ nombre, email, rol, telefono:tel, avatar, password:pass });
    if (!r.ok) { UI.toast('Error: '+r.error,'error'); return; }
    UI.cerrarModal();
    UI.toast(`Usuario ${nombre} creado ✓`);
    this.render();
  },

  async modalEditar(id) {
    const u = this._data.find(x=>x.id===id);
    if (!u) return;
    const roles = Object.entries(ROLES).filter(([k])=>k!=='superadmin');
    const permsBase = PERMISOS[u.rol]||{};
    const permsCustom = u.permisos_custom||{};

    UI.modal('✏️ Editar Usuario: '+u.nombre, `
      <div class="alert alert-amber" style="margin-bottom:12px">
        <div class="alert-icon">⚠️</div>
        <div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del usuario.</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre *</label>
          <input class="form-input" id="eu-nombre" value="${u.nombre}"></div>
        <div class="form-group"><label class="form-label">Rol</label>
          <select class="form-select" id="eu-rol" onchange="Modulos.usuarios._actualizarPermisos(this.value,'${id}')">
            ${roles.map(([k,v])=>`<option value="${k}" ${u.rol===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Teléfono</label>
          <input class="form-input" id="eu-tel" value="${u.telefono||''}"></div>
        <div class="form-group"><label class="form-label">Avatar</label>
          <input class="form-input" id="eu-avatar" value="${u.avatar||'👤'}" maxlength="2"></div>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="eu-activo" ${u.activo?'checked':''}>
          <span class="form-label" style="margin:0">Usuario activo</span>
        </label>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px">
        <div style="font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">
          🔐 Acceso a Módulos
          <span style="font-weight:400;font-size:10px;margin-left:6px">(sobreescribe los del rol)</span>
        </div>
        <div id="eu-permisos" style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">
          ${MODULOS.filter(m=>m.id!=='mi_ot').map(m=>{
            const base = permsBase[m.id]||false;
            const custom = permsCustom[m.id];
            const activo = custom!==undefined?custom:base;
            return `<label style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--surface2);border-radius:6px;cursor:pointer;font-size:12px;border:1px solid ${activo?'var(--cyan-border)':'var(--border)'}">
              <input type="checkbox" data-mod="${m.id}" ${activo?'checked':''} style="accent-color:var(--cyan)">
              ${m.icon} ${m.label}
              ${custom!==undefined?'<span style="font-size:9px;color:var(--amber);margin-left:auto">custom</span>':''}
            </label>`;
          }).join('')}
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-ghost btn-sm" onclick="Modulos.usuarios.modalReset('${id}','${u.nombre}')">🔑 Reset Pass</button>
        <button class="btn btn-amber" onclick="Modulos.usuarios.guardarEdicion('${id}')">Guardar Cambios</button>
      </div>`,'640px');
  },

  _actualizarPermisos(rol, userId) {
    const base = PERMISOS[rol]||{};
    document.querySelectorAll('#eu-permisos input[data-mod]').forEach(cb => {
      cb.checked = base[cb.dataset.mod]||false;
    });
  },

  async guardarEdicion(id) {
    const nombre = document.getElementById('eu-nombre')?.value.trim();
    const rol    = document.getElementById('eu-rol')?.value;
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }

    const base = PERMISOS[rol]||{};
    const custom = {};
    document.querySelectorAll('#eu-permisos input[data-mod]').forEach(cb => {
      if (cb.checked !== (base[cb.dataset.mod]||false)) custom[cb.dataset.mod] = cb.checked;
    });

    const ok = await DB.upsertUsuario({
      id, nombre, rol,
      telefono: document.getElementById('eu-tel')?.value||null,
      avatar:   document.getElementById('eu-avatar')?.value||'👤',
      activo:   document.getElementById('eu-activo')?.checked,
      permisos_custom: Object.keys(custom).length ? custom : null,
      updated_at: new Date().toISOString()
    });

    if (!ok) { UI.toast('Error al guardar','error'); return; }
    UI.cerrarModal();
    UI.toast('Usuario actualizado ✓');
    this.render();
  },

  modalReset(id, nombre) {
    UI.modal('🔑 Resetear Contraseña — '+nombre, `
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px">
        El usuario deberá cambiar esta contraseña en su próximo ingreso.
      </p>
      <div class="form-group">
        <label class="form-label">Nueva Contraseña Temporal *</label>
        <div style="position:relative">
          <input class="form-input" id="rp-pass" type="password" placeholder="Mínimo 8 caracteres" style="padding-right:44px">
          <button type="button" onclick="UI.togglePass('rp-pass',this)"
            style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;color:var(--text3)">👁</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.usuarios.ejecutarReset('${id}')">Resetear</button>
      </div>`);
  },

  async ejecutarReset(id) {
    const pass = document.getElementById('rp-pass')?.value;
    if (!pass||pass.length<8) { UI.toast('Mínimo 8 caracteres','error'); return; }
    const ok = await DB.upsertUsuario({ id, debe_cambiar_password:true, updated_at:new Date().toISOString() });
    if (!ok) { UI.toast('Error','error'); return; }
    UI.cerrarModal();
    UI.toast('Password reseteado ✓ — El usuario deberá cambiarlo al ingresar');
  }
};
