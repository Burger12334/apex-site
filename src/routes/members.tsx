import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApplyShell, DiscordIcon, apexQuery, useApplyAccess } from '@/components/apply-shell';
import { DiscordAvatar, RoleBadge } from '@/components/community';
import { HeroBackdrop } from '@/components/hero-slides';
import { getMembers, searchMembers } from '@/lib/members.functions';
import type { Member } from '@/lib/members.server';

export const Route = createFileRoute('/members')({
  head: () => ({ meta: [{ title: 'Members — Apex' }, { name: 'description', content: 'Find a member of the Apex Discord server and see the crew by role.' }, { property: 'og:title', content: 'Members — Apex' }, { property: 'og:description', content: 'Find a member of the Apex Discord server and see the crew by role.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(apexQuery),
  component: Members,
});

// How many people a role shows before "Show all".
const PREVIEW = 24;

function MemberCard({ m }: { m: Member }) {
  return <a className="member-card" href={`https://discord.com/users/${m.id}`} target="_blank" rel="noreferrer" title={`Open ${m.name} on Discord`}>
    <DiscordAvatar user={m} /><span className="member-name"><strong>{m.name}</strong><small>@{m.username}</small></span><RoleBadge role={m.role} />
  </a>;
}

function Members() {
  const { me, linkDiscord } = useApplyAccess();
  const load = useServerFn(getMembers); const find = useServerFn(searchMembers);
  const [q, setQ] = useState(''); const [term, setTerm] = useState(''); const [open, setOpen] = useState<Record<string, boolean>>({});
  // Wait until typing pauses before asking Discord.
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  const all = useQuery({ queryKey: ['members', me.data?.id ?? 'guest'], staleTime: 300000, queryFn: () => load() });
  const searching = term.length >= 2;
  const everyone = all.data?.groups.flatMap(g => g.members) ?? [];
  // With the full list loaded, searching is instant and matches anywhere in a name; otherwise Discord is asked.
  const local = all.data?.listed ? everyone.filter(m => m.id === term || `${m.name} ${m.username}`.toLowerCase().includes(term.toLowerCase())) : null;
  const remote = useQuery({ queryKey: ['member-search', term], enabled: searching && !!all.data?.ok && !local, queryFn: () => find({ data: term }) });
  const results = local ?? remote.data ?? [];

  return <ApplyShell active="members">
    <div className="focus-page">
      <div className="focus-bg" aria-hidden="true"><HeroBackdrop /></div>
      <section className="focus-panel tone-members">
        <header className="focus-head">
          <div className="focus-title-row">
            <div><div className="eyebrow"><span className="line" />THE APEX CREW</div><h1 className="focus-title">Member search</h1><p className="focus-lede">Find anyone in the Apex Discord by name or Discord ID, or browse the whole server by role.</p></div>
            <span className="focus-emblem members"><Users /></span>
          </div>
          {all.data?.ok && <label className="member-search"><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a name or paste a Discord ID" aria-label="Search members" autoComplete="off" /></label>}
        </header>
        <div className="member-body">
          {all.isLoading ? <p className="member-note">Loading the crew…</p>
            : !all.data?.ok ? <div className="member-locked"><Users /><p>{all.data?.why === 'not-member' ? 'The member list is for people in the Apex Discord server. Join the server, then come back.' : 'Link your Discord to see the member list. It is shown to people in the Apex Discord server.'}</p>{all.data?.why !== 'not-member' && <Button onClick={linkDiscord} disabled={me.isLoading}><DiscordIcon />Link Discord<ArrowUpRight /></Button>}</div>
            : searching ? <>
              <h2 className="member-heading">Results<span>{remote.isFetching ? 'Searching…' : results.length}</span></h2>
              {!remote.isFetching && results.length === 0 ? <p className="member-note">Nobody in the server matches “{term}”.</p> : <div className="member-grid results">{results.map(m => <MemberCard key={m.id} m={m} />)}</div>}
            </>
            : !all.data.listed ? <p className="member-note">Type a name or paste a Discord ID above to find someone. The full list by role appears here once the Apex bot is allowed to read the server’s member list.</p>
            : <>
              <p className="member-total">{all.data.total} members, highest role first.</p>
              {all.data.groups.map(g => { const shown = open[g.id] ? g.members : g.members.slice(0, PREVIEW); return <section key={g.id} className="member-group">
                <h2 className="member-heading"><RoleBadge role={g} /><span>{g.members.length}</span></h2>
                <div className="member-grid">{shown.map(m => <MemberCard key={m.id} m={m} />)}</div>
                {g.members.length > PREVIEW && <Button variant="outline" size="sm" className="member-more" onClick={() => setOpen(o => ({ ...o, [g.id]: !o[g.id] }))}>{open[g.id] ? 'Show fewer' : `Show all ${g.members.length}`}</Button>}
              </section>; })}
            </>}
        </div>
      </section>
    </div>
  </ApplyShell>;
}
