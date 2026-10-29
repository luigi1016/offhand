// The setup page: connect the item store, see which lists offhand sees, and copy what to
// paste into your device's app. Guarded by the offhand token, passed as ?t= because a
// browser cannot set a header.

import type { ItemStore } from "./store/types";

export interface SetupState {
  origin: string;
  token: string;
  tokenFromEnv: boolean; // set at deploy time; cannot be rotated here
  store: ItemStore;
  roma: { mode: "key" | "oauth"; connected: boolean };
  defaultList: string;
}

export async function renderSetup(state: SetupState, notice?: string): Promise<Response> {
  const { origin, token, store, roma, defaultList } = state;
  const t = `?t=${encodeURIComponent(token)}`;

  let romaSection: string;
  if (roma.mode === "key") {
    romaSection = `<p>Connected with an API key set at deploy time.</p>`;
  } else if (roma.connected) {
    romaSection = `<p>Connected.</p>
      <form method="post" action="/setup${t}"><button name="action" value="disconnect">Disconnect Roma</button></form>`;
  } else {
    romaSection = `<p>Not connected yet.</p>
      <p><a class="button" href="/oauth/start${t}">Connect Roma</a></p>
      <p class="muted">Opens roma.app. You approve once; nothing to paste.</p>`;
  }

  let lists = "";
  if (roma.mode === "key" || roma.connected) {
    try {
      const all = await store.lists();
      lists = all.map((l) => `<li>${esc(l.name)}${sameList(l.name, defaultList) ? " <b>(default)</b>" : ""}</li>`).join("");
      if (defaultList.toLowerCase() === "tasks") lists += `<li>Tasks <b>(default: the inbox)</b></li>`;
    } catch (e) {
      lists = `<li><b>Could not reach Roma:</b> ${esc(String(e))}</li>`;
    }
  } else {
    lists = `<li class="muted">Connect Roma to see them.</li>`;
  }

  const rotate = state.tokenFromEnv
    ? `<p class="muted">The token was set at deploy time (<code>OFFHAND_TOKEN</code>). Change it there.</p>`
    : `<form method="post" action="/setup${t}"><button name="action" value="rotate">New token</button>
       <span class="muted">Makes a new one and invalidates this one. Paste it into your device's app again.</span></form>`;

  return html(`
    ${notice ? `<p class="notice">${esc(notice)}</p>` : ""}
    <h1>offhand</h1>

    <h2>1. Item store</h2>
    ${romaSection}

    <h2>2. Paste into your device's app</h2>
    <table>
      <tr><td>MCP server URL</td><td><code id="u">${esc(origin)}/mcp</code> <button data-copy="u">Copy</button></td></tr>
      <tr><td>Authorization header</td><td><code id="h">Bearer ${esc(token)}</code> <button data-copy="h">Copy</button></td></tr>
    </table>
    <p class="muted">A device without its own agent posts text to <code>${esc(origin)}/say</code> with the same header.</p>

    <h2>3. Try it</h2>
    <p>Hold the button and say: <i>add milk to groceries</i>. Then: <i>what's on groceries</i>.</p>

    <h2>Lists offhand can see</h2>
    <ul>${lists}</ul>
    <p class="muted">Items with no list named go to the default. Change it with the <code>DEFAULT_LIST</code> variable.</p>

    <h2>Token</h2>
    ${rotate}
    <script>
      for (const b of document.querySelectorAll("[data-copy]")) b.onclick = () => {
        navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent);
        b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1500);
      };
    </script>`);
}

export function renderNoToken(origin: string): Response {
  return html(`
    <h1>offhand</h1>
    <p>Open this page with your token: <code>${esc(origin)}/setup?t=&lt;your token&gt;</code></p>
    <p>You saw the token once, right after deploying, at <code>${esc(origin)}/</code>. If you lost it, set a new one
    as the <code>OFFHAND_TOKEN</code> secret, or delete the <code>offhand.token</code> key from the KV namespace and
    open <code>${esc(origin)}/</code> again.</p>`);
}

// Shown exactly once: the first visit to / after deploying, when the token is made.
export function renderFirstVisit(origin: string, token: string): Response {
  return html(`
    <h1>offhand is up</h1>
    <p>This is your token. It is shown once. Your devices send it; keep it like a password.</p>
    <p><code>${esc(token)}</code></p>
    <p><a class="button" href="/setup?t=${encodeURIComponent(token)}">Continue to setup</a></p>
    <p class="muted">Bookmark the setup page. It is ${esc(origin)}/setup?t=&lt;token&gt;.</p>`);
}

export function renderPlain(text: string, status = 200): Response {
  return html(`<h1>offhand</h1><p>${esc(text)}</p>`, status);
}

function sameList(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function html(body: string, status = 200): Response {
  const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>offhand setup</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#222}
  code{background:#f3f3f3;padding:.1rem .4rem;border-radius:4px;word-break:break-all}
  td{padding:.3rem .8rem .3rem 0;vertical-align:top}
  button,.button{font:inherit;padding:.3rem .8rem;border:1px solid #888;border-radius:6px;background:#fff;color:#222;text-decoration:none;cursor:pointer}
  .muted{color:#666;font-size:.9em}
  .notice{background:#eef6ee;border:1px solid #9c9;padding:.5rem .8rem;border-radius:6px}
  form{display:inline}
</style>${body}`;
  return new Response(page, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
