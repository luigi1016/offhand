# Install offhand

## Before you start

You need:

- A **Cloudflare** account. Free. [Sign up](https://dash.cloudflare.com/sign-up).
- A **GitHub** account.
- A **Roma** account with at least one list. [roma.app](https://roma.app).
- A **device**. The Pebble Index 01 ring with the Pebble app is the one this has been tried with. Any app that can add an MCP server should work.

## Step 1. Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/luigi1016/offhand/tree/install-hardening/worker)

1. Click the button above. Sign in to Cloudflare if it asks.
2. On the form, pick your GitHub account under **Git account**. The first time, Cloudflare asks to connect to GitHub: approve it.
3. Leave everything else as it is.
4. Click **Deploy** at the bottom and wait for the build to finish. It takes about a minute.

<img src="docs/img/install-1-form.webp" width="460" alt="Cloudflare's form: Git account, Project name, KV namespace, the build commands, and a Deploy button">

**You should see:** the form above, which asks for no token, key or secret, then a build that ends in success.

Cloudflare has now made three things in your accounts: a copy of this code in a new GitHub repository, a Worker that runs it, and a small storage space (a KV namespace) for the Worker.

## Step 2. Open your Worker

1. In Cloudflare, open **Workers & Pages** and click your new Worker. It has the project name from the form.
2. On its **Overview** page, the address is the link at the top. It ends in `.workers.dev`. In the picture it is the grey bar.
3. Click the address.

<img src="docs/img/install-2-address.png" width="620" alt="The Worker's Overview page in Cloudflare, with the address at the top greyed out">

No address there? Open the **Domains** tab and switch on the toggle next to **Production**.

**You should see:** a page that says **offhand is up**, with one button: **Connect Roma**.

## Step 3. Connect Roma

1. Click **Connect Roma**. It opens roma.app.
2. Sign in to Roma if it asks, and approve.

**You should see:** your setup page. Its title is **offhand** and under **1. Item store** it says **Connected**.

Bookmark this page now. It is the only way back to it. Its address holds your token, so do not share the link or a screenshot of it.

## Step 4. Set up your device

The setup page has two things to paste, each with a **Copy** button: an **MCP server URL** and an **Authorization header**.

### Pebble Index 01

In the Pebble app:

1. Set hold and talk to **Index agent**.
2. Uncheck **Notes** and **Reminders**. Left on, Pebble keeps what you say in its own lists and offhand never hears it.
3. Add an MCP server. Choose **Streamable**, not SSE. Paste the URL and the header from the setup page.

### Any other device

Add an MCP server of the kind **Streamable HTTP**, with the URL and the header from the setup page.

## Step 5. Try it

The bottom of the setup page shows the lists offhand can see. Use one of yours in place of "groceries".

| Say | You should see |
|---|---|
| "add milk to groceries" | milk on that list in Roma |
| "what's on groceries" | the device reads the list back |
| "remind me to call mom at 9am tomorrow" | an item in Roma due tomorrow at 9:00 in the morning, your time |

That is the whole install.

## If something goes wrong

| What you see | What to do |
|---|---|
| The form in step 1 asks for a token, key or secret | That is a bug. Stop and [open an issue](https://github.com/luigi1016/offhand/issues). |
| The Worker has no address, or it is switched off | Open the Worker's Domains tab and switch on the toggle next to Production. |
| "Open this page with your token" | The Worker is already set up. Use your bookmark. If you lost it, see below. |
| "Not set up yet" | Open the Worker's address and do step 3. |
| The device says "expected status code 200 but was 405" | The MCP server was added as SSE. Add it as Streamable. |
| What you say lands in Pebble's own notes or reminders | In the Pebble app, set hold and talk to Index agent and uncheck Notes and Reminders. |
| Times land at the wrong hour | The setup page shows the time zone offhand uses, near the bottom. If it is wrong, click Disconnect Roma, then Connect Roma again from a browser in your time zone. |

**Lost the bookmark?** In Cloudflare, open **Storage & Databases**, then **KV**, open the Worker's namespace and delete the key named `offhand.token`. Open the Worker's address and connect Roma again. That makes a new token, so paste the new header into your device's app.

## What to know

- **Your token is never shown to a visitor.** It is made when you finish connecting Roma, so a robot or a stranger that opens your Worker's address first gets a page with a button and nothing else.
- **Your Roma sign-in stays in your Cloudflare account**, in the Worker's KV namespace. Whoever can log in to that account can read it.
- **Your Worker runs your copy of the code.** It does not follow this repository, so changes here do not reach it yet.

## Remove it

Delete these three, in this order:

1. **The Worker.** Cloudflare, Workers & Pages, your Worker, Settings, scroll to the bottom, Delete.
2. **The storage.** Cloudflare, Storage & Databases, KV, the Worker's namespace, Delete.
3. **The copy of the code.** GitHub, the repository Cloudflare made, Settings, Danger Zone, Delete this repository.

Then remove the MCP server from your device's app.
