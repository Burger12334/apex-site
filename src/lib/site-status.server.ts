// The site status card posted in the staff Discord (#site-status in Apex Site HQ).
// It checks every page of the public site, the Discord bot and the main server, and (when it runs on the site
// itself) how much is waiting for staff. The same message is edited each time, so the channel holds one live card.
const STATUS_CHANNEL = '1559014630431522847';
const LIVE_SITE = 'https://apexk2.buildablelabs.dev';
const PAGES: [string, string][] = [['Basecamp', '/'], ['Applications', '/apply'], ['Expeditions', '/expeditions'], ['Members', '/members'], ['Content', '/content'], ['Reports', '/reports'], ['Rules', '/rules'], ['Terms', '/terms'], ['Privacy', '/privacy']];

export const statusChannel = () => process.env['STATUS_CHANNEL_ID'] || STATUS_CHANNEL;
export const statusSite = () => (process.env['SITE_URL'] || LIVE_SITE).replace(/\/$/, '');

type Check = { name: string; path: string; ok: boolean; status: number; ms: number };
async function checkPage(site: string, name: string, path: string): Promise<Check> {
  const started = Date.now();
  try {
    const response = await fetch(`${site}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'ApexSiteStatus/1.0' } });
    await response.arrayBuffer().catch(() => null);
    return { name, path, ok: response.status === 200, status: response.status, ms: Date.now() - started };
  } catch { return { name, path, ok: false, status: 0, ms: Date.now() - started }; }
}
const speed = (ms: number) => ms < 800 ? '🟢' : ms < 2500 ? '🟡' : '🟠';

// Builds the card. `queue` adds what is waiting for staff, read from this copy's own records.
export async function buildStatus(queue: boolean) {
  const site = statusSite();
  const pages = await Promise.all(PAGES.map(([name, path]) => checkPage(site, name, path)));
  const down = pages.filter(p => !p.ok); const home = pages[0];
  const average = Math.round(pages.reduce((sum, p) => sum + p.ms, 0) / pages.length);

  // Discord: the bot itself, the main server, and what it is allowed to read there.
  const { discordFetch, roleGuild } = await import('./community.server');
  const discord: string[] = []; let botOk = false;
  try {
    const guild = await roleGuild();
    const [me, server, app] = await Promise.all([
      discordFetch('users/@me') as Promise<{ username: string }>,
      discordFetch(`guilds/${guild}?with_counts=true`) as Promise<{ name: string; approximate_member_count?: number; approximate_presence_count?: number }>,
      discordFetch('applications/@me') as Promise<{ flags?: number }>,
    ]);
    botOk = true;
    const flags = app.flags ?? 0;
    discord.push(`✅ **Bot** ${me.username} is connected`, `✅ **Server** ${server.name} · ${server.approximate_member_count ?? '?'} members · ${server.approximate_presence_count ?? '?'} online`,
      `${flags & (16384 | 32768) ? '✅' : '⚠️'} **Member list** ${flags & (16384 | 32768) ? 'readable' : 'blocked (Server Members Intent is off)'}`,
      `${flags & (262144 | 524288) ? '✅' : '⚠️'} **Announcements** ${flags & (262144 | 524288) ? 'readable' : 'blocked (Message Content Intent is off)'}`);
    try {
      const events = await discordFetch(`guilds/${guild}/scheduled-events`) as { status: number }[];
      const live = events.filter(e => e.status === 2).length; const soon = events.filter(e => e.status === 1).length;
      discord.push(`📅 **Discord events** ${live} live · ${soon} scheduled`);
    } catch { discord.push('⚠️ **Discord events** could not be read just now'); }
  } catch (e) { discord.push(`❌ **Bot** not reachable (${(e instanceof Error ? e.message : 'unknown error').slice(0, 120)})`); }

  const setup = [
    `${process.env['DISCORD_CLIENT_ID'] && process.env['DISCORD_CLIENT_SECRET'] ? '✅' : '❌'} Discord sign-in`,
    `${process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET'] ? '✅' : '⚠️'} Google admin sign-in`,
    `${process.env['DISCORD_BOT_TOKEN'] ? '✅' : '❌'} Bot token`,
  ];

  const fields = [
    { name: `Pages · ${pages.length - down.length}/${pages.length} up`, value: pages.map(p => `${p.ok ? '✅' : '❌'} **${p.name}** ${p.ok ? `${speed(p.ms)} ${p.ms} ms` : p.status ? `error ${p.status}` : 'no answer'}`).join('\n'), inline: true },
    { name: 'Discord', value: discord.join('\n').slice(0, 1024), inline: true },
    { name: 'Speed', value: `Home page **${home?.ms ?? '?'} ms**\nAverage **${average} ms** across ${pages.length} pages`, inline: false },
  ];
  if (queue) {
    const { readLocalReports, readLocalApplications, readLocalTeam, readLocalList, localMode } = await import('./local-store.server');
    if (localMode()) {
      const [reports, apps, team, expeditions, content] = await Promise.all([readLocalReports(), readLocalApplications(), readLocalTeam(), readLocalList<{ starts_at: string }>('expeditions'), readLocalList('content')]);
      fields.push({ name: 'Waiting for staff', value: `🚨 **${reports.filter(r => r.status === 'open').length}** open reports\n📝 **${apps.filter(a => a.status === 'pending').length}** pending applications`, inline: true });
      fields.push({ name: 'On the site', value: `🏔️ **${expeditions.filter(e => new Date(e.starts_at).getTime() > Date.now() - 6 * 3600000).length}** upcoming expeditions\n👥 **${team.length}** team members listed\n📸 **${content.length}** content posts`, inline: true });
    }
    fields.push({ name: 'Set up on this server', value: setup.join(' · '), inline: false });
  }
  if (down.length) fields.push({ name: 'Needs attention', value: down.map(p => `• **${p.name}** (${site}${p.path}) ${p.status === 404 ? 'is missing: the site has not been updated to the newest version yet' : p.status ? `answered with error ${p.status}` : 'did not answer within 15 seconds'}`).join('\n').slice(0, 1024), inline: false });

  const state = !home?.ok ? 'down' : down.length || !botOk ? 'partial' : 'ok';
  return {
    state,
    embed: {
      title: state === 'ok' ? '🟢 Apex site: all systems operational' : state === 'partial' ? '🟡 Apex site: partly working' : '🔴 Apex site: down',
      url: site, color: state === 'ok' ? 0x22c55e : state === 'partial' ? 0xf59e0b : 0xef4444,
      description: `**${site.replace(/^https?:\/\//, '')}**\n${state === 'ok' ? 'Every page answered and the Discord bot is connected.' : state === 'partial' ? 'The site is up, but something below needs a look.' : 'The home page is not answering.'}\nLast checked <t:${Math.floor(Date.now() / 1000)}:R>`,
      fields, footer: { text: 'Apex site status · refreshed from the Discord settings panel' }, timestamp: new Date().toISOString(),
    },
  };
}

// Posts the card, or edits the one posted before so the channel keeps a single up-to-date message.
export async function postStatus(queue: boolean) {
  const { discordFetch } = await import('./community.server'); const { readJson, writeJson } = await import('./storage.server');
  const channel = statusChannel(); const { state, embed } = await buildStatus(queue);
  const saved = await readJson<{ channel: string; message: string } | null>('status-message.json', null);
  if (saved?.channel === channel) {
    try { await discordFetch(`channels/${channel}/messages/${saved.message}`, { embeds: [embed] }, 0, 'PATCH'); return { state, updated: true }; } catch { /* the old card was deleted: post a new one */ }
  }
  const message = await discordFetch(`channels/${channel}/messages`, { embeds: [embed], allowed_mentions: { parse: [] } }) as { id: string };
  await writeJson('status-message.json', { channel, message: message.id });
  return { state, updated: false };
}
