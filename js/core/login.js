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
          <span style="font-size:12px;color:var(--text3)">¿Primera vez? </span>
          <button class="btn btn-ghost btn-sm" onclick="loginDemo()">🚀 Acceso demo</button>
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
        <div class="form-group">
          <label class="form-label">Correo Electrónico *</label>
          <input class="form-input" id="nt-email" type="email" placeholder="admin@taller.gt">
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

        <div class="alert alert-amber" style="margin-bottom:12px">
          <div class="alert-icon">💡</div>
          <div class="alert-body" style="font-size:11px">30 días de prueba gratuita · Sin tarjeta de crédito</div>
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
          <p>Contacta al administrador del sistema</p>
        </div>
        <div class="alert alert-cyan">
          <div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:12px">
            El administrador puede resetear tu contraseña desde Gestión de Usuarios en Configuración.
            Si eres el administrador, contacta a soporte en
            <a href="mailto:soporte@tallerpro.gt" style="color:var(--cyan)">soporte@tallerpro.gt</a>
          </div>
        </div>
        <button class="btn btn-ghost" style="width:100%;margin-top:16px" onclick="renderLogin('login')">
          ← Volver al login
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
  } else if (r.error === 'demo_expirado') {
    UI.toast('Demo expirado — activa tu licencia','error');
  } else {
    UI.toast(r.error || 'Correo o contraseña incorrectos','error');
  }
}

async function loginRegistrarTaller() {
  const nombre = document.getElementById('nt-nombre')?.value.trim();
  const admin  = document.getElementById('nt-admin')?.value.trim();
  const email  = document.getElementById('nt-email')?.value.trim();
  const pass   = document.getElementById('nt-pass')?.value;
  const nit    = document.getElementById('nt-nit')?.value.trim();

  if (!nombre||!admin||!email||!pass) { UI.toast('Completa todos los campos','error'); return; }
  if (pass.length < 8) { UI.toast('Contraseña mínimo 8 caracteres','error'); return; }
  if (email === 'henry.chinchilla@gmail.com') { UI.toast('Correo reservado','error'); return; }

  UI.toast('Creando taller...','info');
  const r = await Auth.registrarTaller({ nombre_taller:nombre, nit, nombre:admin, email, password:pass });
  if (!r.ok) { UI.toast('Error: '+r.error,'error'); return; }
  UI.toast('¡Taller creado! Bienvenido 🎉');
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

function loginDemo() {
  const emailEl = document.getElementById('l-email');
  const passEl  = document.getElementById('l-pass');
  if (emailEl) emailEl.value = 'demo@demo.com';
  if (passEl)  passEl.value  = 'demo123';
  doLogin();
}


window.addEventListener('load', async () => {
  TEMAS.aplicar(localStorage.getItem('tp_tema') || 'dark');
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
});
