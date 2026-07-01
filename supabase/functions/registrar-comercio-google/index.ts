// ═══════════════════════════════════════════════════════
// Edge Function: registrar-comercio-google
// Alta de comercio para usuarios que entraron con Google.
//
// El correo YA viene verificado por Google, así que NO hay paso de
// verificación de correo: la solicitud nace 'verificado' y el comercio
// (tenant) se crea suspendido, pendiente de aprobación del superadmin
// (mismo flujo que verificar-registro).
//
// Auth: JWT del usuario Google autenticado (verify_jwt=true).
// Body: { nombre_comercio, nit?, telefono, tipo_negocio?, modulos_activos? }
//
// Deploy:  supabase functions deploy registrar-comercio-google
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPERADMIN_EMAIL = Deno.env.get("SAAS_ADMIN_EMAIL") ?? "henry.chinchilla@gmail.com";
const MAX_SOLICITUDES = 3;
const TEL_RE = /^\+?[\d\s-]{8,15}$/;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function avisarSuperadmin(comercio: string, email: string, telefono: string) {
  const API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!API_KEY) return;
  const FROM = Deno.env.get("EMAIL_FROM") ?? "NexusPro <onboarding@resend.dev>";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: SUPERADMIN_EMAIL,
      subject: `✅ Comercio (Google) pendiente de aprobación: ${comercio}`,
      html: `<h2>Registro con Google — listo para aprobar</h2>
        <p><b>Comercio:</b> ${comercio}<br><b>Email:</b> ${email}<br><b>Teléfono:</b> ${telefono}</p>
        <p>El correo ya viene verificado por Google. Entra al <b>Panel SaaS → Solicitudes</b> para
        <b>Aprobar</b> (activa su demo y le avisa por correo) o <b>Rechazar</b>.</p>`,
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

  // ── Usuario autenticado (Google) ──
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Falta sesión" }, 401);
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: uErr } = await asCaller.auth.getUser(token);
  const user = userData?.user;
  if (uErr || !user) return json({ error: "Sesión inválida" }, 401);

  const email = (user.email ?? "").toLowerCase();
  if (!email) return json({ error: "Tu cuenta de Google no tiene correo" }, 400);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const nombreComercio = (body.nombre_comercio ?? "").toString().trim();
  const nit = (body.nit ?? "").toString().trim() || null;
  const telefono = (body.telefono ?? "").toString().trim();
  const tipoNegocio = (body.tipo_negocio ?? "").toString().trim() || null;
  const modulos = Array.isArray(body.modulos_activos) ? body.modulos_activos : null;
  const nombreAdmin = (user.user_metadata?.full_name ?? user.user_metadata?.name ?? email.split("@")[0]).toString();

  if (!nombreComercio) return json({ error: "Falta el nombre del comercio" }, 400);
  if (!TEL_RE.test(telefono)) return json({ error: "El teléfono no es válido (mínimo 8 dígitos)" }, 400);

  // ── ¿Ya tiene un comercio? ──
  const { data: yaTiene } = await admin.from("usuarios").select("id").eq("id", user.id).maybeSingle();
  if (yaTiene) return json({ error: "Tu cuenta ya está vinculada a un comercio." }, 409);

  // ── Límite de 3 solicitudes por correo (excluye expiradas) ──
  const { count } = await admin.from("solicitudes_comercio")
    .select("id", { count: "exact", head: true })
    .eq("email", email).neq("estado", "expirado");
  if ((count ?? 0) >= MAX_SOLICITUDES) {
    return json({ error: `Alcanzaste el límite de ${MAX_SOLICITUDES} solicitudes con este correo. Escríbenos para ayudarte.` }, 429);
  }

  // ── Crear tenant SUSPENDIDO, pendiente de aprobación ──
  const slug = nombreComercio.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)
    + "-" + Date.now().toString(36);

  const { data: tenant, error: tErr } = await admin.from("tenants").insert({
    slug, name: nombreComercio, nit, email, tel: telefono,
    plan: "empresarial", precio_mensual: 0,
    suscripcion_vence: null, ciclo_pago: "mensual",
    ai_limite_mes: 50,
    modulos_activos: modulos,
    active: false,
    notas_admin: "Pendiente de aprobación (registro Google). Prueba gratis 30 días.",
  }).select().single();
  if (tErr || !tenant) return json({ error: "No se pudo crear el comercio: " + (tErr?.message ?? "") }, 400);

  await admin.from("config_fiscal").insert({ tenant_id: tenant.id, regimen_iva: "general", tasa_iva: 0.12, tasa_isr: 0.05 }).then(() => {}, () => {});

  const { error: insErr } = await admin.from("usuarios").insert({
    id: user.id, tenant_id: tenant.id, nombre: nombreAdmin,
    email, telefono, rol: "admin", activo: true, avatar: "👑",
  });
  if (insErr) {
    await admin.from("config_fiscal").delete().eq("tenant_id", tenant.id).then(() => {}, () => {});
    await admin.from("tenants").delete().eq("id", tenant.id).then(() => {}, () => {});
    return json({ error: "No se pudo crear el perfil: " + insErr.message }, 400);
  }

  await admin.from("solicitudes_comercio").insert({
    email, nombre_comercio: nombreComercio, nombre_admin: nombreAdmin,
    nit, telefono, tipo_negocio: tipoNegocio, modulos_activos: modulos,
    auth_user_id: user.id, tenant_id: tenant.id,
    estado: "verificado", verificado_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  avisarSuperadmin(nombreComercio, email, telefono);

  return json({ ok: true, pendiente: true, mensaje: "Tu comercio quedó registrado y está en revisión de activación." });
});
