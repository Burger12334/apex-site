import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, CalendarDays, Flag, MessageCircle, Minus, ScrollText, ShieldAlert, Sparkles, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { INSTAGRAM_URL } from '@/lib/links';
import { logVisitor } from '@/lib/staff-log';

type Prompt = { key: string; icon: ReactNode; question: string; action: string; href: string; external?: boolean };

function InstagramIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>; }
function DiscordIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M19.7 5.4A18 18 0 0 0 15.6 4l-.5 1a15 15 0 0 0-6.2 0l-.5-1a18 18 0 0 0-4.1 1.4C1.7 9.3 1 13.2 1.4 17a17 17 0 0 0 5.1 2.5l1-1.6-1.6-.8.4-.3a13 13 0 0 0 11.4 0l.4.3-1.6.8 1 1.6a17 17 0 0 0 5.1-2.5c.5-4.4-.8-8.2-2.9-11.6ZM8.5 14.7c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" /></svg>; }

const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
const recall = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };

// Bottom-right helper: rotating suggestions while minimized, and a panel of shortcuts when open.
export function SiteHelper({ discordUrl }: { discordUrl: string }) {
  const prompts: Prompt[] = [
    { key: 'apply', icon: <Flag />, question: 'Want to join the team?', action: 'Apply for Mountain Staff', href: '/apply' },
    { key: 'report', icon: <ShieldAlert />, question: 'Seen someone breaking the rules?', action: 'Report a member', href: '/reports' },
    { key: 'expeditions', icon: <CalendarDays />, question: 'Ready for the next climb?', action: 'See upcoming expeditions', href: '/expeditions' },
    { key: 'team', icon: <Users />, question: 'Curious who runs Apex?', action: 'Meet the team', href: '/#team' },
    { key: 'rules', icon: <ScrollText />, question: 'New to expeditions?', action: 'Read the rules', href: '/rules' },
    { key: 'instagram', icon: <InstagramIcon />, question: 'Want to see the latest climbs?', action: 'Follow us on Instagram', href: INSTAGRAM_URL, external: true },
    ...(discordUrl ? [{ key: 'discord', icon: <DiscordIcon />, question: 'Looking for the community?', action: 'Join the Discord', href: discordUrl, external: true }] : []),
  ];
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false); const [index, setIndex] = useState(0);

  // Remembered between visits: whether the panel was left open, and whether the suggestions were dismissed.
  useEffect(() => {
    setOpen(recall('apex-helper-open') === '1');
    if (recall('apex-helper-teaser') === 'off') return;
    const show = setTimeout(() => setTeaser(true), 2500);
    return () => clearTimeout(show);
  }, []);
  useEffect(() => {
    if (!teaser || open) return;
    const rotate = setInterval(() => setIndex(i => i + 1), 9000);
    return () => clearInterval(rotate);
  }, [teaser, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') toggle(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function toggle(next: boolean) { setOpen(next); remember('apex-helper-open', next ? '1' : '0'); if (next) logVisitor('helper'); }
  function dismissTeaser() { setTeaser(false); remember('apex-helper-teaser', 'off'); }

  const current = prompts[index % prompts.length];
  const link = (p: Prompt) => p.external ? { href: p.href, target: '_blank', rel: 'noopener noreferrer' } : { href: p.href };

  return <div className="site-helper">
    {open ? <section className="helper-panel" role="dialog" aria-label="Apex guide">
      <header className="helper-head"><span className="helper-badge"><Sparkles /></span><div><strong>Apex guide</strong><small>Quick shortcuts</small></div><Button variant="ghost" size="icon" aria-label="Minimize" title="Minimize" onClick={() => toggle(false)}><Minus /></Button></header>
      <div className="helper-body">
        <p className="helper-label">What are you here for?</p>
        <div className="helper-prompts">{prompts.map(p => <a key={p.key} className={`helper-prompt tone-${p.key}`} {...link(p)}><span className="helper-prompt-icon">{p.icon}</span><span><small>{p.question}</small><strong>{p.action}</strong></span><ArrowUpRight /></a>)}</div>
      </div>
    </section> : <>
      {teaser && current && <div className="helper-teaser" key={current.key}>
        <button type="button" className="helper-teaser-close" aria-label="Dismiss suggestions" onClick={dismissTeaser}><X /></button>
        <span className={`helper-prompt-icon tone-${current.key}`}>{current.icon}</span>
        <div><small>{current.question}</small><a {...link(current)}>{current.action}<ArrowUpRight /></a></div>
      </div>}
      <button type="button" className="helper-launcher" aria-label="Open the Apex guide" onClick={() => toggle(true)}><MessageCircle /><span>Need a hand?</span></button>
    </>}
  </div>;
}
