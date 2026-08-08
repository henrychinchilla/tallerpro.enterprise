const PRIVATE_PATH = /^\/(?:\.codex|\.agents|\.claude|\.playwright-mcp|\.git)(?:\/|$)/;
/* El .apk NO va en esta lista: es la app de Android que la pantalla de
   Descargas ofrece en /nexuspro.apk. Estaba bloqueado acá y por eso el botón
   daba 404 — el archivo sí se subía (`.assetsignore` lo excluye a propósito de
   la exclusión, y hasta lo dice en un comentario), pero el worker lo tapaba en
   tiempo de ejecución. Dos archivos que se contradecían. */
const PRIVATE_FILE = /^\/(?:AGENTS\.md|[^/]+\.(?:md|pptx?|pdf|xls[x]?))$/i;

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (PRIVATE_PATH.test(path) || PRIVATE_FILE.test(path)) {
      return new Response('Not found', { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
