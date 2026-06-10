// ═══════════════════════════════════════════════════════
// Edge Function: registrar-taller
// Auto-registro público de talleres con control anti-abuso:
//   A) Cloudflare Turnstile: valida el token del captcha contra
//      siteverify usando TURNSTILE_SECRET (si el secret no está
//      configurado aún, se omite la validación para no bloquear).
//   B) Aprobación manual: el taller nace SUSPENDIDO (active=false,
//      notas 'Pendiente de aprobación') y se avisa por email al
//      superadmin, quien lo activa desde el panel SaaS (▶️).
//
// El RPC viejo registrar_taller queda revocado (mig 034) para que
// nadie pueda saltarse el captcha llamándolo directo.
//
// Body: { nombre_taller, nit?, nombre_admin, email, password,
//         telefono, turnstile_token? }
//
// Deploy:  supabase functions deploy registrar-taller --no-verify-jwt
// Secrets: TURNSTILE_SECRET (Cloudflare), RESEND_API_KEY/EMAIL_FROM (aviso)
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPERADMIN_EMAIL = Deno.env.get("SAAS_ADMIN_EMAIL") ?? "henry.chinchilla@gmail.com";

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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TEL_RE = /^\+?[\d\s-]{8,15}$/;

async function validarTurnstile(token: string | undefined, ip: string | null): Promise<{ ok: boolean; error?: string }> {
  const secret = Deno.env.get("TURNSTILE_SECRET");
  if (!secret) return { ok: true }; // aún sin configurar → no bloquear el alta
  if (!token) return { ok: false, error: "Completa la verificación de seguridad (captcha)." };
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
    });
    const data = await r.json();
    return data?.success ? { ok: true } : { ok: false, error: "Verificación de seguridad fallida. Recarga e intenta de nuevo." };
  } catch (_) {
    return { ok: false, error: "No se pudo validar el captcha. Intenta de nuevo." };
  }
}

async function avisarSuperadmin(taller: string, email: string, telefono: string) {
  const API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!API_KEY) return;
  const FROM = Deno.env.get("EMAIL_FROM") ?? "TallerPro <onboarding@resend.dev>";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: SUPERADMIN_EMAIL,
      subject: `🆕 Nuevo taller pendiente de aprobación: ${taller}`,
      html: `<h2>Nuevo registro en TallerPro</h2>
        <p><b>Taller:</b> ${taller}<br><b>Email:</b> ${email}<br><b>Teléfono:</b> ${telefono}</p>
        <p>El taller quedó <b>suspendido</b> hasta tu aprobación. Actívalo desde el Panel SaaS (▶️).</p>`,
    }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const nombreTaller = (body.nombre_taller ?? "").toString().trim();
  const nit = (body.nit ?? "").toString().trim() || null;
  const nombreAdmin = (body.nombre_admin ?? "").toString().trim();
  const email = (body.email ?? "").toString().trim().toLowerCase();
  const password = (body.password ?? "").toString();
  const telefono = (body.telefono ?? "").toString().trim();

  // ── Validaciones ──
  if (!nombreTaller || !nombreAdmin) return json({ error: "Faltan el nombre del taller o del administrador" }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "El correo no es válido" }, 400);
  if (!TEL_RE.test(telefono)) return json({ error: "El teléfono no es válido (mínimo 8 dígitos)" }, 400);
  if (password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);

  // ── A) Turnstile ──
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for");
  const ts = await validarTurnstile(body.turnstile_token, ip);
  if (!ts.ok) return json({ error: ts.error }, 403);

  // ── Anti-duplicados básicos ──
  const { data: yaExiste } = await admin.from("usuarios").select("id").eq("email", email).maybeSingle();
  if (yaExiste) return json({ error: "Ese correo ya tiene una cuenta en TallerPro. Usa 'Olvidé mi contraseña'." }, 409);

  // ── Crear auth user ──
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { nombre: nombreAdmin, rol: "admin" },
  });
  if (cErr || !created?.user) return json({ error: cErr?.message ?? "No se pudo crear la cuenta" }, 400);

  // ── B) Tenant SUSPENDIDO pendiente de aprobación (trial 30 días Empresarial) ──
  const slug = nombreTaller.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)
    + "-" + Date.now().toString(36);
  const vence = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const { data: tenant, error: tErr } = await admin.from("tenants").insert({
    slug, name: nombreTaller, nit, email, tel: telefono,
    plan: "empresarial", precio_mensual: 0,
    suscripcion_vence: vence, ciclo_pago: "mensual",
    active: false,
    notas_admin: "Pendiente de aprobación (auto-registro). Prueba gratis 30 días.",
  }).select().single();
  if (tErr || !tenant) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "No se pudo crear el taller: " + (tErr?.message ?? "") }, 400);
  }

  // config fiscal por defecto + perfil admin
  await admin.from("config_fiscal").insert({ tenant_id: tenant.id, regimen_iva: "general", tasa_iva: 0.12, tasa_isr: 0.05 });
  const { error: uErr } = await admin.from("usuarios").insert({
    id: created.user.id, tenant_id: tenant.id, nombre: nombreAdmin,
    email, telefono, rol: "admin", activo: true, avatar: "👑",
  });
  if (uErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from("tenants").delete().eq("id", tenant.id);
    return json({ error: "No se pudo crear el perfil: " + uErr.message }, 400);
  }

  avisarSuperadmin(nombreTaller, email, telefono);

  return json({
    ok: true,
    pendiente: true,
    mensaje: "Tu taller fue registrado. Lo estamos activando — te avisaremos a tu correo en breve.",
  });
});
