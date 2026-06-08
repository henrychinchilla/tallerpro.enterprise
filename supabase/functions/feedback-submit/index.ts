// ═══════════════════════════════════════════════════════
// Edge Function: feedback-submit  (PÚBLICA, sin login)
// Inserta la encuesta de feedback como ANON. Los triggers de BD
// (fb_match_cliente / fb_apply_puntos, SECURITY DEFINER) emparejan al
// cliente por teléfono/correo y le otorgan 50 puntos de fidelización.
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
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const tenant = (b.tenant ?? "").toString().trim();
  if (!tenant) return json({ error: "Falta el taller" }, 400);

  const cli = createClient(url, anon);
  const identificado = !!((b.telefono && b.telefono.toString().trim()) || (b.email && b.email.toString().trim()));

  const { error } = await cli.from("feedback").insert({
    tenant_id: tenant,
    nombre: (b.nombre ?? "").toString().slice(0, 120) || null,
    telefono: (b.telefono ?? "").toString().slice(0, 40) || null,
    email: (b.email ?? "").toString().slice(0, 120) || null,
    rating_servicio: Number(b.rating_servicio) || null,
    rating_productos: Number(b.rating_productos) || null,
    nps: Number(b.nps) || null,
    comentario: (b.comentario ?? "").toString().slice(0, 1000) || null,
    origen: (b.origen ?? "qr").toString(),
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, identificado });
});
