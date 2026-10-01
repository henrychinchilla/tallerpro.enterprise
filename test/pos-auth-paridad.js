/* EL POS RESPETA EL CAMBIO DE CONTRASEÑA Y EL 2FA, IGUAL QUE LA WEB.

   El POS entraba con solo la contraseña (aal1): saltaba el reto 2FA y el
   cambio obligatorio del primer ingreso (debe_cambiar_password es por
   diseño). Ahora aplica la misma regla que loginVerificarMFAYContinuar y,
   si falta algo, manda al login web, que ya tiene esas pantallas. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const src = fs.readFileSync(path.join(__dirname, '..', 'js/pos/pos.js'), 'utf8');
const store = {};
const ctx = { console, window: {}, document: {}, localStorage: { getItem: k => store[k] ?? null, setItem() {}, removeItem() {} } };
vm.createContext(ctx);
vm.runInContext(src + '\n;this.__POS = POS;', ctx);
const POS = ctx.__POS;

const caso = async ({ user = {}, aal = ['aal1', 'aal1'], factores = [], pausado = false, falla = false, despues = false }) => {
  store.mfa_enroll_later = despues ? 'true' : null;
  ctx.Auth = {
    user,
    getMFAStatus: async () => { if (falla) throw new Error('red'); return { currentLevel: aal[0], nextLevel: aal[1] }; },
    listMFAFactors: async () => factores,
    mfaPausado: () => pausado,
  };
  return POS._seguridadPendiente();
};

(async () => {
  ok('primer ingreso → cambiar contraseña', await caso({ user: { debe_cambiar_password: true }, aal: ['aal2', 'aal2'] }) === 'cambiar-pass');
  ok('2FA activo con sesión aal1 → pide el código', await caso({ aal: ['aal1', 'aal2'] }) === 'mfa');
  ok('sesión aal2 → entra', await caso({ aal: ['aal2', 'aal2'] }) === null);
  ok('2FA pausado (en la BD) → entra', await caso({ aal: ['aal1', 'aal2'], factores: [{ status: 'verified' }], pausado: true }) === null);
  ok('factor verificado aunque AAL diga aal1/aal1 → pide el código', await caso({ factores: [{ status: 'verified' }] }) === 'mfa');
  ok('sin 2FA y sin posponer → configurar', await caso({}) === 'mfa-enroll');
  ok('sin 2FA y pospuesto en la web → entra', await caso({ despues: true }) === null);
  ok('si falla la verificación → no entra (fail-closed)', await caso({ falla: true }) === 'mfa');
  const proc = src.slice(src.indexOf('async _procesarSesion'), src.indexOf('_puedeEntrar()'));
  ok('la guarda corre antes de elegir negocio o soporte',
     proc.indexOf('_seguridadPendiente') > -1 && proc.indexOf('_seguridadPendiente') < proc.indexOf("rol === 'superadmin'"));
  console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
  process.exitCode = fallidas ? 1 : 0;
})();
