// ═══════════════════════════════════════════════════════
// Edge Function: ai-assistant
// Asistente de IA de TallerPro — proxy seguro a la API de Claude.
//
// La ANTHROPIC_API_KEY vive SOLO en el servidor (secret de Supabase),
// nunca en el navegador. Usa fetch directo a la API (sin dependencias).
//
// Modos:
//   diagnostico → sugiere fallas/repuestos a partir de síntomas
//   redaccion   → redacta descripciones de OT, cotizaciones, mensajes
//   chat        → responde preguntas en lenguaje natural sobre los datos
//   insights    → resumen ejecutivo del negocio (ingresos, alertas, etc.)
//
// chat/insights se aterrizan en un snapshot del tenant del usuario
// (consultado con service role, filtrado por su tenant_id).
//
// Deploy:  supabase functions deploy ai-assistant
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Opcionales: AI_MODEL (def. claude-opus-4-8), AI_EFFORT (def. medium)
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

const MODELO = Deno.env.get("AI_MODEL") ?? "claude-opus-4-8";
const EFFORT = Deno.env.get("AI_EFFORT") ?? "medium";

const BASE_GT = `Eres el asistente de IA de TallerPro, un sistema de gestión para talleres
mecánicos en Guatemala. Respondes en español guatemalteco, claro y conciso.
La moneda es el Quetzal (Q).`;

const PROMPTS: Record<string, string> = {
  diagnostico: `${BASE_GT}
Eres además un mecánico experto. A partir de los síntomas y datos del vehículo,
sugiere las fallas más probables (ordenadas por probabilidad), los repuestos o
revisiones que típicamente se necesitan, y una estimación de complejidad
(baja/media/alta). Sé práctico. Advierte que es una sugerencia preliminar y que
se debe confirmar con diagnóstico físico.`,
  redaccion: `${BASE_GT}
Redacta el texto solicitado de forma profesional y breve. Si es un mensaje para
un cliente, usa un tono amable y cercano. No inventes datos que no se te den.`,
  chat: `${BASE_GT}
Responde la pregunta del usuario usando ÚNICAMENTE el snapshot de datos del taller
que se incluye. Si el dato no está en el snapshot, dilo claramente en vez de
inventarlo. Cuando des cifras, formatéalas en Quetzales (Q).`,
  insights: `${BASE_GT}
Genera un resumen ejecutivo del estado del taller a partir del snapshot: tendencia
de ingresos, alertas (inventario bajo, OT atrasadas, saldos por cobrar) y 2-3
recomendaciones accionables. Usa viñetas y sé breve.`,
};

/* Snapshot compacto del tenant para aterrizar chat/insights */
async function snapshotTenant(admin: ReturnType<typeof createClient>, tenantId: string) {
  const hoy = new Date();
  const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);
  const f = (q: any) => q.then((r: any) => r.data ?? []);

  const [clientes, ordenesAbiertas, ingresosMes, egresosMes, stockBajo, facturasMes] =
    await Promise.all([
      admin.from("clientes").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
      f(admin.from("ordenes").select("num,estado,total,saldo,created_at").eq("tenant_id", tenantId)
        .not("estado", "in", '("entregado","cancelado")').limit(50)),
      f(admin.from("ingresos").select("monto,fecha").eq("tenant_id", tenantId).gte("fecha", ini).lte("fecha", fin)),
      f(admin.from("egresos").select("monto,fecha").eq("tenant_id", tenantId).gte("fecha", ini).lte("fecha", fin)),
      f(admin.from("inventario").select("nombre,stock,min_stock").eq("tenant_id", tenantId).filter("stock", "lte", "min_stock").limit(30)),
      f(admin.from("facturas").select("total,estado,fecha").eq("tenant_id", tenantId).gte("fecha", ini).lte("fecha", fin)),
    ]);

  const sum = (arr: any[], k: string) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
  return {
    periodo: { desde: ini, hasta: fin },
    total_clientes: (clientes as any).count ?? 0,
    ordenes_abiertas: ordenesAbiertas.length,
    saldo_por_cobrar: sum(ordenesAbiertas, "saldo"),
    ingresos_mes: sum(ingresosMes, "monto"),
    egresos_mes: sum(egresosMes, "monto"),
    facturado_mes: sum(facturasMes, "total"),
    inventario_bajo: stockBajo.map((i: any) => ({ nombre: i.nombre, stock: i.stock, min: i.min_stock })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "El Asistente IA aún no está configurado (falta la API key de Claude)." }, 503);

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

  const admin = createClient(url, serviceKey);
  const { data: perfil } = await admin.from("usuarios")
    .select("tenant_id, rol").eq("id", userData.user.id).maybeSingle();
  const tenantId = (perfil as any)?.tenant_id;

  // ── Payload ──
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const modo: string = body.modo ?? "chat";
  const mensaje: string = body.mensaje ?? "";
  const contexto = body.contexto ?? {};

  if (!PROMPTS[modo]) return json({ error: "Modo no válido" }, 400);
  if (!mensaje && modo !== "insights") return json({ error: "Falta el mensaje" }, 400);

  // ── Construir el contenido del usuario ──
  let userContent = "";
  if (modo === "chat" || modo === "insights") {
    if (!tenantId) return json({ error: "Sin taller asociado a tu usuario" }, 400);
    const snap = await snapshotTenant(admin, tenantId);
    userContent = `Fecha de hoy: ${new Date().toISOString().slice(0, 10)}\n` +
      `Snapshot del taller (JSON):\n${JSON.stringify(snap, null, 2)}\n\n` +
      (modo === "insights" ? "Genera el resumen ejecutivo." : `Pregunta: ${mensaje}`);
  } else {
    userContent = `Contexto (JSON): ${JSON.stringify(contexto)}\n\nSolicitud: ${mensaje}`;
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
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
        system: PROMPTS[modo],
        messages: [{ role: "user", content: userContent }],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const m = data?.error?.message ?? `HTTP ${r.status}`;
      const friendly = r.status === 429 ? "IA ocupada, intenta en unos segundos"
        : r.status === 401 ? "La API key de Claude no es válida"
        : m;
      return json({ error: friendly }, r.status);
    }

    const texto = (data.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    // Log opcional (no bloquea si la tabla no existe aún)
    if (tenantId) {
      admin.from("ai_conversaciones").insert({
        tenant_id: tenantId, usuario_id: userData.user.id,
        modo, pregunta: mensaje || "(insights)", respuesta: texto,
      }).then(() => {}, () => {});
    }

    return json({ ok: true, texto });
  } catch (e: any) {
    return json({ error: e?.message ?? "Error al contactar la IA" }, 500);
  }
});
