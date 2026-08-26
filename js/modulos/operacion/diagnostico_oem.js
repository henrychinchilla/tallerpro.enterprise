/* NexusPro — capa OEM segura. Una definición no verificada nunca transmite. */
(function () {
  'use strict';
  const TIPOS = ['did','prueba_activa','calibracion','regeneracion_dpf','purga_abs','codificacion','reflash','security_access','procedimiento'];
  const CANALES = [
    {id:'hs',nombre:'HS-CAN',estado:'operativo',nota:'CAN principal por comandos estándar ELM/ISO 15765'},
    {id:'ms',nombre:'MS-CAN',estado:'validar',nota:'Capacidad del vLinker MS; comando de selección pendiente de prueba física'},
    {id:'sw',nombre:'SW-CAN / GMLAN',estado:'validar',nota:'Capacidad del vLinker MS; no transmitir sin comando oficial validado'},
    {id:'ch',nombre:'CH-CAN',estado:'validar',nota:'Capacidad declarada; selección pendiente de validar'},
    {id:'ls',nombre:'LS-CAN',estado:'validar',nota:'Capacidad declarada; selección pendiente de validar'}
  ];
  const FAMILIAS = [
    {id:'elm',nombre:'ELM/ST por BLE',transportes:['ble'],protocolos:['obd2','uds','kwp2000','j1939'],nota:'Vgate, OBDLink, ELM327 y compatibles'},
    {id:'rp1210',nombre:'RP1210',transportes:['usb'],protocolos:['j1939','j1708','j1587','can','iso15765'],nota:'NEXIQ, DPA, Dearborn y cualquier DLL registrada'},
    {id:'j2534',nombre:'J2534 Pass-Thru',transportes:['usb'],protocolos:['can','iso15765','iso9141','iso14230'],nota:'Capa prevista; requiere proveedor J2534 instalado'},
    {id:'fabricante',nombre:'SDK de fabricante',transportes:['ble','classic','wifi','usb'],protocolos:[],nota:'Thinkcar y otros VCI cerrados: se integra cuando el fabricante entrega SDK/API autorizada'},
    {id:'vci',nombre:'VCI futuro',transportes:['usb','ble','wifi'],protocolos:[],nota:'Contrato abierto para interfaces OEM o multimarca'}
  ];
  const DIDS_BASE = [
    {did:'F190',nombre:'VIN',decoder:{tipo:'ascii'},fuente:'ISO 14229-1, ReadDataByIdentifier'},
    {did:'F187',nombre:'Número de pieza de repuesto de la ECU',decoder:{tipo:'ascii'},fuente:'ISO 14229-1, identificadores de datos de vehículo'},
    {did:'F189',nombre:'Versión de software de la ECU',decoder:{tipo:'ascii'},fuente:'ISO 14229-1, identificadores de datos de vehículo'},
    {did:'F18C',nombre:'Número de serie de la ECU',decoder:{tipo:'ascii'},fuente:'ISO 14229-1, identificadores de datos de vehículo'}
  ];
  const MARCAS_OEM = ['Toyota','Nissan','Hyundai','Kia','Mitsubishi','Honda','Mazda','Isuzu','Suzuki','Chevrolet / GM','Ford','Volkswagen','Mercedes-Benz','Hino','Fuso','JAC','Foton','Otro'];
  const ECUS_OEM = ['ECM / PCM (motor)','TCM (transmisión)','ABS / EBCM (frenos)','BCM (carrocería)','SRS / ACM (airbag)','EPS / PSCM (dirección)','IPC (tablero)','HVAC (climatización)','4WD / AWD','Inmovilizador','Gateway','ADAS','Otro'];
  const PROTOCOLOS_OEM = ['uds','kwp2000','obd2','j1939','j1708_j1587','iso9141','fabricante'];
  const PERFILES_SIMULADOS = {
    ford:{marca:'Ford',modelo:'Perfil de laboratorio',redes:[
      {id:'hs',modulos:[{req:0x7E0,resp:0x7E8,nombre:'PCM'},{req:0x7E1,resp:0x7E9,nombre:'TCM'},{req:0x760,resp:0x768,nombre:'ABS'}]},
      {id:'ms',modulos:[{req:0x726,resp:0x72E,nombre:'BCM'},{req:0x720,resp:0x728,nombre:'IPC'}]}
    ]},
    gm:{marca:'GM',modelo:'Perfil de laboratorio',redes:[
      {id:'hs',modulos:[{req:0x7E0,resp:0x7E8,nombre:'ECM'},{req:0x7E1,resp:0x7E9,nombre:'TCM'},{req:0x760,resp:0x768,nombre:'EBCM'}]},
      {id:'sw',modulos:[{req:0x241,resp:0x641,nombre:'BCM'},{req:0x244,resp:0x644,nombre:'IPC'}]}
    ]},
    toyota:{marca:'Toyota',modelo:'Perfil de laboratorio',redes:[{id:'hs',modulos:[{req:0x7E0,resp:0x7E8,nombre:'ECM'},{req:0x7E1,resp:0x7E9,nombre:'TCM'},{req:0x750,resp:0x758,nombre:'ABS'},{req:0x7A0,resp:0x7A8,nombre:'SRS'}]}]},
    nissan:{marca:'Nissan',modelo:'Perfil de laboratorio',redes:[{id:'hs',modulos:[{req:0x7E0,resp:0x7E8,nombre:'ECM'},{req:0x7E1,resp:0x7E9,nombre:'TCM'},{req:0x740,resp:0x748,nombre:'BCM'},{req:0x760,resp:0x768,nombre:'ABS'}]}]},
    hyundai_kia:{marca:'Hyundai / Kia',modelo:'Perfil de laboratorio',redes:[{id:'hs',modulos:[{req:0x7E0,resp:0x7E8,nombre:'ECM'},{req:0x7E1,resp:0x7E9,nombre:'TCM'},{req:0x7D1,resp:0x7D9,nombre:'ABS'},{req:0x7A0,resp:0x7A8,nombre:'SRS'}]}]},
    mitsubishi:{marca:'Mitsubishi',modelo:'Perfil de laboratorio',redes:[{id:'hs',modulos:[{req:0x7E0,resp:0x7E8,nombre:'ECM'},{req:0x7E1,resp:0x7E9,nombre:'TCM'},{req:0x760,resp:0x768,nombre:'ABS'},{req:0x720,resp:0x728,nombre:'ETACS'}]}]},
    isuzu:{marca:'Isuzu',modelo:'Perfil de laboratorio',redes:[{id:'hs',modulos:[{req:0x7E0,resp:0x7E8,nombre:'ECM'},{req:0x7E1,resp:0x7E9,nombre:'TCM'},{req:0x760,resp:0x768,nombre:'ABS'}]},{id:'ch',modulos:[{req:0x18DA00F1,resp:0x18DAF100,nombre:'ECM/J1939 gateway'}]}]}
  };
  const hex = b => (b || []).map(x => Number(x).toString(16).padStart(2,'0').toUpperCase()).join(' ');
  const propsBLE = p => ['broadcast','read','writeWithoutResponse','write','notify','indicate','authenticatedSignedWrites','reliableWrite','writableAuxiliaries'].filter(k=>!!p?.[k]);
  const Motor = {
    canales: CANALES, familias:FAMILIAS, didsBase:DIDS_BASE, perfilesSimulados:PERFILES_SIMULADOS, marcas:MARCAS_OEM, ecus:ECUS_OEM, protocolos:PROTOCOLOS_OEM, propsBLE,
    construirTopologia(redes=[], meta={}) {
      const conocidas=new Set(CANALES.map(c=>c.id));
      const salida=CANALES.map(c=>({id:c.id,nombre:c.nombre,estado:'no_escaneada',modulos:[]}));
      for(const r of redes||[]) {
        if(!conocidas.has(r?.id)) continue;
        const destino=salida.find(x=>x.id===r.id);
        destino.estado=r.estado||'escaneada';
        const unicos=new Map();
        for(const m of r.modulos||[]) {
          const req=Number(m.req), resp=Number(m.resp);
          if(!Number.isInteger(req)||!Number.isInteger(resp)) continue;
          unicos.set(`${req}:${resp}`,{req,resp,nombre:String(m.nombre||'ECU desconocida'),protocolo:m.protocolo||'UDS/ISO-TP',simulado:!!m.simulado});
        }
        destino.modulos=[...unicos.values()];
      }
      return {version:1,fecha:new Date().toISOString(),modo:meta.modo||'real',marca:meta.marca||null,modelo:meta.modelo||null,adaptador:meta.adaptador||null,redes:salida,total_modulos:salida.reduce((n,r)=>n+r.modulos.length,0)};
    },
    simularTopologia(marca) {
      const p=PERFILES_SIMULADOS[String(marca||'').toLowerCase()];
      if(!p) throw new Error('Perfil simulado no disponible');
      return this.construirTopologia(p.redes.map(r=>({...r,estado:'simulada',modulos:r.modulos.map(m=>({...m,simulado:true}))})),{modo:'simulador',marca:p.marca,modelo:p.modelo,adaptador:'ECU virtual NexusPro'});
    },
    validar(d) {
      const e=[];
      for (const k of ['nombre','marca','ecu','tipo','fuente']) if (!String(d?.[k]||'').trim()) e.push(`Falta ${k}`);
      if (!TIPOS.includes(d?.tipo)) e.push('Tipo no permitido');
      if (d?.tipo === 'did' && !/^[0-9A-Fa-f]{4}$/.test(String(d.identificador||''))) e.push('El DID debe tener 4 hexadecimales');
      if (d?.protocolo && !PROTOCOLOS_OEM.includes(d.protocolo)) e.push('Protocolo no permitido');
      if (d?.definicion?.red && !CANALES.some(c=>c.id===d.definicion.red)) e.push('Red no permitida');
      if (d?.riesgo !== 'lectura' && d?.estado !== 'verificado') e.push('Una acción no puede habilitarse sin estado verificado');
      return e;
    },
    aplica(d,v) {
      const eq=(a,b)=>String(a||'').trim().toUpperCase()===String(b||'').trim().toUpperCase();
      const an=Number(v?.anio)||null;
      return !!d?.activa && eq(d.marca,v?.marca) && (!d.modelo || eq(d.modelo,v?.modelo)) &&
        (!an || (!d.anio_desde || an>=d.anio_desde) && (!d.anio_hasta || an<=d.anio_hasta));
    },
    decodificar(bytes, def={}) {
      if (!bytes?.length) return null;
      const tipo=def.tipo||'hex';
      if (tipo==='ascii') return bytes.map(x=>x?String.fromCharCode(x):'').join('').trim();
      let n=0; for (const b of bytes) n=n*256+b;
      if (def.signed) { const bits=bytes.length*8, max=2**bits; if(n>=max/2)n-=max; }
      if (tipo==='numero') return n*(Number(def.escala)||1)+(Number(def.offset)||0);
      return hex(bytes);
    },
    puedeEjecutar(d) {
      const errores=this.validar(d);
      if (errores.length) return {ok:false,motivo:errores.join('. ')};
      if (d.estado!=='verificado') return {ok:false,motivo:'La definición todavía no está verificada'};
      if (d.tipo!=='did' || d.riesgo!=='lectura') return {ok:false,motivo:'Esta versión solo habilita lecturas DID verificadas; la operación queda bloqueada'};
      return {ok:true};
    }
  };
  globalThis.OEMMotor=Motor;
  const M=globalThis.Modulos?.diagnostico_obd;
  if (!M) return;
  Object.assign(M, {
    _oemDefs:[], _oemAdaptador:null, _inspeccionBLE:null, _oemTopologia:null,
    async inspeccionarBluetooth() {
      if (!navigator.bluetooth) return UI.toast('Este navegador no ofrece Web Bluetooth','error');
      const svcs=[...new Set([...(this._SVC_CANDIDATOS||[]),...(this._UUIDS||[]).map(x=>x.svc),'0000180a-0000-1000-8000-00805f9b34fb'])];
      let dev,server;
      try {
        dev=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:svcs});
        server=await dev.gatt.connect();
        const servicios=[];
        for(const s of await server.getPrimaryServices()) {
          const chars=[];
          try { for(const c of await s.getCharacteristics()) chars.push({uuid:c.uuid,propiedades:propsBLE(c.properties)}); }
          catch(e){ chars.push({error:e.message}); }
          servicios.push({uuid:s.uuid,caracteristicas:chars});
        }
        this._inspeccionBLE={fecha:new Date().toISOString(),nombre:dev.name||null,id:dev.id||null,tipo:'BLE Web Bluetooth',servicios,limitacion:'Chrome solo revela servicios UUID solicitados previamente; un resultado vacío no significa que el dongle no tenga servicios.',agente:navigator.userAgent||null};
        await DB.registrarEjecucionOEM({operacion:'inspeccion_ble_pasiva',estado:'exitosa',evidencia:this._inspeccionBLE});
      } catch(e) {
        if(e?.name==='NotFoundError') return UI.toast('Inspección cancelada','info');
        this._inspeccionBLE={fecha:new Date().toISOString(),nombre:dev?.name||null,id:dev?.id||null,tipo:'BLE Web Bluetooth',servicios:[],error:e.message};
        await DB.registrarEjecucionOEM({operacion:'inspeccion_ble_pasiva',estado:'fallida',evidencia:this._inspeccionBLE,error:e.message}).catch(()=>{});
      } finally { try{server?.disconnect();}catch(_){} }
      this.modalInspeccionBLE();
    },
    modalInspeccionBLE() {
      const r=this._inspeccionBLE; if(!r)return;
      const total=(r.servicios||[]).reduce((n,s)=>n+(s.caracteristicas||[]).filter(c=>c.uuid).length,0);
      UI.modal('🔬 Inspector de interfaz Bluetooth',`<div class="card" style="padding:14px"><b>${UI.esc(r.nombre||'Dispositivo sin nombre')}</b><p>${r.error?`<span style="color:var(--red)">${UI.esc(r.error)}</span>`:`${r.servicios.length} servicio(s) accesible(s) · ${total} característica(s)`}</p><small>${UI.esc(r.limitacion||'')}</small></div>
      <div style="max-height:52vh;overflow:auto;margin-top:12px">${(r.servicios||[]).map(s=>`<div class="card" style="padding:11px;margin-bottom:8px"><b style="font-family:monospace">${UI.esc(s.uuid)}</b>${(s.caracteristicas||[]).map(c=>`<div style="font-family:monospace;font-size:11px;margin-top:6px">↳ ${UI.esc(c.uuid||c.error)} <span style="color:var(--text3)">${UI.esc((c.propiedades||[]).join(', '))}</span></div>`).join('')}</div>`).join('')||'<p>No se revelaron servicios autorizados. La capa Android nativa será necesaria para inspección completa o Bluetooth Classic.</p>'}</div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button><button class="btn btn-cyan" onclick="Modulos.diagnostico_obd.copiarInspeccionBLE()">📋 Copiar reporte</button></div>`,'820px');
    },
    async copiarInspeccionBLE() { if(!this._inspeccionBLE)return; await navigator.clipboard.writeText(JSON.stringify(this._inspeccionBLE,null,2)); UI.toast('Reporte Bluetooth copiado ✓'); },
    async detectarAdaptadorOEM() {
      if (this._via!=='ble' || !this._listo) {
        if (this._via==='usb' && this._listo) {
          this._oemAdaptador={modelo:'Interfaz RP1210',familia:'rp1210',firmware:null,volt:'por bus',canales:[CANALES[0]],nota:'La API y protocolos instalados se enumeran desde RP121032.INI'};
          return this.modalOEM();
        }
        return UI.toast('Conecta primero un adaptador BLE o RP1210','warn');
      }
      const consultar=async c=>{ try{return String(await this._cmd(c,1800)).replace(/\s+/g,' ').trim();}catch(e){return 'sin respuesta';} };
      const [ati,desc,serie,volt,sti]=await Promise.all([consultar('ATI'),consultar('AT@1'),consultar('AT@2'),consultar('ATRV'),consultar('STI')]);
      const esMS=/vlinker\s*ms|mic3425/i.test([ati,desc,sti].join(' '));
      this._oemAdaptador={ati,desc,serie,volt,sti,familia:'elm',modelo:esMS?'Vgate vLinker MS':(ati||desc||'ELM/ST compatible'),firmware:(ati+' '+sti).match(/\d+\.\d+(?:\.\d+)?/)?.[0]||null,canales:esMS?CANALES:CANALES.slice(0,1)};
      this.modalOEM();
    },
    async modalOEM() {
      this._oemDefs=await DB.getDefinicionesOEM();
      const a=this._oemAdaptador;
      const puede=typeof rolEnLista==='function' ? rolEnLista(['admin','gerente_tal']) : false;
      UI.modal('🧠 Diagnóstico OEM',`<div style="display:grid;gap:14px">
        <div class="card" style="padding:14px"><b>Adaptador y redes</b><div style="margin-top:8px">${a?`<b>${UI.esc(a.modelo)}</b> · firmware ${UI.esc(a.firmware||'no identificado')} · ${UI.esc(a.volt)}`:'Conecta el adaptador durante un escaneo para interrogarlo.'}</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px">${CANALES.map(c=>`<span class="badge badge-${c.estado==='operativo'?'green':'amber'}" title="${UI.esc(c.nota)}">${c.nombre} · ${c.estado}</span>`).join('')}</div>
        <button class="btn btn-sm btn-ghost" style="margin-top:10px" onclick="Modulos.diagnostico_obd.detectarAdaptadorOEM()">🔎 Detectar adaptador conectado</button>
        <button class="btn btn-sm btn-cyan" style="margin-top:10px" onclick="Modulos.diagnostico_obd.inspeccionarBluetooth()">🔬 Inspeccionar cualquier BLE</button>
        <button class="btn btn-sm btn-brand" style="margin-top:10px" onclick="Modulos.diagnostico_obd.explorarRedesOEM()">🗺 Explorar módulos</button>
        <select class="form-select" id="oem-simulador" style="display:inline-block;width:auto;margin-top:10px"><option value="">Simulador de red…</option>${Object.entries(PERFILES_SIMULADOS).map(([id,p])=>`<option value="${id}">${UI.esc(p.marca)}</option>`).join('')}</select>
        <button class="btn btn-sm btn-ghost" style="margin-top:10px" onclick="Modulos.diagnostico_obd.simularRedOEM(document.getElementById('oem-simulador').value)">🧪 Ejecutar simulador</button>
        <div style="margin-top:10px;font-size:11px;color:var(--text3)">${FAMILIAS.map(f=>`<b>${f.nombre}</b>: ${f.nota}`).join(' · ')}</div></div>
        <div class="card" style="padding:14px"><div style="display:flex;justify-content:space-between"><b>Catálogo OEM (${this._oemDefs.length})</b>${puede?'<button class="btn btn-sm btn-brand" onclick="Modulos.diagnostico_obd.editarOEM()">＋ Nueva definición</button>':''}</div>
        <div style="overflow:auto;margin-top:9px"><table class="table"><thead><tr><th>Marca/modelo</th><th>ECU</th><th>Función</th><th>Evidencia</th><th>Riesgo</th><th>Acciones</th></tr></thead><tbody>${this._oemDefs.length?this._oemDefs.map(d=>`<tr><td><b>${UI.esc(d.marca)}</b> ${UI.esc(d.modelo||'')}</td><td>${UI.esc(d.ecu)}</td><td>${UI.esc(d.nombre)}<br><small>${UI.esc(d.tipo)} ${UI.esc(d.identificador||'')}</small></td><td><span class="badge badge-${d.estado==='verificado'?'green':'amber'}">${UI.esc(d.estado)}</span><br><small>${UI.esc(d.fuente)}</small></td><td>${UI.esc(d.riesgo)}</td><td>${Modulos.btnAccion('ver',`Modulos.diagnostico_obd.verOEM('${d.id}')`)}${Modulos.btnAccion('editar',`Modulos.diagnostico_obd.editarOEM('${d.id}')`)}${Modulos.btnAccion('eliminar',`Modulos.diagnostico_obd.eliminarOEM('${d.id}','${UI.jsAttr(d.nombre)}')`)}</td></tr>`).join(''):'<tr><td colspan="6">Aún no hay definiciones. Agrega únicamente información con fuente comprobable.</td></tr>'}</tbody></table></div></div>
        ${this._oemTopologia?this._topologiaOEMHTML(this._oemTopologia):''}
        <div class="card" style="padding:14px"><b>Paquete base UDS de identificación</b><p>${DIDS_BASE.map(d=>`<code>${d.did}</code> ${UI.esc(d.nombre)}`).join(' · ')}</p><small>Son DIDs normalizados para descubrir identidad; una ECU puede no implementarlos. No se presentan como parámetros exclusivos de Ford o GM.</small></div>
        <div class="card" style="padding:14px"><b>Paquetes iniciales</b><p>Ford y GM están preparados como objetivos. Las pruebas activas, calibraciones, DPF, purga ABS, codificación, Security Access y reflash permanecen bloqueadas hasta incorporar una definición verificada y sus precondiciones.</p></div>
      </div>`, '1100px');
    },
    _topologiaOEMHTML(t) {
      return `<div class="card" style="padding:14px"><div style="display:flex;justify-content:space-between;gap:10px"><b>Mapa de redes · ${UI.esc(t.modo)}</b><span class="badge badge-${t.modo==='simulador'?'amber':'green'}">${t.total_modulos} módulo(s)</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-top:10px">${t.redes.map(r=>`<div style="border:1px solid var(--border);border-radius:8px;padding:9px"><b>${UI.esc(r.nombre)}</b><br><small>${UI.esc(r.estado)}</small>${r.modulos.map(m=>`<div style="margin-top:6px;font-size:12px"><b>${UI.esc(m.nombre)}</b><br><code>${m.req.toString(16).toUpperCase()} → ${m.resp.toString(16).toUpperCase()}</code></div>`).join('')||'<div style="margin-top:6px;color:var(--text3);font-size:12px">Sin resultados</div>'}</div>`).join('')}</div></div>`;
    },
    async simularRedOEM(marca) {
      if(!marca) return UI.toast('Selecciona una marca para el simulador','warn');
      this._oemTopologia=Motor.simularTopologia(marca);
      await DB.registrarEjecucionOEM({operacion:`mapa_redes_simulado_${marca}`,estado:'exitosa',evidencia:this._oemTopologia}).catch(()=>{});
      this.modalOEM();
    },
    async explorarRedesOEM() {
      if(!this._listo) return UI.toast('Conecta y prepara primero un adaptador; también puedes usar Simular Ford/GM','warn');
      UI.toast('Explorando HS-CAN sin ejecutar actuadores…','info');
      try {
        const mods=await this._escanearModulos(null,null);
        const hs=(mods||[]).map(m=>({req:Number(m.req??m.ecu),resp:Number(m.resp),nombre:m.nombre||'ECU desconocida',protocolo:m.servicio||m.protocolo}));
        this._oemTopologia=Motor.construirTopologia([{id:'hs',estado:'escaneada',modulos:hs}],{modo:'real',adaptador:this._oemAdaptador?.modelo||this._via});
        await DB.registrarEjecucionOEM({operacion:'mapa_redes_lectura',estado:'exitosa',diagnostico_id:this._scan?.id||null,vehiculo_id:this._scan?.vehiculo_id||null,evidencia:this._oemTopologia});
        this.modalOEM();
      } catch(e) {
        await DB.registrarEjecucionOEM({operacion:'mapa_redes_lectura',estado:'fallida',error:e.message}).catch(()=>{});
        UI.toast('No se pudo completar el mapa: '+e.message,'error');
      }
    },
    verOEM(id) { const d=this._oemDefs.find(x=>x.id===id); if(!d)return; const p=Motor.puedeEjecutar(d); UI.modal(d.nombre,`<div class="card" style="padding:12px"><b>${UI.esc(d.marca)} ${UI.esc(d.modelo||'')} · ${UI.esc(d.ecu)}</b><p>Fuente: ${UI.esc(d.fuente)} · estado: ${UI.esc(d.estado)} · riesgo: ${UI.esc(d.riesgo)}</p></div><pre style="white-space:pre-wrap">${UI.esc(JSON.stringify(d.definicion||{},null,2))}</pre><div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button><button class="btn btn-${p.ok?'cyan':'ghost'}" ${p.ok?'':'disabled'} title="${UI.esc(p.motivo||'Lectura verificada')}" onclick="Modulos.diagnostico_obd.ejecutarOEM('${d.id}')">▶ Ejecutar lectura</button></div>`,'720px'); },
    async ejecutarOEM(id) {
      const d=this._oemDefs.find(x=>x.id===id); if(!d)return;
      const permiso=Motor.puedeEjecutar(d); if(!permiso.ok)return UI.toast(permiso.motivo,'error');
      if (!this._listo) return UI.toast('El vehículo y el adaptador deben seguir conectados','error');
      const cfg=d.definicion||{}, req=Number(cfg.request_id), resp=Number(cfg.response_id);
      if (!Number.isInteger(req)||!Number.isInteger(resp)) return UI.toast('La definición verificada no incluye request_id y response_id numéricos','error');
      const did=parseInt(d.identificador,16), base={definicion_id:d.id,diagnostico_id:this._scan?.id||null,vehiculo_id:this._scan?.vehiculo_id||null,operacion:`UDS 22 ${d.identificador}`,solicitud_hex:`22 ${d.identificador.slice(0,2)} ${d.identificador.slice(2)}`};
      try {
        const bytes=await this._leerDID(req,resp,did);
        if(!bytes) { await DB.registrarEjecucionOEM({...base,estado:'rechazada',error:'Sin respuesta positiva 0x62'}); return UI.toast('La ECU no entregó ese DID','warn'); }
        const valor=Motor.decodificar(bytes,cfg.decoder||{});
        await DB.registrarEjecucionOEM({...base,estado:'exitosa',respuesta_hex:hex(bytes),evidencia:{valor,unidad:cfg.decoder?.unidad||null}});
        UI.modal(d.nombre,`<div class="card" style="padding:18px"><div style="font-size:11px;color:var(--text3)">DID ${UI.esc(d.identificador)} · ${UI.esc(d.ecu)}</div><div style="font-size:28px;font-weight:700;margin-top:8px">${UI.esc(valor)} ${UI.esc(cfg.decoder?.unidad||'')}</div><div style="font-family:monospace;margin-top:10px">${UI.esc(hex(bytes))}</div></div>`,'560px');
      } catch(e) { await DB.registrarEjecucionOEM({...base,estado:'fallida',error:e.message}); UI.toast('Falló la lectura OEM: '+e.message,'error'); }
    },
    editarOEM(id) {
      const d=this._oemDefs.find(x=>x.id===id)||{};
      this._oemEditandoDef=d.definicion||{};
      const modelos=(Modulos.vehiculos?._modelosComunes?.[d.marca]||[]);
      const pares=[{req:0x7E0,resp:0x7E8,nombre:'Motor'},{req:0x7E1,resp:0x7E9,nombre:'Transmisión'},...((this._oemTopologia?.redes||[]).flatMap(r=>r.modulos||[]))]
        .filter((x,i,a)=>a.findIndex(y=>y.req===x.req&&y.resp===x.resp)===i);
      const parActual=Number.isInteger(Number(d.definicion?.request_id))?`${Number(d.definicion.request_id)}|${Number(d.definicion.response_id)}`:'';
      UI.modal(id?'Editar definición OEM':'Nueva definición OEM',`<div class="form-grid">
        <div><label class="form-label">Nombre de la función</label><input class="form-input" id="oem-nombre" value="${UI.esc(d.nombre||'')}"></div><div><label class="form-label">Marca</label><select class="form-select" id="oem-marca" onchange="Modulos.diagnostico_obd.actualizarModelosOEM()"><option value="">Seleccionar…</option>${MARCAS_OEM.map(x=>`<option ${d.marca===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div><label class="form-label">Modelo (opcional)</label><select class="form-select" id="oem-modelo"><option value="">Todos los modelos</option>${modelos.map(x=>`<option ${d.modelo===x?'selected':''}>${UI.esc(x)}</option>`).join('')}${d.modelo&&!modelos.includes(d.modelo)?`<option selected>${UI.esc(d.modelo)}</option>`:''}</select></div><div><label class="form-label">ECU</label><select class="form-select" id="oem-ecu"><option value="">Seleccionar…</option>${ECUS_OEM.map(x=>`<option ${d.ecu===x?'selected':''}>${x}</option>`).join('')}${d.ecu&&!ECUS_OEM.includes(d.ecu)?`<option selected>${UI.esc(d.ecu)}</option>`:''}</select></div>
        <div><label class="form-label">Tipo</label><select class="form-select" id="oem-tipo">${TIPOS.map(x=>`<option ${d.tipo===x?'selected':''} value="${x}">${x.replaceAll('_',' ')}</option>`).join('')}</select></div><div><label class="form-label">DID / identificador</label><select class="form-select" id="oem-idf"><option value="">No corresponde</option>${DIDS_BASE.map(x=>`<option value="${x.did}" ${d.identificador===x.did?'selected':''}>${x.did} · ${UI.esc(x.nombre)}</option>`).join('')}${d.identificador&&!DIDS_BASE.some(x=>x.did===d.identificador)?`<option selected value="${UI.esc(d.identificador)}">${UI.esc(d.identificador)} · definición existente</option>`:''}</select></div>
        <div><label class="form-label">Protocolo</label><select class="form-select" id="oem-protocolo">${PROTOCOLOS_OEM.map(x=>`<option ${d.protocolo===x?'selected':''} value="${x}">${x.toUpperCase().replaceAll('_',' / ')}</option>`).join('')}</select></div><div><label class="form-label">Red física</label><select class="form-select" id="oem-red">${CANALES.map(x=>`<option value="${x.id}" ${d.definicion?.red===x.id?'selected':''}>${x.nombre}</option>`).join('')}</select></div>
        <div style="grid-column:1/-1"><label class="form-label">Dirección ECU (solicitud → respuesta)</label><select class="form-select" id="oem-par"><option value="">Pendiente de descubrir en el vehículo</option>${pares.map(x=>{const val=`${x.req}|${x.resp}`;return `<option value="${val}" ${parActual===val?'selected':''}>${UI.esc(x.nombre)} · ${x.req.toString(16).toUpperCase()} → ${x.resp.toString(16).toUpperCase()}</option>`}).join('')}</select></div>
        <div><label class="form-label">Decodificación</label><select class="form-select" id="oem-decoder">${['ascii','numero','hex'].map(x=>`<option ${d.definicion?.decoder?.tipo===x?'selected':''}>${x}</option>`).join('')}</select></div><div><label class="form-label">Unidad</label><select class="form-select" id="oem-unidad">${['','texto','°C','rpm','km/h','V','A','kPa','bar','%','km','horas'].map(x=>`<option value="${x}" ${d.definicion?.decoder?.unidad===x?'selected':''}>${x||'Sin unidad'}</option>`).join('')}</select></div>
        <div><label class="form-label">Estado</label><select class="form-select" id="oem-estado">${['borrador','laboratorio','verificado','retirado'].map(x=>`<option ${d.estado===x?'selected':''}>${x}</option>`).join('')}</select></div><div><label class="form-label">Riesgo</label><select class="form-select" id="oem-riesgo">${['lectura','controlado','alto','critico'].map(x=>`<option ${d.riesgo===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div><label class="form-label">Tipo de fuente</label><select class="form-select" id="oem-fuente-tipo">${['Manual OEM','Boletín técnico OEM','Norma ISO / SAE','Captura de laboratorio validada','Proveedor autorizado'].map(x=>`<option ${String(d.fuente||'').startsWith(x)?'selected':''}>${x}</option>`).join('')}</select></div><div><label class="form-label">Referencia / documento</label><input class="form-input" id="oem-fuente" value="${UI.esc(String(d.fuente||'').replace(/^[^:]+:\s*/,''))}" placeholder="Número, edición, página o URL"></div></div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cancelar</button><button class="btn btn-brand" onclick="Modulos.diagnostico_obd.guardarOEM('${id||''}')">Guardar</button></div>`,'760px');
    },
    actualizarModelosOEM() {
      const marca=document.getElementById('oem-marca')?.value, sel=document.getElementById('oem-modelo'); if(!sel)return;
      const clave=marca==='Chevrolet / GM'?'Chevrolet':marca;
      const modelos=Modulos.vehiculos?._modelosComunes?.[clave]||[];
      sel.innerHTML='<option value="">Todos los modelos</option>'+modelos.map(x=>`<option>${UI.esc(x)}</option>`).join('');
    },
    async guardarOEM(id) {
      const v=x=>document.getElementById(x).value.trim(), par=v('oem-par').split('|').map(Number);
      const definicion={...(this._oemEditandoDef||{}),red:v('oem-red'),decoder:{...(this._oemEditandoDef?.decoder||{}),tipo:v('oem-decoder'),unidad:v('oem-unidad')||null}};
      if(par.length===2&&par.every(Number.isInteger)){definicion.request_id=par[0];definicion.response_id=par[1];}else{delete definicion.request_id;delete definicion.response_id;}
      const referencia=v('oem-fuente');
      const d={id:id||undefined,nombre:v('oem-nombre'),marca:v('oem-marca'),modelo:v('oem-modelo')||null,ecu:v('oem-ecu'),tipo:v('oem-tipo'),identificador:v('oem-idf')||null,estado:v('oem-estado'),riesgo:v('oem-riesgo'),fuente:referencia?`${v('oem-fuente-tipo')}: ${referencia}`:'',protocolo:v('oem-protocolo'),definicion,precondiciones:[],activa:true};
      const e=Motor.validar(d); if(e.length)return UI.toast(e.join('. '),'error'); const r=await DB.upsertDefinicionOEM(d); if(r.error)return UI.toast(r.error.message,'error'); UI.cerrarModal(); this.modalOEM();
    },
    eliminarOEM(id,nombre) { Modulos.eliminarRegistro('obd_oem_definiciones',id,nombre,()=>this.modalOEM()); }
  });
})();
