/* ═══════════════════════════════════════════════════════
   ui.js — Helpers de UI: Toast, Modal, Badges, Formatos
   TallerPro Enterprise v2.0
═══════════════════════════════════════════════════════ */

const UI = {

  /* ── TOAST ─────────────────────────────────────── */
  toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    if (el) el.remove();

    const colors = {
      success: 'var(--green)',
      error:   'var(--red)',
      info:    'var(--cyan)',
      warn:    'var(--amber)'
    };
    const color = colors[type] || colors.success;

    const t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = `border:1px solid ${color};border-left:3px solid ${color}`;
    t.textContent = msg;
    document.body.appendChild(t);

    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 300);
    }, 3000);
  },

  /* ── MODAL ──────────────────────────────────────── */
  openModal(title, body, size = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML    = body;
    const box = document.getElementById('modal-box');
    box.className = 'modal anim-scalein' + (size ? ' ' + size : '');
    document.getElementById('modal-overlay').classList.add('open');
  },

  closeModal(e) {
    if (e && e.target !== document.getElementById('modal-overlay')) return;
    document.getElementById('modal-overlay').classList.remove('open');
  },

  /* ── BADGE DE ESTADO OT ─────────────────────────── */
  estadoBadge(estado) {
    const s = ESTADOS_OT[estado] || { label: estado, color: 'gray' };
    return `<span class="badge badge-${s.color}">${s.label}</span>`;
  },

  /* ── PRIORIDAD DOT ──────────────────────────────── */
  prioDot(prioridad) {
    return `<span class="prio-dot prio-${prioridad}" title="Prioridad ${prioridad}"></span>`;
  },

  /* ── FORMATO MONEDA ─────────────────────────────── */
  q(num) {
    return 'Q' + Number(num).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /* ── SELECT DE ESTADOS OT ───────────────────────── */
  estadoSelect(actual, onchange) {
    const opts = Object.entries(ESTADOS_OT)
      .map(([k, v]) => `<option value="${k}"${actual === k ? ' selected' : ''}>${v.label}</option>`)
      .join('');
    return `<select class="filter-select" onchange="${onchange}">${opts}</select>`;
  },

  /* ── CONFIRM SENCILLO ───────────────────────────── */
  confirm(msg, onYes) {
    UI.openModal('Confirmar acción',
      `<p style="color:var(--text2);font-size:14px;margin-bottom:20px">${msg}</p>
       <div class="modal-footer">
         <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
         <button class="btn btn-danger" onclick="UI.closeModal();(${onYes})()">Confirmar</button>
       </div>`
    );
  }
};

/* Alias global para compatibilidad con atributos onclick en HTML */
function openModal(t, b, s)  { UI.openModal(t, b, s); }
function closeModal(e)       { UI.closeModal(e); }
function showToast(m, t)     { UI.toast(m, t); }

/* ── TOGGLE PASS VISIBILITY ───────────────────────── */
UI._togglePass = function (inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.textContent = '🙈';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = '👁';
  }
};

/* ══════════════════════════════════════════════════════
   ENTER KEY — Submit forms on Enter press
   Escucha Enter en cualquier input dentro de un modal
   y llama al botón btn-amber (guardar) si existe.
══════════════════════════════════════════════════════ */
(function initEnterKey() {
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;

    const tag = document.activeElement?.tagName?.toLowerCase();
    // No hacer nada en textarea, select, botones
    if (['textarea','button','select'].includes(tag)) return;

    // Solo si el overlay modal está abierto
    const overlay = document.getElementById('modal-overlay');
    if (!overlay || !overlay.classList.contains('open')) return;

    const isInsideModal = overlay.contains(document.activeElement);
    if (!isInsideModal) return;

    // Encontrar el botón primario (btn-amber) dentro del modal footer
    const saveBtn = overlay.querySelector('.modal-footer .btn-amber:not([disabled])');
    if (saveBtn) {
      e.preventDefault();
      saveBtn.click();
    }
  }, true);
})();
