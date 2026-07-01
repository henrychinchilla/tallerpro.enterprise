// ═══════════════════════════════════════════════════════
// Edge Function: rechazar-comercio
// El superadmin rechaza un comercio desde el Panel SaaS:
//   • BORRA el comercio del SaaS (tenant + perfil + config + usuario auth).
//   • DEJA la solicitud en la base marcada como 'rechazado' (con motivo),
//     para poder identificar spam / reincidencia por correo o IP.
//
// Body: { tenant_id, motivo? }
// Auth: JWT de superadmin.
//
// Deploy:  supabase functions deploy rechazar-comercio
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

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
  const motivo = (body.motivo ?? "").toString().trim() || null;
  if (!tenantId) return json({ error: "Falta tenant_id" }, 400);

  // La solicitud queda en la base (evidencia de spam); solo cambia de estado.
  const { data: sols } = await admin.from("solicitudes_comercio")
    .select("id, auth_user_id").eq("tenant_id", tenantId);
  const authUserIds = (sols ?? []).map((s: any) => s.auth_user_id).filter(Boolean);

  await admin.from("solicitudes_comercio")
    .update({ estado: "rechazado", rechazado_at: new Date().toISOString(), motivo_rechazo: motivo })
    .eq("tenant_id", tenantId).then(() => {}, () => {});

  // Borrar el comercio del SaaS: primero los hijos, luego el tenant.
  await admin.from("usuarios").delete().eq("tenant_id", tenantId).then(() => {}, () => {});
  await admin.from("config_fiscal").delete().eq("tenant_id", tenantId).then(() => {}, () => {});
  await admin.from("tenant_pagos").delete().eq("tenant_id", tenantId).then(() => {}, () => {});
  await admin.from("tenant_backups").delete().eq("tenant_id", tenantId).then(() => {}, () => {});
  const { error: dErr } = await admin.from("tenants").delete().eq("id", tenantId);
  if (dErr) return json({ error: "No se pudo borrar el comercio: " + dErr.message }, 400);

  // Borrar el usuario auth para que el correo pueda registrarse de nuevo si aplica.
  for (const uid of authUserIds) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }

  return json({ ok: true, mensaje: "Comercio rechazado y eliminado del SaaS. La solicitud quedó registrada." });
});
