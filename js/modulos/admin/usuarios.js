/* NexusPro v3.0 — usuarios/index.js */
Modulos.usuarios = {
  _data: [],

  async render() {
    const el = document.getElementById('page-content');
    UI.loading(el);
    this._data = await DB.getUsuarios();

    el.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title">👥 Usuarios del Sistema</h1>
        <p class="page-subtitle">// ${this._data.length} usuarios registrados</p></div>
        <div class="page-actions">
          <button class="btn btn-amber" onclick="Modulos.usuarios.modalNuevo()">＋ Nuevo Usuario</button>
        </div>
      </div>
      <div class="page-body">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Usuario</th><th>Rol</th><th>Email</th><th>Teléfono</th>
              <th>Módulos Activos</th><th>Estado</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              ${this._data.map(u => {
                const permsBase   = PERMISOS[u.rol] || {};
                const permsCustom = u.permisos_custom || {};
                const permsEfectivos = {...permsBase, ...permsCustom};
                const modulosActivos = MODULOS.filter(m => m.id !== 'mi_ot' && moduloEnPlan(m.id) && permsEfectivos[m.id]).length;
                const tieneCustom    = Object.keys(permsCustom).length > 0;
                return `<tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <span style="font-size:20px">${u.avatar||'👤'}</span>
                      <div>
                        <div style="font-weight:700">${u.nombre}</div>
                        <div style="font-size:10px;color:var(--text3)">${u.ultimo_login ? 'Último: '+UI.fecha(u.ultimo_login) : 'Sin ingresos'}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="badge badge-${ROLES[u.rol]?.color||'gray'}">${ROLES[u.rol]?.icon||''} ${ROLES[u.rol]?.label||u.rol}</span></td>
                  <td style="font-size:12px">${u.email}</td>
                  <td>${u.telefono||'—'}</td>
                  <td>
                    <span class="badge badge-${modulosActivos>0?'cyan':'gray'}">${modulosActivos} módulos</span>
                    ${tieneCustom?'<span class="badge badge-amber" style="margin-left:4px">custom</span>':''}
                  </td>
                  <td><span class="badge badge-${u.activo?'green':'red'}">${u.activo?'Activo':'Inactivo'}</span></td>
                  <td>
                    <div style="display:flex;gap:4px">
                      <button class="btn btn-sm btn-cyan" onclick="Modulos.usuarios.modalEditar('${u.id}')">✏️ Editar</button>
                      <button class="btn btn-sm btn-ghost" onclick="Modulos.usuarios.modalReset('${u.id}','${u.nombre}')">🔑</button>
                  <button class="btn btn-sm btn-danger" onclick="Modulos.usuarios.eliminar('${u.id}','${u.nombre}')" title="Eliminar">🗑️</button>
                    </div>
                  </td>
                </tr>`;
              }).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin usuarios registrados</td></tr>'}
            </tbody>
          </table>
        </div>

        <!-- Leyenda de roles -->
        <div class="card" style="margin-top:20px">
          <div class="card-sub mb-3">📋 Permisos por Defecto por Rol</div>
          <div style="overflow-x:auto">
            <table class="data-table" style="min-width:900px">
              <thead><tr>
                <th>Módulo</th>
                ${Object.entries(ROLES).filter(([k])=>k!=='superadmin').map(([k,v])=>`<th style="text-align:center">${v.icon} ${v.label}</th>`).join('')}
              </tr></thead>
              <tbody>
                ${MODULOS.filter(m=>m.id!=='mi_ot' && moduloEnPlan(m.id)).map(m=>`<tr>
                  <td>${m.icon} ${m.label}</td>
                  ${Object.keys(ROLES).filter(k=>k!=='superadmin').map(rol=>`
                    <td style="text-align:center">
                      <span style="color:${PERMISOS[rol]?.[m.id]?'var(--green)':'var(--text3)'};font-size:16px">
                        ${PERMISOS[rol]?.[m.id]?'✓':'—'}
                      </span>
                    </td>`).join('')}
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Tarjeta de mi 2FA -->
        <div class="card" style="margin-top:20px; border-left: 4px solid var(--amber)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-weight:800;font-size:14px;color:var(--amber)">🔐 Tu Autenticación de Dos Factores (2FA / MFA)</div>
              <p style="font-size:12px;color:var(--text2);margin-top:4px">
                NexusPro exige la verificación por segundo factor para asegurar las operaciones.
              </p>
            </div>
            <div id="mi-2fa-status-container">Cargando estado de tu 2FA...</div>
          </div>
        </div>
      </div>`;
    
    setTimeout(() => this._cargarMi2FAStatus(), 100);
  },

  async _cargarMi2FAStatus() {
    const container = document.getElementById('mi-2fa-status-container');
    if (!container) return;
    try {
      const factors = await Auth.listMFAFactors();
      const activeFactor = factors.find(f => f.status === 'verified');
      if (activeFactor) {
        container.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px">
            <span class="badge badge-green">✓ Activo (TOTP)</span>
            <button class="btn btn-danger btn-xs" onclick="Modulos.usuarios._desactivarMi2FA('${activeFactor.id}')">Desactivar 2FA</button>
          </div>`;
      } else {
        container.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px">
            <span class="badge badge-red">Inactivo</span>
            <button class="btn btn-amber btn-xs" onclick="Modulos.usuarios._activarMi2FA()">Configurar 2FA</button>
          </div>`;
      }
    } catch(e) {
      container.innerText = 'Error al consultar 2FA';
    }
  },

  async _activarMi2FA() {
    UI.modal('🔒 Enrolar Autenticador 2FA', `
      <div style="text-align:center;padding:12px">
        <p style="font-size:13px;color:var(--text2);margin-bottom:16px;line-height:1.5">
          Escanea el código QR con tu aplicación de autenticación para activar el doble factor de seguridad:
        </p>
        <div id="modal-mfa-qr-container" style="display:flex;justify-content:center;background:#ffffff;padding:8px;border-radius:6px;width:150px;height:150px;margin:0 auto 12px">
          <span style="font-size:11px;color:#000000;display:flex;align-items:center">Generando QR...</span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Clave secreta manual:</div>
        <code id="modal-mfa-secret-text" class="mono-sm" style="background:var(--surface2);padding:4px 8px;border-radius:4px;display:inline-block;word-break:break-all;color:var(--amber)">Generando...</code>
        
        <div class="form-group" style="text-align:left;margin-top:16px">
          <label class="form-label">Código de Verificación (6 dígitos) *</label>
          <input class="form-input" id="modal-mfa-code" type="text" placeholder="Ej. 123456" maxLength="6"
                 style="font-size:18px;text-align:center;letter-spacing:6px;font-family:monospace"
                 oninput="this.value=this.value.replace(/\\D/g,'')">
        </div>
        <button class="btn btn-amber" style="width:100%" onclick="Modulos.usuarios._confirmarActivacion2FA()">Activar 2FA</button>
      </div>`, '420px');

    const res = await Auth.enrollTOTP();
    if (!res.ok) {
      UI.toast('Error al iniciar 2FA: ' + res.error, 'error');
      UI.cerrarModal();
      return;
    }
    
    this._tempEnrollId = res.data.id;
    
    const qrContainer = document.getElementById('modal-mfa-qr-container');
    const secretText = document.getElementById('modal-mfa-secret-text');
    const totp = res.data.totp || {};
    if (secretText) secretText.innerText = totp.secret || '(no disponible)';
    if (qrContainer && typeof pintarQrOTP === 'function') {
      const ok = await pintarQrOTP(qrContainer, totp.uri, totp.qr_code, 134);
      if (!ok) qrContainer.innerHTML = `<span style="font-size:11px;color:#000">Usa la clave manual 👇</span>`;
    } else if (qrContainer && totp.qr_code) {
      qrContainer.innerHTML = `<img src="${totp.qr_code}" style="width:134px;height:134px;object-fit:contain" alt="QR">`;
    }

    const chal = await Auth.createMFAChallenge(res.data.id);
    this._tempChallengeId = chal.ok ? chal.data.id : null;
  },

  async _confirmarActivacion2FA() {
    const code = document.getElementById('modal-mfa-code')?.value.trim();
    if (!code || code.length !== 6) {
      UI.toast('Ingresa el código de 6 dígitos', 'error');
      return;
    }
    if (!this._tempEnrollId || !this._tempChallengeId) {
      UI.toast('Falta sesión de enrolamiento. Intenta de nuevo.', 'error');
      return;
    }
    UI.toast('Verificando...', 'info');
    const res = await Auth.verifyMFAFactor(this._tempEnrollId, this._tempChallengeId, code);
    if (res.ok) {
      UI.toast('¡2FA Activado con éxito! ✓', 'success');
      UI.cerrarModal();
      this._cargarMi2FAStatus();
    } else {
      UI.toast('Código incorrecto: ' + res.error, 'error');
    }
  },

  async _desactivarMi2FA(factorId) {
    const ok = await UI.confirmar('¿Seguro que deseas desactivar tu autenticación de dos factores? Esto reducirá la seguridad de tu cuenta.', 'Desactivar');
    if (!ok) return;
    UI.toast('Desactivando 2FA...', 'info');
    const res = await Auth.unenrollMFAFactor(factorId);
    if (res.ok) {
      UI.toast('2FA Desactivado ✓', 'success');
      this._cargarMi2FAStatus();
    } else {
      UI.toast('Error: ' + res.error, 'error');
    }
  },

  modalNuevo() {
    const roles = Object.entries(ROLES).filter(([k])=>k!=='superadmin');
    UI.modal('＋ Nuevo Usuario del Sistema', `
      <div class="alert alert-amber" style="margin-bottom:12px">
        <div class="alert-icon">🔑</div>
        <div class="alert-body" style="font-size:11px">El usuario iniciará sesión con la contraseña temporal y deberá cambiarla obligatoriamente en su primer ingreso.</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre Completo *</label>
          <input class="form-input" id="nu-nombre" placeholder="Juan García Pérez"></div>
        <div class="form-group"><label class="form-label">Rol *</label>
          <select class="form-select" id="nu-rol" onchange="Modulos.usuarios._previewPermisos(this.value)">
            ${roles.map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Correo Electrónico *</label>
          <input class="form-input" id="nu-email" type="email" placeholder="usuario@empresa.gt"></div>
        <div class="form-group"><label class="form-label">Teléfono</label>
          <input class="form-input" id="nu-tel" placeholder="5540-1234"></div>
      </div>
      <div class="form-group"><label class="form-label">Reporta a (jefe)</label>
        <select class="form-select" id="nu-jefe">
          <option value="">— Sin jefe (CEO / Dueño / Gerente General) —</option>
          ${this._data.map(u=>`<option value="${u.id}">${u.avatar||'👤'} ${u.nombre} — ${ROLES[u.rol]?.label||u.rol}</option>`).join('')}
        </select></div>
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

      <!-- Preview permisos del rol seleccionado -->
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">
          🔐 Módulos con acceso según el rol seleccionado
        </div>
        <div id="nu-permisos-preview" style="display:flex;flex-wrap:wrap;gap:6px">
          ${MODULOS.filter(m=>m.id!=='mi_ot'&&moduloEnPlan(m.id)&&PERMISOS.recepcionista?.[m.id]).map(m=>`
            <span class="badge badge-cyan">${m.icon} ${m.label}</span>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:8px">Puedes personalizar los módulos desde la edición del usuario.</div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.usuarios.crearUsuario()">Crear Usuario</button>
      </div>`,'580px');
  },

  _previewPermisos(rol) {
    const el = document.getElementById('nu-permisos-preview');
    if (!el) return;
    const perms = PERMISOS[rol] || {};
    el.innerHTML = MODULOS.filter(m=>m.id!=='mi_ot'&&moduloEnPlan(m.id)&&perms[m.id]).map(m=>`
      <span class="badge badge-cyan">${m.icon} ${m.label}</span>`).join('') ||
      '<span style="color:var(--text3);font-size:12px">Sin módulos predefinidos para este rol</span>';
  },

  async crearUsuario() {
    const nombre = document.getElementById('nu-nombre')?.value.trim();
    const email  = document.getElementById('nu-email')?.value.trim();
    const rol    = document.getElementById('nu-rol')?.value;
    const tel    = document.getElementById('nu-tel')?.value.trim();
    const pass   = document.getElementById('nu-pass')?.value;
    const avatar = document.getElementById('nu-avatar')?.value||'👤';
    const jefe = document.getElementById('nu-jefe')?.value || null;
    if (!nombre||!email||!rol||!pass) { UI.toast('Completa todos los campos obligatorios','error'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { UI.toast('El correo no es válido','error'); return; }
    if (!tel || !/^\+?[\d\s-]{8,15}$/.test(tel)) { UI.toast('El teléfono es obligatorio (mínimo 8 dígitos) — se usa para recuperar el acceso','error'); return; }
    if (pass.length<8) { UI.toast('Contraseña mínimo 8 caracteres','error'); return; }
    UI.toast('Creando usuario...','info');
    const r = await Auth.crearUsuario({ nombre, email, rol, telefono:tel, avatar, password:pass });
    if (!r.ok) { UI.toast('Error: '+r.error,'error'); return; }
    /* Asignar jefe (cadena de mando) tras crear el usuario */
    if (jefe && r.id) await DB.upsertUsuario({ id:r.id, reporta_a:jefe });
    UI.cerrarModal();
    UI.toast(`✓ Usuario ${nombre} creado — recibirá la contraseña temporal por el medio que indiques`);
    this.render();
  },

  async modalEditar(id) {
    const u = this._data.find(x=>x.id===id);
    if (!u) return;
    const roles = Object.entries(ROLES).filter(([k])=>k!=='superadmin');
    const permsBase   = PERMISOS[u.rol] || {};
    const permsCustom = u.permisos_custom || {};

    UI.modal('✏️ Editar Usuario: '+u.nombre, `
      <div class="alert alert-amber" style="margin-bottom:12px">
        <div class="alert-icon">⚠️</div>
        <div class="alert-body" style="font-size:11px">Los cambios reemplazarán la información actual del usuario.</div>
      </div>

      <!-- DATOS BÁSICOS -->
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nombre *</label>
          <input class="form-input" id="eu-nombre" value="${u.nombre}"></div>
        <div class="form-group"><label class="form-label">Rol</label>
          <select class="form-select" id="eu-rol" onchange="Modulos.usuarios._actualizarPermisos(this.value)">
            ${roles.map(([k,v])=>`<option value="${k}" ${u.rol===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Teléfono</label>
          <input class="form-input" id="eu-tel" value="${u.telefono||''}"></div>
        <div class="form-group"><label class="form-label">Avatar (emoji)</label>
          <input class="form-input" id="eu-avatar" value="${u.avatar||'👤'}" maxlength="2"></div>
      </div>
      <div class="form-group"><label class="form-label">Reporta a (jefe)</label>
        <select class="form-select" id="eu-jefe">
          <option value="">— Sin jefe (CEO / Dueño / Gerente General) —</option>
          ${this._data.filter(x=>x.id!==u.id).map(x=>`<option value="${x.id}" ${u.reporta_a===x.id?'selected':''}>${x.avatar||'👤'} ${x.nombre} — ${ROLES[x.rol]?.label||x.rol}</option>`).join('')}
        </select></div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="eu-activo" ${u.activo?'checked':''}>
          <span class="form-label" style="margin:0">Usuario activo</span>
        </label>
      </div>

      <!-- EDITOR DE PERMISOS POR MÓDULO -->
      <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:8px">
        <div style="font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">
          🔐 Acceso a Módulos
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px">
          Los <span style="color:var(--amber)">marcados con ★</span> son personalizados (difieren del rol base).
          Los cambios en el rol actualizan los valores base pero conservan las personalizaciones.
        </div>
        <div id="eu-permisos" style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">
          ${MODULOS.filter(m=>m.id!=='mi_ot'&&moduloEnPlan(m.id)).map(m=>{
            const base   = permsBase[m.id] || false;
            const custom = permsCustom[m.id];
            const activo = custom !== undefined ? custom : base;
            const esCustom = custom !== undefined && custom !== base;
            return `<label style="display:flex;align-items:center;gap:6px;padding:7px 10px;
              background:var(--surface2);border-radius:8px;cursor:pointer;font-size:12px;
              border:1px solid ${activo?'var(--cyan-border)':'var(--border)'}">
              <input type="checkbox" data-mod="${m.id}" ${activo?'checked':''} style="accent-color:var(--cyan)">
              <span>${m.icon} ${m.label}</span>
              ${esCustom?'<span style="margin-left:auto;color:var(--amber);font-size:10px">★ custom</span>':''}
            </label>`;
          }).join('')}
          ${(()=>{
            const base   = permsBase.doc_empresa || false;
            const custom = permsCustom.doc_empresa;
            const activo = custom !== undefined ? custom : base;
            const esCustom = custom !== undefined && custom !== base;
            return `<label style="display:flex;align-items:center;gap:6px;padding:7px 10px;
              background:var(--surface2);border-radius:8px;cursor:pointer;font-size:12px;
              border:1px solid ${activo?'var(--cyan-border)':'var(--border)'}">
              <input type="checkbox" data-mod="doc_empresa" ${activo?'checked':''} style="accent-color:var(--cyan)">
              <span>🗂️ Documentos legales (empresa)</span>
              ${esCustom?'<span style="margin-left:auto;color:var(--amber);font-size:10px">★ custom</span>':''}
            </label>`;
          })()}
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-ghost btn-sm" onclick="Modulos.usuarios.modalReset('${id}','${u.nombre}')">🔑 Reset Pass</button>
        <button class="btn btn-amber" onclick="Modulos.usuarios.guardarEdicion('${id}')">Guardar Cambios</button>
      </div>`,'640px');
  },

  _actualizarPermisos(rol) {
    const base = PERMISOS[rol] || {};
    document.querySelectorAll('#eu-permisos input[data-mod]').forEach(cb => {
      const mod = cb.dataset.mod;
      cb.checked = base[mod] || false;
      cb.closest('label').style.borderColor = cb.checked ? 'var(--cyan-border)' : 'var(--border)';
    });
  },

  async guardarEdicion(id) {
    const nombre = document.getElementById('eu-nombre')?.value.trim();
    const rol    = document.getElementById('eu-rol')?.value;
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }

    const base   = PERMISOS[rol] || {};
    const custom = {};
    document.querySelectorAll('#eu-permisos input[data-mod]').forEach(cb => {
      const val = cb.checked;
      if (val !== (base[cb.dataset.mod] || false)) custom[cb.dataset.mod] = val;
    });

    const jefe = document.getElementById('eu-jefe')?.value || null;
    const ok = await DB.upsertUsuario({
      id, nombre, rol,
      telefono:        document.getElementById('eu-tel')?.value || null,
      avatar:          document.getElementById('eu-avatar')?.value || '👤',
      activo:          document.getElementById('eu-activo')?.checked,
      reporta_a:       jefe !== id ? jefe : null,
      permisos_custom: Object.keys(custom).length ? custom : null,
      updated_at:      new Date().toISOString()
    });

    if (!ok) { UI.toast('Error al guardar','error'); return; }
    UI.cerrarModal();
    UI.toast('Usuario y permisos actualizados ✓');
    this.render();
  },

  modalReset(id, nombre) {
    UI.modal('🔑 Resetear Contraseña — '+nombre, `
      <div class="alert alert-amber" style="margin-bottom:12px">
        <div class="alert-icon">⚠️</div>
        <div class="alert-body" style="font-size:12px">
          El usuario deberá cambiar esta contraseña obligatoriamente en su próximo ingreso.
          Entrégala por el medio que consideres más seguro (presencial, WhatsApp, etc.).
        </div>
      </div>
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
        <button class="btn btn-amber" onclick="Modulos.usuarios.ejecutarReset('${id}')">Resetear Contraseña</button>
      </div>`);
  },

  async eliminar(id, nombre) {
    const ok = await UI.confirmar(`¿Eliminar usuario <b>${nombre}</b>? Esta acción desactiva su acceso al sistema.`, 'Eliminar');
    if (!ok) return;
    const ok2 = await DB.upsertUsuario({ id, activo: false, updated_at: new Date().toISOString() });
    if (ok2) { UI.toast('Usuario desactivado ✓'); this.render(); }
    else UI.toast('Error al eliminar','error');
  },

  async ejecutarReset(id) {
    const pass = document.getElementById('rp-pass')?.value;
    if (!pass||pass.length<8) { UI.toast('Mínimo 8 caracteres','error'); return; }
    UI.toast('Reseteando contraseña...','info');
    const r = await Auth.resetPassword(id, pass);
    if (!r.ok) { UI.toast('Error: '+r.error,'error'); return; }
    UI.cerrarModal();
    UI.toast('Contraseña reseteada ✓ — el usuario debe cambiarla al ingresar');
  }
};
