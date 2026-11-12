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

In the Pebble app, open **Index**, then its **Settings**:

1. Set **Hold & Talk** to **Index agent**.
2. Uncheck **Notes** and **Reminders**. Left on, Pebble keeps what you say in its own lists and offhand never hears it.

<img src="docs/img/install-4-pebble-settings.png" width="300" alt="Pebble's Index settings: Hold and Talk set to Index agent, Notes and Reminders unchecked">

3. Add an MCP server. Paste the **MCP server URL** from the setup page into **URL**.
4. Choose **Streamable**, not SSE.
5. Tap **Authorization (optional)** to open it and paste the whole **Authorization header** from the setup page, the word `Bearer` included. It is not optional here: without it Pebble says "unauthorized".
6. Tap **Save**.

<img src="docs/img/install-4-pebble-server.png" width="300" alt="Pebble's MCP server box: Streamable chosen, with Authorization (optional) below it">

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

## Update it

Install it again over the old one. Keep the storage: it holds your token and your Roma sign-in, so your device keeps working.

1. **Delete the Worker.** Cloudflare, Workers & Pages, your Worker, Settings, scroll to the bottom, Delete.

   <img src="docs/img/update-1-delete-worker.png" width="620" alt="The bottom of the Worker's Settings page in Cloudflare: Danger zone, Delete Worker">

2. **Delete the copy of the code.** GitHub, the repository Cloudflare made, Settings, Danger Zone, Delete this repository.

   <img src="docs/img/update-2-delete-repo.png" width="620" alt="The bottom of the repository's Settings page on GitHub: Danger Zone, Delete this repository">

3. **Deploy again.** Do [Step 1](#step-1-deploy) with the same project name. Under **Select KV namespace**, pick your existing one, not "Create new".

Your bookmarked setup page still opens and still says **Connected**.

## Remove it

Delete these three, in this order:

1. **The Worker.** Cloudflare, Workers & Pages, your Worker, Settings, scroll to the bottom, Delete.
2. **The storage.** Cloudflare, Storage & Databases, KV, the Worker's namespace, Delete.
3. **The copy of the code.** GitHub, the repository Cloudflare made, Settings, Danger Zone, Delete this repository.

Then remove the MCP server from your device's app.
