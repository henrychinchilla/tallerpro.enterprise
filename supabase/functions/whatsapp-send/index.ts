// ═══════════════════════════════════════════════════════
// Edge Function: whatsapp-send
// Envía mensajes de WhatsApp vía Meta Cloud API (Graph).
//
// Credenciales SOLO en el servidor (secrets de Supabase). Mientras la
// afiliación con Meta Business esté en validación, simplemente no se
// configuran los secrets y la función responde 503 sin romper nada.
//
// Soporta:
//   tipo="text"     → texto libre (solo válido dentro de la ventana de 24h
//                     tras un mensaje del cliente)
//   tipo="template" → plantilla pre-aprobada (para iniciar conversación)
//
// Deploy:  supabase functions deploy whatsapp-send
// Secrets:
//   supabase secrets set WHATSAPP_TOKEN=EAAG...
//   supabase secrets set WHATSAPP_PHONE_ID=123456789012345
//   (opcional) WHATSAPP_API_VERSION=v21.0
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

/* Normaliza a formato internacional GT si viene sin código de país */
function normalizarTel(tel: string): string {
  const d = (tel || "").replace(/[^0-9]/g, "");
  if (d.length === 8) return "502" + d;          // Guatemala
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const TOKEN = Deno.env.get("WHATSAPP_TOKEN");
  const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
  const VERSION = Deno.env.get("WHATSAPP_API_VERSION") ?? "v21.0";
  if (!TOKEN || !PHONE_ID) {
    return json({ error: "WhatsApp no configurado (Meta Business pendiente)" }, 503);
  }

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
    .select("tenant_id").eq("id", userData.user.id).maybeSingle();
  const tenantId = (perfil as any)?.tenant_id ?? null;

  // ── Payload ──
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const tipo: string = body.tipo ?? "text";
  const to = normalizarTel(body.to ?? "");
  if (!to) return json({ error: "Número de destino inválido" }, 400);

  let payload: any;
  let resumen = "";
  if (tipo === "template") {
    const nombre = body.template?.name;
    const lang = body.template?.language ?? "es";
    if (!nombre) return json({ error: "Falta el nombre de la plantilla" }, 400);
    payload = {
      messaging_product: "whatsapp", to, type: "template",
      template: {
        name: nombre,
        language: { code: lang },
        components: body.template?.components ?? [],
      },
    };
    resumen = `[plantilla:${nombre}]`;
  } else {
    const texto = body.texto ?? "";
    if (!texto) return json({ error: "Falta el texto" }, 400);
    payload = { messaging_product: "whatsapp", to, type: "text", text: { body: texto, preview_url: true } };
    resumen = texto.slice(0, 200);
  }

  // ── Llamar a Meta Cloud API ──
  let estado = "enviado", errorMsg: string | null = null, waId: string | null = null;
  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) {
      estado = "error";
      errorMsg = data?.error?.message ?? `HTTP ${r.status}`;
    } else {
      waId = data?.messages?.[0]?.id ?? null;
    }
  } catch (e: any) {
    estado = "error";
    errorMsg = e?.message ?? "Error de red";
  }

  // ── Registrar en la bitácora (no bloquea) ──
  if (tenantId) {
    admin.from("mensajes").insert({
      tenant_id: tenantId, canal: "whatsapp", direccion: "saliente",
      destino: to, contenido: resumen, estado,
      referencia_id: body.referencia_id ?? null,
      wa_message_id: waId, error: errorMsg,
      enviado_por: userData.user.id,
    }).then(() => {}, () => {});
  }

  if (estado === "error") return json({ ok: false, error: errorMsg }, 502);
  return json({ ok: true, wa_message_id: waId });
});
