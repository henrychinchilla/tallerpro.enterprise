/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/app.js — Navegación y aplicación principal
═══════════════════════════════════════════════════════ */

const App = {
  paginaActual: 'dashboard',

  /* ── INICIAR APP ──────────────────────────────── */
  iniciar() {
    document.getElementById('login-screen')?.style.setProperty('display','none');
    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.add('visible');
    App.renderSidebar();
    App.navegarA('dashboard');
    App.checkLicencia();
    App.registrarSW();
    TEMAS.aplicar(localStorage.getItem('tp_tema') || 'dark');
  },

  /* ── SIDEBAR ──────────────────────────────────── */
  renderSidebar() {
    const rol = Auth.user?.rol || 'recepcionista';
    const puedeVer = m => {
      if (!Auth.user) return false;
      if (m.id === 'mi_ot') return rol === 'cliente';
      if (rol === 'superadmin' || rol === 'admin') return m.id !== 'mi_ot';
      return tieneAcceso(m.id);
    };

    const itemHtml = m => `
      <li class="nav-item ${App.paginaActual === m.id ? 'active' : ''}"
          onclick="App.navegarA('${m.id}')">
        <span class="nav-icon">${m.icon}</span>
        <span class="nav-label">${m.label}</span>
      </li>`;

    /* Render por grupos, en el orden definido en GRUPOS */
    const nav = GRUPOS.map(g => {
      const items = MODULOS.filter(m => m.grupo === g.id && puedeVer(m));
      if (!items.length) return '';
      const header = g.label
        ? `<li class="nav-group-label">${g.label}</li>` : '';
      return header + items.map(itemHtml).join('');
    }).join('');

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    /* Botón del asistente IA (oculto para el rol cliente) */
    const iaBtn = rol === 'cliente' ? '' : `
      <div class="sidebar-ia">
        <button class="btn-ia" onclick="IA.abrirChat()">
          <span class="btn-ia-icon">🔧</span>
          <span>Beto — Asistente</span>
        </button>
      </div>`;

    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <div class="sidebar-brand-name">TALLERPRO</div>
        <div class="sidebar-brand-sub">Enterprise v${APP.version}</div>
      </div>
      <div class="sidebar-tenant" onclick="App.toggleSidebar()">
        <div class="sidebar-tenant-name">${Auth.tenant?.name || 'TallerPro'}</div>
      </div>
      <nav class="sidebar-nav"><ul>${nav}</ul></nav>
      ${iaBtn}
      <div class="sidebar-user" id="sidebar-user" onclick="TEMAS.picker()" title="Cambiar tema">
        <span class="sidebar-user-avatar">${Auth.user?.avatar || '👤'}</span>
        <div class="sidebar-user-info">
          <div class="user-name">${Auth.user?.nombre || 'Usuario'}</div>
          <div class="user-role">${ROLES[Auth.user?.rol]?.label || ''}</div>
        </div>
        <span style="margin-left:auto;opacity:.5;font-size:14px">🎨</span>
      </div>
      <div class="sidebar-footer">
        <button class="btn btn-ghost btn-sm" onclick="App.cerrarSesion()" style="width:100%">
          ⏻ Cerrar sesión
        </button>
      </div>`;
  },

  /* ── NAVEGACIÓN ───────────────────────────────── */
  navegarA(pagina) {
    if (!Auth.user) return;
    const rol = Auth.user.rol;

    /* Verificar permisos */
    if (pagina !== 'mi_ot' && rol !== 'superadmin' && rol !== 'admin') {
      if (!tieneAcceso(pagina)) {
        UI.toast('Sin acceso a este módulo', 'error');
        return;
      }
    }

    App.paginaActual = pagina;
    App.renderSidebar();

    /* Cargar módulo */
    const modulo = window.Modulos?.[pagina];
    if (modulo?.render) {
      modulo.render();
    } else {
      const el = document.getElementById('page-content');
      if (el) el.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">🔧</div>
        <div>Módulo <b>${pagina}</b> cargando...</div>
      </div>`;
    }
  },

  /* ── CERRAR SESIÓN ────────────────────────────── */
  async cerrarSesion() {
    await Auth.logout();
    location.reload();
  },

  /* ── SIDEBAR TOGGLE MÓVIL ─────────────────────── */
  toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-overlay')?.classList.toggle('open');
  },

  /* ── LICENCIA ─────────────────────────────────── */
  checkLicencia() {
    const lic = Auth.licencia;
    if (!lic || lic.tipo === 'completa') return;
    const dias = lic.dias_restantes;
    if (dias === undefined || dias > 7) return;

    const banner = document.createElement('div');
    banner.id = 'lic-banner';
    banner.style.cssText = `position:fixed;bottom:0;left:0;right:0;z-index:999;
      background:${dias<=3?'var(--red)':'var(--amber)'};color:#000;
      padding:8px 16px;font-size:12px;font-weight:600;
      display:flex;align-items:center;justify-content:space-between;`;
    banner.innerHTML = `
      <span>⚠️ Demo: ${dias} día${dias===1?'':'s'} restante${dias===1?'':'s'}</span>
      <div style="display:flex;gap:8px">
        <button onclick="App.activarLicencia()"
          style="background:#000;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px">
          🔑 Activar
        </button>
        <button onclick="document.getElementById('lic-banner').remove()"
          style="background:none;border:none;cursor:pointer;font-size:16px">✕</button>
      </div>`;
    document.body.appendChild(banner);
  },

  activarLicencia() {
    UI.modal('🔑 Activar Licencia', `
      <div class="form-group">
        <label class="form-label">Código de Licencia</label>
        <input class="form-input" id="lic-code" placeholder="TALLERPRO-XXXX-XXXX"
               style="font-family:monospace;letter-spacing:2px;text-transform:uppercase">
      </div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:12px">
        Contacta a <a href="mailto:soporte@tallerpro.gt" style="color:var(--cyan)">soporte@tallerpro.gt</a>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="App._procesarLicencia()">Activar</button>
      </div>`
    );
  },

  async _procesarLicencia() {
    const codigo = document.getElementById('lic-code')?.value.trim().toUpperCase();
    if (!codigo) { UI.toast('Ingresa el código','error'); return; }
    const r = await DB.activarLicencia(codigo, Auth.user?.email);
    if (!r.ok) { UI.toast('Código inválido: '+r.error,'error'); return; }
    document.getElementById('lic-banner')?.remove();
    UI.cerrarModal();
    UI.toast('¡Licencia activada! ✓');
    Auth.licencia = { tipo:'completa' };
  },

  /* ── SERVICE WORKER ───────────────────────────── */
  registrarSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }
};

/* ── TEMAS ──────────────────────────────────────── */
const TEMAS = {
  lista: [
    { id:'dark',     icon:'🌙', label:'Oscuro'       },
    { id:'light',    icon:'☀️', label:'Claro'        },
    { id:'midnight', icon:'🌌', label:'Midnight'     },
    { id:'blue',     icon:'💙', label:'Ocean Navy'   },
    { id:'green',    icon:'🌿', label:'Forest'       },
    { id:'purple',   icon:'💜', label:'Purple Night' },
    { id:'red',      icon:'🔴', label:'Dark Red'     },
    { id:'slate',    icon:'🩶', label:'Slate'        }
  ],

  actual() { return localStorage.getItem('tp_tema') || 'dark'; },

  aplicar(id) {
    document.documentElement.setAttribute('data-theme',
      id === 'auto'
        ? (window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light')
        : id
    );
    localStorage.setItem('tp_tema', id);
  },

  picker() {
    const curr = TEMAS.actual();
    const items = TEMAS.lista.map(t => {
      const activo = curr === t.id;
      return `<button onclick="TEMAS.aplicar('${t.id}');UI.cerrarModal()"
        style="padding:14px 10px;border:2px solid ${activo?'var(--amber)':'var(--border)'};
               background:${activo?'var(--amber-dim)':'var(--surface2)'};border-radius:8px;
               cursor:pointer;color:${activo?'var(--amber)':'var(--text2)'};
               display:flex;flex-direction:column;align-items:center;gap:6px;font-family:inherit">
        <span style="font-size:24px">${t.icon}</span>
        <span style="font-size:11px;font-weight:700">${t.label}</span>
        ${activo?'<span style="font-size:9px;color:var(--amber)">✓ ACTIVO</span>':''}
      </button>`;
    }).join('');

    UI.modal('🎨 Tema de Colores', `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${items}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
      </div>`, '480px');
  }
};

/* Namespace de módulos */
window.Modulos = {};

/* ── Utilidades CSV compartidas (export / import) ──────────────── */

/* Escapa un valor para CSV (comillas, comas, saltos de línea) */
Modulos._csvCell = function (v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/* Descarga una matriz [[fila],[fila]] como archivo CSV (con BOM para Excel) */
Modulos._descargarCSV = function (rows, filename) {
  const csv = rows.map(r => r.map(Modulos._csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/* Parser CSV tolerante (comillas, comas y saltos dentro de celdas) */
Modulos._parseCSV = function (text) {
  text = text.replace(/^﻿/, '');           // quitar BOM
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(x => x !== '')) rows.push(row); }
  return rows;
};

/* ── Botones de acción ESTANDARIZADOS (Ver/Editar/Imprimir/Eliminar) ──
   Misma iconografía, color y orden en todos los módulos.
   Uso: ${Modulos.btnAccion('editar', `Modulos.x.modalForm('${id}')`)} */
Modulos.btnAccion = function (tipo, onclick, opts = {}) {
  const stop = opts.stop !== false;   // por defecto frena la propagación (filas clickeables)
  const map = {
    ver:      ['btn-cyan',   '👁 Ver',    'Ver'],
    editar:   ['btn-cyan',   '✏️ Editar', 'Editar'],
    imprimir: ['btn-ghost',  '🖨️',        'Imprimir'],
    eliminar: ['btn-danger', '🗑️',        'Eliminar'],
  };
  const [cls, label, title] = map[tipo] || ['btn-ghost', tipo, tipo];
  const handler = stop ? `event.stopPropagation();${onclick}` : onclick;
  return `<button class="btn btn-sm ${cls}" title="${opts.titulo || title}" onclick="${handler}">${opts.label || label}</button>`;
};

/* Eliminar genérico con confirmación (tenant-scoped vía RLS). cb refresca la vista. */
Modulos.eliminarRegistro = async function (tabla, id, nombre, cb) {
  const ok = await UI.confirmar(
    `¿Eliminar <b>${nombre || 'este registro'}</b>? Esta acción no se puede deshacer.`,
    'Eliminar'
  );
  if (!ok) return;
  const exito = await DB.deleteRegistro(tabla, id);
  if (exito) { UI.toast('Eliminado ✓'); if (cb) cb(); }
  else UI.toast('No se pudo eliminar (puede tener registros relacionados)', 'error');
};

/* Abre un selector de archivo .csv y entrega las filas parseadas al callback */
Modulos._importarCSV = function (onRows) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const filas = Modulos._parseCSV(String(reader.result));
        if (filas.length < 2) { UI.toast('El CSV no tiene datos', 'error'); return; }
        onRows(filas);
      } catch (e) {
        UI.toast('No se pudo leer el CSV: ' + e.message, 'error');
      }
    };
    reader.readAsText(file, 'utf-8');
  };
  input.click();
};
