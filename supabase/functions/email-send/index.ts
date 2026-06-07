// ═══════════════════════════════════════════════════════
// Edge Function: email-send
// Envía correo transaccional vía Resend (https://resend.com).
//
// La RESEND_API_KEY vive SOLO en el servidor (secret de Supabase),
// nunca en el navegador. Mientras no se configure, responde 503 sin
// romper la app (igual que whatsapp-send / ai-assistant).
//
// Body: { to, subject, html?, text?, referencia_id? }
//
// Deploy:  supabase functions deploy email-send
// Secrets:
//   supabase secrets set RESEND_API_KEY=re_...
//   supabase secrets set EMAIL_FROM="Mi Taller <noreply@tudominio.com>"
//   (el dominio del remitente debe estar verificado en Resend)
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

/* Escapa texto plano a HTML básico (para el fallback text→html) */
function textoAHtml(t: string): string {
  return t
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("EMAIL_FROM") ?? "TallerPro <onboarding@resend.dev>";
  if (!API_KEY) {
    return json({ error: "El correo aún no está configurado (falta la API key de Resend)." }, 503);
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

  const to = (body.to ?? "").toString().trim();
  const subject = (body.subject ?? "").toString().trim();
  const text = body.text ?? "";
  const html = body.html ?? (text ? textoAHtml(text) : "");
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: "Destinatario inválido" }, 400);
  if (!subject) return json({ error: "Falta el asunto" }, 400);
  if (!html) return json({ error: "Falta el contenido (html o text)" }, 400);

  // ── Llamar a Resend ──
  let estado = "enviado", errorMsg: string | null = null, providerId: string | null = null;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html, ...(text ? { text } : {}) }),
    });
    const data = await r.json();
    if (!r.ok) {
      estado = "error";
      errorMsg = data?.message ?? data?.error?.message ?? `HTTP ${r.status}`;
    } else {
      providerId = data?.id ?? null;
    }
  } catch (e: any) {
    estado = "error";
    errorMsg = e?.message ?? "Error de red";
  }

  // ── Bitácora (no bloquea) ──
  if (tenantId) {
    admin.from("mensajes").insert({
      tenant_id: tenantId, canal: "email", direccion: "saliente",
      destino: to, contenido: subject, estado,
      referencia_id: body.referencia_id ?? null,
      wa_message_id: providerId, error: errorMsg,
      enviado_por: userData.user.id,
    }).then(() => {}, () => {});
  }

  if (estado === "error") return json({ ok: false, error: errorMsg }, 502);
  return json({ ok: true, id: providerId });
});
