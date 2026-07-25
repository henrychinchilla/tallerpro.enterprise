import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Falta sesión" }, 401);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await caller.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Sesión inválida" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const email = (body.email ?? "").toString().trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Correo inválido" }, 400);

  const admin = createClient(url, serviceKey);
  const { data: perfil } = await admin.from("usuarios").select("tenant_id, activo")
    .eq("id", userData.user.id).maybeSingle();
  const tenantId = (perfil as any)?.tenant_id;
  if (!tenantId || (perfil as any)?.activo === false) return json({ error: "Tu cuenta no está habilitada." }, 403);

  const { data: cliente } = await admin.from("clientes").select("id")
    .eq("tenant_id", tenantId).ilike("email", email).maybeSingle();
  if (!cliente) return json({ error: "El correo no corresponde a un cliente registrado." }, 404);

  const { data, error } = await admin.from("feedback_tokens").insert({ tenant_id: tenantId, cliente_id: cliente.id })
    .select("token, expires_at").single();
  if (error || !data) return json({ error: "No se pudo crear el enlace seguro." }, 500);
  return json({ ok: true, token: data.token, expires_at: data.expires_at });
});
