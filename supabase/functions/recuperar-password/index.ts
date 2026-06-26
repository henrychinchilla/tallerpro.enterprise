// ═══════════════════════════════════════════════════════
// Edge Function: recuperar-password
//   op 'solicitar': { email }
//     → Genera magic link (recovery) y lo envía vía Resend
//     → Respuesta siempre neutra (no revela si el correo existe)
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

const NEUTRO = { ok: true, mensaje: "Si el correo existe, recibirás el enlace para recuperar tu contraseña." };

async function enviarEmail(apiKey: string, from: string, to: string, subject: string, html: string): Promise<{ ok: boolean; resendError?: string }> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const body = await r.text().catch(() => "");
  if (!r.ok) console.error(`Resend [${r.status}]:`, body);
  return r.ok ? { ok: true } : { ok: false, resendError: `[${r.status}] ${body}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const supaUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const API_KEY    = Deno.env.get("RESEND_API_KEY");
  const FROM       = Deno.env.get("EMAIL_FROM") ?? "TallerPro <onboarding@resend.dev>";
  const APP_URL    = Deno.env.get("APP_URL") ?? "https://tallerpro.telecommgt.com";
  const admin      = createClient(supaUrl, serviceKey);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const email = (body.email ?? "").toString().trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Correo inválido" }, 400);
  if (!API_KEY) return json({ error: "El servicio de correo no está configurado. Contacta al administrador." }, 503);

  // Generar magic link — si el email no existe en auth.users, retorna error → respuesta neutra
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: APP_URL },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    console.warn("generateLink error (email no existe o similar):", linkErr?.message);
    return json(NEUTRO);
  }

  const link = linkData.properties.action_link;

  // Nombre: tabla usuarios primero, si no, prefijo del email
  const { data: perfil } = await admin.from("usuarios")
    .select("nombre").eq("email", email).maybeSingle();
  const nombre = perfil?.nombre ?? email.split("@")[0];

  const { ok, resendError } = await enviarEmail(API_KEY, FROM, email,
    "🔑 Recupera tu contraseña de TallerPro",
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#1d4ed8">TallerPro — Recuperar contraseña</h2>
      <p>Hola <strong>${nombre}</strong> 👋</p>
      <p>Haz clic en el botón para restablecer tu contraseña:</p>
      <div style="text-align:center;margin:28px 0">
        <a href="${link}"
           style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;
                  text-decoration:none;padding:16px 32px;border-radius:10px;
                  font-weight:700;font-size:16px;display:inline-block">
          🔓 Restablecer contraseña
        </a>
      </div>
      <p style="color:#64748b">Este enlace es válido por <strong>60 minutos</strong>. Si no lo pediste, ignora este correo.</p>
      <p style="color:#94a3b8;font-size:12px">O copia este link:<br>
        <a href="${link}" style="color:#3b82f6;word-break:break-all">${link}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#94a3b8">TallerPro Enterprise · ${APP_URL}</p>
    </div>`
  );

  if (!ok) {
    console.error("Recovery email failed:", resendError);
    return json({ error: "No se pudo enviar el correo. Contacta al administrador." }, 502);
  }

  return json(NEUTRO);
});
