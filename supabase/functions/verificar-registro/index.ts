// ═══════════════════════════════════════════════════════
// Edge Function: verificar-registro
// El usuario abre el link de verificación que le llegó por correo.
//   • GET ?token=XXX
//   • Confirma el correo del usuario auth (email_confirm = true).
//   • RECIÉN AHÍ crea el comercio (tenant SUSPENDIDO, pendiente de
//     aprobación del superadmin) + config_fiscal + usuario admin.
//   • Marca la solicitud como 'verificado' y avisa al superadmin.
//   • Devuelve una página HTML: "tu solicitud de demo se activará pronto".
//
// Idempotente: si el token ya fue usado, muestra un mensaje amable.
//
// Deploy:  supabase functions deploy verificar-registro --no-verify-jwt
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = "https://nexuspro.cmtelecommgt.com";
const SUPERADMIN_EMAIL = Deno.env.get("SAAS_ADMIN_EMAIL") ?? "henry.chinchilla@gmail.com";

function pagina(titulo: string, cuerpo: string, color = "#2563eb"): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${titulo} — NexusPro</title></head>
    <body style="margin:0;font-family:system-ui,Arial,sans-serif;background:#0f172a;color:#e2e8f0;
      display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px">
      <div style="background:#1e293b;border-radius:16px;padding:36px 28px;max-width:440px;text-align:center;
        box-shadow:0 12px 40px rgba(0,0,0,.4)">
        ${cuerpo}
        <a href="${APP_URL}" style="display:inline-block;margin-top:22px;background:${color};color:#fff;
          padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:700">Ir a NexusPro</a>
      </div>
    </body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function avisarSuperadmin(comercio: string, email: string, telefono: string) {
  const API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!API_KEY) return;
  const FROM = Deno.env.get("EMAIL_FROM") ?? "NexusPro <onboarding@resend.dev>";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: SUPERADMIN_EMAIL,
      subject: `✅ Comercio verificado, pendiente de aprobación: ${comercio}`,
      html: `<h2>Correo verificado — listo para aprobar</h2>
        <p><b>Comercio:</b> ${comercio}<br><b>Email:</b> ${email}<br><b>Teléfono:</b> ${telefono}</p>
        <p>El cliente ya verificó su correo. Entra al <b>Panel SaaS → Solicitudes</b> para
        <b>Aprobar</b> (activa su demo y le avisa por correo) o <b>Rechazar</b>.</p>`,
    }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  const reqUrl = new URL(req.url);
  const token = reqUrl.searchParams.get("token");

  if (!token) {
    return pagina("Enlace inválido",
      `<div style="font-size:44px">⚠️</div>
       <h2>Enlace inválido</h2>
       <p style="color:#94a3b8">Falta el código de verificación. Vuelve a registrarte.</p>`, "#dc2626");
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  const { data: sol } = await admin.from("solicitudes_comercio").select("*").eq("token", token).maybeSingle();

  if (!sol) {
    return pagina("Enlace inválido",
      `<div style="font-size:44px">⚠️</div>
       <h2>Enlace inválido o expirado</h2>
       <p style="color:#94a3b8">Este enlace no es válido o ya fue utilizado. Si tu correo ya estaba
       verificado, tu solicitud sigue en revisión.</p>`, "#dc2626");
  }

  // Ya verificado / aprobado → idempotente
  if (sol.estado !== "pendiente_verificacion") {
    if (sol.estado === "rechazado") {
      return pagina("Solicitud no disponible",
        `<div style="font-size:44px">🚫</div>
         <h2>Solicitud no disponible</h2>
         <p style="color:#94a3b8">Esta solicitud ya no está activa. Si crees que es un error, contáctanos.</p>`, "#dc2626");
    }
    return pagina("Correo ya verificado",
      `<div style="font-size:44px">✅</div>
       <h2>Tu correo ya estaba verificado</h2>
       <p style="color:#94a3b8">Tu solicitud de versión demo está en revisión. Te avisaremos por
       correo cuando tu acceso esté habilitado.</p>`);
  }

  // Expirado
  if (sol.token_expira && new Date(sol.token_expira).getTime() < Date.now()) {
    await admin.from("solicitudes_comercio").update({ estado: "expirado" }).eq("id", sol.id);
    if (sol.auth_user_id) await admin.auth.admin.deleteUser(sol.auth_user_id).catch(() => {});
    return pagina("Enlace expirado",
      `<div style="font-size:44px">⌛</div>
       <h2>El enlace expiró</h2>
       <p style="color:#94a3b8">Por seguridad, el enlace de verificación caducó.
       Vuelve a registrar tu comercio.</p>`, "#dc2626");
  }

  // ── Confirmar el correo del usuario auth ──
  if (sol.auth_user_id) {
    await admin.auth.admin.updateUserById(sol.auth_user_id, { email_confirm: true }).catch(() => {});
  }

  // ── Crear el comercio (tenant) SUSPENDIDO, pendiente de aprobación ──
  const slug = (sol.nombre_comercio || "comercio").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)
    + "-" + Date.now().toString(36);

  const { data: tenant, error: tErr } = await admin.from("tenants").insert({
    slug, name: sol.nombre_comercio, nit: sol.nit, email: sol.email, tel: sol.telefono,
    plan: "empresarial", precio_mensual: 0,
    suscripcion_vence: null, ciclo_pago: "mensual",
    ai_limite_mes: 50,
    modulos_activos: Array.isArray(sol.modulos_activos) ? sol.modulos_activos : null,
    active: false,
    notas_admin: "Correo verificado — pendiente de aprobación (auto-registro). Prueba gratis 30 días.",
  }).select().single();

  if (tErr || !tenant) {
    return pagina("Error",
      `<div style="font-size:44px">⚠️</div>
       <h2>No se pudo completar el registro</h2>
       <p style="color:#94a3b8">Ocurrió un problema al crear tu comercio. Intenta de nuevo o contáctanos.</p>`, "#dc2626");
  }

  await admin.from("config_fiscal").insert({ tenant_id: tenant.id, regimen_iva: "general", tasa_iva: 0.12, tasa_isr: 0.05 }).then(() => {}, () => {});

  if (sol.auth_user_id) {
    const { error: uErr } = await admin.from("usuarios").insert({
      id: sol.auth_user_id, tenant_id: tenant.id, nombre: sol.nombre_admin,
      email: sol.email, telefono: sol.telefono, rol: "admin", activo: true, avatar: "👑",
    });
    if (uErr) {
      // rollback del tenant recién creado
      await admin.from("config_fiscal").delete().eq("tenant_id", tenant.id).then(() => {}, () => {});
      await admin.from("tenants").delete().eq("id", tenant.id).then(() => {}, () => {});
      return pagina("Error",
        `<div style="font-size:44px">⚠️</div>
         <h2>No se pudo completar el registro</h2>
         <p style="color:#94a3b8">Ocurrió un problema al crear tu perfil. Intenta de nuevo o contáctanos.</p>`, "#dc2626");
    }
  }

  // ── Marcar la solicitud como verificada (invalida el token) ──
  await admin.from("solicitudes_comercio").update({
    estado: "verificado", verificado_at: new Date().toISOString(),
    tenant_id: tenant.id, token: null,
  }).eq("id", sol.id);

  avisarSuperadmin(sol.nombre_comercio, sol.email, sol.telefono ?? "");

  return pagina("¡Correo verificado!",
    `<div style="font-size:52px">🎉</div>
     <h2>¡Correo verificado!</h2>
     <p style="color:#cbd5e1;line-height:1.6">Tu solicitud para usar la <b>versión demo</b> de NexusPro
     quedó registrada.<br><br>La estamos revisando y <b>se activará pronto</b>.
     Te avisaremos a <b>${sol.email}</b> en cuanto tu acceso esté habilitado.</p>`);
});
