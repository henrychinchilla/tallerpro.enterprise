// ═══════════════════════════════════════════════════════
// Edge Function: reset-password
// Permite a un admin restablecer la contraseña de un usuario de su
// taller (no se puede hacer desde el navegador con la anon key).
//
// Flujo:
//   1. Verifica el JWT del que llama.
//   2. Confirma que es admin / gerente_tal / superadmin.
//   3. Verifica que el usuario objetivo pertenece al MISMO tenant.
//   4. Cambia la contraseña con service role (updateUserById) y marca
//      debe_cambiar_password = true.
//
// Body: { user_id, password }
// Deploy: supabase functions deploy reset-password
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const ROLES_QUE_RESETEAN = ["admin", "superadmin", "gerente_tal"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Falta token de sesión" }, 401);

  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await asCaller.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Sesión inválida" }, 401);

  const admin = createClient(url, serviceKey);
  const { data: perfil } = await admin.from("usuarios")
    .select("rol, tenant_id").eq("id", userData.user.id).maybeSingle();
  const esSuperadmin = userData.user.email === "henry.chinchilla@gmail.com";
  if (!esSuperadmin && (!perfil || !ROLES_QUE_RESETEAN.includes((perfil as any).rol))) {
    return json({ error: "No tienes permiso para resetear contraseñas" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const userId = (body.user_id ?? "").toString();
  const password = (body.password ?? "").toString();
  if (!userId || !password) return json({ error: "Faltan user_id o password" }, 400);
  if (password.length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);

  // El usuario objetivo debe ser del mismo tenant (salvo superadmin)
  const { data: target } = await admin.from("usuarios")
    .select("tenant_id").eq("id", userId).maybeSingle();
  if (!target) return json({ error: "Usuario no encontrado" }, 404);
  if (!esSuperadmin && (target as any).tenant_id !== (perfil as any)?.tenant_id) {
    return json({ error: "Ese usuario no pertenece a tu taller" }, 403);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (updErr) return json({ error: updErr.message }, 400);

  await admin.from("usuarios").update({
    debe_cambiar_password: true, updated_at: new Date().toISOString(),
  }).eq("id", userId);

  return json({ ok: true });
});
