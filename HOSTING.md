# Hosting the Apex site

Live address: https://apexk2.buildablelabs.dev (Cloudflare Workers). The site does not need Lovable. It keeps its own records (reports, applications, team, Discord settings, expeditions).

## Cloudflare (the live site)

`npm run build` produces a Cloudflare Worker in `.output` (config in `.output/server/wrangler.json`).

The Worker needs three things set by whoever runs the Cloudflare account:

1. **A KV namespace bound as `APEX_DATA`.** This is where every record is stored. Without it pages load but nothing can be saved.

   ```json
   "kv_namespaces": [{ "binding": "APEX_DATA", "id": "<namespace id>" }]
   ```

2. **Secrets and variables.** The names are in [.env.example](.env.example); the values are in the owner's `.env` file. The secret ones (`DISCORD_CLIENT_SECRET`, `DISCORD_SESSION_SECRET`, `DISCORD_BOT_TOKEN`) go in as Worker secrets. Leave `SUPABASE_SERVICE_ROLE_KEY` unset.

3. **`APEX_ADMIN_DISCORD_IDS`**: the Discord user IDs with full staff access, separated by commas. Other staff are granted by Discord role in the site's Discord settings panel (Staff access).

### Moving the existing records in

On the owner's computer:

```bash
node scripts/kv-export.mjs
```

That writes `.local-data/kv-bulk.json` (private: it holds webhook addresses, reports and applications). Load it once:

```bash
npx wrangler kv bulk put .local-data/kv-bulk.json --namespace-id <namespace id> --remote
```

### Discord

In the Discord developer portal, under OAuth2 → Redirects, add:

```
https://apexk2.buildablelabs.dev/api/public/discord/callback
```

## A plain Node server instead

Build with `NITRO_PRESET=node-server`, start with `npm start` (listens on `PORT`, default 3000). Records are then files in `APEX_DATA_DIR` (default `.local-data`), which must be a folder that survives restarts and redeploys. `npm start` does not read `.env` by itself.
