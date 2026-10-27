// The setup page: what to paste into your device's app, and which lists offhand sees.
// Guarded by the same token the device sends, passed as ?t= because a browser cannot set a header.

import type { ItemStore } from "./store/types";

export async function handleSetup(req: Request, store: ItemStore, token: string, defaultList: string): Promise<Response> {
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;

  if (url.searchParams.get("t") !== token) {
    return html(`
      <h1>offhand</h1>
      <p>Open this page with your token: <code>${origin}/setup?t=&lt;OFFHAND_TOKEN&gt;</code></p>
      <p>The token is the secret you set at deploy time.</p>`);
  }

  let lists = "";
  try {
    const all = await store.lists();
    lists = all.map((l) => `<li>${esc(l.name)}${sameList(l.name, defaultList) ? " <b>(default)</b>" : ""}</li>`).join("");
    if (defaultList.toLowerCase() === "tasks") lists += `<li>Tasks <b>(default: the inbox)</b></li>`;
  } catch (e) {
    lists = `<li><b>Could not reach your task manager:</b> ${esc(String(e))}. Check the API key.</li>`;
  }

  return html(`
    <h1>offhand is up</h1>
    <h2>Paste into your device's app</h2>
    <table>
      <tr><td>MCP server URL</td><td><code>${origin}/mcp</code></td></tr>
      <tr><td>Authorization header</td><td><code>Bearer ${esc(token)}</code></td></tr>
    </table>
    <h2>Lists offhand can see</h2>
    <ul>${lists}</ul>
    <p>Items with no list named go to the default. Change it with the <code>DEFAULT_LIST</code> variable.</p>
    <h2>Try it</h2>
    <p>Hold the button and say: <i>add milk to groceries</i>. Then: <i>what's on groceries</i>.</p>`);
}

function sameList(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function html(body: string): Response {
  const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>offhand setup</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#222}
  code{background:#f3f3f3;padding:.1rem .4rem;border-radius:4px;word-break:break-all}
  td{padding:.3rem .8rem .3rem 0;vertical-align:top}
</style>${body}`;
  return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
