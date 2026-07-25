// ═══════════════════════════════════════════════════════
// Edge Function: maga-alertas
// Avisa por correo, una vez al mes, qué productos seguidos entraron en su
// ventana de compra o de venta.
//
// Por qué existe: la ventana dura semanas y se pasa. Si hay que acordarse de
// abrir la pantalla, el análisis no sirve de nada.
//
// Usa los MISMOS umbrales que la app (vía maga_alertas_ventana) para que el
// correo nunca diga algo que la pantalla contradiga.
//
// Quién puede llamarla (verify_jwt=false, auth propia):
//   • pg_cron mensual → header x-cron-secret (Vault)
//   • admin desde la app → su JWT
//
// Body opcional: { mes: 1..12, dry_run: true }  — dry_run arma los correos y
// los devuelve sin enviarlos, para poder probar sin escribirle a nadie.
//
// Deploy: supabase functions deploy maga-alertas --no-verify-jwt
// ═══════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPERADMIN_EMAIL = "henry.chinchilla@gmail.com";
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio",
               "agosto","septiembre","octubre","noviembre","diciembre"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function autorizada(req: Request, admin: any, url: string, anonKey: string) {
  const secret = req.headers.get("x-cron-secret");
  if (secret) {
    const { data } = await admin.rpc("get_cron_secret");
    if (data && secret === data) return true;
  }
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  if (!token) return false;
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: u } = await caller.auth.getUser(token);
  if (!u?.user) return false;
  if (u.user.email === SUPERADMIN_EMAIL) return true;
  const { data: perfil } = await admin.from("usuarios").select("rol").eq("id", u.user.id).maybeSingle();
  return perfil?.rol === "superadmin" || perfil?.rol === "admin";
}

const esc = (t: unknown) =>
  String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function nombresMeses(ms: number[] | null) {
  return (ms || []).map((m) => MESES[m - 1]).join(", ");
}

function armarHTML(nombreComercio: string, mes: number, filas: any[]) {
  const compra = filas.filter((f) => f.tipo === "compra");
  const venta = filas.filter((f) => f.tipo === "venta");
  const bloque = (titulo: string, lista: any[], color: string, verbo: string) =>
    !lista.length ? "" : `
      <h3 style="font-size:15px;margin:18px 0 6px;color:${color}">${titulo}</h3>
      ${lista.map((f) => `
        <div style="border-left:3px solid ${color};padding:8px 12px;margin-bottom:8px;background:#f6f8fa">
          <div style="font-weight:700;font-size:14px">${esc(f.producto)}</div>
          <div style="font-size:12px;color:#57606a">${esc(f.medida)}</div>
          <div style="font-size:13px;margin-top:4px">
            Suele estar ${verbo} en <b>${esc(nombresMeses(f.tipo === "compra" ? f.meses_baratos : f.meses_caros))}</b>.
            Brecha histórica <b>${Number(f.brecha).toFixed(0)}%</b> entre su mes más caro y el más barato.
          </div>
        </div>`).join("")}`;

  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:620px;color:#1f2328">
    <h2 style="font-size:18px;margin:0 0 4px">Ventanas de ${MESES[mes - 1]}</h2>
    <p style="font-size:13px;color:#57606a;margin:0 0 8px">
      ${esc(nombreComercio)} — productos que seguís y que este mes están en su piso o en su pico,
      según la serie del MAGA de los últimos 5 años.
    </p>
    ${bloque("🟢 En su mes barato — conviene comprar", compra, "#1a7f37", "barato")}
    ${bloque("🔴 En su mes caro — conviene vender", venta, "#cf222e", "caro")}
    <p style="font-size:11.5px;color:#57606a;margin-top:18px;border-top:1px solid #d0d7de;padding-top:10px">
      Esto describe lo que ha pasado en años anteriores, no un pronóstico: una sequía o un cambio
      en las importaciones rompe cualquier patrón. Solo se avisa de productos cuya brecha supera el
      20% y cuyo patrón se repite entre años.
    </p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (!(await autorizada(req, admin, url, anonKey))) return json({ error: "No autorizado" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const mes = Number(body.mes) || new Date().getUTCMonth() + 1;
    const dryRun = body.dry_run === true;

    const { data: filas, error } = await admin.rpc("maga_alertas_ventana", { p_mes: mes, p_anios: 5 });
    if (error) throw new Error("maga_alertas_ventana: " + error.message);

    const porTenant = new Map<string, any[]>();
    (filas || []).forEach((f: any) => {
      if (!f.email) return;                       // sin correo no hay a dónde avisar
      const arr = porTenant.get(f.tenant_id) || [];
      arr.push(f); porTenant.set(f.tenant_id, arr);
    });

    const resultado: any[] = [];
    for (const [tid, lista] of porTenant) {
      const html = armarHTML(lista[0].tenant_name || "Tu comercio", mes, lista);
      const destino = lista[0].email;
      if (dryRun) { resultado.push({ tenant_id: tid, email: destino, productos: lista.length, enviado: false }); continue; }
      const r = await fetch(`${url}/functions/v1/email-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ to: destino, subject: `Ventanas de ${MESES[mes - 1]} — ${lista.length} producto(s)`, html }),
      });
      resultado.push({ tenant_id: tid, email: destino, productos: lista.length, enviado: r.ok, estado: r.status });
    }

    return json({ ok: true, mes, dry_run: dryRun, comercios: resultado.length, alertas: (filas || []).length, resultado });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
