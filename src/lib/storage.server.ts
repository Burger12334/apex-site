// Where the site's own records are kept when there is no database service key.
// On Cloudflare (no disk) they go in the KV namespace bound as APEX_DATA; anywhere else they are files in
// the data folder (.local-data next to the app, or APEX_DATA_DIR). Names are the same in both: "team.json",
// "proof/<id>.png" and so on.
type KV = {
  get(key: string, type: 'text'): Promise<string | null>;
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  put(key: string, value: string | ArrayBuffer): Promise<void>;
};

const kv = () => (globalThis as { __env__?: Record<string, unknown> }).__env__?.['APEX_DATA'] as KV | undefined;
const onCloudflare = () => typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
export const dataDir = () => process.env['APEX_DATA_DIR'] || `${process.cwd()}/.local-data`;

// KV can hand back the previous value for up to a minute after a write. What this server instance wrote itself
// is remembered for that long, so a save is never followed by a read of the older copy here.
const recent = new Map<string, { text: string; at: number }>();
const FRESH_MS = 90_000;

function missing(): never { throw new Error('Site storage is not set up yet: the host needs a KV namespace bound as APEX_DATA.'); }

export async function readText(name: string): Promise<string | null> {
  const store = kv();
  if (store) { const mine = recent.get(name); if (mine && Date.now() - mine.at < FRESH_MS) return mine.text; return store.get(name, 'text'); }
  if (onCloudflare()) return null;
  const { readFile } = await import('node:fs/promises');
  return readFile(`${dataDir()}/${name}`, 'utf8').catch(() => null);
}
export async function writeText(name: string, text: string) {
  const store = kv();
  if (store) { recent.set(name, { text, at: Date.now() }); return store.put(name, text); }
  if (onCloudflare()) missing();
  await writeFileAt(name, text);
}
export async function readBytes(name: string): Promise<Uint8Array | null> {
  const store = kv();
  if (store) { const data = await store.get(name, 'arrayBuffer'); return data ? new Uint8Array(data) : null; }
  if (onCloudflare()) return null;
  const { readFile } = await import('node:fs/promises');
  return readFile(`${dataDir()}/${name}`).catch(() => null);
}
export async function writeBytes(name: string, bytes: Uint8Array) {
  const store = kv();
  if (store) return store.put(name, bytes.slice().buffer);
  if (onCloudflare()) missing();
  await writeFileAt(name, bytes);
}
async function writeFileAt(name: string, data: string | Uint8Array) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const path = `${dataDir()}/${name}`;
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await writeFile(path, data);
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  const text = await readText(name);
  if (!text) return fallback;
  try { return JSON.parse(text) as T; } catch { return fallback; }
}
export const writeJson = (name: string, value: unknown) => writeText(name, JSON.stringify(value, null, 2));

export function toBase64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
