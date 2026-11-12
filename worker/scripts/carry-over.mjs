// What a copy of offhand keeps across an update: the values Cloudflare wrote into it at
// install. Everything else comes from the latest code. Text in, text out.

const NAME = /("name"\s*:\s*")[^"]*(")/;
const KV_ID = /("binding"\s*:\s*"OFFHAND_KV"\s*,\s*"id"\s*:\s*")[^"]*(")/;

// The latest wrangler.jsonc, with this copy's Worker name and KV namespace id.
export function carryWrangler(latest, mine) {
  const kept = read(mine);
  if (!kept.name || !kept.id) throw new Error("This copy's wrangler.jsonc has no Worker name or no OFFHAND_KV id.");
  const out = latest.replace(NAME, (_, a, b) => a + kept.name + b).replace(KV_ID, (_, a, b) => a + kept.id + b);
  const now = read(out);
  if (now.name !== kept.name || now.id !== kept.id) {
    throw new Error("The latest wrangler.jsonc has no place for this copy's Worker name and KV id.");
  }
  return out;
}

// The latest package.json, with this copy's name.
export function carryPackage(latest, mine) {
  const name = JSON.parse(mine).name;
  if (!name) return latest;
  const out = latest.replace(NAME, (_, a, b) => a + name + b);
  if (JSON.parse(out).name !== name) throw new Error("The latest package.json has no name to replace.");
  return out;
}

function read(jsonc) {
  const config = JSON.parse(stripComments(jsonc));
  return { name: config.name, id: config.kv_namespaces?.find((k) => k.binding === "OFFHAND_KV")?.id };
}

// JSON with // and /* */ comments, to plain JSON. Comment marks inside strings are left alone.
export function stripComments(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const start = i++;
      while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
      out += text.slice(start, i + 1);
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
    } else {
      out += c;
    }
  }
  return out;
}
