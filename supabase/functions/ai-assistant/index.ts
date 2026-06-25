// ═══════════════════════════════════════════════════════
// Edge Function: ai-assistant — "Beto", asistente mecánico de TallerPro.
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
};

/* Construye la identidad y conocimiento de Beto según módulos activos del tenant.
   Si modulos=[] (sin override) → experto en todo (comportamiento legacy). */
function buildBetoPersona(nombre: string, modulos: string[]): string {
  const tiene = (m: string) => !modulos.length || modulos.includes(m);
  const tieneMec  = tiene("ordenes") || tiene("vehiculos");
  const tieneHer  = tiene("herreria");
  const tienePel  = tiene("peleteria");
  const tieneElec = tiene("electronica");
  const tieneRef  = tiene("refrigeracion");
  const nEspec    = [tieneHer, tienePel, tieneElec, tieneRef].filter(Boolean).length;

  let identidad: string;
  if (!modulos.length) {
    identidad = `Eres ${nombre}, el asistente de TallerPro. Eres experto en mecánica automotriz y en todos los servicios especializados de la plataforma.`;
  } else if (tieneMec && nEspec === 0) {
    identidad = `Eres ${nombre}, el asistente mecánico de TallerPro. Trato amable y directo, de mecánico a mecánico.`;
  } else if (!tieneMec && tieneHer && nEspec === 1) {
    identidad = `Eres ${nombre}, asistente experto en herrería y ventanería de TallerPro. Conoces portones, estructuras metálicas, PVC y aluminio a fondo.`;
  } else if (!tieneMec && tienePel && nEspec === 1) {
    identidad = `Eres ${nombre}, asistente experto en peletería y talabartería de TallerPro. Conoces cuero, calzado, bolsos y artículos de piel.`;
  } else if (!tieneMec && tieneElec && nEspec === 1) {
    identidad = `Eres ${nombre}, asistente experto en reparación electrónica y electrodomésticos de TallerPro. Diagnosticas y asesoras en celulares, laptops, TVs, refrigeradoras, lavadoras y todo tipo de aparatos eléctricos.`;
  } else if (!tieneMec && tieneRef && nEspec === 1) {
    identidad = `Eres ${nombre}, asistente experto en refrigeración y aire acondicionado de TallerPro. Conoces gases refrigerantes, presiones, diagnóstico de fugas y sistemas A/C.`;
  } else {
    identidad = `Eres ${nombre}, asistente de TallerPro para negocios de servicio en Guatemala. Eres experto en los servicios que maneja este negocio.`;
  }

  const modsActivos = Object.keys(MOD_CONOCIMIENTO).filter(m => tiene(m));
  return `${identidad}
Hablas en español guatemalteco, claro y directo. La moneda es el Quetzal (Q).

ÁREAS DE CONOCIMIENTO Y SERVICIO:
${modsActivos.map(m => MOD_CONOCIMIENTO[m]).join("\n")}

REGLA IMPORTANTE: Responde SIEMPRE preguntas técnicas sobre diagnóstico, fallas y reparación de cualquier equipo dentro de tus áreas de conocimiento — aunque ese equipo específico no esté registrado como orden en el sistema. Tu expertise técnica va más allá de lo que está en la base de datos del negocio.`;
}

/* Persona base como fallback (todo incluido) */
const BASE_GT = buildBetoPersona(NOMBRE, []);

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
}`
};

/* Snapshot del tenant. `elevado` (admin/gerente/CEO) recibe TODA la info,
   incluyendo finanzas; los demás roles solo lo operativo (sin dinero/costos). */
async function snapshotTenant(admin: ReturnType<typeof createClient>, tenantId: string, elevado: boolean) {
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
  let tenantId = (perfil as any)?.tenant_id;
  const rol = (perfil as any)?.rol;
  const elevado = userData.user.email?.toLowerCase() === "henry.chinchilla@gmail.com" ||
    ["superadmin", "admin", "gerente_fin", "gerente_tal"].includes(rol);

  if (!tenantId) {
    const { data: t } = await asCaller.from("tenants").select("id").limit(1).maybeSingle();
    tenantId = t?.id;
  }

  // ── Gating comercial: módulo 'ia' + tope mensual ──
  // Mismo criterio que el frontend: modulos_activos (a la carta) manda;
  // si no hay override, 'ia' viene incluido solo en el plan Empresarial;
  // planes legacy/desconocidos no se bloquean. El superadmin está exento.
  const esSuperadmin = userData.user.email?.toLowerCase() === "henry.chinchilla@gmail.com" ||
    rol === "superadmin";
  if (!esSuperadmin && tenantId) {
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
        error: `${NOMBRE} (Asistente IA) no está incluido en tu plan. Pídelo como módulo adicional a tu proveedor de TallerPro.`,
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
        error: `Alcanzaste el límite mensual de consultas de ${NOMBRE} (${limite}). Si necesitas más, pide una ampliación a tu proveedor de TallerPro.`,
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
  if (!mensaje && modo !== "insights" && modo !== "tarjeta") return json({ error: "Falta el mensaje" }, 400);

  // ── Construir el contenido del usuario ──
  let userContent = "";
  let messagesPayload: any[] = [];
  let sistemaPrompt = PROMPTS[modo]; // puede ser sobreescrito por persona dinámica en chat/insights

  if (modo === "tarjeta") {
    const base64Data = body.imagen_base64;
    if (!base64Data) {
      return json({ error: "Falta la imagen de la tarjeta" }, 400);
    }
    let mediaType = "image/jpeg";
    let base64Raw = base64Data;
    if (base64Data.startsWith("data:")) {
      const parts = base64Data.split(",");
      const meta = parts[0];
      base64Raw = parts[1];
      mediaType = meta.split(";")[0].split(":")[1] || "image/jpeg";
    }
    messagesPayload = [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64Raw,
            },
          },
          {
            type: "text",
            text: "Analiza la imagen de la tarjeta de circulación de Guatemala y extrae los datos solicitados en formato JSON.",
          },
        ],
      },
    ];
  } else if (modo === "chat" || modo === "insights") {
    if (!tenantId) return json({ error: "Sin taller asociado a tu usuario" }, 400);

    // Persona adaptativa: obtener módulos activos del tenant
    let personaDinamica = BASE_GT;
    {
      const { data: tnMods } = await asCaller.from("tenants")
        .select("modulos_activos, plan").eq("id", tenantId).maybeSingle();
      const mods: string[] = Array.isArray(tnMods?.modulos_activos) && tnMods.modulos_activos.length
        ? tnMods.modulos_activos : [];
      personaDinamica = buildBetoPersona(NOMBRE, mods);
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

    const snap = await snapshotTenant(asCaller, tenantId, elevado);
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
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 4096,
        /* thinking adaptativo + effort solo existen en Opus 4.6+/Fable;
           Haiku los rechaza, así que se omiten para ese modelo */
        ...(MODELO.includes("haiku") ? {} : {
          thinking: { type: "adaptive" },
          output_config: { effort: EFFORT },
        }),
        system: sistemaPrompt,
        messages: messagesPayload,
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
