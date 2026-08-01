/* Pausar el 2FA en vez de desactivarlo.

   Lo que hay que cuidar acá no es que la pausa funcione — es que no se
   convierta en el viejo `mfa_bypass`: una forma de entrar sin el segundo
   factor teniendo sólo la contraseña. De ahí que se pruebe sobre todo lo
   feo: que un rechazo del servidor NO deje la app creyendo que está pausado,
   que la bandera vieja no se cuele cuando ya no hay autenticador, y que el
   guard de la BD siga exigiendo aal2 y fila propia. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = f => path.join(__dirname, '..', f);

/* Carga js/core/auth.js con un doble del cliente de Supabase. `errorUpdate`
   simula al trigger de la migración 099 rechazando la pausa. */
function cargarAuth({ errorUpdate = null } = {}) {
  const llamadas = [];
  const sb = {
    from(tabla) {
      return {
        update(campos) {
          return {
            eq(col, val) {
              llamadas.push({ tabla, campos, col, val });
              return Promise.resolve({ error: errorUpdate });
            },
          };
        },
      };
    },
    auth: { mfa: {} },
  };

  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date,
    getSB: () => sb,
    getTID: () => null,
    window: {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(raiz('js/core/auth.js'), 'utf8'), ctx);
  return { Auth: ctx.window.Auth, llamadas };
}

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

process.on('unhandledRejection', e => {
  console.log('FAIL — excepción no atrapada: ' + (e && e.message ? e.message : e));
  process.exit(1);
});

(async () => {
  /* ── Lectura de la bandera ───────────────────────────────────────────── */
  {
    const { Auth } = cargarAuth();
    ok('sin sesión no cuenta como pausado', Auth.mfaPausado() === false);
    Auth.user = { id: 'u1' };
    ok('perfil viejo (sin la columna) no cuenta como pausado', Auth.mfaPausado() === false);
    Auth.user = { id: 'u1', mfa_pausado: 'true' };
    ok('sólo el booleano true pausa, no un "true" de texto', Auth.mfaPausado() === false);
    Auth.user = { id: 'u1', mfa_pausado: true };
    ok('con la bandera en true, pausado', Auth.mfaPausado() === true);
  }

  /* ── Pausar ──────────────────────────────────────────────────────────── */
  {
    const { Auth, llamadas } = cargarAuth();
    Auth.user = { id: 'u1', mfa_pausado: false };
    const res = await Auth.pausarMFA(true);
    ok('pausar devuelve ok', res.ok === true);
    ok('escribe la bandera en usuarios',
       llamadas.length === 1 && llamadas[0].tabla === 'usuarios' && llamadas[0].campos.mfa_pausado === true);
    ok('sólo sobre la fila propia', llamadas[0].col === 'id' && llamadas[0].val === 'u1');
    ok('no manda la fecha: la pone el trigger, no el cliente',
       !('mfa_pausado_at' in llamadas[0].campos));
    ok('deja el perfil en memoria al día', Auth.mfaPausado() === true);
  }

  /* ── El servidor rechaza (sesión aal1: es el caso que importa) ────────── */
  {
    const { Auth } = cargarAuth({ errorUpdate: { message: 'Para pausar el 2FA hay que verificar antes un código del autenticador' } });
    Auth.user = { id: 'u1', mfa_pausado: false };
    const res = await Auth.pausarMFA(true);
    ok('rechazo del guard devuelve error', res.ok === false && /código/.test(res.error));
    ok('rechazado NO queda pausado en memoria (si no, la app saltaría el reto)',
       Auth.mfaPausado() === false);
  }

  /* ── Reanudar ────────────────────────────────────────────────────────── */
  {
    const { Auth, llamadas } = cargarAuth();
    Auth.user = { id: 'u1', mfa_pausado: true, mfa_pausado_at: '2026-07-31T00:00:00Z' };
    const res = await Auth.pausarMFA(false);
    ok('reanudar devuelve ok', res.ok === true);
    ok('reanudar apaga la bandera', llamadas[0].campos.mfa_pausado === false && Auth.mfaPausado() === false);
    ok('reanudar limpia la fecha en memoria', Auth.user.mfa_pausado_at === null);
  }

  /* ── Los dos porteros consultan la pausa ─────────────────────────────── */
  {
    const login = fs.readFileSync(raiz('js/core/login.js'), 'utf8');
    const app = fs.readFileSync(raiz('js/core/app.js'), 'utf8');
    /* El reto sigue siendo obligatorio; la pausa es la única salida, y viene
       de la BD (Auth.mfaPausado), nunca de localStorage. */
    ok('login.js decide el reto consultando la pausa', /nextLevel === 'aal2'[\s\S]{0,80}Auth\.mfaPausado\(\)/.test(login));
    ok('app.js decide el reto consultando la pausa', /nextLevel === 'aal2'[\s\S]{0,80}Auth\.mfaPausado\(\)/.test(app));
    /* Con la pausa encendida el nivel también es aal1: sin este guard, a quien
       YA tiene autenticador le saldría la pantalla de enrolar uno nuevo. */
    ok('app.js no manda a enrolar a alguien que ya tiene factor pausado',
       /currentLevel === 'aal1' && !Auth\.mfaPausado\(\)/.test(app));
    ok('la pausa no se lee de localStorage', !/localStorage[\s\S]{0,40}mfa_pausado/.test(login + app));
  }

  /* ── El guard de la BD ───────────────────────────────────────────────── */
  {
    const sql = fs.readFileSync(raiz('db/migrations/099_mfa_pausa.sql'), 'utf8');
    ok('exige aal2 para pausar', /'aal'[\s\S]{0,60}aal2/.test(sql) && /raise exception/.test(sql));
    ok('exige que sea la fila propia', /NEW\.id is distinct from auth\.uid\(\)/.test(sql));
    /* Reanudar sube la seguridad: nunca se bloquea. */
    const iReanudar = sql.indexOf('NEW.mfa_pausado is not true');
    ok('reanudar sale antes de los chequeos', iReanudar > 0 && iReanudar < sql.indexOf("'aal'"));
    ok('el trigger corre BEFORE UPDATE (si fuera AFTER no podría rechazar ni sellar la fecha)',
       /before update on public\.usuarios/.test(sql));
  }

  console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
  if (fallidas) process.exitCode = 1;
})();
