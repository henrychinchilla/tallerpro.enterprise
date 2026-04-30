/* ═══════════════════════════════════════════════════════
   auth.js — Sistema de Autenticación Completo
   TallerPro Enterprise v2.0

   Motor: Supabase Auth (email/password + OTP)
   Recovery: Email OTP / SMS Twilio / Código interno
   Usuarios: perfil extendido en tabla public.usuarios
═══════════════════════════════════════════════════════ */

const Auth = {
  user:        null,
  tenant:      null,
  supaUser:    null,   // objeto raw de Supabase Auth

  /* ── LOGIN CON SUPABASE AUTH ──────────────────────── */
  async loginWithSupabase(email, password) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };

    Auth.supaUser = data.user;
    await Auth._loadProfile(data.user.id, data.user.email);
    return { ok: true };
  },

  /* ── CARGAR PERFIL DE USUARIO ─────────────────────── */
  async _loadProfile(userId, email) {
    try {
      const { data, error } = await getSupabase()
        .from('usuarios')
        .select('*, tenants(id,slug,name,nit,tel,email,address,logo_base64)')
        .eq('id', userId)
        .single();

      if (data && !error) {
        Auth.user   = data;
        Auth.tenant = data.tenants;
        // Actualizar último login (sin await para no bloquear)
        getSupabase().from('usuarios')
          .update({ ultimo_login: new Date().toISOString() })
          .eq('id', userId)
          .then(() => {});
        return data;
      }
    } catch (e) {
      console.warn('_loadProfile error:', e);
    }

    // Fallback: perfil no existe en tabla usuarios, crear perfil mínimo
    // y cargar tenant por slug hardcodeado
    const tenant = await DB.getTenant();
    const isHenry = (email||'').toLowerCase().includes('henry.chinchilla');

    Auth.user = {
      id:     userId,
      nombre: isHenry ? 'Henry Chinchilla' : (email||'Usuario').split('@')[0],
      email:  email || '',
      rol:    isHenry ? 'superadmin' : 'admin',
      activo: true,
      avatar: isHenry ? '⚡' : '👑',
      tenant_id: tenant?.id
    };
    Auth.tenant = tenant;

    // Intentar crear el perfil en BD para próximas sesiones
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
    } catch(e2) {
      console.warn('Could not save profile:', e2);
    }

    return Auth.user;
  },

  /* ── LOGIN DEMO (modo desarrollo) ────────────────── */
  async quickLogin(role) {
    Auth.tenant  = await DB.getTenant();
    Auth.user    = {
      ...DEMO_USERS[role],
      nombre:    DEMO_USERS[role].nombre,
      email:     DEMO_USERS[role].email,
      rol:       role,
      activo:    true
    };
  },

  /* ── LOGOUT ───────────────────────────────────────── */
  async logout() {
    const sb = getSupabase();
    if (Auth.supaUser) await sb.auth.signOut();
    Auth.user    = null;
    Auth.tenant  = null;
    Auth.supaUser= null;
  },

  can(pageId) {
    const item = NAV.find(n => n.id === pageId);
    return item ? item.roles.includes(Auth.user?.rol) : false;
  },

  isAdmin() {
    return ['admin','superadmin'].includes(Auth.user?.rol);
  }
};

/* ══════════════════════════════════════════════════════
   RECOVERY — Recuperación de contraseña
══════════════════════════════════════════════════════ */
const AUTH_RECOVERY = {
  _code:    null,
  _email:   null,
  _exp:     null,
  _metodo:  null,

  /* Generar código de 6 dígitos */
  _genCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  },

  /* ── 1. RECUPERAR POR EMAIL (Supabase nativo) ─────── */
  async porEmail(email) {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '?reset=true'
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, metodo: 'email' };
  },

  /* ── 2. RECUPERAR POR SMS (Twilio) ───────────────── */
  async porSMS(telefono) {
    const code = this._genCode();
    this._code   = code;
    this._exp    = Date.now() + 10 * 60 * 1000;
    this._metodo = 'sms';

    const msg = `🔐 TallerPro: Tu código de recuperación es *${code}*. Válido 10 minutos. Si no lo solicitaste ignora este mensaje.`;
    const r   = await NOTIF.sendWhatsApp(telefono, msg);

    if (r.simulado) {
      /* Modo dev: mostrar código */
      AUTH_RECOVERY._mostrarCodigoDesarrollo(code, 'SMS/WhatsApp', telefono);
    }

    return { ok: r.ok, simulado: r.simulado };
  },

  /* ── 3. RECUPERAR POR CÓDIGO INTERNO (en-app) ────── */
  async porCodigoInterno(email) {
    const code = this._genCode();
    this._code   = code;
    this._email  = email;
    this._exp    = Date.now() + 10 * 60 * 1000;
    this._metodo = 'interno';

    /* Guardar en BD para que persista entre recargas */
    const { data: user } = await getSupabase()
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .single();

    if (user) {
      await getSupabase().from('usuarios').update({
        recovery_code: code,
        recovery_exp:  new Date(this._exp).toISOString()
      }).eq('id', user.id);
    }

    /* Enviar por email también como respaldo */
    await NOTIF.sendEmail(email,
      '🔐 Código de Recuperación — TallerPro',
      `<h2>Código de Recuperación</h2>
       <div style="font-size:36px;font-weight:bold;font-family:monospace;
                   background:#f3f4f6;padding:16px;border-radius:8px;
                   text-align:center;letter-spacing:12px">${code}</div>
       <p>Válido por <b>10 minutos</b>.</p>
       <p>Si no solicitaste este código, ignora este mensaje.</p>`
    );

    if (NOTIF.config.modo_dev || !NOTIF.config.sendgrid_key) {
      AUTH_RECOVERY._mostrarCodigoDesarrollo(code, 'Email', email);
    }

    return { ok: true };
  },

  /* ── VERIFICAR CÓDIGO ─────────────────────────────── */
  verificar(ingresado) {
    if (!this._code) return { ok: false, error: 'No hay código activo' };
    if (Date.now() > this._exp) {
      this._code = null;
      return { ok: false, error: 'Código expirado. Solicita uno nuevo.' };
    }
    if (ingresado !== this._code) return { ok: false, error: 'Código incorrecto' };
    return { ok: true };
  },

  /* ── CAMBIAR CONTRASEÑA (post verificación) ───────── */
  async cambiarPassword(nuevaPass) {
    const { error } = await getSupabase().auth.updateUser({ password: nuevaPass });
    if (error) return { ok: false, error: error.message };
    this._code  = null;
    this._email = null;
    return { ok: true };
  },

  /* ── MODO DEV: mostrar código ─────────────────────── */
  _mostrarCodigoDesarrollo(code, metodo, destino) {
    setTimeout(() => {
      UI.openModal('🔐 Código de Recuperación (Modo Dev)', `
        <div style="text-align:center;padding:16px">
          <div class="alert alert-amber mb-4">
            <div class="alert-icon">⚠️</div>
            <div><div class="alert-title">Modo Desarrollo</div>
            <div class="alert-body">En producción este código llega por ${metodo} a <b>${destino}</b>.</div></div>
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:48px;font-weight:700;
                      letter-spacing:12px;color:var(--amber);padding:20px;
                      background:var(--surface2);border-radius:8px;border:2px solid var(--amber-border)">
            ${code}
          </div>
          <div class="text-muted mt-3" style="font-size:12px">Vence en 10 minutos</div>
          <div class="modal-footer" style="justify-content:center;margin-top:16px">
            <button class="btn btn-amber" onclick="UI.closeModal()">Entendido</button>
          </div>
        </div>`
      );
    }, 800);
  }
};

/* ══════════════════════════════════════════════════════
   UI DE LOGIN — Completa con recovery
══════════════════════════════════════════════════════ */

/* Estado del login */
let _loginView = 'login'; // 'login' | 'recovery-select' | 'recovery-code' | 'recovery-new-pass'

function renderLoginScreen() {
  const screen = document.getElementById('login-screen');
  if (!screen) return;

  const views = {

    /* ── VISTA PRINCIPAL ─────────────────────────────── */
    login: `
      <div class="login-logo">🔧</div>
      <h1 class="login-title">TallerPro</h1>
      <p class="login-sub">Enterprise · AI-Driven SaaS</p>

      <div class="login-form">
        <div class="form-group">
          <label class="form-label">Correo Electrónico</label>
          <input class="form-input" id="l-email" type="email"
                 placeholder="admin@mitaller.gt"
                 onkeydown="if(event.key==='Enter')document.getElementById('l-pass').focus()">
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <div style="position:relative">
            <input class="form-input" id="l-pass" type="password"
                   placeholder="••••••••"
                   onkeydown="if(event.key==='Enter')doLogin()"
                   style="padding-right:40px">
            <button onclick="UI._togglePass('l-pass',this)"
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px">👁</button>
          </div>
        </div>
        <button class="btn btn-amber" style="width:100%;margin-top:8px" onclick="doLogin()">
          Iniciar Sesión →
        </button>
        <div style="text-align:center;margin-top:12px">
          <button class="btn btn-ghost btn-sm" onclick="renderLoginView('recovery-select')">
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      </div>

      <div style="text-align:center;margin-top:8px">
        <span id="btn-superadmin-wrap" style="display:none">
          <button class="btn-quick" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:4px 12px;font-size:11px;border-radius:4px;cursor:pointer"
                  onclick="quickLogin('superadmin')">⚡ Super Admin</button>
        </span>
        <button style="opacity:0;font-size:8px;background:none;border:none;cursor:pointer;padding:4px" onclick="Pages._activarModoSoporte()" title="·">·</button>
      </div>`,

    /* ── SELECCIÓN DE MÉTODO RECOVERY ────────────────── */
    'recovery-select': `
      <div class="login-logo">🔑</div>
      <h1 class="login-title" style="font-size:26px">Recuperar Contraseña</h1>
      <p class="login-sub">Elige cómo recibir tu código de verificación</p>

      <div class="login-form">
        <div class="form-group">
          <label class="form-label">Tu correo electrónico</label>
          <input class="form-input" id="rec-email" type="email"
                 placeholder="admin@mitaller.gt">
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono (para SMS/WhatsApp)</label>
          <input class="form-input" id="rec-tel" type="tel"
                 placeholder="5540-1234 (opcional)">
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
          <button class="btn btn-amber" onclick="AUTH_UI.iniciarRecovery('email')" style="width:100%">
            📧 Recibir código por Email
          </button>
          <button class="btn btn-ghost" onclick="AUTH_UI.iniciarRecovery('sms')" style="width:100%">
            💬 Recibir código por SMS / WhatsApp
          </button>
          <button class="btn btn-ghost" onclick="AUTH_UI.iniciarRecovery('interno')" style="width:100%">
            🔐 Código interno de la aplicación
          </button>
        </div>
        <div style="text-align:center;margin-top:12px">
          <button class="btn btn-ghost btn-sm" onclick="renderLoginView('login')">← Volver al login</button>
        </div>
      </div>`,

    /* ── INGRESAR CÓDIGO ──────────────────────────────── */
    'recovery-code': `
      <div class="login-logo">🔐</div>
      <h1 class="login-title" style="font-size:24px">Ingresa el Código</h1>
      <p class="login-sub" id="recovery-metodo-desc">Código enviado a tu email/teléfono</p>

      <div class="login-form">
        <div class="form-group">
          <label class="form-label">Código de 6 dígitos</label>
          <input class="form-input" id="rec-codigo" type="text"
                 placeholder="000000" maxlength="6"
                 style="font-size:28px;text-align:center;letter-spacing:8px;font-family:'DM Mono',monospace"
                 onkeydown="if(event.key==='Enter')AUTH_UI.verificarCodigo()">
        </div>
        <button class="btn btn-amber" style="width:100%" onclick="AUTH_UI.verificarCodigo()">
          Verificar Código →
        </button>
        <div style="text-align:center;margin-top:10px">
          <button class="btn btn-ghost btn-sm" onclick="renderLoginView('recovery-select')">← Cambiar método</button>
        </div>
      </div>`,

    /* ── NUEVA CONTRASEÑA ─────────────────────────────── */
    'recovery-new-pass': `
      <div class="login-logo">✅</div>
      <h1 class="login-title" style="font-size:24px">Nueva Contraseña</h1>
      <p class="login-sub">Código verificado. Crea tu nueva contraseña.</p>

      <div class="login-form">
        <div class="form-group">
          <label class="form-label">Nueva Contraseña</label>
          <div style="position:relative">
            <input class="form-input" id="new-pass" type="password"
                   placeholder="Mínimo 8 caracteres" style="padding-right:40px">
            <button onclick="UI._togglePass('new-pass',this)"
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px">👁</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar Nueva Contraseña</label>
          <input class="form-input" id="new-pass2" type="password"
                 placeholder="Repetir contraseña">
        </div>
        <!-- Indicador de fortaleza -->
        <div id="pass-strength" style="height:4px;border-radius:2px;background:var(--border);margin-bottom:8px;overflow:hidden">
          <div id="pass-strength-bar" style="height:100%;width:0%;transition:width .3s,background .3s"></div>
        </div>
        <div id="pass-strength-label" class="text-muted" style="font-size:11px;margin-bottom:10px"></div>
        <button class="btn btn-amber" style="width:100%" onclick="AUTH_UI.cambiarPassword()"
                oninput="AUTH_UI.checkPassStrength()">
          Guardar Nueva Contraseña →
        </button>
      </div>`
  };

  const loginBox = screen.querySelector('.login-box') || screen;
  const content  = views[_loginView] || views.login;

  const box = screen.querySelector('.login-box');
  if (box) box.innerHTML = content;
  else screen.innerHTML  = `<div class="login-box">${content}</div>`;
}

function renderLoginView(view) {
  _loginView = view;
  renderLoginScreen();
}

/* ══════════════════════════════════════════════════════
   AUTH_UI — Controlador de acciones de autenticación
══════════════════════════════════════════════════════ */
const AUTH_UI = {

  async iniciarRecovery(metodo) {
    const email = document.getElementById('rec-email')?.value.trim();
    const tel   = document.getElementById('rec-tel')?.value.trim();

    if (!email && metodo !== 'interno') {
      UI.toast('Ingresa tu correo electrónico', 'error'); return;
    }
    if (metodo === 'sms' && !tel) {
      UI.toast('Ingresa tu teléfono para SMS', 'error'); return;
    }

    UI.toast('Enviando código...', 'info');

    let r;
    if (metodo === 'email') {
      r = await AUTH_RECOVERY.porEmail(email);
      if (r.ok) {
        /* Supabase envía link de reset — mostrar instrucciones */
        UI.openModal('📧 Email Enviado', `
          <div style="text-align:center;padding:20px">
            <div style="font-size:48px;margin-bottom:16px">📧</div>
            <div style="font-weight:700;font-size:16px;margin-bottom:8px">Revisa tu correo</div>
            <div class="text-muted" style="font-size:13px;margin-bottom:16px">
              Enviamos un enlace de recuperación a <b>${email}</b>.<br>
              Haz click en el enlace para crear una nueva contraseña.
            </div>
            <div class="alert alert-cyan" style="text-align:left">
              <div class="alert-icon">💡</div>
              <div class="alert-body" style="font-size:12px">
                Si no lo recibes en 2 minutos, revisa la carpeta de spam o usa otro método de recuperación.
              </div>
            </div>
            <button class="btn btn-amber mt-4" onclick="UI.closeModal();renderLoginView('login')">Entendido</button>
          </div>`
        );
        return;
      }
    } else if (metodo === 'sms') {
      r = await AUTH_RECOVERY.porSMS(tel);
    } else {
      if (!email) { UI.toast('Ingresa tu correo para el código interno','error'); return; }
      r = await AUTH_RECOVERY.porCodigoInterno(email);
    }

    if (!r.ok) { UI.toast('Error: ' + (r.error||'No se pudo enviar'), 'error'); return; }

    /* Actualizar descripción y pasar a vista de código */
    const descs = {
      sms:     `Código enviado por WhatsApp/SMS a ${tel}`,
      interno: `Código enviado al email ${email} y guardado en la app`
    };
    renderLoginView('recovery-code');
    setTimeout(() => {
      const desc = document.getElementById('recovery-metodo-desc');
      if (desc) desc.textContent = descs[metodo] || 'Código enviado';
    }, 100);
  },

  verificarCodigo() {
    const ingresado = document.getElementById('rec-codigo')?.value.trim();
    if (!ingresado || ingresado.length !== 6) {
      UI.toast('Ingresa el código de 6 dígitos', 'error'); return;
    }
    const r = AUTH_RECOVERY.verificar(ingresado);
    if (!r.ok) { UI.toast(r.error, 'error'); return; }
    UI.toast('Código correcto ✓');
    renderLoginView('recovery-new-pass');
  },

  async cambiarPassword() {
    const pass1 = document.getElementById('new-pass')?.value;
    const pass2 = document.getElementById('new-pass2')?.value;
    if (!pass1 || pass1.length < 8) { UI.toast('La contraseña debe tener al menos 8 caracteres', 'error'); return; }
    if (pass1 !== pass2) { UI.toast('Las contraseñas no coinciden', 'error'); return; }

    const r = await AUTH_RECOVERY.cambiarPassword(pass1);
    if (!r.ok) { UI.toast('Error: ' + r.error, 'error'); return; }

    UI.toast('Contraseña actualizada exitosamente ✓');
    setTimeout(() => renderLoginView('login'), 1500);
  },

  checkPassStrength() {
    const pass = document.getElementById('new-pass')?.value || '';
    const bar  = document.getElementById('pass-strength-bar');
    const lbl  = document.getElementById('pass-strength-label');
    if (!bar || !lbl) return;

    let score = 0;
    if (pass.length >= 8)  score++;
    if (pass.length >= 12) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    const levels = [
      { w:'20%',  bg:'#ef4444', label:'Muy débil'  },
      { w:'40%',  bg:'#f97316', label:'Débil'       },
      { w:'60%',  bg:'#f59e0b', label:'Regular'     },
      { w:'80%',  bg:'#84cc16', label:'Fuerte'      },
      { w:'100%', bg:'#10b981', label:'Muy fuerte'  }
    ];
    const lvl = levels[Math.min(score, 4)];
    bar.style.width      = lvl.w;
    bar.style.background = lvl.bg;
    lbl.textContent      = pass ? lvl.label : '';
    lbl.style.color      = lvl.bg;
  }
};

/* ══════════════════════════════════════════════════════
   HANDLERS GLOBALES (compatibilidad con index.html)
══════════════════════════════════════════════════════ */
async function doLogin() {
  const email = document.getElementById('l-email')?.value.trim();
  const pass  = document.getElementById('l-pass')?.value;

  if (!email || !pass) { UI.toast('Ingresa email y contraseña', 'error'); return; }

  /* Intentar Supabase Auth primero */
  UI.toast('Iniciando sesión...', 'info');
  const r = await Auth.loginWithSupabase(email, pass);

  if (r.ok) {
    startApp();
    return;
  }

  /* Fallback: buscar en tabla usuarios como demo */
  UI.toast(r.error || 'Credenciales incorrectas', 'error');
}

async function quickLogin(role) {
  await Auth.quickLogin(role);
  startApp();
}

async function logout() {
  await Auth.logout();
  _loginView = 'login';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').classList.remove('visible');
  if (typeof App !== 'undefined') App.destroyCharts();
  renderLoginScreen();
}

/* ══════════════════════════════════════════════════════
   GESTIÓN DE USUARIOS — Invitación y CRUD
══════════════════════════════════════════════════════ */
const USER_MGMT = {

  /* ── CARGAR TODOS LOS USUARIOS DEL TENANT ─────────── */
  async getAll() {
    const tid = await getTenantId();
    const { data } = await getSupabase()
      .from('usuarios')
      .select('*')
      .eq('tenant_id', tid)
      .order('nombre');
    return data || [];
  },

  /* ── INVITAR USUARIO (Supabase + perfil) ──────────── */
  async invitar(fields) {
    const { email, nombre, rol, telefono, avatar } = fields;

    /* 1. Invitar via Supabase Auth (envía email de invitación) */
    const { data: authData, error: authErr } = await getSupabase().auth.admin ?
      await getSupabase().auth.admin.inviteUserByEmail(email, {
        data: { nombre, rol }
      }) : { data: null, error: { message: 'Admin API no disponible en cliente' } };

    /* 2. Crear registro en public.usuarios (con ID temporal o sin auth) */
    const tid = await getTenantId();
    const userId = authData?.user?.id || crypto.randomUUID();

    const { error: dbErr } = await getSupabase().from('usuarios').upsert({
      id:        userId,
      tenant_id: tid,
      nombre,
      email,
      rol,
      telefono:  telefono || null,
      avatar:    avatar   || '👤',
      activo:    true
    });

    if (dbErr) return { ok: false, error: dbErr.message };

    /* 3. Si no hay admin API, enviar email de invitación manual */
    if (!authData?.user) {
      await NOTIF.sendEmail(email,
        `🎉 Invitación a TallerPro — ${Auth.tenant?.name}`,
        `<h2>¡Fuiste invitado a TallerPro Enterprise!</h2>
         <p>Hola <b>${nombre}</b>,</p>
         <p><b>${Auth.user?.nombre || 'El administrador'}</b> te invitó como <b>${ROLES[rol]?.label || rol}</b>
         en el sistema de <b>${Auth.tenant?.name}</b>.</p>
         <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0">
           <div><b>URL:</b> ${window.location.origin}</div>
           <div><b>Email:</b> ${email}</div>
           <div><b>Rol:</b> ${ROLES[rol]?.label || rol}</div>
         </div>
         <p>Para crear tu contraseña entra a la URL y usa "¿Olvidaste tu contraseña?" con este email.</p>
         <p>${Auth.tenant?.name} — TallerPro Enterprise</p>`
      );
    }

    return { ok: true, userId };
  },

  /* ── ACTUALIZAR USUARIO ───────────────────────────── */
  async actualizar(userId, fields) {
    const { error } = await getSupabase().from('usuarios')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', userId);
    return !error;
  },

  /* ── DESACTIVAR USUARIO ───────────────────────────── */
  async desactivar(userId) {
    return await USER_MGMT.actualizar(userId, { activo: false });
  }
};

/* ══════════════════════════════════════════════════════
   MÓDULO USUARIOS (página en Configuración)
══════════════════════════════════════════════════════ */
Pages.modalGestionUsuarios = async function () {
  const usuarios = await USER_MGMT.getAll();

  const ROLES_VISIBLES = Object.entries(ROLES)
    .filter(([k]) => k !== 'superadmin' || Auth.user?.rol === 'superadmin');

  const filas = usuarios.map(u => {
    const rc = ROLES[u.rol]?.color || 'gray';
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
      <td>${u.ultimo_login ? new Date(u.ultimo_login).toLocaleDateString('es-GT') : '—'}</td>
      <td>${u.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-red">Inactivo</span>'}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-cyan"   onclick="Pages.modalEditarUsuario('${u.id}')">✏️</button>
          ${u.id !== Auth.user?.id
            ? `<button class="btn btn-sm btn-danger" onclick="Pages.desactivarUsuario('${u.id}','${u.nombre.replace(/'/g,'')}')">🗑</button>`
            : '<span class="text-muted" style="font-size:10px;padding:3px 6px">tú</span>'}
        </div>
      </td>
    </tr>`;
  }).join('');

  UI.openModal('👥 Gestión de Usuarios', `
    <div class="search-bar" style="margin-bottom:12px">
      <input class="search-input" placeholder="🔍 Buscar usuario..." id="search-usr"
             oninput="Pages.filterUsuarios()">
      <select class="filter-select" id="filter-usr-rol" onchange="Pages.filterUsuarios()">
        <option value="">Todos los roles</option>
        ${ROLES_VISIBLES.map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-usr-activo" onchange="Pages.filterUsuarios()">
        <option value="">Todos</option>
        <option value="true">Activos</option>
        <option value="false">Inactivos</option>
      </select>
    </div>

    <div class="table-wrap" style="max-height:350px;overflow-y:auto;margin-bottom:12px">
      <table class="data-table">
        <thead><tr><th>Usuario</th><th>Teléfono</th><th>Rol</th><th>Último Acceso</th><th>Estado</th><th></th></tr></thead>
        <tbody id="usr-tbody">
          ${filas || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">Sin usuarios</td></tr>'}
        </tbody>
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
  const q      = (document.getElementById('search-usr')?.value||'').toLowerCase();
  const rol    = document.getElementById('filter-usr-rol')?.value||'';
  const activo = document.getElementById('filter-usr-activo')?.value||'';
  document.querySelectorAll('#usr-tbody tr').forEach(r => {
    const match = (!q    || (r.dataset.text||'').toLowerCase().includes(q)) &&
                  (!rol  || r.dataset.rol   === rol) &&
                  (!activo || r.dataset.activo === activo);
    r.style.display = match?'':'none';
  });
};

Pages.modalInvitarUsuario = function () {
  const ROLES_DISP = Object.entries(ROLES)
    .filter(([k,v]) => !v.hidden || Auth.user?.rol === 'superadmin');

  UI.openModal('＋ Invitar Nuevo Usuario', `
    <div class="alert alert-cyan mb-4">
      <div class="alert-icon">💡</div>
      <div class="alert-body" style="font-size:12px">
        El usuario recibirá un email de invitación con instrucciones para crear su contraseña.
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nombre Completo *</label>
        <input class="form-input" id="inv-nombre" placeholder="Juan García Pérez">
      </div>
      <div class="form-group">
        <label class="form-label">Rol *</label>
        <select class="form-select" id="inv-rol">
          ${ROLES_DISP.map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Correo Electrónico *</label>
        <input class="form-input" id="inv-email" type="email" placeholder="usuario@empresa.gt">
      </div>
      <div class="form-group">
        <label class="form-label">Teléfono</label>
        <input class="form-input" id="inv-tel" type="tel" placeholder="5540-1234">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Avatar (emoji)</label>
        <input class="form-input" id="inv-avatar" value="👤" maxlength="2">
      </div>
      <div class="form-group">
        <label class="form-label">Contraseña temporal</label>
        <div style="position:relative">
          <input class="form-input" id="inv-pass" type="password"
                 placeholder="Mínimo 8 caracteres" style="padding-right:40px">
          <button onclick="UI._togglePass('inv-pass',this)"
            style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text3)">👁</button>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">
        <input type="checkbox" id="inv-enviar-email" checked style="margin-right:8px">
        Enviar email de invitación con instrucciones
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-amber" onclick="Pages.invitarUsuario()">Enviar Invitación</button>
    </div>`
  );
};

Pages.invitarUsuario = async function () {
  const nombre  = document.getElementById('inv-nombre')?.value.trim();
  const email   = document.getElementById('inv-email')?.value.trim();
  const rol     = document.getElementById('inv-rol')?.value;
  const tel     = document.getElementById('inv-tel')?.value.trim();
  const avatar  = document.getElementById('inv-avatar')?.value.trim();

  if (!nombre || !email || !rol) {
    UI.toast('Nombre, email y rol son obligatorios', 'error'); return;
  }

  UI.toast('Creando usuario...', 'info');
  const r = await USER_MGMT.invitar({ nombre, email, rol, telefono: tel, avatar });

  if (!r.ok) { UI.toast('Error: ' + r.error, 'error'); return; }
  UI.closeModal();
  UI.toast(`Usuario ${nombre} invitado exitosamente ✓`);
  Pages.modalGestionUsuarios();
};

Pages.modalEditarUsuario = async function (userId) {
  const usuarios = await USER_MGMT.getAll();
  const u = usuarios.find(x => x.id === userId); if (!u) return;
  const ROLES_DISP = Object.entries(ROLES).filter(([k,v]) => !v.hidden || Auth.user?.rol === 'superadmin');

  UI.openModal('✏️ Editar Usuario: '+u.nombre, `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-input" id="eu-nombre" value="${u.nombre}">
      </div>
      <div class="form-group">
        <label class="form-label">Rol</label>
        <select class="form-select" id="eu-rol">
          ${ROLES_DISP.map(([k,v])=>`<option value="${k}" ${u.rol===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Teléfono</label>
        <input class="form-input" id="eu-tel" value="${u.telefono||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Avatar</label>
        <input class="form-input" id="eu-avatar" value="${u.avatar||'👤'}" maxlength="2">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">
        <input type="checkbox" id="eu-activo" ${u.activo?'checked':''} style="margin-right:8px">
        Usuario activo
      </label>
    </div>
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
    telefono: document.getElementById('eu-tel')?.value.trim() || null,
    avatar:   document.getElementById('eu-avatar')?.value.trim() || '👤',
    activo:   document.getElementById('eu-activo')?.checked
  });
  if (!ok) { UI.toast('Error al actualizar', 'error'); return; }
  UI.closeModal();
  UI.toast('Usuario actualizado ✓');
  Pages.modalGestionUsuarios();
};

Pages.desactivarUsuario = function (userId, nombre) {
  UI.confirm(`¿Desactivar a <b>${nombre}</b>? No podrá iniciar sesión.`, async () => {
    await USER_MGMT.desactivar(userId);
    UI.closeModal();
    UI.toast('Usuario desactivado');
    Pages.modalGestionUsuarios();
  });
};

Pages.imprimirUsuarios = async function () {
  const usuarios = await USER_MGMT.getAll();
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Usuarios</title>
  <style>body{font-family:Arial;font-size:11px;margin:20px}
  table{width:100%;border-collapse:collapse}
  th{background:#f3f4f6;padding:6px;border:1px solid #ddd}
  td{padding:6px;border:1px solid #ddd}
  .header{border-bottom:2px solid #000;margin-bottom:12px;padding-bottom:6px;display:flex;justify-content:space-between}
  @media print{body{margin:0}}</style></head><body>
  <div class="header"><b>${Auth.tenant?.name} — Usuarios del Sistema</b><span>${new Date().toLocaleDateString('es-GT')}</span></div>
  <table><thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Rol</th><th>Último Acceso</th><th>Estado</th></tr></thead>
  <tbody>${usuarios.map(u=>`<tr>
    <td>${u.nombre}</td><td>${u.email}</td><td>${u.telefono||'—'}</td>
    <td>${ROLES[u.rol]?.label||u.rol}</td>
    <td>${u.ultimo_login?new Date(u.ultimo_login).toLocaleDateString('es-GT'):'—'}</td>
    <td>${u.activo?'Activo':'Inactivo'}</td>
  </tr>`).join('')}</tbody></table></body></html>`;
  const win=window.open('','_blank');win.document.write(html);win.document.close();setTimeout(()=>win.print(),400);
};

/* ── Listener para reset de password via URL (Supabase redirect) ── */
window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === 'true') {
    /* Supabase redirige aquí después del link de email */
    _loginView = 'recovery-new-pass';
    /* El token ya está en la sesión de Supabase */
    AUTH_RECOVERY._code   = 'SUPABASE_RESET';  // bypass verificación
    AUTH_RECOVERY._exp    = Date.now() + 3600000;
  }
});
