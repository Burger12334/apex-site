# Hosting the Apex site

The site is a Node server. It does not need Lovable. It keeps its own records (reports, applications, team, Discord settings, expeditions) as files in one folder.

## What the host must provide

- **Node 20 or newer** with a long-running process (a VPS, Railway, Render, Fly.io, or any "Node app" hosting). Plain file hosting that only serves HTML cannot run it.
- **A folder that survives restarts and redeploys.** Point `APEX_DATA_DIR` at it. If the folder is wiped on each deploy, every report and application is lost.

## Commands

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

The server listens on `PORT` (default 3000).

## Settings

Enter the names listed in [.env.example](.env.example) in the host's environment variables screen, with the values from the `.env` file on the owner's computer. `npm start` does not read `.env` by itself.

`APEX_ADMIN_DISCORD_IDS` lists the Discord user IDs with full staff access. Other staff are granted by Discord role in the site's Discord settings panel (Staff access).

## Moving existing records

Copy the contents of the `.local-data` folder from the owner's computer into the host's `APEX_DATA_DIR` folder before the first start. It holds the team, applications, reports and Discord settings.

## Discord

In the Discord developer portal, under OAuth2 → Redirects, add:

```
https://YOUR-DOMAIN/api/public/discord/callback
```

## Other kinds of host

Set `NITRO_PRESET` before building (for example `vercel` or `netlify`). Those platforms have no permanent folder, so records would not be kept; use a host with a persistent disk.
