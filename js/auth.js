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
    const isHenry = (email||'').toLowerCase() === 'henry.chinchilla@gmail.com';
    const isDemo  = (email||'').toLowerCase() === 'demo@demo.com';

    /* Si hay tenantSlug específico, cargar ese tenant. Si no, buscar por email */
    let tenant = null;
    if (tenantSlug) {
      tenant = await DB.getTenant(tenantSlug);
    }
    if (!tenant && !isHenry) {
      /* Buscar el tenant asociado al usuario en la BD */
      const { data: uData } = await getSupabase()
        .from('usuarios')
        .select('tenant_id, tenants(id,slug,name,nit,logo_base64)')
        .eq('id', userId)
        .maybeSingle();
      if (uData?.tenants) tenant = uData.tenants;
    }
    if (!tenant) {
      tenant = await DB.getTenant('automotriz-torres');
    }

    Auth.tenant = tenant;
    Auth.user = {
      id:        userId,
      nombre:    isHenry ? 'Henry Chinchilla' : isDemo ? 'Demo Admin' : (email||'').split('@')[0],
      email:     email || '',
      rol:       isHenry ? 'superadmin' : 'admin',
      activo:    true,
      avatar:    isHenry ? '⚡' : '👑',
      tenant_id: tenant?.id
    };

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

    /* 1. Crear taller PRIMERO para obtener el tenant_id */
    const tallerResult = await DB.crearTaller(fields.nombre_taller, fields.nit_taller, fields.email);
    if (!tallerResult.ok) return { ok: false, error: 'Error creando taller: ' + tallerResult.error };

    const tenantId = tallerResult.tenantId;

    /* 2. Crear usuario en Supabase Auth */
    const { data: authData, error: authErr } = await sb.auth.signUp({
      email:    fields.email,
      password: fields.password,
      options:  {
        emailRedirectTo: window.location.origin,
        data: {
          nombre:    fields.nombre_usuario,
          rol:       'admin',
          tenant_id: tenantId
        }
      }
    });

    if (authErr) {
      /* Rate limit: crear perfil en BD sin confirmación y hacer login directo */
      if (authErr.message.includes('rate limit') || authErr.message.includes('email')) {
        console.warn('Email rate limit — creando perfil sin confirmación Supabase Auth');
        /* Intentar login directo (si el usuario ya existe en Auth) */
        const { data: loginData } = await sb.auth.signInWithPassword({
          email: fields.email, password: fields.password
        });
        if (loginData?.user) {
          authData = loginData;
        } else {
          /* Crear perfil sin cuenta Auth — usuario puede establecer contraseña después */
          const fakeId = crypto.randomUUID();
          await sb.from('usuarios').insert({
            id: fakeId, tenant_id: tenantId,
            nombre: fields.nombre_usuario, email: fields.email,
            rol: 'admin', activo: true, avatar: '👑'
          });
          Auth.tenant   = await DB.getTenant(null, tenantId);
          Auth.user     = { id: fakeId, nombre: fields.nombre_usuario, email: fields.email, rol: 'admin', activo: true, avatar: '👑', tenant_id: tenantId };
          Auth.licencia = { valida: true, tipo: 'demo', dias_restantes: 30 };
          return { ok: true, sinAuth: true };
        }
      } else {
        return { ok: false, error: authErr.message };
      }
    }

    /* Manejar usuario no confirmado — en Supabase, signUp con "Confirm email OFF"
       devuelve session directamente. Con "Confirm email ON" session es null. */
    let finalUser = authData?.user || authData?.session?.user;
    if (!finalUser) {
      /* Email de confirmación pendiente — igual crear perfil y notificar */
      return { ok: false, error: 'confirm_email', email: fields.email };
    }
    const authDataFixed = { user: finalUser };
    /* Reemplazar authData por authDataFixed en el resto del flujo */
    Object.assign(authData || {}, { user: finalUser });

    /* 3. Crear perfil admin vinculado a ESTE taller */
    await sb.from('usuarios').upsert({
      id:        authData.user.id,
      tenant_id: tenantId,           // ← CLAVE: vinculado al taller nuevo
      nombre:    fields.nombre_usuario,
      email:     fields.email,
      rol:       'admin',
      activo:    true,
      avatar:    '👑'
    });

    /* 4. Cargar tenant completo */
    const tenant = await DB.getTenant(null, tenantId);

    /* 5. Establecer sesión correctamente */
    Auth.supaUser = authData.user;
    Auth.tenant   = tenant;          // ← Taller nuevo, NO automotriz-torres
    Auth.user     = {
      id:        authData.user.id,
      nombre:    fields.nombre_usuario,
      email:     fields.email,
      rol:       'admin',
      activo:    true,
      avatar:    '👑',
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
    /* Demo: usa el primer taller disponible o crea estructura demo en memoria */
    try {
      Auth.tenant = await DB.getTenant('automotriz-torres');
    } catch(e) { Auth.tenant = null; }

    if (!Auth.tenant) {
      /* Sin taller configurado — crear tenant virtual para demo */
      Auth.tenant = {
        id:   'demo-tenant-id',
        slug: 'demo',
        name: 'Taller Demo',
        nit:  'CF'
      };
    }

    Auth.user     = { ...DEMO_USERS[role], activo: true, tenant_id: Auth.tenant.id };
    Auth.licencia = { valida: true, tipo: 'demo', dias_restantes: 30 };
  },

  /* ── LOGOUT ───────────────────────────────────────── */
  async logout() {
    if (Auth.supaUser) await getSupabase().auth.signOut();
    Auth.user     = null;
    Auth.tenant   = null;
    Auth.supaUser = null;
    Auth.licencia = null;
    if (typeof resetTenantCache === 'function') resetTenantCache();
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
          <button class="btn btn-ghost" onclick="AUTH_UI.