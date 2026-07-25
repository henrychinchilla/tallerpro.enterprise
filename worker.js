const PRIVATE_PATH = /^\/(?:\.codex|\.agents|\.claude|\.playwright-mcp|\.git)(?:\/|$)/;
const PRIVATE_FILE = /^\/(?:AGENTS\.md|[^/]+\.(?:md|apk|pptx?|pdf|xls[x]?))$/i;

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (PRIVATE_PATH.test(path) || PRIVATE_FILE.test(path)) {
      return new Response('Not found', { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
