// ═══════════════════════════════════════════════════════
// Edge Function: saas-recordatorios
// Recordatorios de suscripción (cobro/vencimiento) por email.
//
// Revisa los talleres activos con fecha de vencimiento:
//   • vence en 7, 3 o 1 días  → recordatorio al email del taller
//   • vence HOY               → aviso de pago al email del taller
//   • venció hace 1, 3 o 7 días → aviso de mora al email del taller
// y envía SIEMPRE un resumen al superadmin si hay algo que reportar.
//
// Usa Resend (mismos secrets que email-send: RESEND_API_KEY, EMAIL_FROM).
// Registra cada envío en la tabla mensajes (canal 'email').
//
// Quién puede llamarla (verify_jwt=false, auth propia):
//   • pg_cron diario → header x-cron-secret (Vault, RPC get_cron_secret)
//   • superadmin desde el panel SaaS → JWT normal
//
// Deploy:  supabase functions deploy saas-recordatorios --no-verify-jwt
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPERADMIN_EMAIL = "henry.chinchilla@gmail.com";
const DIAS_AVISO_PREVIO = [7, 3, 1];   // días antes del vencimiento
const DIAS_AVISO_MORA = [1, 3, 7];     // días después de vencido

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function esLlamadaAutorizada(req: Request, admin: any, url: string, anonKey: string): Promise<boolean> {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data } = await admin.rpc("get_cron_secret");
    if (data && cronSecret === data) return true;
  }
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

function diasHasta(fecha: string): number {
  const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
  const v = new Date(fecha + "T00:00:00Z");
  return Math.round((v.getTime() - hoy.getTime()) / 86400000);
}

const Q = (n: number) => "Q" + (Number(n) || 0).toFixed(2);

function plantilla(tenant: any, dias: number): { subject: string; html: string } {
  const taller = tenant.name ?? tenant.slug ?? "tu taller";
  const monto = Q(tenant.precio_mensual);
  const fecha = tenant.suscripcion_vence;
  const pie = `<p style="color:#888;font-size:12px">NexusPro — sistema de gestión para talleres.<br>
    Si ya realizaste tu pago, por favor ignora este mensaje.</p>`;

  if (dias > 0) {
    return {
      subject: `⏰ Tu suscripción de NexusPro vence en ${dias} día${dias === 1 ? "" : "s"}`,
      html: `<h2>Hola, ${taller} 👋</h2>
        <p>Tu suscripción a <b>NexusPro</b> vence el <b>${fecha}</b> (en ${dias} día${dias === 1 ? "" : "s"}).</p>
        <p>Monto mensual: <b>${monto}</b>.</p>
        <p>Para no perder acceso al sistema, realiza tu pago antes de la fecha de vencimiento.</p>${pie}`,
    };
  }
  if (dias === 0) {
    return {
      subject: "📅 Tu suscripción de NexusPro vence HOY",
      html: `<h2>Hola, ${taller} 👋</h2>
        <p>Tu suscripción a <b>NexusPro</b> vence <b>hoy (${fecha})</b>.</p>
        <p>Monto mensual: <b>${monto}</b>. Realiza tu pago hoy para mantener tu acceso sin interrupciones.</p>${pie}`,
    };
  }
  return {
    subject: `⚠️ Suscripción de NexusPro vencida hace ${-dias} día${dias === -1 ? "" : "s"}`,
    html: `<h2>Hola, ${taller}</h2>
      <p>Tu suscripción a <b>NexusPro</b> venció el <b>${fecha}</b>.</p>
      <p>Monto pendiente: <b>${monto}</b>. Si no se regulariza el pago, tu cuenta podría ser suspendida.</p>${pie}`,
  };
}

async function enviarEmail(apiKey: string, from: string, to: string, subject: string, html: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.message ?? data?.error?.message ?? `HTTP ${r.status}`);
  return data?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("EMAIL_FROM") ?? "NexusPro <onboarding@resend.dev>";
  const ADMIN_EMAIL = Deno.env.get("SAAS_ADMIN_EMAIL") ?? SUPERADMIN_EMAIL;

  const admin = createClient(url, serviceKey);

  if (!(await esLlamadaAutorizada(req, admin, url, anonKey))) {
    return json({ error: "No autorizado" }, 401);
  }
  if (!API_KEY) {
    return json({ error: "El correo aún no está configurado (falta RESEND_API_KEY)." }, 503);
  }

  const { data: tenants, error: tErr } = await admin
    .from("tenants")
    .select("id, slug, name, email, active, precio_mensual, suscripcion_vence")
    .not("suscripcion_vence", "is", null);
  if (tErr) return json({ error: tErr.message }, 500);

  const activos = (tenants ?? []).filter((t: any) => t.active !== false);
  const enviados: any[] = [];
  const errores: any[] = [];
  const porVencer: any[] = [];
  const vencidos: any[] = [];

  for (const t of activos) {
    const dias = diasHasta(t.suscripcion_vence);
    if (dias <= 7 && dias >= 0) porVencer.push({ ...t, dias });
    if (dias < 0) vencidos.push({ ...t, dias });

    const tocaAviso = DIAS_AVISO_PREVIO.includes(dias) || dias === 0 || DIAS_AVISO_MORA.includes(-dias);
    if (!tocaAviso) continue;
    if (!t.email) { errores.push({ tenant: t.name ?? t.slug, error: "sin email registrado" }); continue; }

    const { subject, html } = plantilla(t, dias);
    try {
      const id = await enviarEmail(API_KEY, FROM, t.email, subject, html);
      enviados.push({ tenant: t.name ?? t.slug, dias, email: t.email });
      admin.from("mensajes").insert({
        tenant_id: t.id, canal: "email", direccion: "saliente",
        destino: t.email, contenido: subject, estado: "enviado",
        wa_message_id: id,
      }).then(() => {}, () => {});
    } catch (e: any) {
      errores.push({ tenant: t.name ?? t.slug, error: e?.message });
    }
  }

  // Resumen para el superadmin (solo si hay algo que reportar)
  if (porVencer.length || vencidos.length) {
    const fila = (t: any) => `<tr>
      <td style="padding:4px 10px;border-bottom:1px solid #eee">${t.name ?? t.slug}</td>
      <td style="padding:4px 10px;border-bottom:1px solid #eee">${t.suscripcion_vence}</td>
      <td style="padding:4px 10px;border-bottom:1px solid #eee">${t.dias >= 0 ? "vence en " + t.dias + "d" : "vencido hace " + (-t.dias) + "d"}</td>
      <td style="padding:4px 10px;border-bottom:1px solid #eee">${Q(t.precio_mensual)}</td>
      <td style="padding:4px 10px;border-bottom:1px solid #eee">${t.email ?? "—"}</td></tr>`;
    const tabla = (titulo: string, lista: any[]) => lista.length
      ? `<h3>${titulo} (${lista.length})</h3>
         <table style="border-collapse:collapse;font-size:13px">
         <tr><th align="left" style="padding:4px 10px">Taller</th><th align="left" style="padding:4px 10px">Vence</th>
         <th align="left" style="padding:4px 10px">Estado</th><th align="left" style="padding:4px 10px">Mensual</th>
         <th align="left" style="padding:4px 10px">Email</th></tr>${lista.map(fila).join("")}</table>` : "";
    try {
      await enviarEmail(API_KEY, FROM, ADMIN_EMAIL,
        `📊 NexusPro SaaS: ${vencidos.length} vencido(s), ${porVencer.length} por vencer`,
        `<h2>Resumen de suscripciones</h2>
         ${tabla("🔴 Vencidos", vencidos)}
         ${tabla("🟡 Por vencer (próximos 7 días)", porVencer)}
         <p style="font-size:12px;color:#888">Recordatorios enviados a talleres: ${enviados.length}.
         ${errores.length ? "Errores: " + errores.map((e) => `${e.tenant} (${e.error})`).join(", ") : ""}</p>`);
    } catch (e: any) {
      errores.push({ tenant: "(resumen superadmin)", error: e?.message });
    }
  }

  return json({
    ok: true,
    enviados: enviados.length,
    por_vencer: porVencer.length,
    vencidos: vencidos.length,
    detalle: enviados,
    ...(errores.length ? { errores } : {}),
  });
});
