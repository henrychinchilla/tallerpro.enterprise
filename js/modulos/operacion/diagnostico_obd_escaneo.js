/* NexusPro — Diagnóstico OBD · Pantalla del escáner: listado, modal de escaneo, verificación de adaptadores, el flujo de escanear(), el resultado y el informe de Nexus.

   Es parte de Modulos.diagnostico_obd: el objeto se define en
   diagnostico_obd.js (núcleo y conexión) y cada parte le agrega sus métodos.
   Se dividió el 2026-09-22 porque el archivo único pasaba de 9.000 líneas.
   defineProperties + getOwnPropertyDescriptors (y no Object.assign) para que
   los get/set viajen como accesores y no como el valor del momento. */
(() => {
  const M = Modulos.diagnostico_obd;
  Object.defineProperties(M, Object.getOwnPropertyDescriptors({

  /* ═══════════ VISTA PRINCIPAL (lista por mes) ═══════════ */
  async render() {
    const el = document.getElementById('page-content');
    if (!el) return;
    UI.loading(el);
    const puedeEditar = typeof puedeAccion === 'function' ? (puedeAccion('diagnostico_obd', 'editar') || puedeAccion('diagnostico_obd', 'crear') || puedeAccion('diagnostico_obd', 'ver')) : true;
    const now = new Date();
    if (!this._mes)  this._mes  = now.getMonth() + 1;
    if (!this._anio) this._anio = now.getFullYear();
    const ini = `${this._anio}-${String(this._mes).padStart(2,'0')}-01`;
    const fin = new Date(this._anio, this._mes, 0).toISOString().slice(0,10);

    try {
      [this._data, this._vehiculos] = await Promise.all([
        DB.getDiagnosticosOBD(ini, fin), DB.getVehiculos()
      ]);
    } catch (e) {
      console.error('Error al cargar diagnósticos OBD:', e);
      this._data = this._data || [];
      this._vehiculos = this._vehiculos || [];
    }

    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const anios = [this._anio - 1, this._anio, this._anio + 1];
    const conFallas = (this._data || []).filter(d => (d.dtcs||[]).length).length;
    if (this._scan) {
      const v = this._scan.vehiculos || (this._vehiculos || []).find(x => x.id === this._scan.vehiculo_id);
      el.innerHTML = `
        <div class="page-header" style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%);padding:16px 20px;border-radius:12px;margin-bottom:16px;box-shadow:0 4px 20px rgba(0,0,0,0.15)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="background:#2563eb;color:#fff;font-size:10px;font-weight:900;padding:2px 8px;border-radius:4px;letter-spacing:1px">NEXUS PRO TABLET</span>
                <span style="color:#06b6d4;font-size:11px;font-weight:700">CAN BUS TOPOLOGY 3.0</span>
              </div>
              <h1 class="page-title" style="color:#fff;margin:4px 0 0;font-size:22px;display:flex;align-items:center;gap:8px">
                🩺 Diagnóstico OBD-II & UDS OEM
              </h1>
              <p class="page-subtitle" style="color:#94a3b8;margin-top:2px;font-size:12px">
                ${v ? `🚘 <b>${UI.esc(v.placa||'s/placa')}</b> · ${UI.esc(v.marca||'')} ${UI.esc(v.modelo||'')} ${UI.esc(v.anio||'')}` : (UI.esc(this._scan.vin||'Escaneo en memoria'))}
              </p>
            </div>
            <div class="page-actions" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              ${!this._scan.id ? `<button class="btn" style="background:#0ea5e9;color:#fff;border:none;font-weight:800" onclick="Modulos.diagnostico_obd.guardarEscaneo()">💾 Guardar escaneo</button>` : ''}
              <button class="btn" style="background:#1e293b;color:#f8fafc;border:1px solid #334155" onclick="Modulos.diagnostico_obd.imprimir()">🖨 Imprimir escaneo</button>
              ${(this._scan.traza || []).length ? `<button class="btn" style="background:#1e293b;color:#f8fafc;border:1px solid #334155"
                title="Copia el diálogo crudo con el vehículo para mandarlo a soporte cuando algo no cuadre"
                onclick="Modulos.diagnostico_obd.copiarTraza()">🧾 Bitácora técnica</button>` : ''}
              <button class="btn" style="background:#1e293b;color:#f8fafc;border:1px solid #334155" onclick="Modulos.diagnostico_obd.cerrarScanActivo()">📋 Historial</button>
              <button class="btn" style="background:#1e293b;color:#f8fafc;border:1px solid #334155" onclick="Modulos.diagnostico_obd.modalCampanas()">🔔 Campañas</button>
              <span id="obd-estado-conexion" style="display:inline-flex;align-items:center;gap:6px"></span>
              <button class="btn" onclick="Modulos.diagnostico_obd.modalMotocicletas()">🏍 Motocicletas</button>
            <button class="btn" onclick="Modulos.diagnostico_obd.modalMapaTransporte()">🗺 Mapa y ruta de diagnóstico</button>
            <button class="btn" style="background:#0891b2;color:#ffffff;border:none;font-weight:700" onclick="Modulos.diagnostico_obd.modalCentroModulos()">🧠 Centro de Módulos</button>
              <button class="btn" style="background:linear-gradient(135deg, #0284c7 0%, #2563eb 100%);color:#ffffff;font-weight:800;border:none;box-shadow:0 0 14px rgba(37,99,235,0.6);padding:8px 16px" onclick="Modulos.diagnostico_obd.modalEscanear()">📡 Escanear Otro Vehículo</button>
            </div>
          </div>
        </div>
        <div class="page-body">
          <div style="background:linear-gradient(90deg, rgba(6,182,212,0.12) 0%, rgba(16,185,129,0.08) 100%);border:1px solid rgba(6,182,212,0.3);padding:12px 16px;border-radius:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div>
              <span style="font-size:11px;font-weight:800;color:var(--cyan);text-transform:uppercase;letter-spacing:0.8px;display:inline-flex;align-items:center;gap:5px">
                <span style="width:8px;height:8px;border-radius:50%;background:#06b6d4;display:inline-block;box-shadow:0 0 8px #06b6d4"></span>
                ⚡ SESIÓN VIVA ACTIVA DE DIAGNÓSTICO
              </span>
              <div style="font-size:13px;font-weight:700;margin-top:2px;color:var(--text)">
                ${v ? `${UI.esc(v.placa||'')} · ${UI.esc(v.marca||'')} ${UI.esc(v.modelo||'')} ${UI.esc(v.anio||'')}` : (UI.esc(this._scan.vin||'Escaneo activo'))}
              </div>
              <div style="font-size:11.5px;margin-top:3px;color:${this._scan.id ? 'var(--green)' : 'var(--amber)'}">
                ${this._scan.id
                  ? '✔ guardado en el historial'
                  : '● sin guardar — se queda acá mientras trabajás; nada lo cierra salvo Guardar o Historial'}
              </div>
            </div>
            <div style="display:flex;gap:8px">
              ${!this._scan.id ? `<button class="btn btn-sm" style="background:#0ea5e9;color:#fff;border:none;font-weight:800" onclick="Modulos.diagnostico_obd.guardarEscaneo()">💾 Guardar</button>` : ''}
              <button class="btn btn-sm" style="background:#1e293b;color:#f8fafc;border:1px solid #334155" onclick="Modulos.diagnostico_obd.imprimir()">🖨 Imprimir escaneo</button>
              <button class="btn btn-sm" style="background:#1e293b;color:#f8fafc;border:1px solid #334155" onclick="Modulos.diagnostico_obd.cerrarScanActivo()">📋 Ver Historial del Mes</button>
              <button class="btn btn-sm" style="background:linear-gradient(135deg, #0284c7 0%, #2563eb 100%);color:#ffffff;font-weight:800;border:none" onclick="Modulos.diagnostico_obd.modalEscanear()">📡 Nuevo Escaneo</button>
            </div>
          </div>
          <div id="obd-result"></div>
        </div>
      `;
      this._renderResultado();
      this._pintarEstadoConexion();
      return;
    }

    el.innerHTML = `
      <div class="page-header" style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%);padding:16px 20px;border-radius:12px;margin-bottom:16px;box-shadow:0 4px 20px rgba(0,0,0,0.15)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="background:#2563eb;color:#fff;font-size:10px;font-weight:900;padding:2px 8px;border-radius:4px;letter-spacing:1px">NEXUS PRO DIAGNOSTICS</span>
            </div>
            <h1 class="page-title" style="color:#fff;margin:4px 0 0;font-size:22px">🩺 Diagnóstico OBD-II & UDS Multimarca</h1>
            <p class="page-subtitle" style="color:#94a3b8;margin-top:2px;font-size:12px">// Bluetooth BLE/SPP (Vgate/ELM327) · USB RP1210 (J1939/CAN Heavy Duty)</p>
          </div>
          <div class="page-actions" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <select class="form-select" style="width:130px;background:#1e293b;color:#f8fafc;border:1px solid #334155" onchange="Modulos.diagnostico_obd._mes=+this.value;Modulos.diagnostico_obd.render()">
              ${meses.map((m,i)=>`<option value="${i+1}" ${i+1===this._mes?'selected':''}>${m}</option>`).join('')}
            </select>
            <select class="form-select" style="width:90px;background:#1e293b;color:#f8fafc;border:1px solid #334155" onchange="Modulos.diagnostico_obd._anio=+this.value;Modulos.diagnostico_obd.render()">
              ${anios.map(a=>`<option ${a===this._anio?'selected':''}>${a}</option>`).join('')}
            </select>
            <button class="btn" style="background:#1e293b;color:#f8fafc;border:1px solid #334155" onclick="Modulos.diagnostico_obd.modalCampanas()">🔔 Campañas</button>
            <span id="obd-estado-conexion" style="display:inline-flex;align-items:center;gap:6px"></span>
            <button class="btn" style="background:#1e293b;color:#f8fafc;border:1px solid #334155" onclick="Modulos.diagnostico_obd.modalMapaVehiculos()" title="Mapa de Cobertura">🗺 Cobertura</button>
            <button class="btn" onclick="Modulos.diagnostico_obd.modalMotocicletas()">🏍 Motocicletas</button>
            <button class="btn" onclick="Modulos.diagnostico_obd.modalMapaTransporte()">🗺 Mapa y ruta de diagnóstico</button>
            <button class="btn" style="background:#0891b2;color:#ffffff;border:none;font-weight:700" onclick="Modulos.diagnostico_obd.modalCentroModulos()">🧠 Centro de Módulos</button>
            <button class="btn" style="background:#1e293b;color:#f8fafc;border:1px solid #334155" onclick="Modulos.diagnostico_obd.render()">↻ Actualizar</button>
            <button class="btn" style="background:linear-gradient(135deg, #0284c7 0%, #2563eb 100%);color:#ffffff;font-weight:800;border:none;box-shadow:0 0 14px rgba(37,99,235,0.6);padding:8px 16px" onclick="Modulos.diagnostico_obd.modalEscanear()">📡 Nuevo Escaneo</button>
          </div>
        </div>
      </div>
      <div class="page-body">
        ${!this._hayBluetooth ? `<div class="card" style="border-left:4px solid var(--amber);padding:12px;margin-bottom:12px;background:rgba(245,158,11,0.08)">
          ⚠️ Este navegador no soporta Bluetooth. Para escanear por Bluetooth usa <b>Chrome o Edge en Android</b> (o la app NexusPro) o una PC con Bluetooth. El escaneo por <b>USB (puente RP1210)</b> sí está disponible desde esta PC.
        </div>` : ''}
        <div class="table-wrap">
          <table class="data-table" style="width:100%">
            <thead><tr>
              <th style="width:110px">Fecha</th>
              <th style="width:230px">Vehículo</th>
              <th style="width:170px">VIN</th>
              <th style="width:125px">Check Engine</th>
              <th style="width:95px">Fallas</th>
              <th style="width:85px">Voltaje</th>
              <th style="width:210px;text-align:right">Acciones</th>
            </tr></thead>
            <tbody>
              ${this._data.length ? this._data.map(d => {
                const v = d.vehiculos;
                const n = (d.dtcs||[]).length, np = (d.dtcs_pendientes||[]).length;
                return `<tr style="cursor:pointer" onclick="Modulos.diagnostico_obd.ver('${d.id}')">
                  <td>${UI.fecha(d.created_at)}</td>
                  <td>${v ? `<b>${UI.esc(v.placa||'')}</b> ${UI.esc(v.marca||'')} ${UI.esc(v.modelo||'')}` : '—'}</td>
                  <td style="font-family:monospace;font-size:11px">${UI.esc(d.vin||'—')}</td>
                  <td>${d.mil ? '<span class="badge badge-red">🔴 Encendido</span>' : '<span class="badge badge-green">Apagado</span>'}</td>
                  <td>${n ? `<span class="badge badge-red">${n}</span>` : '<span class="badge badge-green">0</span>'}${np?` <span class="badge badge-amber" title="pendientes">${np}p</span>`:''}${d.dtcs_borrados?' 🧹':''}</td>
                  <td>${UI.esc(d.voltaje||'—')}</td>
                  <td style="text-align:right;white-space:nowrap" onclick="event.stopPropagation()">
                    <div style="display:inline-flex;gap:4px;justify-content:flex-end">
                      ${Modulos.btnAccion('ver', `Modulos.diagnostico_obd.ver('${d.id}')`)}
                      ${Modulos.btnAccion('editar', `Modulos.diagnostico_obd.modalEditar('${d.id}')`)}
                      ${Modulos.btnAccion('imprimir', `Modulos.diagnostico_obd.imprimir('${d.id}')`)}
                      ${Modulos.btnAccion('eliminar', `Modulos.diagnostico_obd.eliminar('${d.id}')`)}
                    </div>
                  </td></tr>`;
              }).join('') : `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">
                Sin escaneos en ${meses[this._mes-1]} ${this._anio}. ${puedeEditar&&this._hayBluetooth?'Conecta un adaptador OBD-II BLE y presiona 📡 Nuevo Escaneo.':''}
              </td></tr>`}
            </tbody>
          </table>
        </div>
        ${this._data.length ? `<p style="color:var(--text3);font-size:12px;margin-top:8px">${this._data.length} escaneo(s) · ${conFallas} con fallas activas</p>` : ''}
      </div>`;
    /* Va DESPUES de pintar: el chip vive dentro del HTML que se acaba de
       reemplazar, asi que pintarlo antes seria pintarlo sobre un nodo muerto
       (el mismo problema del render rezagado del 2026-09-02). */
    this._pintarEstadoConexion();
  },

  /* Salir del escaneo es una decisión, no un efecto secundario: si todavía no
     se guardó, se pierde el trabajo del vehículo enchufado. Se pregunta. */
  async cerrarScanActivo() {
    if (this._scan && !this._scan.id) {
      const ok = await UI.confirmar(
        '¿Salir del escaneo <b>sin guardarlo</b>?<br><br>' +
        '<small>Se pierden los códigos, el barrido por módulo y la bitácora técnica de este vehículo. ' +
        'Para conservarlo, cancelá y presioná <b>💾 Guardar escaneo</b>.</small>', 'Salir sin guardar');
      if (!ok) return;
    }
    this._scan = null;
    this._centroScan = null;
    this.render();
  },

  /* ═══════════ NUEVO ESCANEO ═══════════ */
  /* `vehId` llega cuando se entra desde la ficha del vehículo: evita tener que
     buscarlo de nuevo en una lista que en un taller con flota es larga. */
  async modalEscanear(vehId, categoria) {
    /* Arrancar otro escaneo tira el de ahora. Antes lo hacía en silencio. */
    if (this._scan && !this._scan.id) {
      const ok = await UI.confirmar(
        'El escaneo que está en pantalla <b>todavía no se guardó</b>. Empezar otro lo descarta.<br><br>' +
        '<small>Cancelá y presioná <b>💾 Guardar escaneo</b> si querés conservarlo.</small>',
        'Descartar y escanear otro');
      if (!ok) return;
    }
    this._scan = null;
    /* Al entrar desde la ficha del vehículo este módulo puede no haberse
       renderizado todavía, así que su lista estaría vacía y el selector
       saldría sin opciones. */
    if (!this._vehiculos || !this._vehiculos.length) {
      try { this._vehiculos = await DB.getVehiculos() || []; } catch (_) { this._vehiculos = []; }
    }
    /* El puente USB es un programa de WINDOWS: en telefono y tablet no falta,
       no existe. Dejarlo como primera opcion hacia que el arranque por defecto
       en un celular fuera la unica via imposible, y el mecanico veia "no hay
       conexion" sin haber elegido nada mal. */
    /* Y en una PC con Chrome/Edge la opción que arrancaba marcada era "USB —
       detectar solo", que lo primero que hace es exigir el puente: sin el .bat
       corriendo, apretar Escanear sin tocar nada devolvía "No se encontró el
       puente USB en esta PC". El caso real de taller es el dongle Bluetooth ya
       emparejado, y ése hoy entra por COM sin ningún programa aparte. */
    const viaPorDefecto = this._nativo ? 'android'
      : (this._esMovil() ? 'ble' : (this._puedeWebSerial() ? 'classic' : 'auto'));
    const esMoto = categoria === 'moto';
    const seleccionables = esMoto ? this._vehiculos.filter(v => this._categoriaTransporte(v) === 'moto') : this._vehiculos;
    UI.modal(esMoto ? '🏍 Escaneo de motocicleta · OBD compatible' : '📡 Nuevo Escaneo OBD-II', `
      ${esMoto ? '<p>Usa el cable y protocolo documentados para esta motocicleta. La lectura OBD de emisiones no garantiza acceso a ABS, IMU o inmovilizador.</p>' : ''}
      <div class="form-group">
        <label class="form-label">Vehículo *</label>
        <select class="form-select" id="obd-veh" onchange="Modulos.diagnostico_obd._avisoAcceso(this.value)">
          <option value="">— Seleccionar vehículo —</option>
          ${seleccionables.map(v=>`<option value="${v.id}"${vehId===v.id?' selected':''}>${v.placa||'s/placa'} · ${UI.esc(v.marca||'')} ${UI.esc(v.modelo||'')} ${v.anio||''} ${v.clientes?`(${UI.esc(v.clientes.nombre)})`:''}</option>`).join('')}
        </select>
      </div>
      <div id="obd-aviso"></div>
      <div class="form-group">
        <label class="form-label">Conexión</label>
        <select class="form-select" id="obd-via" onchange="Modulos.diagnostico_obd._verApis()">
          ${this._nativo ? `<option value="android" selected>📲 Bluetooth de la app — BLE y clásico (SPP) · recomendado</option>` : ''}
          <option value="auto"${viaPorDefecto === 'auto' ? ' selected' : ''}>🔎 USB — detectar solo (liviano o camión, requiere el puente)${viaPorDefecto === 'auto' ? ' · recomendado' : ''}</option>
          <option value="ble"${viaPorDefecto === 'ble' ? ' selected' : ''}>📶 Bluetooth LE — otros dongles BLE (ELM327 / OBDLink)</option>
          <option value="classic"${viaPorDefecto === 'classic' ? ' selected' : ''}>📶 Bluetooth — escáner registrado en esta PC (vLinker MS por COM)${viaPorDefecto === 'classic' ? ' · recomendado' : ''}</option>
          ${!esMoto ? `<option value="j1939ble">🚚 Bluetooth — camión J1939 (dongle con protocolo A)</option>
          <option value="j1939">🚚 USB — forzar camión J1939 (puente RP1210)</option>
          <option value="j1708">🚛 USB — forzar camión antiguo J1708/J1587 (MID/PID/FMI)</option>` : ''}
          <option value="usb">🔌 USB — forzar vehículo liviano (puente RP1210)</option>
        </select>
      </div>
      <div class="form-group" id="obd-api-wrap">
        <label class="form-label">Adaptador / puerto local</label>
        <select class="form-select" id="obd-api" onchange="Modulos.diagnostico_obd._api=this.value||null">
          <option value="">Buscando adaptadores…</option>
        </select>
        <div id="obd-api-nota" style="font-size:11px;color:var(--text3);margin-top:4px">
          Un taller con software de fábrica (Cummins, Navistar, Allison…) tiene varios adaptadores RP1210 registrados. Si el de siempre no responde, probá con otro.
        </div>
      </div>
      <div id="obd-log" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.8;min-height:70px;max-height:220px;overflow:auto;margin:10px 0">
        Conecta el adaptador al puerto de diagnóstico del vehículo y enciende el switch.<br>
        ${this._nativo ? `· <b>Bluetooth de la app</b>: presiona <b>Conectar y Escanear</b> y elegí tu escáner de la lista.
          Alcanza las dos radios — BLE y clásico (SPP) — así que sirve también con dongles que el navegador no puede ver.<br>`
        : `· <b>Bluetooth (BLE)</b>: presiona <b>Conectar y Escanear</b> y elige el adaptador (ej. "OBDII", "Vgate", "iCar Pro").<br>
           &nbsp;&nbsp;Ojo: el navegador SOLO ve dongles en modo BLE. Uno en modo MFi/iPhone o de Bluetooth clásico no aparece
           en la lista aunque el sistema lo tenga emparejado — y desemparejarlo no ayuda.<br>
           · <b>Bluetooth clásico (SPP)</b>, solo en PC: elegí esa vía y el puerto COM, que ya sale con el nombre del equipo.<br>`}
        · USB: solo enchufa el USB-Link a esta PC — el puente arranca solo con Windows.<br>
        &nbsp;&nbsp;¿Primera vez en esta PC? <a href="/puente-obd/instalar-puente.bat" download style="color:var(--cyan)">⬇️ Instalar el puente USB</a> (doble clic al archivo descargado, una sola vez).
      </div>
      <div id="obd-panel"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-ghost" id="obd-btn-test" title="Verifica los canales y busca una respuesta OBD real cuando es posible" onclick="Modulos.diagnostico_obd.probarAdaptador()">🔧 Verificar adaptadores</button>
        <label style="margin-right:auto;display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text2)"
          title="Al cerrar, el escáner queda enlazado y se le manda un saludo cada pocos segundos para que no se duerma. No se transmite nada al vehículo.">
          <input type="checkbox" id="obd-mantener" ${this._mantenerConexion ? 'checked' : ''}
            onchange="Modulos.diagnostico_obd._mantenerConexion = this.checked">
          Mantener la conexión al cerrar</label>
        <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd._cerrarEscaneo()">Cancelar</button>
        ${this._puedeWebSerial() ? `<button class="btn btn-ghost" title="Usa solo el escáner Bluetooth ya registrado en esta PC, sin abrir el selector"
          onclick="Modulos.diagnostico_obd.escanearPorBluetooth('conocido')">📶 Forzar Bluetooth registrado</button>
        <button class="btn btn-ghost" title="Abre la lista de Windows para elegir otro escáner emparejado"
          onclick="Modulos.diagnostico_obd.escanearPorBluetooth('elegir')">🔁 Elegir otro escáner</button>` : ''}
        <button class="btn btn-brand" id="obd-btn-scan" onclick="Modulos.diagnostico_obd.escanear()">🔌 Conectar y Escanear</button>
        <button class="btn btn-ghost" id="obd-btn-traza" style="display:none"
          title="Copia el dialogo crudo con el vehiculo para mandarlo a soporte cuando algo no cuadre"
          onclick="Modulos.diagnostico_obd.copiarTraza()">🧾 Bitácora técnica</button>
        <button class="btn btn-cyan" id="obd-btn-save" style="display:none" onclick="Modulos.diagnostico_obd.guardarEscaneo()">💾 Guardar</button>
        <button class="btn btn-ghost" id="obd-btn-print" style="display:none" onclick="Modulos.diagnostico_obd.imprimir()">🖨 Imprimir escaneo</button>
      </div>`, '640px');

    /* Se puebla después de pintar el modal: hablar con el puente tarda y no
       vale la pena demorar la apertura por algo que solo aplica al USB. */
    this._api = null;
    this._verApis();
    this._cargarApis();
    /* Si se entro desde la ficha de un vehiculo ya viene elegido: el aviso tiene
       que estar ahi de entrada, no solo al cambiar la seleccion. */
    if (vehId) this._avisoAcceso(vehId);
  },

  /* ── Costo del escaneo ───────────────────────────────────────────────────
     Tarifa del taller: Q250 en liviano y Q750 en camión. La diferencia está en
     el tiempo y en el equipo — un camión necesita el adaptador RP1210 y
     recorrer varios módulos, un liviano se resuelve por OBD-II.
     Se calcula por el TIPO del vehículo, no por el protocolo: un camión al que
     se le escanea el OBD-II sigue siendo un camión. */
  _TARIFA: { liviano: 250, camion: 750 },
  _TIPOS_PESADOS: /cami[oó]n|pesado|tr[aá]iler|cabezal|bus|autob[uú]s|microb[uú]s|maquinaria|montacarga|industrial/i,

  _costoEscaneo(vehId) {
    const v = (this._vehiculos || []).find(x => x.id === vehId);
    const tipo = (v && v.tipo) || '';
    const pesado = this._TIPOS_PESADOS.test(tipo);
    return { monto: pesado ? this._TARIFA.camion : this._TARIFA.liviano,
             categoria: pesado ? 'camión' : 'liviano',
             tipo: tipo || null };
  },

  /* ── Elección de adaptador RP1210 ────────────────────────────────────────
     El puente carga la API en caliente, así que se puede usar cualquiera de las
     registradas en RP121032.INI (NEXIQ, DPA5, VXDIAG…). Sin esto quedaba atado
     al NEXIQ aunque la PC tuviera otros. */
  _api: null,

  /* ── Probar adaptador ────────────────────────────────────────────────────
     Cuando el escaneo falla, el mecánico se queda con un número de error y nada
     más. Esto recorre CADA adaptador instalado y prueba abrir cada protocolo
     que ese adaptador dice soportar, para responder la única pregunta que
     importa: ¿el problema es el cable, el adaptador, o el camión?

     Todo se hace con las operaciones que el puente ya tiene (apis/cargar/
     conectar), así que no hay que reinstalarlo en cada taller. Tampoco se lanza
     ningún .exe desde acá: darle al puente la capacidad de ejecutar programas
     abriría un agujero mucho peor que la molestia que ahorra. Si nada responde,
     se indica dónde está la herramienta del fabricante para abrirla a mano. */
  /* Las dos ultimas son las que faltaban, y por eso un vehiculo anterior a ~2006
     parecia "sin bus". Un liviano de esa epoca no diagnostica por CAN sino por
     K-line (pin 7): ISO 9141-2 o ISO 14230/KWP2000. Si el adaptador no las
     declara, este boton ahora lo dice en vez de dejar creer que el problema es
     el cable o el switch. */
  _PROTOS_PRUEBA: [
    { p:'J1708',        et:'J1708/J1587 · camión antiguo' },
    { p:'J1939',        et:'J1939 · camión moderno' },
    { p:'CAN:Baud=500', et:'CAN 500k · vehículo liviano', req:'CAN' },
    { p:'ISO15765',     et:'ISO 15765 · OBD-II sobre CAN', req:'ISO15765' },
    { p:'ISO9141',      et:'ISO 9141-2 · K-line, liviano anterior a ~2006', req:'ISO9141' },
    { p:'ISO14230',     et:'ISO 14230 / KWP2000 · K-line, liviano 2000-2008', req:'ISO14230' },
  ],

  /* Los mensajes que devuelve cada DLL vienen como salen del fabricante: con
     saltos de línea y espacios de relleno que descuadran el log. */
  _errLimpio(c) {
    const t = String((c && c.error) || (c && c.codigo != null ? 'código ' + c.codigo : 'sin respuesta'))
      .replace(/\s+/g, ' ').trim();
    return t.length > 110 ? t.slice(0, 107) + '…' : t;
  },

  async probarAdaptador() {
    /* Dos mundos detras del mismo boton: por USB hay que recorrer los drivers
       RP1210; por Bluetooth lo unico que se prueba es que el dongle elegido
       conteste. Un solo boton porque la pregunta del mecanico es una sola. */
    if (document.getElementById('obd-via')?.value === 'android') return this._probarBluetooth();
    const btn = document.getElementById('obd-btn-test');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Probando...'; }
    const log = m => this._log(m);
    const apiPrevia = this._api;
    let algunoAbierto = false;
    let vehiculoRespondio = false;
    try {
      await this._puenteConectar();
      const r = await this._puenteOp({ op:'apis' }, 5000);
      const apis = ((r && r.apis) || []).filter(a => a.instalado);
      if (!apis.length) { log('<b>No hay ningún adaptador RP1210 instalado en esta PC.</b>'); return; }

      log(`<b>Probando ${apis.length} adaptador(es)...</b>`);
      for (const a of apis) {
        const nombre = a.nombre || a.api;
        if (/^SERIAL:/i.test(String(a.api || ''))) {
          log(`&nbsp;&nbsp;<b>${nombre}</b> - Bluetooth clasico: se valida con su via COM, no como RP1210`);
          continue;
        }
        const soporta = ((a.protocolos) || []).map(p => String(p).split(',')[0].toUpperCase());
        /* Se prueban SOLO los protocolos que el adaptador declara. Intentar los
           demás sería medio minuto de esperas para llegar al mismo "no". */
        const pruebas = this._PROTOS_PRUEBA.filter(t =>
          soporta.includes((t.req || t.p.split(':')[0]).toUpperCase()));
        if (!pruebas.length) { log(`&nbsp;&nbsp;<b>${nombre}</b> — no maneja protocolos de vehículo, se omite`); continue; }

        const carga = await this._puenteOp({ op:'cargar', api:a.api }, 6000).catch(() => null);
        if (!carga || !carga.ok) {
          log(`&nbsp;&nbsp;<b>${nombre}</b> — <span style="color:var(--red)">no se pudo cargar</span>: ${this._errLimpio(carga)}`);
          continue;
        }
        const detalle = [];
        for (const t of pruebas) {
          const c = await this._puenteOp({ op:'conectar', protocolo:t.p, device:1, api:a.api }, 8000)
            .catch(() => ({ ok:false, error:'sin respuesta del puente' }));
          if (c.ok) {
            algunoAbierto = true;
            let respuesta = null;
            /* Abrir CAN solo confirma que el driver acepta el canal. En el
               canal generico hacemos ademas la consulta OBD minima 01 00 y
               buscamos 41 00; es lectura de capacidades y no modifica la ECU. */
            if (t.p === 'CAN:Baud=500') {
              const viaAntes = this._via, extAntes = this._canExt;
              try {
                this._via = 'usb'; this._canExt = false;
                const r0100 = await this._usbElm('0100', 1800).catch(() => 'NO DATA');
                respuesta = /4100/.test(String(r0100).replace(/\s/g, ''));
                if (respuesta) vehiculoRespondio = true;
              } finally { this._via = viaAntes; this._canExt = extAntes; this._canRx = null; }
            }
            detalle.push(respuesta === true
              ? `<span style="color:var(--green)">✓ ${t.et} · el vehículo respondió 01 00</span>`
              : `<span style="color:var(--green)">✓ ${t.et} · canal abierto (vehículo no confirmado)</span>`);
            await this._puenteOp({ op:'desconectar' }, 5000).catch(() => {});
          } else {
            detalle.push(`<span style="color:var(--text3)">✗ ${t.et} — ${this._errLimpio(c)}</span>`);
          }
        }
        log(`&nbsp;&nbsp;<b>${nombre}</b>${carga.version ? ` <span style="color:var(--text3)">v${carga.version}</span>` : ''}`);
        for (const d of detalle) log(`&nbsp;&nbsp;&nbsp;&nbsp;${d}`);
      }

      if (vehiculoRespondio) {
        log('<b style="color:var(--green)">✓ El vehículo respondió por CAN 500k.</b> El adaptador y el bus están comunicando; ya podés escanear.');
      } else if (algunoAbierto) {
        log('<b style="color:var(--amber)">⚠️ El driver abre el canal, pero no se confirmó respuesta del vehículo.</b> Esto no equivale a que la Juke haya contestado: verificá switch, alimentación del DLC, pines 6/14 y que ninguna otra aplicación tenga el USB-Link ocupado.');
      } else {
        /* El caso más común y el más frustrante: todo "instalado" pero nada
           enchufado. Conviene decirlo con todas las letras. */
        log('<b style="color:var(--red)">Ningún adaptador respondió.</b> Los drivers están, pero el hardware no contesta. Revisá, en este orden:');
        /* Lo más frecuente y lo que más tiempo hace perder: el adaptador
           enciende sus LED con la alimentación del USB y parece listo, pero los
           transceptores del bus se alimentan de los 12 V del vehículo. Sin el
           cable en el camión NUNCA va a conectar, por más que se vea encendido. */
        log('&nbsp;&nbsp;1. <b>El adaptador tiene que estar conectado al vehículo</b>, no solo al USB. Con los LED encendidos por el USB parece listo, pero sin los <b>12 V del camión</b> no puede abrir ningún bus.');
        log('&nbsp;&nbsp;2. El cable en el <b>conector del vehículo</b> — en camión antiguo, pines A/B del Deutsch de 9 pines');
        log('&nbsp;&nbsp;3. El <b>switch en contacto</b> (no hace falta arrancar, pero con el motor andando se ven más datos)');
        log('&nbsp;&nbsp;4. Que Windows vea el adaptador en el USB');
        log('&nbsp;&nbsp;5. Si nada de eso: probá la herramienta del fabricante, <code>C:\\NEXIQ\\Test\\CommCheck.exe</code>');
      }
    } catch (e) {
      log(`<span style="color:var(--red)">✗ ${e.message}</span>`);
    } finally {
      /* Dejar cargado el que el usuario había elegido: si no, el próximo
         escaneo saldría con el último que se probó acá. */
      if (apiPrevia) await this._puenteOp({ op:'cargar', api:apiPrevia }, 6000).catch(() => {});
      this._api = apiPrevia;
      if (btn) { btn.disabled = false; btn.textContent = '🔧 Verificar adaptadores'; }
    }
  },

  /* Prueba del enlace sola, sin escaneo y sin elegir vehiculo: conecta, hace
     hablar al dongle y despues le pregunta al vehiculo. Separa de una vez las
     tres cosas que "no conecta" confunde — el telefono con el dongle, el dongle
     consigo mismo, y el dongle con el bus. */
  async _probarBluetooth() {
    const btn = document.getElementById('obd-btn-test');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Probando...'; }
    const log = m => this._log(m);
    this._traza = [];
    this._via = 'android';
    try {
      const { nombre, protocolo } = await this._androidInit(log);
      log(`<b style="color:var(--green)">✓ Enlace con ${UI.esc(nombre)}</b> — ${protocolo}`);
      log('Preguntándole al vehículo (01 00)...');
      for (const c of ['ATE0', 'ATL0', 'ATSP0']) await this._cmd(c, 4000).catch(() => '');
      const r = String(await this._cmd('0100', 15000).catch(e => 'ERROR: ' + e.message));
      if (/4100/.test(r.replace(/\s/g, '')))
        log('<b style="color:var(--green)">✓ El vehículo respondió.</b> Bluetooth y bus comunicando: ya podés escanear.');
      else
        log(`<b style="color:var(--amber)">⚠️ El escáner responde, pero el vehículo no</b> ` +
            `(contestó "${UI.esc(r.replace(/[\r\n>]+/g, ' ').trim()) || 'nada'}"). ` +
            `El Bluetooth está bien; el problema está del dongle hacia el vehículo: switch en contacto ` +
            `y dongle bien metido en el conector de diagnóstico.`);
    } catch (e) {
      log(`<span style="color:var(--red)">✗ ${e.message}</span>`);
    } finally {
      /* Se suelta siempre: dejar el socket abierto hace que el escaneo que viene
         despues encuentre el dongle ocupado por esta misma app. */
      try { window.NexusBT.desconectar(); } catch (_) {}
      this._bt = null;
      if (btn) { btn.disabled = false; btn.textContent = '🔧 Probar Bluetooth'; }
      const bt = document.getElementById('obd-btn-traza');
      if (bt && this._traza.length) bt.style.display = '';
    }
  },

  /* ═══ Antes de conectar: qué se sabe de este vehículo ══════════════════════
     "Revisá que tengamos todo para poder escanearla" no deberia ser una pregunta
     que haya que hacer por chat. El año y la marca ya dicen por que enlace
     diagnostica el vehiculo y hasta donde se va a llegar, y decirlo ANTES de
     conectar evita la peor perdida de tiempo del taller: una hora revisando
     cable, switch y conector cuando el problema era que se le preguntaba por
     CAN a un vehiculo que solo habla K-line.

     El corte del año no es arbitrario: CAN (ISO 15765-4) es obligatorio en
     EEUU desde el modelo 2008, con entrada gradual desde 2003. Antes de eso lo
     normal es K-line (pin 7): ISO 9141-2 o ISO 14230/KWP2000. */
  _AVISOS_MARCA: {
    /* Solo lo verificado. Mitsubishi de esta generacion diagnostica los modulos
       que NO son de emisiones con MUT-II, que no es OBD-II: 15625 baudios, y el
       ETACS por el pin 9 del conector. */
    MITSUBISHI: { hasta: 2007, txt:
      'En Mitsubishi de esta generación, por OBD-II estándar se llega al <b>motor</b> (y a la transmisión si comparte la línea). ' +
      'El <b>ABS, SRS, 4x4, TPMS y ETACS/carrocería</b> hablan <b>MUT-II</b>, que no es OBD-II: van a <b>15625 baudios</b>, ' +
      'y el ETACS por el <b>pin 9</b> del conector. Un ELM327 no cablea el pin 9 ni genera 15625 baudios, y el USB-Link por RP1210 tampoco. ' +
      'Para esos módulos hace falta <b>MUT-III</b> (o un clon con su VCI) o un multimarca con cobertura Mitsubishi declarada.' },
  },

  _avisoAcceso(vehId) {
    const cont = document.getElementById('obd-aviso');
    if (!cont) return;
    const v = (this._vehiculos || []).find(x => x.id === vehId);
    if (!v) { cont.innerHTML = ''; return; }
    const anio = parseInt(v.anio, 10) || null;
    const av = [];

    if (!anio) {
      av.push({ n:'info', t:'Sin año registrado no se puede anticipar el enlace de diagnóstico. Cargalo en Vehículos para que este aviso sirva.' });
    } else if (anio >= 2008) {
      av.push({ n:'ok', t:`Modelo ${anio}: CAN obligatorio (ISO 15765-4). Sirve USB-Link o Bluetooth, y el escaneo por módulo llega completo.` });
    } else if (anio >= 2003) {
      av.push({ n:'warn', t:`Modelo ${anio}: está en la transición a CAN. Puede ser CAN o <b>K-line</b> (pin 7). ` +
        'Si no contesta por USB, no es el cable: cambiá a <b>Bluetooth</b>, que es la única vía que habla ISO 9141-2 y KWP2000.' });
    } else {
      av.push({ n:'warn', t:`Modelo ${anio}: anterior a CAN, diagnostica por <b>K-line</b> (pin 7). ` +
        'El USB-Link por RP1210 no arma tramas K-line en NexusPro — usá <b>Bluetooth</b> con el dongle ELM327.' });
    }

    const m = this._AVISOS_MARCA[String(v.marca || '').trim().toUpperCase()];
    if (m && anio && anio <= m.hasta) av.push({ n:'warn', t:m.txt });

    /* El VIN se usa para campañas de fábrica y para decodificar origen y año.
       Uno de largo distinto a 17 no es un VIN: mejor decirlo aca que dejar que
       NHTSA devuelva vacio y parezca "este vehiculo no tiene campañas". */
    const vin = String(v.vin || '').trim();
    if (vin && vin.length !== 17)
      av.push({ n:'warn', t:`El VIN registrado (<code>${UI.esc(vin)}</code>) tiene <b>${vin.length} caracteres</b> y un VIN son 17. ` +
        'Así no se puede decodificar ni consultar campañas de fábrica por VIN — revisalo contra la tarjeta de circulación. ' +
        'Las campañas por marca/modelo/año sí van a funcionar.' });

    const color = { ok:'--green', warn:'--amber', info:'--text3' };
    cont.innerHTML = `<div style="margin-bottom:10px">${av.map(a => `
      <div style="background:var(--surface2);color:var(--text);border-left:3px solid var(${color[a.n]});
        border-radius:6px;padding:7px 10px;font-size:11.5px;line-height:1.55;margin-top:5px">
        ${a.n === 'ok' ? '✅' : a.n === 'warn' ? '⚠️' : 'ℹ️'} ${a.t}</div>`).join('')}</div>`;
  },

  /* Oculta el selector y la prueba en Bluetooth, donde no aplican */
  /* Explica POR QUE no se ven los nombres de los equipos Bluetooth, que es lo
     unico util cuando no se ven. Son dos causas distintas y el arreglo de cada
     una es distinto: puente desactualizado, o dongle sin emparejar en Windows. */
  _avisoPuente(viejo, seriales) {
    const nota = document.getElementById('obd-api-nota');
    if (!nota) return;
    if (viejo) {
      nota.innerHTML = '<b style="color:var(--amber)">⚠️ El puente de esta PC está desactualizado.</b> ' +
        'Por eso los puertos salen como <code>SERIAL:COMx</code> y no con el nombre del equipo ' +
        '(el nombre lo resuelve el puente leyendo el registro de Windows; el navegador no puede). ' +
        'Descargá de nuevo <a href="/puente-obd/instalar-puente.bat" download style="color:var(--cyan)">instalar-puente.bat</a>, ' +
        'cerrá la ventana del puente que esté abierta y volvé a ejecutarlo.';
      return;
    }
    /* Puente al dia: si aun asi no hay nombre, el equipo no esta emparejado. */
    const sinNombre = (seriales || []).filter(a => !a.equipo && !a.local);
    if (sinNombre.length && !(seriales || []).some(a => a.equipo)) {
      nota.innerHTML = 'Ningún puerto tiene nombre de equipo: eso pasa cuando el escáner ' +
        '<b>no está emparejado en Windows</b>. Emparejalo en Configuración › Bluetooth y reintentá. ' +
        'Los que dicen <i>puerto local entrante</i> nunca sirven.';
      return;
    }
    nota.innerHTML = 'Un taller con software de fábrica (Cummins, Navistar, Allison…) tiene varios ' +
      'adaptadores RP1210 registrados. Si el de siempre no responde, probá con otro.';
  },

  _verApis() {
    const via = document.getElementById('obd-via')?.value;
    const clasico = via === 'classic';
    /* Con Web Serial el puerto lo pide el propio navegador. Este selector lo
       llena el puente, así que sin puente se queda en "Buscando adaptadores…"
       para siempre y parece que falta algo cuando en realidad ya no hace falta. */
    const comPorNavegador = clasico && this._puedeWebSerial();
    /* La vía nativa elige el escáner en su propio listado (emparejados + BLE
       cercanos): el selector de puerto local no le aplica. */
    const usb = via !== 'ble' && via !== 'j1939ble' && via !== 'android' && !clasico;
    const wrap = document.getElementById('obd-api-wrap');
    if (wrap) wrap.style.display = ((usb || clasico) && !comPorNavegador) ? '' : 'none';
    const test = document.getElementById('obd-btn-test');
    /* Por Bluetooth tambien hay algo que verificar, y es LA pregunta del taller:
       "¿esto esta conectado de verdad?". Antes el boton se escondia justo en la
       via donde mas falta hacia. */
    if (test) {
      test.style.display = (usb || via === 'android') ? '' : 'none';
      test.textContent = via === 'android' ? '🔧 Probar Bluetooth' : '🔧 Verificar adaptadores';
    }
    if (clasico && !comPorNavegador) {
      /* Windows crea un COM por cada perfil SPP emparejado, y varios son
         puertos LOCALES entrantes sin nada del otro lado. Tomar "el primero
         que diga SERIAL" caía en uno de esos y el escaneo moría con un error
         que culpaba al dongle. Se elige el que el puente reconoció como
         escáner OBD; si no hay ninguno, el primero, pero ya con nombre
         visible para poder corregirlo a mano. */
      const s = document.getElementById('obd-api');
      const seriales = s ? Array.from(s.options).filter(o => /^SERIAL:/i.test(o.value)) : [];
      const opt = seriales.find(o => /vlinker|vgate/i.test(o.textContent)) ||
                  seriales.find(o => o.dataset.obd === '1') || seriales[0];
      if (s && opt && !/^SERIAL:/i.test(s.value)) { s.value = opt.value; this._api = opt.value; }
    }
  },

  async _cargarApis() {
    const poner = html => { const s = document.getElementById('obd-api'); if (s) s.innerHTML = html; };
    try {
      await this._puenteConectar();
      const r = await this._puenteOp({ op:'apis' }, 4000);
      /* Sin .INI no hay drivers de ese adaptador: mostrarlo solo confundiría */
      const apis = ((r && r.apis) || []).filter(a => a.instalado);
      if (!apis.length) { poner('<option value="">No hay ningún adaptador RP1210 instalado</option>'); return; }
      /* El nombre del equipo emparejado lo resuelve EL PUENTE leyendo BTHENUM
         del registro de Windows; el navegador no tiene forma de saberlo. Un
         puente anterior a ese cambio (2026-09-02) devuelve los puertos sin los
         campos `equipo` y `local`, y entonces el desplegable muestra
         "SERIAL:COM6" en vez de "vLinker MS 09327 (COM6)".
         Eso no se puede arreglar desde aqui — hay que actualizar el puente — y
         lo unico peor que no mostrar el nombre es no explicar por que. */
      const seriales = apis.filter(a => /^SERIAL:/i.test(String(a.api || '')));
      const puenteViejo = seriales.length > 0 &&
        !seriales.some(a => Object.prototype.hasOwnProperty.call(a, 'local'));
      this._avisoPuente(puenteViejo, seriales);

      poner(apis.map(a => {
        /* Un COM de Bluetooth no declara protocolos: la lista que manda el
           puente es un valor por defecto, no algo que el dongle haya dicho.
           Mostrarla prometía "ISO9141, KWP2000" de cualquier puerto. Acá va el
           nombre del equipo emparejado, que es el dato con el que se elige. */
        if (/^SERIAL:/i.test(String(a.api || '')))
          return `<option value="${UI.esc(a.api)}"${a.obd ? ' data-obd="1"' : ''}>${UI.esc(a.nombre || a.api)}</option>`;
        /* Los protocolos dicen de un vistazo si ese adaptador sirve para el
           camión que se tiene enfrente (J1708 para los viejos, J1939 para los
           nuevos). Es la información que hace útil al selector. */
        const protos = (a.protocolos || []).map(p => String(p).split(',')[0]);
        /* ISO9141/ISO14230 estaban fuera del filtro, asi que un adaptador que SI
           sabe K-line se mostraba como si solo supiera CAN: justo el dato que
           hace falta para saber si sirve para un vehiculo anterior a ~2006. */
        const clave = protos.filter(p => /^(J1939|J1708|OBDII|CAN|ISO15765|ISO9141|ISO14230|J1850)$/i.test(p));
        const resumen = clave.length ? ` — ${clave.slice(0, 4).join(', ')}` : '';
        return `<option value="${UI.esc(a.api)}"${a.cargada ? ' selected' : ''}>${UI.esc(a.nombre || a.api)}${UI.esc(resumen)}</option>`;
      }).join(''));
      this._api = document.getElementById('obd-api')?.value || null;
    } catch (_) {
      /* Que no haya puente no es un error acá: se puede escanear por Bluetooth */
      poner('<option value="">Puente USB no disponible — solo Bluetooth</option>');
    }
  },

  _log(msg) {
    /* La bitacora se lleva TAMBIEN el log de pantalla, y antes del early return.
       Cuando el escaner no llega a conectar no hay un solo comando ELM que
       trazar, asi que estas lineas son el unico rastro de que paso — y como el
       boton de la bitacora solo aparece si hay entradas, la falla mas comun
       ("no conecta") era justo la que no dejaba nada para mandar a soporte. */
    this._trazaNota(String(msg).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    const el = document.getElementById('obd-log');
    if (!el) return;
    /* la flecha en color de acento hace la lista escaneable de un vistazo */
    el.innerHTML += `<div><span style="color:var(--cyan)">›</span> ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
  },

  /* Los dos botones de Bluetooth del modal: fuerzan la vía clásica (COM) y
     dicen cómo elegir el puerto — solo el registrado, o la lista de Windows. */
  async escanearPorBluetooth(modo) {
    const via = document.getElementById('obd-via');
    if (via) { via.value = 'classic'; this._verApis(); }
    this._modoPuerto = modo;
    try { await this.escanear(); } finally { this._modoPuerto = null; }
  },

  async escanear() {
    const vehId = document.getElementById('obd-veh')?.value;
    if (!vehId) { UI.toast('Selecciona el vehículo a escanear', 'error'); return; }
    this._via = document.getElementById('obd-via')?.value || 'ble';
    if (this._via === 'classic') this._via = 'serial';
    /* El camión por Bluetooth es transporte BLE con bus J1939. Se normaliza la
       vía a 'ble' para que todo lo que pregunta por ella —el driver, el monitor
       en vivo, la bitácora— siga viendo lo que de verdad hay del otro lado, y el
       bus se lleva aparte en su propia bandera. */
    this._j39BLE = this._via === 'j1939ble';
    if (this._j39BLE) this._via = 'ble';
    this._api = (this._via !== 'ble' && document.getElementById('obd-api')?.value) || null;
    const btn = document.getElementById('obd-btn-scan');
    btn.disabled = true;
    this._traza = [];   // bitacora tecnica: se reinicia con cada escaneo
    this._respAprendida = {};   // quién contesta desde dónde vale para ESTE vehículo, no para el anterior
    const log = m => this._log(m);
    if (this._via === 'auto') {
      try { this._via = await this._detectarVia(log); }
      catch (e) {
        log(`<span style="color:var(--red)">✗ ${e.message}</span>`);
        UI.toast(e.message, 'error'); btn.disabled = false; return;
      }
    }
    if (this._via === 'j1939' || this._j39BLE) return this._escanearJ1939(vehId, btn, log);
    if (this._via === 'j1708') return this._escanearJ1587(vehId, btn, log);
    try {
      let nombre, protocolo;
      if (this._via === 'usb') {
        /* El USB no habla ELM de verdad: se emula sobre RP1210, y su puesta a
           punto es otra (abrir canal CAN, probar 11/29 bits). */
        log('Conectando al puente USB local...');
        ({ nombre, protocolo } = await this._usbInit(log));
      } else {
        /* Todo lo que del otro lado tiene un ELM327 —BLE del navegador, puente
           nativo de la app, Bluetooth clasico por COM— comparte transporte
           distinto pero MISMA puesta a punto, y tiene que pasar por _init.

           La via serial no lo hacia: solo sondeaba con ATI/ATZ y se daba por
           conectada. Eso deja el adaptador con el ECO ENCENDIDO (el ELM327
           arranca asi) y sin ATSP0, de modo que cada respuesta viene con el
           comando pegado adelante. Se ve en el dialogo crudo: "ATZ" contesta
           "ATZ | ELM327 v2.3 | >". Como el eco de un comando OBD es hexadecimal
           (0902, 0100...), _hexLines lo toma por datos del vehiculo y lo mezcla
           con la respuesta real: no revienta, contesta MAL, que es peor. */
        if (this._via === 'serial') {
          log('Conectando Bluetooth clasico por puerto COM...');
          ({ nombre } = await this._serialInit(log));
        } else if (this._via === 'android') {
          log('Conectando por el puente Bluetooth de la app...');
          ({ nombre } = await this._androidInit(log));
        } else {
          log('Buscando adaptador Bluetooth...');
          nombre = await this._conectar();
        }
        log(`Conectado a <b>${nombre}</b> ✓`);
        protocolo = await this._init(log);
      }
      log(`Protocolo: <b>${protocolo || 'detectado'}</b> ✓`);
      /* El escaneo es donde el usuario ELIGE la vía; si funcionó, es la buena.
         A partir de acá el banco de pruebas, el OEM y el centro de módulos se
         conectan solos por ahí, sin volver a preguntar nada. */
      this._recordarVia();

      log('Leyendo VIN...');
      const vin = await this._leerVIN();
      log(vin ? `VIN: <b>${vin}</b>` : 'VIN no disponible en este vehículo');

      log('Leyendo estado Check Engine...');
      const { mil, n } = await this._leerMIL();
      log(mil ? `🔴 Check Engine ENCENDIDO (${n} falla(s))` : '✅ Check Engine apagado');

      log('Buscando módulos que responden...');
      const modulos = await this._leerModulos();
      log(modulos ? `${modulos.length} módulo(s): ${modulos.map(m => m.nombre).join(', ')} ✓`
                  : 'No se pudo enumerar los módulos');

      log('Leyendo códigos de falla...');
      const codConf = await this._leerDTCs('03');
      const codPend = await this._leerDTCs('07');
      log(`${codConf.length} confirmado(s), ${codPend.length} pendiente(s)`);

      /* ¿El vehículo contestó ALGO? Sin esta verificación, un cable flojo, un
         switch apagado o un adaptador que no llega al bus daban exactamente el
         mismo resultado que un vehículo sano: cero códigos, y el reporte salía
         en verde "Sin códigos de falla". Un vehículo con fallas reales podía
         declararse sano, que es la peor manera de fallar que tiene esto.
         Se exige evidencia positiva de comunicación: módulos que respondieron,
         VIN, códigos, o el estado del Check Engine. */
      /* Escaneo por módulo: lo que encuentra las fallas que NO son de emisiones
         (TPMS, ABS, tracción, carrocería). Por USB siempre; por Bluetooth
         cuando el dongle acepta ATSH y el vehículo está en CAN de 11 bits. */
      let porModulo = null, mapaAcceso = null;
      let modoBLE = false;
      this._ofreceKline = false;
      if (this._elmPuedeModulos()) {
        modoBLE = await this._elmModoModulo(true);
        if (!modoBLE) log('El dongle Bluetooth no acepta ATSH: no se puede escanear módulo por módulo con este adaptador.');
      } else if (this._klinePuedeModulos()) {
        /* Vehiculo pre-CAN: el OBD-II del motor responde y es lo que se viene a
           buscar. El barrido por modulo de KWP2000 NO se corre solo: son ~40 s
           mas en un vehiculo donde la mayoria de los modulos hablan protocolo
           propietario y no van a contestar igual. Se ofrece como boton, para
           quien lo quiera, en vez de cobrarselo a todos los escaneos. */
        this._ofreceKline = true;
        log('Escaneo OBD-II completo. <span style="color:var(--text3)">Si querés buscar además otros módulos, hay un botón al final del reporte.</span>');
      } else if (this._esELM()) {
        log('Escaneo por módulo no disponible en este protocolo por Bluetooth ' +
            `(protocolo ${this._protoNum}: requiere CAN de 11 bits, o ISO 14230/KWP2000 para el barrido en K-line).`);
      }

      if (this._via === 'usb' || modoBLE) {
       try {
        log(`<b>Escaneando TODOS los módulos del vehículo...</b> (esto tarda ~${modoBLE ? 60 : 30} s)`);
        this._mapaFaltantes = [];
        /* Por dónde se le entró a este mismo modelo en escaneos anteriores. */
        const mapaPrev = await this._mapaConocido(vehId);
        this._marcaBarrido = ((this._vehiculos || []).find(x => x.id === vehId) || {}).marca || null;
        porModulo = await this._escanearModulos(log, mapaPrev).catch(e => { log(`No se pudo barrer módulos: ${e.message}`); return null; });
        this._marcaBarrido = null;   // vale solo durante el barrido; después manda la marca del escaneo abierto
        {
          const vCat = (this._vehiculos || []).find(x => x.id === vehId);
          const nCat = (porModulo || []).reduce((n, m) => n + ((m.soportados || []).length), 0);
          if (nCat) {
            log(`📚 Catálogo: los módulos declararon <b>${nCat}</b> código(s) que pueden reportar — se guardan para ${UI.esc([vCat && vCat.marca, vCat && vCat.modelo].filter(Boolean).join(' ') || 'este modelo')}`);
            this._guardarCatalogoDTC(porModulo, vCat).catch(() => {});
          }
        }
        /* Antes de armar el mapa: si el mapa se guarda con "Módulo 0x7B3", el
           próximo escaneo de este modelo vuelve a arrancar sin nombres. */
        if (porModulo && porModulo.length && (typeof moduloEnPlan !== 'function' || moduloEnPlan('ia'))) {
          await this.bautizarModulosConIA({ vehiculo_id: vehId, por_modulo: porModulo }, log)
            .catch(e => log(`<span style="color:var(--text3)">La identificación por IA no corrió: ${UI.esc(e.message)}</span>`));
        }
        mapaAcceso = this._mapaDeEscaneo(porModulo);
        if (mapaAcceso) {
          const nuevos = porModulo.filter(m => m.nuevo).length;
          log(`&nbsp;&nbsp;Mapa de acceso guardado: ${mapaAcceso.modulos.length} módulo(s) en CAN ${mapaAcceso.bits} bits / ${mapaAcceso.baud}k` +
              (nuevos ? ` — <b>${nuevos} que no estaban en el mapa del modelo</b>` : '') +
              (mapaPrev ? '' : ' — primer mapa de este modelo'));
        }
        if (porModulo) {
          const conFallas = porModulo.filter(m => m.codigos.length);
          const total = conFallas.reduce((n, m) => n + m.codigos.length, 0);
          log(total
            ? `<b style="color:var(--amber)">${total} código(s) en ${conFallas.length} módulo(s)</b> además de los de emisiones`
            : `Ningún módulo entregó códigos`);
          const rech = porModulo.filter(m => m.lectura === 'rechazada').length;
          if (rech) log(`<b style="color:var(--amber)">${rech} módulo(s) rechazaron la lectura de códigos</b> (contestan "servicio no soportado"): de esos NO se sabe si tienen fallas.`);
        }
       } finally {
        /* En finally y no al final del bloque: si esto se saltea, la cabecera
           queda apuntando al último módulo consultado y todo lo que sigue
           — sensores en vivo, borrado de códigos — le habla a ese. */
        if (modoBLE) await this._elmModoModulo(false);
       }
      }

      const hubo = !!(modulos && modulos.length) || !!vin || codConf.length || codPend.length || mil
                   || !!(porModulo && porModulo.length);
      if (!hubo) {
        throw new Error(
          'SIN COMUNICACIÓN CON EL VEHÍCULO — no se leyó nada, así que NO se puede afirmar que no tenga fallas. ' +
          'Revisá: el cable bien puesto en el conector de diagnóstico, el switch en contacto, y que el adaptador ' +
          'sea compatible con este vehículo (un adaptador de camión necesita cable OBD-II de 16 pines para un liviano). ' +
          'Usá el botón "Probar adaptador" para ver qué protocolo responde.');
      }

      let freeze = null;
      if (codConf.length || mil) {
        log('Leyendo freeze frame (datos al momento de la falla)...');
        freeze = await this._leerFreeze();
      }

      /* Descripciones: diccionario local ES → catálogo BD (3,000+ códigos) → rango SAE */
      const cat = await DB.getDTCCatalogo(
        [...codConf.map(c => c.codigo), ...codPend.map(c => c.codigo), freeze?.dtc].filter(Boolean));
      let dtcs = codConf.map(c => ({ codigo:c.codigo, ecu:c.ecu, modulo:this._nombreModulo(c.ecu), desc:this._descDTC(c.codigo, cat) }));
      let pend = codPend.map(c => ({ codigo:c.codigo, ecu:c.ecu, modulo:this._nombreModulo(c.ecu), desc:this._descDTC(c.codigo, cat) }));
      dtcs = await this._enriquecerDTCs(dtcs, vehId);
      pend = await this._enriquecerDTCs(pend, vehId);
      if (freeze) freeze.desc = this._descDTC(freeze.dtc, cat);

      log('Detectando sensores soportados...');
      this._sop = await this._leerSoportados();
      log(`Leyendo ${this._sop.length || this._BASICOS.length} sensores en vivo...`);
      const datos = await this._leerVivo(this._sop, log);

      log('Leyendo monitores a bordo (modo 06)...');
      const monitores = await this._leerMonitores(log).catch(() => null);
      if (!monitores) log('Este vehículo no reporta monitores en modo 06');

      /* Códigos PERMANENTES: los que no se borran con la batería ni con el modo
         04. Si aparecen y no hay códigos confirmados, alguien limpió la memoria
         hace poco — dato clave al recibir un vehículo que no se conoce. */
      log('Leyendo códigos permanentes (modo 0A)...');
      const permanentes = await this._leerPermanentes();
      if (permanentes.length) {
        log(`<b style="color:var(--amber)">${permanentes.length} código(s) PERMANENTE(S)</b> — no se borran desconectando la batería`);
        if (!dtcs.length) log('&nbsp;&nbsp;Hay permanentes pero ningún código confirmado: la memoria se borró hace poco.');
      } else log('Sin códigos permanentes');

      /* Equipamiento declarado: lo que permite ver un DPF o un EGR eliminados,
         que no dejan ningún código porque el software ya no los busca. */
      log('Verificando equipamiento declarado...');
      const readiness = await this._leerReadiness();
      const normaObd = await this._leerNormaOBD();
      const calib = await this._leerCalibracion();
      if (normaObd) log(`Norma declarada: <b>${UI.esc(normaObd.nombre)}</b>`);
      if (calib?.calid) log(`Calibración: <b>${calib.calid}</b>${calib.cvn ? ` <span style="color:var(--text3)">· CVN ${calib.cvn}</span>` : ''}`);
      else if (calib?.cvn) log(`CVN de calibración: <b>${calib.cvn}</b>`);
      const equipo = this._analizarEquipamiento({ readiness, norma:normaObd, vin, calib });
      if (readiness) {
        const sop = readiness.monitores.filter(m => m.soportado);
        log(`Motor ${readiness.diesel ? 'diésel' : 'a gasolina'} — declara ${sop.length} de ${readiness.monitores.length} monitores`);
      }
      for (const a of equipo.avisos) {
        const col = a.nivel === 'alto' ? 'var(--red)' : a.nivel === 'medio' ? 'var(--amber)' : 'var(--text3)';
        log(`<span style="color:${col}">${a.nivel === 'alto' ? '⛔' : a.nivel === 'medio' ? '⚠️' : 'ℹ️'} ${a.txt}</span>`);
      }

      /* Contra los mismos modelos que ya pasaron por el taller: es lo que
         permite pasar de "le falta lo que exige la norma" a "le falta lo que
         sus iguales sí traen". */
      log('Comparando contra vehículos iguales del taller...');
      const iguales = await this._compararConIguales({ vehId, calib, readiness, modulos });
      if (!iguales) log('&nbsp;&nbsp;<span style="color:var(--text3)">Sin datos de marca/modelo para comparar</span>');
      else if (iguales.insuficiente)
        log(`&nbsp;&nbsp;<span style="color:var(--text3)">Solo ${iguales.n} ${UI.esc(iguales.marca)} ${UI.esc(iguales.modelo)} en el historial (hacen falta ${this._MIN_IGUALES}). Escaneá más de este modelo y la comparación empieza a servir.</span>`);
      else if (!iguales.avisos.length)
        log(`&nbsp;&nbsp;<span style="color:var(--green)">Coincide con los ${iguales.n} ${UI.esc(iguales.marca)} ${UI.esc(iguales.modelo)} del taller ✓</span>`);
      else for (const a of iguales.avisos)
        log(`<span style="color:${a.nivel === 'alto' ? 'var(--red)' : 'var(--amber)'}">${a.nivel === 'alto' ? '⛔' : '⚠️'} ${a.txt}</span>`);
      if (iguales && iguales.avisos) equipo.iguales = iguales;

      /* Contra la visita anterior de ESTE vehículo: lo que dice si la
         reparación de la vez pasada aguantó. */
      log('Comparando con la visita anterior de este vehículo...');
      const comparacion = await this._compararConAnterior(vehId, { dtcs, por_modulo: porModulo, permanentes });
      this._logComparacion(comparacion, log);

      let nhtsa = null;
      if (vin) {
        log('Consultando VIN en base de datos NHTSA...');
        nhtsa = await this._decodeVIN(vin);
        log(nhtsa ? `VIN identificado: <b>${UI.esc(nhtsa.marca)} ${UI.esc(nhtsa.modelo||'')} ${nhtsa.anio||''}</b>` : 'VIN sin coincidencias en NHTSA');
      }

      this._scan = { costo: this._costoEscaneo(vehId),
                     vehiculo_id: vehId, vin, protocolo, adaptador: nombre, mil,
                     dtcs, dtcs_pendientes: pend, datos, freeze_frame: freeze,
                     monitores, modulos, por_modulo: porModulo, voltaje: this._voltajeDe(datos), nhtsa,
                     permanentes, readiness, norma_obd: normaObd, calibracion: calib,
                     equipamiento: equipo, comparacion, mapa_acceso: mapaAcceso,
                     /* La bitacora viaja CON el escaneo: si se pierde al cerrar
                        el modal, hay que volver a enchufar el vehiculo para
                        conseguirla — que es justo lo que vino a evitar. */
                     traza: this._traza || [] };
      log('<b>Escaneo completo ✓</b>');
      btn.textContent = '↻ Re-escanear';

      /* El resultado va a la PÁGINA, no al modal. La app tiene un solo modal:
         mientras el reporte viviera dentro de él, abrir el Centro de módulos
         —o cualquier confirmación— lo reemplazaba, y al cerrar esa ventana el
         escaneo desaparecía de la vista y había que volver a escanear.
         Reportado por Henry el 2026-09-22. Ahora el escaneo es la pantalla, y
         todo lo demás se abre ENCIMA: cerrar cualquier ventana vuelve a él. */
      UI.cerrarModal();
      if (this._mantenerConexion && this._listo) this._iniciarLatido();
      await this.render();

      // Asistencia Total IA automática al finalizar el escaneo
      if (typeof moduloEnPlan !== 'function' || moduloEnPlan('ia')) {
        this.analizarIA().catch(e => console.warn('Auto IA asistencia:', e));
      }
    } catch (e) {
      log(`<span style="color:var(--red)">✗ ${e.message}</span>`);
      UI.toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      /* El boton aparece aunque el escaneo se haya caido: es justo cuando la
         bitacora sirve. */
      const bt = document.getElementById('obd-btn-traza');
      if (bt && this._traza && this._traza.length) bt.style.display = '';
    }
  },

  /* Recalcula el nombre de cada módulo CAN con la regla única. Así un escaneo
     guardado con el cálculo viejo ("Presión de Neumáticos (TPMS)" en la
     carrocería de un Picanto, "Pieza 94003G6920" en el tablero) se muestra
     bien sin tocar la base, y las tarjetas, el informe de Nexus y el impreso
     dicen lo mismo. */
  _resolverNombres(s, veh) {
    if (!s || !Array.isArray(s.por_modulo) || /J1587|J1939/.test(s.protocolo || '')) return;
    const marca = s.nhtsa?.marca || veh?.marca || null;
    for (const m of s.por_modulo) {
      if (typeof m.ecu !== 'number' || m.ecu < 0x700 || m.ecu > 0x7FF || m.ext || m.kline) continue;
      m.nombre = this._nombreResuelto(m, marca).nombre;
    }
  },

  _renderResultado() {
    const s = this._scan, el = document.getElementById('obd-result');
    if (!s || !el) return;
    this._resolverNombres(s, (this._vehiculos || []).find(x => x.id === s.vehiculo_id));
    const vFicha = (this._vehiculos || []).find(x => x.id === s.vehiculo_id);
    el.innerHTML = `
      <div class="card" style="padding:12px 14px;margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <b style="font-size:12px">VIN</b>
        ${s.vin
          ? `<span style="font-family:ui-monospace,Consolas,monospace;font-size:15px;font-weight:700;letter-spacing:.5px">${UI.esc(s.vin)}</span>`
          : `<span style="color:var(--amber);font-size:12.5px">El vehículo no entregó el VIN en este escaneo${vFicha && vFicha.vin
              ? ` · en la ficha: <span style="font-family:ui-monospace,Consolas,monospace">${UI.esc(vFicha.vin)}</span>` : ''}</span>
             ${this._listo ? `<button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd.releerVIN()">↻ Leer VIN</button>` : ''}`}
      </div>
      ${s.nhtsa ? `<div class="card" style="padding:14px;margin-top:12px;border-left:3px solid var(--cyan)">
        <b style="font-size:12px">🌐 IDENTIFICADO POR VIN (NHTSA)</b>
        <div style="font-size:13px;margin-top:4px">${UI.esc(s.nhtsa.marca)} ${UI.esc(s.nhtsa.modelo||'')} ${s.nhtsa.anio||''}
          ${s.nhtsa.motor?` · Motor ${s.nhtsa.motor}`:''} ${s.nhtsa.combustible?` · ${s.nhtsa.combustible}`:''}
          ${s.nhtsa.pais?` · Fab. ${s.nhtsa.pais}`:''}</div>
        <button class="btn btn-sm btn-cyan" style="margin-top:6px" onclick="Modulos.diagnostico_obd.aplicarVIN()">📋 Completar ficha del vehículo</button>
      </div>` : ''}
      ${this._modulosHTML(s)}
      ${this._tablaDTCs(s)}
      ${this._historialHTML(s)}
      <div id="obd-bitacora"></div>
      <div id="obd-campanas"></div>
      ${this._freezeHTML(s.freeze_frame)}
      ${this._porModuloHTML(s)}
      ${this._mapaHTML(s)}
      ${this._equipamientoHTML(s)}
      ${this._monitoresHTML(s.monitores)}
      <div class="card" style="padding:14px;margin-top:12px">
        <b style="font-size:12px">DATOS EN VIVO (${Object.keys(s.datos||{}).length} sensores)</b>
        <div id="obd-mon-sel" style="margin-top:6px">${this._chipsInicial()}</div>
        <div id="obd-vivo" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:9px;margin-top:6px;font-size:13px">
          ${this._vivoHTML(s.datos||{})}
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" id="obd-btn-live" onclick="Modulos.diagnostico_obd.toggleLive()">▶️ Monitor en vivo</button>
          <button class="btn btn-sm btn-ghost" id="obd-btn-rec" style="display:none" onclick="Modulos.diagnostico_obd.toggleRec()">⏺ Grabar sesión</button>
          <button class="btn btn-sm btn-ghost" id="obd-btn-marca" style="display:none" onclick="Modulos.diagnostico_obd.modalMarcadorGrabacion()">📍 Marcar evento</button>
          ${(s.dtcs.length || s.mil) ? `<button class="btn btn-sm btn-danger" onclick="Modulos.diagnostico_obd.borrarDTCs()">🧹 Borrar códigos</button>` : ''}
          ${(typeof moduloEnPlan !== 'function' || moduloEnPlan('ia')) ? `<button class="btn btn-sm btn-cyan" onclick="Modulos.diagnostico_obd.analizarIA()">🤖 Analizar con IA</button>` : ''}
        </div>
        <div id="obd-rec-info" style="font-size:11px;color:var(--text3);margin-top:6px"></div>
      </div>
      <div id="obd-ia"></div>`;

    /* Se consulta sola, sin pedir clic: si el mecánico tuviera que acordarse,
       la campaña de fábrica se descubre cuando el cliente ya pagó la reparación.
       Va sin await para no demorar el resultado del escaneo. */
    const v = (this._vehiculos || []).find(x => x.id === s.vehiculo_id);
    const marca = s.nhtsa?.marca || v?.marca, modelo = s.nhtsa?.modelo || v?.modelo, anio = s.nhtsa?.anio || v?.anio;
    if (marca && modelo && anio) this.pintarCampanas('obd-campanas', marca, modelo, anio);
    this.pintarBitacora(s);   // la memoria del taller no depende de internet
  },

  async releerVIN() {
    if (!this._scan || !this._listo) return;
    UI.toast('Pidiendo el VIN al vehículo…', 'info');
    const vin = await this._leerVIN();
    if (!vin) return UI.toast('El vehículo no entregó el VIN', 'warn');
    this._scan.vin = vin;
    if (this._scan.id) await DB.upsertDiagnosticoOBD({ id: this._scan.id, vin }).catch(() => {});
    UI.toast(`VIN ${vin} ✓`, 'success');
    this._renderResultado();
  },

  _freezeHTML(fz) {
    if (!fz) return '';
    return `<div class="card" style="padding:14px;margin-top:12px;border-left:3px solid var(--amber)">
      <b style="font-size:12px">📸 FREEZE FRAME — al momento de la falla ${fz.dtc}${fz.desc?` (${fz.desc})`:''}</b>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:10px;font-size:13px">
        ${this._vivoHTML(fz, ['dtc','desc'])}
      </div>
    </div>`;
  },

  /* Aplica lo decodificado del VIN a la ficha del vehículo (solo campos vacíos) */
  async aplicarVIN() {
    const s = this._scan;
    if (!s?.nhtsa) return;
    const v = this._vehiculos.find(x => x.id === s.vehiculo_id);
    if (!v) return;
    const n = s.nhtsa, campos = { id: v.id, vin: s.vin };
    if (!v.marca && n.marca)             campos.marca = n.marca;
    if (!v.modelo && n.modelo)           campos.modelo = n.modelo;
    if (!v.anio && n.anio)               campos.anio = +n.anio;
    if (!v.motor && n.motor)             campos.motor = n.motor;
    if (!v.cilindros && n.cilindros)     campos.cilindros = +n.cilindros;
    if (!v.combustible && n.combustible) campos.combustible = n.combustible;
    const { error } = await DB.upsertVehiculo(campos);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    Object.assign(v, campos);
    UI.toast('Ficha del vehículo completada con datos del VIN ✓');
  },

  /* Análisis del escaneo con Nexus (Edge Function ai-assistant ya existente).

     El informe salía desordenado y, peor, contradictorio ("EXCELENTE" arriba y
     "mezcla extremadamente pobre" abajo), y se cortaba a media frase. Tres
     causas, las tres de ENTRADA, no del modelo:
     1. Los sensores viajaban como claves internas sin unidad ni rango
        (`o2_b1s1: 1.245`, `ltft2s: 0`, `pedal_e: 7`): la IA adivinaba qué eran
        y así nacieron "Pedal Embrague" y "LTFT 2S (cilindros 2)".
     2. No se le decía que el motor estaba APAGADO (RPM 0), así que evaluaba
        sondas lambda y catalizador que sin combustión no significan nada.
     3. Con 0 km y 0 calentamientos desde el borrado, un código que "ya no
        aparece" NO está resuelto — la IA lo daba por reparación efectiva.
     Además se le pedía evaluar TODOS los sensores en tablas: 30 filas de
     relleno que agotaban el tope de tokens. Ahora recibe los hechos ya
     interpretados y un formato corto y fijo. */
  _promptIA(s, veh) {
    const datos = s.datos || {};
    const defDe = k => Object.values(this._PIDS).find(d => d.k === k) || this._OEM_PIDS[k] || null;
    const rpm = typeof datos.rpm === 'number' ? datos.rpm : null;
    const motorApagado = rpm === 0;
    const sensores = Object.entries(datos).map(([k, v]) => {
      const d = defDe(k);
      const nombre = d ? d.l : k;
      const unidad = d ? (d.u || '').trim() : '';
      let ref = '';
      /* Un rango "en ralentí" o "motor caliente" contra un motor apagado da
         FUERA en casi todo, y eso era el ruido que la IA convertía en fallas. */
      /* La misma evaluación que la pantalla (_evaluar): motor apagado, frío o
         en marcha no se reportan como falla. */
      const ev = d && typeof v === 'number' ? this._evaluar(d, v, this._ctxMotor(datos)) : { est: null, nota: null };
      if (ev.nota) {
        ref = ` [${ev.nota}${ev.est === 'fuera' ? ' → BAJA' : ' — no evaluable como falla'}]`;
      } else if (d && d.r) {
        ref = ` [ref ${d.r[0]}–${d.r[1]}${d.rc ? ` ${d.rc}` : ''}${ev.est === 'mal' || ev.est === 'fuera' ? ' → FUERA' : ''}]`;
      }
      return `  - ${nombre}: ${v}${unidad ? ' ' + unidad : ''}${ref}`;
    }).join('\n');

    const borradoKm = typeof datos.dist_borr === 'number' ? datos.dist_borr : null;
    const calent = typeof datos.warmups === 'number' ? datos.warmups : null;
    const borradoReciente = borradoKm === 0 || calent === 0;
    const mons = (s.readiness?.monitores || []).filter(m => m.soportado);
    const incompletos = mons.filter(m => !m.listo).map(m => m.nombre);
    const perm = (s.permanentes || []).map(x => typeof x === 'string' ? x : x.codigo).filter(Boolean);
    const c = s.comparacion;
    const mods = (s.por_modulo || []).map(m => {
      const nom = this._nombreGenerico(m.nombre, m.ecu) ? 'sin identificar' : m.nombre;
      const cods = (m.codigos || []).map(x => `${x.codigo} (${x.desc || 'sin descripción'})`).join(', ');
      return `  - 0x${m.ecu.toString(16).toUpperCase()} · ${nom}: ${cods || (m.lectura === 'rechazada'
        ? 'NO SE PUDIERON LEER sus códigos (rechazó el servicio) — no afirmes que está sano'
        : 'sin códigos')}`;
    }).join('\n');
    const lista = arr => (arr || []).map(d => `${d.codigo}${d.desc ? ` (${d.desc})` : ''}`).join('; ') || 'ninguno';

    const hechos = [
      motorApagado ? 'MOTOR APAGADO (RPM 0, contacto en ON): las lecturas de sondas lambda, relación de mezcla, ajustes de combustible, avance y catalizador NO son evaluables en esta condición.' : '',
      rpm === null ? 'No se leyó RPM: no se sabe si el motor estaba en marcha.' : '',
      borradoReciente ? `CÓDIGOS BORRADOS RECIENTEMENTE (${borradoKm ?? '?'} km y ${calent ?? '?'} calentamientos desde el borrado): la ausencia de códigos NO confirma ninguna reparación todavía.` : '',
      incompletos.length ? `Monitores de disponibilidad INCOMPLETOS: ${incompletos.join(', ')}.` : (mons.length ? 'Todos los monitores soportados están completos.' : ''),
      perm.length ? `Códigos PERMANENTES presentes: ${perm.join(', ')} (la ECU aún no confirma la reparación).` : '',
    ].filter(Boolean).map(h => `- ${h}`).join('\n');

    return `Eres Nexus, asistente técnico del taller. Redacta el INFORME DE DIAGNÓSTICO que el taller archiva y entrega al cliente.
El encabezado (taller, placa, VIN, fecha) ya lo pone el sistema: NO lo repitas.

VEHÍCULO: ${veh ? `${veh.marca || ''} ${veh.modelo || ''} ${veh.anio || ''}`.trim() : 'no especificado'}
Protocolo: ${s.protocolo || '—'}
Check Engine (MIL): ${s.mil ? 'ENCENDIDO' : 'apagado'}

HECHOS YA INTERPRETADOS (tienen prioridad sobre cualquier lectura suelta):
${hechos || '- (sin observaciones de contexto)'}

CÓDIGOS:
- Confirmados: ${lista(s.dtcs)}
- Pendientes: ${lista(s.dtcs_pendientes)}
${c && !c.primera ? `- Frente a la visita anterior (${c.dias === 0 ? 'hoy mismo' : `hace ${c.dias} días`}${c.borrados_antes ? ', en la que se BORRARON los códigos' : ''}): volvieron ${(c.reincidentes || []).map(x => x.codigo).join(', ') || 'ninguno'}; nuevos ${(c.nuevos || []).map(x => x.codigo).join(', ') || 'ninguno'}; ya no aparecen ${(c.resueltos || []).map(x => x.codigo).join(', ') || 'ninguno'}.\n` : ''}- Freeze frame: ${s.freeze_frame ? JSON.stringify(s.freeze_frame) : 'no hay'}

MÓDULOS QUE RESPONDIERON (${(s.por_modulo || []).length}):
${mods || '  - sin barrido por módulo'}

SENSORES (valor, unidad y rango de referencia; "FUERA" = fuera de rango para esa condición):
${sensores || '  - sin datos'}

REGLAS:
1. Usa SOLO estos datos. No inventes especificaciones de fábrica (resistencias, voltajes, torques, ubicación de conectores o pines). Si hace falta una, escribe "según manual de servicio".
2. Respeta los HECHOS: con motor apagado no opines sobre mezcla, sondas ni catalizador; di que requieren motor en marcha. Tras un borrado reciente, un código que ya no aparece está "sin verificar", no "resuelto".
3. Un módulo "sin identificar" se queda así: no adivines su función.
4. No listes sensores normales uno por uno ni repitas un dato en dos secciones.
5. Español neutro, frases cortas, tono de informe técnico. Sin emojis. Máximo 300 palabras.

FORMATO EXACTO (Markdown, estas 4 secciones y nada más):
## Veredicto
**APTO**, **APTO CON OBSERVACIONES**, **REQUIERE REPARACIÓN** o **DIAGNÓSTICO INCOMPLETO**, seguido de una o dos frases que lo justifiquen.

## Hallazgos
Tabla con columnas | Prioridad | Sistema | Hallazgo | Evidencia |. Prioridad = Alta, Media o Baja. Máximo 6 filas, solo lo que requiere atención o verificación. Si no hay nada, escribe "Sin hallazgos que requieran atención."

## Acciones recomendadas
Lista numerada, máximo 5 pasos concretos y en orden de ejecución.

## Alcance del escaneo
Una a tres viñetas con lo que este escaneo NO pudo confirmar.`;
  },

  async analizarIA(idGuardado) {
    const s = idGuardado ? this._data.find(x => x.id === idGuardado) : this._scan;
    const el = document.getElementById('obd-ia');
    if (!s || !el) return;
    el.innerHTML = `<div class="card" style="padding:14px;margin-top:12px">⏳ Nexus está analizando el escaneo...</div>`;
    const veh = idGuardado ? s.vehiculos : this._vehiculos.find(v => v.id === s.vehiculo_id);
    this._resolverNombres(s, veh);
    const r = await IA.tecnico(this._promptIA(s, veh));
    if (!r.ok) { el.innerHTML = `<div class="card" style="padding:14px;margin-top:12px;color:var(--red)">⚠️ ${UI.esc(r.error)}</div>`; return; }
    /* La Edge Function contesta `texto`, no `respuesta`: leer el campo
       equivocado devolvía undefined, _iaHTML lo traducía a cadena vacía y el
       análisis de Nexus no aparecía NUNCA — sin un solo error en consola. */
    const texto = r.texto || '';
    if (!texto) { el.innerHTML = `<div class="card" style="padding:14px;margin-top:12px;color:var(--amber)">La IA no devolvió texto.</div>`; return; }
    s.ia_analisis = texto;
    if (idGuardado) await DB.upsertDiagnosticoOBD({ id: idGuardado, ia_analisis: texto });  // cachear: 1 sola consulta por escaneo
    el.innerHTML = this._iaHTML(texto);
  },

  _iaHTML(texto) {
    if (!texto) return '';
    const cuerpo = (typeof IA !== 'undefined' && IA._formatear) ? IA._formatear(texto)
      : `<div style="white-space:pre-wrap">${texto}</div>`;
    return `<div class="card" style="padding:14px;margin-top:12px;border-left:3px solid var(--cyan)">
      <b style="font-size:12px">🤖 ANÁLISIS DE NEXUS</b>
      <div style="font-size:13px;margin-top:6px">${cuerpo}</div>
    </div>`;
  },

  _modulosHTML(s) {
    if (!s || !s.modulos || !s.modulos.length) return '';
    /* En J1587 los módulos SON los MID y ahí sí aparecen frenos, tablero y
       demás; la advertencia de "acá no sale el ABS" sólo vale para OBD-II. */
    const j87 = /J1587/.test(s.protocolo || '');
    return `<div class="card" style="padding:14px;margin-top:12px">
      <b style="font-size:12px">MÓDULOS DETECTADOS (${s.modulos.length})</b>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;margin-top:6px">
        ${s.modulos.map(m => {
          const conf = (s.dtcs || []).filter(d => d.ecu === m.ecu).length;
          const pend = (s.dtcs_pendientes || []).filter(d => d.ecu === m.ecu).length;
          const col = conf ? 'red' : pend ? 'amber' : 'green';
          const estado = conf || pend
            ? `${conf ? `${conf} confirmado(s)` : ''}${conf && pend ? ' · ' : ''}${pend ? `${pend} pendiente(s)` : ''}`
            : 'responde · sin códigos';
          return `<div style="background:var(--surface2);border-radius:8px;padding:9px 11px;border-left:3px solid var(--${col})">
            <div style="font-size:12.5px;font-weight:600">${UI.esc(m.nombre)}</div>
            <div style="font-size:10px;color:var(--text3);font-family:ui-monospace,Consolas,monospace">${m.ecu ? (j87 ? `MID ${m.ecu}` : '0x' + m.ecu.toString(16).toUpperCase()) : 'dirección no expuesta'}</div>
            <div style="font-size:11.5px;margin-top:4px;color:var(--${col});font-weight:600">${estado}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:7px;line-height:1.5">
        ${j87
          ? 'Son los módulos que se anunciaron en el bus J1708 durante la escucha. Un módulo que no transmitió en esos segundos no aparece, aunque esté presente.'
          : 'Acá sólo aparecen los módulos que la norma OBD-II obliga a responder (motor y, si existe, transmisión). <b>ABS, airbag, dirección eléctrica y clima no salen en esta lista</b>: usan protocolos propios de cada marca. Que no aparezcan no significa que estén fallando.'}
      </div>
    </div>`;
  },

  _tablaDTCs(s) {
    const filas = [
      ...s.dtcs.map(x => ({ ...x, tipo:'Confirmado', color:'red' })),
      ...(s.dtcs_pendientes||[]).map(x => ({ ...x, tipo:'Pendiente', color:'amber' })),
    ];
    /* J1587 todavía no se contrastó contra un camión: el número manda, el texto
       acompaña. Se dice en pantalla para que nadie cambie una pieza por una
       interpretación que aún no se verificó. */
    const sinVerificar = /J1587/.test(s.protocolo || '')
      ? `<div style="background:var(--amber-dim);border:1px solid var(--amber-border);border-radius:6px;padding:7px 9px;margin-top:6px;font-size:11px;line-height:1.5">
          <b>Lectura J1587 sin verificar contra hardware.</b> Los números MID/PID/FMI son los que reporta
          el camión y son los que valen — contrastalos con la app de servicio de Navistar antes de
          intervenir. La descripción del FMI es orientativa.
        </div>` : '';
    return `<div class="card" style="padding:14px;margin-top:12px">
      <b style="font-size:12px">CÓDIGOS DE FALLA (DTC)</b>
      ${sinVerificar}
      ${filas.length ? `<table class="table" style="margin-top:6px;font-size:12px">
        <thead><tr><th>Código</th><th>Módulo</th><th>Descripción</th><th>Estado</th><th style="text-align:right">Guía</th></tr></thead>
        <tbody>${filas.map(f=>`<tr><td><b style="font-family:monospace">${f.codigo}</b></td><td style="font-size:11px;white-space:nowrap">${f.modulo || this._nombreModulo(f.ecu)}</td><td>${f.desc}${f.origen ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${f.origen}${f.fuente ? ` · ${f.fuente}` : ''}</div>` : ''}</td><td><span class="badge badge-${f.color}">${f.tipo}</span></td><td style="text-align:right;white-space:nowrap"><button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd.verGuia('${UI.esc(f.codigo)}')" title="Qué medir antes de cambiar piezas">🔧${this._GUIA[f.codigo] ? '' : '<span style="opacity:.5"> ·</span>'}</button></td></tr>`).join('')}</tbody>
      </table>` : this._sinCodigosHTML(s)}
    </div>`;
  },

  /* "Sin códigos" en verde solo si el vehículo REALMENTE contestó. Si no hubo
     evidencia de comunicación, decirlo en rojo: un escaneo que no llegó al bus
     no prueba que el vehículo esté sano, y el verde invita a devolverlo así. */
  _sinCodigosHTML(s) {
    const hablo = !!(s && ((s.modulos && s.modulos.length) || s.vin || s.mil ||
                           (s.datos && Object.keys(s.datos).length) || s.readiness));
    if (hablo) return '<p style="color:var(--green);margin:6px 0 0">✅ Sin códigos de falla</p>';
    return '<p style="color:var(--red);margin:6px 0 0"><b>⚠️ Sin comunicación con el vehículo.</b><br>' +
           '<span style="font-size:11.5px">No se leyó ningún dato, así que esto <b>no significa</b> que no tenga fallas. ' +
           'Revisá el cable, el switch en contacto y el adaptador, y volvé a escanear.</span></p>';
  },

  /* ── Voltaje de batería ──────────────────────────────────────────────────
     Venía SOLO del comando ATRV del ELM327, que por USB no existe (el CAN crudo
     no lo reporta): el campo quedaba vacío o en 0 aunque el propio ECU hubiera
     dicho su voltaje en un PID. Ahora se toma el primero que sirva:
     ATRV → PGN/PID de batería (168, 65271) → voltaje del ECU (PID 42 / 158).

     Un 0 nunca es lectura buena: si el bus contesta, hay batería. Por debajo de
     5 V se descarta como dato inválido en vez de mostrar "0V", que hace dudar
     de todo el escaneo. */
  _voltajeDe(datos) {
    for (const v of [datos && datos.volt, datos && datos.volt_ecu]) {
      if (v == null || v === '') continue;
      const n = parseFloat(String(v).replace(',', '.'));
      if (isFinite(n) && n > 5) return n.toFixed(1) + 'V';
    }
    return null;
  },

  /* Códigos por módulo. Va ARRIBA de la tabla de emisiones porque acá aparecen
     las fallas que el modo 03 no ve — y son las que el cliente está sintiendo. */
  /* Botón para buscar módulos extra en un vehículo pre-CAN. Aparte del escaneo
     normal a propósito: en estos vehículos la mayoría de los módulos hablan
     protocolo propietario y no contestan, así que cobrarle ~40 s a todos los
     escaneos por un resultado que casi siempre es "nadie" no vale la pena. */
  _botonMasModulos() {
    if (!this._ofreceKline || this._scan !== this._scanActual()) return '';
    return `<div class="card" style="padding:14px;margin-top:12px">
      <b style="font-size:12px">BUSCAR OTROS MÓDULOS</b>
      <div style="font-size:11.5px;color:var(--text2);margin-top:4px">
        Este vehículo es anterior al CAN de diagnóstico. El motor ya se leyó por OBD-II.
        Se puede preguntar además por otros módulos (KWP2000), pero en esta generación
        la mayoría —ABS, airbag, tracción, carrocería— usa protocolo propietario del
        fabricante y no va a contestar. Tarda alrededor de un minuto.
      </div>
      <button class="btn btn-sm btn-ghost" style="margin-top:8px"
        onclick="Modulos.diagnostico_obd.buscarMasModulos()">🔍 Buscar otros módulos</button>
    </div>`;
  },
  _scanActual() { return this._scan; },

  /* Una operación larga lanzada DESDE la página necesita su propio renglón de
     avance: el `obd-log` del modal existe pero está oculto, así que escribir
     ahí es escribir en el vacío — un minuto de pantalla muerta. Se crea uno en
     la página con el mismo id, y como #page-content va antes que el modal en el
     documento, `_log` lo encuentra a él. Lo borra el siguiente render. */
  _logEnPagina(titulo) {
    const el = document.getElementById('obd-result');
    if (!el) return;
    el.insertAdjacentHTML('afterbegin', `<div class="card" style="padding:12px;margin-bottom:10px">
      <b style="font-size:12px">${UI.esc(titulo)}</b>
      <div id="obd-log" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:9px 11px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.7;max-height:200px;overflow:auto;margin-top:7px"></div>
    </div>`);
  },

  async buscarMasModulos() {
    if (!this._scan) return;
    if (!this._klinePuedeModulos()) { UI.toast('Solo aplica con el vehículo conectado por Bluetooth', 'error'); return; }
    this._logEnPagina('🔍 Buscando otros módulos…');
    const log = m => this._log(m);
    this._mapaFaltantes = [];
    const porModulo = await this._escanearModulosKline(log)
      .catch(e => { log(`No se pudo buscar módulos: ${e.message}`); return null; });
    if (porModulo && porModulo.length) {
      this._scan.por_modulo = porModulo;
      this._scan.mapa_acceso = this._mapaDeEscaneo(porModulo);
      this._ofreceKline = false;
    }
    this._renderResultado();
  },

  /* Quién es cada módulo: dirección, lo que dijo de sí mismo y un botón para
     ponerle nombre de una vez para todo el modelo.

     Es la respuesta a "el escáner encontró once módulos y los llamó a todos
     'Módulo 0x7Bx'". La mayoría de los módulos NO publica su nombre, pero casi
     todos publican su NÚMERO DE PIEZA, y con ese número el mecánico sabe cuál
     es —lo busca, lo compara, lo pide— y lo bautiza acá mismo. Desde ese
     momento todos los escaneos de ese modelo lo llaman por su nombre. */
  _identidadModulosHTML(ms, veh) {
    if (!Array.isArray(ms) || !ms.length) return '';
    const conRef = ms.filter(m => m.ident && m.ident.referencia).length;
    const porIA = ms.filter(m => m.ident && m.ident.ia).length;
    const faltan = ms.filter(m => !(!m.ext && this._DIR_NO_ES_MODULO(m.ecu)) &&
                                  this._nombreGenerico(this._nombreResuelto(m, veh.marca).nombre, m.ecu)).length;
    return `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
      <b style="font-size:12px">QUIÉN ES CADA MÓDULO</b>
      <div style="font-size:10.5px;color:var(--text3);margin-top:2px;line-height:1.5">
        ${conRef ? `${conRef} de ${ms.length} módulo(s) entregaron su <b>número de pieza</b>. ` : ''}
        ${porIA ? `La IA identificó <b style="color:var(--green)">${porIA}</b> a partir de esa evidencia y queda guardado
             para todos los escaneos de ${UI.esc([veh.marca, veh.modelo].filter(Boolean).join(' ') || 'este modelo')}.` : ''}
        ${faltan ? `<b style="color:var(--amber)">${faltan}</b> siguen sin identificar: la evidencia no alcanzó para sostener un nombre.` : ''}
      </div>
      <div style="overflow:auto;margin-top:8px">
      <table class="table" style="font-size:11.5px">
        <thead><tr><th>Módulo</th><th>Dirección</th><th>Lo que dijo de sí mismo</th></tr></thead>
        <tbody>${ms.map(m => {
          const id = m.ident || {};
          const r = this._nombreResuelto(m, veh.marca);
          return `<tr>
            <td><b>${UI.esc(r.nombre)}</b>
              <div style="font-size:10px;color:var(--text3)">${UI.esc(r.origen)}</div></td>
            <td style="font-family:ui-monospace,Consolas,monospace;white-space:nowrap">0x${m.ecu.toString(16).toUpperCase()}</td>
            <td>${id.referencia ? `<div>referencia <b style="font-family:ui-monospace,Consolas,monospace">${UI.esc(id.referencia)}</b></div>` : ''}
              ${id.nombre ? `<div>se llama <b>${UI.esc(id.nombre)}</b></div>` : ''}
              ${id.proveedor ? `<div style="color:var(--text3)">fabricante ${UI.esc(id.proveedor)}</div>` : ''}
              ${id.ia && id.ia.fuente ? `<div style="color:var(--cyan)">🤖 ${UI.esc(id.ia.fuente)}</div>` : ''}
              ${!id.referencia && !id.nombre && !id.proveedor ? '<span style="color:var(--text3)">no publicó identificación</span>' : ''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      ${faltan ? `<button class="btn btn-sm btn-cyan" style="margin-top:8px"
          onclick="Modulos.diagnostico_obd.identificarConIA()">🤖 Que la IA lo intente de nuevo</button>` : ''}
      <div style="font-size:10.5px;color:var(--text3);margin-top:6px;line-height:1.5">
        La <b>referencia</b> es el número de repuesto que el módulo declara (identificador F187 de ISO 14229-1);
        es con lo que la IA identifica el módulo. Un módulo se queda <b>sin nombre a propósito</b> cuando la
        evidencia no alcanza: un nombre equivocado manda a desmontar el módulo que no era.
      </div>
    </div>`;
  },

  /* El botón de "Nombrar" salió de acá el 2026-09-22: investigar quién es un
     módulo es trabajo de la IA, no del mecánico con el vehículo enchufado.
     Lo hace bautizarModulosConIA(). El alta y la edición a mano siguen
     existiendo en 🧩 Módulos del modelo, que es donde vive ese CRUD. */

  _topologiaHTML(s) {
    const ms = (s && s.por_modulo) || [];
    if (!ms.length) return '';

    const subredes = {
      motriz: { titulo: '⚡ Tren Motriz (Powertrain CAN)', modulos: [] },
      chasis: { titulo: '🚗 Chasis & Seguridad (Chassis CAN)', modulos: [] },
      confort: { titulo: '🎛️ Carrocería & Confort (Body CAN)', modulos: [] },
    };

    for (const m of ms) {
      const ecu = Number(m.ecu);
      let cat = 'confort';
      if (ecu >= 0x7E0 && ecu <= 0x7E7) cat = 'motriz';
      else if ((ecu >= 0x7D0 && ecu <= 0x7D9) || ecu === 0x7A0 || ecu === 0x710 || ecu === 0x758 || (ecu >= 0x7C0 && ecu <= 0x7C5)) cat = 'chasis';
      else cat = 'confort';
      subredes[cat].modulos.push(m);
    }

    let html = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div>
            <b style="font-size:12px;color:var(--brand)">🌐 MAPA DE TOPOLOGÍA CAN DE LA RED</b>
            <div style="font-size:11px;color:var(--text3)">Esquema visual de comunicación de módulos en tiempo real. Tocá cualquier módulo para ver su ficha.</div>
          </div>
          <div style="display:flex;gap:8px;font-size:10.5px">
            <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:50%;background:rgba(34,197,94,0.85);display:inline-block"></span> Sano (0 fallas)</span>
            <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:50%;background:rgba(239,68,68,0.85);display:inline-block"></span> Con fallas</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:10px;margin-top:10px">
    `;

    for (const [key, sub] of Object.entries(subredes)) {
      if (!sub.modulos.length) continue;
      html += `
        <div style="background:var(--surface2);border-radius:8px;padding:9px;border:1px dashed var(--border)">
          <div style="font-size:10.5px;font-weight:700;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px">${UI.esc(sub.titulo)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${sub.modulos.map(m => {
              const numFallas = (m.codigos || []).length;
              const tieneFalla = numFallas > 0;
              const bgNode = tieneFalla ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.15)';
              const borderNode = tieneFalla ? 'rgba(239,68,68,0.6)' : 'rgba(34,197,94,0.4)';
              const colorText = tieneFalla ? 'var(--red)' : 'var(--green)';
              const badgeTxt = tieneFalla ? `🚨 ${numFallas} DTC` : '✓ OK';

              return `
                <div onclick="Modulos.diagnostico_obd.verModulo(${m.ecu})"
                     title="Abrir diagnóstico de ${UI.esc(m.nombre)} (0x${m.ecu.toString(16).toUpperCase()})"
                     style="cursor:pointer;background:${bgNode};border:1px solid ${borderNode};border-radius:6px;padding:6px 8px;flex:1;min-width:120px;transition:all 0.15s ease">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:10px;font-family:monospace;color:var(--text3);font-weight:700">0x${m.ecu.toString(16).toUpperCase()}</span>
                    <span style="font-size:9.5px;font-weight:800;color:${colorText}">${badgeTxt}</span>
                  </div>
                  <div style="font-size:11px;font-weight:700;color:var(--text);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${UI.esc(m.nombre)}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;
    return html;
  },

  _porModuloHTML(s) {
    const ms = s && s.por_modulo;
    if (!Array.isArray(ms) || !ms.length) return this._botonMasModulos();
    /* La marca y el modelo hacen útil la búsqueda del código: sin eso el
       enlace devuelve resultados de veinte fabricantes distintos. */
    const veh = (s && s.vehiculos) ||
                (this._vehiculos || []).find(v => v.id === (s && s.vehiculo_id)) || {};
    /* Borrar y reiniciar solo tienen sentido con el vehículo enchufado: al
       abrir un escaneo guardado no hay a quién mandarle el comando. Y no es
       exclusivo del USB: el mismo ELM que barrió los módulos sabe dirigirse a
       uno solo. */
    const vivo = s === this._scan && this._puedePuntoAPunto().ok;
    const conFallas = ms.filter(m => m.codigos && m.codigos.length);
    const total = conFallas.reduce((n, m) => n + m.codigos.length, 0);
    const activos = conFallas.reduce((n, m) => n + m.codigos.filter(c => c.activo).length, 0);

    return `<div class="card" style="padding:14px;margin-top:12px${activos ? ';border:1px solid rgba(239,68,68,.45)' : ''}">
      ${this._topologiaHTML(s)}
      <b style="font-size:12px">ESCANEO POR MÓDULO (todo el vehículo)</b>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">
        ${ms.length} módulo(s) consultados uno por uno. Acá aparecen las fallas que el escaneo de emisiones no puede ver: frenos, presión de neumáticos, tracción, carrocería.
      </div>
      ${total ? `<div style="font-size:12px;margin-top:8px"><b>${total} código(s)</b> en ${conFallas.length} módulo(s)${activos ? ` · <span style="color:var(--red)"><b>${activos} activo(s) ahora</b></span>` : ''}</div>` : ''}
      ${!total ? '<p style="color:var(--green);margin:8px 0 0;font-size:12px">✅ Ningún módulo reportó códigos</p>' : `
      <div style="margin-top:10px">${conFallas.map(m => `
        <div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:600;margin-bottom:4px">${UI.esc(m.nombre)}
            <span style="color:var(--text3);font-weight:400;font-family:ui-monospace,Consolas,monospace;font-size:10.5px"> · 0x${m.ecu.toString(16).toUpperCase()}</span></div>
          ${m.codigos.map(c => `
            <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
              <span style="flex-shrink:0;padding:2px 8px;border-radius:6px;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;font-weight:700;
                background:${c.activo ? 'rgba(239,68,68,.16)' : 'rgba(148,163,184,.14)'};
                color:${c.activo ? 'var(--red)' : 'var(--text2)'}">${UI.esc(c.codigo)}${c.activo ? ' ●' : ''}</span>
              <span style="flex:1;font-size:11.5px;line-height:1.45">
                ${c.desc
                  ? UI.esc(c.desc)
                  : `<span style="color:var(--text3)">${UI.esc(c.sistema || '')} — código propio del fabricante</span>`}
                ${c.tipo ? `<span style="color:${c.tipo.cierto ? 'var(--text2)' : 'var(--text3)'}"> · ${UI.esc(c.tipo.txt)}</span>` : ''}
                ${c.estadoDesconocido
                  ? '<span style="color:var(--text3)" title="El modulo contesto en KWP2000: el numero del codigo es fiable, el byte de estado no esta verificado"> · estado no reportado</span>'
                  : c.activo ? '<b style="color:var(--red)"> · presente ahora</b>' : '<span style="color:var(--text3)"> · guardada</span>'}
              </span>
              <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
                <button class="btn btn-xs btn-brand" style="font-size:10px;padding:2px 6px"
                        onclick="Modulos.diagnostico_obd.asistenteDTC('${c.codigo}', '${UI.esc(m.nombre)}', '${UI.esc(veh.marca||'')}', '${UI.esc(veh.modelo||'')}', '${veh.anio||''}')">
                  💡 Asistente
                </button>
                <button class="btn btn-xs" style="font-size:10px;padding:2px 6px;background:var(--surface2);border:1px solid var(--border)"
                        onclick="Modulos.diagnostico_obd.verGuia('${c.codigo}')">
                  🔧 Guía
                </button>
                <a href="${this._buscarDTC(c.codigo, veh)}" target="_blank" rel="noopener"
                   style="font-size:11px;color:var(--cyan);text-decoration:none"
                   title="Buscar este código para ${UI.esc([veh.marca, veh.modelo].filter(Boolean).join(' ') || 'este vehículo')}">🔎 buscar</a>
                <a href="https://www.youtube.com/results?search_query=${encodeURIComponent('reparar DTC ' + c.codigo + ' ' + (veh.marca||'') + ' ' + (veh.modelo||''))}" target="_blank" rel="noopener"
                   style="font-size:11px;color:#ef4444;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:3px"
                   title="Buscar solución en video para ${c.codigo} en YouTube">
                  🎥 YouTube
                </a>
              </div>
            </div>`).join('')}
        </div>`).join('')}
      </div>
      <div style="font-size:10.5px;color:var(--text3);border-top:1px solid var(--border);padding-top:6px">
        ● = falla presente en este momento; el resto quedó guardada de antes.
        <b>"Estado no reportado"</b> es un módulo viejo que contestó en KWP2000: el número del código es
        fiable, pero su byte de estado no está verificado y por eso no se interpreta — confirmalo en el vehículo.
        Los códigos C1xxx, B1xxx y U1xxx son <b>propios de cada marca</b>: el mismo número
        significa cosas distintas en Nissan y en Toyota, por eso no se traducen a ciegas.
        El botón <b>🔎 buscar</b> los consulta junto con la marca y el modelo.
      </div>`}
      ${ms.length > conFallas.length ? `<div style="font-size:10.5px;color:var(--text3);margin-top:6px">
        Sin códigos: ${ms.filter(m => !m.codigos.length).map(m => UI.esc(m.nombre)).join(' · ')}</div>` : ''}
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
        <button class="btn btn-brand" onclick="Modulos.diagnostico_obd.modalCentroModulos()">
          🧠 Centro de módulos</button>
        <span style="font-size:11.5px;color:var(--text3);margin-left:8px">
          Todo el vehículo ordenado por gravedad, y de ahí a la ficha de cada módulo.</span>
      </div>
      ${this._identidadModulosHTML(ms, veh)}
      ${vivo ? `
        <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:6px">
            <b>Ver datos de un módulo</b> — identificación y valores en vivo. Solo lectura.
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${ms.map(m => `<button class="btn btn-sm btn-ghost"
              title="Identificación y datos que expone este módulo"
              onclick="Modulos.diagnostico_obd.verModulo(${m.ecu})">📊 ${UI.esc(m.nombre)}</button>`).join('')}
          </div>
        </div>` : ''}
      ${vivo && total ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
          <button class="btn btn-sm btn-danger" onclick="Modulos.diagnostico_obd.borrarPorModulo()">
            🧹 Borrar códigos de todos los módulos</button>
          ${conFallas.map(m => `<button class="btn btn-sm btn-ghost" title="Reiniciar este módulo (no borra nada)"
            onclick="Modulos.diagnostico_obd.resetModulo(${m.ecu})">🔄 ${UI.esc(m.nombre)}</button>`).join('')}
        </div>
        <div style="font-size:10.5px;color:var(--text3);margin-top:6px">
          Borrar <b>no repara</b>: los códigos vuelven si la falla sigue. Se guarda el escaneo antes,
          y se reinician los monitores de emisiones (puede reprobar una inspección hasta que vuelvan a correr).
        </div>` : ''}
    </div>`;
  },

  /* Cobro del escaneo, visible en el reporte para que no se pase por alto al
     armar la OT. La tarifa es del taller, así que se muestra como sugerencia:
     el monto final lo decide quien factura. */
  /* Tarjeta de equipamiento: lo que el vehículo declara y lo que falta.
     Va arriba porque un DPF eliminado no genera ningún código y se pasaría por
     alto mirando solo la lista de fallas. */
  _equipamientoHTML(s) {
    const e = s && s.equipamiento;
    const r = s && s.readiness;
    if (!e && !r && !s?.norma_obd && !s?.calibracion && !(s?.permanentes || []).length) return '';
    const av = (e && e.avisos) || [];
    const alto = av.filter(a => a.nivel === 'alto');

    const chip = m => `<span style="display:inline-block;padding:2px 8px;margin:2px;border-radius:10px;font-size:11px;` +
      `background:${m.soportado ? (m.listo ? 'rgba(34,197,94,.15)' : 'rgba(245,158,11,.15)') : 'rgba(148,163,184,.12)'};` +
      `color:${m.soportado ? (m.listo ? 'var(--green)' : 'var(--amber)') : 'var(--text3)'}">` +
      `${m.soportado ? (m.listo ? '✓' : '◔') : '—'} ${UI.esc(m.nombre)}</span>`;

    const origen = e && e.origen;
    return `<div class="card" style="padding:14px;margin-top:12px${alto.length ? ';border:1px solid rgba(239,68,68,.45)' : ''}">
      <b style="font-size:12px">EQUIPAMIENTO DECLARADO POR EL VEHÍCULO</b>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">Un sistema eliminado del software no genera códigos: se detecta porque el motor deja de declarar su monitor.</div>
      ${origen ? `<div style="font-size:11.5px;margin-top:6px">Origen por VIN: <b>${UI.esc(origen.pais)}</b>${origen.anio ? ` · modelo <b>${origen.anio}</b>` : ''}</div>` : ''}
      ${s.norma_obd ? `<div style="font-size:11.5px">Norma declarada: <b>${UI.esc(s.norma_obd.nombre)}</b></div>` : ''}
      ${s.calibracion?.calid ? `<div style="font-size:11.5px">Calibración: <b style="font-family:ui-monospace,Consolas,monospace">${UI.esc(s.calibracion.calid)}</b></div>` : ''}
      ${s.calibracion?.cvn ? `<div style="font-size:11.5px">CVN: <span style="font-family:ui-monospace,Consolas,monospace">${UI.esc(s.calibracion.cvn)}</span> <span style="color:var(--text3)">— dos vehículos iguales de fábrica traen el mismo</span></div>` : ''}
      ${r ? `<div style="margin-top:8px"><div style="font-size:11px;color:var(--text3)">Monitores (motor ${r.diesel ? 'diésel' : 'a gasolina'}): ✓ listo · ◔ sin completar · — no declarado</div>
        <div style="margin-top:4px">${r.monitores.map(chip).join('')}</div></div>` : ''}
      ${(s.permanentes || []).length ? `<div style="margin-top:8px;font-size:11.5px;color:var(--amber)">
        <b>${s.permanentes.length} código(s) permanente(s):</b> ${s.permanentes.map(p => UI.esc(p.codigo)).join(', ')}
        <div style="color:var(--text3);font-size:11px">No se borran desconectando la batería. Si aparecen sin códigos confirmados, la memoria se limpió hace poco.</div></div>` : ''}
      ${av.length ? `<div style="margin-top:8px">${av.map(a => {
        const col = a.nivel === 'alto' ? 'var(--red)' : a.nivel === 'medio' ? 'var(--amber)' : 'var(--text3)';
        const ic = a.nivel === 'alto' ? '⛔' : a.nivel === 'medio' ? '⚠️' : 'ℹ️';
        return `<div style="font-size:11.5px;color:${col};margin-top:3px">${ic} ${a.txt}</div>`;
      }).join('')}</div>` : ''}
      ${this._igualesHTML(e && e.iguales)}
    </div>`;
  },

  /* Comparación contra los mismos modelos del taller. Se dice SIEMPRE sobre
     cuántos vehículos se apoya: sin ese número, "no coincide con sus iguales"
     puede significar tanto "contra 30 vehículos" como "contra uno". */
  _igualesHTML(g) {
    if (!g) return '';
    const cab = `<div style="font-size:11px;color:var(--text3);margin-top:8px;border-top:1px solid var(--border);padding-top:6px">` +
                `Comparado contra ${g.n} ${UI.esc(g.marca)} ${UI.esc(g.modelo)}${g.anio ? ' ' + g.anio : ''} del taller</div>`;
    if (g.insuficiente)
      return `<div style="font-size:11px;color:var(--text3);margin-top:8px;border-top:1px solid var(--border);padding-top:6px">` +
             `Solo ${g.n} ${UI.esc(g.marca)} ${UI.esc(g.modelo)} en el historial: hacen falta ${this._MIN_IGUALES} para comparar. ` +
             `Escaneá más de este modelo — sobre todo los que estén sanos — y esta sección empieza a servir.</div>`;
    if (!g.avisos || !g.avisos.length)
      return cab + `<div style="font-size:11.5px;color:var(--green)">✓ Coincide con sus iguales</div>`;
    return cab + g.avisos.map(a =>
      `<div style="font-size:11.5px;color:${a.nivel === 'alto' ? 'var(--red)' : 'var(--amber)'};margin-top:3px">` +
      `${a.nivel === 'alto' ? '⛔' : '⚠️'} ${a.txt}</div>`).join('');
  }
  }));
})();
