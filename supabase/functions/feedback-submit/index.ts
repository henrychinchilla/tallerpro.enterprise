// ═══════════════════════════════════════════════════════
// Edge Function: feedback-submit  (PÚBLICA, sin login)
// Inserta la encuesta pública. Los puntos sólo se otorgan con un token único
// emitido a un cliente identificado por create-feedback-token.
//
// body.tenant = tenant_id (uuid). No usa service role (el proyecto puede
// tener el SUPABASE_SERVICE_ROLE_KEY con el nuevo formato corto).
// Deploy: supabase functions deploy feedback-submit --no-verify-jwt
// ═══════════════════════════════════════════════════════
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const tenant = (b.tenant ?? "").toString().trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenant)) {
    return json({ error: "Taller inválido" }, 400);
  }
  const cli = createClient(url, serviceKey);
  const { data: taller } = await cli.from("tenants").select("id").eq("id", tenant).eq("active", true).maybeSingle();
  if (!taller) return json({ error: "Este enlace ya no está disponible." }, 404);

  let clienteId: string | null = null;
  let feedbackTokenId: string | null = null;
  const token = (b.token ?? "").toString().trim();
  if (token) {
    const { data: grant } = await cli.from("feedback_tokens")
      .select("id, tenant_id, cliente_id, expires_at, redeemed_at").eq("token", token).maybeSingle();
    if (!grant || grant.tenant_id !== tenant || grant.redeemed_at || new Date(grant.expires_at).getTime() <= Date.now()) {
      return json({ error: "El enlace de puntos ya fue usado o venció." }, 410);
    }
    const { data: claimed } = await cli.from("feedback_tokens").update({ redeemed_at: new Date().toISOString() })
      .eq("id", grant.id).is("redeemed_at", null).select("id").maybeSingle();
    if (!claimed) return json({ error: "El enlace de puntos ya fue usado." }, 410);
    clienteId = grant.cliente_id;
    feedbackTokenId = grant.id;
  }

  const identificado = !!((b.telefono && b.telefono.toString().trim()) || (b.email && b.email.toString().trim()));

  const { error } = await cli.from("feedback").insert({
    tenant_id: tenant,
    cliente_id: clienteId,
    feedback_token_id: feedbackTokenId,
    nombre: (b.nombre ?? "").toString().slice(0, 120) || null,
    telefono: (b.telefono ?? "").toString().slice(0, 40) || null,
    email: (b.email ?? "").toString().slice(0, 120) || null,
    vehiculo: (b.vehiculo ?? "").toString().slice(0, 80) || null,
    servicio: (b.servicio ?? "").toString().slice(0, 120) || null,
    rating_servicio: Number(b.rating_servicio) || null,
    rating_productos: Number(b.rating_productos) || null,
    rating_instalaciones: Number(b.rating_instalaciones) || null,
    rating_limpieza: Number(b.rating_limpieza) || null,
    rating_entrega: Number(b.rating_entrega) || null,
    rating_documentos: Number(b.rating_documentos) || null,
    nps: Number(b.nps) || null,
    comentario: (b.comentario ?? "").toString().slice(0, 1000) || null,
    origen: ["qr", "email"].includes((b.origen ?? "qr").toString()) ? (b.origen ?? "qr").toString() : "qr",
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, identificado, puntos: !!feedbackTokenId });
});
