/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/login.js — Pantalla de login
═══════════════════════════════════════════════════════ */

let _tenantLogin = null;

function renderLogin(vista='login') {
  const screen = document.getElementById('login-screen');
  if (!screen) return;

  const vistas = {

    login: `
      <div class="login-card">
        <div class="login-logo">
          <div style="font-size:48px;margin-bottom:8px">🔧</div>
          <h1>TALLERPRO</h1>
          <p>Enterprise v${APP.version}</p>
        </div>

        <div class="form-group">
          <label class="form-label">Nombre o NIT del Taller</label>
          <div style="display:flex;gap:8px">
            <input class="form-input" id="l-taller" placeholder="CM Multiservicios..."
                   onkeydown="if(event.key==='Enter')loginBuscarTaller()">
            <button class="btn btn-ghost" onclick="loginBuscarTaller()">Buscar</button>
          </div>
          <div id="l-taller-result" style="font-size:12px;margin-top:6px;color:var(--cyan)"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Correo Electrónico</label>
          <input class="form-input" id="l-email" type="email" placeholder="usuario@empresa.gt"
                 onkeydown="if(event.key==='Enter')doLogin()">
        </div>

        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <div style="position:relative">
            <input class="form-input" id="l-pass" type="password" placeholder="••••••••"
                   style="padding-right:44px" onkeydown="if(event.key==='Enter')doLogin()">
            <button type="button" onclick="UI.togglePass('l-pass',this)"
              style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                     background:none;border:none;cursor:pointer;font-size:16px;color:var(--text3)">👁</button>
          </div>
        </div>

        <button class="btn btn-amber" style="width:100%;margin-top:8px" onclick="doLogin()">
          Iniciar Sesión →
        </button>

        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="renderLogin('recovery')">
            🔑 Olvidé mi contraseña
          </button>
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="renderLogin('nuevo-taller')">
            🏪 Crear nuevo taller
          </button>
        </div>

        <div style="text-align:center;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
          <span style="font-size:12px;color:var(--text3)">¿Primera vez? Crea tu taller y estrena 30 días de prueba gratis.</span>
        </div>
      </div>`,

    'nuevo-taller': `
      <div class="login-card">
        <div class="login-logo">
          <h1 style="font-size:28px">🏪 Nuevo Taller</h1>
          <p>Registro en TallerPro</p>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Nombre del Taller *</label>
            <input class="form-input" id="nt-nombre" placeholder="Auto Centro García">
          </div>
          <div class="form-group">
            <label class="form-label">NIT</label>
            <input class="form-input" id="nt-nit" placeholder="1234567-8">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Tu nombre *</label>
          <input class="form-input" id="nt-admin" placeholder="Juan García">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Correo Electrónico *</label>
            <input class="form-input" id="nt-email" type="email" placeholder="admin@taller.gt">
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono *</label>
            <input class="form-input" id="nt-tel" type="tel" placeholder="5555-5555">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña *</label>
          <div style="position:relative">
            <input class="form-input" id="nt-pass" type="password" placeholder="Mínimo 8 caracteres"
                   style="padding-right:44px">
            <button type="button" onclick="UI.togglePass('nt-pass',this)"
              style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                     background:none;border:none;cursor:pointer;font-size:16px;color:var(--text3)">👁</button>
          </div>
        </div>

        <div id="nt-turnstile" style="margin-bottom:12px"></div>

        <div class="alert alert-amber" style="margin-bottom:12px">
          <div class="alert-icon">💡</div>
          <div class="alert-body" style="font-size:11px">30 días de prueba gratuita · Sin tarjeta de crédito.
          Tu taller se activa tras una breve revisión (te avisamos por correo).</div>
        </div>

        <button class="btn btn-amber" style="width:100%" onclick="loginRegistrarTaller()">
          Crear Mi Taller →
        </button>
        <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="renderLogin('login')">
          ← Volver
        </button>
      </div>`,

    recovery: `
      <div class="login-card">
        <div class="login-logo">
          <h1 style="font-size:28px">🔑 Recuperar acceso</h1>
          <p>Por enlace o con un código de 6 dígitos</p>
        </div>
        <div class="form-group">
          <label class="form-label">Correo Electrónico</label>
          <input class="form-input" id="rc-email" type="email" placeholder="usuario@empresa.gt"
                 onkeydown="if(event.key==='Enter')loginRecuperarPass()">
        </div>
        <button class="btn btn-amber" style="width:100%" onclick="loginRecuperarPass()">
          📧 Enviar enlace de recuperación →
        </button>
        <button class="btn btn-cyan" style="width:100%;margin-top:8px" onclick="loginSolicitarOTP()">
          🔢 Enviarme un código de 6 dígitos
        </button>
        <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="renderLogin('login')">
          ← Volver al login
        </button>
      </div>`,

    'recovery-otp': `
      <div class="login-card">
        <div class="login-logo">
          <div style="font-size:40px;margin-bottom:8px">🔢</div>
          <h1 style="font-size:24px;color:var(--amber)">Código de recuperación</h1>
          <p>Revisa tu correo — vence en 15 minutos</p>
        </div>
        <div class="form-group">
          <label class="form-label">Código (6 dígitos)</label>
          <input class="form-input mono-sm" id="ro-codigo" inputmode="numeric" maxlength="6" placeholder="000000"
                 style="font-size:22px;letter-spacing:8px;text-align:center">
        </div>
        <div class="form-group">
          <label class="form-label">Nueva Contraseña *</label>
          <div style="position:relative">
            <input class="form-input" id="ro-pass1" type="password" placeholder="Mínimo 8 caracteres" style="padding-right:44px">
            <button type="button" onclick="UI.togglePass('ro-pass1',this)"
              style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;color:var(--text3)">👁</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar Contraseña *</label>
          <input class="form-input" id="ro-pass2" type="password" placeholder="Repetir contraseña"
                 onkeydown="if(event.key==='Enter')loginVerificarOTP()">
        </div>
        <button class="btn btn-amber" style="width:100%" onclick="loginVerificarOTP()">
          Cambiar contraseña →
        </button>
        <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="renderLogin('recovery')">
          ← Pedir otro código
        </button>
      </div>`,

    reset: `
      <div class="login-card">
        <div class="login-logo">
          <div style="font-size:40px;margin-bottom:8px">🔐</div>
          <h1 style="font-size:24px;color:var(--amber)">Nueva contraseña</h1>
          <p>Crea tu nueva contraseña de acceso</p>
        </div>
        <div class="form-group">
          <label class="form-label">Nueva Contraseña *</label>
          <div style="position:relative">
            <input class="form-input" id="rs-pass1" type="password" placeholder="Mínimo 8 caracteres"
                   style="padding-right:44px">
            <button type="button" onclick="UI.togglePass('rs-pass1',this)"
              style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                     background:none;border:none;cursor:pointer;font-size:16px;color:var(--text3)">👁</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar Contraseña *</label>
          <input class="form-input" id="rs-pass2" type="password" placeholder="Repetir contraseña"
                 onkeydown="if(event.key==='Enter')loginResetPass()">
        </div>
        <button class="btn btn-amber" style="width:100%" onclick="loginResetPass()">
          Guardar contraseña →
        </button>
      </div>`,

    'cambiar-pass': `
      <div class="login-card">
        <div class="login-logo">
          <div style="font-size:40px;margin-bottom:8px">🔑</div>
          <h1 style="font-size:24px;color:var(--amber)">Cambia tu Contraseña</h1>
          <p>Primer ingreso — crea tu contraseña personal</p>
        </div>

        <div class="form-group">
          <label class="form-label">Nueva Contraseña *</label>
          <div style="position:relative">
            <input class="form-input" id="cp-pass1" type="password" placeholder="Mínimo 8 caracteres"
                   style="padding-right:44px">
            <button type="button" onclick="UI.togglePass('cp-pass1',this)"
              style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                     background:none;border:none;cursor:pointer;font-size:16px;color:var(--text3)">👁</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar Contraseña *</label>
          <input class="form-input" id="cp-pass2" type="password" placeholder="Repetir contraseña">
        </div>

        <button class="btn btn-amber" style="width:100%" onclick="loginCambiarPass()">
          Guardar y Entrar →
        </button>
      </div>`
  };

  screen.innerHTML = vistas[vista] || vistas.login;

  /* Captcha Turnstile en el registro de talleres (si hay site key) */
  if (vista === 'nuevo-taller' && typeof TURNSTILE_SITE_KEY !== 'undefined' && TURNSTILE_SITE_KEY) {
    _cargarTurnstile();
  }
}

/* ── TURNSTILE (anti-bots) ────────────────────────── */
let _turnstileWidget = null;
function _cargarTurnstile() {
  const render = () => {
    const el = document.getElementById('nt-turnstile');
    if (!el || !window.turnstile) return;
    el.innerHTML = '';
    _turnstileWidget = window.turnstile.render('#nt-turnstile', { sitekey: TURNSTILE_SITE_KEY, theme: 'auto' });
  };
  if (window.turnstile) { render(); return; }
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.onload = render;
  document.head.appendChild(s);
}

/* ── FUNCIONES DE LOGIN ───────────────────────────── */
async function loginBuscarTaller() {
  const q = document.getElementById('l-taller')?.value.trim();
  if (!q) return;
  const results = await DB.buscarTalleres(q);
  const el = document.getElementById('l-taller-result');
  if (!el) return;
  if (!results.length) { el.textContent = 'Sin resultados'; return; }
  el.innerHTML = results.map(t =>
    `<span style="cursor:pointer;margin-right:8px;text-decoration:underline"
      onclick="_seleccionarTaller('${t.id}','${t.name}','${t.slug}')">
      ${t.name}
    </span>`
  ).join('');
}

function _seleccionarTaller(id, nombre, slug) {
  _tenantLogin = { id, name:nombre, slug };
  const el = document.getElementById('l-taller-result');
  if (el) el.innerHTML = `<span style="color:var(--green)">✓ ${nombre}</span>`;
  const inp = document.getElementById('l-taller');
  if (inp) inp.value = nombre;
}

async function doLogin() {
  const email = document.getElementById('l-email')?.value.trim();
  const pass  = document.getElementById('l-pass')?.value;
  if (!email) { UI.toast('Ingresa tu correo','error'); return; }
  if (!pass)  { UI.toast('Ingresa tu contraseña','error'); return; }

  UI.toast('Iniciando sesión...','info');
  const r = await Auth.login(email, pass, _tenantLogin?.slug || null);

  if (r.ok) {
    if (r.debe_cambiar) { renderLogin('cambiar-pass'); return; }
    App.iniciar();
  } else {
    UI.toast(r.error || 'Correo o contraseña incorrectos','error');
  }
}

async function loginRegistrarTaller() {
  const nombre = document.getElementById('nt-nombre')?.value.trim();
  const admin  = document.getElementById('nt-admin')?.value.trim();
  const email  = document.getElementById('nt-email')?.value.trim();
  const tel    = document.getElementById('nt-tel')?.value.trim();
  const pass   = document.getElementById('nt-pass')?.value;
  const nit    = document.getElementById('nt-nit')?.value.trim();

  if (!nombre||!admin||!email||!tel||!pass) { UI.toast('Completa todos los campos','error'); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { UI.toast('El correo no es válido','error'); return; }
  if (!/^\+?[\d\s-]{8,15}$/.test(tel)) { UI.toast('El teléfono no es válido (mínimo 8 dígitos)','error'); return; }
  if (pass.length < 8) { UI.toast('Contraseña mínimo 8 caracteres','error'); return; }
  if (email === 'henry.chinchilla@gmail.com') { UI.toast('Correo reservado','error'); return; }

  /* Token del captcha (si Turnstile está activo) */
  let turnstile_token = null;
  if (typeof TURNSTILE_SITE_KEY !== 'undefined' && TURNSTILE_SITE_KEY && window.turnstile) {
    turnstile_token = window.turnstile.getResponse(_turnstileWidget);
    if (!turnstile_token) { UI.toast('Completa la verificación de seguridad','error'); return; }
  }

  UI.toast('Registrando tu taller...','info');
  const { data, error } = await getSB().functions.invoke('registrar-taller', {
    body: { nombre_taller: nombre, nit, nombre_admin: admin, email, telefono: tel, password: pass, turnstile_token }
  });

  let msg = data?.error || null;
  if (error) { try { const j = await error.context.json(); msg = j?.error || error.message; } catch(_) { msg = error.message; } }
  if (msg) {
    UI.toast(msg,'error');
    if (window.turnstile && _turnstileWidget !== null) window.turnstile.reset(_turnstileWidget);
    return;
  }

  renderLogin('login');
  UI.modal('🎉 ¡Taller registrado!', `
    <div style="text-align:center;padding:8px 4px">
      <div style="font-size:44px;margin-bottom:10px">🏪</div>
      <div style="font-weight:800;font-size:16px;margin-bottom:8px">${nombre}</div>
      <p style="font-size:13px;color:var(--text2);line-height:1.6">
        Tu registro fue recibido y tu taller está en <b>revisión de activación</b>
        (normalmente en horas). Te avisaremos a <b>${email}</b> cuando esté listo
        para iniciar tus <b>30 días de prueba gratis</b>.
      </p>
      <div class="modal-footer" style="justify-content:center">
        <button class="btn btn-amber" onclick="UI.cerrarModal()">Entendido</button>
      </div>
    </div>`);
}

/* ── RECUPERACIÓN POR CÓDIGO OTP ──────────────────── */
let _otpEmail = null;
async function loginSolicitarOTP() {
  const email = document.getElementById('rc-email')?.value.trim();
  if (!email) { UI.toast('Ingresa tu correo','error'); return; }
  UI.toast('Enviando código...','info');
  const { data, error } = await getSB().functions.invoke('recuperar-password', {
    body: { op:'solicitar', email }
  });
  let msg = data?.error || null;
  if (error) { try { const j = await error.context.json(); msg = j?.error || error.message; } catch(_) { msg = error.message; } }
  if (msg) { UI.toast(msg,'error'); return; }
  _otpEmail = email;
  UI.toast('Si el correo existe, recibirás un código de 6 dígitos ✓');
  renderLogin('recovery-otp');
}

async function loginVerificarOTP() {
  const codigo = document.getElementById('ro-codigo')?.value.trim();
  const p1 = document.getElementById('ro-pass1')?.value;
  const p2 = document.getElementById('ro-pass2')?.value;
  if (!/^\d{6}$/.test(codigo||'')) { UI.toast('Ingresa el código de 6 dígitos','error'); return; }
  if (!p1 || p1.length < 8) { UI.toast('Mínimo 8 caracteres','error'); return; }
  if (p1 !== p2) { UI.toast('Las contraseñas no coinciden','error'); return; }
  if (!_otpEmail) { renderLogin('recovery'); return; }

  UI.toast('Verificando...','info');
  const { data, error } = await getSB().functions.invoke('recuperar-password', {
    body: { op:'verificar', email:_otpEmail, codigo, password:p1 }
  });
  let msg = data?.error || null;
  if (error) { try { const j = await error.context.json(); msg = j?.error || error.message; } catch(_) { msg = error.message; } }
  if (msg) { UI.toast(msg,'error'); return; }
  UI.toast('¡Contraseña actualizada! Inicia sesión 🎉');
  _otpEmail = null;
  renderLogin('login');
}

async function loginRecuperarPass() {
  const email = document.getElementById('rc-email')?.value.trim();
  if (!email) { UI.toast('Ingresa tu correo','error'); return; }
  UI.toast('Enviando enlace...','info');
  const r = await Auth.recuperarPassword(email);
  if (!r.ok) { UI.toast(r.error,'error'); return; }
  /* Mensaje neutro: no revelar si el correo existe o no */
  UI.toast('Si el correo existe, recibirás un enlace de recuperación ✓');
  setTimeout(() => renderLogin('login'), 2500);
}

async function loginResetPass() {
  const p1 = document.getElementById('rs-pass1')?.value;
  const p2 = document.getElementById('rs-pass2')?.value;
  if (!p1 || p1.length < 8) { UI.toast('Mínimo 8 caracteres','error'); return; }
  if (p1 !== p2) { UI.toast('Las contraseñas no coinciden','error'); return; }
  const r = await Auth.cambiarPassword(p1);
  if (!r.ok) { UI.toast(r.error,'error'); return; }
  /* Limpiar el hash del enlace de recuperación de la URL */
  history.replaceState(null, '', window.location.pathname);
  UI.toast('¡Contraseña actualizada! 🎉');
  setTimeout(() => App.iniciar(), 800);
}

async function loginCambiarPass() {
  const p1 = document.getElementById('cp-pass1')?.value;
  const p2 = document.getElementById('cp-pass2')?.value;
  if (!p1||p1.length<8) { UI.toast('Mínimo 8 caracteres','error'); return; }
  if (p1 !== p2) { UI.toast('Las contraseñas no coinciden','error'); return; }
  const r = await Auth.cambiarPassword(p1);
  if (!r.ok) { UI.toast('Error: '+r.error,'error'); return; }
  UI.toast('¡Contraseña guardada! ✓');
  setTimeout(() => App.iniciar(), 800);
}


/* Enlace de recuperación: Supabase emite el evento PASSWORD_RECOVERY
   cuando el usuario regresa desde el correo. Mostramos el form de
   nueva contraseña en vez de iniciar la app. */
getSB().auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') renderLogin('reset');
});

window.addEventListener('load', async () => {
  TEMAS.aplicar(localStorage.getItem('tp_tema') || 'dark');

  /* Si venimos de un enlace de recuperación, ir directo al reset */
  if (window.location.hash.includes('type=recovery')) {
    renderLogin('reset');
    return;
  }

  try {
    const { data: { session } } = await getSB().auth.getSession();
    if (session?.user) {
      await Auth._cargarPerfil(session.user.id, session.user.email);
      Auth.supaUser = session.user;
      if (Auth.tenant?.id) window._cachedTenantId = Auth.tenant.id;
      App.iniciar(); return;
    }
  } catch(e) { console.warn('Session:', e.message); }
  renderLogin('login');

  /* Avisar el motivo si la sesión anterior se cerró por inactividad
     o expiración (la dejó App._resetIdle / Supabase al expirar). */
  const reason = localStorage.getItem('tp_logout_reason');
  if (reason) {
    localStorage.removeItem('tp_logout_reason');
    const msg = reason === 'inactivity'
      ? 'Sesión cerrada por inactividad.'
      : 'Su sesión expiró. Inicie sesión nuevamente.';
    setTimeout(() => UI.toast(msg, 'error'), 400);
  }
});
