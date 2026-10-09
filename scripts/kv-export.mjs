// Packs the records in .local-data into one file that Cloudflare can load into the site's KV namespace:
//   node scripts/kv-export.mjs
//   npx wrangler kv bulk put .local-data/kv-bulk.json --namespace-id <id> --remote
// The output holds private data (webhook addresses, reports, applications). Never commit or post it publicly.
import { readdir, readFile, writeFile } from 'node:fs/promises';

const dir = process.env.APEX_DATA_DIR || '.local-data';
const entries = [];
for (const name of await readdir(dir)) {
  if (name.endsWith('.json') && name !== 'kv-bulk.json') entries.push({ key: name, value: await readFile(`${dir}/${name}`, 'utf8') });
}
for (const name of await readdir(`${dir}/proof`).catch(() => [])) {
  entries.push({ key: `proof/${name}`, value: (await readFile(`${dir}/proof/${name}`)).toString('base64'), base64: true });
}
await writeFile(`${dir}/kv-bulk.json`, JSON.stringify(entries));
console.log(`Wrote ${dir}/kv-bulk.json with ${entries.length} records: ${entries.map(e => e.key).join(', ')}`);
