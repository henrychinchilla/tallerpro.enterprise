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
      <div class="empty-state-sm">⏳</div>${msg}</div>`;
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
      if (e.target === overlay) UI.cerrarModal();
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
