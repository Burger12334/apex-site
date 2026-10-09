import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { INSTAGRAM_URL } from '@/lib/links';
import summitTeam from '@/assets/expedition/summit-team.webp';
import basecamp from '@/assets/expedition/basecamp-night.webp';

function InstagramIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>; }
function DiscordIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M19.7 5.4A18 18 0 0 0 15.6 4l-.5 1a15 15 0 0 0-6.2 0l-.5-1a18 18 0 0 0-4.1 1.4C1.7 9.3 1 13.2 1.4 17a17 17 0 0 0 5.1 2.5l1-1.6-1.6-.8.4-.3a13 13 0 0 0 11.4 0l.4.3-1.6.8 1 1.6a17 17 0 0 0 5.1-2.5c.5-4.4-.8-8.2-2.9-11.6ZM8.5 14.7c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" /></svg>; }

type Popup = { key: string; icon: ReactNode; image: string; label: string; title: string; text: string; action: string; href: string };

// How long each card waits before appearing, and how long it stays.
const FIRST_DELAY = 6000; const GAP = 5000; const STAY = 13000;
const STAGE_KEY = 'apex-social-popups';
const stage = () => { try { return Number(sessionStorage.getItem(STAGE_KEY) ?? 0); } catch { return 0; } };
const setStage = (n: number) => { try { sessionStorage.setItem(STAGE_KEY, String(n)); } catch { /* storage unavailable */ } };

// Cards that slide in from the left edge once per visit: Instagram first, then Discord.
// Each leaves on its own after a few seconds or when closed, and neither comes back until the next visit.
export function SocialPopups({ discordUrl }: { discordUrl: string }) {
  const popups: Popup[] = [
    { key: 'instagram', icon: <InstagramIcon />, image: summitTeam, label: 'Instagram', title: 'Follow the climb', text: 'Summit shots, expedition clips and announcements from @apex_expeditions_official.', action: 'Follow on Instagram', href: INSTAGRAM_URL },
    ...(discordUrl ? [{ key: 'discord', icon: <DiscordIcon />, image: basecamp, label: 'Discord', title: 'Meet the crew at basecamp', text: 'Join the Apex Discord to find a team, sign up for expeditions and talk to staff.', action: 'Join the Discord', href: discordUrl }] : []),
  ];
  const count = popups.length;
  const [current, setCurrent] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Shows the next card that has not been shown yet this visit.
  useEffect(() => {
    if (current !== null) return;
    const next = stage();
    if (next >= count) return;
    const wait = setTimeout(() => { setLeaving(false); setCurrent(next); }, next === 0 ? FIRST_DELAY : GAP);
    return () => clearTimeout(wait);
  }, [current, count]);
  // A shown card closes by itself after a while.
  useEffect(() => {
    if (current === null || leaving) return;
    const stay = setTimeout(() => close(), STAY);
    return () => clearTimeout(stay);
  }, [current, leaving]);

  function close() {
    if (current === null) return;
    setStage(current + 1);
    setLeaving(true);
    setTimeout(() => setCurrent(null), 450);
  }

  const popup = current === null ? null : popups[current];
  if (!popup) return null;
  return <aside className={`social-popup pop-${popup.key} ${leaving ? 'leaving' : ''}`} aria-label={`${popup.label} suggestion`}>
    <div className="social-popup-media"><img src={popup.image} alt="" /><span className="social-popup-icon">{popup.icon}</span></div>
    <div className="social-popup-body">
      <span className="social-popup-label">{popup.label}</span>
      <strong>{popup.title}</strong>
      <p>{popup.text}</p>
      <a href={popup.href} target="_blank" rel="noopener noreferrer" onClick={close}>{popup.action}<ArrowUpRight /></a>
    </div>
    <button type="button" className="social-popup-close" aria-label={`Close the ${popup.label} suggestion`} onClick={close}><X /></button>
    {!leaving && <span className="social-popup-timer" style={{ animationDuration: `${STAY}ms` }} />}
  </aside>;
}
