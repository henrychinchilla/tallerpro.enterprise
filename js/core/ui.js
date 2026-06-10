/* ═══════════════════════════════════════════════════════
   TallerPro Enterprise v3.0
   js/core/ui.js — Utilidades de interfaz
═══════════════════════════════════════════════════════ */

const UI = {

  /* ── TOAST ────────────────────────────────────── */
  toast(msg, tipo='success', duracion=3000) {
    const tipos = ['success', 'error', 'warn', 'info'];
    const t = document.createElement('div');
    t.className = `toast toast-${tipos.includes(tipo) ? tipo : 'success'}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), duracion);
  },

  /* ── MODAL ────────────────────────────────────── */
  modal(titulo, contenido, ancho='520px') {
    document.getElementById('modal-overlay').classList.add('open');
    document.getElementById('modal-titulo').textContent = titulo;
    document.getElementById('modal-body').innerHTML = contenido;
    document.getElementById('modal-box').style.maxWidth = ancho;
  },

  cerrarModal() {
    document.getElementById('modal-overlay').classList.remove('open');
  },

  /* Cierre "suave": si hay un formulario en el modal, NO cierra al hacer
     click afuera ni con Escape — evita perder lo escrito. Para cerrar de
     verdad se usan los botones Cancelar / ✕ (que llaman a cerrarModal). */
  intentarCerrarModal() {
    const body = document.getElementById('modal-body');
    const tieneForm = body && body.querySelector('input, textarea, select');
    if (tieneForm) {
      const box = document.getElementById('modal-box');
      if (box) { box.classList.remove('modal-shake'); void box.offsetWidth; box.classList.add('modal-shake'); }
      UI.toast('Guarda o cancela los cambios primero', 'warn');
      return;
    }
    UI.cerrarModal();
  },

  /* ── CONFIRMAR ────────────────────────────────── */
  async confirmar(msg, accion) {
    return new Promise(resolve => {
      UI.modal('⚠️ Confirmar acción', `
        <div class="alert alert-amber" style="margin-bottom:16px">
          <div class="alert-icon">⚠️</div>
          <div class="alert-body">${msg}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.cerrarModal();_resolveConfirm(false)">Cancelar</button>
          <button class="btn btn-danger" onclick="UI.cerrarModal();_resolveConfirm(true)">${accion||'Confirmar'}</button>
        </div>`
      );
      window._resolveConfirm = resolve;
    });
  },

  /* ── FORMATOS ─────────────────────────────────── */
  q(n) {
    return 'Q' + (n||0).toLocaleString('es-GT', { minimumFractionDigits:2, maximumFractionDigits:2 });
  },

  fecha(f) {
    if (!f) return '—';
    return new Date(f+'T12:00:00').toLocaleDateString('es-GT');
  },

  fechaHora(f) {
    if (!f) return '—';
    return new Date(f).toLocaleString('es-GT');
  },

  /* ── BADGE ESTADO ─────────────────────────────── */
  badge(estado) {
    const e = ESTADOS_OT[estado] || { label:estado, color:'gray' };
    return `<span class="badge badge-${e.color}">${e.label}</span>`;
  },

  /* ── TOGGLE PASSWORD ──────────────────────────── */
  togglePass(inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    if (btn) btn.textContent = inp.type === 'password' ? '👁' : '🙈';
  },

  /* ── LOADER ───────────────────────────────────── */
  loading(el, msg='Cargando...') {
    if (!el) return;
    el.innerHTML = `<div class="empty-state">
      <div class="spinner"></div>${msg}</div>`;
  },

  /* ── ERROR ────────────────────────────────────── */
  /* Muestra un toast de error y lo registra en consola con contexto.
     Útil para que los fallos de la capa de datos no pasen en silencio. */
  error(msg, err=null, contexto='') {
    if (err) console.error(`[${contexto||'error'}]`, err);
    UI.toast(msg || 'Ocurrió un error', 'error');
  },

  /* ── ESTADO VACÍO ─────────────────────────────── */
  vacio(icono='📭', titulo='Sin datos', subtitulo='') {
    return `<div class="empty-state empty-state-lg">
      <div class="empty-state-icon">${icono}</div>
      <div style="font-weight:700;margin-bottom:4px">${titulo}</div>
      ${subtitulo ? `<div class="text-muted" style="font-size:12px">${subtitulo}</div>` : ''}
    </div>`;
  }
};

/* Cerrar modal al click en overlay */
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) UI.intentarCerrarModal();
    });
  }
});

/* ── BOUNDARY GLOBAL DE ERRORES ─────────────────────
   Evita que los fallos pasen en silencio: cualquier promesa
   rechazada sin manejar muestra un aviso discreto y queda en consola. */
window.addEventListener('unhandledrejection', e => {
  const msg = e.reason?.message || String(e.reason || '');
  console.error('[unhandledrejection]', e.reason);
  /* Ignorar ruido conocido (extensiones, abortos de fetch) */
  if (/abort|cancell?ed|extension/i.test(msg)) return;
  if (window.UI) UI.toast('Algo falló. Revisa tu conexión e inténtalo de nuevo', 'error');
});

window.addEventListener('error', e => {
  if (e.error) console.error('[window.error]', e.error);
});

/* ── ORDENAMIENTO UNIVERSAL DE TABLAS ──────────────────
   Click en cualquier <th> de una .data-table ordena por esa
   columna (asc ⇄ desc). Detecta montos (Q1,234.56), números,
   porcentajes y fechas (dd/mm/yyyy o yyyy-mm-dd); el resto se
   ordena como texto. Las filas con colspan (estados vacíos,
   totales) se mantienen al final. Aplica a TODOS los módulos
   sin tocarlos: delegación global. */
UI._sortVal = (td) => {
  const t = (td?.textContent || '').trim();
  if (!t || t === '—') return { n: null, t: '' };
  const num = t.replace(/[Qq$%\s,]/g, '');
  if (num && !isNaN(num)) return { n: parseFloat(num), t };
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return { n: +(new Date(+m[3], +m[2] - 1, +m[1])), t };
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return { n: +(new Date(t.slice(0, 10))), t };
  return { n: null, t: t.toLowerCase() };
};

document.addEventListener('click', (e) => {
  const th = e.target.closest('.data-table th');
  if (!th || e.target.closest('button, a, input, select')) return;
  const table = th.closest('table');
  const tbody = table?.tBodies[0];
  if (!tbody || tbody.rows.length < 2) return;
  const idx = Array.prototype.indexOf.call(th.parentNode.children, th);

  const filas = Array.from(tbody.rows);
  /* columna de acciones (mayoría de celdas con botones): no ordenar */
  const conBtn = filas.filter(r => r.cells[idx]?.querySelector('button, .btn')).length;
  if (conBtn > filas.length / 2) return;

  const dir = th.classList.contains('th-asc') ? -1 : 1;
  table.querySelectorAll('th').forEach(h => h.classList.remove('th-asc', 'th-desc'));
  th.classList.add(dir === 1 ? 'th-asc' : 'th-desc');

  const fijas = [], movibles = [];
  for (const r of filas) {
    if (!r.cells[idx] || Array.from(r.cells).some(c => c.colSpan > 1)) fijas.push(r);
    else movibles.push(r);
  }
  movibles.sort((a, b) => {
    const va = UI._sortVal(a.cells[idx]), vb = UI._sortVal(b.cells[idx]);
    if (va.n !== null && vb.n !== null) return (va.n - vb.n) * dir;
    if (va.n !== null) return -1 * dir;
    if (vb.n !== null) return 1 * dir;
    return va.t.localeCompare(vb.t, 'es') * dir;
  });
  movibles.forEach(r => tbody.appendChild(r));
  fijas.forEach(r => tbody.appendChild(r));
});
