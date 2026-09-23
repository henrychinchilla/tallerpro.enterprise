/* NexusPro — Diagnóstico OBD · Catálogo de códigos (descripciones, guías de diagnóstico) y bitácora del taller.

   Es parte de Modulos.diagnostico_obd: el objeto se define en
   diagnostico_obd.js (núcleo y conexión) y cada parte le agrega sus métodos.
   Se dividió el 2026-09-22 porque el archivo único pasaba de 9.000 líneas.
   defineProperties + getOwnPropertyDescriptors (y no Object.assign) para que
   los get/set viajen como accesores y no como el valor del momento. */
(() => {
  const M = Modulos.diagnostico_obd;
  Object.defineProperties(M, Object.getOwnPropertyDescriptors({

  /* ═══════════ DESCRIPCIONES DTC EN ESPAÑOL ═══════════ */
  /* Diccionario DTC genéricos SAE en español.
     Base: lista MIT de todrobbins/dtcdb (SAE J2012 genéricos), normalizada y
     traducida por tools/dtc/ — ver ese directorio para regenerar y auditar.
     La fuente traía defectos reales (líneas truncadas, "02"→O2, "Cylinder I"→1,
     'Stock On'→'Stuck On'); se reparan ahí, no a mano aquí.
     OJO: la tabla dtc_catalogo de la BD está corrida un lugar desde ~P0170 y por
     eso NO se usa como fuente de verdad; este diccionario manda. */
  _DTCS: {
    B0001:'Despliegue de bolsa de aire del conductor',
    C0035:'Sensor de velocidad rueda del. izq.',
    C0040:'Sensor de velocidad rueda del. der.',
    P0011:'Sincronización del árbol de levas "A" adelantada (Banco 1)',
    P0016:'Correlación cigüeñal-árbol de levas (Banco 1 Sensor A)',
    P0030:'Circuito calentador sensor O2 (B1 S1)',
    P0031:'Calentador sensor O2 señal baja (B1 S1)',
    P0087:'Presión de riel de combustible muy baja',
    P0088:'Presión de riel de combustible muy alta',
    P0100:'Circuito del sensor MAF (flujo de aire)',
    P0101:'Rango/desempeño del sensor MAF',
    P0102:'Señal baja del sensor MAF',
    P0103:'Señal alta del sensor MAF',
    P0104:'Sensor de flujo de aire (MAF) — señal intermitente',
    P0105:'Circuito del sensor MAP (presión absoluta)',
    P0106:'Rango/desempeño del sensor MAP',
    P0107:'Presión absoluta del múltiple (MAP)/barométrica — señal baja',
    P0108:'Presión absoluta del múltiple (MAP)/barométrica — señal alta',
    P0109:'Presión absoluta del múltiple (MAP)/barométrica — señal intermitente',
    P0110:'Circuito sensor temperatura de aire de admisión',
    P0111:'Temperatura del aire de admisión (IAT) — rango/desempeño fuera de especificación',
    P0112:'Temperatura del aire de admisión (IAT) — señal baja',
    P0113:'Señal alta temp. aire de admisión',
    P0114:'Temperatura del aire de admisión (IAT) — señal intermitente',
    P0115:'Circuito sensor temperatura de refrigerante',
    P0116:'Rango/desempeño temp. refrigerante',
    P0117:'Señal baja temp. refrigerante',
    P0118:'Señal alta temp. refrigerante',
    P0119:'Temperatura del refrigerante (ECT) — señal intermitente',
    P0120:'Circuito sensor posición del acelerador (TPS)',
    P0121:'Rango/desempeño del TPS',
    P0122:'Señal baja del TPS',
    P0123:'Señal alta del TPS',
    P0124:'Sensor/interruptor de posición del acelerador (TPS) A — señal intermitente',
    P0125:'Temperatura insuficiente para control de combustible',
    P0126:'Temperatura de refrigerante insuficiente (termostato)',
    P0128:'Termostato — refrigerante no alcanza temperatura',
    P0130:'Circuito sensor O2 (B1 S1)',
    P0131:'Voltaje bajo sensor O2 (B1 S1)',
    P0132:'Sensor de oxígeno (O2) — voltaje alto (Banco 1 Sensor 1)',
    P0133:'Respuesta lenta sensor O2 (B1 S1)',
    P0134:'Sensor O2 sin actividad (B1 S1)',
    P0135:'Calentador sensor O2 (B1 S1)',
    P0136:'Circuito sensor O2 (B1 S2)',
    P0137:'Sensor de oxígeno (O2) — voltaje bajo (Banco 1 Sensor 2)',
    P0138:'Sensor de oxígeno (O2) — voltaje alto (Banco 1 Sensor 2)',
    P0139:'Sensor de oxígeno (O2) — respuesta lenta (Banco 1 Sensor 2)',
    P0140:'Sensor de oxígeno (O2) — sin actividad (Banco 1 Sensor 2)',
    P0141:'Calentador sensor O2 (B1 S2)',
    P0142:'Sensor de oxígeno (O2) — falla (Banco 1 Sensor 3)',
    P0143:'Sensor de oxígeno (O2) — voltaje bajo (Banco 1 Sensor 3)',
    P0144:'Sensor de oxígeno (O2) — voltaje alto (Banco 1 Sensor 3)',
    P0145:'Sensor de oxígeno (O2) — respuesta lenta (Banco 1 Sensor 3)',
    P0146:'Sensor de oxígeno (O2) — sin actividad (Banco 1 Sensor 3)',
    P0147:'Calentador del Sensor de oxígeno (O2) — falla (Banco 1 Sensor 3)',
    P0150:'Sensor de oxígeno (O2) — falla (Banco 2 Sensor 1)',
    P0151:'Sensor de oxígeno (O2) — voltaje bajo (Banco 2 Sensor 1)',
    P0152:'Sensor de oxígeno (O2) — voltaje alto (Banco 2 Sensor 1)',
    P0153:'Sensor de oxígeno (O2) — respuesta lenta (Banco 2 Sensor 1)',
    P0154:'Sensor de oxígeno (O2) — sin actividad (Banco 2 Sensor 1)',
    P0155:'Calentador del Sensor de oxígeno (O2) — falla (Banco 2 Sensor 1)',
    P0156:'Sensor de oxígeno (O2) — falla (Banco 2 Sensor 2)',
    P0157:'Sensor de oxígeno (O2) — voltaje bajo (Banco 2 Sensor 2)',
    P0158:'Sensor de oxígeno (O2) — voltaje alto (Banco 2 Sensor 2)',
    P0159:'Sensor de oxígeno (O2) — respuesta lenta (Banco 2 Sensor 2)',
    P0160:'Sensor de oxígeno (O2) — sin actividad (Banco 2 Sensor 2)',
    P0161:'Calentador del Sensor de oxígeno (O2) — falla (Banco 2 Sensor 2)',
    P0162:'Sensor de oxígeno (O2) — falla (Banco 2 Sensor 3)',
    P0163:'Sensor de oxígeno (O2) — voltaje bajo (Banco 2 Sensor 3)',
    P0164:'Sensor de oxígeno (O2) — voltaje alto (Banco 2 Sensor 3)',
    P0165:'Sensor de oxígeno (O2) — respuesta lenta (Banco 2 Sensor 3)',
    P0166:'Sensor de oxígeno (O2) — sin actividad (Banco 2 Sensor 3)',
    P0167:'Calentador del Sensor de oxígeno (O2) — falla (Banco 2 Sensor 3)',
    P0170:'Ajuste de combustible — falla (Banco 1)',
    P0171:'Mezcla muy pobre (Banco 1)',
    P0172:'Mezcla muy rica (Banco 1)',
    P0173:'Ajuste de combustible — falla (Banco 2)',
    P0174:'Mezcla muy pobre (Banco 2)',
    P0175:'Mezcla muy rica (Banco 2)',
    P0176:'Combustible composición Sensor — falla',
    P0177:'Combustible composición Sensor — rango/desempeño fuera de especificación',
    P0178:'Combustible composición Sensor — señal baja',
    P0179:'Combustible composición Sensor — señal alta',
    P0180:'Sensor de temperatura de combustible A — falla',
    P0181:'Sensor de temperatura de combustible A — rango/desempeño fuera de especificación',
    P0182:'Sensor de temperatura de combustible A — señal baja',
    P0183:'Sensor de temperatura de combustible A — señal alta',
    P0184:'Sensor de temperatura de combustible A — señal intermitente',
    P0185:'Sensor de temperatura de combustible B — falla',
    P0186:'Sensor de temperatura de combustible B — rango/desempeño fuera de especificación',
    P0187:'Sensor de temperatura de combustible B — señal baja',
    P0188:'Sensor de temperatura de combustible B — señal alta',
    P0189:'Sensor de temperatura de combustible B — señal intermitente',
    P0190:'Sensor de presión del riel de combustible — falla',
    P0191:'Sensor de presión del riel de combustible — rango/desempeño fuera de especificación',
    P0192:'Sensor de presión del riel de combustible — señal baja',
    P0193:'Sensor de presión del riel de combustible — señal alta',
    P0194:'Sensor de presión del riel de combustible — señal intermitente',
    P0195:'Sensor de temperatura del aceite — falla',
    P0196:'Sensor de temperatura del aceite — rango/desempeño fuera de especificación',
    P0197:'Sensor de temperatura del aceite bajo',
    P0198:'Sensor de temperatura del aceite alto',
    P0199:'Sensor de temperatura del aceite — intermitente',
    P0200:'Circuito de inyectores',
    P0201:'Circuito inyector cilindro 1',
    P0202:'Circuito inyector cilindro 2',
    P0203:'Circuito inyector cilindro 3',
    P0204:'Circuito inyector cilindro 4',
    P0205:'Circuito del inyector — falla - Cilindro 5',
    P0206:'Circuito del inyector — falla - Cilindro 6',
    P0207:'Circuito del inyector — falla - Cilindro 7',
    P0208:'Circuito del inyector — falla - Cilindro 8',
    P0209:'Circuito del inyector — falla - Cilindro 9',
    P0210:'Circuito del inyector — falla - Cilindro 10',
    P0211:'Circuito del inyector — falla - Cilindro 11',
    P0212:'Circuito del inyector — falla - Cilindro 12',
    P0213:'Inyector de arranque en frío 1 — falla',
    P0214:'Inyector de arranque en frío 2 — falla',
    P0215:'Motor corte Solenoide — falla',
    P0216:'Control de sincronización de inyección — falla',
    P0217:'Sobretemperatura del Motor condición',
    P0218:'Transmisión sobretemperatura condición',
    P0219:'Motor sobrevelocidad condición',
    P0220:'Sensor/interruptor de posición del acelerador (TPS) B — falla',
    P0221:'Sensor/interruptor de posición del acelerador (TPS) B — rango/desempeño fuera de especificación',
    P0222:'Sensor/interruptor de posición del acelerador (TPS) B — señal baja',
    P0223:'Sensor/interruptor de posición del acelerador (TPS) B — señal alta',
    P0224:'Sensor/interruptor de posición del acelerador (TPS) B — señal intermitente',
    P0225:'Sensor/interruptor de posición del acelerador (TPS) C — falla',
    P0226:'Sensor/interruptor de posición del acelerador (TPS) C — rango/desempeño fuera de especificación',
    P0227:'Sensor/interruptor de posición del acelerador (TPS) C — señal baja',
    P0228:'Sensor/interruptor de posición del acelerador (TPS) C — señal alta',
    P0229:'Sensor/interruptor de posición del acelerador (TPS) C — señal intermitente',
    P0230:'Bomba de combustible primario — falla',
    P0231:'Bomba de combustible secundario — señal baja',
    P0232:'Bomba de combustible secundario — señal alta',
    P0233:'Bomba de combustible secundario — señal intermitente',
    P0234:'Motor sobrepresión de turbo condición',
    P0235:'Sensor de presión de turbo A — falla',
    P0236:'Sensor de presión de turbo A — rango/desempeño fuera de especificación',
    P0237:'Sensor de presión de turbo A — señal baja',
    P0238:'Sensor de presión de turbo A — señal alta',
    P0239:'Sensor de presión de turbo B — falla',
    P0240:'Sensor de presión de turbo B — rango/desempeño fuera de especificación',
    P0241:'Sensor de presión de turbo B — señal baja',
    P0242:'Sensor de presión de turbo B — señal alta',
    P0243:'Wastegate del turbo Solenoide A — falla',
    P0244:'Wastegate del turbo Solenoide A — rango/desempeño fuera de especificación',
    P0245:'Wastegate del turbo Solenoide A bajo',
    P0246:'Wastegate del turbo Solenoide A alto',
    P0247:'Wastegate del turbo Solenoide B — falla',
    P0248:'Wastegate del turbo Solenoide B — rango/desempeño fuera de especificación',
    P0249:'Wastegate del turbo Solenoide B bajo',
    P0250:'Wastegate del turbo Solenoide B alto',
    P0251:'Control de dosificación de la bomba de inyección "A" — falla (árbol de levas/rotor/Inyector)',
    P0252:'Control de dosificación de la bomba de inyección "A" — rango/desempeño fuera de especificación (árbol de levas/rotor/Inyector)',
    P0253:'Control de dosificación de la bomba de inyección "A" bajo (árbol de levas/rotor/Inyector)',
    P0254:'Control de dosificación de la bomba de inyección "A" alto (árbol de levas/rotor/Inyector)',
    P0255:'Control de dosificación de la bomba de inyección "A" — intermitente (árbol de levas/rotor/Inyector)',
    P0256:'Control de dosificación de la bomba de inyección "B" — falla (árbol de levas/rotor/Inyector)',
    P0257:'Control de dosificación de la bomba de inyección "B" — rango/desempeño fuera de especificación (árbol de levas/rotor/Inyector)',
    P0258:'Control de dosificación de la bomba de inyección "B" bajo (árbol de levas/rotor/Inyector)',
    P0259:'Control de dosificación de la bomba de inyección "B" alto (árbol de levas/rotor/Inyector)',
    P0260:'Control de dosificación de la bomba de inyección "B" — intermitente (árbol de levas/rotor/Inyector)',
    P0261:'Cilindro 1 Circuito del inyector bajo',
    P0262:'Cilindro 1 Circuito del inyector alto',
    P0263:'Cilindro 1 Contribución/ — desbalance',
    P0264:'Cilindro 2 Circuito del inyector bajo',
    P0265:'Cilindro 2 Circuito del inyector alto',
    P0266:'Cilindro 2 Contribución/ — desbalance',
    P0267:'Cilindro 3 Circuito del inyector bajo',
    P0268:'Cilindro 3 Circuito del inyector alto',
    P0269:'Cilindro 3 Contribución/ — desbalance',
    P0270:'Cilindro 4 Circuito del inyector bajo',
    P0271:'Cilindro 4 Circuito del inyector alto',
    P0272:'Cilindro 4 Contribución/ — desbalance',
    P0273:'Cilindro 5 Circuito del inyector bajo',
    P0274:'Cilindro 5 Circuito del inyector alto',
    P0275:'Cilindro 5 Contribución/ — desbalance',
    P0276:'Cilindro 6 Circuito del inyector bajo',
    P0277:'Cilindro 6 Circuito del inyector alto',
    P0278:'Cilindro 6 Contribución/ — desbalance',
    P0279:'Cilindro 7 Circuito del inyector bajo',
    P0280:'Cilindro 7 Circuito del inyector alto',
    P0281:'Cilindro 7 Contribución/ — desbalance',
    P0282:'Cilindro 8 Circuito del inyector bajo',
    P0283:'Cilindro 8 Circuito del inyector alto',
    P0284:'Cilindro 8 Contribución/ — desbalance',
    P0285:'Cilindro 9 Circuito del inyector bajo',
    P0286:'Cilindro 9 Circuito del inyector alto',
    P0287:'Cilindro 9 Contribución/ — desbalance',
    P0288:'Cilindro 10 Circuito del inyector bajo',
    P0289:'Cilindro 10 Circuito del inyector alto',
    P0290:'Cilindro 10 Contribución/ — desbalance',
    P0291:'Cilindro 11 Circuito del inyector bajo',
    P0292:'Cilindro 11 Circuito del inyector alto',
    P0293:'Cilindro 11 Contribución/ — desbalance',
    P0294:'Cilindro 12 Circuito del inyector bajo',
    P0295:'Cilindro 12 Circuito del inyector alto',
    P0296:'Cilindro 12 — contribución/rango fuera de especificación',
    P02D1:'Aprendizaje de offset de inyector de combustible cilindro 5 (o desbalance de inyección) en límite máximo',
    C0004:'Subfalla de válvula de control del líquido de frenos / Solenoide ABS',
    C1555:'Falla del relé o circuito del motor de la dirección asistida eléctrica (MDPS / EPS Hyundai/Kia)',
    U2055:'Pérdida de comunicación en red CAN / Nodo de bus de comunicación del módulo dinámico',
    P0300:'Fallo de encendido múltiple/aleatorio (misfire)',
    P0301:'Fallo de encendido cilindro 1',
    P0302:'Fallo de encendido cilindro 2',
    P0303:'Fallo de encendido cilindro 3',
    P0304:'Fallo de encendido cilindro 4',
    P0305:'Fallo de encendido cilindro 5',
    P0306:'Fallo de encendido cilindro 6',
    P0307:'Fallo de encendido en cilindro 7 detectado',
    P0308:'Fallo de encendido en cilindro 8 detectado',
    P0309:'Fallo de encendido en cilindro 9 detectado',
    P0311:'Fallo de encendido en cilindro 11 detectado',
    P0312:'Fallo de encendido en cilindro 12 detectado',
    P0320:'Señal de RPM de encendido/distribuidor — falla',
    P0321:'Señal de RPM de encendido/distribuidor — rango/desempeño fuera de especificación',
    P0322:'Señal de RPM de encendido/distribuidor — sin señal',
    P0323:'Señal de RPM de encendido/distribuidor — señal intermitente',
    P0325:'Circuito sensor de detonación (knock)',
    P0326:'Sensor de detonación (knock) 1 — rango/desempeño fuera de especificación (Banco 1 o Sensor único)',
    P0327:'Sensor de detonación (knock) 1 — señal baja (Banco 1 o Sensor único)',
    P0328:'Sensor de detonación (knock) 1 — señal alta (Banco 1 o Sensor único)',
    P0329:'Sensor de detonación (knock) 1 — señal intermitente (Banco 1 o Sensor único)',
    P0330:'Sensor de detonación (knock) 2 — falla (Banco 2)',
    P0331:'Sensor de detonación (knock) 2 — rango/desempeño fuera de especificación (Banco 2)',
    P0332:'Sensor de detonación (knock) 2 — señal baja (Banco 2)',
    P0333:'Sensor de detonación (knock) 2 — señal alta (Banco 2)',
    P0334:'Sensor de detonación (knock) 2 — señal intermitente (Banco 2)',
    P0335:'Circuito sensor posición cigüeñal (CKP)',
    P0336:'Sensor de posición del cigüeñal (CKP) A — rango/desempeño fuera de especificación',
    P0337:'Sensor de posición del cigüeñal (CKP) A — señal baja',
    P0338:'Sensor de posición del cigüeñal (CKP) A — señal alta',
    P0339:'Sensor de posición del cigüeñal (CKP) A — señal intermitente',
    P0340:'Circuito sensor posición árbol de levas (CMP)',
    P0341:'Sensor de posición del árbol de levas (CMP) — rango/desempeño fuera de especificación',
    P0342:'Sensor de posición del árbol de levas (CMP) — señal baja',
    P0343:'Sensor de posición del árbol de levas (CMP) — señal alta',
    P0344:'Sensor de posición del árbol de levas (CMP) — señal intermitente',
    P0350:'Bobina de encendido primario/secundario — falla',
    P0351:'Bobina de encendido A primario/secundario — falla',
    P0352:'Bobina de encendido B primario/secundario — falla',
    P0353:'Bobina de encendido C primario/secundario — falla',
    P0354:'Bobina de encendido D primario/secundario — falla',
    P0355:'Bobina de encendido E primario/secundario — falla',
    P0356:'Bobina de encendido F primario/secundario — falla',
    P0357:'Bobina de encendido G primario/secundario — falla',
    P0358:'Bobina de encendido H primario/secundario — falla',
    P0359:'Bobina de encendido I primario/secundario — falla',
    P0360:'Bobina de encendido J primario/secundario — falla',
    P0361:'Bobina de encendido K primario/secundario — falla',
    P0362:'Bobina de encendido L primario/secundario — falla',
    P0370:'Señal de referencia de sincronización de alta resolución A — falla',
    P0371:'Señal de referencia de sincronización de alta resolución A — demasiados pulsos',
    P0372:'Señal de referencia de sincronización de alta resolución A — pulsos insuficientes',
    P0373:'Señal de referencia de sincronización de alta resolución A — intermitente/errático Pulsos',
    P0374:'Señal de referencia de sincronización de alta resolución A sin Pulsos',
    P0375:'Señal de referencia de sincronización de alta resolución B — falla',
    P0376:'Señal de referencia de sincronización de alta resolución B — demasiados pulsos',
    P0377:'Señal de referencia de sincronización de alta resolución B — pulsos insuficientes',
    P0378:'Señal de referencia de sincronización de alta resolución B — intermitente/errático Pulsos',
    P0379:'Señal de referencia de sincronización de alta resolución B sin Pulsos',
    P0380:'Bujía incandescente/Calentador "A" — falla',
    P0381:'Bujía incandescente/Calentador indicador — falla',
    P0382:'Recirculación de gases de escape (EGR) Flujo — falla',
    P0385:'Sensor de posición del cigüeñal (CKP) B — falla',
    P0386:'Sensor de posición del cigüeñal (CKP) B — rango/desempeño fuera de especificación',
    P0387:'Sensor de posición del cigüeñal (CKP) B — señal baja',
    P0388:'Sensor de posición del cigüeñal (CKP) B — señal alta',
    P0389:'Sensor de posición del cigüeñal (CKP) B — señal intermitente',
    P0400:'Flujo de recirculación de gases EGR',
    P0401:'Flujo EGR insuficiente',
    P0402:'Flujo EGR excesivo',
    P0403:'Circuito de control EGR',
    P0404:'Recirculación de gases de escape (EGR) — rango/desempeño fuera de especificación',
    P0405:'Recirculación de gases de escape (EGR) Sensor A — señal baja',
    P0406:'Recirculación de gases de escape (EGR) Sensor A — señal alta',
    P0407:'Recirculación de gases de escape (EGR) Sensor B — señal baja',
    P0408:'Recirculación de gases de escape (EGR) Sensor B — señal alta',
    P0410:'Sistema de inyección de aire secundario — falla',
    P0411:'Sistema de inyección de aire secundario incorrecto Flujo detectado',
    P0412:'Sistema de inyección de aire secundario conmutación Válvula A — falla',
    P0413:'Sistema de inyección de aire secundario conmutación Válvula A — abierto',
    P0414:'Sistema de inyección de aire secundario conmutación Válvula A — en corto',
    P0415:'Sistema de inyección de aire secundario conmutación Válvula B — falla',
    P0416:'Sistema de inyección de aire secundario conmutación Válvula B — abierto',
    P0417:'Sistema de inyección de aire secundario conmutación Válvula B — en corto',
    P0418:'Sistema de inyección de aire secundario Relé ‘A" — falla',
    P0419:'Sistema de inyección de aire secundario Relé "B’ — falla',
    P0420:'Eficiencia del catalizador bajo el umbral (Banco 1)',
    P0421:'Eficiencia del catalizador de arranque bajo el umbral (Banco 1)',
    P0422:'Eficiencia del catalizador principal bajo el umbral (Banco 1)',
    P0423:'calentado Catalizador Eficiencia bajo el umbral (Banco 1)',
    P0424:'calentado Catalizador Temperatura bajo el umbral (Banco 1)',
    P0430:'Eficiencia del catalizador bajo el umbral (Banco 2)',
    P0431:'Eficiencia del catalizador de arranque bajo el umbral (Banco 2)',
    P0432:'Eficiencia del catalizador principal bajo el umbral (Banco 2)',
    P0433:'calentado Catalizador Eficiencia bajo el umbral (Banco 2)',
    P0434:'calentado Catalizador Temperatura bajo el umbral (Banco 2)',
    P0440:'Sistema evaporativo EVAP',
    P0441:'Flujo de purga EVAP incorrecto',
    P0442:'Fuga pequeña en sistema EVAP',
    P0443:'Circuito válvula de purga EVAP',
    P0444:'Sistema de emisiones evaporativas (EVAP) Válvula de purga',
    P0445:'Sistema de emisiones evaporativas (EVAP) Válvula de purga — en corto',
    P0446:'Circuito de venteo EVAP',
    P0447:'Sistema de emisiones evaporativas (EVAP) Control de ventilación — abierto',
    P0448:'Sistema de emisiones evaporativas (EVAP) Control de ventilación — en corto',
    P0449:'Sistema de emisiones evaporativas (EVAP) Ventilación Válvula/Solenoide — falla',
    P0450:'Sensor de presión del sistema EVAP — falla',
    P0451:'Sensor de presión del sistema EVAP — rango/desempeño fuera de especificación',
    P0452:'Sensor de presión del sistema EVAP — señal baja',
    P0453:'Sensor de presión del sistema EVAP — señal alta',
    P0454:'Sensor de presión del sistema EVAP — intermitente',
    P0455:'Fuga grande en sistema EVAP',
    P0456:'Fuga muy pequeña en sistema EVAP',
    P0460:'Sensor de nivel de combustible — falla',
    P0461:'Sensor de nivel de combustible — rango/desempeño fuera de especificación',
    P0462:'Sensor de nivel de combustible — señal baja',
    P0463:'Sensor de nivel de combustible — señal alta',
    P0464:'Sensor de nivel de combustible — señal intermitente',
    P0465:'Purga Flujo Sensor — falla',
    P0466:'Purga Flujo Sensor — rango/desempeño fuera de especificación',
    P0467:'Purga Flujo Sensor — señal baja',
    P0468:'Purga Flujo Sensor — señal alta',
    P0469:'Purga Flujo Sensor — señal intermitente',
    P0470:'Escape Presión Sensor — falla',
    P0471:'Escape Presión Sensor — rango/desempeño fuera de especificación',
    P0472:'Escape Presión Sensor bajo',
    P0473:'Escape Presión Sensor alto',
    P0474:'Escape Presión Sensor — intermitente',
    P0475:'Escape Presión Control Válvula — falla',
    P0476:'Escape Presión Control Válvula — rango/desempeño fuera de especificación',
    P0477:'Escape Presión Control Válvula bajo',
    P0478:'Escape Presión Control Válvula alto',
    P0479:'Escape Presión Control Válvula — intermitente',
    P0480:'Electroventilador I Control — falla',
    P0481:'Electroventilador 2 Control — falla',
    P0482:'Electroventilador 3 Control — falla',
    P0483:'Electroventilador racionalidad revisión — falla',
    P0484:'Electroventilador sobre corriente',
    P0485:'Electroventilador Alimentación/Tierra — falla',
    P0500:'Sensor de velocidad del vehículo (VSS)',
    P0501:'Sensor de velocidad del vehículo (VSS) — rango/desempeño fuera de especificación',
    P0502:'Sensor de velocidad del vehículo (VSS) — señal baja',
    P0503:'Sensor de velocidad del vehículo (VSS) — intermitente/errático/alto',
    P0505:'Sistema de control de ralentí',
    P0506:'Ralentí más bajo de lo esperado',
    P0507:'Ralentí más alto de lo esperado',
    P0510:'cerrado Posición del acelerador Interruptor — falla',
    P0520:'Motor Aceite Presión Sensor/Interruptor — falla',
    P0521:'Motor Aceite Presión Sensor/Interruptor — rango/desempeño fuera de especificación',
    P0522:'Motor Aceite Presión Sensor/Interruptor — voltaje bajo',
    P0523:'Motor Aceite Presión Sensor/Interruptor — voltaje alto',
    P0530:'Sensor de presión del refrigerante A/C — falla',
    P0531:'Sensor de presión del refrigerante A/C — rango/desempeño fuera de especificación',
    P0532:'Sensor de presión del refrigerante A/C — señal baja',
    P0533:'Sensor de presión del refrigerante A/C — señal alta',
    P0534:'Aire acondicionado Refrigerante carga pérdida',
    P0550:'Sensor de presión de dirección hidráulica — falla',
    P0551:'Sensor de presión de dirección hidráulica — rango/desempeño fuera de especificación',
    P0552:'Sensor de presión de dirección hidráulica — señal baja',
    P0553:'Sensor de presión de dirección hidráulica — señal alta',
    P0554:'Sensor de presión de dirección hidráulica — señal intermitente',
    P0560:'Voltaje del sistema — falla',
    P0561:'Voltaje del sistema inestable',
    P0562:'Voltaje del sistema bajo (alternador/batería)',
    P0563:'Voltaje del sistema alto',
    P0565:'Control crucero encendido Señal — falla',
    P0566:'Control crucero apagado Señal — falla',
    P0567:'Control crucero reanudar Señal — falla',
    P0568:'Control crucero fijar Señal — falla',
    P0569:'Control crucero desaceleración Señal — falla',
    P0570:'Control crucero aceleración Señal — falla',
    P0571:'Control crucero/Interruptor de freno A — falla',
    P0572:'Control crucero/Interruptor de freno A — señal baja',
    P0573:'Control crucero/Interruptor de freno A — señal alta',
    P0574:'Control crucero relacionado — falla',
    P0575:'Control crucero relacionado — falla',
    P0576:'Control crucero relacionado — falla',
    P0578:'Control crucero relacionado — falla',
    P0579:'Control crucero relacionado — falla',
    P0580:'Control crucero relacionado — falla',
    P0600:'Enlace de comunicación serial — falla',
    P0601:'Memoria de la computadora (ECU) — checksum',
    P0602:'Módulo de Control programación error',
    P0603:'Memoria KAM de la ECU',
    P0604:'Módulo de Control interno Memoria RAM (RAM) error',
    P0605:'Memoria ROM de la ECU',
    P0606:'PCM Procesador falla',
    P0608:'Módulo de Control VSS salida "A’ — falla',
    P0609:'Módulo de Control VSS salida "B" — falla',
    P0620:'Alternador Control — falla',
    P0621:'Alternador Testigo "L" Control — falla',
    P0622:'Alternador campo "F" Control — falla',
    P0650:'Testigo de falla (MIL) (MIL) Control — falla',
    P0654:'Motor RPM salida — falla',
    P0655:'Motor caliente Testigo salida Control — falla',
    P0656:'Combustible Nivel salida — falla',
    P0700:'Sistema de control de la transmisión',
    P0701:'Sistema de Control de la transmisión — rango/desempeño fuera de especificación',
    P0702:'Sistema de Control de la transmisión eléctrico',
    P0703:'Convertidor de par/Interruptor de freno B — falla',
    P0704:'Interruptor de embrague entrada — falla',
    P0705:'Circuito sensor de rango de transmisión',
    P0706:'Sensor de rango de transmisión — rango/desempeño fuera de especificación',
    P0707:'Sensor de rango de transmisión — señal baja',
    P0708:'Sensor de rango de transmisión — señal alta',
    P0709:'Sensor de rango de transmisión — señal intermitente',
    P0710:'Sensor de temperatura del aceite de transmisión — falla',
    P0711:'Sensor de temperatura del aceite de transmisión — rango/desempeño fuera de especificación',
    P0712:'Sensor de temperatura del aceite de transmisión — señal baja',
    P0713:'Sensor de temperatura del aceite de transmisión — señal alta',
    P0714:'Sensor de temperatura del aceite de transmisión — señal intermitente',
    P0715:'Circuito sensor de turbina',
    P0716:'entrada/Sensor de velocidad de turbina — rango/desempeño fuera de especificación',
    P0717:'entrada/Sensor de velocidad de turbina — sin señal',
    P0718:'entrada/Sensor de velocidad de turbina — señal intermitente',
    P0719:'Convertidor de par/Interruptor de freno B — señal baja',
    P0720:'Circuito sensor de velocidad de salida',
    P0721:'Sensor de velocidad de salida — rango/desempeño fuera de especificación',
    P0722:'Sensor de velocidad de salida — sin señal',
    P0723:'Sensor de velocidad de salida — intermitente',
    P0724:'Convertidor de par/Interruptor de freno B — señal alta',
    P0725:'Señal de RPM del Motor — falla',
    P0726:'Señal de RPM del Motor — rango/desempeño fuera de especificación',
    P0727:'Señal de RPM del Motor — sin señal',
    P0728:'Señal de RPM del Motor — señal intermitente',
    P0730:'Relación de cambio incorrecta',
    P0731:'Relación incorrecta en 1ª marcha',
    P0732:'Relación incorrecta en 2ª marcha',
    P0733:'Relación incorrecta en 3ª marcha',
    P0734:'Relación incorrecta en 4ª marcha',
    P0735:'Relación incorrecta en 5ª marcha',
    P0736:'Relación incorrecta en reversa',
    P0740:'Circuito embrague convertidor de torque',
    P0741:'Convertidor de torque atascado',
    P0742:'Convertidor de par Embrague — atascado encendido',
    P0743:'Convertidor de par Embrague eléctrico',
    P0744:'Convertidor de par Embrague — señal intermitente',
    P0745:'Solenoide de Control de presión — falla',
    P0746:'Solenoide de Control de presión desempeño o atascado apagado',
    P0747:'Solenoide de Control de presión — atascado encendido',
    P0748:'Solenoide de Control de presión eléctrico',
    P0749:'Solenoide de Control de presión — intermitente',
    P0750:'Solenoide de cambio A',
    P0751:'Solenoide de cambio A desempeño o atascado apagado',
    P0752:'Solenoide de cambio A — atascado encendido',
    P0753:'Solenoide de cambio A eléctrico',
    P0754:'Solenoide de cambio A — intermitente',
    P0755:'Solenoide de cambio B',
    P0756:'Solenoide de cambio B desempeño o atascado apagado',
    P0757:'Solenoide de cambio B — atascado encendido',
    P0758:'Solenoide de cambio B eléctrico',
    P0759:'Solenoide de cambio B — intermitente',
    P0760:'Solenoide de cambio C — falla',
    P0761:'Solenoide de cambio C desempeño o atascado apagado',
    P0762:'Solenoide de cambio C — atascado encendido',
    P0763:'Solenoide de cambio C eléctrico',
    P0764:'Solenoide de cambio C — intermitente',
    P0765:'Solenoide de cambio D — falla',
    P0766:'Solenoide de cambio D desempeño o atascado apagado',
    P0767:'Solenoide de cambio D — atascado encendido',
    P0768:'Solenoide de cambio D eléctrico',
    P0769:'Solenoide de cambio D — intermitente',
    P0770:'Solenoide de cambio E — falla',
    P0771:'Solenoide de cambio E desempeño o atascado apagado',
    P0772:'Solenoide de cambio E — atascado encendido',
    P0773:'Solenoide de cambio E eléctrico',
    P0774:'Solenoide de cambio E — intermitente',
    P0780:'Cambio — falla',
    P0781:'Cambio 1-2 — falla',
    P0782:'Cambio 2-3 — falla',
    P0783:'Cambio 3-4 — falla',
    P0784:'Cambio 4-5 — falla',
    P0785:'Solenoide de cambio/sincronización — falla',
    P0786:'Solenoide de cambio/sincronización — rango/desempeño fuera de especificación',
    P0787:'Solenoide de cambio/sincronización bajo',
    P0788:'Solenoide de cambio/sincronización alto',
    P0789:'Solenoide de cambio/sincronización — intermitente',
    P0790:'Interruptor normal/desempeño — falla',
    P0801:'Control de inhibición de reversa — falla',
    P0803:'Solenoide de salto de cambio 1-4 — falla',
    P0804:'Testigo de salto de cambio 1-4 — falla',
    U0100:'Sin comunicación con la ECU del motor',
    U0101:'Sin comunicación con la TCM (transmisión)',
    U0121:'Sin comunicación con el módulo ABS',
    U0155:'Sin comunicación con el tablero',
  },
  /* ═══════════ MEMORIA DEL TALLER ═══════════
     Los manuales y NHTSA cubren el mercado de EE.UU.: el Hilux, el Canter y casi
     todo lo importado de Japón o Corea no están en ninguna de esas fuentes. Lo
     único que va a cubrir esos vehículos es lo que este taller ya resolvió, así
     que la bitácora se consulta durante el escaneo y se alimenta desde ahí. */
  async pintarBitacora(s) {
    const el = document.getElementById('obd-bitacora');
    if (!el) return;
    const v = (this._vehiculos || []).find(x => x.id === s.vehiculo_id);
    const marca = s.nhtsa?.marca || v?.marca || null;
    const modelo = s.nhtsa?.modelo || v?.modelo || null;
    const codigos = [...(s.dtcs || []), ...(s.dtcs_pendientes || [])].map(d => d.codigo);
    let filas = [];
    try { filas = await DB.getBitacoraRelacionada(codigos, marca, modelo); } catch (_) { filas = []; }

    const prellenado = JSON.stringify({
      dtc_codigos: codigos,
      marca: marca || '', modelo: modelo || '',
      categoria: this._catBitacora(codigos[0]),
      titulo: codigos.length ? `${codigos[0]} — ${this._descDTC(codigos[0], null)}`.slice(0, 120) : '',
    }).replace(/"/g, '&quot;');
    const btnNueva = `<button class="btn btn-sm btn-brand" onclick="Modulos.diagnostico_obd.guardarEnBitacora(${prellenado})">➕ Guardar lo que resolvimos</button>`;

    el.innerHTML = `<div class="card" style="padding:14px;margin-top:12px;border-left:3px solid var(--green)">
      <b style="font-size:12px">📖 LO QUE ESTE TALLER YA RESOLVIÓ</b>
      ${filas.length ? `
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px">
          ${filas.slice(0, 8).map(b => `
            <div style="border:1px solid var(--border);border-radius:8px;padding:8px;cursor:pointer"
                 onclick="Modulos.bitacora.ver('${UI.esc(b.id)}')">
              <div style="font-size:12.5px;font-weight:800">${UI.esc(b.titulo)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">
                ${UI.esc(b.motivo === 'codigo' ? '🎯 mismo código' : '🚗 mismo modelo')}
                ${(b.dtc_codigos || []).length ? ` · ${UI.esc((b.dtc_codigos || []).join(', '))}` : ''}
                ${b.veces_ejecutada > 1 ? ` · resuelto ${b.veces_ejecutada}×` : ''}
                ${b.creado_por_nombre ? ` · ${UI.esc(b.creado_por_nombre)}` : ''}
              </div>
              ${b.sintoma ? `<div style="font-size:11.5px;color:var(--text2);margin-top:2px">${UI.esc(b.sintoma)}</div>` : ''}
            </div>`).join('')}
        </div>
        <div style="margin-top:8px">${btnNueva}</div>`
      : `<div style="font-size:12px;color:var(--text3);margin-top:4px">
          Nada registrado todavía para estos códigos ni para este modelo.
          Cuando lo resuelvan, guardarlo acá hace que el próximo que vea este código lo encuentre hecho.
        </div>
        <div style="margin-top:8px">${btnNueva}</div>`}
    </div>`;
  },

  /* La categoría se deduce de la familia del código para no hacerlo escribir */
  _catBitacora(codigo) {
    if (!codigo) return 'general';
    if (codigo[0] === 'U') return 'electrico';
    if (codigo[0] === 'C') return 'frenos';
    if (codigo[0] === 'B') return 'carroceria';
    const fam = codigo.slice(1, 3);
    if (['03'].includes(fam)) return 'motor';
    if (['01', '02'].includes(fam)) return 'combustible';
    if (['04'].includes(fam)) return 'escape';
    if (['07', '08', '09'].includes(fam)) return 'transmision';
    if (['05', '06'].includes(fam)) return 'electrico';
    return 'motor';
  },

  guardarEnBitacora(prellenado) {
    if (!Modulos.bitacora) return UI.toast('El módulo de bitácora no está disponible', 'error');
    Modulos.bitacora.modalNueva(prellenado || {});
  },

  /* ═══════════ GUÍA DE DIAGNÓSTICO ═══════════
     Un código NO dice qué pieza cambiar: dice qué monitor salió fuera de rango.
     Por eso cada guía trae qué medir ANTES de comprar nada, y las causas en orden
     de probabilidad y costo (primero lo barato y común). Cubre los códigos que de
     verdad entran al taller; el resto muestra solo la descripción.
     sev: informativa | atencion | alta | critica  (si puede seguir manejando) */
  _GUIA: {
    P0011: { sev:'atencion', sint:'Ralentí inestable, falta de potencia, a veces ruido de cadena en frío.',
      causas:['Aceite sucio, viejo o con nivel bajo (causa más común)','Malla/filtro del solenoide VVT (OCV) tapada','Solenoide VVT con falla eléctrica','Cadena o tensor de tiempo estirados','Sensor de árbol de levas'],
      medir:'Revisá nivel y estado del aceite ANTES que nada: el VVT trabaja con presión de aceite y un aceite pasado reproduce este código. Después compará en datos en vivo el ángulo de leva comandado contra el real, y medí la resistencia del solenoide.' },
    P0016: { sev:'alta', sint:'Arranque difícil o no arranca, tironeo, pérdida de potencia.',
      causas:['Cadena/banda de tiempo saltada o estirada','Tensor de cadena vencido','Rueda dentada o reluctor dañado','Sensor CKP o CMP','Actuador VVT atascado'],
      medir:'Verificá la sincronización mecánica con las marcas antes de tocar sensores. Cambiar el CKP por este código sin revisar el tiempo es el error clásico. Con osciloscopio, comparar la señal de cigüeñal contra la de levas.' },
    P0101: { sev:'atencion', sint:'Falta de potencia, consumo alto, ralentí irregular, tirones al acelerar.',
      causas:['Filtro de aire sucio o mal asentado','MAF sucio (típico con filtros de alto flujo aceitados)','Fuga de aire entre el MAF y el múltiple','Ducto de admisión roto o flojo','MAF dañado'],
      medir:'Mirá los g/s en vivo: en ralentí un motor de 2.0L ronda 3–5 g/s y a 2500 rpm sube proporcional. Si el valor es bajo, limpiá el MAF con limpiador específico antes de comprar uno: se recupera seguido.' },
    P0102: { sev:'atencion', sint:'Falta de potencia, humo, motor que se apaga.', causas:['Ducto de admisión desconectado o roto','MAF sucio','Conector o cableado del MAF','MAF dañado'],
      medir:'Revisá el ducto completo del filtro al múltiple. Con el conector puesto, medí la señal del MAF acelerando: debe subir parejo.' },
    P0106: { sev:'atencion', sint:'Ralentí irregular, respuesta pobre.', causas:['Manguera de vacío rota, floja o tapada','Sensor MAP sucio de carbón','Fuga en el múltiple de admisión','Sensor MAP dañado'],
      medir:'Con el motor apagado, el MAP debe leer casi lo mismo que la presión barométrica. Si no coincide, el sensor miente. En ralentí debe marcar vacío alto y estable.' },
    P0113: { sev:'informativa', sint:'Arranque en frío difícil, consumo levemente alto.', causas:['Conector del sensor IAT suelto o con falso contacto','Cableado abierto','Sensor IAT dañado'],
      medir:'Con el motor frío, la temperatura de aire debe leer parecida a la ambiente. Puenteando el conector la lectura debe irse al otro extremo: si lo hace, el problema es el sensor, no el cableado.' },
    P0117: { sev:'atencion', sint:'Ventilador siempre encendido, mezcla rica, consumo alto.', causas:['Sensor ECT en corto','Cableado rozado','Conector con agua o verdín'],
      medir:'Compará la temperatura del refrigerante en vivo contra un termómetro infrarrojo en la culata. Si difieren mucho, el sensor miente.' },
    P0118: { sev:'atencion', sint:'Arranque en frío difícil, ventilador que no arranca.', causas:['Circuito abierto del sensor ECT','Conector desconectado','Sensor dañado'],
      medir:'Igual que P0117: comparar contra termómetro. Ojo con el nivel de refrigerante bajo, que deja el sensor sin contacto con el líquido.' },
    P0128: { sev:'atencion', sint:'El motor tarda en calentar, calefacción tibia, consumo alto.', causas:['Termostato pegado abierto (causa más común)','Nivel de refrigerante bajo','Sensor ECT mintiendo','Ventilador que corre de más'],
      medir:'Cronometrá cuánto tarda en llegar a temperatura de trabajo y palpá la manguera superior. Si el motor nunca pasa de media temperatura, es termostato.' },
    P0131: { sev:'atencion', sint:'Consumo alto, ralentí inestable.', causas:['Fuga de escape antes del sensor (entra aire y lo hace leer pobre)','Sensor contaminado','Mezcla realmente pobre','Cableado del sensor'],
      medir:'Buscá fugas de escape antes de condenar el sensor. En vivo, un O2 sano oscila entre 0.1 y 0.9 V aproximadamente una vez por segundo.' },
    P0133: { sev:'atencion', sint:'Consumo alto, pierde algo de potencia.', causas:['Sensor O2 envejecido (lo normal después de 100 mil km)','Contaminado por aceite o refrigerante quemado','Fuga de escape'],
      medir:'Mirá la velocidad de conmutación en vivo: si el sensor se mueve lento o se queda plano, está agotado. Antes de cambiarlo, descartá consumo de aceite.' },
    P0135: { sev:'atencion', sint:'Consumo alto en frío, testigo encendido.', causas:['Fusible del calefactor','Cableado o conector','Relé de alimentación','Calefactor del sensor abierto'],
      medir:'Medí la resistencia del calefactor (suele andar entre 3 y 15 ohm) y verificá que le llegue voltaje con el switch. Sin voltaje, el problema es el circuito, no el sensor.' },
    P0141: { sev:'informativa', sint:'Testigo encendido, casi sin síntomas de manejo.', causas:['Calefactor del sensor posterior abierto','Fusible o cableado','Conector dañado por calor'],
      medir:'Mismo procedimiento que P0135, pero en el sensor después del catalizador.' },
    P0171: { sev:'atencion', sint:'Ralentí inestable, tirones, falta de potencia, consumo alto.',
      causas:['Fuga de aire falso: mangueras, empaque del múltiple, PCV, bota del acelerador','MAF sucio o subinformando','Presión de combustible baja (filtro o bomba)','Inyectores sucios','Sensor O2 mintiendo','EGR pegada abierta'],
      medir:'Mirá los ajustes de combustible (STFT/LTFT) en ralentí y a 2500 rpm: si el ajuste es muy positivo en ralentí y mejora en alta, es fuga de vacío. Si se mantiene alto en todo el rango, apuntá a combustible o MAF. La prueba de humo es la que menos tiempo pierde.' },
    P0172: { sev:'atencion', sint:'Olor a combustible, humo negro, bujías tiznadas, consumo alto.',
      causas:['Inyector goteando','Presión de combustible alta o retorno tapado','MAF sobreinformando','Sensor ECT que reporta el motor frío de más','Filtro de aire tapado'],
      medir:'Ajustes de combustible muy negativos confirman rica. Revisá el sensor de refrigerante: si dice que el motor está frío, la ECU enriquece de más para siempre.' },
    P0174: { sev:'atencion', sint:'Igual que P0171 pero en el banco 2.', causas:['Fuga de aire en el banco 2','MAF o presión de combustible (si además aparece P0171)','Inyectores del banco 2','O2 del banco 2'],
      medir:'Si aparecen P0171 y P0174 juntos, la causa es común a ambos bancos (MAF, presión, PCV). Si es uno solo, buscá la fuga o el inyector de ese lado.' },
    P0201: { sev:'alta', sint:'Fallo de encendido en un cilindro, tironeo.', causas:['Conector del inyector suelto','Cableado cortado o rozado','Inyector abierto eléctricamente','Driver de la ECU'],
      medir:'Medí la resistencia del inyector y compará con los otros: una diferencia grande lo delata. Verificá pulso con lámpara de inyector antes de culpar a la ECU.' },
    P0300: { sev:'alta', sint:'Motor que vibra, tironea, pierde potencia. Si el testigo PARPADEA, apagá el motor.',
      causas:['Bujías gastadas o con luz mal calibrada','Bobinas o cables de bujía','Combustible malo o agua en el tanque','Presión de combustible baja','Fuga de vacío','Compresión baja o válvulas','Tiempo de encendido'],
      medir:'Un testigo parpadeando significa que está entrando combustible sin quemar al catalizador y lo va a fundir: no lo sigas manejando. Mirá los contadores de fallo por cilindro: si el fallo salta entre cilindros, sospechá de combustible, vacío o presión; si se concentra, seguí con los códigos P030x.' },
    P0301: { sev:'alta', sint:'Vibración, tironeo, pérdida de potencia.', causas:['Bujía del cilindro 1','Bobina de ese cilindro','Inyector tapado','Compresión baja o válvula quemada','Cableado'],
      medir:'Intercambiá la bobina y la bujía con otro cilindro y volvé a escanear: si el código se mueve al otro cilindro, encontraste la pieza. Si el fallo se queda, hacé prueba de compresión. Confirmar cuesta 20 minutos; equivocarse cuesta el repuesto.' },
    P0302: { sev:'alta', sint:'Igual que P0301, en el cilindro 2.', causas:['Bujía','Bobina','Inyector','Compresión'], medir:'Intercambiá bobina y bujía con otro cilindro y reescaneá: si el código se mueve, es esa pieza.' },
    P0303: { sev:'alta', sint:'Igual que P0301, en el cilindro 3.', causas:['Bujía','Bobina','Inyector','Compresión'], medir:'Intercambiá bobina y bujía con otro cilindro y reescaneá: si el código se mueve, es esa pieza.' },
    P0304: { sev:'alta', sint:'Igual que P0301, en el cilindro 4.', causas:['Bujía','Bobina','Inyector','Compresión'], medir:'Intercambiá bobina y bujía con otro cilindro y reescaneá: si el código se mueve, es esa pieza.' },
    P0325: { sev:'informativa', sint:'Pérdida de potencia leve, la ECU atrasa el tiempo por seguridad.',
      causas:['Sensor de detonación flojo o mal torqueado','Cableado o conector','Ruido mecánico real (biela, pistón)','Sensor dañado'],
      medir:'El torque del sensor importa: montado flojo no lee. Antes de cambiarlo, escuchá el motor: si hay golpeteo real, el sensor está haciendo su trabajo.' },
    P0335: { sev:'alta', sint:'No arranca, se apaga en caliente, tacómetro errático.', causas:['Sensor CKP (falla típica en caliente)','Entrehierro o rueda fónica dañada','Cableado o conector','Aceite en el conector'],
      medir:'Si falla solo en caliente, probá el sensor a temperatura de trabajo: en frío mide bien y engaña. Revisá que la rueda dentada no tenga dientes rotos.' },
    P0340: { sev:'alta', sint:'Arranque demorado, tironeo, motor que se apaga.', causas:['Sensor CMP','Cadena de tiempo saltada','Cableado','Actuador VVT'],
      medir:'Si aparece junto con P0016, revisá primero la sincronización mecánica: el sensor puede estar bien y estar reportando un tiempo corrido.' },
    P0401: { sev:'atencion', sint:'Tironeo a baja velocidad, testigo, a veces pinado.', causas:['Conductos de EGR carbonizados (causa más común)','Válvula EGR pegada','Sensor DPFE o de posición','Falta de vacío en la válvula'],
      medir:'Destapá y limpiá los conductos antes de comprar la válvula: en motores con kilometraje el carbón los tapa y la válvula está sana.' },
    P0402: { sev:'atencion', sint:'Ralentí inestable, motor que se apaga al frenar.', causas:['Válvula EGR pegada abierta','Diafragma roto','Sensor de posición'],
      medir:'Con el motor en ralentí, la EGR debe estar cerrada. Si la abrís a mano y el motor casi se apaga, la válvula responde; el problema es que queda abierta.' },
    P02D1: { sev:'alta', sint:'Motor tiembla o vibra en ralentí, consumo excesivo de combustible, tirones al acelerar.',
      causas:['Inyector de combustible cilindro 5 con fuga, goteo o solenoide pegado','Fuga de vacío o entrada de aire no medido sobre el cilindro 5','Baja compresión de cilindro por junta, válvulas o anillos','Conector/arnés del inyector con sulfatación o falso contacto'],
      medir:'1. Medí resistencia eléctrica del inyector (12-16 Ω puerto / 0.5-2 Ω GDI). 2. Intercambiá el inyector a otro cilindro: si la falla migra de cilindro, la pieza está defectuosa. 3. Realizá prueba de humo para descartar fuga de vacío en la admisión del cilindro 5.' },
    C0004: { sev:'critica', sint:'Testigo de ABS y Control de Estabilidad (ESC) encendidos. Frenado convencional operativo pero sin asistencia anti-bloqueo.',
      causas:['Válvula solenoide o bloque hidráulico ABS atascado o con devanado abierto/corto','Líquido de frenos suelto o contaminado con humedad que agarrotó las válvulas','Conector multipin del módulo ABS con sulfatación o agua','Tensión de batería inestable o caída de voltaje al arrancar'],
      medir:'1. Verificar nivel y estado del líquido de frenos (efectuar purga si está oscuro). 2. Limpiar conector del módulo ABS. 3. Medir resistencia de bobinas de válvulas solenoides en el bloque hidráulico ABS.' },
    C1555: { sev:'critica', sint:'Dirección asistida (MDPS/EPS) sumamente dura o pesada. Testigo EPS encendido en el cuadro de instrumentos.',
      causas:['Fusible principal del sistema MDPS (80A/100A en caja del motor) quemado','Relé del motor de asistencia pega/soldado internamente o con circuito abierto','Cableado/arnés de potencia del motor MDPS dañado o suelto','Tensión de batería en reposo < 12.0V o masa de la columna de dirección suelta'],
      medir:'1. Medí tensión de batería en reposo (>12.5V) y bornes. 2. Revisá fusible principal MDPS 80A. 3. Comprobá continuidad y masa del módulo MDPS. Si el relé interno está soldado, reemplazá el módulo o conjunto MDPS.' },
    U2055: { sev:'alta', sint:'Luces de advertencia múltiples (ABS, EPS, Check Engine), pérdida de velocímetro/RPM en módulos secundarios.',
      causas:['Batería descargada o caída brusca de tensión durante el arranque','Masa/tierra física de motor o chasis sulfatada o floja','Líneas CAN-H / CAN-L cortadas, rozadas a masa o abiertas','Módulo dinámico secundario desconectado o sin alimentación'],
      medir:'1. Medí tensión de batería en reposo y caída al arranque (>9.6V mínimo). 2. Con switch OFF, medí resistencia entre CAN-H (pin 6 OBD) y CAN-L (pin 14 OBD): debe marcar 60 Ω exactos. 3. Revisá las tierras del chasis y arnés.' },
    P0420: { sev:'atencion', sint:'Testigo encendido, casi sin síntomas de manejo, no pasa la revisión de emisiones.',
      causas:['Fuga de escape antes o entre los sensores','Sensor O2 posterior lento o envejecido','Fallos de encendido o consumo de aceite que envenenaron el catalizador','Catalizador realmente agotado'],
      medir:'Es el código donde más plata se tira. Antes de cambiar el catalizador, compará en vivo la señal del O2 delantero contra el trasero: el trasero debe estar casi plano; si copia al delantero, el catalizador no está trabajando. Y buscá la causa: si el motor quema aceite o falla, el catalizador nuevo se muere igual.' },
    P0430: { sev:'atencion', sint:'Igual que P0420, en el banco 2.', causas:['Fuga de escape','O2 posterior del banco 2','Fallos de encendido o aceite','Catalizador agotado'],
      medir:'Mismo procedimiento que P0420, del lado del banco 2.' },
    P0442: { sev:'informativa', sint:'Casi sin síntomas, a veces olor a combustible.', causas:['Tapón de combustible flojo, mal roscado o con empaque vencido','Manguera del EVAP agrietada','Válvula de purga o de venteo','Canister fisurado'],
      medir:'Empezá por el tapón: es la causa más común y la más barata. Si no, prueba de humo en el sistema EVAP; a ojo no se encuentra una fuga pequeña.' },
    /* Sube a "atencion" y no queda en informativa a proposito. El codigo solo
       dice "fuga grande de vapores", pero cuando viene con OLOR FUERTE — y mas
       aun dentro de la cabina — lo que hay que descartar primero no es un vapor
       sino combustible LIQUIDO, que con una fuente de ignicion es un incendio.
       Dejarlo como informativa invita a devolver el vehiculo andando. */
    P0455: { sev:'atencion', sint:'Olor a combustible, testigo encendido. Si el olor es FUERTE o se siente dentro de la cabina, tratalo como fuga de combustible líquido, no como un código de vapores.',
      causas:['Tapón de combustible ausente, mal cerrado o con empaque vencido','Manguera del EVAP desconectada o partida','Canister o válvula de venteo dañados','Canister SATURADO de combustible líquido (deja de adsorber y empuja vapor y líquido hacia la purga)','Fuga en el tubo de llenado, su válvula de retención o la válvula de nivelación del tanque'],
      medir:'ANTES de la prueba de humo, y con el vehículo afuera y sin fuentes de ignición: buscá combustible líquido — tanque, tubo de llenado, bomba y sus fittings, y el canister (si pesa o gotea, está saturado y hay que cambiarlo, no lavarlo). ' +
        'Revisá si el modelo tiene campaña de fábrica por fuga de combustible: la pestaña de campañas lo consulta por marca/modelo/año. ' +
        'Si no hay líquido, entonces sí: tapón, mangueras del canister y prueba de humo.' },
    P0456: { sev:'informativa', sint:'Testigo encendido, sin síntomas de manejo.', causas:['Empaque del tapón reseco','Fisura fina en manguera','Válvula de purga que no sella'],
      medir:'Fuga muy pequeña: solo aparece con prueba de humo. No cambies piezas a ciegas por este código.' },
    P0441: { sev:'informativa', sint:'Sin síntomas de manejo; a veces ralentí inestable al arrancar en caliente.', causas:['Válvula de purga pegada abierta o cerrada','Manguera de purga tapada, partida o mal conectada','Sensor de presión del tanque fuera de rango','Canister saturado de combustible'],
      medir:'Medí la purga con vacío: la válvula debe sellar sin alimentación y abrir con ella. Una purga pegada abierta mete vapor al múltiple en ralentí y también da mezcla rica.' },
    P0443: { sev:'informativa', sint:'Testigo encendido, casi sin síntomas.', causas:['Bobina de la válvula de purga abierta o en corto','Conector o arnés de la purga','Alimentación o masa de la válvula'],
      medir:'Es un código ELÉCTRICO, no de fuga: medí resistencia de la bobina y presencia de alimentación en el conector antes de cambiar la válvula. Si el circuito está bien, seguí el arnés hacia el ECM.' },
    P0446: { sev:'informativa', sint:'Testigo encendido; a veces cuesta cargar combustible.', causas:['Válvula de venteo pegada o sucia','Filtro del venteo tapado (polvo o barro)','Manguera del venteo colapsada','Arnés de la válvula de venteo'],
      medir:'El venteo es lo que deja entrar aire al tanque: si está tapado, el tanque hace vacío y la bomba de la gasolinera se corta. Revisalo sucio/tapado antes de condenar la válvula — en vehículo de terracería es causa común.' },
    P0451: { sev:'informativa', sint:'Testigo encendido, sin síntomas.', causas:['Sensor de presión del tanque descalibrado','Conector con humedad o falso contacto','Manguera de referencia del sensor obstruida'],
      medir:'Con el tapón abierto el sensor debe leer presión atmosférica. Una lectura que no se mueve al abrir el tapón es sensor o manguera, no fuga — no arranques cambiando canister.' },
    P0500: { sev:'atencion', sint:'Velocímetro errático o muerto, cambios bruscos de la caja.', causas:['Sensor de velocidad','Rueda fónica o corona dañada','Cableado','Módulo de ABS'],
      medir:'Si el vehículo toma la velocidad del ABS, revisá primero los códigos de ABS: el problema suele estar ahí y no en un sensor propio.' },
    P0506: { sev:'informativa', sint:'Ralentí bajo, el motor se apaga al frenar o en marcha lenta.', causas:['Cuerpo de aceleración sucio de carbón','Válvula IAC pegada','Fuga de vacío','Falta de aprendizaje del ralentí tras desconectar la batería'],
      medir:'Limpiá el cuerpo de aceleración y hacé el reaprendizaje de ralentí que pida la marca. Muchos casos se resuelven ahí.' },
    P0507: { sev:'atencion', sint:'Ralentí alto, el motor no baja de vueltas.', causas:['Fuga de aire falso (la causa más común)','Cuerpo de aceleración sucio o mal ajustado','IAC pegada','Cable del acelerador trabado'],
      medir:'Buscá la fuga de vacío con humo. Un ralentí alto casi siempre es aire que entra sin medir.' },
    P0562: { sev:'alta', sint:'Luces que bajan, testigos varios, arranque flojo.', causas:['Batería en mal estado o bornes sulfatados','Banda del alternador floja','Alternador o regulador','Cables de tierra flojos'],
      medir:'Con el motor en marcha el sistema debe estar entre 13.5 y 14.5 V aproximadamente. Antes de cambiar el alternador, limpiá bornes y revisá las tierras: un mal contacto reproduce todo esto.' },
    P0563: { sev:'atencion', sint:'Focos que se queman seguido, testigo encendido.', causas:['Regulador del alternador','Batería en falla','Conexión de tierra deficiente'],
      medir:'Si el voltaje pasa de 15 V con el motor en marcha, el regulador está dejando cargar de más y va a dañar módulos.' },
    P0601: { sev:'alta', sint:'Funcionamiento errático, el motor puede no arrancar.', causas:['Alimentación o tierra de la ECU con mal contacto','Software desactualizado','Módulo dañado'],
      medir:'Revisá alimentaciones y tierras de la ECU antes de condenarla; un módulo se cambia de último y con la reprogramación resuelta.' },
    P0700: { sev:'atencion', sint:'Testigo encendido, la caja puede entrar en modo de emergencia.', causas:['Este código solo avisa que la TCM guardó un código propio'],
      medir:'No cambies nada por este código: es un aviso. Leé los códigos de la transmisión (TCM) y trabajá sobre esos.' },
    P0740: { sev:'atencion', sint:'Aumento de revoluciones sin avanzar, consumo alto, la caja calienta.', causas:['Nivel o estado del aceite de transmisión (empezar por acá)','Solenoide del convertidor (TCC)','Cuerpo de válvulas','Convertidor de par'],
      medir:'Revisá nivel, color y olor del ATF antes que nada: quemado u oscuro explica el código. Verificá el bloqueo del convertidor en vivo a velocidad de crucero.' },
    P0741: { sev:'atencion', sint:'Las revoluciones no bajan al mantener velocidad, la caja calienta.', causas:['ATF sucio o con nivel bajo','Solenoide TCC pegado','Cuerpo de válvulas sucio','Convertidor dañado'],
      medir:'Mismo camino que P0740: aceite primero, solenoide después, convertidor de último.' },
    U0100: { sev:'critica', sint:'El motor puede no arrancar o apagarse en marcha; varios testigos encendidos.',
      causas:['Alimentación o tierra de la ECU','Bus CAN cortado o en corto','Conector con corrosión o agua','Resistencias terminadoras del bus','Módulo dañado'],
      medir:'Medí la resistencia entre CAN-H y CAN-L con todo apagado: lo normal ronda 60 ohm (dos resistencias de 120 en paralelo). Un valor muy distinto apunta al cableado, no al módulo.' },
  },

  /* Muestra la guía de un código en un modal, con las causas en orden. */
  verGuia(codigo) {
    const g = this._GUIA[codigo];
    const desc = this._descDTC(codigo, this._catalogo);
    const veh = this._vehiculoDe(this._centroScan || this._scan || {});
    const marca = veh.marca || '';
    const modelo = veh.modelo || '';
    const queryYoutube = encodeURIComponent(`reparar DTC ${codigo} ${marca} ${modelo}`);
    const urlYoutube = `https://www.youtube.com/results?search_query=${queryYoutube}`;

    if (!g) {
      return UI.modal(`🔧 ${codigo}`, `<p style="font-size:13px"><b>${UI.esc(desc)}</b></p>
        <p style="font-size:12.5px;color:var(--text2);margin-top:8px">
          Todavía no hay guía cargada para este código. Un código indica qué monitor salió
          fuera de rango, no qué pieza cambiar: confirmá con mediciones y consultá el manual
          del fabricante y los boletines de ese modelo antes de reemplazar nada.</p>
        <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border)">
          <a href="${urlYoutube}" target="_blank" rel="noopener" class="btn" style="background:#ff0000;color:#ffffff;border:none;font-weight:700;display:inline-flex;align-items:center;gap:6px;text-decoration:none;padding:7px 12px;border-radius:6px;font-size:12px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            🎥 Ver Solución en YouTube (${codigo} ${UI.esc(marca)})
          </a>
        </div>`, '560px');
    }
    const sevTxt = { informativa:['Informativa','var(--text3)','Puede seguir circulando; corregir cuando se pueda.'],
      atencion:['Atención','var(--amber)','Puede circular, pero conviene atenderlo pronto: gasta más y puede dañar otras piezas.'],
      alta:['Alta','var(--red)','Atender de inmediato: manejar así puede dañar el motor o el catalizador.'],
      critica:['Crítica','var(--red)','No circular. Puede quedar tirado o dañar módulos.'] }[g.sev] || ['—','var(--text3)',''];
    UI.modal(`🔧 ${codigo}`, `
      <div style="font-size:13.5px;font-weight:800;margin-bottom:2px">${UI.esc(desc)}</div>
      <div style="display:inline-block;font-size:11px;font-weight:800;color:${sevTxt[1]};border:1px solid ${sevTxt[1]};border-radius:6px;padding:2px 8px;margin-bottom:8px">Severidad: ${sevTxt[0]}</div>
      <div style="font-size:12.5px;color:var(--text2);margin-bottom:10px">${UI.esc(sevTxt[2])}</div>
      <div style="margin-bottom:10px"><b style="font-size:12px">SÍNTOMAS TÍPICOS</b>
        <div style="font-size:12.5px;margin-top:2px">${UI.esc(g.sint)}</div></div>
      <div style="margin-bottom:10px"><b style="font-size:12px">CAUSAS PROBABLES</b>
        <div style="font-size:11px;color:var(--text3)">en orden: primero lo más común y barato</div>
        <ol style="font-size:12.5px;margin:4px 0 0 18px">${g.causas.map(c => `<li style="margin:2px 0">${UI.esc(c)}</li>`).join('')}</ol></div>
      <div style="background:var(--surface2);border-left:3px solid var(--cyan);border-radius:8px;padding:10px">
        <b style="font-size:12px">QUÉ MEDIR ANTES DE CAMBIAR PIEZAS</b>
        <div style="font-size:12.5px;margin-top:4px">${UI.esc(g.medir)}</div></div>
      <div style="margin-top:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:9px;font-size:11.5px">
        <b style="color:var(--red);display:flex;align-items:center;gap:4px">⚠️ ¿Por qué este código no se borra?</b>
        <div style="margin-top:3px;color:var(--text2)">
          1. <b>Código Permanente / Falla Física Activa</b>: Si el componente (relé de motor, inyector, fusible o solenoide) está averiado o sin alimentación, el módulo lo re-detecta inmediatamente.<br>
          2. <b>Precondiciones de Borrado</b>: Realizá el borrado con <b>Motor Apagado</b>, <b>Switch en ON (Contacto)</b> y <b>Tensión de Batería > 12.5V</b>.
        </div>
      </div>
      <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap">
        <a href="${urlYoutube}" target="_blank" rel="noopener" class="btn" style="background:#ff0000;color:#ffffff;border:none;font-weight:700;display:inline-flex;align-items:center;gap:6px;text-decoration:none;padding:7px 12px;border-radius:6px;font-size:12px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          🎥 Ver Solución en YouTube (${codigo} ${UI.esc(marca)})
        </a>
        <span style="font-size:10.5px;color:var(--text3)">Guía de diagnóstico SAE / OEM</span>
      </div>`, '600px');
  },

  _descDTC(c, cat) {
    if (this._DTCS[c]) return this._DTCS[c];
    /* Rango específico de fabricante (SAE J2012): P1xxx, y en las familias
       B/C/U cualquier código que no sea X0xxx (B1-B3, C1-C3, U1-U3). P2xxx
       y P0xxx SÍ son genéricos SAE — mismo significado en cualquier marca.
       Nuestro catálogo (fuente pública, 3,071 códigos) NO trae el fabricante
       de cada código: mostrar su texto para un código de fabricante sería
       adivinar la marca — puede ser el de otro fabricante. Mejor avisar que
       no está verificado que arriesgar un diagnóstico equivocado. */
    const esFabricante = (c[0] === 'P' && c[1] === '1') || (c[0] !== 'P' && c[1] !== '0');
    /* La tabla dtc_catalogo está corrida un lugar desde ~P0170 (P0420 aparece
       como "Secondary Air Injection Relay B", que en realidad es P0419), así que
       su texto se muestra como pista y NUNCA como dato firme: cambiar la pieza
       equivocada cuesta mucho más que verificar en el manual. */
    if (!esFabricante) {
      const fila = cat && cat[c];
      const t = fila?.descripcion_es || fila?.descripcion_en;
      if (t) return t + ' — sin verificar, confirmar en el manual';
    }
    const rangos = { P00:'Control de mezcla aire/combustible', P01:'Medición de aire/combustible', P02:'Circuito de inyección',
      P03:'Sistema de encendido / fallos de encendido', P04:'Control de emisiones (EGR/EVAP/catalizador)', P05:'Ralentí y velocidad del vehículo',
      P06:'Computadora (ECU) y salidas auxiliares', P07:'Transmisión', P08:'Transmisión', P09:'Transmisión',
      C:'Chasis (ABS/frenos/suspensión/dirección)', B:'Carrocería (airbag/cinturones/cerraduras)', U:'Red de comunicación entre módulos' };
    const g = rangos[c.slice(0,3)] || rangos[c[0]] || 'Código de diagnóstico';
    return esFabricante
      ? g + ' — específico del fabricante, no verificado para esta marca: consultar manual del fabricante'
      : g + ' — consultar manual del fabricante';
  },

  /* Reemplaza una descripción base únicamente si hay una fuente con licencia
     y verificada para el vehículo concreto. */
  async _enriquecerDTCs(dtcs, vehId, protocolo = 'obd2') {
    if (!dtcs?.length) return dtcs || [];
    const veh = this._vehiculos.find(v => v.id === vehId);
    try {
      const especificos = await DB.getDTCEspecificos(dtcs.map(d => d.codigo), veh, protocolo);
      return dtcs.map(d => {
        const e = especificos[d.codigo];
        return e ? { ...d, desc:e.descripcion_es, origen:'Específico verificado', fuente:e.fuente, severidad:e.severidad }
          : { ...d, origen: protocolo === 'j1939' ? 'J1939 base' : 'SAE genérico' };
      });
    } catch (_) {
      return dtcs.map(d => ({ ...d, origen: protocolo === 'j1939' ? 'J1939 base' : 'SAE genérico' }));
    }
  }
  }));
})();
