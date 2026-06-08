// ═══════════════════════════════════════════════════════
// Edge Function: crear-usuario
// Crea un usuario del equipo (auth + perfil) de forma segura.
//
// Reemplaza el hack cliente de signUp()+restaurar sesión, que bajo
// RLS estricto no funciona y puede dejar al admin sin sesión.
//
// Flujo:
//   1. Verifica el JWT del que llama (debe estar autenticado).
//   2. Confirma que es admin / gerente_tal / superadmin de su tenant.
//   3. Crea el auth user con service role (admin.createUser).
//   4. Inserta el perfil en public.usuarios dentro del MISMO tenant.
//
// Deploy:  supabase functions deploy crear-usuario
// Variables (ya inyectadas por Supabase): SUPABASE_URL,
//   SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const ROLES_QUE_CREAN = ["admin", "superadmin", "gerente_tal"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── 1. Identificar al que llama desde su JWT ──
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Falta token de sesión" }, 401);

  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: "Sesión inválida" }, 401);
  }
  const callerId = userData.user.id;

  // ── 2. Validar rol y tenant del que llama (service role) ──
  const admin = createClient(url, serviceKey);
  const { data: perfil, error: perfilErr } = await admin
    .from("usuarios")
    .select("rol, tenant_id")
    .eq("id", callerId)
    .maybeSingle();

  const esSuperadmin = userData.user.email === "henry.chinchilla@gmail.com";

  if (perfilErr) return json({ error: "Error leyendo perfil" }, 500);
  if (!esSuperadmin && (!perfil || !ROLES_QUE_CREAN.includes(perfil.rol))) {
    return json({ error: "No tienes permiso para crear usuarios" }, 403);
  }

  // ── 3. Payload ──
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const { email, password, nombre, rol, telefono, avatar, tenant_id } = body as {
    email?: string; password?: string; nombre?: string; rol?: string;
    telefono?: string; avatar?: string; tenant_id?: string;
  };

  if (!email || !password || !nombre || !rol) {
    return json({ error: "Faltan campos: email, password, nombre, rol" }, 400);
  }

  // El tenant destino es el del admin; superadmin puede especificar otro.
  const tenantDestino = esSuperadmin && tenant_id ? tenant_id : perfil?.tenant_id;
  if (!tenantDestino) return json({ error: "Sin tenant asociado" }, 400);

  // Un admin no puede crear superadmins
  if (rol === "superadmin" && !esSuperadmin) {
    return json({ error: "No puedes crear superadministradores" }, 403);
  }

  // ── 4. Crear auth user ──
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, rol },
  });
  if (createErr || !created?.user) {
    return json({ error: createErr?.message ?? "No se pudo crear el auth user" }, 400);
  }

  // ── 5. Insertar perfil en el tenant ──
  const { error: insErr } = await admin.from("usuarios").insert({
    id: created.user.id,
    tenant_id: tenantDestino,
    nombre,
    email,
    rol,
    telefono: telefono ?? null,
    avatar: avatar ?? "👤",
    activo: true,
    debe_cambiar_password: true,
  });

  if (insErr) {
    // rollback del auth user para no dejar huérfanos
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "No se pudo crear el perfil: " + insErr.message }, 400);
  }

  return json({ ok: true, id: created.user.id });
});
