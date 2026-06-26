/* TallerPro v3.0 — herramientas/descarga.js
   Página de descarga de la app: PWA, Android, Windows, iOS */
Modulos.descarga = {

  _WIN_URL: 'https://github.com/henrychinchilla/tallerpro.enterprise/releases/download/v3.0.0-win/TallerPro-Setup-3.0.0.exe',
  _APP_URL: 'https://tallerpro.cmtelecommgt.com',

  async render() {
    const el = document.getElementById('page-content');

    const esPWA      = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const esAndroid  = /android/i.test(navigator.userAgent);
    const esIOS      = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const esWindows  = /windows/i.test(navigator.userAgent);
    const tienePrompt = !!window._pwaPrompt;

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">📲 Descargar TallerPro</h1>
          <p class="page-subtitle">// Instala la app en tu dispositivo para acceso offline y mejor experiencia</p>
        </div>
      </div>
      <div class="page-body">

        ${esPWA ? `
        <div class="alert alert-green" style="margin-bottom:20px">
          <div class="alert-icon">✅</div>
          <div class="alert-body"><b>Ya estás usando la app instalada</b> — TallerPro corre en modo aplicación en este dispositivo.</div>
        </div>` : ''}

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px">

          <!-- ── PWA (Chrome / Edge) ── -->
          <div class="card" style="border:2px solid ${tienePrompt||esPWA?'var(--cyan)':'var(--border)'}">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
              <div style="font-size:36px">🌐</div>
              <div>
                <div style="font-weight:800;font-size:15px">Navegador (PWA)</div>
                <div style="font-size:11px;color:var(--text3)">Chrome · Edge · Brave · Samsung Internet</div>
              </div>
              <span class="badge badge-${tienePrompt?'cyan':'gray'}" style="margin-left:auto">${tienePrompt?'Listo':'Sin prompt'}</span>
            </div>
            <p style="font-size:12px;color:var(--text3);margin-bottom:14px">
              Instala TallerPro directamente desde tu navegador. Funciona sin conexión y carga más rápido que la web.
            </p>
            ${tienePrompt ? `
            <button class="btn btn-cyan" style="width:100%" onclick="App.instalarApp();Modulos.descarga.render()">
              📲 Instalar ahora
            </button>` : esPWA ? `
            <div class="alert" style="margin:0;background:var(--surface2);border:none;padding:10px 12px;border-radius:8px;font-size:12px">
              ✅ Ya instalada — abre el acceso directo en tu escritorio o pantalla de inicio.
            </div>` : `
            <div style="font-size:12px;color:var(--text3);background:var(--surface2);border-radius:8px;padding:10px 12px">
              Abre esta página en <b>Chrome o Edge</b> y aparecerá automáticamente el botón de instalación en la barra de direcciones (ícono ⊕).
            </div>`}
          </div>

          <!-- ── Android APK ── -->
          <div class="card" style="border:2px solid ${esAndroid?'var(--green)':'var(--border)'}">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
              <div style="font-size:36px">🤖</div>
              <div>
                <div style="font-weight:800;font-size:15px">Android</div>
                <div style="font-size:11px;color:var(--text3)">Android 8.0 o superior</div>
              </div>
              <span class="badge badge-amber" style="margin-left:auto">APK directa</span>
            </div>
            <p style="font-size:12px;color:var(--text3);margin-bottom:14px">
              Descarga e instala el APK directamente. La publicación en Google Play está en trámite — cuando esté disponible este botón se actualizará con el enlace oficial.
            </p>
            <a class="btn btn-green" style="width:100%;display:block;text-align:center;text-decoration:none" href="/tallerpro.apk" download="TallerPro.apk">
              ⬇️ Descargar APK (Android)
            </a>
            <div style="margin-top:10px;font-size:11px;color:var(--text3);background:var(--surface2);border-radius:8px;padding:8px 10px">
              <b>⚠️ Antes de instalar:</b> en tu teléfono ve a <i>Configuración → Seguridad → Fuentes desconocidas</i> y actívalo. Tamaño: ~462 KB.
            </div>
          </div>

          <!-- ── Windows ── -->
          <div class="card" style="border:2px solid ${esWindows?'var(--amber)':'var(--border)'}">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
              <div style="font-size:36px">🖥️</div>
              <div>
                <div style="font-weight:800;font-size:15px">Windows</div>
                <div style="font-size:11px;color:var(--text3)">Windows 10 / 11 (64-bit)</div>
              </div>
              <span class="badge badge-green" style="margin-left:auto">Instalador</span>
            </div>
            <p style="font-size:12px;color:var(--text3);margin-bottom:14px">
              Aplicación nativa para Windows. Instala desde el asistente, crea acceso directo en el Escritorio y el Menú Inicio, y aparece en Programas instalados.
            </p>
            <a class="btn btn-amber" style="width:100%;display:block;text-align:center;text-decoration:none;margin-bottom:10px"
               href="${this._WIN_URL}">
              ⬇️ Descargar TallerPro-Setup-3.0.0.exe (~76 MB)
            </a>
            <div style="font-size:11px;color:var(--text3);background:var(--surface2);border-radius:8px;padding:8px 10px">
              <b>ℹ️ SmartScreen:</b> Si Windows muestra "aplicación no reconocida", haz clic en <i>"Más información"</i> → <i>"Ejecutar de todas formas"</i>. Es normal para apps nuevas sin firma digital de Microsoft.
            </div>
          </div>

          <!-- ── iOS ── -->
          <div class="card" style="border:2px solid ${esIOS?'var(--amber)':'var(--border)'}; opacity:0.85">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
              <div style="font-size:36px">🍎</div>
              <div>
                <div style="font-weight:800;font-size:15px">iPhone / iPad</div>
                <div style="font-size:11px;color:var(--text3)">iOS 16 o superior</div>
              </div>
              <span class="badge badge-gray" style="margin-left:auto">Pendiente</span>
            </div>
            <p style="font-size:12px;color:var(--text3);margin-bottom:14px">
              La publicación en App Store está pendiente de cuenta de desarrollador Apple. Por ahora puedes agregar TallerPro a tu pantalla de inicio desde Safari.
            </p>
            ${esIOS ? `
            <button class="btn btn-amber" style="width:100%" onclick="App.instalarApp()">
              📲 Ver instrucciones para iOS
            </button>` : `
            <div style="font-size:12px;color:var(--text3);background:var(--surface2);border-radius:8px;padding:10px 12px">
              <b>Desde iPhone/iPad con Safari:</b><br>
              1. Toca el botón ⬆️ (Compartir)<br>
              2. Selecciona "Agregar a pantalla de inicio" ➕
            </div>`}
            <div style="margin-top:10px;font-size:11px;color:var(--text3);font-style:italic">
              App Store — próximamente cuando se complete el registro de desarrollador Apple.
            </div>
          </div>

        </div>

        <!-- Sección QR para móvil -->
        <div class="card" style="margin-top:20px;text-align:center">
          <div class="card-sub mb-3">📱 Acceder desde cualquier dispositivo</div>
          <p style="font-size:13px;color:var(--text3);margin-bottom:14px">
            Escanea el QR o comparte este enlace con tu equipo para acceder a TallerPro desde cualquier dispositivo.
          </p>
          <div style="display:flex;gap:20px;justify-content:center;align-items:center;flex-wrap:wrap">
            <div id="qr-descarga" style="background:#fff;padding:12px;border-radius:12px;display:inline-block"></div>
            <div style="text-align:left">
              <div style="font-size:13px;font-weight:700;margin-bottom:6px">URL de acceso:</div>
              <code style="font-size:12px;background:var(--surface2);padding:6px 12px;border-radius:6px;display:block;margin-bottom:10px">tallerpro.cmtelecommgt.com</code>
              <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('https://tallerpro.cmtelecommgt.com').then(()=>UI.toast('URL copiada ✓','success'))">
                📋 Copiar URL
              </button>
            </div>
          </div>
        </div>

      </div>`;

    /* Generar QR con la librería qrcode si está disponible */
    this._generarQR();
  },

  _generarQR() {
    const el = document.getElementById('qr-descarga');
    if (!el) return;
    const url = this._APP_URL;
    el.innerHTML = `<a href="${url}" target="_blank" style="display:block;font-size:10px;color:var(--text3);text-decoration:none;word-break:break-all;max-width:140px;text-align:center">
      <div style="font-size:48px;margin-bottom:4px">🔗</div>
      tallerpro.cmtelecommgt.com
    </a>`;
    if (typeof QRCode !== 'undefined') {
      el.innerHTML = '';
      new QRCode(el, { text: url, width: 120, height: 120, colorDark:'#000', colorLight:'#fff', correctLevel: QRCode.CorrectLevel.M });
    }
  }
};
