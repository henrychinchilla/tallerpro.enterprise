/* ═══════════════════════════════════════════════════════
   auth.js — Sistema de Autenticación Multi-Tenant
   TallerPro Enterprise v2.0

   Flujo:
   1. Login con nombre/NIT del taller + email + contraseña
   2. Primera vez: crear taller nuevo
   3. demo@demo.com: acceso demo con taller de ejemplo
   4. Recuperación por email / SMS / código interno
═══════════════════════════════════════════════════════ */

const Auth = {
  user:     null,
  tenant:   null,
  supaUser: null,

  /* ── LOGIN SUPABASE ───────────────────────────────── */
  async loginWithSupabase(email, password, tenantSlug = null) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };

    Auth.supaUser = data.user;
    await Auth._loadProfile(data.user.id, data.user.email, tenantSlug);

    // Verificar licencia del tenant (excepto henry que es superadmin global)
    if (email !== 'henry.chinchilla@gmail.com' && Auth.tenant?.id) {
      const lic = await DB.verificarLicencia(Auth.tenant.id);
      Auth.licencia = lic;
      if (!lic.valida) {
        return { ok: false, error: 'licencia_expirada', licencia: lic };
      }
    }

    return { ok: true };
  },

  /* ── CARGAR PERFIL ────────────────────────────────── */
  async _loadProfile(userId, email, tenantSlug = null) {
    try {
      /* Buscar por tenant específico si viene slug */
      let q = getSupabase()
        .from('usuarios')
        .select('*, tenants(id,slug,name,nit,tel,email,address,logo_base64)')
        .eq('id', userId);
      if (tenantSlug) {
        q = q.eq('tenants.slug', tenantSlug);
      }
      const { data, error } = await q.single();

      if (data && !error && data.tenants) {
        Auth.user   = data;
        Auth.tenant = data.tenants;
        getSupabase().from('usuarios')
          .update({ ultimo_login: new Date().toISOString() })
          .eq('id', userId).then(() => {});
        return data;
      }
    } catch(e) { /* perfil no existe aún */ }

    /* Fallback: sin perfil en BD, construir desde email */
    const tenant = await DB.getTenant(tenantSlug);
    const isHenry = (email||'').toLowerCase().includes('henry.chinchilla');
    const isDemo  = (email||'').toLowerCase() === 'demo@demo.com';

    Auth.user = {
      id:     userId,
      nombre: isHenry ? 'Henry Chinchilla' : isDemo ? 'Demo Admin' : (email||'').split('@')[0],
      email:  email || '',
      rol:    isHenry ? 'superadmin' : 'admin',
      activo: true,
      avatar: isHenry ? '⚡' : '👑',
      tenant_id: tenant?.id
    };
    Auth.tenant = tenant;

    /* Guardar perfil para próximas sesiones */
    try {
      await getSupabase().from('usuarios').upsert({
        id:        userId,
        tenant_id: tenant?.id,
        nombre:    Auth.user.nombre,
        email:     email || '',
        rol:       Auth.user.rol,
        activo:    true,
        avatar:    Auth.user.avatar
      });
    } catch(e2) { console.warn('Profile save:', e2); }

    return Auth.user;
  },

  /* ── REGISTRO DE NUEVO TALLER ─────────────────────── */
  async registrarNuevoTaller(fields) {
    const sb = getSupabase();

    /* 1. Crear usuario en Supabase Auth */
    const { data: authData, error: authErr } = await sb.auth.signUp({
      email:    fields.email,
      password: fields.password,
      options:  { data: { nombre: fields.nombre_usuario, rol: 'admin' } }
    });
    if (authErr) return { ok: false, error: authErr.message };

    /* 2. Crear taller (tenant + licencia demo + config fiscal) */
    const tallerResult = await DB.crearTaller(fields.nombre_taller, fields.nit_taller, fields.email);
    if (!tallerResult.ok) return { ok: false, error: tallerResult.error };

    const tenantId = tallerResult.tenantId;

    /* 3. Crear perfil admin */
    await sb.from('usuarios').upsert({
      id:        authData.user.id,
      tenant_id: tenantId,
      nombre:    fields.nombre_usuario,
      email:     fields.email,
      rol:       'admin',
      activo:    true,
      avatar:    '👑'
    });

    /* 4. Crear perfil oculto de Henry en este taller */
    await Auth._asegurarHenryEnTaller(tenantId);

    /* 5. Set session */
    Auth.supaUser = authData.user;
    Auth.tenant   = tallerResult.tenant || await DB.getTenant(null, tenantId);
    Auth.user     = {
      id: authData.user.id, nombre: fields.nombre_usuario,
      email: fields.email, rol: 'admin', activo: true, avatar: '👑',
      tenant_id: tenantId
    };
    Auth.licencia = { valida: true, tipo: 'demo', dias_restantes: 30 };

    return { ok: true };
  },

  /* ── HENRY SUPERUSER EN CADA TALLER ──────────────── */
  async _asegurarHenryEnTaller(tenantId) {
    /* Henry tiene acceso a TODOS los talleres como superadmin oculto */
    /* Se registra en public.usuarios con cada tenant */
    try {
      /* Buscar el auth.user de henry */
      const { data: henryAuth } = await getSupabase()
        .from('usuarios')
        .select('id')
        .eq('email', 'henry.chinchilla@gmail.com')
        .limit(1)
        .maybeSingle();

      if (henryAuth?.id) {
        /* Ya existe en usuarios — asegurar que tenga entrada para este tenant */
        await getSupabase().from('usuarios').upsert({
          id:        henryAuth.id + '_' + tenantId.slice(0,8), // ID compuesto único
          tenant_id: tenantId,
          nombre:    'Henry Chinchilla',
          email:     'henry.chinchilla@gmail.com',
          rol:       'superadmin',
          activo:    true,
          avatar:    '⚡'
        }).catch(() => {}); // Silencioso si falla
      }
    } catch(e) { /* silencioso */ }
  },

  /* ── LOGIN DEMO ───────────────────────────────────── */
  async quickLogin(role) {
    Auth.tenant = await DB.getTenant();
    Auth.user   = { ...DEMO_USERS[role], activo: true };
  },

  /* ── LOGOUT ───────────────────────────────────────── */
  async logout() {
    if (Auth.supaUser) await getSupabase().auth.signOut();
    Auth.user = null; Auth.tenant = null; Auth.supaUser = null;
  },

  can(pageId) {
    const item = NAV.find(n => n.id === pageId);
    return item ? item.roles.includes(Auth.user?.rol) : false;
  },
  isAdmin() { return ['admin','superadmin'].includes(Auth.user?.rol); }
};

/* ══════════════════════════════════════════════════════
   RECOVERY
══════════════════════════════════════════════════════ */
const AUTH_RECOVERY = {
  _code: null, _email: null, _exp: null,
  _genCode() { return String(Math.floor(100000 + Math.random() * 900000)); },

  async porEmail(email) {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '?reset=true'
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async porCodigoInterno(email) {
    const code = this._genCode();
    this._code = code; this._email = email;
    this._exp  = Date.now() + 10 * 60 * 1000;
    await NOTIF.sendEmail(email, '🔐 Código de Recuperación — TallerPro',
      `<h2>Código de Recuperación</h2>
       <div style="font-size:40px;font-family:monospace;text-align:center;padding:20px;background:#f3f4f6;border-radius:8px;letter-spacing:10px"><b>${code}</b></div>
       <p>Válido por <b>10 minutos</b>.</p>`
    );
    if (NOTIF.config.modo_dev || !NOTIF.config.sendgrid_key) {
      setTimeout(() => {
        UI.openModal('🔐 Código (Modo Dev)', `
          <div style="text-align:center;padding:20px">
            <div style="font-size:52px;font-weight:700;letter-spacing:12px;color:var(--amber);padding:20px;background:var(--surface2);border-radius:8px;font-family:'DM Mono',monospace">${code}</div>
            <div class="text-muted mt-3" style="font-size:12px">Vence en 10 minutos · Solo visible en modo dev</div>
            <div class="modal-footer" style="justify-content:center;margin-top:16px">
              <button class="btn btn-amber" onclick="UI.closeModal()">Entendido</button>
            </div>
          </div>`
        );
      }, 800);
    }
    return { ok: true };
  },

  verificar(ingresado) {
    if (!this._code) return { ok: false, error: 'Sin código activo' };
    if (Date.now() > this._exp) { this._code = null; return { ok: false, error: 'Código expirado' }; }
    if (ingresado !== this._code) return { ok: false, error: 'Código incorrecto' };
    return { ok: true };
  },

  async cambiarPassword(pass) {
    const { error } = await getSupabase().auth.updateUser({ password: pass });
    if (error) return { ok: false, error: error.message };
    this._code = null;
    return { ok: true };
  }
};

/* ══════════════════════════════════════════════════════
   LOGIN UI — Multi-tenant con logo
══════════════════════════════════════════════════════ */
let _loginView = 'login';
let _loginTenant = null; // tenant encontrado al buscar por nombre/NIT

async function renderLoginScreen() {
  const screen = document.getElementById('login-screen');
  if (!screen) return;

  /* Logo y nombre dummy si no hay taller */
  const logoUrl  = null; // Se carga cuando se identifica el taller
  const tallerNombre = 'TallerPro Enterprise';

  const views = {

    /* ── LOGIN PRINCIPAL ────────────────────────────── */
    login: `
      <div style="text-align:center;margin-bottom:24px">
        <div id="login-logo-wrap" style="margin-bottom:12px">
          ${_loginTenant?.logo_base64
            ? `<img src="${_loginTenant.logo_base64}" style="max-height:72px;max-width:200px;object-fit:contain;border-radius:8px">`
            : `<div style="font-size:52px;line-height:1">🔧</div>`}
        </div>
        <h1 style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:.06em;color:var(--amber);margin:0">
          ${_loginTenant?.name || 'TallerPro Enterprise'}
        </h1>
        ${_loginTenant?.nit
          ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">NIT: ${_loginTenant.nit}</div>`
          : `<div style="font-size:11px;color:var(--text3);margin-top:2px">Sistema de Gestión Automotriz · Guatemala</div>`}
      </div>

      <div class="login-form">
        <!-- Identificación del taller -->
        <div class="form-group">
          <label class="form-label" style="font-size:11px;color:var(--text3)">NOMBRE O NIT DEL TALLER</label>
          <div style="display:flex;gap:6px">
            <input class="form-input" id="l-taller" placeholder="Mi Taller Mecánico o NIT: 1234567-8"
                   value="${_loginTenant?.name || ''}"
                   onkeydown="if(event.key==='Enter')AUTH_UI.buscarTaller()">
            <button class="btn btn-ghost btn-sm" onclick="AUTH_UI.buscarTaller()" style="white-space:nowrap;padding:8px 12px">
              Buscar
            </button>
          </div>
          ${_loginTenant ? `<div style="font-size:11px;color:var(--green);margin-top:4px">✓ ${_loginTenant.name}</div>` : ''}
        </div>

        <div class="form-group">
          <label class="form-label">Correo Electrónico</label>
          <input class="form-input" id="l-email" type="email" placeholder="usuario@mitaller.gt"
                 onkeydown="if(event.key==='Enter')document.getElementById('l-pass').focus()">
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <div style="position:relative">
            <input class="form-input" id="l-pass" type="password" placeholder="••••••••"
                   onkeydown="if(event.key==='Enter')doLogin()" style="padding-right:40px">
            <button onclick="UI._togglePass('l-pass',this)"
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px">👁</button>
          </div>
        </div>

        <button class="btn btn-amber" style="width:100%;margin-top:4px" onclick="doLogin()">
          Iniciar Sesión →
        </button>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
          <button class="btn btn-ghost btn-sm" onclick="renderLoginView('recovery-select')" style="width:100%">
            🔑 Olvidé mi contraseña
          </button>
          <button class="btn btn-ghost btn-sm" onclick="renderLoginView('nuevo-taller')" style="width:100%">
            🏪 Crear nuevo taller
          </button>
        </div>

        <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px;text-align:center">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px">¿Primera vez? Usa el acceso demo</div>
          <button class="btn btn-ghost btn-sm" onclick="AUTH_UI.loginDemo()" style="width:100%">
            🚀 Ingresar con cuenta demo
          </button>
        </div>

        <!-- Super Admin invisible para soporte -->
        <div style="text-align:center;margin-top:6px">
          <span id="btn-superadmin-wrap" style="display:none">
            <button class="btn-quick" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:4px 14px;font-size:11px;border-radius:4px;cursor:pointer"
                    onclick="quickLogin('superadmin')">⚡ Super Admin</button>
          </span>
          <button style="opacity:0;font-size:8px;background:none;border:none;cursor:pointer;padding:2px"
                  onclick="Pages._activarModoSoporte()">·</button>
        </div>
      </div>`,

    /* ── NUEVO TALLER ───────────────────────────────── */
    'nuevo-taller': `
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:40px;margin-bottom:8px">🏪</div>
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--amber);letter-spacing:.04em">Crear Nuevo Taller</h2>
        <p style="font-size:12px;color:var(--text3)">Configura tu taller en TallerPro en 1 minuto</p>
      </div>
      <div class="login-form">
        <div class="form-group">
          <label class="form-label">Nombre del Taller *</label>
          <input class="form-input" id="nt-nombre" placeholder="Taller Mecánico García">
        </div>
        <div class="form-group">
          <label class="form-label">NIT del Taller (opcional)</label>
          <input class="form-input" id="nt-nit" placeholder="1234567-8">
        </div>
        <div style="border-top:1px solid var(--border);margin:12px 0;padding-top:12px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:10px;font-weight:600">DATOS DEL ADMINISTRADOR</div>
        </div>
        <div class="form-group">
          <label class="form-label">Tu Nombre *</label>
          <input class="form-input" id="nt-user" placeholder="Juan García">
        </div>
        <div class="form-group">
          <label class="form-label">Correo Electrónico *</label>
          <input class="form-input" id="nt-email" type="email" placeholder="admin@mitaller.gt">
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña * (mínimo 8 caracteres)</label>
          <div style="position:relative">
            <input class="form-input" id="nt-pass" type="password" placeholder="••••••••" style="padding-right:40px">
            <button onclick="UI._togglePass('nt-pass',this)"
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px">👁</button>
          </div>
        </div>
        <button class="btn btn-amber" style="width:100%" onclick="AUTH_UI.crearNuevoTaller()">
          🏪 Crear Taller y Comenzar →
        </button>
        <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px" onclick="renderLoginView('login')">
          ← Volver al login
        </button>
      </div>`,

    /* ── RECOVERY SELECT ────────────────────────────── */
    'recovery-select': `
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:40px;margin-bottom:8px">🔑</div>
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--amber);letter-spacing:.04em">Recuperar Contraseña</h2>
      </div>
      <div class="login-form">
        <div class="form-group">
          <label class="form-label">Tu correo electrónico</label>
          <input class="form-input" id="rec-email" type="email" placeholder="usuario@mitaller.gt">
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
          <button class="btn btn-amber" onclick="AUTH_UI.iniciarRecovery('email')" style="width:100%">
            📧 Recibir enlace por Email
          </button>
          <button class="btn btn-ghost" onclick="AUTH_UI.iniciarRecovery('interno')" style="width:100%">
            🔐 Código de verificación (email)
          </button>
        </div>
        <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px" onclick="renderLoginView('login')">
          ← Volver al login
        </button>
      </div>`,

    /* ── INGRESAR CÓDIGO ────────────────────────────── */
    'recovery-code': `
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:40px;margin-bottom:8px">🔐</div>
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--amber)">Código de Verificación</h2>
        <p style="font-size:12px;color:var(--text3)" id="recovery-metodo-desc">Revisa tu correo electrónico</p>
      </div>
      <div class="login-form">
        <div class="form-group">
          <input class="form-input" id="rec-codigo" type="text" placeholder="000000" maxlength="6"
                 style="font-size:32px;text-align:center;letter-spacing:10px;font-family:'DM Mono',monospace"
                 onkeydown="if(event.key==='Enter')AUTH_UI.verificarCodigo()">
        </div>
        <button class="btn btn-amber" style="width:100%" onclick="AUTH_UI.verificarCodigo()">
          Verificar →
        </button>
        <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px" onclick="renderLoginView('recovery-select')">
          ← Cambiar método
        </button>
      </div>`,

    /* ── NUEVA CONTRASEÑA ───────────────────────────── */
    'recovery-new-pass': `
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:40px;margin-bottom:8px">✅</div>
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--amber)">Nueva Contraseña</h2>
      </div>
      <div class="login-form">
        <div class="form-group">
          <label class="form-label">Nueva Contraseña</label>
          <div style="position:relative">
            <input class="form-input" id="new-pass" type="password" placeholder="Mínimo 8 caracteres"
                   style="padding-right:40px" oninput="AUTH_UI.checkPassStrength()">
            <button onclick="UI._togglePass('new-pass',this)"
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px">👁</button>
          </div>
        </div>
        <div id="pass-strength" style="height:4px;border-radius:2px;background:var(--border);margin:-4px 0 8px;overflow:hidden">
          <div id="pass-strength-bar" style="height:100%;width:0%;transition:width .3s,background .3s"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar Contraseña</label>
          <input class="form-input" id="new-pass2" type="password" placeholder="Repetir contraseña">
        </div>
        <button class="btn btn-amber" style="width:100%" onclick="AUTH_UI.cambiarPassword()">
          Guardar Nueva Contraseña →
        </button>
      </div>`
  };

  const box = screen.querySelector('.login-box');
  if (box) box.innerHTML = views[_loginView] || views.login;
}

function renderLoginView(view) {
  _loginView = view;
  renderLoginScreen();
}

/* ══════════════════════════════════════════════════════
   AUTH_UI — Controlador de acciones
══════════════════════════════════════════════════════ */
const AUTH_UI = {

  /* Buscar taller por nombre o NIT */
  async buscarTaller() {
    const q = document.getElementById('l-taller')?.value.trim();
    if (!q) return;

    /* Buscar en tabla tenants por nombre o NIT */
    const { data } = await getSupabase()
      .from('tenants')
      .select('id,slug,name,nit,logo_base64')
      .or(`name.ilike.%${q}%,nit.ilike.%${q}%`)
      .limit(5);

    if (data && data.length > 0) {
      if (data.length === 1) {
        _loginTenant = data[0];
        UI.toast('Taller encontrado: ' + data[0].name, 'info');
        renderLoginScreen();
      } else {
        /* Múltiples talleres — mostrar selector */
        UI.openModal('Seleccionar Taller', `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${data.map(t => `
              <button onclick="AUTH_UI.seleccionarTaller(${JSON.stringify(t).replace(/"/g,'&quot;')})"
                style="display:flex;align-items:center;gap:12px;padding:12px 16px;
                       background:var(--surface2);border:1px solid var(--border);border-radius:8px;
                       cursor:pointer;text-align:left;width:100%">
                ${t.logo_base64 ? `<img src="${t.logo_base64}" style="width:36px;height:36px;object-fit:contain;border-radius:4px">` : '<span style="font-size:28px">🔧</span>'}
                <div>
                  <div style="font-weight:700;font-size:14px;color:var(--text)">${t.name}</div>
                  ${t.nit ? `<div style="font-size:11px;color:var(--text3)">NIT: ${t.nit}</div>` : ''}
                </div>
              </button>`).join('')}
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
          </div>`
        );
      }
    } else {
      /* No encontrado */
      UI.openModal('Taller no encontrado', `
        <div style="text-align:center;padding:20px">
          <div style="font-size:40px;margin-bottom:12px">🔍</div>
          <div style="font-weight:700;margin-bottom:8px">No encontramos "<b>${q}</b>"</div>
          <div class="text-muted" style="font-size:13px;margin-bottom:20px">
            Verifica el nombre o NIT, o crea un taller nuevo.
          </div>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-ghost" onclick="UI.closeModal()">Reintentar</button>
            <button class="btn btn-amber" onclick="UI.closeModal();renderLoginView('nuevo-taller')">🏪 Crear Taller</button>
          </div>
        </div>`
      );
    }
  },

  seleccionarTaller(tenant) {
    _loginTenant = tenant;
    UI.closeModal();
    renderLoginScreen();
    UI.toast('Taller seleccionado: ' + tenant.name, 'info');
  },

  async loginDemo() {
    UI.toast('Cargando demo...', 'info');
    /* Login con demo@demo.com / demo123 */
    const r = await Auth.loginWithSupabase('demo@demo.com', 'demo123');
    if (r.ok) {
      startApp();
    } else {
      /* Si no existe en Supabase, hacer quickLogin como admin */
      await Auth.quickLogin('admin');
      startApp();
    }
  },

  async crearNuevoTaller() {
    const nombre = document.getElementById('nt-nombre')?.value.trim();
    const nit    = document.getElementById('nt-nit')?.value.trim();
    const user   = document.getElementById('nt-user')?.value.trim();
    const email  = document.getElementById('nt-email')?.value.trim();
    const pass   = document.getElementById('nt-pass')?.value;

    if (!nombre) { UI.toast('El nombre del taller es obligatorio','error'); return; }
    if (!user)   { UI.toast('Tu nombre es obligatorio','error'); return; }
    if (!email)  { UI.toast('El correo es obligatorio','error'); return; }
    if (!pass || pass.length < 8) { UI.toast('La contraseña debe tener al menos 8 caracteres','error'); return; }

    // Bloquear si intenta crear con email de henry
    if (email.toLowerCase() === 'henry.chinchilla@gmail.com') {
      UI.toast('Este correo está reservado para soporte técnico','error'); return;
    }

    UI.toast('Creando taller...', 'info');
    const r = await Auth.registrarNuevoTaller({
      nombre_taller:  nombre,
      nit_taller:     nit,
      nombre_usuario: user,
      email,
      password: pass
    });

    if (!r.ok) { UI.toast('Error: ' + r.error, 'error'); return; }
    UI.toast('¡Taller creado! Tienes 30 días de demostración 🎉');
    setTimeout(() => startApp(), 800);
  },

  async iniciarRecovery(metodo) {
    const email = document.getElementById('rec-email')?.value.trim();
    if (!email) { UI.toast('Ingresa tu correo electrónico','error'); return; }

    UI.toast('Enviando...','info');

    if (metodo === 'email') {
      const r = await AUTH_RECOVERY.porEmail(email);
      if (!r.ok) { UI.toast('Error: '+r.error,'error'); return; }
      UI.openModal('📧 Revisa tu correo', `
        <div style="text-align:center;padding:20px">
          <div style="font-size:48px;margin-bottom:12px">📧</div>
          <div style="font-weight:700;font-size:16px;margin-bottom:8px">Email enviado</div>
          <div class="text-muted" style="font-size:13px;margin-bottom:16px">
            Enviamos un enlace a <b>${email}</b>.<br>Haz click en el enlace para crear tu nueva contraseña.
          </div>
          <button class="btn btn-amber" onclick="UI.closeModal();renderLoginView('login')">Entendido</button>
        </div>`
      );
    } else {
      const r = await AUTH_RECOVERY.porCodigoInterno(email);
      if (!r.ok) { UI.toast('Error: '+r.error,'error'); return; }
      renderLoginView('recovery-code');
    }
  },

  verificarCodigo() {
    const code = document.getElementById('rec-codigo')?.value.trim();
    if (!code || code.length !== 6) { UI.toast('Ingresa el código de 6 dígitos','error'); return; }
    const r = AUTH_RECOVERY.verificar(code);
    if (!r.ok) { UI.toast(r.error,'error'); return; }
    UI.toast('Código correcto ✓');
    renderLoginView('recovery-new-pass');
  },

  async cambiarPassword() {
    const p1 = document.getElementById('new-pass')?.value;
    const p2 = document.getElementById('new-pass2')?.value;
    if (!p1 || p1.length < 8) { UI.toast('Mínimo 8 caracteres','error'); return; }
    if (p1 !== p2) { UI.toast('Las contraseñas no coinciden','error'); return; }
    const r = await AUTH_RECOVERY.cambiarPassword(p1);
    if (!r.ok) { UI.toast('Error: '+r.error,'error'); return; }
    UI.toast('Contraseña actualizada ✓');
    setTimeout(() => renderLoginView('login'), 1200);
  },

  /* ── PANTALLA LICENCIA EXPIRADA ──────────────────── */
  mostrarPantallaLicencia(licencia) {
    const loginBox = document.querySelector('.login-box');
    if (!loginBox) return;

    const dias = Math.abs(Math.ceil(
      (new Date(licencia?.fecha_vencimiento||Date.now()) - Date.now()) / 86400000
    ));

    loginBox.innerHTML = `
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:48px;margin-bottom:8px">🔒</div>
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:26px;color:var(--red);letter-spacing:.04em">Período Demo Vencido</h2>
        <p style="font-size:13px;color:var(--text2)">Tu período de demostración de 30 días ha concluido</p>
      </div>
      <div class="alert alert-red" style="margin-bottom:16px">
        <div class="alert-icon">⚠️</div>
        <div>
          <div class="alert-title">Acceso restringido</div>
          <div class="alert-body" style="font-size:12px">Para continuar usando TallerPro necesitas activar tu licencia de uso. Todos tus datos están seguros y disponibles.</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Código de Licencia</label>
        <input class="form-input" id="lic-codigo" placeholder="TALLERPRO-XXXX-XXXX-XXXX"
               style="font-family:'DM Mono',monospace;letter-spacing:2px;text-transform:uppercase">
      </div>
      <button class="btn btn-amber" style="width:100%" onclick="AUTH_UI.activarLicencia()">
        🔑 Activar Licencia
      </button>
      <div style="text-align:center;margin-top:12px">
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">¿No tienes código? Contáctanos para obtener tu licencia</div>
        <a href="mailto:soporte@tallerpro.gt?subject=Licencia TallerPro — ${Auth.tenant?.name||''}"
           style="font-size:12px;color:var(--cyan)">📧 soporte@tallerpro.gt</a>
        <span style="color:var(--text3);margin:0 8px">·</span>
        <a href="https://tallerpro.gt/licencia" target="_blank"
           style="font-size:12px;color:var(--cyan)">🌐 tallerpro.gt/licencia</a>
      </div>
      <div style="text-align:center;margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
        <button class="btn btn-ghost btn-sm" onclick="renderLoginView('login')">← Volver al login</button>
      </div>`;
  },

  async activarLicencia() {
    const codigo = document.getElementById('lic-codigo')?.value.trim().toUpperCase();
    if (!codigo || codigo.length < 10) { UI.toast('Ingresa un código válido','error'); return; }

    const tenantId = Auth.tenant?.id;
    if (!tenantId) { UI.toast('Error: no se identificó el taller','error'); return; }

    UI.toast('Verificando licencia...','info');
    const r = await DB.activarLicencia(tenantId, codigo, Auth.user?.email||'');
    if (!r.ok) { UI.toast('Código inválido o ya utilizado: ' + r.error,'error'); return; }

    Auth.licencia = { valida: true, tipo: 'completa' };
    UI.toast('¡Licencia activada exitosamente! Bienvenido a TallerPro ✓');
    setTimeout(() => startApp(), 1000);
  },

  checkPassStrength() {
    const pass = document.getElementById('new-pass')?.value || '';
    const bar  = document.getElementById('pass-strength-bar');
    if (!bar) return;
    let score = 0;
    if (pass.length >= 8)  score++;
    if (pass.length >= 12) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    const levels = ['#ef4444','#f97316','#f59e0b','#84cc16','#10b981'];
    bar.style.width      = ((score / 5) * 100) + '%';
    bar.style.background = levels[Math.min(score, 4)];
  }
};

/* ══════════════════════════════════════════════════════
   HANDLERS GLOBALES
══════════════════════════════════════════════════════ */
async function doLogin() {
  const email  = document.getElementById('l-email')?.value.trim();
  const pass   = document.getElementById('l-pass')?.value;
  const taller = document.getElementById('l-taller')?.value.trim();

  if (!email) { UI.toast('Ingresa tu correo electrónico','error'); return; }
  if (!pass)  { UI.toast('Ingresa tu contraseña','error'); return; }

  /* Si no buscó el taller, intentar encontrarlo */
  if (!_loginTenant && taller) {
    const { data } = await getSupabase()
      .from('tenants')
      .select('id,slug,name,nit,logo_base64')
      .or(`name.ilike.%${taller}%,nit.ilike.%${taller}%`)
      .limit(1)
      .single();
    if (data) _loginTenant = data;
  }

  UI.toast('Iniciando sesión...','info');
  const r = await Auth.loginWithSupabase(email, pass, _loginTenant?.slug || null);

  if (r.ok) {
    startApp();
  } else if (r.error === 'licencia_expirada') {
    /* Mostrar pantalla de licencia expirada */
    AUTH_UI.mostrarPantallaLicencia(r.licencia);
  } else {
    UI.toast(r.error || 'Credenciales incorrectas', 'error');
  }
}

async function quickLogin(role) {
  await Auth.quickLogin(role);
  startApp();
}

async function logout() {
  await Auth.logout();
  _loginView  = 'login';
  _loginTenant = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').classList.remove('visible');
  if (typeof App !== 'undefined') App.destroyCharts();
  renderLoginScreen();
}

/* Detectar reset de contraseña via URL (Supabase redirect) */
window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === 'true') {
    AUTH_RECOVERY._code = 'SUPABASE_RESET';
    AUTH_RECOVERY._exp  = Date.now() + 3600000;
  }
});

/* ══════════════════════════════════════════════════════
   GESTIÓN DE USUARIOS — Invitación y CRUD
══════════════════════════════════════════════════════ */
const USER_MGMT = {

  async getAll() {
    try {
      const tid = await getTenantId();
      if (!tid) {
        return Object.values(DEMO_USERS)
          .filter(u => u.rol !== 'superadmin') // Ocultar superadmin
          .map(u => ({ id:u.id, nombre:u.nombre, email:u.email, rol:u.rol, activo:true, avatar:'👤', telefono:null, ultimo_login:null }));
      }
      const { data } = await getSupabase()
        .from('usuarios')
        .select('*')
        .eq('tenant_id', tid)
        .neq('email', 'henry.chinchilla@gmail.com') // Henry SIEMPRE oculto
        .neq('rol', 'superadmin')                    // Ningún superadmin visible
        .order('nombre');
      return data || [];
    } catch(e) {
      console.warn('USER_MGMT.getAll error:', e);
      return [];
    }
  },

  async invitar(fields) {
    const { email, nombre, rol, telefono, avatar } = fields;
    const tid = await getTenantId();
    const userId = crypto.randomUUID();

    const { error } = await getSupabase().from('usuarios').upsert({
      id: userId, tenant_id: tid, nombre, email, rol,
      telefono: telefono||null, avatar: avatar||'👤', activo: true
    });

    if (error) return { ok: false, error: error.message };

    await NOTIF.sendEmail(email,
      `🎉 Invitación a TallerPro — ${Auth.tenant?.name}`,
      `<h2>¡Fuiste invitado a TallerPro!</h2>
       <p>Hola <b>${nombre}</b>,</p>
       <p>Tienes acceso como <b>${ROLES[rol]?.label||rol}</b> en <b>${Auth.tenant?.name}</b>.</p>
       <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0">
         <div><b>URL:</b> ${window.location.origin}</div>
         <div><b>Taller:</b> ${Auth.tenant?.name}</div>
         <div><b>Email:</b> ${email}</div>
       </div>
       <p>Usa "¿Olvidé mi contraseña?" para crear tu acceso.</p>`
    );

    return { ok: true };
  },

  async actualizar(userId, fields) {
    const { error } = await getSupabase().from('usuarios')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', userId);
    return !error;
  },

  async desactivar(userId) {
    return await USER_MGMT.actualizar(userId, { activo: false });
  }
};

/* ══════════════════════════════════════════════════════
   MODAL GESTIÓN USUARIOS
══════════════════════════════════════════════════════ */
Pages.modalGestionUsuarios = async function () {
  const usuarios = await USER_MGMT.getAll();
  const ROLES_DISP = Object.entries(ROLES).filter(([k,v]) => !v.hidden || Auth.user?.rol==='superadmin');

  const filas = usuarios.map(u => {
    const rc = ROLES[u.rol]?.color||'gray';
    return `<tr data-text="${u.nombre} ${u.email} ${u.rol}" data-rol="${u.rol}" data-activo="${u.activo}">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">${u.avatar||'👤'}</span>
          <div>
            <div style="font-weight:600;font-size:13px">${u.nombre}</div>
            <div class="mono-sm text-muted">${u.email}</div>
          </div>
        </div>
      </td>
      <td>${u.telefono||'—'}</td>
      <td><span class="badge badge-${rc}">${ROLES[u.rol]?.icon||''} ${ROLES[u.rol]?.label||u.rol}</span></td>
      <td class="mono-sm text-muted">${u.ultimo_login?new Date(u.ultimo_login).toLocaleDateString('es-GT'):'—'}</td>
      <td>${u.activo?'<span class="badge badge-green">Activo</span>':'<span class="badge badge-red">Inactivo</span>'}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-cyan" onclick="Pages.modalEditarUsuario('${u.id}')">✏️</button>
          ${u.id!==Auth.user?.id
            ?`<button class="btn btn-sm btn-danger" onclick="Pages.desactivarUsuario('${u.id}','${u.nombre.replace(/'/g,'')}')">🗑</button>`
            :'<span class="text-muted" style="font-size:10px;padding:0 6px">tú</span>'}
        </div>
      </td>
    </tr>`;
  }).join('');

  UI.openModal('👥 Gestión de Usuarios del Sistema', `
    <div class="search-bar" style="margin-bottom:12px">
      <input class="search-input" placeholder="🔍 Buscar..." id="search-usr" oninput="Pages.filterUsuarios()">
      <select class="filter-select" id="filter-usr-rol" onchange="Pages.filterUsuarios()">
        <option value="">Todos los roles</option>
        ${ROLES_DISP.map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-usr-activo" onchange="Pages.filterUsuarios()">
        <option value="">Todos</option>
        <option value="true">Activos</option>
        <option value="false">Inactivos</option>
      </select>
    </div>
    <div class="table-wrap" style="max-height:340px;overflow-y:auto;margin-bottom:12px">
      <table class="data-table">
        <thead><tr><th>Usuario</th><th>Teléfono</th><th>Rol</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead>
        <tbody id="usr-tbody">${filas||'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">Sin usuarios</td></tr>'}</tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      <button class="btn btn-ghost" onclick="Pages.imprimirUsuarios()">🖨️ Imprimir</button>
      <button class="btn btn-amber" onclick="Pages.modalInvitarUsuario()">＋ Invitar Usuario</button>
    </div>
  `, 'modal-lg');
};

Pages.filterUsuarios = function () {
  const q=document.getElementById('search-usr')?.value.toLowerCase()||'';
  const r=document.getElementById('filter-usr-rol')?.value||'';
  const a=document.getElementById('filter-usr-activo')?.value||'';
  document.querySelectorAll('#usr-tbody tr').forEach(row=>{
    const match=(!q||(row.dataset.text||'').toLowerCase().includes(q))&&
                (!r||row.dataset.rol===r)&&(!a||row.dataset.activo===a);
    row.style.display=match?'':'none';
  });
};

Pages.modalInvitarUsuario = function () {
  const ROLES_DISP = Object.entries(ROLES).filter(([k,v])=>!v.hidden||Auth.user?.rol==='superadmin');
  UI.openModal('＋ Invitar Nuevo Usuario', `
    <div class="alert alert-cyan mb-4">
      <div class="alert-icon">💡</div>
      <div class="alert-body" style="font-size:12px">El usuario recibirá un email con instrucciones para crear su contraseña.</div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Nombre Completo *</label>
        <input class="form-input" id="inv-nombre" placeholder="Juan García Pérez"></div>
      <div class="form-group"><label class="form-label">Rol en el Sistema *</label>
        <select class="form-select" id="inv-rol">
          ${ROLES_DISP.map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Correo Electrónico *</label>
        <input class="form-input" id="inv-email" type="email" placeholder="usuario@empresa.gt"></div>
      <div class="form-group"><label class="form-label">Teléfono</label>
        <input class="form-input" id="inv-tel" placeholder="5540-1234"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Avatar (emoji)</label>
        <input class="form-input" id="inv-avatar" value="👤" maxlength="2"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.invitarUsuario()">Enviar Invitación</button>
    </div>`
  );
};

Pages.invitarUsuario = async function () {
  const nombre = document.getElementById('inv-nombre')?.value.trim();
  const email  = document.getElementById('inv-email')?.value.trim();
  const rol    = document.getElementById('inv-rol')?.value;
  const tel    = document.getElementById('inv-tel')?.value.trim();
  const avatar = document.getElementById('inv-avatar')?.value.trim();
  if (!nombre||!email||!rol) { UI.toast('Nombre, email y rol son obligatorios','error'); return; }
  UI.toast('Creando usuario...','info');
  const r = await USER_MGMT.invitar({nombre,email,rol,telefono:tel,avatar});
  if (!r.ok) { UI.toast('Error: '+r.error,'error'); return; }
  UI.closeModal();
  UI.toast(`${nombre} invitado ✓`);
  Pages.modalGestionUsuarios();
};

Pages.modalEditarUsuario = async function (userId) {
  const usuarios = await USER_MGMT.getAll();
  const u = usuarios.find(x=>x.id===userId); if (!u) return;
  const ROLES_DISP = Object.entries(ROLES).filter(([k,v])=>!v.hidden||Auth.user?.rol==='superadmin');
  UI.openModal('✏️ Editar: '+u.nombre, `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Nombre *</label>
        <input class="form-input" id="eu-nombre" value="${u.nombre}"></div>
      <div class="form-group"><label class="form-label">Rol</label>
        <select class="form-select" id="eu-rol">
          ${ROLES_DISP.map(([k,v])=>`<option value="${k}" ${u.rol===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Teléfono</label>
        <input class="form-input" id="eu-tel" value="${u.telefono||''}"></div>
      <div class="form-group"><label class="form-label">Avatar</label>
        <input class="form-input" id="eu-avatar" value="${u.avatar||'👤'}" maxlength="2"></div>
    </div>
    <div class="form-group"><label class="form-label">
      <input type="checkbox" id="eu-activo" ${u.activo?'checked':''} style="margin-right:8px"> Usuario activo
    </label></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.actualizarUsuario('${userId}')">Guardar</button>
    </div>`
  );
};

Pages.actualizarUsuario = async function (userId) {
  const ok = await USER_MGMT.actualizar(userId, {
    nombre:   document.getElementById('eu-nombre')?.value.trim(),
    rol:      document.getElementById('eu-rol')?.value,
    telefono: document.getElementById('eu-tel')?.value.trim()||null,
    avatar:   document.getElementById('eu-avatar')?.value.trim()||'👤',
    activo:   document.getElementById('eu-activo')?.checked
  });
  if (!ok) { UI.toast('Error al actualizar','error'); return; }
  UI.closeModal(); UI.toast('Usuario actualizado ✓');
  Pages.modalGestionUsuarios();
};

Pages.desactivarUsuario = function (userId, nombre) {
  UI.confirm(`¿Desactivar a <b>${nombre}</b>?`, async () => {
    await USER_MGMT.desactivar(userId);
    UI.closeModal(); UI.toast('Usuario desactivado');
    Pages.modalGestionUsuarios();
  });
};

Pages.imprimirUsuarios = async function () {
  const usuarios = await USER_MGMT.getAll();
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Usuarios</title>
  <style>body{font-family:Arial;font-size:11px;margin:20px}table{width:100%;border-collapse:collapse}
  th{background:#f3f4f6;padding:6px;border:1px solid #ddd}td{padding:6px;border:1px solid #ddd}
  .h{border-bottom:2px solid #000;margin-bottom:12px;padding-bottom:6px;display:flex;justify-content:space-between}
  @media print{body{margin:0}}</style></head><body>
  <div class="h"><b>${Auth.tenant?.name} — Usuarios del Sistema</b><span>${new Date().toLocaleDateString('es-GT')}</span></div>
  <table><thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Rol</th><th>Último Acceso</th><th>Estado</th></tr></thead>
  <tbody>${usuarios.map(u=>`<tr>
    <td>${u.nombre}</td><td>${u.email}</td><td>${u.telefono||'—'}</td>
    <td>${ROLES[u.rol]?.label||u.rol}</td>
    <td>${u.ultimo_login?new Date(u.ultimo_login).toLocaleDateString('es-GT'):'—'}</td>
    <td>${u.activo?'Activo':'Inactivo'}</td>
  </tr>`).join('')}</tbody></table></body></html>`;
  const win=window.open('','_blank');win.document.write(html);win.document.close();setTimeout(()=>win.print(),400);
};
