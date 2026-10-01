// ═══════════════════════════════════════════════════════
// Edge Function: integracion-tenant — Canal B (comercio → sus clientes)
// Usa las credenciales PROPIAS del comercio (tenant_integraciones, mig 153)
// para su pasarela de pagos o su certificador FEL. Nunca usa credenciales
// de CM (Canal A) ni devuelve secretos al navegador.
//
// Body: { op: 'probar', tipo: 'pagos'|'fel', tenant_id? }
//   tenant_id solo lo respeta para un superadmin (modo soporte); para el
//   resto manda el comercio del perfil del que llama.
//
// Hoy ningún proveedor tiene conector: "probar" responde "sin conector"
// con el nombre del proveedor. Cuando un comercio contrate uno, su
// conector se agrega a CONECTORES y usa leer_secreto_integracion.
//
// Deploy: supabase functions deploy integracion-tenant   (verify_jwt ON)
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const DUENO = "henry.chinchilla@gmail.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Prueba = { ok: true; detalle: string } | { ok: false; error: string };
/* Conectores por tipo y proveedor: (publico, secretos, ambiente) → prueba. */
const CONECTORES: Record<"pagos" | "fel", Record<string, (pub: any, sec: any, amb: string) => Promise<Prueba>>> = {
  pagos: {},
  fel: {},
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const auth = req.headers.get("Authorization") ?? "";
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: u } = await caller.auth.getUser(auth.replace("Bearer ", ""));
  if (!u?.user) return json({ error: "Sesión inválida" }, 401);

  let body: { op?: string; tipo?: "pagos" | "fel"; tenant_id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  if (body.op !== "probar") return json({ error: "Operación no soportada" }, 400);
  if (body.tipo !== "pagos" && body.tipo !== "fel") return json({ error: "Tipo inválido" }, 400);

  const { data: p } = await admin.from("usuarios").select("rol, tenant_id, activo").eq("id", u.user.id).maybeSingle();
  const esSA = u.user.email === DUENO || (p?.rol === "superadmin" && p?.activo !== false);
  const tenantId = esSA ? (body.tenant_id ?? p?.tenant_id) : p?.tenant_id;
  if (!tenantId) return json({ error: "Sin comercio" }, 400);
  if (!esSA && !["admin", "gerente_fin"].includes(p?.rol ?? "")) return json({ error: "Solo el administrador del comercio" }, 403);

  const { data: integ } = await admin.from("tenant_integraciones")
    .select("proveedor, ambiente, publico, activo").eq("tenant_id", tenantId).eq("tipo", body.tipo).maybeSingle();
  if (!integ) return json({ ok: false, error: "No hay integración guardada" });

  const fn = CONECTORES[body.tipo][integ.proveedor];
  let r: Prueba;
  if (!fn) {
    r = { ok: false, error: `Sin conector para "${integ.proveedor}" todavía: las credenciales quedan guardadas y cifradas; el conector se habilita al contratar el servicio.` };
  } else {
    const { data: sec } = await admin.rpc("leer_secreto_integracion", { p_tenant_id: tenantId, p_tipo: body.tipo });
    try { r = await fn(integ.publico, sec ?? {}, integ.ambiente); }
    catch (e) { r = { ok: false, error: `Error del proveedor: ${(e as Error).message}` }; }
  }
  await admin.from("tenant_integraciones").update({ ultimo_error: r.ok ? null : r.error, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId).eq("tipo", body.tipo);
  return json({ ...r, proveedor: integ.proveedor, ambiente: integ.ambiente });
});
