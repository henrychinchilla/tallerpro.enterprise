// ═══════════════════════════════════════════════════════
// Edge Function: eliminar-usuario
//
// BORRAR DE VERDAD, que no es lo mismo que inactivar.
//
// La app confundía las dos cosas: el botón decía "Eliminar" con un bote de
// basura y lo único que hacía era poner activo=false. Henry lo pidió separado,
// y tiene razón: inactivar es quitarle el acceso a alguien que sigue existiendo
// (se fue de vacaciones, está suspendido); eliminar es que esa persona no esté.
//
// POR QUÉ HACE FALTA UNA EDGE FUNCTION: `public.usuarios` NO tiene llave
// foránea contra `auth.users` — son dos filas independientes. Borrar sólo el
// perfil desde el navegador dejaría al usuario PUDIENDO ENTRAR con su
// contraseña, sin perfil y sin permisos: un fantasma. Borrar el auth user
// necesita la service role, que nunca puede viajar al navegador.
//
// Flujo:
//   1. Verifica el JWT del que llama.
//   2. Confirma que es admin / gerente_tal de ESE tenant, o el superadmin
//      (que da soporte a todos los negocios).
//   3. Borra el perfil. Si una llave foránea lo impide, LO DICE (ver abajo).
//   4. Borra el auth user.
//
// SALE COMPLETO, como lo pidió Henry: perfil + acceso + membresías. Lo que
// antes lo impedía (cajas_pos apuntaba al usuario con NO ACTION) lo resolvió la
// migración 135: el arqueo se queda con el NOMBRE de quien lo hizo y suelta la
// llave. Así la persona desaparece de la base y el corte de caja sigue
// diciendo quién contó el efectivo — que es lo que revisa una auditoría.
// El manejo de 23503 se deja por si algún día aparece otra tabla que ate al
// usuario: mejor un mensaje que diga qué hacer que un código de Postgres.
//
// Deploy:  supabase functions deploy eliminar-usuario
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const ROLES_QUE_BORRAN = ["admin", "superadmin", "gerente_tal"];
const SUPERADMIN_EMAIL = "henry.chinchilla@gmail.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  // ── 1. Quién llama ──
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Falta token de sesión" }, 401);

  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await asCaller.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Sesión inválida" }, 401);
  const callerId = userData.user.id;

  const admin = createClient(url, serviceKey);
  const { data: perfil, error: perfilErr } = await admin
    .from("usuarios").select("rol, tenant_id").eq("id", callerId).maybeSingle();
  if (perfilErr) return json({ error: "Error leyendo tu perfil" }, 500);

  const esSuperadmin = userData.user.email === SUPERADMIN_EMAIL || perfil?.rol === "superadmin";
  if (!esSuperadmin && (!perfil || !ROLES_QUE_BORRAN.includes(perfil.rol))) {
    return json({ error: "No tienes permiso para eliminar usuarios" }, 403);
  }

  // ── 2. A quién ──
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const id = String(body.id ?? "").trim();
  if (!id) return json({ error: "Falta el id del usuario" }, 400);

  /* Borrarse a uno mismo deja el negocio sin quien administre y la sesión en
     un estado imposible. */
  if (id === callerId) return json({ error: "No podés eliminar tu propio usuario" }, 400);

  const { data: objetivo } = await admin
    .from("usuarios").select("id, nombre, email, rol, tenant_id").eq("id", id).maybeSingle();
  if (!objetivo) return json({ error: "Ese usuario ya no existe" }, 404);

  /* Un admin sólo borra dentro de SU negocio. El superadmin, en cualquiera —
     es el soporte de todos. */
  if (!esSuperadmin && objetivo.tenant_id !== perfil?.tenant_id) {
    return json({ error: "Ese usuario no es de tu negocio" }, 403);
  }
  if (objetivo.rol === "superadmin" && !esSuperadmin) {
    return json({ error: "No podés eliminar a un superadministrador" }, 403);
  }

  // ── 3. Borrar el perfil (usuario_tenants y usuario_permisos van en cascada) ──
  const { error: delErr } = await admin.from("usuarios").delete().eq("id", id);
  if (delErr) {
    /* 23503 = llave foránea. El caso real es la caja del POS: quien abrió o
       cerró un turno es parte de ese arqueo. Se responde con la salida que sí
       sirve en vez de un código de Postgres. */
    if (delErr.code === "23503" || /foreign key/i.test(delErr.message)) {
      return json({
        error: "No se puede eliminar: este usuario tiene movimientos que dependen de él " +
               "(por ejemplo, aperturas o cierres de caja del POS). Borrarlo dejaría un arqueo " +
               "sin responsable. Inactivalo: pierde el acceso y el historial queda intacto.",
        codigo: "tiene_historial",
      }, 409);
    }
    return json({ error: "No se pudo eliminar el perfil: " + delErr.message }, 500);
  }

  // ── 4. Borrar el acceso (auth). Si esto falla, el perfil ya no está: se
  //      avisa explícitamente para que nadie crea que quedó a medias en silencio.
  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    return json({
      ok: true, perfil_eliminado: true, acceso_eliminado: false,
      advertencia: "Se borró el perfil pero NO se pudo borrar el acceso: " + authErr.message +
                   ". Esa cuenta no puede usar el sistema (no tiene perfil), pero conviene revisarla.",
    }, 200);
  }

  return json({ ok: true, perfil_eliminado: true, acceso_eliminado: true, nombre: objetivo.nombre });
});
