import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Mountain, ArrowUpRight, ArrowRight, Compass, Flag, Users, ShieldCheck, Search, ShieldAlert } from 'lucide-react';
import mountain from '@/assets/apex-mountain.jpg';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/apex-editor';
import { ApplyShell, DiscordIcon, apexQuery } from '@/components/apply-shell';
import { MeetTeam, teamQuery } from '@/components/community';
import { INSTAGRAM_URL } from '@/lib/links';
import { logVisitor } from '@/lib/staff-log';
import { ExpeditionGallery, HeroBackdrop, HeroFrame, useSlide } from '@/components/hero-slides';

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Apex — K2 Climbing Community' }, { name: 'description', content: 'Your basecamp for K2 Climbing. Find your crew, explore community apps, and climb higher with Apex.' }, { property: 'og:title', content: 'Apex — Higher together' }, { property: 'og:description', content: 'A home for the K2 Climbing community. Your next expedition starts at Apex.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(apexQuery), context.queryClient.ensureQueryData(teamQuery).catch(() => null)]),
  component: Index,
  errorComponent: () => <div className="site-width py-20"><h1>Apex is temporarily unavailable</h1><p>Please refresh in a moment.</p></div>,
  notFoundComponent: () => <div>Apex could not be found.</div>,
});

const FILTERS = ['All', 'Game', 'Community', 'Resources'];

function InstagramIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>; }

function Index() {
  const { data } = useSuspenseQuery(apexQuery);
  const { settings } = data;
  // Applications live on their own page, so they are kept out of the directory.
  const apps = data.apps.filter(a => a.category !== 'Applications');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const go = (url: string, label: string) => {
    if (!url) { setNotice(`${label} hasn’t been linked yet. Check back soon.`); return; }
    try { const parsed = new URL(url); if (parsed.protocol !== 'https:') throw Error(); if (/discord\.(gg|com)/.test(parsed.hostname)) logVisitor('discord'); window.open(url, '_blank', 'noopener,noreferrer'); } catch { setNotice('This link is unavailable.'); }
  };
  const slide = useSlide();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const filtered = apps.filter(a => (filter === 'All' || a.category === filter) && (a.name + ' ' + a.description).toLowerCase().includes(search.toLowerCase()));

  return <ApplyShell active="home" notice={notice} onNotice={setNotice}>
    <section className="socials-band" aria-label="Apex socials"><div className="site-width socials-inner">
      <div><div className="socials-eyebrow">FOLLOW THE CLIMB</div><h2>Find Apex on socials.</h2><p>Expedition photos, announcements and community highlights.</p></div>
      <div className="socials-actions">
        <Button asChild className="social-instagram"><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer"><InstagramIcon />Instagram<ArrowUpRight /></a></Button>
        <Button className="social-discord" onClick={() => go(settings.discord_url, 'Discord')}><DiscordIcon />Discord<ArrowUpRight /></Button>
      </div>
    </div></section>
    <section className="hero hero-split">
      <HeroBackdrop index={slide.index} />
      <div className="hero-inner site-width">
        <div className="hero-copy">
          <div className="eyebrow"><span className="line" />{settings.eyebrow}</div>
          <h1>{settings.name}</h1>
          <h2>{settings.tagline}</h2>
          <p>{settings.description}</p>
          <div className="hero-actions">
            <Button onClick={() => go(settings.discord_url, 'Discord')}><DiscordIcon />Join the community<ArrowUpRight /></Button>
            <Button variant="outline" onClick={() => scrollTo('apps')}><Compass />Explore apps<ArrowRight /></Button>
            <Button variant="outline" asChild><Link to="/apply"><Flag />Apply for Mountain Staff<ArrowRight /></Link></Button>
          </div>
          <div className="hero-footnote"><span className="status-dot" />One community. A shared ascent.</div>
        </div>
        <div className="hero-visual">
          <HeroFrame index={slide.index} onShow={slide.show} />
          <div className="hero-coordinate"><strong>35°52′57″N 76°30′48″E</strong> · K2 · KARAKORAM RANGE · 8,611 M</div>
        </div>
      </div>
    </section>
    <div className="summit-marquee" aria-hidden="true"><div className="summit-marquee-track">{[0, 1].map(copy => <span key={copy}>{['BASECAMP', 'ICEFALL', 'CAMP I', 'CAMP II', 'THE BOTTLENECK', 'SUMMIT PUSH', '8,611 M', 'HIGHER TOGETHER'].map(word => <em key={word}><Mountain />{word}</em>)}</span>)}</div></div>
    <div className="basecamp-strip site-width">
      <div className="strip-item tone-blue"><Mountain /><div><strong>Rooted in K2 Climbing</strong><small>Made for the mountain</small></div></div>
      <div className="strip-item tone-teal"><Users /><div><strong>Better, together</strong><small>A community of climbers</small></div></div>
      <div className="strip-item tone-orange"><Compass /><div><strong>Your next expedition</strong><small>Starts at basecamp</small></div></div>
      <div className="strip-item tone-violet"><ShieldCheck /><div><strong>The Apex standard</strong><small>Built with care</small></div></div>
    </div>
    <section className="apps-section site-width" id="apps">
      <div className="section-header"><div><div className="eyebrow">YOUR BASECAMP</div><h2>Everything for the ascent.</h2><p>The game, the crew, and what comes next. All in one place.</p></div><span className="app-count">{String(apps.length).padStart(2, '0')} APPS & RESOURCES</span></div>
      <div className="directory-toolbar">
        <div className="filter-tabs" role="group" aria-label="App categories">{FILTERS.map(f => <Button key={f} variant={f === filter ? 'secondary' : 'ghost'} aria-pressed={f === filter} onClick={() => setFilter(f)}>{f}</Button>)}</div>
        <label className="search-box"><Search /><input aria-label="Search apps" placeholder="Search apps…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      </div>
      <div className="app-grid">{filtered.map(app => <article key={app.id} className={`app-card cat-${app.category.toLowerCase()}`}>
        <div className="app-card-top"><span className="app-icon">{app.logo_url ? <Logo path={app.logo_url} alt={`${app.name} logo`} /> : app.icon === 'discord' ? <DiscordIcon /> : app.icon === 'flag' ? <Flag /> : app.icon === 'compass' ? <Compass /> : <Mountain />}</span><span className="app-category">{app.category}</span></div>
        <h3>{app.name}</h3><p>{app.description}</p>
        <Button className="app-open" variant="ghost" onClick={() => go(app.url || (app.icon === 'discord' ? settings.discord_url : app.category === 'Game' ? settings.game_url : ''), app.name)}>{app.category === 'Game' ? 'Play K2 Climbing' : app.category === 'Community' ? 'Open Discord' : 'Explore resource'}<ArrowUpRight /></Button>
      </article>)}</div>
      {filtered.length === 0 && <p className="empty-state">No apps found. Try another search or category.</p>}
    </section>
    <section className="gallery-section site-width" id="gallery">
      <div className="section-header"><div><div className="eyebrow">FROM THE MOUNTAIN</div><h2>Expeditions with Apex.</h2><p>Basecamp nights, ice caves, fog and the view from the top.</p></div></div>
      <ExpeditionGallery />
    </section>
    <MeetTeam />
    <section className="report-callout site-width">
      <div><span className="callout-icon"><ShieldAlert /></span><div><h2>Seen something that breaks the rules?</h2><p>Reports go straight to Apex supervision and stay private.</p></div></div>
      <Button variant="outline" asChild><Link to="/reports">Report a member<ArrowRight /></Link></Button>
    </section>
    <section className="community-band"><img className="band-image" src={mountain} alt="" width={1920} height={1024} loading="lazy" /><div className="site-width"><div><h2>No one reaches the top alone.</h2><p>Find your people. Plan your climb. Make the summit a shared moment.</p></div><Button variant="outline" onClick={() => go(settings.discord_url, 'Discord')}><DiscordIcon />Meet us on Discord<ArrowUpRight /></Button></div></section>
  </ApplyShell>;
}
