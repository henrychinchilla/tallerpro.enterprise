/* ═══════════════════════════════════════════════════════
   modules/database.js — Gestión de Base de Datos
   TallerPro Enterprise v2.0

   Funciones:
   - Exportar BD cifrada (AES-256 via WebCrypto)
   - Importar BD cifrada
   - Borrado total con OTP por email
   - Temporización de actividad por días/horas
   - Modo soporte (activa Super Admin)
═══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   MÓDULO DATABASE
══════════════════════════════════════════════════════ */
Pages.database = async function () {
  if (!['admin','superadmin'].includes(Auth.user?.rol)) {
    UI.toast('Acceso denegado', 'error');
    App.navigate('dashboard');
    return;
  }

  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Base de Datos</h1></div>
    <div class="page-body"><div class="text-muted">Cargando...</div></div>`;

  const config = DB_ADMIN.getTimerConfig();

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">🗄️ Gestión de Base de Datos</h1>
        <p class="page-subtitle">// OPERACIONES AVANZADAS · ADMINISTRADORES</p>
      </div>
    </div>
    <div class="page-body">

      <!-- Alerta seguridad -->
      <div class="alert alert-red" style="margin-bottom:20px">
        <div class="alert-icon">⚠️</div>
        <div>
          <div class="alert-title">Zona de Alto Riesgo</div>
          <div class="alert-body">Las operaciones en esta sección son irreversibles. Todas las acciones quedan registradas.</div>
        </div>
      </div>

      <div class="grid-2">
        <!-- EXPORTAR -->
        <div class="card card-cyan">
          <div class="card-sub mb-3">📤 Exportar Base de Datos</div>
          <p style="font-size:13px;color:var(--text2);margin-bottom:16px">
            Descarga una copia cifrada de todos los datos. Solo puede descifrarse con la clave del taller.
          </p>
          <div class="form-group">
            <label class="form-label">Clave de Cifrado</label>
            <input class="form-input" id="exp-clave" type="password"
                   placeholder="Contraseña para cifrar el backup">
          </div>
          <div class="form-group">
            <label class="form-label">Confirmar Clave</label>
            <input class="form-input" id="exp-clave2" type="password"
                   placeholder="Repetir contraseña">
          </div>
          <div class="form-group">
            <label class="form-label">Tablas a exportar</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              ${['clientes','vehiculos','ordenes','inventario','proveedores',
                 'empleados','facturas','ingresos','egresos','citas'].map(t=>
                `<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
                  <input type="checkbox" name="exp-tabla" value="${t}" checked> ${t}
                </label>`).join('')}
            </div>
          </div>
          <button class="btn btn-cyan" style="width:100%" onclick="DB_ADMIN.exportar()">
            📥 Exportar y Descargar
          </button>
        </div>

        <!-- IMPORTAR -->
        <div class="card card-amber">
          <div class="card-sub mb-3">📂 Importar Base de Datos</div>
          <div class="alert alert-red" style="margin-bottom:12px">
            <div class="alert-icon">🔴</div>
            <div class="alert-body" style="font-size:12px">
              La importación requiere un <b>código OTP</b> de administrador enviado por email.
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Archivo de backup (.tpdb)</label>
            <input type="file" class="form-input" id="imp-file" accept=".tpdb,.json">
          </div>
          <div class="form-group">
            <label class="form-label">Clave de Descifrado</label>
            <input class="form-input" id="imp-clave" type="password" placeholder="Contraseña del backup">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Código OTP Admin</label>
              <input class="form-input" id="imp-otp" placeholder="6 dígitos" maxlength="6">
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end">
              <button class="btn btn-ghost btn-sm" style="width:100%" onclick="DB_ADMIN.solicitarOTP('importar')">
                📧 Solicitar OTP
              </button>
            </div>
          </div>
          <button class="btn btn-amber" style="width:100%" onclick="DB_ADMIN.importar()">
            📤 Importar Base de Datos
          </button>
        </div>
      </div>

      <!-- BORRAR BASE DE DATOS -->
      <div class="card" style="border:2px solid var(--red);margin-top:20px">
        <div class="card-sub mb-3" style="color:var(--red)">🔴 Borrar Base de Datos</div>
        <div class="alert alert-red" style="margin-bottom:16px">
          <div class="alert-icon">💀</div>
          <div>
            <div class="alert-title">ADVERTENCIA: Esta acción es PERMANENTE e IRREVERSIBLE</div>
            <div class="alert-body">Elimina TODOS los datos del tenant. Recomendamos exportar primero.</div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Código OTP de Administrador</label>
            <input class="form-input" id="del-otp" placeholder="Solicita el código primero" maxlength="6">
          </div>
          <div class="form-group" style="display:flex;align-items:flex-end">
            <button class="btn btn-ghost btn-sm" style="width:100%" onclick="DB_ADMIN.solicitarOTP('borrar')">
              📧 Solicitar Código OTP
            </button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" style="color:var(--red)">
            Para confirmar, escribe exactamente: <b>BORRAR BASE DE DATOS</b>
          </label>
          <input class="form-input" id="del-confirm" placeholder="BORRAR BASE DE DATOS"
                 style="border-color:var(--red-border)">
        </div>
        <button class="btn btn-danger" style="width:100%" onclick="DB_ADMIN.borrarTodo()">
          💀 Borrar Todo — Acción Irreversible
        </button>
      </div>

      <!-- TEMPORIZACIÓN DE ACTIVIDAD -->
      <div class="card card-purple mt-5">
        <div class="card-sub mb-4">⏱️ Temporización de Actividad y Sesiones</div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tiempo de inactividad antes de cerrar sesión</label>
            <select class="form-select" id="timer-inactividad">
              ${[5,10,15,30,60,120,240].map(m=>
                `<option value="${m}" ${config.inactividad===m?'selected':''}>${m} minutos</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Acción al detectar inactividad</label>
            <select class="form-select" id="timer-accion">
              <option value="logout"  ${config.accion==='logout' ?'selected':''}>Cerrar sesión</option>
              <option value="lock"    ${config.accion==='lock'   ?'selected':''}>Bloquear pantalla</option>
              <option value="warning" ${config.accion==='warning'?'selected':''}>Solo advertir</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Horario de operación permitido</label>
          <div class="form-row" style="align-items:center;gap:12px">
            <div class="form-group">
              <label class="form-label" style="font-size:11px">Desde</label>
              <input class="form-input" id="timer-hora-inicio" type="time" value="${config.horaInicio||'07:00'}">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size:11px">Hasta</label>
              <input class="form-input" id="timer-hora-fin" type="time" value="${config.horaFin||'20:00'}">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size:11px">
                <input type="checkbox" id="timer-horario-activo" ${config.horarioActivo?'checked':''} style="margin-right:4px">
                Aplicar restricción de horario
              </label>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Días de operación permitidos</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
            ${[['dom','DOM'],['lun','LUN'],['mar','MAR'],['mie','MIÉ'],['jue','JUE'],['vie','VIE'],['sab','SÁB']].map(([k,l])=>
              `<label style="display:flex;align-items:center;gap:4px;padding:6px 12px;
                      background:${(config.dias||['lun','mar','mie','jue','vie']).includes(k)?'var(--amber-dim)':'var(--surface2)'};
                      border:1px solid ${(config.dias||['lun','mar','mie','jue','vie']).includes(k)?'var(--amber-border)':'var(--border)'};
                      border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;
                      color:${(config.dias||['lun','mar','mie','jue','vie']).includes(k)?'var(--amber)':'var(--text2)'}">
                <input type="checkbox" name="timer-dia" value="${k}"
                       ${(config.dias||['lun','mar','mie','jue','vie']).includes(k)?'checked':''} style="display:none">
                ${l}
              </label>`).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">
            <input type="checkbox" id="timer-fuera-redirigir" ${config.fueraRedirigir?'checked':''} style="margin-right:8px">
            Redirigir a login automáticamente fuera de horario
          </label>
        </div>

        <button class="btn btn-amber" onclick="DB_ADMIN.guardarTimerConfig()">
          ⏱️ Guardar Configuración de Temporización
        </button>
      </div>

    </div>`;

  // Hacer que los checkboxes de días sean tipo toggle visual
  document.querySelectorAll('input[name="timer-dia"]').forEach(cb => {
    cb.closest('label').addEventListener('click', function () {
      const input = this.querySelector('input[type="checkbox"]');
      setTimeout(() => {
        const checked = input.checked;
        this.style.background    = checked ? 'var(--amber-dim)' : 'var(--surface2)';
        this.style.borderColor   = checked ? 'var(--amber-border)' : 'var(--border)';
        this.style.color         = checked ? 'var(--amber)' : 'var(--text2)';
      }, 10);
    });
  });
};

/* ══════════════════════════════════════════════════════
   DB_ADMIN — Motor de operaciones
══════════════════════════════════════════════════════ */
const DB_ADMIN = {

  /* OTP en memoria (sesión) */
  _otp:        null,
  _otpProposo: null,  // 'borrar' | 'importar'
  _otpExpira:  null,

  /* ── GENERAR Y ENVIAR OTP ─────────────────────────── */
  async solicitarOTP(proposito) {
    const otp     = String(Math.floor(100000 + Math.random() * 900000));
    const expira  = Date.now() + 10 * 60 * 1000; // 10 minutos
    DB_ADMIN._otp        = otp;
    DB_ADMIN._otpProposito = proposito;
    DB_ADMIN._otpExpira  = expira;

    const adminEmail = Auth.tenant?.email || Auth.user?.email;
    const accion     = proposito === 'borrar' ? 'BORRAR BASE DE DATOS' : 'IMPORTAR BASE DE DATOS';

    /* Enviar por email (simulado en dev) */
    await NOTIF.sendEmail(
      adminEmail || 'admin@tallerpro.gt',
      `🔐 Código OTP — ${accion} | TallerPro`,
      `<h2 style="color:#ef4444">Código OTP de Seguridad</h2>
       <p>Se solicitó un código de verificación para: <b>${accion}</b></p>
       <div style="background:#f3f4f6;border:2px solid #000;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
         <span style="font-family:monospace;font-size:36px;font-weight:bold;letter-spacing:12px">${otp}</span>
       </div>
       <p><b>⏰ Este código vence en 10 minutos.</b></p>
       <p>Si no solicitaste este código, ignora este mensaje e informa al administrador del sistema.</p>
       <p style="color:#666;font-size:11px">IP: ${navigator.platform} · ${new Date().toLocaleString('es-GT')}</p>
       <p><b>${Auth.tenant?.name} — TallerPro Enterprise</b></p>`
    );

    UI.toast(`Código OTP enviado al correo del administrador ✓ (válido 10 min)`, 'info');

    /* En modo dev también mostramos el código */
    if (NOTIF.config.modo_dev || !NOTIF.config.sendgrid_key) {
      setTimeout(() => {
        UI.openModal('🔐 Código OTP (Modo Dev)', `
          <div style="text-align:center;padding:20px">
            <div class="alert alert-amber mb-4">
              <div class="alert-icon">⚠️</div>
              <div><div class="alert-title">Modo Desarrollo</div>
              <div class="alert-body">En producción este código SOLO llega al email del admin.</div></div>
            </div>
            <div style="font-family:'DM Mono',monospace;font-size:48px;font-weight:700;
                        letter-spacing:14px;color:var(--amber);padding:24px;
                        background:var(--surface2);border-radius:8px;border:2px solid var(--amber-border)">
              ${otp}
            </div>
            <div class="text-muted mt-3" style="font-size:12px">Proposito: ${accion}</div>
            <div class="text-muted" style="font-size:11px">Vence: ${new Date(expira).toLocaleTimeString('es-GT')}</div>
            <div class="modal-footer" style="justify-content:center;margin-top:16px">
              <button class="btn btn-amber" onclick="UI.closeModal()">Entendido</button>
            </div>
          </div>`
        );
      }, 1000);
    }
  },

  /* ── VERIFICAR OTP ────────────────────────────────── */
  verificarOTP(inputId, proposito) {
    const ingresado = document.getElementById(inputId)?.value.trim();
    if (!DB_ADMIN._otp) {
      UI.toast('Solicita primero el código OTP', 'error'); return false;
    }
    if (Date.now() > DB_ADMIN._otpExpira) {
      DB_ADMIN._otp = null;
      UI.toast('El código OTP ha expirado. Solicita uno nuevo.', 'error'); return false;
    }
    if (DB_ADMIN._otpProposito !== proposito) {
      UI.toast('Este código es para otra operación.', 'error'); return false;
    }
    if (ingresado !== DB_ADMIN._otp) {
      UI.toast('Código OTP incorrecto.', 'error'); return false;
    }
    return true;
  },

  /* ── EXPORTAR (WebCrypto AES-GCM) ────────────────── */
  async exportar() {
    const clave  = document.getElementById('exp-clave')?.value;
    const clave2 = document.getElementById('exp-clave2')?.value;
    if (!clave)         { UI.toast('Ingresa una clave de cifrado', 'error'); return; }
    if (clave !== clave2){ UI.toast('Las claves no coinciden', 'error'); return; }
    if (clave.length < 8){ UI.toast('La clave debe tener al menos 8 caracteres', 'error'); return; }

    const tablas = [...document.querySelectorAll('input[name="exp-tabla"]:checked')].map(cb=>cb.value);
    if (!tablas.length) { UI.toast('Selecciona al menos una tabla', 'error'); return; }

    UI.toast('Exportando datos...', 'info');

    try {
      /* Cargar datos */
      const snapshot = { version: '2.0', tenant: Auth.tenant?.slug, timestamp: new Date().toISOString(), tablas: {} };

      const LOADERS = {
        clientes:    () => DB.getClientes(),
        vehiculos:   () => DB.getVehiculos(),
        ordenes:     () => DB.getOrdenes(),
        inventario:  () => DB.getInventario(),
        proveedores: () => DB.getProveedores(),
        empleados:   () => DB.getEmpleados(),
        facturas:    () => DB.getFacturas(),
        ingresos:    () => DB.getIngresos(),
        egresos:     () => DB.getEgresos(),
        citas:       () => DB.getCitas()
      };

      for (const tabla of tablas) {
        if (LOADERS[tabla]) snapshot.tablas[tabla] = await LOADERS[tabla]();
      }

      const jsonStr = JSON.stringify(snapshot, null, 2);

      /* Cifrar con AES-GCM */
      const enc      = new TextEncoder();
      const keyMat   = await crypto.subtle.importKey('raw', enc.encode(clave.padEnd(32,'0').slice(0,32)), 'AES-GCM', false, ['encrypt']);
      const iv       = crypto.getRandomValues(new Uint8Array(12));
      const cifrado  = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, keyMat, enc.encode(jsonStr));

      /* Combinar IV + datos cifrados */
      const resultado = new Uint8Array(iv.byteLength + cifrado.byteLength);
      resultado.set(iv, 0);
      resultado.set(new Uint8Array(cifrado), iv.byteLength);

      /* Descargar */
      const blob = new Blob([resultado], { type: 'application/octet-stream' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const fecha= new Date().toISOString().slice(0,10);
      a.href     = url;
      a.download = `tallerpro_backup_${Auth.tenant?.slug||'taller'}_${fecha}.tpdb`;
      a.click();
      URL.revokeObjectURL(url);

      UI.toast(`Base de datos exportada y cifrada ✓ (${tablas.length} tablas)`);
    } catch(err) {
      UI.toast('Error al exportar: ' + err.message, 'error');
      console.error('Export error:', err);
    }
  },

  /* ── IMPORTAR ─────────────────────────────────────── */
  async importar() {
    if (!DB_ADMIN.verificarOTP('imp-otp', 'importar')) return;

    const file  = document.getElementById('imp-file')?.files[0];
    const clave = document.getElementById('imp-clave')?.value;
    if (!file)  { UI.toast('Selecciona un archivo .tpdb', 'error'); return; }
    if (!clave) { UI.toast('Ingresa la clave de descifrado', 'error'); return; }

    UI.confirm(`¿Importar la base de datos? Esto <b>sobreescribirá los datos actuales</b>. Esta acción no se puede deshacer.`, async () => {
      try {
        UI.toast('Descifrando...', 'info');
        const buf   = await file.arrayBuffer();
        const data  = new Uint8Array(buf);
        const iv    = data.slice(0, 12);
        const cifrado= data.slice(12);

        const enc    = new TextEncoder();
        const keyMat = await crypto.subtle.importKey('raw', enc.encode(clave.padEnd(32,'0').slice(0,32)), 'AES-GCM', false, ['decrypt']);

        let decrypted;
        try {
          decrypted = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, keyMat, cifrado);
        } catch {
          UI.toast('Clave incorrecta o archivo corrupto', 'error');
          UI.closeModal();
          return;
        }

        const snapshot = JSON.parse(new TextDecoder().decode(decrypted));
        UI.toast(`Importando ${Object.keys(snapshot.tablas).length} tablas...`, 'info');

        /* Restaurar datos tabla por tabla */
        let importados = 0;
        const tenantId = await getTenantId();

        for (const [tabla, filas] of Object.entries(snapshot.tablas)) {
          if (!Array.isArray(filas) || !filas.length) continue;
          const payload = filas.map(f => ({ ...f, tenant_id: tenantId }));
          await getSupabase().from(tabla).upsert(payload, { onConflict: 'id' });
          importados += filas.length;
        }

        /* Invalidar OTP */
        DB_ADMIN._otp = null;

        UI.closeModal();
        UI.toast(`Importación completada: ${importados} registros restaurados ✓`);
        Pages.database();
      } catch(err) {
        UI.toast('Error al importar: ' + err.message, 'error');
        console.error('Import error:', err);
      }
    });
  },

  /* ── BORRAR TODO ──────────────────────────────────── */
  async borrarTodo() {
    if (!DB_ADMIN.verificarOTP('del-otp', 'borrar')) return;

    const confirmacion = document.getElementById('del-confirm')?.value.trim();
    if (confirmacion !== 'BORRAR BASE DE DATOS') {
      UI.toast('Debes escribir exactamente: BORRAR BASE DE DATOS', 'error');
      return;
    }

    /* Triple confirmación */
    UI.confirm(`⚠️ ÚLTIMA ADVERTENCIA: ¿Estás COMPLETAMENTE seguro de borrar TODA la base de datos del tenant <b>${Auth.tenant?.name}</b>?<br><br>Esta acción es <b>PERMANENTE e IRREVERSIBLE</b>.`, async () => {
      try {
        UI.toast('Borrando datos...', 'info');
        const tenantId = await getTenantId();

        /* Borrar en orden correcto (FK constraints) */
        const tablas = [
          'abonos','cuentas_cobrar','ot_repuestos','ot_servicios',
          'inv_movimientos','entradas_detalle','entradas_inventario',
          'viaticos','entrenamientos','llamadas_atencion','liquidaciones',
          'fel_importados','facturas','ingresos','egresos',
          'obligaciones_fiscales','ordenes','inventario',
          'vehiculos','citas','nomina','asistencia',
          'proveedores','clientes','empleados'
        ];

        for (const tabla of tablas) {
          await getSupabase().from(tabla).delete().eq('tenant_id', tenantId);
        }

        /* Invalidar OTP */
        DB_ADMIN._otp = null;

        UI.closeModal();
        UI.toast('Base de datos borrada. Redirigiendo...', 'info');
        setTimeout(() => logout(), 2000);
      } catch(err) {
        UI.toast('Error al borrar: ' + err.message, 'error');
        console.error('Delete error:', err);
      }
    });
  },

  /* ── CONFIGURACIÓN TIMER ──────────────────────────── */
  getTimerConfig() {
    try {
      return JSON.parse(localStorage.getItem('tp_timer_config')||'{}');
    } catch { return {}; }
  },

  guardarTimerConfig() {
    const dias = [...document.querySelectorAll('input[name="timer-dia"]:checked')].map(cb=>cb.value);

    const config = {
      inactividad:   parseInt(document.getElementById('timer-inactividad')?.value)||30,
      accion:        document.getElementById('timer-accion')?.value||'logout',
      horaInicio:    document.getElementById('timer-hora-inicio')?.value||'07:00',
      horaFin:       document.getElementById('timer-hora-fin')?.value||'20:00',
      horarioActivo: document.getElementById('timer-horario-activo')?.checked||false,
      fueraRedirigir:document.getElementById('timer-fuera-redirigir')?.checked||false,
      dias
    };

    localStorage.setItem('tp_timer_config', JSON.stringify(config));
    ACTIVITY_TIMER.reiniciar(config);
    UI.toast('Configuración de temporización guardada ✓');
  }
};

/* ══════════════════════════════════════════════════════
   ACTIVITY TIMER — Gestión de inactividad y horarios
══════════════════════════════════════════════════════ */
const ACTIVITY_TIMER = {
  _timer:    null,
  _config:   null,
  _horarioTimer: null,

  init() {
    try {
      this._config = JSON.parse(localStorage.getItem('tp_timer_config')||'{}');
    } catch {
      this._config = {};
    }
    this._bindEvents();
    this.reiniciar(this._config);
    this._checkHorario();
    this._horarioTimer = setInterval(() => this._checkHorario(), 60000); // cada minuto
  },

  _bindEvents() {
    ['mousemove','keydown','click','touchstart','scroll'].forEach(ev => {
      document.addEventListener(ev, () => this._resetTimer(), { passive: true });
    });
  },

  reiniciar(config) {
    this._config = config || this._config || {};
    if (this._timer) clearTimeout(this._timer);
    const minutos = this._config.inactividad || 30;
    this._timer = setTimeout(() => this._onInactividad(), minutos * 60 * 1000);
  },

  _resetTimer() {
    if (!this._config) return;
    if (this._timer) clearTimeout(this._timer);
    const minutos = this._config.inactividad || 30;
    this._timer = setTimeout(() => this._onInactividad(), minutos * 60 * 1000);
  },

  _onInactividad() {
    const accion = this._config.accion || 'logout';
    if (accion === 'logout') {
      UI.toast('Sesión cerrada por inactividad', 'warn');
      setTimeout(() => { if (typeof logout === 'function') logout(); }, 1500);
    } else if (accion === 'lock') {
      this._lockScreen();
    } else {
      UI.toast('⚠️ Sesión por expirar por inactividad', 'warn');
      this.reiniciar(this._config);
    }
  },

  _lockScreen() {
    /* Superponer pantalla de bloqueo */
    const lock = document.createElement('div');
    lock.id    = 'lock-screen';
    lock.style.cssText = `position:fixed;inset:0;background:var(--bg);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px`;
    lock.innerHTML = `
      <div style="font-size:48px">🔒</div>
      <div style="font-size:20px;font-weight:700;color:var(--text)">Pantalla Bloqueada</div>
      <div class="text-muted" style="font-size:13px">Ingresa tu contraseña para continuar</div>
      <input type="password" id="lock-pass" class="form-input" style="width:280px;text-align:center"
             placeholder="Contraseña" onkeydown="if(event.key==='Enter')ACTIVITY_TIMER._unlock()">
      <button class="btn btn-amber" onclick="ACTIVITY_TIMER._unlock()">Desbloquear</button>
      <button class="btn btn-ghost btn-sm" onclick="logout()">Cerrar Sesión</button>`;
    document.body.appendChild(lock);
    setTimeout(() => document.getElementById('lock-pass')?.focus(), 100);
  },

  _unlock() {
    /* Por ahora cualquier input desbloquea — en producción verificar contra auth real */
    const pass = document.getElementById('lock-pass')?.value;
    if (!pass) { UI.toast('Ingresa tu contraseña', 'error'); return; }
    document.getElementById('lock-screen')?.remove();
    this.reiniciar(this._config);
    UI.toast('Sesión reanudada ✓');
  },

  _checkHorario() {
    if (!this._config?.horarioActivo) return;

    const ahora  = new Date();
    const dia    = ['dom','lun','mar','mie','jue','vie','sab'][ahora.getDay()];
    const hora   = ahora.toTimeString().slice(0,5);
    const dias   = this._config.dias || ['lun','mar','mie','jue','vie'];
    const inicio = this._config.horaInicio || '07:00';
    const fin    = this._config.horaFin    || '20:00';

    const diaPermitido  = dias.includes(dia);
    const horaPermitida = hora >= inicio && hora <= fin;

    if (!diaPermitido || !horaPermitida) {
      const msg = !diaPermitido
        ? `El sistema no está disponible los días ${dia.toUpperCase()}.`
        : `El sistema solo está disponible de ${inicio} a ${fin}.`;

      if (this._config.fueraRedirigir && document.getElementById('app')?.classList.contains('visible')) {
        UI.toast(msg + ' Cerrando sesión...', 'warn');
        setTimeout(() => { if (typeof logout === 'function') logout(); }, 2500);
      }
    }
  }
};

/* ══════════════════════════════════════════════════════
   MODO SOPORTE — Activa Super Admin oculto
══════════════════════════════════════════════════════ */
Pages._activarModoSoporte = function () {
  UI.openModal('🛡️ Modo Soporte / Integración', `
    <div class="alert alert-red mb-4">
      <div class="alert-icon">⚠️</div>
      <div><div class="alert-title">Área Restringida</div>
      <div class="alert-body">El Super Admin tiene acceso total al sistema. Solo activar para soporte técnico o integración.</div></div>
    </div>
    <div class="form-group">
      <label class="form-label">Código de Acceso Soporte</label>
      <input class="form-input" id="soporte-code" type="password" placeholder="Código de soporte">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
      <button class="btn btn-danger" onclick="Pages._confirmarModoSoporte()">Activar Modo Soporte</button>
    </div>`
  );
};

Pages._confirmarModoSoporte = function () {
  const code = document.getElementById('soporte-code')?.value;
  /* Código hardcodeado para demo — en producción usar endpoint seguro */
  if (code === 'TP-SUPPORT-2025') {
    document.getElementById('btn-superadmin-wrap').style.display = 'inline';
    UI.closeModal();
    UI.toast('Modo soporte activado. Super Admin visible.', 'warn');
  } else {
    UI.toast('Código incorrecto', 'error');
  }
};

/* ══════════════════════════════════════════════════════
   INICIAR TIMER al cargar la app
══════════════════════════════════════════════════════ */
window.addEventListener('load', () => {
  setTimeout(() => ACTIVITY_TIMER.init(), 2000);
});
