/* NexusPro — capa OEM segura. Una definición no verificada nunca transmite. */
(function () {
  'use strict';
  const TIPOS = ['did','reset','immo_diagnostico','immo_programacion','prueba_activa','calibracion','regeneracion_dpf','purga_abs','codificacion','reflash','security_access','procedimiento'];
  const CANALES = [
    {id:'hs',nombre:'HS-CAN',estado:'operativo',nota:'CAN principal por comandos estándar ELM/ISO 15765'},
    {id:'ms',nombre:'MS-CAN',estado:'validar',nota:'Capacidad del vLinker MS; comando de selección pendiente de prueba física'},
    {id:'sw',nombre:'SW-CAN / GMLAN',estado:'validar',nota:'Capacidad del vLinker MS; no transmitir sin comando oficial validado'},
    {id:'ch',nombre:'CH-CAN',estado:'validar',nota:'Capacidad declarada; selección pendiente de validar'},
    {id:'ls',nombre:'LS-CAN',estado:'validar',nota:'Capacidad declarada; selección pendiente de validar'}
  ];
  /* 'disponible' = el software puede hablar HOY por esa via. Sin este dato, el
     plan de validacion recomendaba interfaces que la app no implementa: el
     2026-08-26 mandaba a conectar un Nissan Juke por "Thinkcar / J2534" y se
     perdio una tarde entera intentandolo. Un VCI de protocolo cerrado no se
     vuelve compatible por listarlo en una tabla. */
  const FAMILIAS = [
    {id:'elm',nombre:'ELM/ST por BLE',transportes:['ble'],protocolos:['obd2','uds','kwp2000','j1939'],disponible:true,nota:'Vgate, OBDLink, ELM327 y compatibles'},
    {id:'rp1210',nombre:'RP1210',transportes:['usb'],protocolos:['j1939','j1708','j1587','can','iso15765'],disponible:true,nota:'NEXIQ, DPA, Dearborn y cualquier DLL registrada. Necesita el puente local (puente-obd) corriendo en la PC'},
    {id:'j2534',nombre:'J2534 Pass-Thru',transportes:['usb'],protocolos:['can','iso15765','iso9141','iso14230'],disponible:false,nota:'Capa prevista; requiere proveedor J2534 instalado. AUN NO IMPLEMENTADA'},
    {id:'fabricante',nombre:'SDK de fabricante',transportes:['ble','classic','wifi','usb'],protocolos:[],disponible:false,nota:'Thinkcar y otros VCI cerrados: se integra cuando el fabricante entrega SDK/API autorizada. AUN NO IMPLEMENTADA'},
    {id:'vci',nombre:'VCI futuro',transportes:['usb','ble','wifi'],protocolos:[],disponible:false,nota:'Contrato abierto para interfaces OEM o multimarca. AUN NO IMPLEMENTADA'}
  ];
  const familiaPorId = id => FAMILIAS.find(f => f.id === id) || null;
  const interfazUsable = id => !!(familiaPorId(id) || {}).disponible;
  const DIDS_BASE = [
    {did:'F190',nombre:'VIN',decoder:{tipo:'ascii'},fuente:'ISO 14229-1, ReadDataByIdentifier'},
    {did:'F187',nombre:'Número de pieza de repuesto de la ECU',decoder:{tipo:'ascii'},fuente:'ISO 14229-1, identificadores de datos de vehículo'},
    {did:'F189',nombre:'Versión de software de la ECU',decoder:{tipo:'ascii'},fuente:'ISO 14229-1, identificadores de datos de vehículo'},
    {did:'F18C',nombre:'Número de serie de la ECU',decoder:{tipo:'ascii'},fuente:'ISO 14229-1, identificadores de datos de vehículo'}
  ];
  const MARCAS_OEM = ['Toyota','Nissan','Hyundai','Kia','Mitsubishi','Honda','Mazda','Isuzu','Suzuki','Chevrolet / GM','Ford','Volkswagen','Mercedes-Benz','Hino','Fuso','JAC','Foton','International','Otro'];
  const ECUS_OEM = ['ECM / PCM (motor)','TCM (transmisión)','ABS / EBCM (frenos)','BCM (carrocería)','SRS / ACM (airbag)','EPS / PSCM (dirección)','IPC (tablero)','HVAC (climatización)','4WD / AWD','Inmovilizador','Gateway','ADAS','Otro'];
  const PROTOCOLOS_OEM = ['uds','kwp2000','obd2','j1939','j1708_j1587','iso9141','fabricante'];
  const OBJETIVOS_RESET = [
    {id:'dtc_modulo',nombre:'Borrar DTC del módulo',riesgo:'controlado'},
    {id:'ecu_reinicio',nombre:'Reiniciar ECU / módulo',riesgo:'alto'},
    {id:'abs_aprendizajes',nombre:'ABS: borrar aprendizajes',riesgo:'alto'},
    {id:'tpms_reaprendizaje',nombre:'TPMS: iniciar reaprendizaje',riesgo:'controlado'},
    {id:'sas_cero',nombre:'Dirección: punto cero / SAS',riesgo:'alto'},
    {id:'transmision_adaptativos',nombre:'Transmisión: borrar adaptativos',riesgo:'alto'},
    {id:'acelerador_aprendizaje',nombre:'Acelerador / ralentí: reaprendizaje',riesgo:'controlado'},
    {id:'mantenimiento',nombre:'Aceite / mantenimiento: restablecer',riesgo:'controlado'},
    {id:'bateria_registro',nombre:'Batería: registrar reemplazo / BMS',riesgo:'controlado'},
    {id:'dpf_aprendizajes',nombre:'DPF: restablecer valores aprendidos',riesgo:'alto'},
    {id:'otro',nombre:'Otro reset OEM verificado',riesgo:'alto'}
  ];
  const OBJETIVOS_IMMO = [
    {id:'identificacion',nombre:'Identificar IMMO / BCM / ECU',riesgo:'lectura'},
    {id:'dtc',nombre:'Leer DTC del inmovilizador',riesgo:'lectura'},
    {id:'estado_llave',nombre:'Estado de reconocimiento de llave',riesgo:'lectura'},
    {id:'cantidad_llaves',nombre:'Cantidad de llaves registradas',riesgo:'lectura'},
    {id:'antena',nombre:'Diagnóstico de antena transpondedor',riesgo:'lectura'},
    {id:'reaprendizaje_oem',nombre:'Reaprendizaje autorizado de llave',riesgo:'critico'},
    {id:'sincronizacion_oem',nombre:'Sincronización IMMO–ECU autorizada',riesgo:'critico'}
  ];
  const OBJETIVOS_ACTIVOS = [
    {id:'ventilador',nombre:'Ventilador / electroventilador',riesgo:'controlado',precondiciones:['contacto']},
    {id:'rele_combustible',nombre:'Relé / bomba de combustible',riesgo:'controlado',precondiciones:['contacto']},
    {id:'bocina',nombre:'Bocina / claxon',riesgo:'controlado',precondiciones:['contacto']},
    {id:'luces',nombre:'Luces exteriores',riesgo:'controlado',precondiciones:['contacto']},
    {id:'solenoide',nombre:'Solenoide de emisiones',riesgo:'controlado',precondiciones:['motor']},
    {id:'actuador_otro',nombre:'Otro actuador con procedimiento OEM',riesgo:'alto',precondiciones:['contacto','velocidad_max']}
  ];
  /* ═══════════ RECETAS DE RESET ═══════════
     Lo que hace falta para que un reset SE EJECUTE, no solo se describa.

     Dos —y solo dos— son normativas: estan en ISO 14229-1 con el MISMO codigo
     en cualquier marca, asi que se pueden ejecutar sin manual del fabricante y
     sin inventar nada. Todo lo demas (punto cero de la direccion, adaptativos
     de la caja, aprendizajes del ABS, DPF, registro de bateria) es una rutina
     propia de cada marca: se ejecuta UNICAMENTE si la definicion verificada
     trae el identificador de rutina que salio de un manual. Nunca se adivina un
     RID — un 31 01 con un identificador inventado no es un reset, es escribirle
     cualquier cosa a un modulo del vehiculo de un cliente. */
  const RECETAS_RESET = {
    dtc_modulo: {
      servicio:'ClearDiagnosticInformation',
      fuente:'ISO 14229-1, ClearDiagnosticInformation (14 FF FF FF)',
      efecto:'Borra la memoria de fallas de ESE módulo. No repara: si la falla sigue presente, el código vuelve.',
      pasos:[{tx:[0x14,0xFF,0xFF,0xFF],positiva:0x54,nombre:'Borrar la memoria de fallas del módulo'}]
    },
    ecu_reinicio: {
      servicio:'ECUReset hardReset',
      fuente:'ISO 14229-1, ECUReset subfunción 01 hardReset (11 01)',
      efecto:'El módulo arranca de nuevo y repite sus autodiagnósticos, como si se le cortara la alimentación un instante. NO borra códigos ni adaptaciones.',
      pasos:[{tx:[0x11,0x01],positiva:0x51,nombre:'Reiniciar el módulo'}]
    }
  };
  /* Precondiciones minimas cuando la definicion no trae las suyas. Son el piso,
     no el techo: una definicion puede exigir mas, nunca menos. */
  const PRECONDICIONES_RESET = {
    dtc_modulo:['contacto'],
    ecu_reinicio:['contacto',{clave:'velocidad_max',valor:0}]
  };
  const RESET_POR_RUTINA = {
    servicio:'RoutineControl startRoutine',
    fuente:'ISO 14229-1, RoutineControl startRoutine (31 01 + identificador de rutina del fabricante)'
  };

  /* ═══════════ PAQUETES POR VEHICULO ═══════════
     Un paquete es "todo lo que hace falta para trabajar ESTE vehiculo", cargado
     de una vez en vez de a mano definicion por definicion.

     La linea que no se cruza: `estado:'verificado'` solo lo lleva lo que se
     puede sostener con una norma publica. Para el Picanto eso son las dos
     direcciones LEGISLADAS de ISO 15765-4 —motor 0x7E0/0x7E8 y segunda ECU
     0x7E1/0x7E9, obligatorias en cualquier vehiculo OBD-II— con servicios de
     ISO 14229-1. Lo demas (ABS, airbag, carroceria, inmovilizador) queda en
     BORRADOR con la direccion vacia a proposito: se completa desde el mapa de
     acceso del propio vehiculo, que es un dato medido, no uno recordado. */
  const DIDS_IDENT_PACK = [
    {did:'F190',nombre:'VIN'}, {did:'F187',nombre:'Número de pieza de la ECU'},
    {did:'F189',nombre:'Versión de software de la ECU'}, {did:'F18C',nombre:'Número de serie de la ECU'}
  ];
  const NORMA_15765 = 'ISO 15765-4 (direcciones de diagnóstico legisladas 0x7E0-0x7E7 / 0x7E8-0x7EF)';
  function packLiviano(marca, modelo, nota) {
    const ecus = [
      {ecu:'ECM / PCM (motor)', req:0x7E0, resp:0x7E8, etiqueta:'Motor'},
      {ecu:'TCM (transmisión)', req:0x7E1, resp:0x7E9, etiqueta:'Transmisión'}
    ];
    const defs = [];
    for (const e of ecus) {
      const base = {marca, modelo, ecu:e.ecu, protocolo:'uds', activa:true, anio_desde:null, anio_hasta:null};
      /* Identificacion: lectura pura, servicio normalizado, direccion legislada.
         Se puede ejecutar el dia uno. */
      for (const x of DIDS_IDENT_PACK) defs.push(Object.assign({}, base, {
        nombre:`${x.nombre} · ${e.etiqueta}`, tipo:'did', identificador:x.did,
        estado:'verificado', riesgo:'lectura',
        fuente:`Norma ISO / SAE: ISO 14229-1 ReadDataByIdentifier ${x.did}; ${NORMA_15765}`,
        definicion:{red:'hs', request_id:e.req, response_id:e.resp, decoder:{tipo:'ascii'}, nota},
        precondiciones:['contacto']}));
      defs.push(Object.assign({}, base, {
        nombre:`Borrar códigos del módulo · ${e.etiqueta}`, tipo:'reset', identificador:'dtc_modulo',
        estado:'verificado', riesgo:'controlado',
        fuente:`Norma ISO / SAE: ${RECETAS_RESET.dtc_modulo.fuente}; ${NORMA_15765}`,
        definicion:{red:'hs', request_id:e.req, response_id:e.resp, objetivo_reset:'dtc_modulo', nota},
        precondiciones:['contacto']}));
      defs.push(Object.assign({}, base, {
        nombre:`Reiniciar el módulo · ${e.etiqueta}`, tipo:'reset', identificador:'ecu_reinicio',
        estado:'verificado', riesgo:'alto',
        fuente:`Norma ISO / SAE: ${RECETAS_RESET.ecu_reinicio.fuente}; ${NORMA_15765}`,
        definicion:{red:'hs', request_id:e.req, response_id:e.resp, objetivo_reset:'ecu_reinicio', nota},
        precondiciones:['contacto',{clave:'velocidad_max',valor:0}]}));
    }
    return defs;
  }
  /* Los modulos que NO tienen direccion legislada. Se dejan listos pero en
     borrador y SIN direccion: la direccion sale del mapa de acceso del propio
     vehiculo (boton "Completar direcciones"), que es la unica fuente honesta.
     Un 0x7B3 "de memoria" es exactamente lo que esta prohibido aqui. */
  function packPendientes(marca, modelo) {
    const pend = [
      {ecu:'ABS / EBCM (frenos)', etiqueta:'ABS'},
      {ecu:'SRS / ACM (airbag)', etiqueta:'Airbag'},
      {ecu:'BCM (carrocería)', etiqueta:'Carrocería'}
    ];
    const defs = pend.map(pp => ({marca, modelo, ecu:pp.ecu, protocolo:'uds', activa:true, anio_desde:null, anio_hasta:null,
      nombre:`Borrar códigos del módulo · ${pp.etiqueta}`, tipo:'reset', identificador:'dtc_modulo',
      estado:'borrador', riesgo:'controlado',
      fuente:`Norma ISO / SAE: ${RECETAS_RESET.dtc_modulo.fuente} — falta confirmar la dirección de este módulo en el vehículo`,
      definicion:{red:'hs', objetivo_reset:'dtc_modulo',
        nota_validacion:'Sin dirección: este módulo no está en el rango legislado de ISO 15765-4. Escaneá el vehículo y usá "Completar direcciones desde el mapa": la dirección sale del mapa de acceso del propio vehículo, que ya contestó desde ahí.'},
      precondiciones:['contacto']}));
    defs.push({marca, modelo, ecu:'Inmovilizador', protocolo:'uds', activa:true, anio_desde:null, anio_hasta:null,
      nombre:'Diagnóstico IMMO · identificación', tipo:'immo_diagnostico', identificador:'identificacion',
      estado:'borrador', riesgo:'lectura',
      fuente:'Referencia NexusPro: identificación del inmovilizador, sin extracción de secretos (pendiente validación física)',
      definicion:{red:'hs', objetivo_immo:'identificacion',
        nota_validacion:'Solo identificación y estado. No contiene llaves, PIN, clonación ni bypass.'},
      precondiciones:['contacto']});
    return defs;
  }
  /* Resets que el Picanto SI tiene pero que NO se pueden transmitir sin el
     identificador de rutina del manual. Se cargan como procedimiento —texto,
     cero transmision— para que el mecanico sepa que existen y que falta, en vez
     de que el boton simplemente no este y nadie sepa por que. */
  function packRutinasPendientes(marca, modelo) {
    return [
      {id:'sas_cero', ecu:'EPS / PSCM (dirección)', nombre:'Punto cero de la dirección (SAS)'},
      {id:'transmision_adaptativos', ecu:'TCM (transmisión)', nombre:'Borrar adaptativos de la transmisión'},
      {id:'acelerador_aprendizaje', ecu:'ECM / PCM (motor)', nombre:'Reaprendizaje de acelerador / ralentí'},
      {id:'mantenimiento', ecu:'IPC (tablero)', nombre:'Restablecer el aviso de mantenimiento'}
    ].map(x => ({marca, modelo, ecu:x.ecu, protocolo:'uds', activa:true, anio_desde:null, anio_hasta:null,
      nombre:`${x.nombre} · falta la rutina del fabricante`, tipo:'procedimiento', identificador:x.id,
      estado:'borrador', riesgo:'lectura',
      fuente:'Referencia NexusPro: no hay servicio normalizado para este reset; requiere el identificador de rutina del manual del fabricante',
      definicion:{red:'hs', objetivo_reset_previsto:x.id,
        nota_validacion:'NexusPro no transmite nada con esta definición. Para habilitarla: conseguir del manual el identificador de rutina (RoutineControl), cargarlo en definicion.rutina.rid, citar la fuente y pasarla a verificado.'},
      precondiciones:['contacto']}));
  }
  const PAQUETES_OEM = [
    {id:'kia_picanto', marca:'Kia', modelo:'Picanto', nombre:'Kia Picanto',
     nota:'Paquete Kia Picanto de NexusPro. Direcciones legisladas ISO 15765-4; requiere que el vehículo diagnostique en CAN de 11 bits (un Picanto pre-CAN no responde acá).',
     construir() { return [].concat(packLiviano(this.marca, this.modelo, this.nota),
                                    packPendientes(this.marca, this.modelo),
                                    packRutinasPendientes(this.marca, this.modelo)); }}
  ];

  const PLAN_VALIDACION = [
    {id:'mitsubishi',vehiculo:'Mitsubishi camioneta',familia:'liviano',protocolos:['uds','obd2'],interfaces:['elm','j2534','fabricante'],estado:'pendiente'},
    {id:'nissan_rogue',vehiculo:'Nissan Rogue',familia:'liviano',protocolos:['uds','obd2'],interfaces:['elm','j2534','fabricante'],estado:'pendiente'},
    {id:'nissan_juke',vehiculo:'Nissan Juke',familia:'liviano',protocolos:['uds','obd2'],interfaces:['elm','j2534','fabricante'],estado:'pendiente'},
    {id:'kia_picanto',vehiculo:'Kia Picanto',familia:'liviano',protocolos:['uds','obd2'],interfaces:['elm','j2534','fabricante'],estado:'pendiente'},
    {id:'isuzu_npr',vehiculo:'Isuzu NPR',familia:'camion_ligero',protocolos:['j1939','uds'],interfaces:['rp1210','elm'],estado:'pendiente'},
    {id:'foton_aumark',vehiculo:'Foton Aumark',familia:'camion',protocolos:['j1939','uds'],interfaces:['rp1210'],estado:'pendiente'},
    {id:'international_dt466',vehiculo:'International DT466',familia:'camion_pesado',protocolos:['j1939','j1708_j1587'],interfaces:['rp1210'],estado:'pendiente'}
  ];
  const REFERENCIAS_VEHICULOS = PLAN_VALIDACION.flatMap(p => {
    const partes=p.vehiculo.split(' '), marca=p.id.startsWith('nissan_')?'Nissan':p.id==='kia_picanto'?'Kia':p.id==='isuzu_npr'?'Isuzu':p.id==='foton_aumark'?'Foton':p.id==='international_dt466'?'International':p.id==='mitsubishi'?'Mitsubishi':partes[0];
    const modelo=p.id==='mitsubishi'?'Mitsubishi camioneta':p.vehiculo.replace(/^Nissan |^Kia |^Isuzu |^Foton |^International /,'');
    const protocolo=p.protocolos[0], defBase={red:null,nota_validacion:'Referencia inicial: confirmar dirección ECU, red y protocolo con el vehículo real.'};
    const identidad=DIDS_BASE.map(x=>({nombre:`${x.nombre} · referencia`,marca,modelo,ecu:'ECM / PCM (motor)',tipo:'did',identificador:x.did,estado:'borrador',riesgo:'lectura',fuente:`Referencia NexusPro: ${x.fuente} (pendiente validación física)`,protocolo,definicion:{...defBase,decoder:x.decoder},precondiciones:[],activa:true}));
    return [...identidad,
      {nombre:'Reset de mantenimiento · referencia',marca,modelo,ecu:'ECM / PCM (motor)',tipo:'reset',identificador:null,estado:'borrador',riesgo:'controlado',fuente:'Referencia NexusPro: procedimiento de mantenimiento del fabricante (pendiente validación física)',protocolo,definicion:{...defBase,objetivo_reset:'mantenimiento'},precondiciones:['contacto'],activa:true},
      {nombre:'Diagnóstico IMMO · referencia',marca,modelo,ecu:'Inmovilizador',tipo:'immo_diagnostico',identificador:null,estado:'borrador',riesgo:'lectura',fuente:'Referencia NexusPro: diagnóstico IMMO sin extracción de secretos (pendiente validación física)',protocolo,definicion:{...defBase,objetivo_immo:'identificacion'},precondiciones:['contacto'],activa:true}
    ];
  });
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
    canales: CANALES, familias:FAMILIAS, familiaPorId, interfazUsable, didsBase:DIDS_BASE,
    recetasReset:RECETAS_RESET, precondicionesReset:PRECONDICIONES_RESET, paquetes:PAQUETES_OEM, perfilesSimulados:PERFILES_SIMULADOS, planValidacion:PLAN_VALIDACION, referenciasVehiculos:REFERENCIAS_VEHICULOS, marcas:MARCAS_OEM, ecus:ECUS_OEM, protocolos:PROTOCOLOS_OEM, objetivosReset:OBJETIVOS_RESET, objetivosImmo:OBJETIVOS_IMMO, objetivosActivos:OBJETIVOS_ACTIVOS, propsBLE,
    construirTopologia(redes=[], meta={}) {
      const conocidas=new Set(CANALES.map(c=>c.id));
      const salida=CANALES.map(c=>({id:c.id,nombre:c.nombre,estado:'no_escaneada',modulos:[]}));
      for(const r of redes||[]) {
        if(!conocidas.has(r?.id)) continue;
        const destino=salida.find(x=>x.id===r.id);
        destino.estado=r.estado||'escaneada';
        const unicos=new Map();
        for(const m of r.modulos||[]) {
          const req=Number(m.req);
          /* La direccion de respuesta puede no saberse: un ELM327 contesta por
             el modulo pero NO dice desde que ID lo hace. Exigirla dejaba fuera
             a todos los modulos hallados por Bluetooth — el mapa salia vacio
             aunque el barrido hubiera encontrado ocho. Se guarda en null y la
             interfaz lo dice, en vez de inventar una direccion. */
          const resp=(m.resp===null||m.resp===undefined||m.resp==='')?null:Number(m.resp);
          if(!Number.isInteger(req)) continue;
          if(resp!==null&&!Number.isInteger(resp)) continue;
          unicos.set(`${req}:${resp===null?'?':resp}`,{req,resp,nombre:String(m.nombre||'ECU desconocida'),protocolo:m.protocolo||'UDS/ISO-TP',simulado:!!m.simulado});
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
    evaluarPrecondiciones(requisitos=[], estado={}) {
      const fallos=[];
      for(const r of requisitos||[]) {
        const clave=typeof r==='string'?r:r.clave, valor=typeof r==='object'?r.valor:true;
        if(clave==='contacto' && estado.contacto!==valor) fallos.push(`Contacto debe estar ${valor?'encendido':'apagado'}`);
        else if(clave==='motor' && estado.motor!==valor) fallos.push(`Motor debe estar ${valor?'encendido':'apagado'}`);
        else if(clave==='velocidad_max' && (!Number.isFinite(estado.velocidad)||estado.velocidad>Number(valor))) fallos.push(`Velocidad máxima ${valor} km/h no confirmada`);
        else if(clave==='voltaje_min' && (!Number.isFinite(estado.voltaje)||estado.voltaje<Number(valor))) fallos.push(`Voltaje mínimo ${valor} V no confirmado`);
        else if(clave==='voltaje_max' && (!Number.isFinite(estado.voltaje)||estado.voltaje>Number(valor))) fallos.push(`Voltaje máximo ${valor} V no confirmado`);
        else if(clave==='freno' && estado.freno!==valor) fallos.push(`Estado del freno no confirmado`);
        else if(!['contacto','motor','velocidad_max','voltaje_min','voltaje_max','freno'].includes(clave)) fallos.push(`Precondición desconocida: ${clave||'sin clave'}`);
      }
      return {ok:fallos.length===0,fallos};
    },
    validar(d) {
      const e=[];
      for (const k of ['nombre','marca','ecu','tipo','fuente']) if (!String(d?.[k]||'').trim()) e.push(`Falta ${k}`);
      if (!TIPOS.includes(d?.tipo)) e.push('Tipo no permitido');
      if (d?.tipo === 'did' && !/^[0-9A-Fa-f]{4}$/.test(String(d.identificador||''))) e.push('El DID debe tener 4 hexadecimales');
      if (d?.protocolo && !PROTOCOLOS_OEM.includes(d.protocolo)) e.push('Protocolo no permitido');
      if (d?.definicion?.red && !CANALES.some(c=>c.id===d.definicion.red)) e.push('Red no permitida');
      if (d?.tipo==='reset' && !OBJETIVOS_RESET.some(x=>x.id===d?.definicion?.objetivo_reset)) e.push('Selecciona un objetivo de reset permitido');
      if (String(d?.tipo||'').startsWith('immo_') && !OBJETIVOS_IMMO.some(x=>x.id===d?.definicion?.objetivo_immo)) e.push('Selecciona un objetivo de inmovilizador permitido');
      if (d?.tipo==='prueba_activa' && !OBJETIVOS_ACTIVOS.some(x=>x.id===d?.definicion?.objetivo_activo)) e.push('Selecciona un objetivo activo permitido');
      if (d?.anio_desde && d?.anio_hasta && Number(d.anio_desde)>Number(d.anio_hasta)) e.push('El año inicial no puede ser mayor al final');
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
    /* Que comando exacto le corresponde a este reset. Devuelve los bytes, no
       una descripcion: si no hay bytes que mandar, no hay reset que ejecutar y
       se dice por que. */
    recetaDeReset(d) {
      const rut = d && d.definicion && d.definicion.rutina;
      const rid = Number(rut && rut.rid);
      if (Number.isInteger(rid) && rid >= 0 && rid <= 0xFFFF) {
        const sub = Number.isInteger(Number(rut.sub)) ? Number(rut.sub) : 0x01;
        const datos = Array.isArray(rut.datos)
          ? rut.datos.map(Number).filter(x => Number.isInteger(x) && x >= 0 && x <= 0xFF) : [];
        return {ok:true, origen:'rutina', servicio:RESET_POR_RUTINA.servicio,
          efecto: rut.efecto || 'Rutina del fabricante declarada en esta definición verificada.',
          pasos:[{tx:[0x31, sub, (rid >> 8) & 0xFF, rid & 0xFF].concat(datos), positiva:0x71,
                  nombre:`Rutina 0x${rid.toString(16).toUpperCase().padStart(4,'0')} del fabricante`}]};
      }
      const obj = d && d.definicion && d.definicion.objetivo_reset;
      const r = RECETAS_RESET[obj];
      if (r) return {ok:true, origen:'norma', servicio:r.servicio, efecto:r.efecto, pasos:r.pasos};
      const nombre = (OBJETIVOS_RESET.find(x => x.id === obj) || {}).nombre || 'Este reset';
      return {ok:false, motivo:`${nombre} no tiene un comando normalizado: depende de una rutina propia de la marca. ` +
        'Cargá el identificador de rutina del manual en definicion.rutina.rid con su fuente; sin eso NexusPro no transmite nada.'};
    },
    /* La puerta de un reset. Todo lo que puede terminar en una transmision pasa
       por aca: verificado, riesgo acotado, direccion real, receta real y
       precondiciones cumplidas CON DATOS MEDIDOS del vehiculo. */
    puedeEjecutarReset(d, estado = {}) {
      const errores = this.validar(d);
      if (errores.length) return {ok:false, motivo:errores.join('. ')};
      if (d.tipo !== 'reset') return {ok:false, motivo:'La definición no es un reset'};
      if (d.estado !== 'verificado') return {ok:false, motivo:'La definición no está verificada: un reset sin verificar no transmite'};
      if (d.riesgo === 'critico') return {ok:false, motivo:'Un reset de riesgo crítico no se ejecuta desde esta capa'};
      const req = Number(d.definicion && d.definicion.request_id);
      if (!Number.isInteger(req)) return {ok:false, motivo:'La definición no trae la dirección del módulo. Completala desde el mapa de acceso del vehículo.'};
      /* Number(null) es 0, y 0 es un entero valido: sin distinguirlo, una
         definicion hecha por ELM —que no sabe la direccion de respuesta— se
         iba a ejecutar contra la direccion 0x000. */
      const rawResp = d.definicion && d.definicion.response_id;
      const resp = (rawResp === null || rawResp === undefined || rawResp === '') ? NaN : Number(rawResp);
      const receta = this.recetaDeReset(d);
      if (!receta.ok) return {ok:false, motivo:receta.motivo};
      const exigidas = (d.precondiciones && d.precondiciones.length)
        ? d.precondiciones
        : (PRECONDICIONES_RESET[d.definicion.objetivo_reset] || ['contacto']);
      const p = this.evaluarPrecondiciones(exigidas, estado);
      if (!p.ok) return {ok:false, motivo:p.fallos.join('. '), fallos:p.fallos};
      return {ok:true, receta, req, resp: Number.isInteger(resp) ? resp : null, precondiciones:exigidas};
    },
    puedeEjecutar(d) {
      const errores=this.validar(d);
      if (errores.length) return {ok:false,motivo:errores.join('. ')};
      if (d.estado!=='verificado') return {ok:false,motivo:'La definición todavía no está verificada'};
      if (d.tipo!=='did' || d.riesgo!=='lectura') return {ok:false,motivo:'Este botón ejecuta lecturas DID verificadas. Los resets se ejecutan con su propio botón, que exige además precondiciones medidas en el vehículo.'};
      return {ok:true};
    },
    puedePrepararActiva(d, estado={}) {
      if(d?.tipo!=='prueba_activa') return {ok:false,motivo:'La definición no es una prueba activa'};
      if(d.estado!=='verificado'||d.riesgo==='critico') return {ok:false,motivo:'La prueba activa no está verificada para preparación'};
      const obj=OBJETIVOS_ACTIVOS.find(x=>x.id===d.definicion?.objetivo_activo);
      if(!obj) return {ok:false,motivo:'Falta objetivo activo'};
      const p=this.evaluarPrecondiciones((d.precondiciones||[]).length?d.precondiciones:obj.precondiciones,estado);
      return p.ok?{ok:true,objetivo:obj}:{ok:false,motivo:p.fallos.join('. '),fallos:p.fallos};
    }
  };
  globalThis.OEMMotor=Motor;
  const M=globalThis.Modulos?.diagnostico_obd;
  if (!M) return;
  Object.assign(M, {
    _oemDefs:[], _oemAdaptador:null, _inspeccionBLE:null, _oemTopologia:null,
    async inspeccionarBluetooth() {
      /* Dentro de la app NO hay Web Bluetooth (la WebView no lo trae) y ademas
         el puente alcanza Bluetooth CLASICO, que el navegador no ve nunca. Por
         eso alli se inspecciona por el puente: sale la lista con NOMBRES y con
         si estan emparejados, en vez de la lista de Chrome donde un aparato sin
         nombre aparece como una MAC pelada. */
      if (this._nativo) return this._inspeccionarBluetoothNativo();
      if (!navigator.bluetooth) return UI.toast('Este navegador no ofrece Web Bluetooth','error');
      const svcs=[...new Set([...(this._SVC_CANDIDATOS||[]),...(this._UUIDS||[]).map(x=>x.svc),'0000180a-0000-1000-8000-00805f9b34fb'])];
      const infoBLE={'00002a24-0000-1000-8000-00805f9b34fb':'modelo','00002a27-0000-1000-8000-00805f9b34fb':'hardware','00002a28-0000-1000-8000-00805f9b34fb':'firmware','00002a29-0000-1000-8000-00805f9b34fb':'fabricante'};
      let dev,server;
      try {
        dev=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:svcs});
        server=await dev.gatt.connect();
        const servicios=[];
        for(const s of await server.getPrimaryServices()) {
          const chars=[];
          try { for(const c of await s.getCharacteristics()) {
            const item={uuid:c.uuid,propiedades:propsBLE(c.properties)};
            /* Sólo se leen las cuatro características estándar de Device
               Information. Es una lectura pasiva; no se toca el canal OBD ni
               se escribe en el adaptador. */
            if(infoBLE[c.uuid]&&c.properties?.read) { try { const v=await c.readValue(); const bytes=Array.from(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)); item.valor=new TextDecoder().decode(v).replace(/\0/g,'').trim(); item.hex=hex(bytes); } catch(e) { item.error_lectura=e.message; } }
            chars.push(item);
          } }
          catch(e){ chars.push({error:e.message}); }
          servicios.push({uuid:s.uuid,caracteristicas:chars});
        }
        const identidad={};servicios.flatMap(s=>s.caracteristicas||[]).forEach(c=>{if(infoBLE[c.uuid]&&c.valor)identidad[infoBLE[c.uuid]]=c.valor;});
        const canalOBD=servicios.some(s=>(s.caracteristicas||[]).some(c=>c.propiedades?.includes('write')||c.propiedades?.includes('writeWithoutResponse'))&&((s.caracteristicas||[]).some(c=>c.propiedades?.includes('notify')||c.propiedades?.includes('indicate'))));
        /* Chrome solo sabe el nombre que el aparato ANUNCIA. Muchos dongles BLE
           no anuncian ninguno y quedan como un identificador pelado — que es lo
           que se ve como "solo la MAC". Pero casi todos SI publican fabricante y
           modelo en el servicio Device Information, que ya se leyo arriba: si no
           hay nombre anunciado, se usa ese. Es la unica fuente de nombre que un
           navegador puede alcanzar. */
        const nombreReal = dev.name
          || [identidad.fabricante, identidad.modelo].filter(Boolean).join(' ')
          || null;
        this._inspeccionBLE={fecha:new Date().toISOString(),nombre:nombreReal,anunciado:dev.name||null,id:dev.id||null,tipo:'BLE Web Bluetooth',identidad,servicios,canal_obd_detectado:canalOBD,estado_conexion:'cerrada al terminar inspección pasiva',limitacion:'Chrome solo revela servicios UUID solicitados previamente; un resultado vacío no significa que el dongle no tenga servicios. Para mantener una sesión se necesita un canal OBD write + notify.',agente:navigator.userAgent||null};
        await DB.registrarEjecucionOEM({operacion:'inspeccion_ble_pasiva',estado:'exitosa',evidencia:this._inspeccionBLE});
      } catch(e) {
        if(e?.name==='NotFoundError') return UI.toast('Inspección cancelada','info');
        this._inspeccionBLE={fecha:new Date().toISOString(),nombre:dev?.name||null,id:dev?.id||null,tipo:'BLE Web Bluetooth',servicios:[],error:e.message};
        await DB.registrarEjecucionOEM({operacion:'inspeccion_ble_pasiva',estado:'fallida',evidencia:this._inspeccionBLE,error:e.message}).catch(()=>{});
      } finally { try{server?.disconnect();}catch(_){} }
      this.modalInspeccionBLE();
    },
    /* Inspeccion por el puente de la app. No enumera servicios GATT —el puente
       es una tuberia de bytes, no un explorador— pero contesta lo que de verdad
       se pregunta de un dongle: quien es, que firmware trae y por que protocolo
       habla. Se lo pregunta AL APARATO con comandos AT inocuos; ninguno toca la
       ECU del vehiculo. */
    async _inspeccionarBluetoothNativo() {
      let est={};
      try { est=JSON.parse(window.NexusBT.estado()||'{}'); } catch(_) {}
      if(!est.disponible) return UI.toast('Este teléfono no tiene Bluetooth','error');
      if(!est.encendido)  return UI.toast('El Bluetooth del teléfono está apagado','error');

      UI.toast('Buscando aparatos Bluetooth…','info');
      let lista=[];
      try { lista=await this._btPedir('lista',()=>window.NexusBT.listar(),20000); }
      catch(e) { return UI.toast('No se pudo listar: '+e.message,'error'); }
      if(!lista.length) return UI.toast('No se encontró ningún aparato Bluetooth','warn');

      const elegido=await this._elegirEscaner(lista);
      if(!elegido) return;

      const via=this._via; this._via='android';
      const at=[];
      try {
        await this._btPedir('conectar',()=>window.NexusBT.conectar(elegido.mac,elegido.tipo),30000);
        this._buf='';
        /* Inocuos: le hablan al DONGLE, no al vehiculo. */
        for(const c of ['ATI','AT@1','AT@2','ATDPN','ATRV']) {
          const r=await this._cmd(c,4000).catch(e=>'— '+e.message);
          at.push({comando:c,respuesta:String(r).replace(/[\r\n>]+/g,' ').trim()});
        }
      } catch(e) {
        at.push({comando:'conectar',respuesta:'ERROR: '+e.message});
      } finally {
        try { window.NexusBT.desconectar(); } catch(_) {}
        this._bt=null; this._via=via;
      }

      const contesta=at.some(x=>/ELM|OBD|v[0-9]/i.test(x.respuesta));
      this._inspeccionBLE={
        fecha:new Date().toISOString(),
        nombre:elegido.nombre||null, id:elegido.mac||null,
        tipo:elegido.tipo==='ble'?'BLE (puente de la app)':'Bluetooth clásico SPP (puente de la app)',
        emparejado:!!elegido.vinculado,
        identidad:{}, servicios:[], at,
        canal_obd_detectado:contesta,
        estado_conexion:'cerrada al terminar la inspección',
        limitacion:'El puente mueve bytes: no enumera servicios GATT. A cambio alcanza Bluetooth CLÁSICO, que el navegador no ve, y pregunta la identidad al propio adaptador con comandos AT.',
        agente:navigator.userAgent||null,
        aparatos_vistos:lista.map(d=>({nombre:d.nombre,mac:d.mac,tipo:d.tipo,emparejado:!!d.vinculado}))
      };
      await DB.registrarEjecucionOEM({operacion:'inspeccion_bt_puente',estado:contesta?'exitosa':'fallida',evidencia:this._inspeccionBLE}).catch(()=>{});
      this.modalInspeccionBLE();
    },

    modalInspeccionBLE() {
      const r=this._inspeccionBLE; if(!r)return;
      const total=(r.servicios||[]).reduce((n,s)=>n+(s.caracteristicas||[]).filter(c=>c.uuid).length,0);
      const ident=r.identidad||{};
      UI.modal('🔬 Inspector de interfaz Bluetooth',`<div class="card" style="padding:14px"><b>${UI.esc(r.nombre||'Dispositivo sin nombre')}</b>${!r.anunciado&&r.nombre?' <span style="font-size:11px;color:var(--text3)">(nombre leído del propio aparato: no anuncia ninguno por BLE)</span>':''}${!r.nombre?' <span style="font-size:11px;color:var(--amber)">— este aparato no anuncia nombre por BLE ni lo publica en Device Information; el navegador solo puede mostrar su identificador</span>':''}<p>${r.error?`<span style="color:var(--red)">${UI.esc(r.error)}</span>`:`${r.servicios.length} servicio(s) accesible(s) · ${total} característica(s)`}</p>${Object.keys(ident).length?`<p><b>Identidad leída:</b> ${Object.entries(ident).map(([k,v])=>`${UI.esc(k)}: ${UI.esc(v)}`).join(' · ')}</p>`:''}<p><b>Estado:</b> ${UI.esc(r.estado_conexion||'no determinado')} · <b>Canal OBD:</b> <span style="color:var(--${r.canal_obd_detectado?'green':'amber'})">${r.canal_obd_detectado?'detectado':'no detectado'}</span></p><small>${UI.esc(r.limitacion||'')}</small></div>
      <div style="max-height:52vh;overflow:auto;margin-top:12px">${(r.servicios||[]).map(s=>`<div class="card" style="padding:11px;margin-bottom:8px"><b style="font-family:monospace">${UI.esc(s.uuid)}</b>${(s.caracteristicas||[]).map(c=>`<div style="font-family:monospace;font-size:11px;margin-top:6px">↳ ${UI.esc(c.uuid||c.error)} <span style="color:var(--text3)">${UI.esc((c.propiedades||[]).join(', '))}</span>${c.valor?`<br><b>${UI.esc(c.valor)}</b> <span style="opacity:.6">[${UI.esc(c.hex||'')}]</span>`:''}${c.error_lectura?`<br><span style="color:var(--amber)">${UI.esc(c.error_lectura)}</span>`:''}</div>`).join('')}</div>`).join('')||'<p>No se revelaron servicios autorizados. La capa Android nativa será necesaria para inspección completa o Bluetooth Classic.</p>'}</div>
      ${(r.at||[]).length?`<div class="card" style="padding:11px;margin-top:8px"><b style="font-size:12px">LO QUE CONTESTÓ EL ADAPTADOR</b>${r.at.map(x=>`<div style="font-family:monospace;font-size:11.5px;margin-top:4px">&gt; ${UI.esc(x.comando)}<br>&lt; <b>${UI.esc(x.respuesta)}</b></div>`).join('')}</div>`:''}
      ${(r.aparatos_vistos||[]).length?`<div class="card" style="padding:11px;margin-top:8px"><b style="font-size:12px">APARATOS VISTOS (${r.aparatos_vistos.length})</b>${r.aparatos_vistos.map(d=>`<div style="font-size:11.5px;margin-top:3px">${UI.esc(d.nombre||'(sin nombre)')} <span style="color:var(--text3)">· ${d.tipo==='ble'?'BLE':'clásico'} · ${d.emparejado?'emparejado':'no emparejado'} · ${UI.esc(d.mac)}</span></div>`).join('')}</div>`:''}
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button><button class="btn btn-cyan" onclick="Modulos.diagnostico_obd.copiarInspeccionBLE()">📋 Copiar reporte</button></div>`,'820px');
    },
    _oemVehiculoId:null,

    /* Los DID OEM aplican por marca y modelo, asi que hace falta saber que
       vehiculo hay enchufado. Si no viene de un escaneo en curso, se pregunta:
       es un dato, no una razon para bloquear el boton. */
    _elegirVehiculoOEM() {
      return new Promise(async res => {
        if(!this._vehiculos||!this._vehiculos.length) {
          try { this._vehiculos=await DB.getVehiculos()||[]; } catch(_) { this._vehiculos=[]; }
        }
        if(!this._vehiculos.length) { UI.toast('No hay vehículos registrados','warn'); return res(null); }
        this._oemVehElegido=id=>{ UI.cerrarModal(); res(id||null); };
        UI.modal('🚗 ¿Qué vehículo está enchufado?',
          `<p style="font-size:13px;color:var(--text3)">Los parámetros OEM dependen de la marca y el modelo.</p>
           <select class="form-select" id="oem-veh">
             ${this._vehiculos.map(v=>`<option value="${v.id}">${UI.esc(v.placa||'s/placa')} · ${UI.esc(v.marca||'')} ${UI.esc(v.modelo||'')} ${v.anio||''}</option>`).join('')}
           </select>
           <div class="modal-footer" style="margin-top:12px">
             <button class="btn btn-ghost" onclick="Modulos.diagnostico_obd._oemVehElegido(null)">Cancelar</button>
             <button class="btn btn-brand" onclick="Modulos.diagnostico_obd._oemVehElegido(document.getElementById('oem-veh').value)">Continuar</button>
           </div>`,'460px');
      });
    },

    async copiarInspeccionBLE() { if(!this._inspeccionBLE)return; await navigator.clipboard.writeText(JSON.stringify(this._inspeccionBLE,null,2)); UI.toast('Reporte Bluetooth copiado ✓'); },
    async detectarAdaptadorOEM() {
      /* Una sesión de escaneo activa es necesaria para leer el vehículo, no
         para saber si Windows ve un adaptador. Antes este botón exigía
         `_listo`, por eso siempre decía "conecta primero" cuando el USB-Link
         estaba enchufado pero aún no se había iniciado un escaneo. */
      if (this._esELM() && this._listo) {
        const consultar=async c=>{ try{return String(await this._cmd(c,1800)).replace(/\s+/g,' ').trim();}catch(e){return 'sin respuesta';} };
        const [ati,desc,serie,volt,sti]=await Promise.all([consultar('ATI'),consultar('AT@1'),consultar('AT@2'),consultar('ATRV'),consultar('STI')]);
        const esMS=/vlinker\s*ms|mic3425/i.test([ati,desc,sti].join(' '));
        this._oemAdaptador={ati,desc,serie,volt,sti,familia:'elm',modelo:esMS?'Vgate vLinker MS':(ati||desc||'ELM/ST compatible'),firmware:(ati+' '+sti).match(/\d+\.\d+(?:\.\d+)?/)?.[0]||null,canales:esMS?CANALES:CANALES.slice(0,1)};
        return this.modalOEM();
      }

      /* El puente puede enumerar las DLL RP1210 aunque todavía no exista una
         sesión CAN/J1939 abierta. Elegimos la API cargada (o la primera
         instalada), la cargamos y mostramos sus capacidades sin transmitir al
         vehículo. Los puertos SERIAL se dejan para el flujo Bluetooth clásico. */
      let errorUSB=null;
      try {
        await this._puenteConectar();
        const r=await this._puenteOp({op:'apis'},5000);
        const apis=((r&&r.apis)||[]).filter(a=>a.instalado&&!/^SERIAL:/i.test(String(a.api||'')));
        if(!apis.length) throw new Error('No hay adaptadores RP1210 instalados en esta PC');
        const elegido=(this._api&&apis.find(a=>a.api===this._api))||apis.find(a=>a.cargada)||apis[0];
        const carga=await this._puenteOp({op:'cargar',api:elegido.api},6000);
        if(!carga?.ok) throw new Error(carga?.error||'No se pudo cargar la DLL RP1210');
        const est=await this._puenteOp({op:'estado'},5000).catch(()=>carga);
        this._api=elegido.api;
        this._via='usb';
        const protocolos=(elegido.protocolos||[]).map(p=>String(p).split(',')[0].toUpperCase());
        this._oemAdaptador={modelo:est.dispositivo||elegido.nombre||'Interfaz RP1210',familia:'rp1210',firmware:est.version||carga.version||null,volt:'por bus',canales:CANALES,protocolos,nota:'Adaptador enumerado y DLL cargada. El vehículo aún no fue interrogado; inicia Conectar y Escanear para abrir CAN/J1939.'};
        return this.modalOEM();
      } catch(e) { errorUSB=e; }

      return UI.toast(errorUSB
        ? `No se detectó un adaptador activo. ${errorUSB.message}`
        : 'Conecta primero un adaptador BLE o RP1210','warn');
    },
    async _estadoPlanValidacion() {
      const normaliza=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
      const coincide=(p,v)=>{
        const marca=normaliza(v?.marca), modelo=normaliza(v?.modelo);
        const reglas={
          mitsubishi:['MITSUBISHI'], nissan_rogue:['NISSAN','ROGUE','X-TRAIL'], nissan_juke:['NISSAN','JUKE'],
          kia_picanto:['KIA','PICANTO'], isuzu_npr:['ISUZU','NPR','ELF','N-SERIES'],
          foton_aumark:['FOTON','AUMARK'], international_dt466:['INTERNATIONAL','DT466']
        }[p.id]||[];
        if(!reglas.length||!marca||!marca.includes(reglas[0]))return false;
        return reglas.length===1||reglas.slice(1).some(x=>modelo.includes(x));
      };
      let scans=[...(Array.isArray(this._data)?this._data:[])];
      if(this._scan)scans.push(this._scan);
      try {
        const historico=await DB.getDiagnosticosOBD('1980-01-01','2200-01-01',500);
        scans=scans.concat(historico||[]);
      } catch(_) {}
      const unicos=new Map();
      for(const s of scans) {
        const v=s.vehiculos||((this._vehiculos||[]).find(x=>x.id===s.vehiculo_id));
        for(const p of PLAN_VALIDACION) if(coincide(p,v)) {
          const anterior=unicos.get(p.id);
          if(!anterior||String(s.created_at||'')>String(anterior.created_at||''))unicos.set(p.id,{s,v});
        }
      }
      return Object.fromEntries(PLAN_VALIDACION.map(p=>{
        const hallado=unicos.get(p.id);
        if(!hallado)return [p.id,{estado:'pendiente',etiqueta:'Pendiente prueba real'}];
        const s=hallado.s, mapa=s.mapa_acceso, modulos=Array.isArray(s.por_modulo)?s.por_modulo:Array.isArray(s.modulos)?s.modulos:[];
        let estado='bus_confirmado', etiqueta='Bus/OBD confirmado';
        if(s.vin){estado='vin_confirmado';etiqueta='VIN leído';}
        if((mapa?.modulos||[]).length||modulos.length){estado='modulos_mapeados';etiqueta='Módulos mapeados';}
        return [p.id,{estado,etiqueta,fecha:s.created_at||null,adaptador:s.adaptador||null,protocolo:s.protocolo||null}];
      }));
    },
    async modalOEM() {
      this._oemDefs=await DB.getDefinicionesOEM();
      const estadosPlan=await this._estadoPlanValidacion();
      /* La tabla existente usa `x.estado`; actualizarlo aquí mantiene el
         catálogo compatible y evita mostrar siempre "pendiente" después de
         guardar un escaneo real. */
      for(const p of PLAN_VALIDACION) {
        const e=estadosPlan[p.id];
        p.estado=e?.adaptador?`${e.etiqueta} · ${e.adaptador}`:(e?.etiqueta||'Pendiente prueba real');
      }
      const a=this._oemAdaptador;
      const puede=typeof rolEnLista==='function' ? rolEnLista(['admin','gerente_tal']) : false;
      UI.modal('🧠 Diagnóstico OEM',`<div style="display:grid;gap:14px">
        <div class="card" style="padding:14px"><b>Adaptador y redes</b><div style="margin-top:8px">${a?`<b>${UI.esc(a.modelo)}</b> · firmware ${UI.esc(a.firmware||'no identificado')} · ${UI.esc(a.volt)}`:'Conecta el adaptador durante un escaneo para interrogarlo.'}</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px">${CANALES.map(c=>`<span class="badge badge-${c.estado==='operativo'?'green':'amber'}" title="${UI.esc(c.nota)}">${c.nombre} · ${c.estado}</span>`).join('')}</div>
        <button class="btn btn-sm btn-ghost" style="margin-top:10px" onclick="Modulos.diagnostico_obd.detectarAdaptadorOEM()">🔎 Detectar adaptador conectado</button>
        <button class="btn btn-sm btn-cyan" style="margin-top:10px" onclick="Modulos.diagnostico_obd.inspeccionarBluetooth()">🔬 Inspeccionar cualquier BLE</button>
        <button class="btn btn-sm btn-brand" style="margin-top:10px" onclick="Modulos.diagnostico_obd.explorarRedesOEM()">🗺 Explorar módulos</button>
        <button class="btn btn-sm btn-cyan" style="margin-top:10px" onclick="Modulos.diagnostico_obd.leerParametrosOEM()">📈 Parámetros OEM</button>
        <select class="form-select" id="oem-simulador" style="display:inline-block;width:auto;margin-top:10px"><option value="">Simulador de red…</option>${Object.entries(PERFILES_SIMULADOS).map(([id,p])=>`<option value="${id}">${UI.esc(p.marca)}</option>`).join('')}</select>
        <button class="btn btn-sm btn-ghost" style="margin-top:10px" onclick="Modulos.diagnostico_obd.simularRedOEM(document.getElementById('oem-simulador').value)">🧪 Ejecutar simulador</button>
        <div style="margin-top:10px;font-size:11px;color:var(--text3)">${FAMILIAS.map(f=>`<b>${f.nombre}</b>: ${f.nota}`).join(' · ')}</div></div>
        <div class="card" style="padding:14px"><div style="display:flex;justify-content:space-between"><b>Catálogo OEM (${this._oemDefs.length})</b>${puede?'<button class="btn btn-sm btn-brand" onclick="Modulos.diagnostico_obd.editarOEM()">＋ Nueva definición</button>':''}</div>
        <div style="overflow:auto;margin-top:9px"><table class="table"><thead><tr><th>Marca/modelo</th><th>ECU</th><th>Función</th><th>Evidencia</th><th>Riesgo</th><th>Acciones</th></tr></thead><tbody>${this._oemDefs.length?this._oemDefs.map(d=>`<tr><td><b>${UI.esc(d.marca)}</b> ${UI.esc(d.modelo||'')}</td><td>${UI.esc(d.ecu)}</td><td>${UI.esc(d.nombre)}<br><small>${UI.esc(d.tipo)} ${UI.esc(d.identificador||'')}</small></td><td><span class="badge badge-${d.estado==='verificado'?'green':'amber'}">${UI.esc(d.estado)}</span><br><small>${UI.esc(d.fuente)}</small></td><td>${UI.esc(d.riesgo)}</td><td>${d.tipo==='reset'&&Motor.puedeEjecutarReset(d,{contacto:true,velocidad:0,motor:false}).ok?`<button class="btn btn-sm btn-amber" title="Ejecutar este reset" onclick="Modulos.diagnostico_obd.ejecutarResetOEM('${d.id}')">▶</button>`:''}${Modulos.btnAccion('ver',`Modulos.diagnostico_obd.verOEM('${d.id}')`)}${Modulos.btnAccion('editar',`Modulos.diagnostico_obd.editarOEM('${d.id}')`)}${Modulos.btnAccion('eliminar',`Modulos.diagnostico_obd.eliminarOEM('${d.id}','${UI.jsAttr(d.nombre)}')`)}</td></tr>`).join(''):'<tr><td colspan="6">Aún no hay definiciones. Agrega únicamente información con fuente comprobable.</td></tr>'}</tbody></table></div></div>
        ${this._oemTopologia?this._topologiaOEMHTML(this._oemTopologia):''}
        <div class="card" style="padding:14px"><b>Paquete base UDS de identificación</b><p>${DIDS_BASE.map(d=>`<code>${d.did}</code> ${UI.esc(d.nombre)}`).join(' · ')}</p><small>Son DIDs normalizados para descubrir identidad; una ECU puede no implementarlos. No se presentan como parámetros exclusivos de Ford o GM.</small></div>
        <div class="card" style="padding:14px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><b>Paquetes por vehículo</b>
        ${puede?`<div style="display:flex;gap:7px;flex-wrap:wrap">${PAQUETES_OEM.map(x=>`<button class="btn btn-sm btn-brand" onclick="Modulos.diagnostico_obd.cargarPaqueteOEM('${x.id}')">＋ ${UI.esc(x.nombre)}</button>`).join('')}<button class="btn btn-sm btn-ghost" onclick="Modulos.diagnostico_obd.completarDireccionesOEM()">📍 Completar direcciones desde el mapa</button></div>`:''}</div>
        <p style="margin:8px 0;font-size:12.5px">Un paquete trae de una vez todo lo que hace falta para trabajar ese vehículo: identificación, borrado de códigos por módulo y reinicio de módulo.
        <b>Queda ejecutable el día uno</b> en motor y transmisión, porque esas dos direcciones (0x7E0/0x7E8 y 0x7E1/0x7E9) están legisladas en ISO 15765-4 y los servicios están en ISO 14229-1: no hay nada que adivinar.</p>
        <p style="margin:0 0 8px;font-size:12.5px">ABS, airbag, carrocería e inmovilizador llegan en <b>borrador y sin dirección a propósito</b>: no están en el rango legislado y esta capa no inventa direcciones. Escaneá el vehículo y usá <b>Completar direcciones desde el mapa</b>: la dirección sale del propio vehículo, que ya contestó desde ahí.</p>
        <small>Los resets que dependen de una rutina propia de la marca —punto cero de la dirección, adaptativos de la caja, reaprendizaje de ralentí, aviso de mantenimiento— se cargan como procedimiento y <b>no transmiten nada</b> hasta que se les cargue el identificador de rutina del manual.</small></div>
        <div class="card" style="padding:14px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><b>Referencias predeterminadas de tu flota</b>${puede?`<button class="btn btn-sm btn-brand" onclick="Modulos.diagnostico_obd.agregarReferenciasOEM()">＋ Cargar ${REFERENCIAS_VEHICULOS.length} borradores</button>`:''}</div><p style="margin:8px 0">Incluye identificación, reset de mantenimiento y diagnóstico IMMO para los 7 vehículos listados. Todo queda en <b>borrador</b>, sin transmisión, porque dirección, ECU, protocolo y procedimiento todavía deben confirmarse.</p><small>IMMO sólo contiene identificación/estado/diagnóstico; no contiene llaves, PIN, secretos, clonación ni bypass.</small></div>
        <div class="card" style="padding:14px"><b>Plan de validación preparado</b><div style="overflow:auto;margin-top:8px"><table class="table"><thead><tr><th>Vehículo</th><th>Familia</th><th>Protocolos previstos</th><th>Interfaces</th><th>Estado</th></tr></thead><tbody>${PLAN_VALIDACION.map(x=>`<tr><td>${UI.esc(x.vehiculo)}</td><td>${UI.esc(x.familia)}</td><td><code>${x.protocolos.join(' · ')}</code></td><td>${x.interfaces.map(id=>{const f=familiaPorId(id);const ok=!!(f&&f.disponible);return `<span class="badge badge-${ok?'green':'amber'}" title="${UI.esc(f?f.nota:'Interfaz desconocida')}">${UI.esc(f?f.nombre:id)}${ok?'':' · no implementada'}</span>`;}).join(' ')}</td><td><span class="badge badge-amber">${x.estado}</span></td></tr>`).join('')}</tbody></table></div><small>“Previsto” no significa compatible confirmado: se actualizará con la respuesta real de cada interfaz.</small></div>
        <div class="card" style="padding:14px"><b>Paquetes iniciales</b><p>Ford y GM están preparados como objetivos. Las pruebas activas, calibraciones, DPF, purga ABS, codificación, Security Access y reflash permanecen bloqueadas hasta incorporar una definición verificada y sus precondiciones.</p></div>
      </div>`, '1100px');
    },
    _topologiaOEMHTML(t) {
      return `<div class="card" style="padding:14px"><div style="display:flex;justify-content:space-between;gap:10px"><b>Mapa de redes · ${UI.esc(t.modo)}</b><span class="badge badge-${t.modo==='simulador'?'amber':'green'}">${t.total_modulos} módulo(s)</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-top:10px">${t.redes.map(r=>`<div style="border:1px solid var(--border);border-radius:8px;padding:9px"><b>${UI.esc(r.nombre)}</b><br><small>${UI.esc(r.estado)}</small>${r.modulos.map(m=>`<div style="margin-top:6px;font-size:12px"><b>${UI.esc(m.nombre)}</b><br><code>${m.req.toString(16).toUpperCase()} → ${m.resp==null?'?':m.resp.toString(16).toUpperCase()}</code></div>`).join('')||'<div style="margin-top:6px;color:var(--text3);font-size:12px">Sin resultados</div>'}</div>`).join('')}</div></div>`;
    },
    async agregarReferenciasOEM() {
      if(typeof rolEnLista==='function'&&!rolEnLista(['admin','gerente_tal'])) return UI.toast('No tienes permiso para cargar referencias OEM','error');
      const clave=d=>[d.marca,d.modelo,d.ecu,d.tipo,d.identificador||'',d.definicion?.objetivo_reset||d.definicion?.objetivo_immo||''].join('|').toUpperCase();
      const existentes=new Set((this._oemDefs||[]).map(clave)); let agregadas=0,omitidas=0;
      for(const d of REFERENCIAS_VEHICULOS) {
        if(existentes.has(clave(d))){omitidas++;continue;}
        const r=await DB.upsertDefinicionOEM(d); if(r?.error)return UI.toast(`No se pudo cargar ${d.nombre}: ${r.error.message}`,'error');
        existentes.add(clave(d));agregadas++;
      }
      UI.toast(`${agregadas} referencia(s) cargadas · ${omitidas} ya existían`,'success');
      this.modalOEM();
    },
    async simularRedOEM(marca) {
      if(!marca) return UI.toast('Selecciona una marca para el simulador','warn');
      this._oemTopologia=Motor.simularTopologia(marca);
      await DB.registrarEjecucionOEM({operacion:`mapa_redes_simulado_${marca}`,estado:'exitosa',evidencia:this._oemTopologia}).catch(()=>{});
      this.modalOEM();
    },
    async explorarRedesOEM() {
      /* Detectar el adaptador carga la DLL, pero no abre un canal hacia el
         vehÃ­culo. Si el usuario entra directo aquÃ­, preparar una conexiÃ³n CAN
         de lectura automÃ¡ticamente; no obliga a repetir todo el escaneo OBD. */
      /* Antes esto solo sabia autoconectarse por USB: por Bluetooth decia
         "conecta primero" y no habia desde donde. Ahora usa el mismo camino
         que el escaneo, sea el puente de la app (SPP/BLE), Web Bluetooth,
         COM o USB. */
      if(!this._listo) {
        UI.toast('Conectando el adaptador para explorar los modulos…','info');
        try { await this._asegurarConexion(()=>{}); }
        catch(e) { return UI.toast('No se pudo conectar: '+e.message.replace(/<[^>]*>/g,''),'error'); }
      }
      if(!this._listo) return UI.toast('El adaptador no quedo listo; también puedes usar Simular Ford/GM','warn');
      UI.toast('Explorando HS-CAN sin ejecutar actuadores…','info');
      try {
        /* Por ELM la direccion es estado del dongle: hay que fijarla antes y
           devolverla despues, o el monitor en vivo queda hablandole al ultimo
           modulo consultado. */
        const mods=await this._elmPuntoAPunto(()=>this._escanearModulos(null,null));
        const hs=(mods||[]).map(m=>({req:Number(m.req??m.ecu),resp:(m.resp===null||m.resp===undefined)?null:Number(m.resp),nombre:m.nombre||'ECU desconocida',protocolo:m.servicio||m.protocolo}));
        this._oemTopologia=Motor.construirTopologia([{id:'hs',estado:'escaneada',modulos:hs}],{modo:'real',adaptador:this._oemAdaptador?.modelo||this._via});
        await DB.registrarEjecucionOEM({operacion:'mapa_redes_lectura',estado:'exitosa',diagnostico_id:this._scan?.id||null,vehiculo_id:this._scan?.vehiculo_id||null,evidencia:this._oemTopologia});
        this.modalOEM();
      } catch(e) {
        await DB.registrarEjecucionOEM({operacion:'mapa_redes_lectura',estado:'fallida',error:e.message}).catch(()=>{});
        UI.toast('No se pudo completar el mapa: '+e.message,'error');
      }
    },
    async leerParametrosOEM() {
      /* Antes exigia un escaneo EN CURSO (`_scan.vehiculo_id`), y como el
         escaneo se desconecta al cerrar su modal, este boton practicamente
         nunca estaba disponible: decia "mantenlo conectado" sin que hubiera
         forma de mantenerlo. Ahora conecta por su cuenta y, si no hay escaneo
         en curso, pregunta de que vehiculo se trata — que es el unico dato
         que de verdad necesitaba de el (los DID aplican por marca/modelo). */
      if(!this._listo) {
        UI.toast('Conectando el adaptador para leer parámetros…','info');
        try { await this._asegurarConexion(()=>{}); }
        catch(e) { return UI.toast('No se pudo conectar: '+e.message.replace(/<[^>]*>/g,''),'error'); }
      }
      let vehId=this._scan?.vehiculo_id||this._oemVehiculoId||null;
      if(!vehId) vehId=await this._elegirVehiculoOEM();
      if(!vehId) return;
      this._oemVehiculoId=vehId;
      const veh=(this._vehiculos||[]).find(v=>v.id===vehId)||{};
      const defs=this._oemDefs.filter(d=>d.tipo==='did'&&d.estado==='verificado'&&d.riesgo==='lectura'&&Motor.aplica(d,veh)).slice(0,20);
      if(!defs.length) return UI.toast(`No hay parámetros OEM verificados aplicables a ${veh.marca||'este vehículo'}`,'warn');
      const resultados=[];
      for(const d of defs) {
        const cfg=d.definicion||{}, req=Number(cfg.request_id), resp=Number(cfg.response_id);
        if(!Number.isInteger(req)||!Number.isInteger(resp)){resultados.push({d,error:'Dirección ECU pendiente'});continue;}
        try {
          const bytes=await this._leerDID(req,resp,parseInt(d.identificador,16));
          if(!bytes){resultados.push({d,error:'Sin respuesta'});continue;}
          const valor=Motor.decodificar(bytes,cfg.decoder||{}); resultados.push({d,valor,unidad:cfg.decoder?.unidad||'',hex:hex(bytes)});
          await DB.registrarEjecucionOEM({definicion_id:d.id,diagnostico_id:this._scan?.id||null,vehiculo_id:veh.id,operacion:`parámetro UDS ${d.identificador}`,estado:'exitosa',respuesta_hex:hex(bytes),evidencia:{valor,unidad:cfg.decoder?.unidad||null}});
        } catch(e){resultados.push({d,error:e.message});}
      }
      this._oemParametros={fecha:new Date().toISOString(),vehiculo:veh,resultados};
      await DB.registrarEjecucionOEM({operacion:'reporte_parametros_oem',estado:'exitosa',diagnostico_id:this._scan.id||null,vehiculo_id:veh.id,evidencia:{fecha:this._oemParametros.fecha,resultados:resultados.map(x=>({definicion_id:x.d.id,nombre:x.d.nombre,ecu:x.d.ecu,did:x.d.identificador,valor:x.valor??null,unidad:x.unidad||null,error:x.error||null}))}}).catch(()=>{});
      UI.modal('📈 Parámetros OEM',`<div class="card" style="padding:12px;margin-bottom:10px"><b>${UI.esc(veh.marca||'')} ${UI.esc(veh.modelo||'')} ${veh.anio||''}</b><br><small>${resultados.length} definición(es) verificadas consultadas</small></div><div style="max-height:58vh;overflow:auto"><table class="table"><thead><tr><th>ECU</th><th>Parámetro</th><th>Valor</th><th>DID</th></tr></thead><tbody>${resultados.map(x=>`<tr><td>${UI.esc(x.d.ecu)}</td><td>${UI.esc(x.d.nombre)}</td><td>${x.error?`<span style="color:var(--amber)">${UI.esc(x.error)}</span>`:`<b>${UI.esc(x.valor)} ${UI.esc(x.unidad)}</b>`}</td><td><code>${UI.esc(x.d.identificador)}</code></td></tr>`).join('')}</tbody></table></div><div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button><button class="btn btn-brand" onclick="Modulos.diagnostico_obd.imprimirParametrosOEM()">🖨 Guardar PDF / imprimir</button></div>`,'850px');
    },
    imprimirParametrosOEM() {
      const r=this._oemParametros;if(!r)return;
      const v=r.vehiculo||{},w=window.open('','_blank');if(!w)return UI.toast('Permite ventanas emergentes para generar el PDF','warn');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Parámetros OEM</title><style>body{font-family:Arial;padding:24px;color:#111}h2{border-bottom:2px solid #2563eb}table{width:100%;border-collapse:collapse}th,td{padding:7px;border-bottom:1px solid #ddd;text-align:left}th{background:#2563eb;color:white}@media print{button{display:none}}</style></head><body><h2>${UI.esc(Auth.tenant?.name||'NexusPro')} · Parámetros OEM</h2><p><b>Vehículo:</b> ${UI.esc(v.placa||'')} · ${UI.esc(v.marca||'')} ${UI.esc(v.modelo||'')} ${v.anio||''}<br><b>Fecha:</b> ${UI.fecha(r.fecha)}</p><table><thead><tr><th>ECU</th><th>Parámetro</th><th>Valor</th><th>DID</th></tr></thead><tbody>${r.resultados.map(x=>`<tr><td>${UI.esc(x.d.ecu)}</td><td>${UI.esc(x.d.nombre)}</td><td>${UI.esc(x.error||`${x.valor} ${x.unidad||''}`)}</td><td>${UI.esc(x.d.identificador)}</td></tr>`).join('')}</tbody></table><p><small>Resultado registrado por NexusPro. Una lectura fuera de rango debe interpretarse con el procedimiento OEM correspondiente.</small></p><button onclick="window.print()">Guardar como PDF / imprimir</button><script>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close();
    },
    verOEM(id) {
      const d=this._oemDefs.find(x=>x.id===id); if(!d)return;
      const p=Motor.puedeEjecutar(d);
      /* El permiso de reset se evalua SIN estado del vehiculo: acá solo se mira
         si la definición está lista (verificada, con dirección y con receta).
         Las precondiciones se miden recién al apretar, contra el vehículo. */
      const esReset=d.tipo==='reset';
      const pr=esReset?Motor.puedeEjecutarReset(d,{contacto:true,velocidad:0,motor:false}):null;
      const receta=esReset?Motor.recetaDeReset(d):null;
      UI.modal(d.nombre,`<div class="card" style="padding:12px"><b>${UI.esc(d.marca)} ${UI.esc(d.modelo||'')} · ${UI.esc(d.ecu)}</b>
        <p>Fuente: ${UI.esc(d.fuente)} · estado: ${UI.esc(d.estado)} · riesgo: ${UI.esc(d.riesgo)}</p>
        ${esReset?`<div style="font-size:12px;border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
          <b>Qué transmite:</b> ${receta.ok
            ? `${UI.esc(receta.servicio)} · <code>${UI.esc(receta.pasos.map(x=>hex(x.tx)).join(' / '))}</code><br>${UI.esc(receta.efecto)}`
            : `<span style="color:var(--amber)">nada todavía — ${UI.esc(receta.motivo)}</span>`}</div>`:''}
        </div>
        <pre style="white-space:pre-wrap">${UI.esc(JSON.stringify(d.definicion||{},null,2))}</pre>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.cerrarModal()">Cerrar</button>
        ${esReset
          ? `<button class="btn btn-${pr.ok?'amber':'ghost'}" ${pr.ok?'':'disabled'} title="${UI.esc(pr.motivo||'Reset verificado')}" onclick="Modulos.diagnostico_obd.ejecutarResetOEM('${d.id}')">▶ Ejecutar reset</button>`
          : `<button class="btn btn-${p.ok?'cyan':'ghost'}" ${p.ok?'':'disabled'} title="${UI.esc(p.motivo||'Lectura verificada')}" onclick="Modulos.diagnostico_obd.ejecutarOEM('${d.id}')">▶ Ejecutar lectura</button>`}
        </div>`,'720px');
    },
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
      this._oemEditandoPre=d.precondiciones||[];
      const modelos=(Modulos.vehiculos?._modelosComunes?.[d.marca]||[]);
      const pares=[{req:0x7E0,resp:0x7E8,nombre:'Motor'},{req:0x7E1,resp:0x7E9,nombre:'Transmisión'},...((this._oemTopologia?.redes||[]).flatMap(r=>r.modulos||[]))]
        .filter((x,i,a)=>a.findIndex(y=>y.req===x.req&&y.resp===x.resp)===i);
      const parActual=Number.isInteger(Number(d.definicion?.request_id))?`${Number(d.definicion.request_id)}|${Number(d.definicion.response_id)}`:'';
      const anios=Array.from({length:new Date().getFullYear()-1979},(_,i)=>new Date().getFullYear()-i);
      UI.modal(id?'Editar definición OEM':'Nueva definición OEM',`<div class="form-grid">
        <div><label class="form-label">Nombre de la función</label><input class="form-input" id="oem-nombre" value="${UI.esc(d.nombre||'')}"></div><div><label class="form-label">Marca</label><select class="form-select" id="oem-marca" onchange="Modulos.diagnostico_obd.actualizarModelosOEM()"><option value="">Seleccionar…</option>${MARCAS_OEM.map(x=>`<option ${d.marca===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div><label class="form-label">Modelo (opcional)</label><select class="form-select" id="oem-modelo"><option value="">Todos los modelos</option>${modelos.map(x=>`<option ${d.modelo===x?'selected':''}>${UI.esc(x)}</option>`).join('')}${d.modelo&&!modelos.includes(d.modelo)?`<option selected>${UI.esc(d.modelo)}</option>`:''}</select></div><div><label class="form-label">ECU</label><select class="form-select" id="oem-ecu"><option value="">Seleccionar…</option>${ECUS_OEM.map(x=>`<option ${d.ecu===x?'selected':''}>${x}</option>`).join('')}${d.ecu&&!ECUS_OEM.includes(d.ecu)?`<option selected>${UI.esc(d.ecu)}</option>`:''}</select></div>
        <div><label class="form-label">Tipo</label><select class="form-select" id="oem-tipo">${TIPOS.map(x=>`<option ${d.tipo===x?'selected':''} value="${x}">${x.replaceAll('_',' ')}</option>`).join('')}</select></div><div><label class="form-label">DID / identificador</label><select class="form-select" id="oem-idf"><option value="">No corresponde</option>${DIDS_BASE.map(x=>`<option value="${x.did}" ${d.identificador===x.did?'selected':''}>${x.did} · ${UI.esc(x.nombre)}</option>`).join('')}${d.identificador&&!DIDS_BASE.some(x=>x.did===d.identificador)?`<option selected value="${UI.esc(d.identificador)}">${UI.esc(d.identificador)} · definición existente</option>`:''}</select></div>
        <div style="grid-column:1/-1"><label class="form-label">Objetivo de reset (sólo cuando el tipo sea reset)</label><select class="form-select" id="oem-reset"><option value="">No corresponde</option>${OBJETIVOS_RESET.map(x=>`<option value="${x.id}" ${d.definicion?.objetivo_reset===x.id?'selected':''}>${UI.esc(x.nombre)} · riesgo ${x.riesgo}</option>`).join('')}</select></div>
        <div><label class="form-label">Objetivo de prueba activa</label><select class="form-select" id="oem-activa"><option value="">No corresponde</option>${OBJETIVOS_ACTIVOS.map(x=>`<option value="${x.id}" ${d.definicion?.objetivo_activo===x.id?'selected':''}>${UI.esc(x.nombre)} · riesgo ${x.riesgo}</option>`).join('')}</select></div>
        <div style="grid-column:1/-1"><label class="form-label">Objetivo de inmovilizador (trabajo autorizado)</label><select class="form-select" id="oem-immo"><option value="">No corresponde</option>${OBJETIVOS_IMMO.map(x=>`<option value="${x.id}" ${d.definicion?.objetivo_immo===x.id?'selected':''}>${UI.esc(x.nombre)} · riesgo ${x.riesgo}</option>`).join('')}</select><small>No incluye extracción de secretos, clonación ni bypass.</small></div>
        <div><label class="form-label">Protocolo</label><select class="form-select" id="oem-protocolo">${PROTOCOLOS_OEM.map(x=>`<option ${d.protocolo===x?'selected':''} value="${x}">${x.toUpperCase().replaceAll('_',' / ')}</option>`).join('')}</select></div><div><label class="form-label">Red física</label><select class="form-select" id="oem-red">${CANALES.map(x=>`<option value="${x.id}" ${d.definicion?.red===x.id?'selected':''}>${x.nombre}</option>`).join('')}</select></div>
        <div><label class="form-label">Año desde</label><select class="form-select" id="oem-anio-desde"><option value="">Sin límite</option>${anios.map(x=>`<option ${Number(d.anio_desde)===x?'selected':''}>${x}</option>`).join('')}</select></div><div><label class="form-label">Año hasta</label><select class="form-select" id="oem-anio-hasta"><option value="">Sin límite</option>${anios.map(x=>`<option ${Number(d.anio_hasta)===x?'selected':''}>${x}</option>`).join('')}</select></div>
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
      if(v('oem-reset')) definicion.objetivo_reset=v('oem-reset'); else delete definicion.objetivo_reset;
      if(v('oem-activa')) definicion.objetivo_activo=v('oem-activa'); else delete definicion.objetivo_activo;
      if(v('oem-immo')) definicion.objetivo_immo=v('oem-immo'); else delete definicion.objetivo_immo;
      if(par.length===2&&par.every(Number.isInteger)){definicion.request_id=par[0];definicion.response_id=par[1];}else{delete definicion.request_id;delete definicion.response_id;}
      const referencia=v('oem-fuente');
      const desde=Number(v('oem-anio-desde'))||null,hasta=Number(v('oem-anio-hasta'))||null;
      /* El indice unico de la tabla es (marca, modelo, ecu, tipo, identificador):
         dos resets del MISMO modulo sin identificador chocan entre si y el
         segundo no se puede guardar. El objetivo es lo que los distingue. */
      const idf=v('oem-idf') || (v('oem-tipo')==='reset' ? v('oem-reset') : '')
                             || (String(v('oem-tipo')).startsWith('immo_') ? v('oem-immo') : '') || null;
      const d={id:id||undefined,nombre:v('oem-nombre'),marca:v('oem-marca'),modelo:v('oem-modelo')||null,anio_desde:desde,anio_hasta:hasta,ecu:v('oem-ecu'),tipo:v('oem-tipo'),identificador:idf,estado:v('oem-estado'),riesgo:v('oem-riesgo'),fuente:referencia?`${v('oem-fuente-tipo')}: ${referencia}`:'',protocolo:v('oem-protocolo'),definicion,precondiciones:Array.isArray(this._oemEditandoPre)?this._oemEditandoPre:[],activa:true};
      const e=Motor.validar(d); if(e.length)return UI.toast(e.join('. '),'error'); const r=await DB.upsertDefinicionOEM(d); if(r.error)return UI.toast(r.error.message,'error'); UI.cerrarModal(); this.modalOEM();
    },
    /* ═══════════ EJECUTAR UN RESET ═══════════ */

    /* El estado REAL del vehiculo, medido, no declarado por el usuario. Es lo
       que alimenta las precondiciones: "el motor debe estar apagado" no vale
       nada si se lo pregunta a quien quiere apretar el boton. */
    async _estadoVehiculoOEM() {
      const e = {contacto:false, motor:null, velocidad:null, voltaje:null, rpm:null, medido:[]};
      try {
        const b = await this._pid('0C');
        if (b && b.length >= 2) { e.rpm = ((b[0] << 8) | b[1]) / 4; e.motor = e.rpm > 300; e.contacto = true; e.medido.push('rpm'); }
      } catch (_) {}
      try {
        const b = await this._pid('0D');
        if (b && b.length >= 1) { e.velocidad = b[0]; e.contacto = true; e.medido.push('velocidad'); }
      } catch (_) {}
      if (this._esELM()) {
        try {
          const v = String(await this._cmd('ATRV', 2500)).match(/[\d.]+/);
          if (v) { const n = parseFloat(v[0]); if (n > 5) { e.voltaje = n; e.contacto = true; e.medido.push('voltaje'); } }
        } catch (_) {}
      }
      return e;
    },

    async ejecutarResetOEM(id) {
      const d = (this._oemDefs || []).find(x => x.id === id);
      if (!d) return;
      /* Mismo rol que publica definiciones. Un tecnico puede LEER el catalogo y
         ejecutar lecturas; transmitir un reset es otra cosa. */
      if (typeof rolEnLista === 'function' && !rolEnLista(['admin','gerente_tal']))
        return UI.toast('Solo administración puede ejecutar un reset OEM', 'error');

      if (!this._listo) {
        UI.toast('Conectando el adaptador…', 'info');
        try { await this._asegurarConexion(() => {}); }
        catch (e) { return UI.toast('No se pudo conectar: ' + e.message.replace(/<[^>]*>/g, ''), 'error'); }
      }
      const via = this._puedePuntoAPunto();
      if (!via.ok) return UI.toast(via.motivo, 'error');

      let vehId = this._scan?.vehiculo_id || this._oemVehiculoId || null;
      if (!vehId) vehId = await this._elegirVehiculoOEM();
      if (!vehId) return;
      this._oemVehiculoId = vehId;
      const veh = (this._vehiculos || []).find(v => v.id === vehId) || {};
      /* Un reset de Kia en un Hyundai es exactamente el error que esta capa
         existe para no cometer. */
      if (veh.marca && !Motor.aplica(d, veh))
        return UI.toast(`Esta definición es de ${d.marca} ${d.modelo || ''} y el vehículo seleccionado es ${veh.marca} ${veh.modelo || ''}`, 'error');

      UI.toast('Midiendo el estado del vehículo…', 'info');
      const estado = await this._estadoVehiculoOEM();
      const permiso = Motor.puedeEjecutarReset(d, estado);
      if (!permiso.ok) {
        await DB.registrarEjecucionOEM({definicion_id:d.id, vehiculo_id:vehId, operacion:`reset ${d.definicion?.objetivo_reset || ''}`.trim(),
          estado:'rechazada', error:permiso.motivo, evidencia:{estado_vehiculo:estado}}).catch(() => {});
        return UI.toast(permiso.motivo, 'error');
      }

      const receta = permiso.receta;
      const medido = estado.medido.length
        ? `Medido en el vehículo: ${[
            estado.rpm != null ? `${Math.round(estado.rpm)} rpm` : null,
            estado.velocidad != null ? `${estado.velocidad} km/h` : null,
            estado.voltaje != null ? `${estado.voltaje.toFixed(1)} V` : null
          ].filter(Boolean).join(' · ')}`
        : '<b style="color:var(--amber)">No se pudo medir rpm, velocidad ni voltaje.</b> Confirmá a mano que el vehículo está detenido.';
      const tramas = receta.pasos.map(x => hex(x.tx)).join(' / ');
      const ok = await UI.confirmar(
        `¿Ejecutar <b>${UI.esc(d.nombre)}</b>?<br><br>` +
        `<small><b>Módulo:</b> ${UI.esc(d.ecu)} · dirección 0x${permiso.req.toString(16).toUpperCase()}<br>` +
        `<b>Servicio:</b> ${UI.esc(receta.servicio)}<br>` +
        `<b>Se va a transmitir:</b> <code>${UI.esc(tramas)}</code><br>` +
        `<b>Fuente:</b> ${UI.esc(d.fuente)}<br><br>` +
        `${UI.esc(receta.efecto)}<br><br>` +
        `${medido}<br><br>` +
        `El vehículo debe estar <b>detenido</b>. Todo queda en la bitácora con la trama exacta y la respuesta del módulo.</small>`,
        'Ejecutar reset OEM');
      if (!ok) {
        await DB.registrarEjecucionOEM({definicion_id:d.id, vehiculo_id:vehId,
          operacion:`reset ${d.definicion?.objetivo_reset || ''}`.trim(), estado:'cancelada',
          evidencia:{estado_vehiculo:estado}}).catch(() => {});
        return;
      }

      const base = {definicion_id:d.id, diagnostico_id:this._scan?.id || null, vehiculo_id:vehId,
                    operacion:`reset ${d.definicion?.objetivo_reset || receta.origen} · ${receta.servicio}`,
                    solicitud_hex:tramas};
      await DB.registrarEjecucionOEM({...base, estado:'iniciada', evidencia:{estado_vehiculo:estado, precondiciones:permiso.precondiciones}}).catch(() => {});

      const pasos = [];
      try {
        await this._elmPuntoAPunto(async () => {
          for (const paso of receta.pasos) {
            let r = await this._udsPedir(permiso.req, permiso.resp, paso.tx, 5000);
            /* Muchos modulos no aceptan el servicio en sesion por defecto. Se
               reintenta UNA vez en sesion extendida, que es lo que dice la
               norma, no un segundo intento a ciegas. */
            if (!r || r[0] === 0x7F) {
              const ses = await this._udsPedir(permiso.req, permiso.resp, [0x10, 0x03], 2000);
              if (ses && ses[0] === 0x50) r = await this._udsPedir(permiso.req, permiso.resp, paso.tx, 5000);
            }
            const okPaso = !!r && r[0] === paso.positiva;
            pasos.push({paso:paso.nombre, solicitud:hex(paso.tx), respuesta:r ? hex(r) : null,
                        ok:okPaso, nrc: r && r[0] === 0x7F ? r[2] ?? null : null});
            if (!okPaso) break;
          }
        });
      } catch (e) {
        await DB.registrarEjecucionOEM({...base, estado:'fallida', error:e.message, evidencia:{pasos}}).catch(() => {});
        return UI.toast('No se pudo ejecutar: ' + e.message, 'error');
      }

      const todoOk = pasos.length === receta.pasos.length && pasos.every(x => x.ok);
      const ultimo = pasos[pasos.length - 1] || {};
      await DB.registrarEjecucionOEM({...base, estado: todoOk ? 'exitosa' : 'rechazada',
        respuesta_hex: ultimo.respuesta || null,
        error: todoOk ? null : (ultimo.nrc != null ? `El módulo rechazó con NRC 0x${Number(ultimo.nrc).toString(16).toUpperCase()}` : 'Sin respuesta positiva del módulo'),
        evidencia:{pasos, estado_vehiculo:estado}}).catch(() => {});

      UI.modal(todoOk ? '✅ Reset ejecutado' : '⚠️ El módulo no lo aceptó',
        `<div class="card" style="padding:14px"><b>${UI.esc(d.nombre)}</b>
          <div style="font-size:12px;color:var(--text3);margin-top:3px">${UI.esc(d.ecu)} · 0x${permiso.req.toString(16).toUpperCase()} · ${UI.esc(receta.servicio)}</div>
          ${pasos.map(x => `<div style="font-family:ui-monospace,Consolas,monospace;font-size:11.5px;margin-top:7px">
            &gt; ${UI.esc(x.solicitud)}<br>&lt; <b style="color:var(--${x.ok ? 'green' : 'amber'})">${UI.esc(x.respuesta || 'sin respuesta')}</b>
            ${x.nrc != null ? `<br><span style="color:var(--amber)">rechazo 0x${Number(x.nrc).toString(16).toUpperCase()}</span>` : ''}</div>`).join('')}
          <div style="font-size:11.5px;margin-top:10px">${todoOk
            ? UI.esc(receta.efecto) + ' Volvé a escanear para confirmar cómo quedó.'
            : 'El módulo no aceptó la operación. Un rechazo es una respuesta válida: puede faltar una condición del fabricante (contacto, sesión de seguridad, motor apagado) que esta capa no supone.'}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:8px">Queda registrado en la bitácora, con la trama y la respuesta.</div>
        </div>
        <div class="modal-footer"><button class="btn btn-brand" onclick="Modulos.diagnostico_obd.modalOEM()">Volver al catálogo</button></div>`, '640px');
    },

    /* ═══════════ PAQUETES ═══════════ */
    async cargarPaqueteOEM(idPaquete) {
      if (typeof rolEnLista === 'function' && !rolEnLista(['admin','gerente_tal']))
        return UI.toast('No tienes permiso para cargar paquetes OEM', 'error');
      const paq = PAQUETES_OEM.find(x => x.id === idPaquete);
      if (!paq) return UI.toast('Paquete no disponible', 'warn');
      const clave = d => [d.marca, d.modelo, d.ecu, d.tipo, d.identificador || ''].join('|').toUpperCase();
      const existentes = new Set((this._oemDefs || []).map(clave));
      let agregadas = 0, omitidas = 0;
      for (const d of paq.construir()) {
        if (existentes.has(clave(d))) { omitidas++; continue; }
        const r = await DB.upsertDefinicionOEM(d);
        if (r?.error) return UI.toast(`No se pudo cargar ${d.nombre}: ${r.error.message}`, 'error');
        existentes.add(clave(d)); agregadas++;
      }
      await DB.registrarEjecucionOEM({operacion:`paquete_oem_${paq.id}`, estado:'exitosa',
        evidencia:{agregadas, omitidas}}).catch(() => {});
      UI.toast(`${paq.nombre}: ${agregadas} definición(es) cargadas · ${omitidas} ya existían`, 'success');
      this.modalOEM();
    },

    /* Completa las direcciones que el paquete dejo vacias a proposito, tomandolas
       del mapa de acceso del PROPIO vehiculo. Es la unica fuente honesta para un
       modulo que no esta en el rango legislado: el vehiculo ya contesto desde
       ahi en un escaneo real. */
    async completarDireccionesOEM() {
      if (typeof rolEnLista === 'function' && !rolEnLista(['admin','gerente_tal']))
        return UI.toast('No tienes permiso para editar definiciones OEM', 'error');
      let vehId = this._scan?.vehiculo_id || this._oemVehiculoId || null;
      if (!vehId) vehId = await this._elegirVehiculoOEM();
      if (!vehId) return;
      this._oemVehiculoId = vehId;
      const veh = (this._vehiculos || []).find(v => v.id === vehId) || {};
      const mapa = await this._mapaConocido(vehId);
      if (!mapa || !mapa.modulos.length)
        return UI.toast(`Todavía no hay mapa de acceso de ${veh.marca || ''} ${veh.modelo || ''}. Escaneá el vehículo primero.`, 'warn');

      /* El nombre del modulo en el mapa viene del barrido; se casa con la ECU de
         la definicion por palabra clave, y si no casa NO se toca nada. */
      const PISTAS = {
        'ABS / EBCM (frenos)':/abs|ebcm|esp|esc|freno/i,
        'SRS / ACM (airbag)':/srs|airbag|acm|bolsa/i,
        'BCM (carrocería)':/bcm|carroc|body|etacs/i,
        'Inmovilizador':/immo|inmovil|smartra|smart\s*key/i,
        'EPS / PSCM (dirección)':/eps|mdps|pscm|direcc|steering/i,
        'IPC (tablero)':/ipc|tablero|cluster|instrument/i,
        'TCM (transmisión)':/tcm|transmis|caja|at\b/i,
        'ECM / PCM (motor)':/ecm|pcm|motor|engine/i
      };
      let tocadas = 0;
      const sinMapear = [];
      for (const d of (this._oemDefs || [])) {
        if (!Motor.aplica(d, veh)) continue;
        if (Number.isInteger(Number(d.definicion?.request_id))) continue;
        const re = PISTAS[d.ecu];
        const m = re ? mapa.modulos.find(x => re.test(String(x.nombre || ''))) : null;
        if (!m) { sinMapear.push(d.ecu); continue; }
        const definicion = {...(d.definicion || {}), request_id:m.req};
        if (m.resp != null) definicion.response_id = m.resp;
        definicion.origen_direccion = `Mapa de acceso de ${veh.marca || ''} ${veh.modelo || ''} (${mapa.n} escaneo(s) reales)`;
        const r = await DB.upsertDefinicionOEM({id:d.id, definicion});
        if (r?.error) return UI.toast(`No se pudo actualizar ${d.nombre}: ${r.error.message}`, 'error');
        tocadas++;
      }
      await DB.registrarEjecucionOEM({vehiculo_id:vehId, operacion:'completar_direcciones_oem', estado:'exitosa',
        evidencia:{tocadas, modulos_mapa:mapa.modulos.length}}).catch(() => {});
      UI.toast(tocadas
        ? `${tocadas} definición(es) tomaron su dirección del mapa del vehículo. Siguen en borrador: revisalas y verificalas antes de ejecutar.`
        : `Ninguna definición pendiente casó con los ${mapa.modulos.length} módulos del mapa${sinMapear.length ? ` (sin coincidencia: ${[...new Set(sinMapear)].join(', ')})` : ''}`,
        tocadas ? 'success' : 'warn');
      if (tocadas) this.modalOEM();
    },

    eliminarOEM(id,nombre) { Modulos.eliminarRegistro('obd_oem_definiciones',id,nombre,()=>this.modalOEM()); }
  });
})();
