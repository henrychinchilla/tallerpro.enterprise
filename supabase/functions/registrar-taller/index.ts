// ═══════════════════════════════════════════════════════
// Edge Function: registrar-taller
// Auto-registro público de comercios con VERIFICACIÓN DE CORREO.
//
// Este endpoint YA NO crea el comercio. Solo:
//   A) Cloudflare Turnstile: valida el captcha (si TURNSTILE_SECRET existe).
//   B) Límite anti-abuso: máximo 3 solicitudes por correo (excluye expiradas).
//   C) Crea un usuario auth SIN confirmar (no puede entrar hasta verificar).
//   D) Registra una SOLICITUD (solicitudes_comercio) en estado
//      'pendiente_verificacion' con un token de verificación.
//   E) Envía un correo con el link de verificación (Resend).
//
// El comercio (tenant) se crea RECIÉN cuando el usuario abre el link de
// verificación (Edge: verificar-registro). Si no verifica, no hay comercio.
//
// Body: { nombre_taller, nit?, nombre_admin, email, password, telefono,
//         tipo_negocio?, modulos_activos?, turnstile_token? }
//
// Deploy:  supabase functions deploy registrar-taller --no-verify-jwt
// Secrets: TURNSTILE_SECRET, RESEND_API_KEY, EMAIL_FROM
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_SOLICITUDES = 3;
const TOKEN_HORAS = 48;

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

async function enviarVerificacion(email: string, comercio: string, token: string, funcUrl: string) {
  const API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!API_KEY) return;
  const FROM = Deno.env.get("EMAIL_FROM") ?? "NexusPro <onboarding@resend.dev>";
  const link = `${funcUrl}/functions/v1/verificar-registro?token=${encodeURIComponent(token)}`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: email,
      subject: "Verifica tu correo para activar tu comercio en NexusPro",
      html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto">
        <h2>¡Casi listo, ${comercio}! 👋</h2>
        <p>Gracias por registrar tu comercio en <b>NexusPro</b>. Para continuar,
        confirma que este correo es tuyo:</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${link}" style="background:#2563eb;color:#fff;padding:14px 28px;
            border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
            ✅ Verificar mi correo
          </a>
        </p>
        <p style="font-size:13px;color:#666">Al verificar, tu <b>solicitud de versión demo</b>
        quedará registrada y la activaremos en breve. Te avisaremos por este mismo correo.</p>
        <p style="font-size:12px;color:#999">Si el botón no funciona, copia este enlace:<br>
        <a href="${link}">${link}</a></p>
        <p style="font-size:12px;color:#999">Este enlace vence en ${TOKEN_HORAS} horas.
        Si no fuiste tú, ignora este mensaje.</p>
      </div>`,
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
  const tipoNegocio = (body.tipo_negocio ?? "").toString().trim() || null;
  const modulos = Array.isArray(body.modulos_activos) ? body.modulos_activos : null;

  // ── Validaciones ──
  if (!nombreTaller || !nombreAdmin) return json({ error: "Faltan el nombre del comercio o del administrador" }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "El correo no es válido" }, 400);
  if (!TEL_RE.test(telefono)) return json({ error: "El teléfono no es válido (mínimo 8 dígitos)" }, 400);
  if (password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);

  // ── A) Turnstile ──
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for");
  const ts = await validarTurnstile(body.turnstile_token, ip);
  if (!ts.ok) return json({ error: ts.error }, 403);

  // ── ¿Ya existe una cuenta REAL (perfil con tenant)? Los perfiles con
  //    tenant_id nulo son registros incompletos y no bloquean. ──
  const { data: yaExiste } = await admin.from("usuarios").select("id")
    .eq("email", email).not("tenant_id", "is", null).maybeSingle();
  if (yaExiste) return json({ error: "Ese correo ya tiene una cuenta en NexusPro. Usa 'Olvidé mi contraseña'." }, 409);

  // ── ¿Solicitud pendiente de verificación? → se reenvía (no cuenta como intento nuevo) ──
  const { data: pendiente } = await admin.from("solicitudes_comercio")
    .select("*").eq("email", email).eq("estado", "pendiente_verificacion")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  // ── B) Límite de 3 solicitudes (excluye expiradas y la pendiente que se reenvía) ──
  if (!pendiente) {
    const { count } = await admin.from("solicitudes_comercio")
      .select("id", { count: "exact", head: true })
      .eq("email", email).neq("estado", "expirado");
    if ((count ?? 0) >= MAX_SOLICITUDES) {
      return json({ error: `Alcanzaste el límite de ${MAX_SOLICITUDES} solicitudes con este correo. Escríbenos para ayudarte.` }, 429);
    }
  }

  // ── Token de verificación ──
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const expira = new Date(Date.now() + TOKEN_HORAS * 3600 * 1000).toISOString();

  // ── C) Usuario auth SIN confirmar (no puede entrar hasta verificar el correo) ──
  let authUserId: string | null = pendiente?.auth_user_id ?? null;
  if (authUserId) {
    // Reenvío: actualizar la contraseña por si el usuario la cambió al reintentar
    await admin.auth.admin.updateUserById(authUserId, { password }).catch(() => {});
  } else {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: false,
      user_metadata: { nombre: nombreAdmin, rol: "admin" },
    });
    if (created?.user) {
      authUserId = created.user.id;
    } else {
      // El usuario auth ya existe (huérfano de un intento previo expirado):
      // reclamarlo reutilizando su id de la solicitud anterior.
      const m = (cErr?.message ?? "").toLowerCase();
      const yaExisteAuth = m.includes("already") || m.includes("registered") || m.includes("exists");
      if (yaExisteAuth) {
        const { data: prev } = await admin.from("solicitudes_comercio")
          .select("auth_user_id").eq("email", email).not("auth_user_id", "is", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (prev?.auth_user_id) {
          authUserId = prev.auth_user_id;
          await admin.auth.admin.updateUserById(authUserId, { password, email_confirm: false }).catch(() => {});
        }
      }
      if (!authUserId) {
        return json({ error: cErr?.message ?? "No se pudo crear la cuenta" }, 400);
      }
    }
  }

  // ── D) Registrar / actualizar la solicitud ──
  if (pendiente) {
    await admin.from("solicitudes_comercio").update({
      nombre_comercio: nombreTaller, nombre_admin: nombreAdmin, nit, telefono,
      tipo_negocio: tipoNegocio, modulos_activos: modulos,
      token, token_expira: expira, auth_user_id: authUserId, ip,
    }).eq("id", pendiente.id);
  } else {
    const { error: sErr } = await admin.from("solicitudes_comercio").insert({
      email, nombre_comercio: nombreTaller, nombre_admin: nombreAdmin,
      nit, telefono, tipo_negocio: tipoNegocio, modulos_activos: modulos,
      token, token_expira: expira, auth_user_id: authUserId, ip,
      estado: "pendiente_verificacion",
    });
    if (sErr) {
      await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      return json({ error: "No se pudo registrar la solicitud: " + sErr.message }, 400);
    }
  }

  // ── E) Correo de verificación ──
  await enviarVerificacion(email, nombreTaller, token, url);

  return json({
    ok: true,
    verificar: true,
    mensaje: "Te enviamos un correo para verificar tu cuenta. Ábrelo y confirma para continuar con tu solicitud de versión demo.",
  });
});
