// ═══════════════════════════════════════════════════════
// Edge Function: aprobar-comercio
// El superadmin aprueba un comercio verificado desde el Panel SaaS:
//   • Activa el tenant (active = true).
//   • Marca la solicitud como 'aprobado'.
//   • Envía al cliente un correo: "tu acceso ya está habilitado".
//
// Body: { tenant_id }
// Auth: JWT de superadmin (mismo patrón que saas-recordatorios).
//
// Deploy:  supabase functions deploy aprobar-comercio
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = "https://nexuspro.cmtelecommgt.com";
const SUPERADMIN_EMAIL = "henry.chinchilla@gmail.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function esSuperadmin(req: Request, admin: any, url: string, anonKey: string): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return false;
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asCaller.auth.getUser(token);
  const user = userData?.user;
  if (!user) return false;
  if (user.email === SUPERADMIN_EMAIL) return true;
  const { data: perfil } = await admin.from("usuarios").select("rol").eq("id", user.id).maybeSingle();
  return perfil?.rol === "superadmin";
}

async function avisarCliente(email: string, comercio: string) {
  const API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!API_KEY || !email) return;
  const FROM = Deno.env.get("EMAIL_FROM") ?? "NexusPro <onboarding@resend.dev>";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: email,
      subject: "🎉 Tu acceso a NexusPro ya está habilitado",
      html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto">
        <h2>¡Bienvenido a NexusPro, ${comercio}! 🎉</h2>
        <p>Tu solicitud fue <b>aprobada</b> y tu acceso ya está habilitado.
        Comienzan tus <b>30 días de prueba gratis</b>.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${APP_URL}" style="background:#2563eb;color:#fff;padding:14px 28px;
            border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
            Ingresar a NexusPro
          </a>
        </p>
        <p style="font-size:13px;color:#666">Inicia sesión con el correo y la contraseña que registraste.</p>
      </div>`,
    }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, serviceKey);

  if (!(await esSuperadmin(req, admin, url, anonKey))) return json({ error: "No autorizado" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const tenantId = (body.tenant_id ?? "").toString().trim();
  if (!tenantId) return json({ error: "Falta tenant_id" }, 400);

  const { data: tenant, error: tErr } = await admin.from("tenants")
    .select("id, name, slug, email").eq("id", tenantId).maybeSingle();
  if (tErr || !tenant) return json({ error: "Comercio no encontrado" }, 404);

  // Al aprobar se limpia "Pendiente de aprobación" de las notas (se conserva
  // el marcador de prueba) para que, si el demo se suspende luego, la app
  // muestre la pantalla correcta y no "Estamos activando".
  const { error: uErr } = await admin.from("tenants")
    .update({ active: true, notas_admin: "Aprobado (auto-registro). Prueba gratis 30 días." })
    .eq("id", tenantId);
  if (uErr) return json({ error: "No se pudo activar: " + uErr.message }, 400);

  await admin.from("solicitudes_comercio")
    .update({ estado: "aprobado", aprobado_at: new Date().toISOString() })
    .eq("tenant_id", tenantId).then(() => {}, () => {});

  await avisarCliente(tenant.email ?? "", tenant.name ?? tenant.slug ?? "tu comercio");

  return json({ ok: true, mensaje: "Comercio aprobado y notificado por correo." });
});
