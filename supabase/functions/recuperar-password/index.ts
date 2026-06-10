// ═══════════════════════════════════════════════════════
// Edge Function: recuperar-password
// Recuperación de contraseña por CÓDIGO OTP (complementa al
// enlace mágico de Supabase que ya existe en el login).
//
//   op 'solicitar': { email }
//     → genera código de 6 dígitos, guarda su hash en
//       usuarios.recovery_code (15 min, máx 5 intentos) y lo envía
//       por email vía Resend. Respuesta neutra (no revela si existe).
//   op 'verificar': { email, codigo, password }
//     → valida código+vigencia y cambia la contraseña.
//
// Deploy:  supabase functions deploy recuperar-password --no-verify-jwt
// Secrets: RESEND_API_KEY, EMAIL_FROM (los mismos de email-send)
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
const NEUTRO = { ok: true, mensaje: "Si el correo existe, recibirás un código de 6 dígitos." };

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const op = body.op ?? "solicitar";
  const email = (body.email ?? "").toString().trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Correo inválido" }, 400);

  const { data: usuario } = await admin.from("usuarios")
    .select("id, nombre, email").eq("email", email).maybeSingle();

  // ── SOLICITAR CÓDIGO ──
  if (op === "solicitar") {
    if (!usuario) return json(NEUTRO); // neutro: no revelar existencia
    const API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!API_KEY) return json({ error: "El envío de códigos no está configurado todavía. Usa el enlace de recuperación." }, 503);

    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const exp = new Date(Date.now() + VIGENCIA_MIN * 60000).toISOString();
    await admin.from("usuarios").update({
      recovery_code: (await sha256(codigo)) + ":0",
      recovery_exp: exp,
    }).eq("id", usuario.id);

    const FROM = Deno.env.get("EMAIL_FROM") ?? "TallerPro <onboarding@resend.dev>";
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: email,
        subject: `🔐 Tu código de recuperación: ${codigo}`,
        html: `<h2>Hola, ${usuario.nombre ?? ""} 👋</h2>
          <p>Tu código para restablecer la contraseña de <b>TallerPro</b> es:</p>
          <p style="font-size:34px;font-weight:800;letter-spacing:8px;font-family:monospace">${codigo}</p>
          <p>Vence en ${VIGENCIA_MIN} minutos. Si no lo pediste, ignora este correo.</p>`,
      }),
    });
    if (!r.ok) return json({ error: "No se pudo enviar el código. Intenta con el enlace de recuperación." }, 502);
    return json(NEUTRO);
  }

  // ── VERIFICAR CÓDIGO Y CAMBIAR CONTRASEÑA ──
  if (op === "verificar") {
    const codigo = (body.codigo ?? "").toString().trim();
    const password = (body.password ?? "").toString();
    if (!/^\d{6}$/.test(codigo)) return json({ error: "El código debe tener 6 dígitos" }, 400);
    if (password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);

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
