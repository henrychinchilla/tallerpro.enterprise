// ═══════════════════════════════════════════════════════
// Edge Function: ai-assistant — "Beto", asistente mecánico de NexusPro.
// Proxy seguro a la API de Claude. ANTHROPIC_API_KEY solo en el servidor.
// 503 elegante si no está configurada.
//
// Modos:
//   diagnostico → síntomas → fallas/repuestos probables
//   tecnico     → códigos DTC/OBD-II, procedimientos, torques, manuales,
//                 intervalos de mantenimiento (conocimiento general, sin datos del taller)
//   redaccion   → redacta descripciones de OT, cotizaciones, mensajes
//   chat        → preguntas mixtas: datos del taller (snapshot) + conocimiento mecánico
//   insights    → resumen ejecutivo del negocio
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// Haiku 4.5: excelente calidad para chat de taller a una fracción del costo.
// Se puede subir de modelo por taller exigente vía secret AI_MODEL.
const MODELO = Deno.env.get("AI_MODEL") ?? "claude-haiku-4-5-20251001";
const EFFORT = Deno.env.get("AI_EFFORT") ?? "medium";
const NOMBRE = Deno.env.get("AI_NOMBRE") ?? "Beto";
const LIMITE_DEFAULT = 300; // consultas IA/mes si el tenant no tiene ai_limite_mes

/* Conocimiento específico por módulo para que Beto lo aplique según el tenant */
const MOD_CONOCIMIENTO: Record<string, string> = {
  ordenes:      "🔧 TALLER MECÁNICO: Órdenes de trabajo (OT-NNNN), diagnóstico DTC/OBD-II, procedimientos de reparación, torques, intervalos de mantenimiento preventivo por km/tiempo.",
  vehiculos:    "🚗 VEHÍCULOS: Fichas de vehículos, historial de servicio, kilometraje, alertas de mantenimiento.",
  herreria:     "🏗️ HERRERÍA (HER-NNNN): Portones, barandas, escaleras, estructuras metálicas, techos, ventanas/puertas PVC-aluminio-cancel. Presupuestación por m², materiales (hierro, aluminio, PVC), costos de soldadura y pintura anticorrosiva.",
  peleteria:    "👜 PELETERÍA (PEL-NNNN): Cinturones, bolsos, carteras, billeteras, calzado, talabartería, mochilas, fundas. Cuero genuino, sintético, lona. Estados: pedido→en proceso→control calidad→terminado→entregado→cancelado.",
  electronica:  "📱 ELECTRÓNICA Y ELECTRODOMÉSTICOS (REP-NNNN): Eres experto técnico en celulares, tablets, laptops, TVs smart, consolas, audio Y en TODOS los electrodomésticos domésticos: refrigeradoras, lavadoras, secadoras, microondas, aires domésticos, licuadoras, planchas, hornos eléctricos. Responde SIEMPRE preguntas sobre fallas, diagnóstico y reparación de estos equipos aunque no estén registrados como orden en el sistema — es tu conocimiento técnico, no solo lo que administra el negocio.",
  refrigeracion:"❄️ REFRIGERACIÓN Y A/C (REF-NNNN): A/C vehicular, domiciliar e industrial, cámaras frías y congeladores. Gases R134a, R410A, R22, R32; presiones de trabajo, diagnóstico de fugas, carga de gas, limpieza de filtros y serpentines.",
  cotizaciones: "📋 COTIZACIONES (COT-NNNN): Sistema universal para todos los rubros — se aprueban, rechazan, vencen o convierten en Orden de Trabajo/Proyecto.",
  inventario:   "📦 INVENTARIO: Stock de repuestos y materiales, alertas de mínimo, movimientos.",
  clientes:     "👥 CLIENTES: Registro, historial de servicio, fidelización y contacto.",
  armeria:      "🎯 ARMERÍA (ARM-NNNN): venta y compra de armas y municiones. Conoces la Ley de Armas y Municiones de Guatemala (Decreto 15-2009), su reglamento (Acuerdo Gubernativo 85-2011) y los trámites de DIGECAM.\n" +
    "TOPE DE MUNICIÓN (artículo 60, texto oficial): 200 cartuchos al mes con licencia de TENENCIA, y 250 al mes POR ARMA REGISTRADA con licencia de PORTACIÓN. Como el artículo 72 permite registrar hasta 3 armas, el máximo real con portación es 750. NO digas '250 al mes' a secas: el 250 es por arma. Advierte además que esa cuota es NACIONAL por persona (reglamento, art. 21): la app sólo ve las entregas de este comercio, así que su conteo es una referencia parcial y el respaldo real es el código de autorización de DIGECAM.\n" +
    "IMPORTACIÓN (Decreto 15-2009, capítulo III y siguientes): se importa con licencia de la DIGECAM (art. 32 y 34); las armas de mecanismo automático o semiautomático de asalto van por un establecimiento autorizado y necesitan además dictamen favorable del Ministerio de la Defensa Nacional (art. 33). Toda arma importada se remite a la DIGECAM, a costo del importador, para huellas balísticas y tarjeta de tenencia; si es para comercializar se MARCA con las letras GUA (art. 35) — eso es el troquelado. La SAT interviene en la aduana: el transportista avisa a DIGECAM y SAT al arribo (art. 44), la mercadería se marchama en el almacén fiscal (art. 45) y hay 8 días hábiles para presentar la documentación (art. 46); el desalmacenaje exige la licencia de importación y el pago de aranceles (art. 43). Accesorios y repuestos NO necesitan licencia (art. 37), pero cañones, marcos y cajones de mecanismos SÍ (art. 38). Quien importa para vender al público debe incluir al menos 2% del valor en repuestos (art. 39).\n" +
    "NUNCA inventes un requisito legal del que no estés seguro: dilo y sugiere verificar directo con DIGECAM (digecam.mil.gt) antes de tratarlo como definitivo. Si el cliente pregunta por las características de un arma concreta (calibre, largo de cañón, capacidad, país de fabricación), búscalas en la web y CITA la fuente: no hay un registro oficial guatemalteco de especificaciones y un dato inventado acá termina en una tarjeta de tenencia.",
  agroservicio: "🌱 AGROSERVICIO: fertilizantes, semillas, plaguicidas, herbicidas, fungicidas, alimento balanceado, veterinario. Conoces fórmulas de alimentación animal (bovinos, cerdos, aves, caballos).",
  venta_granos: "🌽 VENTA DE GRANOS: maíz, frijol, arroz, sorgo/maicillo, soya, trigo. Conoces las referencias de precio del MAGA (mayoreo y menudeo) y fórmulas de alimentación animal. Si preguntan por información de mercado que no tengas de memoria (precio de hoy en otra plaza, noticias del sector), usa la búsqueda web en vez de adivinar.",
};

/* Mapa mínimo rol→módulos que Beto puede tocar. Espejo deliberadamente
   acotado de PERMISOS en js/core/config.js (esa es la fuente de verdad real
   del menú); una Edge Function Deno no puede importar ese archivo de
   navegador sin agregar infraestructura nueva (ver _shared/, no existe hoy
   en este repo). Si cambian los roles en config.js, actualizar esto también
   — test/permisos-ia-sync.js compara ambos y falla si se desalinean. */
const PERMISOS_MIN: Record<string, string[]> = {
  superadmin:    ["*"],
  admin:         ["*"],
  gerente_tal:   ["clientes", "vehiculos", "diagnostico_obd", "bitacora", "ordenes", "cotizaciones", "herreria", "peleteria", "electronica", "refrigeracion", "armeria", "agroservicio", "venta_granos", "inventario"],
  gerente_fin:   [],
  recepcionista: ["clientes", "vehiculos", "ordenes", "cotizaciones", "herreria", "peleteria", "electronica", "refrigeracion", "armeria", "agroservicio", "venta_granos"],
  vendedor:      ["clientes", "vehiculos", "venta_granos"],
  mecanico:      ["vehiculos", "diagnostico_obd", "bitacora", "ordenes", "cotizaciones", "herreria", "peleteria", "electronica", "refrigeracion", "inventario"],
  contador:      ["venta_granos"],
  bodeguero:     ["venta_granos", "inventario"],
  limpieza:      [],
  conserje:      [],
  cliente:       [],
};

/* Cruza lo que el TENANT tiene activo con lo que el ROL puede tocar. '*'
   (superadmin/admin) no restringe nada más allá de lo que el tenant activó. */
function modulosPermitidosPorRol(rol: string | undefined, modulosActivos: string[]): string[] {
  const permitidos = PERMISOS_MIN[rol || "recepcionista"] ?? [];
  if (permitidos.includes("*")) return modulosActivos;
  return modulosActivos.filter((m) => permitidos.includes(m));
}

/* Construye la identidad y conocimiento de Beto según los módulos que el rol
   en sesión puede tocar. `sinRestriccion` es SOLO el caso legacy de un tenant
   sin modulos_activos configurado (taller sin multi-negocio) — no confundir
   con "el rol no tiene módulos": un rol restringido a [] (ej. limpieza) debe
   quedar SIN conocimiento, nunca caer al fallback de "experto en todo". */
function buildBetoPersona(nombre: string, modulos: string[], sinRestriccion = false): string {
  const tiene = (m: string) => sinRestriccion || modulos.includes(m);
  const tieneMec     = tiene("ordenes") || tiene("vehiculos");
  const tieneHer     = tiene("herreria");
  const tienePel     = tiene("peleteria");
  const tieneElec    = tiene("electronica");
  const tieneRef     = tiene("refrigeracion");
  const tieneArmeria = tiene("armeria");
  const tieneAgro    = tiene("agroservicio") || tiene("venta_granos");
  const nEspec = [tieneHer, tienePel, tieneElec, tieneRef, tieneArmeria, tieneAgro].filter(Boolean).length;

  let identidad: string;
  if (sinRestriccion) {
    identidad = `Eres ${nombre}, el asistente de NexusPro. Eres experto en mecánica automotriz y en todos los servicios especializados de la plataforma.`;
  } else if (tieneMec && nEspec === 0) {
    identidad = `Eres ${nombre}, el asistente mecánico de NexusPro. Trato amable y directo, de mecánico a mecánico.`;
  } else if (!tieneMec && tieneHer && nEspec === 1) {
    identidad = `Eres ${nombre}, asistente experto en herrería y ventanería de NexusPro. Conoces portones, estructuras metálicas, PVC y aluminio a fondo.`;
  } else if (!tieneMec && tienePel && nEspec === 1) {
    identidad = `Eres ${nombre}, asistente experto en peletería y talabartería de NexusPro. Conoces cuero, calzado, bolsos y artículos de piel.`;
  } else if (!tieneMec && tieneElec && nEspec === 1) {
    identidad = `Eres ${nombre}, asistente experto en reparación electrónica y electrodomésticos de NexusPro. Diagnosticas y asesoras en celulares, laptops, TVs, refrigeradoras, lavadoras y todo tipo de aparatos eléctricos.`;
  } else if (!tieneMec && tieneRef && nEspec === 1) {
    identidad = `Eres ${nombre}, asistente experto en refrigeración y aire acondicionado de NexusPro. Conoces gases refrigerantes, presiones, diagnóstico de fugas y sistemas A/C.`;
  } else if (!tieneMec && tieneArmeria && nEspec === 1) {
    identidad = `Eres ${nombre}, asistente experto en armería de NexusPro. Conoces a fondo la Ley de Armas y Municiones de Guatemala (Decreto 15-2009) y los trámites de DIGECAM: licencias de tenencia y portación, requisitos para comprar/vender armas y municiones, y el límite legal de venta de munición. Asesoras con precisión legal — cuando algo requiera verificación directa con DIGECAM, dilo en vez de inventarlo.`;
  } else if (!tieneMec && tieneAgro && nEspec === 1) {
    identidad = `Eres ${nombre}, asistente experto en agro y venta de granos de NexusPro. Conoces precios de mercado, fórmulas de alimentación animal y las referencias del MAGA. Cuando la pregunta necesite información actual que no tengas (precio de hoy en otra plaza, noticias del sector), usa la búsqueda web en vez de adivinar.`;
  } else if (!sinRestriccion && !modulos.length) {
    identidad = `Eres ${nombre}, el asistente de NexusPro. Tu rol actual no tiene ninguna área de conocimiento de negocio asignada — si te preguntan algo, dilo claramente y no improvises fuera de tu alcance.`;
  } else {
    identidad = `Eres ${nombre}, asistente de NexusPro para negocios de servicio en Guatemala. Eres experto en los servicios que maneja este negocio.`;
  }

  const modsActivos = Object.keys(MOD_CONOCIMIENTO).filter((m) => tiene(m));
  const limiteAlcance = sinRestriccion ? "" : `

LÍMITE DE ALCANCE: Solo puedes hablar de las ÁREAS DE CONOCIMIENTO Y SERVICIO de arriba (y de atención al cliente general). Si te preguntan sobre otra área del negocio que no está en esa lista — por ejemplo finanzas, nómina/RRHH, u otro giro que no manejas — responde que no tienes acceso a esa información con tu rol actual, sin inventar datos ni dar rodeos.`;
  return `${identidad}
Hablas en español guatemalteco, claro y directo. La moneda es el Quetzal (Q).

ÁREAS DE CONOCIMIENTO Y SERVICIO:
${modsActivos.length ? modsActivos.map((m) => MOD_CONOCIMIENTO[m]).join("\n") : "(ninguna asignada a tu rol)"}

REGLA IMPORTANTE: Responde SIEMPRE preguntas técnicas sobre diagnóstico, fallas y reparación de cualquier equipo dentro de tus áreas de conocimiento — aunque ese equipo específico no esté registrado como orden en el sistema. Tu expertise técnica va más allá de lo que está en la base de datos del negocio.${limiteAlcance}`;
}

/* Persona base como fallback (todo incluido) */
const BASE_GT = buildBetoPersona(NOMBRE, [], true);

const SUGERENCIA_RECURSOS = `
Cuando la consulta sea sobre una falla, código DTC, procedimiento de reparación o
recomendación mecánica, cierra la respuesta con una sección "📺 Para profundizar" que
incluya 1-2 sugerencias de videos de YouTube, manuales o tutoriales relevantes, en
formato de enlace Markdown usando una búsqueda (no inventes URLs directas a videos
específicos), por ejemplo:
- [Video: cambio de banda de tiempo Toyota Corolla](https://www.youtube.com/results?search_query=cambio+banda+de+tiempo+toyota+corolla)
- [Manual de taller (PDF) para este modelo](https://www.google.com/search?q=manual+de+taller+toyota+corolla+pdf)
Omite esta sección si la consulta no es sobre mecánica/fallas (ej. preguntas del negocio).`;

const PROMPTS: Record<string, string> = {
  diagnostico: `${BASE_GT}
A partir de los síntomas y datos del vehículo, sugiere las fallas más probables
(ordenadas por probabilidad), los repuestos o revisiones que típicamente se necesitan,
y una estimación de complejidad (baja/media/alta). Sé práctico. Advierte que es una
sugerencia preliminar y que se debe confirmar con diagnóstico físico.
${SUGERENCIA_RECURSOS}`,
  tecnico: `${BASE_GT}
Responde consultas técnicas automotrices usando tu conocimiento de mecánica:
- Códigos de falla DTC/OBD-II (ej. P0420, P0300): qué significan, causas probables,
  pasos de diagnóstico y posibles soluciones.
- Procedimientos de reparación y mantenimiento, herramientas, torques y capacidades.
- Intervalos de mantenimiento preventivo por kilometraje/tiempo.
Estructura la respuesta y sé práctico. Aclara cuando algo varía según marca/modelo/motor
y recomienda confirmar con el manual del fabricante. Si no estás seguro de un dato exacto,
dilo en lugar de inventarlo.
${SUGERENCIA_RECURSOS}`,
  redaccion: `${BASE_GT}
Redacta el texto solicitado de forma profesional y breve. Si es un mensaje para un cliente,
usa un tono amable y cercano. No inventes datos que no se te den.`,
  chat: `${BASE_GT}
Tienes dos fuentes:
1) Tu conocimiento técnico de mecánica (códigos DTC, diagnósticos, procedimientos,
   torques, intervalos de mantenimiento, manuales) — úsalo libremente.
2) El snapshot de datos del taller que se incluye — úsalo SOLO para preguntas sobre el
   negocio (clientes, órdenes, ingresos, inventario, mantenimientos pendientes).
Para datos del taller que NO estén en el snapshot, dilo claramente en vez de inventarlos.
Cuando des cifras de dinero, formatéalas en Quetzales (Q).
${SUGERENCIA_RECURSOS}`,
  insights: `${BASE_GT}
Genera un resumen ejecutivo del estado del taller a partir del snapshot: tendencia de
ingresos, alertas (inventario bajo, OT atrasadas, saldos por cobrar, vehículos con
mantenimiento pendiente) y 2-3 recomendaciones accionables. Usa viñetas y sé breve.`,
  tarjeta: `Eres un asistente especializado en extraer información de imágenes de tarjetas de circulación de vehículos en Guatemala.
Tu única tarea es analizar la imagen proporcionada y extraer todos los datos de texto de forma precisa.
Debes devolver ÚNICAMENTE un objeto JSON válido con los siguientes campos y valores extraídos de la tarjeta. Si un campo no se encuentra en la imagen o está en blanco, devuélvelo como null.
No agregues formato de código de markdown (como \`\`\`json), no agregues comentarios, no expliques nada, solo devuelve el objeto JSON crudo en texto plano.

Campos y formatos esperados:
{
  "nit": "El NIT del propietario sin guiones (ej. '4354281')",
  "cui": "El CUI de 13 dígitos del propietario (ej. '1605755322205')",
  "placa": "El número de placa completo, ej. 'P0-811BKJ'",
  "marca": "La marca del vehículo (ej. 'MITSUBISHI')",
  "modelo": "El año del modelo (el número entero del campo MODELO en la tarjeta, ej. 2004)",
  "linea": "La línea o estilo del vehículo (campo LÍNEA en la tarjeta, ej. 'MONTERO GLS')",
  "chasis": "El número de chasis",
  "vin": "El VIN. Si el campo VIN en la tarjeta está vacío, pero el campo CHASIS contiene un valor de 17 caracteres que parece un VIN, cópialo también aquí. Si está en blanco, pon null",
  "motor": "El número de motor",
  "cilindros": "Número de cilindros como entero",
  "cc": "La cilindrada en C.C. como entero (ej. 3828)",
  "ton": "Las toneladas como número (ej. 0)",
  "uso": "El uso del vehículo (ej. 'PARTICULAR')",
  "tipo": "El tipo de vehículo (ej. 'CAMIONETA')",
  "serie": "El número de serie",
  "asientos": "El número de asientos como entero (ej. 7)",
  "ejes": "El número de ejes como entero (ej. 2)",
  "color": "El color o colores del vehículo"
}`,

  dpi: `Eres un asistente especializado en extraer información del Documento Personal de Identificación (DPI) de Guatemala, emitido por el RENAP, y de pasaportes.
Tu única tarea es leer la imagen y devolver los datos EXACTAMENTE como aparecen impresos.
Devuelve ÚNICAMENTE un objeto JSON válido, sin bloques de código markdown, sin comentarios y sin explicaciones.

REGLA CRÍTICA: si un dato no se lee con claridad en la imagen, devuélvelo como null. NUNCA adivines, completes ni corrijas un dato — este documento se usa para trámites ante DIGECAM y un dato inventado es peor que un campo vacío.

DIRECTIVAS PARA IMÁGENES/PDFs DE BAJA RESOLUCIÓN O CALIDAD:
1. Si la imagen se encuentra pixelada, borrosa, con reflejos en el plástico o con baja iluminación, analiza con extrema paciencia y detalle los contornos y patrones de los caracteres.
2. El CUI de Guatemala consta de 13 dígitos distribuidos así: 4 dígitos de CUI + 4 dígitos de CUI + 1 dígito verificador + 2 dígitos del departamento + 2 dígitos del municipio de nacimiento. Utiliza esta estructura lógica para validar dígitos ambiguos (por ejemplo, distinguir '8' de '0', o '1' de '7').
3. No intentes adivinar ni inventar datos; si a pesar de las pasadas de análisis el dato no es legible con total seguridad, devuelve null.

EL DPI TIENE DOS CARAS Y CADA UNA TRAE COSAS DISTINTAS. Verificado contra un DPI real:
  · ANVERSO: CÓDIGO ÚNICO DE IDENTIFICACIÓN (CUI), NOMBRE, APELLIDO, NACIONALIDAD, PAÍS DE NAC., SEXO, FECHA DE NACIMIENTO, la firma, un número de versión al pie (ej. "004") y una fecha bajo la fotografía que es la de EMISIÓN.
  · REVERSO: LUGAR DE NACIMIENTO (dos líneas: primero el DEPARTAMENTO y debajo el MUNICIPIO), debajo una línea con el asiento del registro civil en la forma "L:102 F:42 P:263" (libro, folio y página de donde el RENAP tomó los datos al migrar de Cédula a DPI), VECINDAD (también departamento y municipio), ESTADO CIVIL, FECHA DE VENCIMIENTO, NÚMERO DE SERIE y la zona legible por máquina (MRZ).
Si te dan una sola cara, devuelve null en todo lo que no aparezca en ella. No deduzcas el reverso a partir del anverso ni al revés.

LA NACIONALIDAD Y EL PAÍS VIENEN COMO CÓDIGO ISO DE TRES LETRAS ("GTM"). Devuélvelo TAL CUAL, en mayúsculas; la app lo traduce a "Guatemala" o "Guatemalteca" según haga falta. No lo traduzcas tú.

CIRCULAN DOS DISEÑOS DE DPI Y AMBOS SON VÁLIDOS. Los dos se deben leer igual:
  · Diseño ANTERIOR: fotografía en blanco y negro o de menor calidad, rótulos únicamente en español, escudo de armas de Guatemala.
  · Diseño NUEVO (desde 2025): fotografía a COLOR, rótulos en español E INGLÉS, bandera nacional y un quetzal en lugar del escudo y de la pirámide, y puede incluir la DIRECCIÓN del titular, que el diseño anterior no traía.
No rechaces ni marques como inválido un documento por ser del diseño anterior: sigue vigente. Si los rótulos vienen en dos idiomas, toma el valor una sola vez (no lo dupliques). Si el diseño nuevo trae dirección y el anterior no, simplemente devuelve null cuando no aparezca.

Campos esperados:
{
  "documento": "'dpi' o 'pasaporte', según cuál sea la imagen",
  "cui": "El CUI/DPI de 13 dígitos, SIN espacios ni guiones (ej. '1605755322205'). En pasaporte, el número de pasaporte",
  "nombre_completo": "Nombres y apellidos completos tal como aparecen, en el orden en que aparecen",
  "fecha_nacimiento": "En formato YYYY-MM-DD. La tarjeta suele traerla como DD/MM/AAAA: conviértela",
  "lugar_nacimiento": "El lugar de nacimiento tal como aparece (municipio y departamento, o país si es extranjero)",
  "estado_civil": "Exactamente uno de: 'soltero(a)', 'casado(a)', 'unido(a)', 'divorciado(a)', 'viudo(a)'. Si el documento dice SOLTERO o SOLTERA, devuelve 'soltero(a)'. Si no aparece, null",
  "nacionalidad": "La nacionalidad que indique el documento (ej. 'Guatemalteca')",
  "sexo": "Exactamente 'masculino' o 'femenino', según el campo SEXO del anverso. Si no aparece, null",
  "nacimiento_departamento": "La PRIMERA línea de LUGAR DE NACIMIENTO (el departamento, ej. 'JUTIAPA'). Si no aparece, null",
  "nacimiento_municipio": "La SEGUNDA línea de LUGAR DE NACIMIENTO (el municipio o aldea, ej. 'SANTA CATARINA MITA'). Si no aparece, null",
  "vecindad_departamento": "La PRIMERA línea de VECINDAD (el departamento, ej. 'GUATEMALA'). Si no aparece, null",
  "vecindad_municipio": "La SEGUNDA línea de VECINDAD (el municipio, ej. 'FRAIJANES'). Si no aparece, null",
  "direccion": "La dirección del titular SÓLO si el documento la trae impresa (el diseño nuevo puede traerla; el anterior no). La VECINDAD no es la dirección: no la copies aquí. Si no aparece, null",
  "registro_libro": "El número que sigue a 'L:' en el reverso, bajo el lugar de nacimiento (ej. de 'L:102 F:42 P:263' devuelve '102'). Es el asiento del registro civil. Si no aparece, null",
  "registro_folio": "El número que sigue a 'F:' en esa misma línea (ej. '42'). Si no aparece, null",
  "registro_pagina": "El número que sigue a 'P:' en esa misma línea (ej. '263'). Si no aparece, null",
  "dpi_numero_serie": "El NÚMERO DE SERIE del reverso, tal como aparece. Si no aparece, null",
  "dpi_version": "El número de versión al pie del anverso (ej. '004'). Si no aparece, null",
  "fecha_emision": "La fecha bajo la fotografía del anverso, en formato YYYY-MM-DD. Viene como 17OCT2023: conviértela. Si no aparece, null",
  "fecha_vencimiento": "La FECHA DE VENCIMIENTO del reverso, en formato YYYY-MM-DD. Viene como 16OCT2033: conviértela. Si no aparece, null"
}`,

  licencia: `Eres un asistente especializado en leer LICENCIAS DE TENENCIA Y PORTACIÓN DE ARMA DE FUEGO emitidas por la DIGECAM (Dirección General de Control de Armas y Municiones) de Guatemala.
Tu única tarea es leer la imagen y devolver los datos EXACTAMENTE como aparecen impresos.
Devuelve ÚNICAMENTE un objeto JSON válido, sin bloques de código markdown, sin comentarios y sin explicaciones.

REGLA CRÍTICA: si un dato no se lee con claridad, devuélvelo como null. NUNCA adivines. De estos datos depende cuánta munición se le puede entregar legalmente al cliente (artículo 60 del Decreto 15-2009): un tipo de licencia inventado autoriza una entrega ilegal.

DIRECTIVAS PARA IMÁGENES/PDFs DE BAJA RESOLUCIÓN O CALIDAD:
1. Si la imagen se encuentra pixelada, borrosa, con reflejos en el plástico o con baja iluminación, analiza con extrema paciencia y detalle los contornos y patrones de los caracteres.
2. Compara y cruza los campos siempre que sea posible. Si no distingues con total seguridad un dato crítico, devuélvelo como null.

CÓMO ES UNA TARJETA DE TENENCIA (verificado contra ejemplares reales, en papel y electrónica):
Encabezado "MINISTERIO DE LA DEFENSA NACIONAL / DIRECCIÓN GENERAL DE CONTROL DE ARMAS Y MUNICIONES / TARJETA DE TENENCIA DE ARMA DE FUEGO", con el escudo de DIGECAM. Lleva "HUELLA BALISTICA No.", la leyenda "CIVIL ART. 9" y un "No." de tarjeta. Bloque IDENTIFICACIÓN con No. PROPIETARIO, PROPIETARIO, RESIDENCIA, DOMICILIO, DOCUMENTO PERSONAL DE IDENTIFICACIÓN (DPI) y NACIONALIDAD. Bloque DATOS DEL ARMA con TIPO, MARCA, MODELO, CALIBRE, No. DE SERIE y LARGO DEL CAÑÓN O CAÑONES **en milímetros**. Luego CONVERSIONES (con rayas si no tiene) y una línea "MARCAJE GUA" con TRES números, que es el troquelado del artículo 35. Cierra con lugar y fecha, firma de la Dirección DIGECAM y, en la versión electrónica, un código QR de verificación.

LA TARJETA DE TENENCIA **NO TIENE FECHA DE VENCIMIENTO**. Dice "CIVIL ART. 9" y no lleva vigencia. Si te dan una tenencia, devuelve fecha_vencimiento = null; NO tomes la fecha de emisión ni la del marcaje como vencimiento. La que sí vence es la LICENCIA DE PORTACIÓN, que es otro documento.

DISTINGUIR EL TIPO ES LO MÁS IMPORTANTE:
  · TENENCIA autoriza tener el arma en el domicilio o lugar de trabajo. Tope de 200 cartuchos al mes.
  · PORTACIÓN autoriza llevarla consigo fuera de esos lugares. Tope de 250 cartuchos por arma registrada.
Si el documento no dice con claridad cuál de los dos es, devuelve null en "tipo". No lo deduzcas del formato ni del color de la tarjeta.

Campos esperados:
{
  "tipo": "Exactamente 'tenencia' o 'portación'. Si el documento se titula 'TARJETA DE TENENCIA DE ARMA DE FUEGO', es 'tenencia'. Si no lo distingues con total seguridad, null",
  "numero": "El 'No.' de la tarjeta o licencia tal como aparece impreso, sin agregar ni quitar caracteres",
  "titular": "Nombre completo del titular (campo PROPIETARIO) tal como aparece",
  "cui": "El CUI/DPI del titular de 13 dígitos sin espacios ni guiones, si aparece; si no, null",
  "no_propietario": "El 'No. PROPIETARIO' que asigna DIGECAM al titular, si aparece; si no, null",
  "huella_balistica": "El 'HUELLA BALISTICA No.', si aparece; si no, null",
  "marcaje_gua": "Los números de la línea 'MARCAJE GUA' tal como aparecen, separados por espacio. Es el troquelado del art. 35. Si no aparece, null",
  "fecha_vencimiento": "Vencimiento en formato YYYY-MM-DD. SÓLO si el documento trae una fecha de vencimiento explícita. Una TARJETA DE TENENCIA no la trae: en ese caso devuelve null y NO uses la fecha de emisión",
  "fecha_emision": "Fecha de emisión en formato YYYY-MM-DD, si aparece; si no, null",
  "arma_tipo": "TIPO del arma (pistola, escopeta, revólver, rifle...), si el documento es una tarjeta de tenencia; si no, null",
  "arma_marca": "MARCA del arma, si aparece; si no, null",
  "arma_modelo": "MODELO del arma, si aparece; si no, null",
  "arma_calibre": "CALIBRE tal como aparece (ej. '9x19', '12'), si aparece; si no, null",
  "arma_serie": "No. DE SERIE del arma, si aparece; si no, null",
  "arma_largo_canon_mm": "LARGO DEL CAÑÓN en MILÍMETROS, sólo el número (ej. 102 de '102 mm', 530 de '530mm.'). La tarjeta lo trae en mm: NO lo conviertas a pulgadas. Si no aparece, null",
  "armas_registradas": "Cuántas armas ampara el documento, como número entero, SÓLO si lo indica explícitamente. Una tarjeta de tenencia ampara UNA arma. Si no lo dice, null — no supongas"
}`,

  recibo: `Eres un asistente especializado en extraer la DIRECCIÓN de un recibo de servicios de Guatemala (energía eléctrica, agua, teléfono o cable).
Se usa para verificar el domicilio de un cliente, así que la dirección debe salir tal como está impresa.
Devuelve ÚNICAMENTE un objeto JSON válido, sin markdown, sin comentarios y sin explicaciones.

REGLA CRÍTICA: si un dato no se lee con claridad, devuélvelo como null. NUNCA lo inventes ni lo completes.

Campos esperados:
{
  "titular": "El nombre del titular del servicio tal como aparece. IMPORTANTE: la app compara este nombre con el del cliente para deducir si la vivienda es propia o rentada, así que devuélvelo completo y sin corregir",
  "direccion": "La dirección completa del suministro, tal como está impresa, en una sola línea. Une las líneas del domicilio pero NO incluyas el municipio y departamento si vienen en renglón aparte: esos van en sus propios campos",
  "municipio": "El municipio del suministro si aparece (ej. 'FRAIJANES'), si no null",
  "departamento": "El departamento del suministro si aparece (ej. 'GUATEMALA'), si no null",
  "nit_titular": "El NIT del titular si aparece, si no null",
  "servicio": "Tipo de servicio: 'energía eléctrica', 'agua', 'teléfono', 'cable' u otro que indique",
  "empresa": "La empresa que emite el recibo (ej. EEGSA, EMPAGUA, Claro, Tigo)",
  "periodo": "El período o mes facturado tal como aparece, si aparece; si no, null",
  "fecha_emision": "Fecha de emisión en formato YYYY-MM-DD, si aparece; si no, null"
}`
};

/* Snapshot del tenant. `elevado` (admin/gerente/CEO) recibe TODA la info,
   incluyendo finanzas; los demás roles solo lo operativo (sin dinero/costos). */
async function snapshotTenant(admin: ReturnType<typeof createClient>, tenantId: string, elevado: boolean, conArmeria = false) {
  const hoy = new Date();
  const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);
  const seisMeses = new Date(hoy.getFullYear(), hoy.getMonth() - 6, hoy.getDate()).toISOString().slice(0, 10);
  const f = (q: any) => q.then((r: any) => r.data ?? []);
  const sum = (arr: any[], k: string) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);

  // ── Operativo (todos los roles) ──
  const [clientes, ordenesAbiertas, stockBajo, vehMantenimiento] = await Promise.all([
    admin.from("clientes").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
    f(admin.from("ordenes").select("num,estado,created_at").eq("tenant_id", tenantId)
      .not("estado", "in", '("entregado","cancelado")').limit(80)),
    f(admin.from("inventario").select("nombre,stock,min_stock").eq("tenant_id", tenantId).filter("stock", "lte", "min_stock").limit(40)),
    f(admin.from("vehiculos").select("placa,marca,modelo,ultima_visita,kilometraje").eq("tenant_id", tenantId)
      .or(`ultima_visita.is.null,ultima_visita.lt.${seisMeses}`).limit(40)),
  ]);

  const snap: Record<string, unknown> = {
    rol_acceso: elevado ? "completo (admin/gerente)" : "operativo",
    periodo: { desde: ini, hasta: fin },
    total_clientes: (clientes as any).count ?? 0,
    ordenes_abiertas: ordenesAbiertas.length,
    ordenes_por_estado: ordenesAbiertas.reduce((m: any, o: any) => { m[o.estado] = (m[o.estado] || 0) + 1; return m; }, {}),
    inventario_bajo: stockBajo.map((i: any) => ({ nombre: i.nombre, stock: i.stock, min: i.min_stock })),
    vehiculos_mantenimiento_pendiente: vehMantenimiento.map((v: any) => ({
      placa: v.placa, vehiculo: `${v.marca ?? ""} ${v.modelo ?? ""}`.trim(),
      ultima_visita: v.ultima_visita ?? "sin registro", km: v.kilometraje ?? null,
    })),
  };

  /* ── ARMERÍA ──
     Va ANTES del corte por rol a propósito: esto es OPERATIVO, no financiero.
     Quien atiende el mostrador necesita saber si a un cliente le queda saldo
     de munición o si su expediente está incompleto — negárselo lo obligaría a
     vender a ciegas. Lo que sigue detrás del corte son los montos, no la ley. */
  if (conArmeria) {
    const [saldos, entregasMes, sinExpediente] = await Promise.all([
      f(admin.from("armeria_municion_saldos")
        .select("calibre,comprado,entregado,saldo,clientes(nombre)")
        .eq("tenant_id", tenantId).gt("saldo", 0).limit(60)),
      f(admin.from("armeria_municion_entregas")
        .select("cantidad,calibre,fecha,licencia_tipo,codigo_autorizacion_digecam,clientes(nombre)")
        .eq("tenant_id", tenantId).gte("fecha", ini).lte("fecha", fin).limit(200)),
      /* Un cliente sin tipo de licencia no puede comprar munición: es el hueco
         que más frena una venta en el mostrador. */
      f(admin.from("clientes").select("nombre,licencia_tipo,licencia_vencimiento,dpi_fecha_vencimiento")
        .eq("tenant_id", tenantId).is("licencia_tipo", null).limit(40)),
    ]);

    const hoyISO = hoy.toISOString().slice(0, 10);
    snap.armeria = {
      municion_pendiente_de_entregar: saldos.map((s: any) => ({
        cliente: s.clientes?.nombre ?? "—", calibre: s.calibre,
        comprado: s.comprado, entregado: s.entregado, le_queda: s.saldo,
      })),
      entregas_del_mes: entregasMes.length,
      cartuchos_entregados_del_mes: sum(entregasMes, "cantidad"),
      /* Sin código de DIGECAM la entrega quedó sin su respaldo real: el conteo
         propio es sólo una referencia parcial (cuota nacional, reglamento
         art. 21), así que conviene que Nexus pueda señalarlas. */
      entregas_sin_codigo_digecam: entregasMes.filter((e: any) => !e.codigo_autorizacion_digecam).length,
      clientes_sin_tipo_de_licencia: sinExpediente.map((c: any) => c.nombre),
      recordatorio_legal:
        "Tope del art. 60: 200 cartuchos al mes con TENENCIA y 250 POR ARMA REGISTRADA con PORTACIÓN " +
        "(máximo 3 armas según el art. 72, o sea 750). El conteo de esta app es una REFERENCIA PARCIAL: " +
        "la cuota es nacional por persona y aquí sólo se ven las entregas de este comercio. " +
        "La tarjeta de tenencia NO vence; la licencia de portación sí.",
      fecha_de_hoy: hoyISO,
    };
  }

  if (!elevado) return snap;

  // ── Financiero / sensible (solo admin/gerente/CEO) ──
  const [ordTotales, ingresosMes, egresosMes, facturasMes, inventarioVal, empleados, pagosMes, proveedores, cuentas] =
    await Promise.all([
      f(admin.from("ordenes").select("total,saldo,estado").eq("tenant_id", tenantId).not("estado", "in", '("cancelado")').limit(500)),
      f(admin.from("ingresos").select("monto,fecha").eq("tenant_id", tenantId).gte("fecha", ini).lte("fecha", fin)),
      f(admin.from("egresos").select("monto,categoria,fecha").eq("tenant_id", tenantId).gte("fecha", ini).lte("fecha", fin)),
      f(admin.from("facturas").select("total,estado,fecha").eq("tenant_id", tenantId).gte("fecha", ini).lte("fecha", fin)),
      f(admin.from("inventario").select("stock,precio_costo,precio_venta").eq("tenant_id", tenantId).limit(2000)),
      admin.from("empleados").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("activo", true),
      f(admin.from("pagos_nomina").select("liquido,periodo_mes,periodo_anio").eq("tenant_id", tenantId).eq("periodo_mes", hoy.getMonth() + 1).eq("periodo_anio", hoy.getFullYear())),
      admin.from("proveedores").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
      f(admin.from("bancos").select("nombre,banco,saldo_inicial,moneda").eq("tenant_id", tenantId)),
    ]);

  snap.finanzas = {
    ingresos_mes: sum(ingresosMes, "monto"),
    egresos_mes: sum(egresosMes, "monto"),
    utilidad_mes: sum(ingresosMes, "monto") - sum(egresosMes, "monto"),
    facturado_mes: sum(facturasMes, "total"),
    saldo_por_cobrar: sum(ordTotales, "saldo"),
    valor_total_ordenes_activas: sum(ordTotales, "total"),
    nomina_mes: sum(pagosMes, "liquido"),
  };
  snap.inventario_valor = {
    items: inventarioVal.length,
    valor_costo: sum(inventarioVal.map((i: any) => ({ v: Number(i.stock) * Number(i.precio_costo || 0) })), "v"),
    valor_venta: sum(inventarioVal.map((i: any) => ({ v: Number(i.stock) * Number(i.precio_venta || 0) })), "v"),
  };
  snap.equipo = { empleados_activos: (empleados as any).count ?? 0, proveedores: (proveedores as any).count ?? 0 };
  snap.cuentas_bancarias = cuentas.map((c: any) => ({ nombre: c.nombre, banco: c.banco, saldo_inicial: c.saldo_inicial, moneda: c.moneda }));
  return snap;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: `${NOMBRE} (Asistente IA) aún no está configurado (falta la API key de Claude).` }, 503);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Autenticación del caller ──
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Falta sesión" }, 401);

  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await asCaller.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Sesión inválida" }, 401);

  // Usamos asCaller en lugar del cliente admin de service role para evitar problemas de permisos de esquema
  const { data: perfil } = await asCaller.from("usuarios")
    .select("tenant_id, rol").eq("id", userData.user.id).maybeSingle();
  const tenantId = (perfil as any)?.tenant_id;
  const rol = (perfil as any)?.rol;
  if (!tenantId) return json({ error: "Sin taller asociado a tu usuario" }, 403);
  const elevado = userData.user.email?.toLowerCase() === "henry.chinchilla@gmail.com" ||
    ["superadmin", "admin", "gerente_fin", "gerente_tal"].includes(rol);

  // ── Gating comercial: módulo 'ia' + tope mensual ──
  // Mismo criterio que el frontend: modulos_activos (a la carta) manda;
  // si no hay override, 'ia' viene incluido solo en el plan Empresarial;
  // planes legacy/desconocidos no se bloquean. El superadmin está exento.
  const esSuperadmin = userData.user.email?.toLowerCase() === "henry.chinchilla@gmail.com" ||
    rol === "superadmin";
  if (!esSuperadmin) {
    const { data: tn } = await asCaller.from("tenants")
      .select("plan, modulos_activos, ai_limite_mes").eq("id", tenantId).maybeSingle();

    let iaHabilitada = true;
    if (Array.isArray(tn?.modulos_activos) && tn.modulos_activos.length) {
      iaHabilitada = tn.modulos_activos.includes("ia");
    } else if (["basico", "pro", "medida"].includes(tn?.plan)) {
      iaHabilitada = false;
    }
    if (!iaHabilitada) {
      return json({
        error: `${NOMBRE} (Asistente IA) no está incluido en tu plan. Pídelo como módulo adicional a tu proveedor de NexusPro.`,
      }, 403);
    }

    const limite = Number(tn?.ai_limite_mes) || LIMITE_DEFAULT;
    const hoy = new Date();
    const iniMes = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const { count } = await asCaller.from("ai_conversaciones")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId).gte("created_at", iniMes);
    if ((count ?? 0) >= limite) {
      return json({
        error: `Alcanzaste el límite mensual de consultas de ${NOMBRE} (${limite}). Si necesitas más, pide una ampliación a tu proveedor de NexusPro.`,
      }, 429);
    }
  }

  // ── Payload ──
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const modo: string = body.modo ?? "chat";
  const mensaje: string = body.mensaje ?? "";
  const contexto = body.contexto ?? {};

  if (!PROMPTS[modo]) return json({ error: "Modo no válido" }, 400);

  /* Modos que leen una imagen y devuelven JSON. Comparten toda la mecánica
     (validar el base64, armar el bloque de imagen); lo único distinto es el
     prompt del sistema y la instrucción que acompaña a la foto.

     Declarado ANTES de la validación de `mensaje` (antes estaba después, y la
     validación repetía a mano la lista de modos-imagen: "dpi","recibo",...).
     "licencia" tiene su prompt acá abajo desde que se agregó (commit 8e94fa7)
     pero NUNCA se agregó a esa lista aparte, así que cada lectura de licencia
     o de tarjeta de tenencia (que reusa este mismo modo) se rechazaba con
     "Falta el mensaje" antes de siquiera mirar la imagen — semanas rota pese
     a que el lado del cliente (cámara, prompt, mapeo de campos) siempre
     estuvo bien. Ahora hay una sola lista (esta), así que un modo-imagen
     nuevo no puede volver a quedar afuera de la excepción. */
  const MODOS_IMAGEN: Record<string, string> = {
    tarjeta: "Analiza la imagen de la tarjeta de circulación de Guatemala y extrae los datos solicitados en formato JSON.",
    /* LAS DOS CARAS TRAEN DATOS Y LAS DOS SE LEEN.
       Acá había una premisa falsa: se decía que el anverso traía el lugar de
       nacimiento, la vecindad, el estado civil y el vencimiento, y se le
       ORDENABA al modelo devolver todo null si le daban el reverso.
       Verificado contra la lectura real de un DPI: el anverso devuelve CUI,
       nombre, fecha de nacimiento, nacionalidad, sexo y versión — y null en
       todo lo demás, porque lo demás está impreso ATRÁS. Con esa instrucción,
       ocho campos del expediente no se podían llenar nunca.
       El prompt del sistema ya describe bien cada cara y ordena devolver null
       en lo que no aparezca; el frontend sólo llena campos vacíos, así que
       una cara no puede pisar lo que trajo la otra. */
    dpi:     "Analiza la imagen del DPI de Guatemala (o de la hoja de datos de un pasaporte) y extrae los datos solicitados en formato JSON. Puede ser el ANVERSO o el REVERSO: lee la cara que te den y devuelve null en todo lo que no aparezca en ella. El REVERSO es igual de importante que el anverso — de ahí salen el lugar de nacimiento, la vecindad, el estado civil, el asiento del registro civil (L: F: P:), el número de serie y la fecha de vencimiento. Si un dato no se lee con claridad, devuélvelo como null en vez de adivinarlo.",
    recibo:  "Analiza la imagen del recibo de servicios y extrae los datos solicitados en formato JSON. Si un dato no se lee con claridad, devuélvelo como null en vez de adivinarlo.",
    licencia: "Analiza la imagen de la licencia de tenencia o portación de arma emitida por DIGECAM (Guatemala) y extrae los datos solicitados en formato JSON. El tipo sólo puede ser 'tenencia' o 'portación': si no lo distingues con total seguridad, devuélvelo null. Si un dato no se lee con claridad, devuélvelo como null en vez de adivinarlo.",
  };

  /* Los modos de imagen y `insights` no llevan mensaje de texto. */
  if (!mensaje && modo !== "insights" && !MODOS_IMAGEN[modo]) {
    return json({ error: "Falta el mensaje" }, 400);
  }

  // ── Construir el contenido del usuario ──
  let userContent = "";
  let messagesPayload: any[] = [];
  let sistemaPrompt = PROMPTS[modo]; // puede ser sobreescrito por persona dinámica en chat/insights
  let modsDelRol: string[] = []; // módulos que este rol puede tocar (para gating de web_search)

  if (MODOS_IMAGEN[modo]) {
    const base64Data = body.imagen_base64;
    if (!base64Data) {
      return json({ error: "Falta la imagen" }, 400);
    }
    let mediaType = "image/jpeg";
    let base64Raw = base64Data;
    if (base64Data.startsWith("data:")) {
      const parts = base64Data.split(",");
      const meta = parts[0];
      base64Raw = parts[1];
      mediaType = meta.split(";")[0].split(":")[1] || "image/jpeg";
    }
    /* Los recibos de servicios llegan casi siempre en PDF (EEGSA los emite
       así), y hasta ahora se rechazaban en silencio: por eso la dirección
       nunca se llenaba sola. La API acepta PDF con un bloque `document`, que
       es lo mismo pero con otro nombre. */
    const esPDF = mediaType === 'application/pdf';
    if ((!['image/jpeg', 'image/png', 'image/webp'].includes(mediaType) && !esPDF) || !/^[A-Za-z0-9+/=]+$/.test(base64Raw) || base64Raw.length > 7_000_000) {
      return json({ error: "La imagen debe ser JPG, PNG o WebP y pesar como máximo 5 MB." }, 400);
    }
    messagesPayload = [
      {
        role: "user",
        content: [
          {
            type: esPDF ? "document" : "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64Raw,
            },
          },
          {
            type: "text",
            text: MODOS_IMAGEN[modo],
          },
        ],
      },
    ];
  } else if (modo === "chat" || modo === "insights") {

    // Persona adaptativa: módulos del tenant, cruzados con lo que el ROL puede
    // tocar. Antes solo miraba el tenant — un mecánico veía en Beto TODO lo
    // que el comercio tuviera activo (ej. armería), sin importar su rol.
    let personaDinamica = BASE_GT;
    {
      const { data: tnMods } = await asCaller.from("tenants")
        .select("modulos_activos, plan").eq("id", tenantId).maybeSingle();
      const modsTenant: string[] = Array.isArray(tnMods?.modulos_activos) && tnMods.modulos_activos.length
        ? tnMods.modulos_activos : [];
      const sinRestriccionTenant = modsTenant.length === 0; // legacy: taller sin multi-negocio configurado
      modsDelRol = sinRestriccionTenant ? modsTenant : modulosPermitidosPorRol(rol, modsTenant);
      personaDinamica = buildBetoPersona(NOMBRE, modsDelRol, sinRestriccionTenant);
    }

    // Historial de las últimas 3 conversaciones para dar contexto continuo a Beto
    let historialCtx: Array<{ role: "user" | "assistant"; content: string }> = [];
    if (modo === "chat") {
      const { data: prevConvs } = await asCaller
        .from("ai_conversaciones")
        .select("pregunta, respuesta")
        .eq("tenant_id", tenantId)
        .eq("usuario_id", userData.user.id)
        .eq("modo", "chat")
        .order("created_at", { ascending: false })
        .limit(3);
      if (prevConvs && prevConvs.length > 0) {
        historialCtx = [...prevConvs].reverse().flatMap((c: any) => [
          { role: "user" as const, content: c.pregunta },
          { role: "assistant" as const, content: c.respuesta },
        ]);
      }
    }

    /* El bloque de armería sólo se arma si el ROL puede tocar ese módulo: un
       mecánico no tiene por qué ver el saldo de munición de un cliente. */
    const snap = await snapshotTenant(asCaller, tenantId, elevado, modsDelRol.includes("armeria"));
    userContent = `Fecha de hoy: ${new Date().toISOString().slice(0, 10)}\n` +
      `Snapshot del negocio (JSON):\n${JSON.stringify(snap, null, 2)}\n\n` +
      (modo === "insights" ? "Genera el resumen ejecutivo." : `Pregunta: ${mensaje}`);
    messagesPayload = [...historialCtx, { role: "user", content: userContent }];
    // Sobreescribir sistema prompt con persona adaptada al tenant
    sistemaPrompt = personaDinamica + "\n" + (modo === "insights"
      ? "Genera un resumen ejecutivo del estado del negocio a partir del snapshot: tendencia de ingresos, alertas y 2-3 recomendaciones accionables. Usa viñetas y sé breve."
      : `Tienes dos fuentes:\n1) Tu conocimiento técnico del servicio activo — úsalo libremente.\n2) El snapshot de datos del negocio — úsalo SOLO para preguntas del negocio.\nPara datos que NO estén en el snapshot, dilo en vez de inventarlos.\nCuando des cifras de dinero, formateálas en Quetzales (Q).\n${SUGERENCIA_RECURSOS}`);
  } else {
    userContent = contexto && Object.keys(contexto).length
      ? `Contexto (JSON): ${JSON.stringify(contexto)}\n\nSolicitud: ${mensaje}`
      : mensaje;
    messagesPayload = [{ role: "user", content: userContent }];
  }

  // ── Llamar a Claude (fetch directo) ──
  /* Búsqueda web real (no solo sugerir un enlace de YouTube/Google, que es lo
     que hace SUGERENCIA_RECURSOS): solo para los giros que la pidieron —
     armería para verificar trámites DIGECAM vigentes, granos para precios y
     noticias de mercado que el snapshot no trae. No se prende para todos:
     cada búsqueda tiene costo. max_uses:3 acota el gasto por consulta.
     ponytail: tool_type básico (web_search_20250305), compatible con Haiku
     (el modelo por defecto) — subir a la variante con filtrado dinámico si
     algún tenant usa un modelo Opus/Sonnet y se justifica el costo extra. */
  const necesitaBusquedaWeb = (modo === "chat" || modo === "insights") &&
    (modsDelRol.includes("armeria") || modsDelRol.includes("agroservicio") || modsDelRol.includes("venta_granos"));

  const modelToUse = MODOS_IMAGEN[modo] ? (Deno.env.get("AI_MODEL_VISION") ?? "claude-3-5-sonnet-20241022") : MODELO;
  const soportaThinking = modelToUse.includes("claude-3-7") || modelToUse.includes("claude-3-8") || modelToUse.includes("fable");

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelToUse,
        max_tokens: 4096,
        /* thinking adaptativo + effort solo existen en modelos compatibles;
           Haiku y Sonnet 3.5 los rechazan, así que se omiten si no se soporta */
        ...(soportaThinking ? {
          thinking: { type: "adaptive" },
          output_config: { effort: EFFORT },
        } : {}),
        system: sistemaPrompt,
        messages: messagesPayload,
        ...(necesitaBusquedaWeb ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] } : {}),
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const m = data?.error?.message ?? `HTTP ${r.status}`;
      const friendly = r.status === 429 ? `${NOMBRE} está ocupado, intenta en unos segundos`
        : r.status === 401 ? "La API key de Claude no es válida"
        : m;
      return json({ error: friendly }, r.status);
    }

    const texto = (data.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    // Log + FIFO: guarda la consulta y mantiene solo las últimas 10 por usuario
    if (tenantId) {
      asCaller.from("ai_conversaciones").insert({
        tenant_id: tenantId, usuario_id: userData.user.id,
        modo, pregunta: mensaje || "(insights)", respuesta: texto,
      }).then(async () => {
        // FIFO automático: eliminar las más antiguas si superan el límite de 10
        const { data: todas } = await asCaller
          .from("ai_conversaciones")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("usuario_id", userData.user.id)
          .order("created_at", { ascending: false });
        if (todas && todas.length > 10) {
          const idsViejos = todas.slice(10).map((c: any) => c.id);
          await asCaller.from("ai_conversaciones").delete().in("id", idsViejos);
        }
      }, () => {});
    }

    return json({ ok: true, texto });
  } catch (e: any) {
    return json({ error: e?.message ?? "Error al contactar la IA" }, 500);
  }
});
