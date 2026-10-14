import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

// Apex Postcards: a monthly contest of real-life photos. Members who linked Discord send one photo a month;
// staff approve it before it shows; members vote (one vote per person per month, never for their own); after
// the month staff crown the winner, whose designed postcard joins the Collection. Months run on UTC.
export type Postcard = { id: string; month: string; author_id: string; author_name: string; author_avatar: string; file: string; place: string; caption: string; lat?: number | undefined; lng?: number | undefined; pin_on_map: boolean; status: 'pending' | 'approved' | 'rejected'; votes: string[]; created_at: string };
export type PostcardWinner = { month: string; entry_id: string; design_file: string; crowned_at: string };
export type PostcardView = Omit<Postcard, 'votes' | 'file' | 'lat' | 'lng' | 'pin_on_map'> & { image_url: string; votes: number; voted: boolean; mine: boolean };
export type CollectionItem = { month: string; entry: PostcardView; design_url: string };

export const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const closesAt = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y ?? 2026, m ?? 1, 1)).toISOString(); };
const url = (file: string) => file ? `/api/public/postcards/${file}` : '';

async function store() { return import('./local-store.server'); }
async function who() {
  const { readSession } = await import('./discord.server'); const { accessFor } = await import('./staff.server');
  const me = await readSession();
  return { me, staff: (await accessFor(me)).staff };
}
const view = (p: Postcard, me: string | undefined): PostcardView => {
  const { votes, file, lat: _a, lng: _b, pin_on_map: _c, ...rest } = p;
  return { ...rest, image_url: url(file), votes: votes.length, voted: !!me && votes.includes(me), mine: me === p.author_id };
};
async function load() {
  const { readLocalList } = await store();
  return { entries: await readLocalList<Postcard>('postcards'), winners: await readLocalList<PostcardWinner>('postcard-winners') };
}

export const getPostcards = createServerFn({ method: 'GET' }).handler(async () => {
  const { localMode } = await store();
  const { me, staff } = await who();
  const month = monthKey();
  if (!localMode()) return { month, closes_at: closesAt(month), entries: [], mine: null, pending: [], months: [], collection: [], linked: !!me, staff: false };
  const { entries, winners } = await load();
  const approved = entries.filter(e => e.status === 'approved');
  // Every finished month with entries, newest first, best voted first, with its winner if staff crowned one.
  const months = [...new Set(approved.map(e => e.month))].filter(m => m !== month).sort().reverse().map(m => ({ month: m, winner: winners.find(w => w.month === m)?.entry_id ?? '', entries: approved.filter(e => e.month === m).sort((a, b) => b.votes.length - a.votes.length).map(e => view(e, me?.id)) }));
  const collection: CollectionItem[] = winners.map(w => { const e = entries.find(x => x.id === w.entry_id); return e ? { month: w.month, entry: view(e, me?.id), design_url: url(w.design_file) } : null; }).filter((x): x is CollectionItem => !!x).sort((a, b) => b.month.localeCompare(a.month));
  const mine = me ? entries.find(e => e.month === month && e.author_id === me.id && e.status !== 'rejected') : undefined;
  return {
    month, closes_at: closesAt(month),
    entries: approved.filter(e => e.month === month).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(e => view(e, me?.id)),
    mine: mine ? view(mine, me?.id) : null,
    pending: staff ? entries.filter(e => e.status === 'pending').map(e => view(e, me?.id)) : [],
    months, collection, linked: !!me, staff,
  };
});

const image = z.object({ data: z.string().max(11500000), type: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']) });
const entryInput = z.object({ image, place: z.string().trim().min(2, 'Say where the photo was taken').max(80), caption: z.string().trim().max(280).default(''), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(), pin_on_map: z.boolean().default(false) });
export const submitPostcard = createServerFn({ method: 'POST' }).inputValidator((d) => entryInput.parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await store();
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  const { me } = await who();
  if (!me) throw new Error('Link your Discord to enter the contest.');
  const month = monthKey(); const entries = await readLocalList<Postcard>('postcards');
  if (entries.some(e => e.month === month && e.author_id === me.id && e.status !== 'rejected')) throw new Error('You already have an entry this month. Remove it first to send a different photo.');
  const file = await (await import('./images.server')).saveImage('postcards', data.image, 8 * 1024 * 1024);
  const { avatarUrl } = await import('./community.server');
  const entry: Postcard = { id: crypto.randomUUID(), month, author_id: me.id, author_name: me.username, author_avatar: avatarUrl(me), file, place: data.place, caption: data.caption, lat: data.lat, lng: data.lng, pin_on_map: data.pin_on_map && data.lat !== undefined && data.lng !== undefined, status: 'pending', votes: [], created_at: new Date().toISOString() };
  await writeLocalList('postcards', [entry, ...entries]);
  const { logEvent, LOG_COLORS } = await import('./audit-log.server'); const { currentOrigin } = await import('./discord.server');
  await logEvent({ title: 'Postcard entry waiting for approval', color: LOG_COLORS.warn, lines: [`**By** <@${me.id}> (${me.username})`, `**Place** ${data.place}`, data.caption && `**Caption** ${data.caption}`, `**Review it** ${currentOrigin()}/postcards`] });
  return { id: entry.id };
});

// Vote for an entry this month, or take the vote back. Voting for another entry moves the vote.
export const votePostcard = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await store();
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  const { me } = await who();
  if (!me) throw new Error('Link your Discord to vote.');
  const entries = await readLocalList<Postcard>('postcards'); const entry = entries.find(e => e.id === data);
  if (!entry || entry.status !== 'approved') throw new Error('That entry is not in the contest.');
  if (entry.month !== monthKey()) throw new Error('Voting for that month has closed.');
  if (entry.author_id === me.id) throw new Error('You cannot vote for your own photo.');
  const had = entry.votes.includes(me.id);
  const moved = !had ? entries.find(e => e.month === entry.month && e.id !== entry.id && e.votes.includes(me.id)) : undefined;
  await writeLocalList('postcards', entries.map(e => e.month !== entry.month ? e : { ...e, votes: e.id === entry.id && !had ? [...e.votes.filter(v => v !== me.id), me.id] : e.votes.filter(v => v !== me.id) }));
  const { logEvent, LOG_COLORS } = await import('./audit-log.server');
  await logEvent({ title: had ? 'Postcard vote taken back' : moved ? 'Postcard vote moved' : 'Postcard vote', color: LOG_COLORS.info, lines: [`**Voter** <@${me.id}> (${me.username})`, `**Photo** ${entry.place} by <@${entry.author_id}> (${entry.author_name})`, moved && `**Moved from** ${moved.place} by ${moved.author_name}`, `**Votes now** ${had ? entry.votes.length - 1 : entry.votes.length + 1}`] });
  return { voted: !had };
});

export const deletePostcard = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await store();
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  const { me, staff } = await who();
  const entries = await readLocalList<Postcard>('postcards'); const entry = entries.find(e => e.id === data);
  if (!entry) throw new Error('That entry is already gone.');
  if (!staff && me?.id !== entry.author_id) throw new Error('You can only remove your own entry.');
  await writeLocalList('postcards', entries.filter(e => e.id !== data));
  await writeLocalList('postcard-winners', (await readLocalList<PostcardWinner>('postcard-winners')).filter(w => w.entry_id !== data));
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Postcard entry removed', color: LOG_COLORS.bad, lines: [`**Entry by** <@${entry.author_id}> (${entry.author_name})`, `**Place** ${entry.place}`], by: await actorName() });
});

// Staff: approve an entry (it joins the contest, and goes on the World Map if the sender asked) or turn it down.
export const reviewPostcard = createServerFn({ method: 'POST' }).inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(['approved', 'rejected']) }).parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await store();
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const entries = await readLocalList<Postcard>('postcards'); const entry = entries.find(e => e.id === data.id);
  if (!entry) throw new Error('That entry is already gone.');
  await writeLocalList('postcards', entries.map(e => e.id === data.id ? { ...e, status: data.status } : e));
  let pinned = false;
  if (data.status === 'approved' && entry.pin_on_map && entry.lat !== undefined && entry.lng !== undefined) {
    const { addPin, readPins } = await import('./worldmap.server');
    if (!(await readPins()).some(p => p.postcard_id === entry.id)) {
      try { await addPin({ author_id: entry.author_id, author_name: entry.author_name, author_avatar: entry.author_avatar, lat: entry.lat, lng: entry.lng, place: entry.place, note: entry.caption.slice(0, 200), source: 'postcard', postcard_id: entry.id }); pinned = true; } catch { /* over the pin limit: the entry still counts */ }
    }
  }
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: data.status === 'approved' ? 'Postcard entry approved' : 'Postcard entry turned down', color: data.status === 'approved' ? LOG_COLORS.good : LOG_COLORS.bad, lines: [`**Entry by** <@${entry.author_id}> (${entry.author_name})`, `**Place** ${entry.place}`, pinned && '**Added to the World Map**'], by: await actorName() });
  return { pinned };
});

// Staff: crown a month's winner. It is announced in the expeditions channel when one is set up.
export const crownPostcard = createServerFn({ method: 'POST' }).inputValidator((d) => z.string().uuid().parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList, readLocalDiscord } = await store();
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const entry = (await readLocalList<Postcard>('postcards')).find(e => e.id === data);
  if (!entry || entry.status !== 'approved') throw new Error('Only an approved entry can win.');
  const winners = await readLocalList<PostcardWinner>('postcard-winners'); const before = winners.find(w => w.month === entry.month);
  await writeLocalList('postcard-winners', [...winners.filter(w => w.month !== entry.month), { month: entry.month, entry_id: entry.id, design_file: before?.entry_id === entry.id ? before.design_file : '', crowned_at: new Date().toISOString() }]);
  const { currentOrigin } = await import('./discord.server');
  const config = await readLocalDiscord(); let announced = 'not set up';
  if (config.events_webhook_url) {
    const monthName = new Date(`${entry.month}-01T00:00:00Z`).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    try {
      const response = await fetch(config.events_webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [{ title: `📮 Postcard of the month: ${monthName}`, color: 0xf59e0b, description: `Congratulations <@${entry.author_id}>! Your photo from **${entry.place}** won this month's Apex Postcards contest with **${entry.votes.length}** votes and will be made into a postcard.\n\n**[See the Collection](${currentOrigin()}/postcards)**`, image: { url: `${currentOrigin()}${url(entry.file)}` } }], allowed_mentions: { parse: [] } }) });
      announced = response.ok ? 'sent' : `failed: Discord [${response.status}]`;
    } catch (e) { announced = `failed: ${e instanceof Error ? e.message.slice(0, 120) : 'unknown error'}`; }
  }
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Postcard winner crowned', color: LOG_COLORS.good, lines: [`**Month** ${entry.month}`, `**Winner** <@${entry.author_id}> (${entry.author_name})`, `**Place** ${entry.place}`, `**Announcement** ${announced}`], by: await actorName() });
  return { announced };
});

// Staff: upload the designed postcard for a crowned winner.
export const uploadPostcardDesign = createServerFn({ method: 'POST' }).inputValidator((d) => z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), image }).parse(d)).handler(async ({ data }) => {
  const { localMode, readLocalList, writeLocalList } = await store();
  if (!localMode()) throw new Error('Not available while the site is connected to the database.');
  await (await import('./staff.server')).requireStaff();
  const winners = await readLocalList<PostcardWinner>('postcard-winners');
  if (!winners.some(w => w.month === data.month)) throw new Error('Crown a winner for that month first.');
  const design_file = await (await import('./images.server')).saveImage('postcards', data.image, 10 * 1024 * 1024, `design-${crypto.randomUUID()}`);
  await writeLocalList('postcard-winners', winners.map(w => w.month === data.month ? { ...w, design_file } : w));
  const { logEvent, LOG_COLORS, actorName } = await import('./audit-log.server');
  await logEvent({ title: 'Designed postcard added to the Collection', color: LOG_COLORS.edit, lines: [`**Month** ${data.month}`], by: await actorName() });
});
