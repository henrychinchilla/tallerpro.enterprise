/* ═══════════════════════════════════════════════════════════════
   TallerPro Enterprise — Sistema de Versiones
   Actualizar APP_VERSION en cada release
═══════════════════════════════════════════════════════════════ */

const APP_VERSION = {
  version:    '2.1.0',
  build:      '20260507',
  codename:   'Quetzal',          /* Nombre del release */
  stage:      'production',       /* development | staging | production */

  /* Historial de versiones */
  changelog: [
    {
      version: '2.1.0',
      date:    '2026-05-07',
      changes: [
        'Sistema de usuarios sin envío de correo',
        'Contraseña temporal con cambio obligatorio en primer login',
        'PWA optimizada para Android y Windows',
        'Service Worker con caché inteligente',
        'Fix gestión de usuarios — botón funcionando',
        'Grid de fondo eliminado en todos los temas',
        'Botón Editar en vehículos',
        'Estado inline en facturas FEL'
      ]
    },
    {
      version: '2.0.0',
      date:    '2026-04-01',
      changes: [
        'Multi-tenant real — aislamiento completo por taller',
        'Sistema de licencias demo (30 días)',
        'ISR Guatemala 2026 — Decreto 13-2026',
        'Salario mínimo Q4,002.28 en formulario de empleados',
        '9 temas de color',
        'Importación masiva de viáticos por Excel',
        'Fotos de recepción en órdenes de trabajo'
      ]
    },
    {
      version: '1.0.0',
      date:    '2025-01-01',
      changes: [
        'Lanzamiento inicial',
        'Módulos: Dashboard, Clientes, Vehículos, OTs, Inventario',
        'Facturación FEL (INFILE)',
        'RRHH & Nómina Guatemala',
        'Finanzas — Estado de Resultados'
      ]
    }
  ],

  /* Muestra badge de versión en el sidebar */
  renderBadge() {
    const el = document.getElementById('app-version-badge');
    if (el) el.textContent = `Enterprise v${this.version}`;
  },

  /* Muestra modal con changelog */
  mostrarChangelog() {
    const logs = this.changelog.map(v => `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:700;color:var(--amber);font-size:14px">v${v.version} — ${v.codename||''}</span>
          <span style="font-size:11px;color:var(--text3)">${v.date}</span>
        </div>
        <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text2);line-height:1.8">
          ${v.changes.map(c => `<li>${c}</li>`).join('')}
        </ul>
      </div>
    `).join('<hr style="border-color:var(--border);margin:12px 0">');

    UI.openModal(`📋 TallerPro v${this.version} — ${this.codename}`, `
      <div style="max-height:70vh;overflow-y:auto;padding-right:4px">
        ${logs}
      </div>
      <div class="modal-footer">
        <span style="font-size:11px;color:var(--text3)">Build ${this.build} · ${this.stage}</span>
        <button class="btn btn-ghost" onclick="UI.closeModal()">Cerrar</button>
      </div>
    `, 'modal-lg');
  },

  /* Verificar si hay actualización disponible via Service Worker */
  async checkUpdate() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.update();

      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            /* Nueva versión disponible */
            APP_VERSION.mostrarBannerActualizacion(newSW);
          }
        });
      });
    } catch(e) { /* silencioso */ }
  },

  mostrarBannerActualizacion(newSW) {
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:9999;
      background:var(--amber);color:#000;
      padding:10px 20px;display:flex;align-items:center;justify-content:space-between;
      font-family:'Manrope',sans-serif;font-size:13px;font-weight:600;
    `;
    banner.innerHTML = `
      <span>🔄 Nueva versión disponible</span>
      <div style="display:flex;gap:8px">
        <button onclick="document.getElementById('update-banner').remove()"
          style="background:rgba(0,0,0,0.2);border:none;padding:4px 12px;border-radius:4px;cursor:pointer;color:#000;font-weight:700">
          Más tarde
        </button>
        <button onclick="APP_VERSION.aplicarActualizacion()"
          style="background:#000;color:#F59E0B;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-weight:700">
          Actualizar ahora
        </button>
      </div>`;
    document.body.prepend(banner);
    APP_VERSION._pendingSW = newSW;
  },

  aplicarActualizacion() {
    if (APP_VERSION._pendingSW) {
      APP_VERSION._pendingSW.postMessage('SKIP_WAITING');
    }
    window.location.reload();
  }
};

/* Verificar actualizaciones al cargar */
window.addEventListener('load', () => {
  APP_VERSION.renderBadge();
  setTimeout(() => APP_VERSION.checkUpdate(), 3000);
});
