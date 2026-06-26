/* TallerPro v3.0 — admin/index.js */
Modulos.admin = {
  _tab: 'overview',

  async render() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">🗄️ Base de Datos</h1>
      </div>
      <div class="page-body">
        <div class="tabs">
          <button class="tab-btn ${this._tab==='overview'?'active':''}" onclick="Modulos.admin._ir('overview')">📊 Estado</button>
          <button class="tab-btn ${this._tab==='exportar'?'active':''}" onclick="Modulos.admin._ir('exportar')">⬇️ Exportar</button>
          ${['admin','superadmin','gerente_fin','gerente_tal'].includes(Auth.user?.rol)?`
          <button class="tab-btn ${this._tab==='auditoria'?'active':''}" onclick="Modulos.admin._ir('auditoria')">📜 Auditoría</button>`:''}
          ${['admin','superadmin'].includes(Auth.user?.rol)?`
          <button class="tab-btn ${this._tab==='importar'?'active':''}" onclick="Modulos.admin._ir('importar')">⬆️ Importar</button>
          <button class="tab-btn ${this._tab==='peligro'?'active':''}" style="color:var(--red)" onclick="Modulos.admin._ir('peligro')">⚠️ Zona de Peligro</button>`:''}
          ${puedeVerDocsEmpresa()?`
          <button class="tab-btn ${this._tab==='documentos'?'active':''}" onclick="Modulos.admin._ir('documentos')">🗂️ Documentos Legales</button>`:''}
        </div>
        <div id="admin-content"></div>
      </div>`;
    await this._renderTab();
  },

  _ir(t){ this._tab=t; App._subActivo=t; App._guardarRuta(); App.renderSidebar(); App.marcarTabActivo(t); this._renderTab(); },

  async _renderTab() {
    const el = document.getElementById('admin-content');
    if (!el) return;

    if (this._tab==='overview') {
      const counts = await this._getCounts();
      el.innerHTML = `
        <div class="grid-2" style="margin-bottom:20px">
          <div class="card card-cyan">
            <div class="card-sub mb-3">🏢 Taller Activo</div>
            <div style="font-size:14px;font-weight:700;margin-bottom:4px">${Auth.tenant?.name||'—'}</div>
            <div style="font-size:12px;color:var(--text3)">NIT: ${Auth.tenant?.nit||'—'}</div>
            <div style="font-size:12px;color:var(--text3)">ID: ${Auth.tenant?.id?.slice(0,12)||'—'}...</div>
          </div>
          <div class="card card-${suscripcionVigente()?'green':'red'}">
            <div class="card-sub mb-3">💳 Suscripción</div>
            <div style="margin-bottom:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <span class="badge badge-${PLANES[Auth.tenant?.plan]?.color||'gray'}" style="font-size:13px">
                ${PLANES[Auth.tenant?.plan]?.label || 'Plan personalizado'}</span>
              ${suscripcionVigente()
                ? '<span class="badge badge-green">✓ Vigente</span>'
                : '<span class="badge badge-red">Vencida</span>'}
            </div>
            <div style="font-size:12px;color:var(--text3)">
              ${Auth.tenant?.suscripcion_vence ? 'Vence: ' + UI.fecha(Auth.tenant.suscripcion_vence) : 'Sin fecha de vencimiento'}
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:6px">
              Los planes, módulos y pagos se gestionan con tu proveedor de TallerPro.
            </div>
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

    else if (this._tab==='auditoria') {
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <div class="alert alert-cyan" style="margin:0;flex:1;min-width:260px">
            <div class="alert-icon">📜</div>
            <div class="alert-body" style="font-size:12px">Registro automático de todas las acciones (crear, modificar, eliminar) en la app. Solo lectura — a prueba de manipulación.</div>
          </div>
          <select class="form-select" id="aud-filtro" style="width:170px" onchange="Modulos.admin._renderAuditoria()">
            <option value="">Todas las acciones</option>
            <option value="insert">➕ Creaciones</option>
            <option value="update">✏️ Modificaciones</option>
            <option value="delete">🗑️ Eliminaciones</option>
          </select>
        </div>
        <div id="aud-tabla"><div class="text-muted" style="padding:20px">⏳ Cargando...</div></div>`;
      await this._renderAuditoria();
    }

    else if (this._tab==='exportar') {
      const tablas = [
        { id:'clientes',    label:'Clientes',          icon:'👥', roles:['admin','superadmin','gerente_tal','recepcionista'] },
        { id:'vehiculos',   label:'Vehículos',          icon:'🚗', roles:['admin','superadmin','gerente_tal','recepcionista'] },
        { id:'ordenes',     label:'Órdenes de Trabajo', icon:'📋', roles:['admin','superadmin','gerente_tal'] },
        { id:'inventario',  label:'Inventario',         icon:'📦', roles:['admin','superadmin','gerente_tal'] },
        { id:'proveedores', label:'Proveedores',        icon:'🏪', roles:['admin','superadmin','gerente_fin'] },
        { id:'empleados',   label:'Empleados',          icon:'👤', roles:['admin','superadmin'] },
        { id:'ingresos',    label:'Ingresos',           icon:'📈', roles:['admin','superadmin','gerente_fin'] },
        { id:'egresos',     label:'Egresos',            icon:'📉', roles:['admin','superadmin','gerente_fin'] },
        { id:'facturas',    label:'Facturas',           icon:'🧾', roles:['admin','superadmin','gerente_fin'] },
        { id:'bancos',      label:'Bancos',             icon:'🏦', roles:['admin','superadmin','gerente_fin'] }
      ];
      const rol = Auth.user?.rol;
      const disponibles = tablas.filter(t=>t.roles.includes(rol));

      el.innerHTML = `
        <div class="alert alert-cyan" style="margin-bottom:16px">
          <div class="alert-icon">🔒</div>
          <div class="alert-body" style="font-size:12px">
            Los archivos exportados están <b>encriptados con AES-256</b>. Solo pueden importarse en TallerPro.
            También puedes exportar como CSV plano para usar en Excel.
          </div>
        </div>
        <div class="grid-3">
          ${disponibles.map(t=>`
            <div class="card">
              <div style="text-align:center;margin-bottom:12px">
                <div style="font-size:32px">${t.icon}</div>
                <div style="font-weight:700;margin-top:4px">${t.label}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px">
                <button class="btn btn-amber btn-sm" onclick="Modulos.admin.exportarEncriptado('${t.id}','${t.label}')">🔒 Exportar encriptado</button>
                <button class="btn btn-ghost btn-sm" onclick="Modulos.admin.exportarCSV('${t.id}','${t.label}')">📄 Exportar CSV</button>
              </div>
            </div>`).join('')}
          <div class="card" style="border-color:var(--amber-border)">
            <div style="text-align:center;margin-bottom:12px">
              <div style="font-size:32px">📦</div>
              <div style="font-weight:700;margin-top:4px">Backup Completo</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              <button class="btn btn-amber" onclick="Modulos.admin.exportarBackupCompleto()">🔒 Backup Encriptado</button>
              <div style="font-size:10px;color:var(--text3);text-align:center">Incluye todos los datos + licencia</div>
            </div>
          </div>
        </div>`;
    }

    else if (this._tab==='importar') {
      /* Verificar si hay datos activos */
      const { count } = await getSB().from('clientes').select('*',{count:'exact',head:true}).eq('tenant_id',getTID());
      const tieneData = (count||0) > 0;
      const esSuperAdmin = Auth.user?.rol === 'superadmin';

      el.innerHTML = `
        ${tieneData && !esSuperAdmin ? `
        <div class="alert alert-red" style="margin-bottom:16px;border:2px solid var(--red)">
          <div class="alert-icon">🚫</div>
          <div class="alert-body">
            <div style="font-weight:800;color:var(--red)">Importación bloqueada</div>
            <div style="font-size:12px">Ya existen datos en la base de datos (${count} clientes registrados).
            Solo el <b>Superusuario</b> puede forzar una importación cuando hay datos activos.
            Para importar, primero borra la base de datos desde la Zona de Peligro.</div>
          </div>
        </div>` : ''}

        ${tieneData && esSuperAdmin ? `
        <div class="alert alert-amber" style="margin-bottom:16px">
          <div class="alert-icon">⚡</div>
          <div class="alert-body" style="font-size:12px">
            <b>Superusuario:</b> Puedes forzar la importación aunque haya datos existentes.
            Los datos importados se <b>agregarán</b> a los existentes.
          </div>
        </div>` : ''}

        ${!tieneData ? `
        <div class="alert alert-green" style="margin-bottom:16px">
          <div class="alert-icon">✓</div>
          <div class="alert-body" style="font-size:12px">
            Base de datos vacía. Puedes importar datos libremente.
            Solo se aceptan archivos <b>.tpro</b> (exportados desde TallerPro) o CSV por tabla.
          </div>
        </div>` : ''}

        <div class="grid-2" style="${tieneData && !esSuperAdmin ? 'opacity:0.4;pointer-events:none' : ''}">
          <div class="card card-cyan">
            <div class="card-sub mb-3">🔒 Importar Backup Encriptado (.tpro)</div>
            <p style="font-size:12px;color:var(--text2);margin-bottom:12px">
              Restaura un backup completo generado por TallerPro. La licencia se restaura automáticamente.
            </p>
            <label class="btn btn-cyan" style="width:100%;cursor:pointer;text-align:center;display:block">
              📂 Seleccionar archivo .tpro
              <input type="file" accept=".tpro" class="hidden"
                     onchange="Modulos.admin.importarBackup(this)">
            </label>
          </div>
          <div class="card">
            <div class="card-sub mb-3">📄 Importar CSV por tabla</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${['clientes','vehiculos','inventario','empleados','proveedores'].map(t=>`
                <label class="btn btn-ghost btn-sm" style="cursor:pointer;text-align:center">
                  ⬆ ${t.charAt(0).toUpperCase()+t.slice(1)} CSV
                  <input type="file" accept=".csv" class="hidden"
                         onchange="Modulos.admin.importarCSV(this,'${t}','${t}')">
                </label>`).join('')}
            </div>
          </div>
        </div>`;
    }

    else if (this._tab==='peligro') {
      el.innerHTML = `
        <div class="alert alert-red" style="margin-bottom:20px;border:2px solid var(--red)">
          <div class="alert-icon" style="font-size:24px">☢️</div>
          <div class="alert-body">
            <div style="font-weight:800;font-size:14px;color:var(--red);margin-bottom:4px">ZONA DE PELIGRO — ACCIONES IRREVERSIBLES</div>
            <div style="font-size:12px">Requiere confirmación de <b>2 administradores</b> con OTP + texto de confirmación.</div>
          </div>
        </div>
        <div class="card" style="border:2px solid var(--red)">
          <div style="font-weight:800;font-size:15px;color:var(--red);margin-bottom:8px">🗑️ Borrar Base de Datos del Taller</div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:16px">
            Elimina <b>todos los datos</b>: clientes, vehículos, órdenes, inventario, empleados, facturas, finanzas.<br>
            <b style="color:var(--green)">Se conserva:</b> henry.chinchilla@gmail.com, demo@demo.com (durante período demo), licencia activa.<br>
            <b style="color:var(--red)">Se elimina:</b> Todos los demás usuarios incluyendo el que ejecuta esta acción.
          </div>

          <!-- PASO 1: GENERAR OTP -->
          <div style="background:var(--surface2);border-radius:8px;padding:14px;margin-bottom:12px">
            <div style="font-weight:700;font-size:12px;color:var(--text3);text-transform:uppercase;margin-bottom:8px">
              Paso 1 — Cada administrador genera su OTP (válido 10 min)
            </div>
            <button class="btn btn-ghost" onclick="Modulos.admin.generarMiOTP()">🔐 Generar mi OTP</button>
            <div id="otp-display" style="margin-top:10px"></div>
          </div>

          <!-- PASO 2: INGRESAR OTPs -->
          <div style="background:var(--surface2);border-radius:8px;padding:14px;margin-bottom:12px">
            <div style="font-weight:700;font-size:12px;color:var(--text3);text-transform:uppercase;margin-bottom:8px">
              Paso 2 — OTPs de 2 administradores diferentes
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">OTP Admin 1</label>
                <input class="form-input" id="otp1" placeholder="000000" maxlength="6"
                       style="font-family:monospace;font-size:20px;letter-spacing:8px;text-align:center"></div>
              <div class="form-group"><label class="form-label">OTP Admin 2</label>
                <input class="form-input" id="otp2" placeholder="000000" maxlength="6"
                       style="font-family:monospace;font-size:20px;letter-spacing:8px;text-align:center"></div>
            </div>
          </div>

          <!-- PASO 3: TEXTO DE CONFIRMACIÓN -->
          <div style="background:var(--surface2);border-radius:8px;padding:14px;margin-bottom:16px">
            <div style="font-weight:700;font-size:12px;color:var(--text3);text-transform:uppercase;margin-bottom:8px">
              Paso 3 — Escribe exactamente: <code style="color:var(--red)">acepto borrar base de datos</code>
            </div>
            <input class="form-input" id="confirm-text" placeholder="acepto borrar base de datos"
                   style="border-color:var(--red-border)">
          </div>

          <button class="btn btn-danger" style="width:100%;font-size:14px;padding:14px"
                  onclick="Modulos.admin.ejecutarBorrado()">
            ☢️ BORRAR BASE DE DATOS PERMANENTEMENTE
          </button>
        </div>`;
    }

    else if (this._tab==='documentos') {
      if (!puedeVerDocsEmpresa()) {
        el.innerHTML = `<div class="alert alert-amber">
          <div class="alert-icon">🔒</div>
          <div class="alert-body">No tienes acceso habilitado para ver los documentos legales de la empresa.</div>
        </div>`;
        return;
      }
      await this._renderDocumentosEmpresa();
    }
  },

  /* ── DOCUMENTOS LEGALES DE LA EMPRESA ──────── */
  _DOC_TIPOS: [
    'Patente de Comercio', 'Patente de Empresa', 'RTU Actualizado',
    'Registro Mercantil', 'Escritura de Sociedad',
    'Nombramiento de Representante Legal', 'DPI Representante Legal'
  ],

  async _renderDocumentosEmpresa() {
    const el = document.getElementById('admin-content');
    if (!el) return;
    const docs = await DB.getDocumentosEmpresa();
    const porTipo = tipo => docs.find(d => d.tipo === tipo);
    const adicionales = docs.filter(d => !this._DOC_TIPOS.includes(d.tipo));

    el.innerHTML = `
      <div class="alert alert-cyan" style="margin-bottom:16px">
        <div class="alert-icon">🗂️</div>
        <div class="alert-body" style="font-size:12px">
          Documentos legales del taller (patentes, RTU, escritura de sociedad, representación legal, etc.).
          Solo visibles para Dueño/Administración/Gerencia con acceso habilitado.
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-sub mb-3">📋 Documentos requeridos</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${this._DOC_TIPOS.map(tipo => {
            const d = porTipo(tipo);
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface2);border-radius:8px;flex-wrap:wrap;gap:6px">
              <div>
                <b style="font-size:13px">${tipo}</b>
                ${d ? `<div style="font-size:11px;color:var(--text3)">${d.nombre_archivo||''} · subido ${UI.fecha(d.created_at)}</div>`
                    : `<div style="font-size:11px;color:var(--amber)">⚠ Pendiente de subir</div>`}
              </div>
              <div style="display:flex;gap:6px">
                ${d ? `<button class="btn btn-sm btn-cyan" onclick="Modulos.admin.verDocEmpresa('${d.id}')">👁 Ver</button>` : ''}
                <button class="btn btn-sm btn-ghost" onclick="Modulos.admin.modalDocEmpresa('${tipo}','${d?.id||''}')">${d?'🔄 Reemplazar':'⬆️ Subir'}</button>
                ${d ? Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('documentos_empresa','${d.id}','${tipo}',()=>Modulos.admin._renderDocumentosEmpresa())`) : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div class="card-sub" style="margin:0">📎 Documentos adicionales</div>
          <button class="btn btn-sm btn-amber" onclick="Modulos.admin.modalDocEmpresa('')">＋ Agregar documento</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${adicionales.length ? adicionales.map(d => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface2);border-radius:8px;flex-wrap:wrap;gap:6px">
              <div>
                <b style="font-size:13px">${d.tipo}</b>
                <div style="font-size:11px;color:var(--text3)">${d.nombre_archivo||''} · subido ${UI.fecha(d.created_at)}</div>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-sm btn-cyan" onclick="Modulos.admin.verDocEmpresa('${d.id}')">👁 Ver</button>
                <button class="btn btn-sm btn-ghost" onclick="Modulos.admin.modalDocEmpresa('${d.tipo.replace(/'/g,"\\'")}','${d.id}')">🔄 Reemplazar</button>
                ${Modulos.btnAccion('eliminar', `Modulos.eliminarRegistro('documentos_empresa','${d.id}','${d.tipo.replace(/'/g,"\\'")}',()=>Modulos.admin._renderDocumentosEmpresa())`)}
              </div>
            </div>`).join('') : `<div class="text-muted" style="font-size:12px">Sin documentos adicionales.</div>`}
        </div>
      </div>`;
  },

  modalDocEmpresa(tipo='', docId='') {
    this._docEmpresaFile = null;
    const esNuevo = !tipo;
    UI.modal(esNuevo ? '🗂️ Agregar Documento' : `🗂️ ${tipo}`, `
      ${esNuevo ? `
      <div class="form-group"><label class="form-label">Nombre del documento *</label>
        <input class="form-input" id="de-tipo" placeholder="Ej. Licencia Sanitaria"></div>` : ''}
      <div class="form-group">
        <label class="form-label">Archivo (imagen o PDF)</label>
        <label class="btn btn-ghost" style="width:100%;cursor:pointer;text-align:center;display:block">
          📂 Seleccionar archivo
          <input type="file" accept="image/*,application/pdf" class="hidden" onchange="Modulos.admin._seleccionarDocEmpresa(this)">
        </label>
        <div id="de-info" style="font-size:11px;color:var(--text3);margin-top:6px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button>
        <button class="btn btn-amber" onclick="Modulos.admin.guardarDocEmpresa('${tipo.replace(/'/g,"\\'")}','${docId}')">Guardar</button>
      </div>`, '480px');
  },

  async _seleccionarDocEmpresa(input) {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const r = await UI.fileABase64(f, { maxPx: 1600, maxPdfMB: 5 });
      this._docEmpresaFile = { nombre: f.name, base64: r.base64, esPdf: r.esPdf };
      const info = document.getElementById('de-info');
      if (info) info.textContent = '✓ ' + f.name;
    } catch(e) { UI.toast(e.message,'error'); input.value=''; }
  },

  async guardarDocEmpresa(tipo, docId) {
    if (!tipo) tipo = document.getElementById('de-tipo')?.value.trim();
    if (!tipo) { UI.toast('Ingresa el nombre del documento','error'); return; }
    if (!this._docEmpresaFile && !docId) { UI.toast('Selecciona un archivo','error'); return; }

    const fields = { tipo };
    if (docId) fields.id = docId;
    if (this._docEmpresaFile) {
      fields.nombre_archivo = this._docEmpresaFile.nombre;
      fields.base64 = this._docEmpresaFile.base64;
      fields.es_pdf = this._docEmpresaFile.esPdf;
      fields.updated_at = new Date().toISOString();
    }
    if (!docId) fields.created_by = Auth.user?.id || null;

    const { error } = await DB.upsertDocumentoEmpresa(fields);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    this._docEmpresaFile = null;
    UI.cerrarModal();
    UI.toast('Documento guardado ✓');
    this._renderDocumentosEmpresa();
  },

  async verDocEmpresa(id) {
    const docs = await DB.getDocumentosEmpresa();
    const d = docs.find(x=>x.id===id);
    if (!d?.base64) { UI.toast('Sin archivo','error'); return; }
    UI.verAdjunto(d.base64, d.tipo);
  },

  /* ── AUDITORÍA ──────────────────────────── */
  _ENTIDADES: {
    clientes:'Cliente', vehiculos:'Vehículo', ordenes:'Orden de Trabajo', ot_items:'Ítem de OT',
    inventario:'Inventario', inventario_movimientos:'Movimiento de inventario', bodegas:'Bodega',
    proveedores:'Proveedor', facturas:'Factura', factura_items:'Línea de factura', empleados:'Empleado',
    usuarios:'Usuario', bancos:'Cuenta bancaria', banco_movimientos:'Movimiento bancario',
    ingresos:'Ingreso', egresos:'Egreso', egresos_recurrentes:'Gasto recurrente',
    combos:'Combo', promociones:'Promoción', citas:'Cita',
    pagos_nomina:'Pago de nómina', viaticos:'Viático', licencias:'Licencia', config_fiscal:'Config. fiscal',
    config_integraciones:'Integraciones', config_productividad:'Config. productividad',
    empleado_documentos:'Documento de empleado', kpi_empleado:'KPI de empleado',
    activos:'Activo / herramienta', presupuesto:'Presupuesto',
    trabajos_externos:'Trabajo externo', envios:'Envío / flete', tenants:'Taller'
  },

  async _renderAuditoria() {
    const cont = document.getElementById('aud-tabla');
    if (!cont) return;
    const filtro = document.getElementById('aud-filtro')?.value || null;
    const logs = await DB.getActividad({ accion: filtro, limite: 300 });
    const acc = { insert:['➕','Creó','green'], update:['✏️','Modificó','cyan'], delete:['🗑️','Eliminó','red'] };
    cont.innerHTML = `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Registro</th></tr></thead>
        <tbody>
          ${logs.map(l=>{
            const a = acc[l.accion] || ['•', l.accion, 'gray'];
            return `<tr>
              <td class="mono-sm">${new Date(l.created_at).toLocaleString('es-GT')}</td>
              <td>${l.usuario_nombre||'—'}</td>
              <td><span class="badge badge-${a[2]}">${a[0]} ${a[1]}</span></td>
              <td>${this._ENTIDADES[l.entidad]||l.entidad||'—'} <small class="text-muted">${l.entidad_id?('#'+String(l.entidad_id).slice(0,8)):''}</small></td>
            </tr>`;
          }).join('')||'<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3)">Sin actividad registrada</td></tr>'}
        </tbody>
      </table></div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px">Mostrando hasta 300 eventos recientes.</div>`;
  },

  /* ── UTILIDADES ─────────────────────────── */
  async _getCounts() {
    const tablas = [
      ['Clientes','👥','clientes'],['Vehículos','🚗','vehiculos'],
      ['Órdenes','📋','ordenes'],['Inventario','📦','inventario'],
      ['Empleados','👤','empleados'],['Facturas','🧾','facturas'],
      ['Ingresos','📈','ingresos'],['Egresos','📉','egresos']
    ];
    return Promise.all(tablas.map(([l,i,t])=>
      getSB().from(t).select('*',{count:'exact',head:true}).eq('tenant_id',getTID())
        .then(({count})=>[l,i,count||0])
    ));
  },

  /* ── ENCRIPTACIÓN AES-256-GCM ────────────── */
  async _getKey(password='TallerPro-v3-2026') {
    const enc     = new TextEncoder();
    const keyMat  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name:'PBKDF2', salt:enc.encode('tallerpro-salt-2026'), iterations:100000, hash:'SHA-256' },
      keyMat, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']
    );
  },

  async _encrypt(data) {
    const key  = await this._getKey();
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const enc  = new TextEncoder();
    const ct   = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
    const buf  = new Uint8Array(iv.byteLength + ct.byteLength);
    buf.set(iv, 0); buf.set(new Uint8Array(ct), iv.byteLength);
    return btoa(String.fromCharCode(...buf));
  },

  async _decrypt(b64) {
    const buf  = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const iv   = buf.slice(0, 12);
    const ct   = buf.slice(12);
    const key  = await this._getKey();
    const pt   = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  },

  /* ── EXPORTAR ────────────────────────────── */
  async exportarCSV(tabla, label) {
    UI.toast(`Exportando ${label}...`, 'info');
    const { data } = await getSB().from(tabla).select('*').eq('tenant_id', getTID());
    if (!data?.length) { UI.toast('Sin datos','warn'); return; }
    const cols = Object.keys(data[0]).filter(k=>k!=='tenant_id');
    const csv  = [cols.join(','), ...data.map(r=>cols.map(c=>{
      const v = r[c]; if (!v&&v!==0) return '';
      return '"'+String(typeof v==='object'?JSON.stringify(v):v).replace(/"/g,'""')+'"';
    }).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
    a.download = `${tabla}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    UI.toast(`${label} exportado ✓`);
  },

  async exportarEncriptado(tabla, label) {
    UI.toast(`Encriptando ${label}...`, 'info');
    const { data } = await getSB().from(tabla).select('*').eq('tenant_id', getTID());
    if (!data?.length) { UI.toast('Sin datos','warn'); return; }
    try {
      const encrypted = await this._encrypt({ tabla, data, exportado: new Date().toISOString(), taller: Auth.tenant?.name });
      const a = document.createElement('a');
      a.href = 'data:application/octet-stream;base64,'+encrypted;
      a.download = `${tabla}-${new Date().toISOString().slice(0,10)}.tpro`;
      a.click();
      UI.toast(`${label} exportado y encriptado ✓`);
    } catch(e) { UI.toast('Error al encriptar: '+e.message,'error'); }
  },

  async exportarBackupCompleto() {
    UI.toast('Generando backup completo...', 'info', 8000);
    const tablas = ['clientes','vehiculos','ordenes','ot_items','trabajos_externos','envios','inventario',
                    'inventario_movimientos','proveedores','activos','empleados','empleado_documentos',
                    'kpi_empleado','pagos_nomina','viaticos','ingresos','egresos','egresos_recurrentes',
                    'presupuesto','facturas','factura_items','bancos','banco_movimientos','bodegas',
                    'combos','promociones','citas','config_fiscal','config_productividad'];
    const backup = { version:'3.0', fecha: new Date().toISOString(), taller: Auth.tenant, licencia: Auth.licencia };

    for (const tabla of tablas) {
      const { data } = await getSB().from(tabla).select('*').eq('tenant_id', getTID());
      backup[tabla] = data || [];
    }

    try {
      const encrypted = await this._encrypt(backup);
      const a = document.createElement('a');
      a.href = 'data:application/octet-stream;base64,'+encrypted;
      a.download = `backup-${Auth.tenant?.name?.replace(/\s/g,'-')}-${new Date().toISOString().slice(0,10)}.tpro`;
      a.click();
      UI.toast('Backup completo generado ✓');
    } catch(e) { UI.toast('Error: '+e.message,'error'); }
  },

  /* ── IMPORTAR ────────────────────────────── */
  async importarBackup(input) {
    const file = input.files?.[0];
    if (!file) return;
    UI.toast('Desencriptando backup...', 'info');
    try {
      const text    = await file.text();
      const backup  = await this._decrypt(text);

      if (!backup.version) { UI.toast('Archivo inválido o corrupto','error'); return; }

      const ok = await UI.confirmar(
        `¿Importar backup de <b>${backup.taller?.name||'—'}</b>?<br>
         Fecha: ${UI.fecha(backup.fecha)}<br>
         Se importarán los datos de ${Object.keys(backup).filter(k=>Array.isArray(backup[k])).length} tablas.`,
        'Importar Backup'
      );
      if (!ok) return;

      const tid = getTID();
      const tablas = Object.keys(backup).filter(k=>Array.isArray(backup[k])&&backup[k].length>0);

      for (const tabla of tablas) {
        const rows = backup[tabla].map(r=>({ ...r, tenant_id:tid, id:undefined }));
        await getSB().from(tabla).insert(rows).then(({error})=>{
          if (error) console.warn(`Import ${tabla}:`, error.message);
        });
      }

      /* Restaurar licencia si era completa */
      if (backup.licencia?.tipo==='completa') {
        await getSB().from('licencias').upsert({
          tenant_id: tid, tipo:'completa', activa:true,
          codigo: backup.licencia.codigo
        }, { onConflict:'tenant_id' });
      }

      UI.toast('Backup restaurado exitosamente ✓');
      this._renderTab();
    } catch(e) { UI.toast('Error al importar: '+e.message,'error'); }
  },

  async importarCSV(input, tabla, label) {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(l=>l.trim());
    if (lines.length < 2) { UI.toast('Archivo vacío','error'); return; }
    const headers = lines[0].split(',').map(h=>h.replace(/"/g,'').trim());
    const rows = lines.slice(1).map(line=>{
      const vals = line.match(/(".*?"|[^,]+)(?=,|$)/g)||[];
      const obj = { tenant_id:getTID() };
      headers.forEach((h,i)=>{ obj[h]=(vals[i]||'').replace(/^"|"$/g,'').trim()||null; });
      delete obj.id;
      return obj;
    });
    const ok = await UI.confirmar(`¿Importar <b>${rows.length} registros</b> en ${label}?`,'Importar');
    if (!ok) return;
    const { error } = await getSB().from(tabla).insert(rows);
    if (error) { UI.toast('Error: '+error.message,'error'); return; }
    UI.toast(`${rows.length} registros importados ✓`);
  },

  /* ── OTP Y BORRADO ───────────────────────── */
  generarMiOTP() {
    const userId = Auth.user?.id;
    const nombre = Auth.user?.nombre;
    const code   = String(Math.floor(100000+Math.random()*900000));
    const expires = Date.now()+10*60*1000;
    if (!window._adminOTPs) window._adminOTPs = {};
    window._adminOTPs[userId] = { code, expires, nombre };

    const el = document.getElementById('otp-display');
    if (el) {
      el.innerHTML = `
        <div class="card card-amber" style="text-align:center;padding:16px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:6px">${nombre} — válido 10 min</div>
          <div style="font-family:'DM Mono',monospace;font-size:40px;font-weight:700;color:var(--amber);letter-spacing:10px">${code}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">Comparte con el otro administrador</div>
          <div id="otp-countdown" style="font-size:12px;color:var(--text3);margin-top:4px"></div>
        </div>`;
      const end = Date.now()+600000;
      const t = setInterval(()=>{
        const r = Math.max(0,Math.floor((end-Date.now())/1000));
        const cd = document.getElementById('otp-countdown');
        if (cd) cd.textContent = `Expira en: ${Math.floor(r/60)}:${String(r%60).padStart(2,'0')}`;
        else clearInterval(t);
        if (!r) { clearInterval(t); if(cd) cd.style.color='var(--red)'; }
      },1000);
    }
  },

  _validarOTP(code) {
    if (!window._adminOTPs) return false;
    return Object.values(window._adminOTPs).some(o=>o.code===code&&o.expires>Date.now());
  },

  async ejecutarBorrado() {
    const otp1  = document.getElementById('otp1')?.value.trim();
    const otp2  = document.getElementById('otp2')?.value.trim();
    const texto = document.getElementById('confirm-text')?.value.trim().toLowerCase();

    if (!otp1||!otp2) { UI.toast('Ingresa los dos OTPs','error'); return; }
    if (otp1===otp2)  { UI.toast('Los OTPs deben ser de dos administradores diferentes','error'); return; }
    if (texto!=='acepto borrar base de datos') { UI.toast('El texto de confirmación no es correcto','error'); return; }
    if (!this._validarOTP(otp1)) { UI.toast('OTP 1 inválido o expirado','error'); return; }
    if (!this._validarOTP(otp2)) { UI.toast('OTP 2 inválido o expirado','error'); return; }

    const ok = await UI.confirmar(
      `<div style="color:var(--red);font-size:16px;font-weight:800;margin-bottom:12px">☢️ ÚLTIMA CONFIRMACIÓN</div>
       Esto borrará <b>TODOS</b> los datos de <b>${Auth.tenant?.name}</b>.<br>
       Esta acción es <b>IRREVERSIBLE</b>.`, '☢️ SÍ, BORRAR TODO'
    );
    if (!ok) return;

    UI.toast('Ejecutando borrado seguro...', 'warn', 15000);
    const tid = getTID();
    const licencia = await DB.getLicencia();

    /* Orden de borrado respetando llaves foráneas (hijos antes que padres;
       pagos_nomina/viaticos/citas/facturas/ordenes son NO ACTION). */
    const tablas = [
      'envios','trabajos_externos','ot_items','factura_items','banco_movimientos','inventario_movimientos',
      'kpi_empleado','empleado_documentos','pagos_nomina','viaticos','citas',
      'facturas','ordenes','vehiculos','bancos','inventario','empleados',
      'activos','egresos_recurrentes','presupuesto','config_productividad',
      'combos','promociones','egresos','ingresos','proveedores','bodegas','clientes'
    ];

    for (const t of tablas) {
      const { error } = await getSB().from(t).delete().eq('tenant_id',tid);
      if (error) console.warn(`Borrado ${t}:`, error.message);
    }

    await getSB().from('usuarios').delete()
      .eq('tenant_id',tid)
      .not('email','in','("henry.chinchilla@gmail.com","demo@demo.com")');

    if (licencia?.tipo==='completa') {
      await getSB().from('licencias').upsert({
        tenant_id:tid, tipo:'completa', activa:true, codigo:licencia.codigo
      },{ onConflict:'tenant_id' });
    }

    window._adminOTPs = {};
    UI.toast('Base de datos borrada ✓ — Cerrando sesión...','warn',4000);
    setTimeout(async()=>{ await Auth.logout(); location.reload(); },3000);
  }
};
