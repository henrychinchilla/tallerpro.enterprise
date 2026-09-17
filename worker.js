/* `app_flutter/` es el proyecto de la app NATIVA: ahi vive la LLAVE DE FIRMA
   y su contrasena (keystore.properties). Nunca es parte del sitio, pero se
   publica si nadie lo impide: wrangler sube el DIRECTORIO DE TRABAJO y
   .gitignore no excluye nada del deploy. Ya paso dos veces — el 2026-08-25 el
   keystore respondia 200 en produccion, y el 2026-09-16 el proyecto Flutter
   entero quedo servido por crearlo mientras un deploy corria.
   .assetsignore es lo que de verdad lo saca del CDN; esto es el cinturon para
   que un descuido futuro en esa lista no lo vuelva a dejar servido.
   `android` se mantiene en la lista aunque el cascaron WebView ya no exista:
   cuesta nada y cubre cualquier carpeta con ese nombre. */
const PRIVATE_PATH = /^\/(?:\.codex|\.agents|\.claude|\.playwright-mcp|\.git|android|app_flutter)(?:\/|$)/;
/* El .apk NO va en esta lista: son las apps que la pantalla de Descargas
   ofrece en /nexuspro-nativa.apk y /nexuspro-nativa-32bits.apk. Estaba
   bloqueado acá y por eso el botón daba 404 — el archivo sí se subía
   (`.assetsignore` lo excluye a propósito de la exclusión, y hasta lo dice en
   un comentario), pero el worker lo tapaba en tiempo de ejecución. Dos
   archivos que se contradecían. */
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
