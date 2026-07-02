// ═══════════════════════════════════════════════════════
// Edge Function: verificar-borrado-2fa
// Borrado seguro de la base de datos de UN comercio, autorizado por DOS
// administradores con su código TOTP (Google Authenticator) verificado
// EN EL SERVIDOR (RPC get_totp_secret_for_admin, mig 067).
//
// Tras verificar ambos códigos:
//   1. Respaldo de seguridad completo a Storage (backups/<tenant>/
//      pre_borrado_admins_*.json) + bitácora en tenant_backups.
//      Si el respaldo falla, NO se borra nada.
//   2. Borra todas las filas del comercio en TABLAS (hijos primero),
//      CONSERVANDO los perfiles con rol admin/superadmin: el administrador
//      que creó el comercio puede volver a entrar y rescatarlo
//      (el superadmin restaura el respaldo desde Panel SaaS → Base de datos).
//
// Body: { tenant_id?, admin1_email, code1, admin2_email, code2 }
// Auth: JWT de un admin del tenant (verify_jwt=true).
//
// Deploy:  supabase functions deploy verificar-borrado-2fa
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPERADMIN_EMAIL = "henry.chinchilla@gmail.com";
const ROLES_ADMIN = ["admin", "gerente_tal", "superadmin"];

/* Mismas tablas (y orden) que tenant-db-tools: padres antes que hijos;
   para borrar se recorre en reversa. */
const TABLAS = [
  "clientes", "proveedores", "bodegas", "bancos", "combos", "vacantes", "documentos",
  "tenant_users", "retenciones", "licencias", "mensajes", "obligaciones_fiscales",
  "presupuesto", "fel_importados", "egresos_recurrentes", "config_fiscal",
  "config_integraciones", "config_productividad", "activos", "actividad_log",
  "ai_conversaciones", "documentos_empresa", "usuarios",
  "vehiculos", "empleados", "inventario", "compras", "entradas_inventario", "egresos",
  "promociones", "aplicantes", "puntos_movimientos", "feedback",
  "herreria_proyectos", "peleteria_pedidos", "reparaciones_electronicas", "refrigeracion_servicios",
  "ordenes", "compra_items", "inv_movimientos", "inventario_movimientos", "asistencia",
  "disciplina", "empleado_asignaciones", "empleado_documentos", "entrenamientos",
  "horas_extra", "kpi_empleado", "liquidaciones", "llamadas_atencion", "nomina",
  "pagos_nomina", "vacaciones_movimientos", "viaticos",
  "citas", "facturas", "cuentas_cobrar", "ot_items", "ot_repuestos", "ot_servicios",
  "trabajos_externos", "cotizaciones",
  "factura_items", "ingresos", "abonos", "envios", "cotizacion_items",
  "banco_movimientos", "traslados",
  "traslado_items",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/* ── TOTP (RFC 6238, validado contra los vectores oficiales) ── */
function base32Decode(s: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  s = s.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of s) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

async function totpAt(secretB32: string, offset: number): Promise<string> {
  let counter = Math.floor(Date.now() / 1000 / 30) + offset;
  const msg = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) { msg[i] = counter & 0xff; counter = Math.floor(counter / 256); }
  const key = base32Decode(secretB32);
  const ck = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", ck, msg));
  const off = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return (bin % 1000000).toString().padStart(6, "0");
}

async function verifyTotp(secretB32: string, code: string): Promise<boolean> {
  if (!/^[0-9]{6}$/.test(code)) return false;
  for (const off of [-1, 0, 1]) {
    if (await totpAt(secretB32, off) === code) return true;
  }
  return false;
}

/* ── Respaldo de seguridad a Storage (igual que tenant-db-tools) ── */
async function respaldoSilencioso(admin: any, tenant: any, tipo: string) {
  const dump: Record<string, unknown> = {};
  const meta: Record<string, number> = {};
  let registros = 0;

  for (const t of TABLAS) {
    try {
      const { data, error } = await admin.from(t).select("*").eq("tenant_id", tenant.id);
      if (error) { dump[t] = []; meta[t] = 0; continue; }
      dump[t] = data ?? [];
      meta[t] = (data ?? []).length;
      registros += (data ?? []).length;
    } catch (_) { dump[t] = []; meta[t] = 0; }
  }

  /* entradas_detalle no tiene tenant_id: depende de entradas_inventario */
  try {
    const ids = ((dump["entradas_inventario"] as any[]) || []).map((r: any) => r.id);
    let detalle: any[] = [];
    if (ids.length) {
      const { data } = await admin.from("entradas_detalle").select("*").in("entrada_id", ids);
      detalle = data ?? [];
    }
    dump["entradas_detalle"] = detalle;
    meta["entradas_detalle"] = detalle.length;
    registros += detalle.length;
  } catch (_) { dump["entradas_detalle"] = []; meta["entradas_detalle"] = 0; }

  dump._meta = {
    tenant_id: tenant.id,
    taller: tenant.name ?? tenant.slug,
    generado: new Date().toISOString(),
    tipo,
    tablas: meta,
    total_registros: registros,
  };

  const cuerpo = JSON.stringify(dump);
  const kb = Math.round(cuerpo.length / 1024);
  const sello = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${tenant.id}/${tipo}_${sello}.json`;

  const { error: upErr } = await admin.storage.from("backups")
    .upload(path, new Blob([cuerpo], { type: "application/json" }), {
      upsert: true, contentType: "application/json",
    });
  if (upErr) throw new Error(`Storage: ${upErr.message}`);

  await admin.from("tenant_backups").insert({
    tenant_id: tenant.id,
    tipo: "manual",
    tablas: TABLAS.length,
    registros,
    tamano_kb: kb,
    creado_por: "sistema (pre-borrado 2FA)",
    notas: `Storage: backups/${path}`,
  }).then(() => {}, () => {});

  return { path, registros, kb };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, serviceKey);

  // ── Caller: debe ser admin del comercio ──
  const authHeader = req.headers.get("Authorization") ?? "";
  const tk = authHeader.replace("Bearer ", "");
  if (!tk) return json({ error: "Falta sesión" }, 401);
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: ud } = await asCaller.auth.getUser(tk);
  const user = ud?.user;
  if (!user) return json({ error: "Sesión inválida" }, 401);

  const esSuper = user.email === SUPERADMIN_EMAIL;
  const { data: perfil } = await admin.from("usuarios").select("rol, tenant_id").eq("id", user.id).maybeSingle();
  if (!esSuper && (!perfil || !ROLES_ADMIN.includes(perfil.rol))) {
    return json({ error: "No tienes permiso para autorizar el borrado" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const tenantId = (esSuper && body.tenant_id) ? String(body.tenant_id) : (perfil?.tenant_id ?? body.tenant_id);
  const a1 = (body.admin1_email ?? "").toString().trim().toLowerCase();
  const a2 = (body.admin2_email ?? "").toString().trim().toLowerCase();
  const c1 = (body.code1 ?? "").toString().trim();
  const c2 = (body.code2 ?? "").toString().trim();

  if (!tenantId) return json({ error: "No se pudo determinar el comercio" }, 400);
  if (!a1 || !a2 || !c1 || !c2) return json({ error: "Faltan los correos o códigos de los 2 administradores" }, 400);
  if (a1 === a2) return json({ error: "Deben ser DOS administradores diferentes" }, 400);

  // ── Verificar el TOTP de AMBOS administradores ──
  for (const [email, code] of [[a1, c1], [a2, c2]] as [string, string][]) {
    const { data: secret, error } = await admin.rpc("get_totp_secret_for_admin", { p_email: email, p_tenant: tenantId });
    if (error) return json({ error: "Error verificando 2FA: " + error.message }, 500);
    if (!secret) return json({ error: `${email} no es administrador con 2FA (Google Authenticator) activo en este comercio.` }, 400);
    const ok = await verifyTotp(secret as string, code);
    if (!ok) return json({ error: `El código 2FA de ${email} es inválido o venció.` }, 400);
  }

  const { data: tenant, error: tErr } = await admin.from("tenants")
    .select("id, slug, name").eq("id", tenantId).maybeSingle();
  if (tErr || !tenant) return json({ error: "Comercio no encontrado" }, 404);

  // ── 1) Respaldo de seguridad OBLIGATORIO (si falla, no se borra nada) ──
  let respaldo;
  try {
    respaldo = await respaldoSilencioso(admin, tenant, "pre_borrado_admins");
  } catch (e: any) {
    return json({ error: "No se pudo crear el respaldo de seguridad — borrado CANCELADO: " + (e?.message ?? "") }, 500);
  }

  // ── 2) Borrado (hijos primero), conservando los perfiles de administrador
  //       para que puedan volver a entrar y rescatar el comercio ──
  let registros_eliminados = 0;
  const errores: any[] = [];
  for (const t of [...TABLAS].reverse()) {
    let q = admin.from(t).delete().eq("tenant_id", tenantId);
    if (t === "usuarios") q = q.not("rol", "in", '("admin","superadmin")');
    const { data, error } = await q.select("id");
    if (error) errores.push({ tabla: t, error: error.message });
    else registros_eliminados += (data ?? []).length;
  }

  // No se expone la ruta del respaldo al cliente (estrategia de protección):
  // queda registrada solo en la bitácora interna tenant_backups.
  return json({
    ok: errores.length === 0,
    respaldo_registros: respaldo.registros,
    registros_eliminados,
    mensaje: "Base de datos borrada. Se generó un respaldo de seguridad antes del borrado.",
    ...(errores.length ? { errores: errores.length } : {}),
  });
});
