/* Mapas documentales de una unidad: separados de direcciones/comandos ejecutables.
   Las plantillas son hipótesis de equipamiento, nunca topologías OEM verificadas. */
(function () {
  'use strict';
  const M = globalThis.Modulos && Modulos.diagnostico_obd;
  if (!M) return;
  const C = {
    liviano: { nombre:'Vehículos livianos', marcas:['Toyota','Lexus','Nissan','Infiniti','Hyundai','Kia','Mitsubishi','Honda','Acura','Mazda','Subaru','Suzuki','Chevrolet','GMC','Ford','Lincoln','Volkswagen','Audi','SEAT','Skoda','BMW','MINI','Mercedes-Benz','Volvo','Peugeot','Citroën','Renault','Fiat','Jeep','Dodge','RAM','Land Rover','Porsche','BYD','Chery','Geely','Changan','Great Wall','Haval','MG','Tesla'],
      sistemas:['ecm','tcm','abs','srs','eps','bcm','ipc','hvac','gateway','immo','adas','tpms','awd','bms','inversor','carga'],
      acceso:'OBD de emisiones cuando está soportado. Acceso a ABS, SRS, carrocería y redes secundarias depende de la ECU, gateway, año y documentación OEM.' },
    pesado: { nombre:'Camiones y autobuses', marcas:['Freightliner','International','Kenworth','Peterbilt','Mack','Western Star','Volvo Trucks','Scania','MAN','DAF','Iveco','Mercedes-Benz','Hino','Isuzu','Fuso','UD Trucks','Foton','JAC','Sinotruk','Shacman','Dongfeng','FAW','Yutong','Cummins','Detroit Diesel','PACCAR','Allison'],
      sistemas:['ecm','tcm','abs','bcm','ipc','gateway','scr','dpf','suspension','retarder','pto','remolque'],
      acceso:'J1939: conservar dirección de origen, SPN, FMI y ocurrencias. J1708/J1587 requiere RP1210 compatible. Confirmar conector, velocidad de red y alimentación admitida por el adaptador.' },
    maquinaria: { nombre:'Maquinaria pesada y agrícola', marcas:['Caterpillar','Komatsu','John Deere','Case','New Holland','JCB','Volvo CE','Hitachi','Liebherr','Doosan','Develon','Hyundai Construction','SANY','XCMG','LiuGong','Bobcat','Kubota','Massey Ferguson','Valtra','Fendt','Deutz-Fahr'],
      sistemas:['ecm','tcm','ipc','gateway','scr','dpf','hidraulica','implementos','traccion','pto'],
      acceso:'El motor puede ofrecer J1939 mientras hidráulica e implementos usan diagnóstico propietario. Identificar serie de máquina y motor; OBD de emisiones no garantiza acceso a todos los controladores.' },
    moto: { nombre:'Motocicletas, scooters y motocarros', marcas:['Honda','Yamaha','Suzuki','Kawasaki','BMW Motorrad','Ducati','Aprilia','KTM','Husqvarna','Triumph','Harley-Davidson','Indian','Royal Enfield','Bajaj','TVS','Hero','Benelli','CFMoto','Kymco','SYM','Piaggio','Vespa','Italika','Zontes','Voge'],
      sistemas:['ecm','abs','ipc','immo','bcm','imu','suspension','bms','inversor'],
      acceso:'Euro 5 puede usar conector de 6 vías; versiones anteriores usan conectores y protocolos propios. Verificar modelo, mercado, año y cable. Un adaptador físico no convierte un protocolo propietario en OBD compatible.' }
  };
  const S = {
    ecm:['Motor / ECM','Combustible, sincronización, aire y sensores. Comparar datos reales con consigna y condiciones del DTC.'],
    tcm:['Transmisión / TCM','Confirmar nivel y especificación de fluido según OEM; comparar velocidades de entrada/salida y marcha solicitada.'],
    abs:['Frenos / ABS / EBS','Comparar velocidades de rueda, alimentación y arnés. Resolver fallas de frenado antes de una prueba de carretera.'],
    srs:['Airbag / SRS','Consultar procedimiento OEM. No medir resistencia ni aplicar alimentación a detonadores o pretensores.'],
    eps:['Dirección / EPS','Alimentación bajo carga, ángulo y par de dirección; calibrar solo con procedimiento aplicable.'],
    bcm:['Carrocería / BCM','Revisar fusibles, masas, entradas y salidas según circuito afectado.'],
    ipc:['Tablero / IPC','Comparar testigos con el módulo que origina la alarma; el tablero puede ser solo receptor.'],
    hvac:['Climatización / HVAC','Comparar temperaturas, presión y demanda; confirmar condiciones de habilitación.'],
    gateway:['Gateway / redes','Verificar alimentación y redes a ambos lados; un gateway puede bloquear el acceso sin que el módulo esté averiado.'],
    immo:['Inmovilizador','Comprobar llave reconocida, antena, tensión y autorización de arranque antes de reemplazar piezas.'],
    adas:['Asistencia / ADAS','Comprobar obstrucciones, montaje y calibración requerida por OEM.'],
    tpms:['Presión de neumáticos / TPMS','Medir presión física y verificar identificadores y recepción de sensores.'],
    awd:['Tracción / AWD','Comparar neumáticos, velocidades y mando del acoplamiento.'],
    bms:['Batería de tracción / BMS','Aislamiento y alta tensión solo con personal capacitado y procedimiento de desenergización OEM.'],
    inversor:['Inversor / tracción eléctrica','Revisar refrigeración y datos de habilitación; seguir procedimiento OEM de alta tensión.'],
    carga:['Carga eléctrica / OBC','Distinguir falla de suministro, comunicación de carga y cargador a bordo.'],
    scr:['Postratamiento / SCR / DEF','Verificar calidad de DEF, fugas, temperaturas y plausibilidad NOx antes de condenar catalizador.'],
    dpf:['Postratamiento / DPF','Revisar presión diferencial, tubos, temperaturas y carga calculada. No regenerar con fallas inhibidoras ni fuera del procedimiento OEM.'],
    suspension:['Suspensión electrónica','Revisar altura y alimentación; soportar mecánicamente el vehículo antes de intervenir.'],
    retarder:['Retardador','Comparar solicitud de frenado y temperaturas, revisar coordinación con EBS/transmisión.'],
    pto:['Toma de fuerza / PTO','Verificar interbloqueos y señal de habilitación. Asegurar implementos antes de intervenir.'],
    remolque:['Remolque / TEBS','Revisar suministro y conexión tractor-remolque según especificación; no asumir acceso desde el conector del tractor.'],
    hidraulica:['Control hidráulico','Descargar presión según fabricante; contrastar presión real, demanda y señal de sensores.'],
    implementos:['Implementos / controlador de trabajo','Identificar implemento y versión; revisar interbloqueos, alimentación y bus dedicado.'],
    traccion:['Traslación / giro','Asegurar máquina e implementos; comparar mando y realimentación sin personas en zona de movimiento.'],
    imu:['Unidad inercial / IMU','Comprobar montaje, inclinación y calibración OEM; puede compartir información con ABS y ECU.'],
    otro:['Otro módulo','Identificar referencia y manual del sistema antes de medir o sustituir.']
  };
  const FUENTES = [
    ['Cummins: aislamiento de fallas del enlace J1939','https://qsol.cummins.com/info/qsol/news/J1939_data_link_diagnostic_tool.html'],
    ['TEXA: cobertura de diagnóstico de motocicletas (referencia externa)','https://www.texa.com/solutions/bike/'],
    ['AiM: conexión de motocicletas Euro 5','https://support.aimshop.com/pdf/motorbikes/OBDII/Bike_euro5_std_eng_100.pdf'],
    ['CSS Electronics: J1939, DM1 y DTC','https://www.csselectronics.com/pages/j1939-73-dm1-diagnostic-message-dtc'],
    ['Bosch: ECU de motocicletas','https://www.bosch-mobility.com/en/solutions/control-units/engine-control-unit-for-small-bikes/']
  ];
  const esc = x => UI.esc(String(x == null ? '' : x));
  const call = 'Modulos.diagnostico_obd.';
  const editable = () => typeof puedeAccion !== 'function' || puedeAccion('diagnostico_obd','editar');
  const eliminable = () => editable() && (typeof puedeAccion !== 'function' || puedeAccion('diagnostico_obd','eliminar'));
  const uid = () => globalThis.crypto.randomUUID();
  Object.assign(M, {
    _catalogoTransporte:C, _sistemasTransporte:S,
    _categoriaTransporte(v) {
      const t = String(v.tipo || '').toLowerCase();
      if (/motocicleta|scooter|motojet|motocarro|tuk|cuatrimoto/.test(t)) return 'moto';
      if (/maquinaria|agr[ií]cola|tractor|excav|montacarga/.test(t)) return 'maquinaria';
      if (/pesado|cami[oó]n|bus|cabezal|tractocami/.test(t)) return 'pesado';
      return 'liviano';
    },
    _plantillaTransporte(categoria) {
      return C[categoria].sistemas.map(sistema => ({ id:uid(), sistema, nombre:S[sistema][0],
        red:'Por verificar', direccion:'', ubicacion:'', fuente:'', estado:'orientativo', nota:'' }));
    },
    async modalMotocicletas() {
      try { this._vehiculos = await DB.getVehiculos() || []; }
      catch (e) { return UI.toast('No se pudieron cargar las motocicletas: '+e.message,'error'); }
      const motos = this._vehiculos.filter(v => this._categoriaTransporte(v) === 'moto');
      this._motosSeleccion = motos;
      UI.modal('🏍 Motocicletas', `<p>${esc(C.moto.acceso)}</p>
        <p>Lectura inicial de emisiones con ELM compatible. ABS, IMU e inmovilizador requieren acceso OEM documentado. No se envían comandos propietarios desde este asistente.</p>
        <label class="form-label" for="moto-unidad">Motocicleta registrada</label>
        <select id="moto-unidad" class="form-select"><option value="">Seleccionar…</option>${motos.map((v,i)=>`<option value="${i}">${esc([v.placa,v.marca,v.modelo,v.anio].filter(Boolean).join(' · '))}</option>`).join('')}</select>
        ${!motos.length ? '<p>Registra la unidad en Vehículos con tipo Motocicleta, Scooter / Motojet o Motocarro / Tuk-tuk.</p>' : ''}
        <label style="display:block;margin:16px 0"><input id="moto-compatible" type="checkbox"> Verifiqué en la documentación del modelo el protocolo OBD, cableado y tensión compatibles con mi adaptador.</label>
        <div class="modal-footer"><button class="btn" onclick="${call}modalMapaTransporte()">🗺 Mapas y marcas</button><button class="btn btn-primary" onclick="${call}iniciarMoto()">📡 Conectar y escanear motocicleta</button></div>`, '720px');
    },
    iniciarMoto() {
      const i = document.getElementById('moto-unidad').value;
      const v = i === '' ? null : this._motosSeleccion[Number(i)];
      if (!v) return UI.toast('Selecciona una motocicleta registrada.','warn');
      if (!document.getElementById('moto-compatible').checked) return UI.toast('Verifica la compatibilidad del modelo y adaptador antes de conectar.','warn');
      return this.modalEscanear(v.id, 'moto');
    },
    async modalMapaTransporte(vehId) {
      const solicitud = this._solicitudMapa = (this._solicitudMapa || 0) + 1;
      try {
        const vehiculos = await DB.getVehiculos() || [];
        const v = vehiculos.find(x=>x.id===vehId);
        const mapa = v ? await DB.getTopologiaVehiculo(v.id) : null;
        const scans = v ? await DB.getDiagnosticosPorVehiculo(v.id) : [];
        if (solicitud !== this._solicitudMapa) return;
        this._vehiculos = vehiculos;
        this._mapaVehiculo = v || null;
        this._mapaScan = v && this._scan?.vehiculo_id===v.id ? this._scan : (scans || [])[0];
        this._mapaTransporte = v ? (mapa || {
          vehiculo_id:v.id, categoria:this._categoriaTransporte(v), nodos:[], conexiones:[], revision:0 }) : null;
        this._pintarMapaTransporte();
      } catch(e) { if (solicitud===this._solicitudMapa) UI.toast('No se pudo abrir el mapa: '+e.message,'error'); }
    },
    _pintarMapaTransporte() {
      const m = this._mapaTransporte, v = this._mapaVehiculo;
      const categoria = m ? m.categoria : 'liviano';
      const acciones = (tipo,i) => Modulos.btnAccion('ver',`${call}formElementoMapa('${tipo}',${i},true)`)
        + (editable() ? Modulos.btnAccion('editar',`${call}formElementoMapa('${tipo}',${i})`)
        + (eliminable() ? Modulos.btnAccion('eliminar',`${call}quitarElementoMapa('${tipo}',${i})`) : '') : '');
      UI.modal('🗺 Mapa de módulos y conexiones', `
        <label class="form-label" for="mapa-unidad">Unidad del taller</label>
        <select class="form-select" id="mapa-unidad" onchange="${call}modalMapaTransporte(this.value)"><option value="">Seleccionar vehículo…</option>${this._vehiculos.map(x=>`<option value="${esc(x.id)}" ${v&&v.id===x.id?'selected':''}>${esc([x.placa,x.marca,x.modelo,x.anio].filter(Boolean).join(' · '))}</option>`).join('')}</select>
        <p>El mapa pertenece a esta unidad. Una respuesta de diagnóstico no demuestra la conexión física entre módulos. Documenta cables y pines con el esquema del modelo/año/VIN.</p>
        ${m ? `<label class="form-label" for="mapa-categoria">Familia técnica</label><select class="form-select" id="mapa-categoria" ${editable()?'':'disabled'} onchange="${call}cambiarCategoriaMapa(this.value)">${Object.entries(C).map(([k,c])=>`<option value="${k}" ${k===categoria?'selected':''}>${c.nombre}</option>`).join('')}</select>
          <p>${esc(C[categoria].acceso)}</p>
          <p><b>${m.nodos.length} módulos · ${m.conexiones.length} conexiones</b> · ${m.id?'Guardado · revisión '+m.revision:'Sin mapa guardado'}</p>
          ${editable()?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"><button class="btn" onclick="${call}agregarPlantillaMapa()">＋ Sistemas orientativos</button><button class="btn" onclick="${call}importarScanMapa()">＋ Módulos del escaneo</button><button class="btn" onclick="${call}formElementoMapa('nodos')">＋ Módulo</button><button class="btn" onclick="${call}formElementoMapa('conexiones')">＋ Conexión</button>${m.id?Modulos.btnAccion('eliminar',`${call}eliminarMapaTransporte()`):''}</div>`:''}
          ${this._diagramaTransporte(m)}
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px">${m.nodos.map((n,i)=>`<div class="card" style="padding:12px;border-left:4px solid ${n.estado==='documentado'?'var(--cyan)':'var(--amber)'}"><b>${esc(n.nombre)}</b><div>${esc(n.red)} · ${esc(n.estado)}</div><div>${esc(n.direccion || 'Dirección sin documentar')}</div><div>${esc(n.ubicacion || 'Ubicación por verificar')}</div><div style="display:flex;gap:4px;margin-top:8px">${acciones('nodos',i)}</div></div>`).join('')}</div>
          <h3>Conexiones documentadas y pendientes</h3>${!m.conexiones.length?'<p>No hay conexiones registradas. No se deducen del orden de respuesta de las ECU.</p>':m.conexiones.map((e,i)=>`<div class="card" style="padding:12px;margin:8px 0"><b>${esc(m.nodos.find(n=>n.id===e.desde)?.nombre)} ↔ ${esc(m.nodos.find(n=>n.id===e.hasta)?.nombre)}</b><div>${esc(e.red)} · ${esc(e.estado)} · ${esc(e.pines)}</div>${acciones('conexiones',i)}</div>`).join('')}
          <h3>Ruta de diagnóstico</h3>${this._dtcsMapaHTML()}<label class="form-label" for="mapa-sintoma">DTC, SPN/FMI o síntoma</label><input class="form-input" id="mapa-sintoma" maxlength="160" placeholder="U0100, SPN 5246 FMI 0, no arranca…"><label class="form-label" for="mapa-sistema">Sistema afectado</label><select id="mapa-sistema" class="form-select">${Object.entries(S).map(([k,s])=>`<option value="${k}">${esc(s[0])}</option>`).join('')}</select><button class="btn" style="margin-top:8px" onclick="${call}mostrarRutaTransporte()">🔧 Ver comprobaciones</button><div id="mapa-ruta"></div>`:''}
        <details style="margin-top:16px"><summary>Marcas de referencia y alcance</summary><p>Catálogo de planificación. No certifica compatibilidad de escaneo ni contiene pinouts OEM por modelo. Las plantillas se organizan por familia; confirmar equipamiento de cada unidad.</p>${Object.values(C).map(c=>`<p><b>${c.nombre}</b><br>${esc(c.marcas.join(' · '))}</p>`).join('')}</details>
        <details><summary>Fuentes técnicas públicas</summary><ul>${FUENTES.map(([n,u])=>`<li><a href="${u}" target="_blank" rel="noopener noreferrer">${esc(n)}</a></li>`).join('')}</ul><p>Referencias de protocolos; las comprobaciones son orientación de taller. Valores, pinouts y procedimientos concretos requieren manual OEM aplicable.</p></details>`, '1000px');
    },
    async _persistirMapa(cambio) {
      if (!editable() || this._guardandoMapa || !this._mapaTransporte) return false;
      const solicitud = this._solicitudMapa;
      this._guardandoMapa = true;
      try {
        const nuevo = JSON.parse(JSON.stringify(this._mapaTransporte));
        cambio(nuevo);
        this._validarMapaTransporte(nuevo);
        const guardado = await DB.guardarTopologiaVehiculo(nuevo);
        if (solicitud===this._solicitudMapa && this._mapaTransporte?.vehiculo_id===nuevo.vehiculo_id) {
          this._mapaTransporte = guardado;
          this._pintarMapaTransporte();
        }
        return true;
      } catch(e) { UI.toast('No se guardó: '+e.message,'error'); return false; }
      finally { this._guardandoMapa = false; }
    },
    _validarMapaTransporte(m) {
      if (!C[m.categoria]) throw new Error('Familia técnica inválida.');
      if (m.nodos.length>100 || m.conexiones.length>200) throw new Error('Límite: 100 módulos y 200 conexiones por unidad.');
      const ids = new Set(m.nodos.map(n=>n.id));
      if (ids.size!==m.nodos.length) throw new Error('Módulos duplicados.');
      for (const n of m.nodos) {
        if (!String(n.nombre||'').trim()) throw new Error('El módulo necesita nombre.');
        if (n.estado==='documentado' && !String(n.fuente||'').trim()) throw new Error('Indica la fuente del módulo documentado.');
      }
      const pares = new Set();
      for (const e of m.conexiones) {
        if (!ids.has(e.desde)||!ids.has(e.hasta)||e.desde===e.hasta) throw new Error('Selecciona dos módulos diferentes del mapa.');
        if (e.estado==='documentado' && !String(e.fuente||'').trim()) throw new Error('Indica esquema/página de la conexión documentada.');
        const par = [e.desde,e.hasta].sort().join('|')+'|'+e.red+'|'+e.pines;
        if (pares.has(par)) throw new Error('La conexión ya existe.');
        pares.add(par);
      }
    },
    cambiarCategoriaMapa(c) { return this._persistirMapa(m=>{ m.categoria=c; }); },
    _diagramaTransporte(m) {
      if (!m.conexiones.length) return '';
      // Una fila por enlace conserva la legibilidad en teléfono y no inventa un bus común.
      return `<div style="overflow-x:auto;margin:12px 0" aria-label="Diagrama de conexiones"><svg role="img" aria-label="Enlaces registrados; línea discontinua significa por verificar" viewBox="0 0 720 ${m.conexiones.length*80}" style="min-width:560px;width:100%;color:var(--text)">${m.conexiones.map((e,i)=>{
        const y=i*80+35;
        return `<line x1="230" y1="${y}" x2="490" y2="${y}" stroke="var(--cyan)" stroke-width="2" ${e.estado==='documentado'?'':'stroke-dasharray="7 5"'}/><text x="360" y="${y-9}" text-anchor="middle" fill="currentColor" font-size="12">${esc(e.red).slice(0,80)}</text>${[e.desde,e.hasta].map((id,j)=>`<rect x="${j?490:0}" y="${y-20}" width="230" height="40" rx="8" fill="var(--surface2)" stroke="var(--border)"/><text x="${j?605:115}" y="${y+4}" text-anchor="middle" fill="currentColor" font-size="12">${esc((m.nodos.find(n=>n.id===id)?.nombre||'Módulo').slice(0,30))}</text>`).join('')}`;
      }).join('')}</svg><p>Línea continua: documentada con fuente. Discontinua: pendiente de verificar. Los enlaces son los registrados por el taller.</p></div>`;
    },
    _dtcsMapaHTML() {
      const s=this._mapaScan;
      if (!s) return '<p>Sin escaneo reciente disponible. Puedes orientar el diagnóstico por síntoma.</p>';
      const codigo = c => typeof c==='string'?c:c.codigo || (c.spn!=null?`SPN ${c.spn} FMI ${c.fmi}`:'');
      this._dtcsMapa = [
        ...(s.dtcs||[]).map(c=>({codigo:codigo(c),origen:'Emisiones · registrado'})),
        ...(s.dtcs_pendientes||[]).map(c=>({codigo:codigo(c),origen:'Emisiones · pendiente'})),
        ...(s.por_modulo||[]).flatMap(n=>(n.codigos||[]).map(c=>({codigo:codigo(c),origen:(n.nombre||'ECU '+n.ecu)+' · '+(c.activo?'activo':'guardado')})))
      ].filter(c=>c.codigo);
      return `<p>Escaneo: ${esc(s.created_at || 'en curso')}. Los estados corresponden a esa lectura.</p><label class="form-label" for="mapa-dtc">Tomar código del escaneo</label><select class="form-select" id="mapa-dtc" onchange="${call}elegirDTCMapa(this.value)"><option value="">Seleccionar código…</option>${this._dtcsMapa.map((c,i)=>`<option value="${i}">${esc(c.codigo)} · ${esc(c.origen)}</option>`).join('')}</select>`;
    },
    elegirDTCMapa(i) {
      const c=i===''?null:this._dtcsMapa[Number(i)];
      if(c) document.getElementById('mapa-sintoma').value=c.codigo;
    },
    agregarPlantillaMapa() {
      return this._persistirMapa(m=>{
        const existentes = new Set(m.nodos.map(n=>n.sistema));
        m.nodos.push(...this._plantillaTransporte(m.categoria).filter(n=>!existentes.has(n.sistema)));
      });
    },
    async importarScanMapa() {
      if (!this._mapaTransporte || !editable()) return;
      const id = this._mapaTransporte.vehiculo_id;
      let s = this._scan?.vehiculo_id===id ? this._scan : null;
      if (!s) {
        try { s = (await DB.getDiagnosticosPorVehiculo(id) || []).find(x=>x.por_modulo?.length); }
        catch(e) { return UI.toast('No se pudo leer el historial: '+e.message,'error'); }
      }
      if (!s?.por_modulo?.length) return UI.toast('Esta unidad no tiene un escaneo con módulos.','warn');
      if (this._mapaTransporte?.vehiculo_id!==id) return;
      return this._persistirMapa(m=>{
        for (const n of s.por_modulo) {
          if (n.respondio===false || !Number.isInteger(n.ecu)) continue;
          const direccion = '0x'+n.ecu.toString(16).toUpperCase()+(n.ext?' (29 bits)':'');
          if (m.nodos.some(x=>x.direccion===direccion)) continue;
          m.nodos.push({id:uid(),nombre:n.nombre||'Módulo '+direccion,sistema:'otro',direccion,
            red:'Por verificar',ubicacion:'',estado:'detectado',fuente:'Escaneo '+(s.created_at||'actual'),
            nota:'Respuesta observada. Nombre y red física deben verificarse. No implica ausencia actual de DTC.'});
        }
      });
    },
    formElementoMapa(tipo,i,soloLectura=false) {
      if (!this._mapaTransporte || !['nodos','conexiones'].includes(tipo)) return;
      if (!soloLectura && !editable()) return;
      const m = this._mapaTransporte, n = m[tipo][i] || {};
      this._elementoMapa = {tipo,i};
      const campo = (k,t,max=200) => `<label class="form-label" for="me-${k}">${t}</label><input class="form-input" id="me-${k}" maxlength="${max}" value="${esc(n[k]||'')}" ${soloLectura?'disabled':''}>`;
      const select = (k,t,op) => `<label class="form-label" for="me-${k}">${t}</label><select class="form-select" id="me-${k}" ${soloLectura?'disabled':''}>${op.map(([key,label])=>`<option value="${esc(key)}" ${n[k]===key?'selected':''}>${esc(label)}</option>`).join('')}</select>`;
      const opcionesNodos = m.nodos.map(x=>[x.id,x.nombre]);
      const camposEspecificos = tipo==='nodos'
        ? campo('nombre','Nombre',100)+select('sistema','Sistema',Object.entries(S).map(([k,s])=>[k,s[0]]))+campo('direccion','Dirección observada (no se utiliza para transmitir)',80)+campo('ubicacion','Ubicación física',200)
        : select('desde','Desde',opcionesNodos)+select('hasta','Hasta',opcionesNodos)+campo('pines','Conectores / pines / tramo según esquema',200);
      UI.modal((soloLectura?'Ver':n.id?'Editar':'Crear')+(tipo==='nodos'?' módulo':' conexión'), `
        ${camposEspecificos}
        ${campo('red','Red o circuito: CAN, J1939, K-line, alimentación, masa…',80)}
        ${select('estado','Evidencia',[['orientativo','Orientativo / por verificar'],['detectado','Observado en escaneo'],['documentado','Documentado con fuente']])}
        ${campo('fuente','Fuente: manual / versión / página / prueba realizada',400)}
        ${campo('nota','Notas / mediciones / condiciones',1000)}
        ${tipo==='nodos'?`<p>${esc((S[n.sistema]||S.otro)[1])}</p>`:''}
        <div class="modal-footer"><button class="btn" onclick="${call}_pintarMapaTransporte()">Volver al mapa</button>${!soloLectura?`<button class="btn btn-primary" onclick="${call}guardarElementoMapa()">Guardar</button>`:''}</div>`, '720px');
    },
    guardarElementoMapa() {
      const {tipo,i} = this._elementoMapa;
      const campos = tipo==='nodos'?['nombre','sistema','direccion','ubicacion']:['desde','hasta','pines'];
      const n = {id:this._mapaTransporte[tipo][i]?.id || uid()};
      for (const k of [...campos,'red','estado','fuente','nota']) n[k]=document.getElementById('me-'+k).value.trim();
      return this._persistirMapa(m=>{ if(i==null) m[tipo].push(n); else m[tipo][i]=n; });
    },
    async quitarElementoMapa(tipo,i) {
      if (!eliminable() || !this._mapaTransporte?.[tipo]?.[i]) return;
      const anterior=this._mapaTransporte;
      if (!await UI.confirmar(tipo==='nodos'?'¿Eliminar el módulo y sus conexiones del mapa?':'¿Eliminar esta conexión del mapa?','Eliminar')) return;
      if (this._mapaTransporte!==anterior) return;
      return this._persistirMapa(m=>{
        const [n] = m[tipo].splice(i,1);
        if(tipo==='nodos') m.conexiones=m.conexiones.filter(e=>e.desde!==n.id && e.hasta!==n.id);
      });
    },
    async eliminarMapaTransporte() {
      if (!eliminable() || this._guardandoMapa || !this._mapaTransporte?.id) return;
      const anterior=this._mapaTransporte;
      if (!await UI.confirmar('¿Eliminar el mapa completo de esta unidad? Los escaneos se conservan.','Eliminar mapa')) return;
      if (this._mapaTransporte!==anterior) return;
      this._guardandoMapa=true;
      try { await DB.eliminarTopologiaVehiculo(anterior); if(this._mapaTransporte===anterior) await this.modalMapaTransporte(anterior.vehiculo_id); }
      catch(e) { UI.toast('No se eliminó: '+e.message,'error'); }
      finally { this._guardandoMapa=false; }
    },
    _rutaTransporte(texto,sistema) {
      const t=String(texto||'').toUpperCase();
      const pasos = ['Registrar VIN/serie, motor, condiciones del síntoma, DTC y estado activo/guardado; conservar freeze-frame antes de borrar.',
        'Comprobar batería, fusibles y caída de tensión de alimentaciones/masas bajo las condiciones de falla, usando especificaciones del fabricante.'];
      if (/^U[0-9A-F]{4}\b|COMUNIC|SIN RESPUESTA|NO COMUNICA/.test(t)) pasos.push('Separar módulos que responden de los que no. Buscar alimentación, masa o ramal compartido en las conexiones documentadas. Falta de respuesta también puede indicar protocolo no soportado o gateway bloqueado.',
        'Con esquema OEM: revisar conectores, continuidad y cortos del tramo afectado. Medir resistencia solo con circuito desenergizado según OEM; el valor depende de topología y terminadores.');
      if (/SPN|FMI/.test(t)) pasos.push('Anotar SPN + FMI + dirección de origen y contador. Consultar definición del fabricante/motor. El FMI describe el modo de falla; un SPN solo no identifica la reparación.');
      if (/NO ARRANCA|NO ENCIENDE/.test(t)) pasos.push('Distinguir no gira / gira sin arrancar. Revisar autorización de arranque, interbloqueos, RPM al dar arranque, sincronización y presión de combustible según OEM.');
      pasos.push((S[sistema]||S.otro)[1],
        'Confrontar consigna, señal y medición física. Si una comprobación falla, reparar ese circuito y repetirla; si pasa, avanzar al siguiente componente según manual. Un DTC no demuestra por sí solo una pieza averiada.',
        'Tras reparar: verificar la condición original, volver a leer todos los módulos accesibles y documentar resultados. Borrar códigos solo después de conservar evidencia y comprobar la reparación.');
      return pasos;
    },
    mostrarRutaTransporte() {
      const t=document.getElementById('mapa-sintoma').value.trim();
      const sistema=document.getElementById('mapa-sistema').value;
      if(!t) return UI.toast('Escribe un DTC o síntoma.','warn');
      const m=this._mapaTransporte;
      const ids=new Set(m.nodos.filter(n=>n.sistema===sistema).map(n=>n.id));
      const conexiones=m.conexiones.filter(e=>ids.has(e.desde)||ids.has(e.hasta));
      document.getElementById('mapa-ruta').innerHTML=`<h4>${esc(t)} · ${esc(S[sistema][0])}</h4><p>Ruta orientativa; confirmar procedimiento y valores OEM de esta unidad.</p><ol>${this._rutaTransporte(t,sistema).map(p=>`<li style="margin:10px 0">${esc(p)}</li>`).join('')}</ol><b>Tramos del mapa relacionados</b>${conexiones.length?conexiones.map(e=>`<p>${esc(m.nodos.find(n=>n.id===e.desde).nombre)} ↔ ${esc(m.nodos.find(n=>n.id===e.hasta).nombre)}: ${esc(e.red)} · ${esc(e.pines)} · ${esc(e.estado)} · ${esc(e.fuente)}</p>`).join(''):'<p>Sin conexiones registradas para este sistema. Consultar esquema OEM y documentarlas.</p>'}`;
    }
  });
})();
