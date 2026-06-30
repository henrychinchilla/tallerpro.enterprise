/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/login.js — Pantalla de login
═══════════════════════════════════════════════════════ */

let _tenantLogin = null;

const _svgGoogle = `<svg width="18" height="18" viewBox="0 0 18 18" style="flex-shrink:0"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>`;

function renderLogin(vista='login') {
  const screen = document.getElementById('login-screen');
  if (!screen) return;

  const div_ = (txt='o') => `
    <div style="display:flex;align-items:center;margin:14px 0 10px;gap:8px">
      <hr style="flex:1;border:none;border-top:1px solid var(--border)">
      <span style="font-size:12px;color:var(--text3)">${txt}</span>
      <hr style="flex:1;border:none;border-top:1px solid var(--border)">
    </div>`;

  const btnGoogle = (intent, label) => `
    <button onclick="loginConGoogle('${intent}')"
      style="width:100%;padding:11px;border:1.5px solid var(--border);border-radius:8px;
             background:var(--card);cursor:pointer;font-size:14px;font-weight:600;
             display:flex;align-items:center;justify-content:center;gap:10px;color:var(--text1)">
      ${_svgGoogle} ${label}
    </button>`;

  const vistas = {

    login: `
      <div class="login-card">
        <div class="login-logo">
          <div style="font-size:48px;margin-bottom:8px">⚡</div>
          <h1>NEXUSPRO</h1>
          <p>${APP.slogan}</p>
        </div>

        <div class="form-group">
          <label class="form-label">Nombre o NIT de tu Negocio</label>
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

        ${div_()}
        ${btnGoogle('login', 'Continuar con Google')}

        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="renderLogin('recovery')">
            🔑 Olvidé mi contraseña
          </button>
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="renderLogin('nuevo-taller')">
            🏪 Crear Nuevo Negocio
          </button>
        </div>

        <div style="text-align:center;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
          <span style="font-size:12px;color:var(--text3)">¿Primera vez? Crea tu negocio y estrena 30 días de prueba gratis.</span>
        </div>
      </div>`,

    'nuevo-taller': `
      <div class="login-card">
        <div class="login-logo">
          <h1 style="font-size:28px">🏪 Nuevo Negocio</h1>
          <p>Registro en TallerPro</p>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Nombre del Negocio *</label>
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
        <div class="form-group">
          <label class="form-label">Confirmar Contraseña *</label>
          <input class="form-input" id="nt-pass2" type="password" placeholder="Repetir contraseña">
        </div>

        <div class="form-group">
          <label class="form-label">¿Qué tipo de negocio es? *</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s;background:var(--surface2)" onclick="document.getElementById('tipo-taller').checked=true;this.parentElement.querySelectorAll('label').forEach(l=>l.style.background='');this.style.background='var(--cyan-alpha)'">
              <input type="radio" id="tipo-taller" name="tipo" value="taller" checked>
              <div><div style="font-weight:700;font-size:13px">🔧 Taller Vehicular</div></div>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-refrigeracion').checked=true;this.parentElement.querySelectorAll('label').forEach(l=>l.style.background='');this.style.background='var(--cyan-alpha)'">
              <input type="radio" id="tipo-refrigeracion" name="tipo" value="refrigeracion">
              <div><div style="font-weight:700;font-size:13px">❄️ Refrigeración</div></div>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-herreria').checked=true;this.parentElement.querySelectorAll('label').forEach(l=>l.style.background='');this.style.background='var(--cyan-alpha)'">
              <input type="radio" id="tipo-herreria" name="tipo" value="herreria">
              <div><div style="font-weight:700;font-size:13px">⚒️ Herrería</div></div>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-peleteria').checked=true;this.parentElement.querySelectorAll('label').forEach(l=>l.style.background='');this.style.background='var(--cyan-alpha)'">
              <input type="radio" id="tipo-peleteria" name="tipo" value="peleteria">
              <div><div style="font-weight:700;font-size:13px">👜 Peletería</div></div>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-electronica').checked=true;this.parentElement.querySelectorAll('label').forEach(l=>l.style.background='');this.style.background='var(--cyan-alpha)'">
              <input type="radio" id="tipo-electronica" name="tipo" value="electronica">
              <div><div style="font-weight:700;font-size:13px">🔌 Electrónica</div></div>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-agro').checked=true;this.parentElement.querySelectorAll('label').forEach(l=>l.style.background='');this.style.background='var(--cyan-alpha)'">
              <input type="radio" id="tipo-agro" name="tipo" value="agroservicio">
              <div><div style="font-weight:700;font-size:13px">🌾 Agroservicio</div></div>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-granos').checked=true;this.parentElement.querySelectorAll('label').forEach(l=>l.style.background='');this.style.background='var(--cyan-alpha)'">
              <input type="radio" id="tipo-granos" name="tipo" value="venta_granos">
              <div><div style="font-weight:700;font-size:13px">🌽 Venta de Granos</div></div>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-ferreteria').checked=true;this.parentElement.querySelectorAll('label').forEach(l=>l.style.background='');this.style.background='var(--cyan-alpha)'">
              <input type="radio" id="tipo-ferreteria" name="tipo" value="ferreteria">
              <div><div style="font-weight:700;font-size:13px">🔩 Ferretería</div></div>
            </label>
          </div>
        </div>

        <div id="nt-turnstile" style="margin-bottom:12px"></div>

        <div class="legal-disclaimer-box" style="background:rgba(255, 193, 7, 0.05);border:1px solid rgba(255, 193, 7, 0.25);border-radius:8px;padding:12px;margin-bottom:12px;font-size:11.5px;line-height:1.6;color:var(--text2);text-align:left">
          <div style="font-weight:700;color:var(--amber);margin-bottom:6px;display:flex;align-items:center;gap:6px">
            🛡️ Blindaje de Protección Legal y Privacidad
          </div>
          Al crear tu cuenta en NexusPro, confirmas tu consentimiento explícito sobre nuestros términos. Esto incluye la <b>política de cero reembolsos</b> ante suscripciones activas y la <b>suspensión inmediata de cuenta</b> ante disputas bancarias o contracargos falsos. Así mismo, aceptas las condiciones internacionales de <b>protección de código fuente</b>, marcas y propiedad intelectual de la aplicación.
        </div>

        <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;margin:12px 0;cursor:pointer;line-height:1.5;color:var(--text);text-align:left">
          <input type="checkbox" id="nt-consentimiento" required style="margin-top:3px;cursor:pointer">
          <span>He leído y acepto los <a href="/terminos.html" target="_blank" style="color:var(--cyan);text-decoration:underline">Términos de Uso</a>, la <a href="/privacidad.html" target="_blank" style="color:var(--cyan);text-decoration:underline">Política de Privacidad</a> y Reembolsos. *</span>
        </label>

        <div class="alert alert-amber" style="margin-bottom:12px">
          <div class="alert-icon">💡</div>
          <div class="alert-body" style="font-size:11px">30 días de prueba gratuita · Sin tarjeta de crédito.
          Tu taller se activa tras una breve revisión (te avisamos por correo).</div>
        </div>

        <button class="btn btn-amber" style="width:100%" onclick="loginRegistrarTaller()">
          Crear mi Negocio →
        </button>

        ${div_('o regístrate con')}
        ${btnGoogle('nuevo-taller', 'Continuar con Google')}

        <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="renderLogin('login')">
          ← Volver
        </button>
      </div>`,

    'tipo-negocio': `
      <div class="login-card">
        <div class="login-logo">
          <h1 style="font-size:28px">🏪 Tu Tipo de Negocio</h1>
          <p>Elige los módulos que necesitas</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
          <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-taller').checked=true">
            <input type="radio" id="tipo-taller" name="tipo" value="taller" checked>
            <div><div style="font-weight:700">🔧 Taller Vehicular</div><div style="font-size:11px;color:var(--text3)">Autos, motos, reparación</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-refrigeracion').checked=true">
            <input type="radio" id="tipo-refrigeracion" name="tipo" value="refrigeracion">
            <div><div style="font-weight:700">❄️ Refrigeración</div><div style="font-size:11px;color:var(--text3)">A/C, equipos frigoríficos</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-herreria').checked=true">
            <input type="radio" id="tipo-herreria" name="tipo" value="herreria">
            <div><div style="font-weight:700">⚒️ Herrería</div><div style="font-size:11px;color:var(--text3)">Puertas, ventanas, estructuras</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-peleteria').checked=true">
            <input type="radio" id="tipo-peleteria" name="tipo" value="peleteria">
            <div><div style="font-weight:700">👜 Peletería</div><div style="font-size:11px;color:var(--text3)">Cuero, bolsos, accesorios</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-electronica').checked=true">
            <input type="radio" id="tipo-electronica" name="tipo" value="electronica">
            <div><div style="font-weight:700">🔌 Electrónica</div><div style="font-size:11px;color:var(--text3)">Reparación de aparatos</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-agro').checked=true">
            <input type="radio" id="tipo-agro" name="tipo" value="agroservicio">
            <div><div style="font-weight:700">🌾 Agroservicio</div><div style="font-size:11px;color:var(--text3)">Semillas, fertilizantes, asesoria</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-granos').checked=true">
            <input type="radio" id="tipo-granos" name="tipo" value="venta_granos">
            <div><div style="font-weight:700">🌽 Venta de Granos</div><div style="font-size:11px;color:var(--text3)">Comercialización de granos</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-ferreteria').checked=true">
            <input type="radio" id="tipo-ferreteria" name="tipo" value="ferreteria">
            <div><div style="font-weight:700">🔩 Ferretería</div><div style="font-size:11px;color:var(--text3)">Herramientas, materiales, venta mostrador</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:10px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s" onclick="document.getElementById('tipo-otro').checked=true">
            <input type="radio" id="tipo-otro" name="tipo" value="otro">
            <div><div style="font-weight:700">⚙️ Personalizado</div><div style="font-size:11px;color:var(--text3)">Solicitar módulos específicos</div></div>
          </label>
        </div>

        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" style="flex:1" onclick="renderLogin('login')">← Atrás</button>
          <button class="btn btn-amber" style="flex:1" onclick="loginGuardarTipoNegocio()">Continuar →</button>
        </div>
      </div>`,

    recovery: `
      <div class="login-card">
        <div class="login-logo">
          <h1 style="font-size:28px">🔑 Recuperar acceso</h1>
          <p>Te enviaremos un enlace a tu correo</p>
        </div>
        <div class="form-group">
          <label class="form-label">Correo Electrónico</label>
          <input class="form-input" id="rc-email" type="email" placeholder="usuario@empresa.gt"
                 onkeydown="if(event.key==='Enter')loginRecuperarPass()">
        </div>
        <button class="btn btn-amber" style="width:100%" onclick="loginRecuperarPass()">
          📧 Enviar enlace de recuperación →
        </button>
        <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="renderLogin('login')">
          ← Volver al login
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

    'nuevo-taller-google': `
      <div class="login-card">
        <div class="login-logo">
          <h1 style="font-size:28px">🏪 Crear tu Taller</h1>
          <p>Completa los datos para activar tu cuenta</p>
        </div>
        <div id="ntg-userinfo"
          style="background:var(--surface);border-radius:8px;padding:10px 14px;
                 margin-bottom:16px;font-size:13px;color:var(--text2);border:1px solid var(--border)">
          Cargando datos de Google...
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Nombre del Taller *</label>
            <input class="form-input" id="ntg-nombre" placeholder="Auto Centro García">
          </div>
          <div class="form-group">
            <label class="form-label">NIT</label>
            <input class="form-input" id="ntg-nit" placeholder="1234567-8">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono de contacto *</label>
          <input class="form-input" id="ntg-tel" type="tel" placeholder="5555-5555">
        </div>

        <div class="legal-disclaimer-box" style="background:rgba(255, 193, 7, 0.05);border:1px solid rgba(255, 193, 7, 0.25);border-radius:8px;padding:12px;margin-bottom:12px;font-size:11.5px;line-height:1.6;color:var(--text2);text-align:left">
          <div style="font-weight:700;color:var(--amber);margin-bottom:6px;display:flex;align-items:center;gap:6px">
            🛡️ Blindaje de Protección Legal y Privacidad
          </div>
          Al crear tu cuenta en NexusPro, confirmas tu consentimiento explícito sobre nuestros términos. Esto incluye la <b>política de cero reembolsos</b> ante suscripciones activas y la <b>suspensión inmediata de cuenta</b> ante disputas bancarias o contracargos falsos. Así mismo, aceptas las condiciones internacionales de <b>protección de código fuente</b>, marcas y propiedad intelectual de la aplicación.
        </div>

        <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;margin:12px 0;cursor:pointer;line-height:1.5;color:var(--text);text-align:left">
          <input type="checkbox" id="ntg-consentimiento" required style="margin-top:3px;cursor:pointer">
          <span>He leído y acepto los <a href="/terminos.html" target="_blank" style="color:var(--cyan);text-decoration:underline">Términos de Uso</a>, la <a href="/privacidad.html" target="_blank" style="color:var(--cyan);text-decoration:underline">Política de Privacidad</a> y Reembolsos. *</span>
        </label>

        <div class="alert alert-amber" style="margin-bottom:12px">
          <div class="alert-icon">💡</div>
          <div class="alert-body" style="font-size:11px">30 días de prueba gratuita · Sin tarjeta de crédito.
          Tu taller se activa tras una breve revisión (te avisamos por correo).</div>
        </div>

        <button class="btn btn-amber" style="width:100%" onclick="loginRegistrarTallerGoogle()">
          Crear Mi Taller →
        </button>
        <button class="btn btn-ghost" style="width:100%;margin-top:8px"
          onclick="getSB().auth.signOut().then(()=>renderLogin('login'))">
          ← Cancelar
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

  if (vista === 'nuevo-taller' && typeof TURNSTILE_SITE_KEY !== 'undefined' && TURNSTILE_SITE_KEY) {
    _cargarTurnstile();
  }
  if (vista === 'nuevo-taller-google') _cargarInfoGoogle();
}

/* ── TURNSTILE ────────────────────────────────────── */
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
  s.async = true; s.onload = render;
  document.head.appendChild(s);
}

async function _cargarInfoGoogle() {
  const el = document.getElementById('ntg-userinfo');
  if (!el) return;
  try {
    const { data: { session } } = await getSB().auth.getSession();
    if (!session?.user) return;
    const { email, user_metadata } = session.user;
    const nombre = user_metadata?.full_name ?? user_metadata?.name ?? email;
    el.innerHTML = `${_svgGoogle} &nbsp;<b>${nombre}</b> <span style="color:var(--text3)">· ${email}</span>`;
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '8px';
  } catch(_) {}
}

/* ── LOGIN ────────────────────────────────────────── */
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
  _tenantLogin = { id, name: nombre, slug };
  const el = document.getElementById('l-taller-result');
  if (el) el.innerHTML = `<span style="color:var(--green)">✓ ${nombre}</span>`;
  const inp = document.getElementById('l-taller');
  if (inp) inp.value = nombre;
}

async function doLogin() {
  const email = document.getElementById('l-email')?.value.trim();
  const pass  = document.getElementById('l-pass')?.value;
  if (!email) { UI.toast('Ingresa tu correo', 'error'); return; }
  if (!pass)  { UI.toast('Ingresa tu contraseña', 'error'); return; }

  UI.toast('Iniciando sesión...', 'info');
  const r = await Auth.login(email, pass, _tenantLogin?.slug || null);

  if (r.ok) {
    if (r.debe_cambiar) { renderLogin('cambiar-pass'); return; }
    App.iniciar();
  } else {
    UI.toast(r.error || 'Correo o contraseña incorrectos', 'error');
  }
}

/* ── GOOGLE OAUTH ─────────────────────────────────── */
async function loginConGoogle(intent = 'login') {
  localStorage.setItem('google_intent', intent);
  const { error } = await getSB().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) UI.toast('Error al conectar con Google: ' + error.message, 'error');
}

async function loginRegistrarTallerGoogle() {
  const consent = document.getElementById('ntg-consentimiento')?.checked;
  if (!consent) { UI.toast('Debes aceptar los Términos de Uso, Política de Privacidad y Reembolsos para registrarte', 'error'); return; }

  const nombre = document.getElementById('ntg-nombre')?.value.trim();
  const tel    = document.getElementById('ntg-tel')?.value.trim();
  const nit    = document.getElementById('ntg-nit')?.value.trim();

  if (!nombre) { UI.toast('Ingresa el nombre del taller', 'error'); return; }
  if (!tel || !/^\+?[\d\s-]{8,15}$/.test(tel)) {
    UI.toast('Ingresa un teléfono válido (mínimo 8 dígitos)', 'error'); return;
  }

  const { data: { session } } = await getSB().auth.getSession();
  if (!session?.user) { renderLogin('login'); return; }

  const email       = session.user.email;
  const adminNombre = session.user.user_metadata?.full_name
                   ?? session.user.user_metadata?.name
                   ?? email.split('@')[0];

  UI.toast('Registrando tu taller...', 'info');
  const { data: rpcTenant, error: rpcErr } = await getSB().rpc('registrar_taller', {
    p_nombre_taller: nombre,
    p_nit:           nit || null,
    p_email:         email,
    p_nombre:        adminNombre,
  });

  if (rpcErr) { UI.toast('Error: ' + rpcErr.message, 'error'); return; }

  /* Guardar teléfono — RPC no lo incluye en su firma original */
  getSB().from('usuarios').update({ telefono: tel }).eq('email', email).then(() => {});

  Auth.supaUser = session.user;
  Auth.tenant   = rpcTenant;
  Auth.user     = {
    id: session.user.id, nombre: adminNombre, email,
    rol: 'admin', activo: true, avatar: '👑', tenant_id: rpcTenant?.id
  };
  window._cachedTenantId = rpcTenant?.id || null;

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

/* ── REGISTRO NUEVO TALLER (email/password) ────────── */
async function loginRegistrarTaller() {
  const consent = document.getElementById('nt-consentimiento')?.checked;
  if (!consent) { UI.toast('Debes aceptar los Términos de Uso, Política de Privacidad y Reembolsos para registrarte', 'error'); return; }

  const nombre = document.getElementById('nt-nombre')?.value.trim();
  const admin  = document.getElementById('nt-admin')?.value.trim();
  const email  = document.getElementById('nt-email')?.value.trim();
  const tel    = document.getElementById('nt-tel')?.value.trim();
  const pass   = document.getElementById('nt-pass')?.value;
  const pass2  = document.getElementById('nt-pass2')?.value;
  const nit    = document.getElementById('nt-nit')?.value.trim();

  if (!nombre||!admin||!email||!tel||!pass) { UI.toast('Completa todos los campos', 'error'); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { UI.toast('El correo no es válido', 'error'); return; }
  if (!/^\+?[\d\s-]{8,15}$/.test(tel)) { UI.toast('El teléfono no es válido (mínimo 8 dígitos)', 'error'); return; }
  if (pass.length < 8) { UI.toast('Contraseña mínimo 8 caracteres', 'error'); return; }
  if (pass !== pass2)  { UI.toast('Las contraseñas no coinciden', 'error'); return; }
  if (email === 'henry.chinchilla@gmail.com') { UI.toast('Correo reservado', 'error'); return; }

  let turnstile_token = null;
  if (typeof TURNSTILE_SITE_KEY !== 'undefined' && TURNSTILE_SITE_KEY && window.turnstile) {
    turnstile_token = window.turnstile.getResponse(_turnstileWidget);
    if (!turnstile_token) { UI.toast('Completa la verificación de seguridad', 'error'); return; }
  }

  UI.toast('Registrando tu taller...', 'info');
  const { data, error } = await getSB().functions.invoke('registrar-taller', {
    body: { nombre_taller: nombre, nit, nombre_admin: admin, email, telefono: tel, password: pass, turnstile_token }
  });

  let msg = data?.error || null;
  if (error) { try { const j = await error.context.json(); msg = j?.error || error.message; } catch(_) { msg = error.message; } }
  if (msg) {
    UI.toast(msg, 'error');
    if (window.turnstile && _turnstileWidget !== null) window.turnstile.reset(_turnstileWidget);
    return;
  }

  /* Guardar tipo de negocio seleccionado */
  const tipo = document.querySelector('input[name="tipo"]:checked')?.value || 'taller';
  const modulos_base = ['clientes','vehiculos','ordenes','inventario','pos'];
  const modulos_map = {
    taller: modulos_base,
    refrigeracion: [...modulos_base, 'refrigeracion'],
    herreria: [...modulos_base, 'herreria'],
    peleteria: [...modulos_base, 'peleteria'],
    electronica: [...modulos_base, 'electronica'],
    agroservicio: ['clientes','agroservicio','inventario','proveedores','compras'],
    venta_granos: ['clientes','venta_granos','inventario','facturacion','bancos'],
    ferreteria: ['clientes','pos','inventario','bodegas','proveedores','compras','facturacion','bancos','contabilidad'],
    otro: modulos_base
  };
  const modulos_activos = modulos_map[tipo] || modulos_base;
  localStorage.setItem('nt_modulos_activos', JSON.stringify(modulos_activos));

  UI.modal('🎉 ¡Bienvenido a NexusPro!', `
    <div style="text-align:center;padding:8px 4px">
      <div style="font-size:44px;margin-bottom:10px">⚡</div>
      <div style="font-weight:800;font-size:16px;margin-bottom:8px">${nombre}</div>
      <p style="font-size:13px;color:var(--text2);line-height:1.6">
        Tu negocio fue registrado exitosamente en <b>NexusPro</b> y está en <b>revisión de activación</b>
        (normalmente en horas). Te avisaremos a <b>${email}</b> cuando esté listo
        para iniciar tus <b>30 días de prueba gratis</b>.<br><br>
        <b>Tu ecosistema:</b> ${modulos_activos.map(m => m.replace('_',' ')).join(', ')}
      </p>
      <div class="modal-footer" style="justify-content:center">
        <button class="btn btn-amber" onclick="UI.cerrarModal();renderLogin('login')">← Volver al Login</button>
      </div>
    </div>`);
}

/* ── RECUPERACIÓN DE CONTRASEÑA ───────────────────── */
async function loginRecuperarPass() {
  const email = document.getElementById('rc-email')?.value.trim();
  if (!email) { UI.toast('Ingresa tu correo', 'error'); return; }
  UI.toast('NexusPro está enviando el enlace a tu correo...', 'info');
  const { data, error } = await getSB().functions.invoke('recuperar-password', {
    body: { op: 'solicitar', email }
  });
  let msg = data?.error || null;
  if (error) { try { const j = await error.context.json(); msg = j?.error || error.message; } catch(_) { msg = error.message; } }
  if (msg) { UI.toast(msg, 'error'); return; }
  UI.toast('NexusPro te enviará el enlace de recuperación a tu correo ✓');
  setTimeout(() => renderLogin('login'), 2500);
}

async function loginResetPass() {
  const p1 = document.getElementById('rs-pass1')?.value;
  const p2 = document.getElementById('rs-pass2')?.value;
  if (!p1 || p1.length < 8) { UI.toast('Mínimo 8 caracteres', 'error'); return; }
  if (p1 !== p2) { UI.toast('Las contraseñas no coinciden', 'error'); return; }
  const r = await Auth.cambiarPassword(p1);
  if (!r.ok) { UI.toast(r.error, 'error'); return; }
  history.replaceState(null, '', window.location.pathname);
  UI.toast('¡Contraseña actualizada! 🎉');
  setTimeout(() => App.iniciar(), 800);
}

async function loginCambiarPass() {
  const p1 = document.getElementById('cp-pass1')?.value;
  const p2 = document.getElementById('cp-pass2')?.value;
  if (!p1 || p1.length < 8) { UI.toast('Mínimo 8 caracteres', 'error'); return; }
  if (p1 !== p2) { UI.toast('Las contraseñas no coinciden', 'error'); return; }
  const r = await Auth.cambiarPassword(p1);
  if (!r.ok) { UI.toast('Error: ' + r.error, 'error'); return; }
  UI.toast('¡Contraseña guardada! ✓');
  setTimeout(() => App.iniciar(), 800);
}

async function loginGuardarTipoNegocio() {
  const tipo = document.querySelector('input[name="tipo"]:checked')?.value;
  if (!tipo) { UI.toast('Selecciona un tipo de negocio', 'error'); return; }

  const modulos_base = ['clientes','vehiculos','ordenes','inventario','pos'];
  const modulos_map = {
    taller: modulos_base,
    refrigeracion: [...modulos_base, 'refrigeracion'],
    herreria: [...modulos_base, 'herreria'],
    peleteria: [...modulos_base, 'peleteria'],
    electronica: [...modulos_base, 'electronica'],
    agroservicio: ['clientes','agroservicio','inventario','proveedores','compras'],
    venta_granos: ['clientes','venta_granos','inventario','facturacion','bancos'],
    ferreteria: ['clientes','pos','inventario','bodegas','proveedores','compras','facturacion','bancos','contabilidad'],
    otro: modulos_base
  };

  const modulos_activos = modulos_map[tipo] || modulos_base;
  const ok = await DB.actualizarModulosTenant(modulos_activos);

  if (ok) {
    UI.toast('✓ Configuración guardada', 'success');
    setTimeout(() => {
      Auth.tenant.modulos_activos = modulos_activos;
      App.iniciar();
    }, 600);
  } else {
    UI.toast('Error al guardar configuración', 'error');
  }
}

/* PASSWORD_RECOVERY event de Supabase */
getSB().auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') renderLogin('reset');
});

window.addEventListener('load', async () => {
  TEMAS.aplicar(localStorage.getItem('tp_tema') || 'dark');

  if (window.location.hash.includes('type=recovery')) {
    renderLogin('reset');
    return;
  }

  try {
    const { data: { session } } = await getSB().auth.getSession();
    if (session?.user) {
      const intent = localStorage.getItem('google_intent');
      localStorage.removeItem('google_intent');

      await Auth._cargarPerfil(session.user.id, session.user.email);
      Auth.supaUser = session.user;
      if (Auth.tenant?.id) window._cachedTenantId = Auth.tenant.id;

      /* Google sin taller aún → completar registro */
      if (!Auth.tenant && Auth.user?.rol !== 'superadmin') {
        renderLogin('nuevo-taller-google');
        return;
      }

      if (Auth.user?.debe_cambiar_password) { renderLogin('cambiar-pass'); return; }
      App.iniciar(); return;
    }
  } catch(e) { console.warn('Session:', e.message); }

  renderLogin('login');

  const reason = localStorage.getItem('tp_logout_reason');
  if (reason) {
    localStorage.removeItem('tp_logout_reason');
    const msg = reason === 'inactivity'
      ? 'Sesión cerrada por inactividad.'
      : 'Su sesión expiró. Inicie sesión nuevamente.';
    setTimeout(() => UI.toast(msg, 'error'), 400);
  }
});
