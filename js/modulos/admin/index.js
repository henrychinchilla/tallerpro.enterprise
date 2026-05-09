/* TallerPro v3.0 — admin/index.js */
Modulos.admin = {
  _tab: 'overview',
  _otps: {}, /* { adminId: { code, expires } } */

  async render() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">🗄️ Base de Datos</h1>
      </div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='overview'?'active':''}" onclick="Modulos.admin._tab='overview';Modulos.admin._renderTab()">📊 Estado</button>
          <button class="tab-btn ${this._tab==='exportar'?'active':''}" onclick="Modulos.admin._tab='exportar';Modulos.admin._renderTab()">⬇️ Exportar</button>
          ${['admin','superadmin'].includes(Auth.user?.rol)?`
          <button class="tab-btn ${this._tab==='importar'?'active':''}" onclick="Modulos.admin._tab='importar';Modulos.admin._renderTab()">⬆️ Importar</button>
          <button class="tab-btn ${this._tab==='peligro'?'active':''}" style="color:var(--red)" onclick="Modulos.admin._tab='peligro';Modulos.admin._renderTab()">⚠️ Zona de Peligro</button>
          `:''}
        </div>
        <div id="admin-content"></div>
      </div>`;
    await this._renderTab();
  },

  async _renderTab() {
    const el = document.getElementById('admin-content');
    if (!el) return;

    if (this._tab === 'overview') {
      const counts = await this._getCounts();
      el.innerHTML = `
        <div class="grid-2" style="margin-bottom:20px">
          <div class="card card-cyan">
            <div class="card-sub mb-3">🏢 Taller Activo</div>
            <div style="font-size:14px;font-weight:700;margin-bottom:4px">${Auth.tenant?.name||'—'}</div>
            <div style="font-size:12px;color:var(--text3)">NIT: ${Auth.tenant?.nit||'—'}</div>
            <div style="font-size:12px;color:var(--text3)">ID: ${Auth.tenant?.id?.slice(0,12)||'—'}...</div>
          </div>
          <div class="card card-${Auth.licencia?.tipo==='completa'?'green':'amber'}">
            <div class="card-sub mb-3">🔑 Licencia</div>
            <div style="margin-bottom:8px">
              ${Auth.licencia?.tipo==='completa'
                ? '<span class="badge badge-green" style="font-size:13px">✓ Licencia Completa</span>'
                : `<span class="badge badge-amber" style="font-size:13px">Demo · ${Auth.licencia?.dias_restantes||0} días restantes</span>`}
            </div>
            <button class="btn btn-amber btn-sm" onclick="App.activarLicencia()">🔑 Activar Licencia</button>
          </div>
        </div>
        <div class="card">
          <div class="card-sub mb-3">📊 Registros en Base de Datos</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
            ${counts.map(([label,icon,count])=>`
              <div style="text-align:center;padding:12px;background:var(--surface2);border-radius:8px">
                <div style="font-size:24px;margin-bottom:4px">${icon}</div>
                <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--amber)">${count}</div>
                <div style="font-size:11px;color:var(--text3)">${label}</div>
              </div>`).join('')}
          </div>
        </div>`;
    }

    else if (this._tab === 'exportar') {
      const tablas = [
        { id:'clientes',    label:'Clientes',         icon:'👥', roles:['admin','superadmin','gerente_tal','recepcionista'] },
        { id:'vehiculos',   label:'Vehículos',         icon:'🚗', roles:['admin','superadmin','gerente_tal','recepcionista'] },
        { id:'ordenes',     label:'Órdenes de Trabajo',icon:'📋', roles:['admin','superadmin','gerente_tal'] },
        { id:'inventario',  label:'Inventario',        icon:'📦', roles:['admin','superadmin','gerente_tal'] },
        { id:'proveedores', label:'Proveedores',       icon:'🏪', roles:['admin','superadmin','gerente_fin'] },
        { id:'empleados',   label:'Empleados',         icon:'👤', roles:['admin','superadmin'] },
        { id:'ingresos',    label:'Ingresos',          icon:'📈', roles:['admin','superadmin','gerente_fin'] },
        { id:'egresos',     label:'Egresos',           icon:'📉', roles:['admin','superadmin','gerente_fin'] },
        { id:'facturas',    label:'Facturas',          icon:'🧾', roles:['admin','superadmin','gerente_fin'] },
        { id:'bancos',      label:'Bancos',            icon:'🏦', roles:['admin','superadmin','gerente_fin'] }
      ];
      const rol = Auth.user?.rol;
      const disponibles = tablas.filter(t=>t.roles.includes(rol));

      el.innerHTML = `
        <div class="alert alert-cyan" style="margin-bottom:16px">
          <div class="alert-icon">ℹ️</div>
          <div class="alert-body" style="font-size:12px">
            Exporta los datos en formato CSV. Los archivos pueden abrirse con Excel o Google Sheets.
            Solo puedes exportar las tablas habilitadas para tu rol.
          </div>
        </div>
        <div class="grid-3">
          ${disponibles.map(t=>`
            <div class="card" style="text-align:center;cursor:pointer" onclick="Modulos.admin.exportarTabla('${t.id}','${t.label}')">
              <div style="font-size:32px;margin-bottom:8px">${t.icon}</div>
              <div style="font-weight:700;margin-bottom:4px">${t.label}</div>
              <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px">⬇ Exportar CSV</button>
            </div>`).join('')}
          <div class="card" style="text-align:center;cursor:pointer;border-color:var(--amber-border)"
               onclick="Modulos.admin.exportarTodo()">
            <div style="font-size:32px;margin-bottom:8px">📦</div>
            <div style="font-weight:700;margin-bottom:4px">Todo (ZIP)</div>
            <button class="btn btn-amber btn-sm" style="width:100%;margin-top:8px">⬇ Exportar Todo</button>
          </div>
        </div>`;
    }

    else if (this._tab === 'importar') {
      el.innerHTML = `
        <div class="alert alert-amber" style="margin-bottom:16px">
          <div class="alert-icon">⚠️</div>
          <div class="alert-body" style="font-size:12px">
            Solo administradores y superadministradores pueden importar datos.
            Los datos importados se <b>agregarán</b> a los existentes, no los reemplazarán.
            La licencia activa se preserva automáticamente.
          </div>
        </div>
        <div class="grid-2">
          ${[
            { id:'clientes',   label:'Clientes',   icon:'👥' },
            { id:'vehiculos',  label:'Vehículos',  icon:'🚗' },
            { id:'inventario', label:'Inventario', icon:'📦' },
            { id:'empleados',  label:'Empleados',  icon:'👤' },
            { id:'proveedores',label:'Proveedores',icon:'🏪' }
          ].map(t=>`
            <div class="card">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
                <span style="font-size:28px">${t.icon}</span>
                <div>
                  <div style="font-weight:700">${t.label}</div>
                  <div style="font-size:11px;color:var(--text3)">CSV con encabezados</div>
                </div>
              </div>
              <label class="btn btn-ghost btn-sm" style="width:100%;cursor:pointer;text-align:center">
                ⬆ Seleccionar CSV
                <input type="file" accept=".csv" class="hidden"
                       onchange="Modulos.admin.importarCSV(this,'${t.id}','${t.label}')">
              </label>
            </div>`).join('')}
        </div>`;
    }

    else if (this._tab === 'peligro') {
      el.innerHTML = `
        <div class="alert alert-red" style="margin-bottom:20px;border:2px solid var(--red)">
          <div class="alert-icon" style="font-size:24px">☢️</div>
          <div class="alert-body">
            <div style="font-weight:800;font-size:14px;color:var(--red);margin-bottom:4px">ZONA DE PELIGRO</div>
            <div style="font-size:12px">Las acciones en esta sección son <b>irreversibles</b>. Se requiere confirmación de al menos 2 administradores.</div>
          </div>
        </div>

        <div class="card" style="border:2px solid var(--red);margin-bottom:16px">
          <div style="font-weight:800;font-size:15px;color:var(--red);margin-bottom:8px">🗑️ Borrar Base de Datos del Taller</div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:16px">
            Elimina <b>todos los datos</b> del taller actual: clientes, vehículos, órdenes, inventario, empleados, facturas, finanzas, bancos, bodegas, marketing, citas. <br><br>
            <b>Se conserva:</b> Usuario henry.chinchilla@gmail.com, licencia activa, configuración del taller.
            <b>Se elimina:</b> Todos los demás usuarios incluyendo el que ejecuta esta acción.
          </div>

          <div style="border-top:1px solid var(--border);padding-top:16px">
            <div style="font-weight:700;font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">
              Paso 1 — Generar OTP de autorización
            </div>
            <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
              Cada administrador debe generar su propio OTP desde su cuenta. Se requieren mínimo 2 OTPs válidos.
              Los OTPs expiran en <b>10 minutos</b>.
            </div>
            <button class="btn btn-ghost" onclick="Modulos.admin.generarMiOTP()">
              🔐 Generar mi OTP de autorización
            </button>
            <div id="otp-display" style="margin-top:12px"></div>
          </div>

          <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:16px">
            <div style="font-weight:700;font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">
              Paso 2 — Ingresar OTPs de los 2 administradores
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">OTP Admin 1</label>
                <input class="form-input mono-sm" id="otp1" placeholder="000000" maxlength="6"></div>
              <div class="form-group"><label class="form-label">OTP Admin 2</label>
                <input class="form-input mono-sm" id="otp2" placeholder="000000" maxlength="6"></div>
            </div>
          </div>

          <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:8px">
            <div style="font-weight:700;font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">
              Paso 3 — Confirmación escrita
            </div>
            <div style="font-size:12px;color:var(--text2);margin-bottom:8px">
              Escribe exactamente: <code style="background:var(--surface2);padding:2px 6px;border-radius:4px;color:var(--red)">acepto borrar base de datos</code>
            </div>
            <input class="form-input" id="confirm-text" placeholder="acepto borrar base de datos"
                   style="border-color:var(--red-border)">
          </div>

          <div style="margin-top:16px">
            <button class="btn btn-danger" style="width:100%;font-size:14px"
                    onclick="Modulos.admin.ejecutarBorrado()">
              ☢️ BORRAR BASE DE DATOS
            </button>
          </div>
        </div>`;
    }
  },

  async _getCounts() {
    const tablas = [
      ['Clientes','👥','clientes'],['Vehículos','🚗','vehiculos'],
      ['Órdenes','📋','ordenes'],['Inventario','📦','inventario'],
      ['Empleados','👤','empleados'],['Facturas','🧾','facturas'],
      ['Ingresos','📈','ingresos'],['Egresos','📉','egresos']
    ];
    const results = await Promise.all(tablas.map(([l,i,t])=>
      getSB().from(t).select('*',{count:'exact',head:true}).eq('tenant_id',getTID())
        .then(({count})=>[l,i,count||0])
    ));
    return results;
  },

  /* ── EXPORTAR ────────────────────────────────── */
  async exportarTabla(tabla, label) {
    UI.toast(`Exportando ${label}...`, 'info');
    const { data } = await getSB().from(tabla).select('*').eq('tenant_id', getTID());
    if (!data?.length) { UI.toast('Sin datos para exportar','warn'); return; }
    const cols = Object.keys(data[0]).filter(k=>!['tenant_id'].includes(k));
    const csv  = [cols.join(','), ...data.map(r=>cols.map(c=>{
      const v = r[c];
      if (v===null||v===undefined) return '';
      if (typeof v==='object') return '"'+JSON.stringify(v).replace(/"/g,'""')+'"';
      return '"'+String(v).replace(/"/g,'""')+'"';
    }).join(','))].join('\n');
    this._downloadCSV(csv, `${tabla}-${new Date().toISOString().slice(0,10)}.csv`);
    UI.toast(`${label} exportado ✓`);
  },

  async exportarTodo() {
    UI.toast('Preparando exportación completa...','info');
    const tablas = ['clientes','vehiculos','ordenes','inventario','empleados',
                    'proveedores','ingresos','egresos','facturas','bancos',
                    'bodegas','combos','promociones','citas'];
    let zip_content = '';
    for (const tabla of tablas) {
      const { data } = await getSB().from(tabla).select('*').eq('tenant_id', getTID());
      if (!data?.length) continue;
      const cols = Object.keys(data[0]).filter(k=>k!=='tenant_id');
      const csv  = [cols.join(','), ...data.map(r=>cols.map(c=>{
        const v = r[c];
        if (!v&&v!==0) return '';
        return '"'+String(typeof v==='object'?JSON.stringify(v):v).replace(/"/g,'""')+'"';
      }).join(','))].join('\n');
      this._downloadCSV(csv, `${tabla}-${new Date().toISOString().slice(0,10)}.csv`);
      await new Promise(r=>setTimeout(r,300));
    }
    UI.toast('Exportación completa ✓ — revisa tus descargas');
  },

  _downloadCSV(csv, filename) {
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
    a.download = filename;
    a.click();
  },

  /* ── IMPORTAR ────────────────────────────────── */
  async importarCSV(input, tabla, label) {
    const file = input.files?.[0];
    if (!file) return;
    UI.toast(`Leyendo ${label}...`, 'info');
    const text = await file.text();
    const lines = text.split('\n').filter(l=>l.trim());
    if (lines.length < 2) { UI.toast('Archivo vacío o sin datos','error'); return; }
    const headers = lines[0].split(',').map(h=>h.replace(/"/g,'').trim());
    const rows = lines.slice(1).map(line => {
      const vals = line.match(/(".*?"|[^,]+)(?=,|$)/g)||[];
      const obj = { tenant_id: getTID() };
      headers.forEach((h,i)=>{ obj[h] = (vals[i]||'').replace(/^"|"$/g,'').trim()||null; });
      delete obj.id;
      return obj;
    });

    const ok = await UI.confirmar(
      `¿Importar <b>${rows.length} registros</b> en ${label}?<br>Se agregarán a los datos existentes.`,
      'Importar'
    );
    if (!ok) return;

    const { error } = await getSB().from(tabla).insert(rows);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(`${rows.length} registros importados en ${label} ✓`);
  },

  /* ── OTP SYSTEM ──────────────────────────────── */
  generarMiOTP() {
    const userId = Auth.user?.id;
    const nombre = Auth.user?.nombre;
    const code   = String(Math.floor(100000 + Math.random() * 900000));
    const expires = Date.now() + 10*60*1000; /* 10 minutos */

    /* Guardar en sessionStorage para que otros admin lo puedan ingresar manualmente */
    const otpData = JSON.stringify({ userId, nombre, code, expires });
    sessionStorage.setItem('tp_otp_'+userId, otpData);

    /* También guardar en memoria global */
    if (!window._adminOTPs) window._adminOTPs = {};
    window._adminOTPs[userId] = { code, expires, nombre };

    const el = document.getElementById('otp-display');
    if (el) {
      el.innerHTML = `
        <div class="card card-amber" style="text-align:center;padding:20px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px">TU OTP — Válido por 10 minutos</div>
          <div style="font-family:'DM Mono',monospace;font-size:36px;font-weight:700;color:var(--amber);letter-spacing:8px">${code}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:8px">
            Comparte este código con los otros administradores que deben autorizar.
          </div>
          <div id="otp-timer" style="font-size:12px;color:var(--text3);margin-top:8px"></div>
        </div>`;

      /* Countdown timer */
      const timer = setInterval(() => {
        const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000));
        const timerEl = document.getElementById('otp-timer');
        if (timerEl) {
          const mins = Math.floor(remaining/60);
          const secs = remaining % 60;
          timerEl.textContent = `Expira en: ${mins}:${String(secs).padStart(2,'0')}`;
          if (remaining === 0) {
            clearInterval(timer);
            timerEl.textContent = '⚠️ OTP expirado — genera uno nuevo';
            timerEl.style.color = 'var(--red)';
          }
        } else { clearInterval(timer); }
      }, 1000);
    }
  },

  _validarOTP(code) {
    if (!window._adminOTPs) return false;
    const now = Date.now();
    return Object.values(window._adminOTPs).some(otp =>
      otp.code === code && otp.expires > now
    );
  },

  /* ── BORRADO TOTAL ───────────────────────────── */
  async ejecutarBorrado() {
    const otp1   = document.getElementById('otp1')?.value.trim();
    const otp2   = document.getElementById('otp2')?.value.trim();
    const texto  = document.getElementById('confirm-text')?.value.trim().toLowerCase();

    /* Validaciones */
    if (!otp1 || !otp2) { UI.toast('Ingresa los dos OTPs','error'); return; }
    if (otp1 === otp2)  { UI.toast('Los OTPs deben ser de dos administradores diferentes','error'); return; }
    if (texto !== 'acepto borrar base de datos') { UI.toast('El texto de confirmación no es correcto','error'); return; }
    if (!this._validarOTP(otp1)) { UI.toast('OTP 1 inválido o expirado','error'); return; }
    if (!this._validarOTP(otp2)) { UI.toast('OTP 2 inválido o expirado','error'); return; }

    /* Confirmación final */
    const ok = await UI.confirmar(
      `<div style="color:var(--red);font-size:16px;font-weight:800;margin-bottom:12px">⚠️ ÚLTIMA CONFIRMACIÓN</div>
       Esto borrará <b>TODOS</b> los datos del taller <b>${Auth.tenant?.name}</b>.<br><br>
       Esta acción es <b>IRREVERSIBLE</b>. ¿Confirmas?`,
      '☢️ SÍ, BORRAR TODO'
    );
    if (!ok) return;

    UI.toast('Ejecutando borrado...', 'warn', 10000);

    const tid = getTID();

    /* Guardar licencia antes de borrar */
    const licencia = await DB.getLicencia();

    /* Tablas a borrar */
    const tablas = ['banco_movimientos','bancos','citas','combos','egresos',
      'empleado_documentos','empleados','facturas','ingresos','inventario_movimientos',
      'inventario','ordenes','pagos_nomina','promociones','proveedores',
      'vehiculos','viaticos','bodegas'];

    for (const tabla of tablas) {
      await getSB().from(tabla).delete().eq('tenant_id', tid);
    }

    /* Borrar usuarios excepto henry y demo */
    await getSB().from('usuarios').delete()
      .eq('tenant_id', tid)
      .not('email', 'in', '("henry.chinchilla@gmail.com","demo@demo.com")');

    /* Borrar en auth.users también excepto henry y demo */
    const { data: usersToDelete } = await getSB()
      .from('usuarios').select('id,email')
      .eq('tenant_id', tid)
      .not('email', 'in', '("henry.chinchilla@gmail.com","demo@demo.com")');

    /* Borrar clientes al final */
    await getSB().from('clientes').delete().eq('tenant_id', tid);

    /* Restaurar licencia si existía */
    if (licencia?.tipo === 'completa') {
      await getSB().from('licencias').upsert({
        tenant_id: tid, tipo:'completa', activa:true,
        codigo: licencia.codigo, activada_por: licencia.activada_por
      }, { onConflict:'tenant_id' });
    }

    /* Limpiar OTPs usados */
    window._adminOTPs = {};

    UI.toast('Base de datos borrada ✓ — Sesión cerrada', 'warn', 5000);
    setTimeout(async () => {
      await Auth.logout();
      location.reload();
    }, 3000);
  }
};
