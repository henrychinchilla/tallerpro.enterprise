// ═══════════════════════════════════════════════════════
// Edge Function: recuperar-password
//   op 'solicitar': { email }
//     · Busca en tabla usuarios → envía OTP 6 dígitos por Resend
//     · Si no está en usuarios pero sí en auth.users → genera magic
//       link vía admin.generateLink() y lo envía por Resend
//     · Respuesta siempre neutra (no revela existencia)
//   op 'verificar': { email, codigo, password }
//     → valida OTP y cambia contraseña (solo para usuarios en tabla usuarios)
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

const VIGENCIA_MIN = 15;
const MAX_INTENTOS = 5;
const NEUTRO = { ok: true, mensaje: "Si el correo existe, recibirás las instrucciones para recuperar tu contraseña." };

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function enviarEmail(apiKey: string, from: string, to: string, subject: string, html: string): Promise<boolean> {
  const tryFrom = async (sender: string) => {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: sender, to, subject, html }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error(`Resend error [${r.status}] from=${sender}:`, body);
    }
    return r.ok;
  };

  if (await tryFrom(from)) return true;
  // Fallback: si el dominio configurado no está verificado en Resend, usar el dominio test
  if (from !== "TallerPro <onboarding@resend.dev>") {
    console.warn("Reintentando con onboarding@resend.dev como fallback...");
    return tryFrom("TallerPro <onboarding@resend.dev>");
  }
  return false;
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
  const op    = body.op ?? "solicitar";
  const email = (body.email ?? "").toString().trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Correo inválido" }, 400);

  // Buscar en tabla usuarios (usuarios de tenant)
  const { data: usuario } = await admin.from("usuarios")
    .select("id, nombre, email").eq("email", email).maybeSingle();

  // ── SOLICITAR ────────────────────────────────────────
  if (op === "solicitar") {
    if (!API_KEY) return json({ error: "El servicio de correo no está configurado. Contacta al administrador." }, 503);

    // CASO A: usuario existe en tabla usuarios → OTP 6 dígitos
    if (usuario) {
      const codigo = String(Math.floor(100000 + Math.random() * 900000));
      const exp    = new Date(Date.now() + VIGENCIA_MIN * 60000).toISOString();
      await admin.from("usuarios").update({
        recovery_code: (await sha256(codigo)) + ":0",
        recovery_exp:  exp,
      }).eq("id", usuario.id);

      const ok = await enviarEmail(API_KEY, FROM, email,
        `🔐 Tu código de recuperación TallerPro: ${codigo}`,
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1d4ed8">TallerPro — Recuperar contraseña</h2>
          <p>Hola <strong>${usuario.nombre ?? ""}</strong> 👋</p>
          <p>Tu código para restablecer la contraseña es:</p>
          <div style="font-size:40px;font-weight:900;letter-spacing:10px;font-family:monospace;
            background:#f0f9ff;border:2px solid #3b82f6;border-radius:12px;
            padding:20px;text-align:center;color:#1d4ed8;margin:20px 0">
            ${codigo}
          </div>
          <p style="color:#64748b">Válido por <strong>${VIGENCIA_MIN} minutos</strong>. Si no solicitaste este código, ignora este correo.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:12px;color:#94a3b8">TallerPro Enterprise · ${APP_URL}</p>
        </div>`
      );
      if (!ok) return json({ error: "No se pudo enviar el código. Intenta de nuevo." }, 502);
      return json(NEUTRO);
    }

    // CASO B: no está en usuarios, buscar en auth.users → magic link vía Resend
    const { data: authUsers } = await admin.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === email);

    if (authUser) {
      // Generar magic link de recuperación desde el admin
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: email,
        options: { redirectTo: APP_URL },
      });

      if (linkErr || !linkData?.properties?.action_link) {
        return json({ error: "No se pudo generar el enlace de recuperación." }, 500);
      }

      const link = linkData.properties.action_link;
      const nombre = (authUser.user_metadata?.nombre as string) ?? authUser.email ?? "";

      const ok = await enviarEmail(API_KEY, FROM, email,
        "🔐 Recupera tu contraseña de TallerPro",
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1d4ed8">TallerPro — Recuperar contraseña</h2>
          <p>Hola <strong>${nombre}</strong> 👋</p>
          <p>Haz clic en el siguiente botón para restablecer tu contraseña:</p>
          <div style="text-align:center;margin:28px 0">
            <a href="${link}"
               style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;
                      text-decoration:none;padding:16px 32px;border-radius:10px;
                      font-weight:700;font-size:16px;display:inline-block">
              🔓 Restablecer contraseña
            </a>
          </div>
          <p style="color:#64748b">Este enlace es válido por <strong>60 minutos</strong>. Si no lo pediste, ignora este correo.</p>
          <p style="color:#94a3b8;font-size:12px">O copia este link:<br><a href="${link}" style="color:#3b82f6">${link}</a></p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:12px;color:#94a3b8">TallerPro Enterprise · ${APP_URL}</p>
        </div>`
      );
      if (!ok) return json({ error: "No se pudo enviar el correo. Intenta de nuevo." }, 502);
      return json(NEUTRO);
    }

    // Email no existe en ninguna tabla → respuesta neutra (no revelar)
    return json(NEUTRO);
  }

  // ── VERIFICAR OTP ────────────────────────────────────
  if (op === "verificar") {
    const codigo   = (body.codigo ?? "").toString().trim();
    const password = (body.password ?? "").toString();
    if (!/^\d{6}$/.test(codigo))  return json({ error: "El código debe tener 6 dígitos" }, 400);
    if (password.length < 8)      return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);

    const generico = "Código inválido o vencido. Solicita uno nuevo.";
    const { data: u } = await admin.from("usuarios")
      .select("id, recovery_code, recovery_exp").eq("email", email).maybeSingle();
    if (!u?.recovery_code || !u.recovery_exp) return json({ error: generico }, 400);
    if (new Date(u.recovery_exp) < new Date()) return json({ error: generico }, 400);

    const [hash, intentosStr] = String(u.recovery_code).split(":");
    const intentos = parseInt(intentosStr) || 0;
    if (intentos >= MAX_INTENTOS) return json({ error: generico }, 400);

    if ((await sha256(codigo)) !== hash) {
      await admin.from("usuarios").update({ recovery_code: `${hash}:${intentos + 1}` }).eq("id", u.id);
      return json({ error: generico }, 400);
    }

    const { error: pErr } = await admin.auth.admin.updateUserById(u.id, { password });
    if (pErr) return json({ error: "No se pudo cambiar la contraseña: " + pErr.message }, 400);
    await admin.from("usuarios").update({
      recovery_code: null, recovery_exp: null, debe_cambiar_password: false,
    }).eq("id", u.id);

    return json({ ok: true, mensaje: "Contraseña actualizada. Ya puedes iniciar sesión." });
  }

  return json({ error: "Operación no válida" }, 400);
});
