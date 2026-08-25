/* `android/` es el proyecto de la app nativa: ahi viven la LLAVE DE FIRMA
   (tallerpro.keystore) y su contrasena (keystore.properties). Nunca fue
   parte del sitio, pero se publicaba: wrangler sube el directorio de
   trabajo y .gitignore no lo excluye del deploy — el 2026-08-25 el
   keystore respondia 200 en produccion. Ya se excluye en .assetsignore
   (eso lo saca del CDN de verdad); esto es el cinturon de seguridad para
   que un descuido futuro en esa lista no vuelva a dejarlo servido. */
const PRIVATE_PATH = /^\/(?:\.codex|\.agents|\.claude|\.playwright-mcp|\.git|android)(?:\/|$)/;
/* El .apk NO va en esta lista: es la app de Android que la pantalla de
   Descargas ofrece en /nexuspro.apk. Estaba bloqueado acá y por eso el botón
   daba 404 — el archivo sí se subía (`.assetsignore` lo excluye a propósito de
   la exclusión, y hasta lo dice en un comentario), pero el worker lo tapaba en
   tiempo de ejecución. Dos archivos que se contradecían. */
/* Material de firma en cualquier ruta (.keystore/.jks/keystore.properties) y
   el bundle de Play (.aab, que solo sirve para subirlo a Google, no para
   instalar). El .apk NO va aca: es lo que la pantalla de Descargas ofrece. */
const PRIVATE_FILE = /^\/(?:AGENTS\.md|keystore\.properties|[^/]+\.(?:md|pptx?|pdf|xls[x]?|keystore|jks|aab))$/i;

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (PRIVATE_PATH.test(path) || PRIVATE_FILE.test(path)) {
      return new Response('Not found', { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
