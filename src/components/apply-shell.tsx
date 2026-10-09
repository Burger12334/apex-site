import { Link } from '@tanstack/react-router';
import { useQuery, useSuspenseQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Mountain, LockKeyhole, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApexEditor, Logo } from '@/components/apex-editor';
import { DiscordAccount, DiscordSettings } from '@/components/community';
import { getApex } from '@/lib/apex.functions';
import { getForms, getDiscordMe } from '@/lib/apply.functions';
import { getAccess, getSupervisionAccess } from '@/lib/community.functions';
import { useApexAuth } from '@/lib/apex-context';
import { useHideOnScroll, useScrollReveal } from '@/hooks/use-page-motion';
import { SiteHelper } from '@/components/site-helper';
import { SocialPopups } from '@/components/social-popups';
import { logVisitor } from '@/lib/staff-log';import { supabase } from '@/integrations/supabase/client';

export const apexQuery = queryOptions({ queryKey: ['apex'], queryFn: () => getApex() });
export const formsQuery = queryOptions({ queryKey: ['forms'], queryFn: () => getForms() });

export function DiscordIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M19.7 5.4A18 18 0 0 0 15.6 4l-.5 1a15 15 0 0 0-6.2 0l-.5-1a18 18 0 0 0-4.1 1.4C1.7 9.3 1 13.2 1.4 17a17 17 0 0 0 5.1 2.5l1-1.6-1.6-.8.4-.3a13 13 0 0 0 11.4 0l.4.3-1.6.8 1 1.6a17 17 0 0 0 5.1-2.5c.5-4.4-.8-8.2-2.9-11.6ZM8.5 14.7c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" /></svg>; }

export function useApplyAccess() {
  const { user } = useApexAuth();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['discord-me'], queryFn: () => getDiscordMe() });
  const role = useQuery({ queryKey: ['role', user?.id], enabled: !!user, queryFn: async () => { const { data, error } = await supabase.rpc('apex_role'); if (error) throw error; return data; } });
  const supervision = useQuery({ queryKey: ['supervision-access', me.data?.id], enabled: !!me.data, queryFn: () => getSupervisionAccess() });
  // When the site keeps its own data, staff and supervision are decided from the linked Discord account
  // (owner IDs and Discord roles); with the database connected, from the signed-in editor account.
  const access = useQuery({ queryKey: ['access', me.data?.id ?? 'guest'], queryFn: () => getAccess() });
  const isAdmin = access.data?.staff === true || role.data === 'owner' || role.data === 'editor';
  const isSupervisor = access.data?.supervisor === true || supervision.data === true;
  // After linking, Discord sends people back to the homepage.
  const linkDiscord = () => { window.location.href = '/api/public/discord/login'; };
  const unlink = async () => { await fetch('/api/public/discord/logout', { method: 'POST' }); await Promise.all([qc.invalidateQueries({ queryKey: ['discord-me'] }), qc.invalidateQueries({ queryKey: ['supervision-access'] }), qc.invalidateQueries({ queryKey: ['access'] })]); };
  return { user, me, role, access, isAdmin, isSupervisor, linkDiscord, unlink };
}

export type ShellPage = 'home' | 'apply' | 'reviews' | 'reports' | 'report-reviews' | 'expeditions' | 'rules' | 'legal';

export function ApplyShell({ children, active, notice, onNotice }: { children: ReactNode; active: ShellPage; notice?: string; onNotice?: (m: string) => void }) {
  const { data } = useSuspenseQuery(apexQuery);
  const { settings } = data;
  const { user, role, access, isAdmin, isSupervisor } = useApplyAccess();
  const [editor, setEditor] = useState(false);
  // The header drops away while scrolling down and returns on the way back up; sections animate in as they appear.
  const headerHidden = useHideOnScroll(); useScrollReveal();
  // Visitor activity for the log: the page opened, and any Instagram or Discord link clicked on it.
  useEffect(() => {
    logVisitor('page', window.location.pathname);
    const onClick = (e: MouseEvent) => {
      const href = (e.target as Element | null)?.closest?.('a[href]')?.getAttribute('href') ?? '';
      if (href.includes('instagram.com')) logVisitor('instagram'); else if (/discord\.(gg|com\/invite)/.test(href)) logVisitor('discord');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [active]);
  const brand = <><span className="brand-mark">{settings.logo_url ? <Logo path={settings.logo_url} alt={`${settings.name} logo`} /> : <Mountain strokeWidth={1.7} />}</span><span>{settings.name}</span></>;
  const nav = (page: ShellPage) => `nav-label ${active === page ? 'active' : ''}`;
  return <>
    <div className="bg-scene" aria-hidden="true"><span className="orb orb-a" /><span className="orb orb-b" /><span className="orb orb-c" /><span className="topo" /><span className="sun" /><span className="cloud cloud-a" /><span className="cloud cloud-b" /><span className="cloud cloud-c" /><span className="ridge ridge-far" /><span className="ridge ridge-mid" /><span className="ridge ridge-near" /><span className="snow snow-near" /><span className="snow snow-far" /></div>
    <div className="scroll-progress" aria-hidden="true" />
    <header className={`apex-header ${headerHidden ? 'is-hidden' : ''}`}><div className="apex-header-inner site-width"><Link to="/" className="brand" aria-label="Apex home">{brand}</Link>
      <nav className="header-nav" aria-label="Main navigation"><Link className={nav('home')} to="/" activeOptions={{ exact: true }}>Basecamp</Link><Link className={nav('apply')} to="/apply" activeOptions={{ exact: true }}>Applications</Link><Link className={nav('expeditions')} to="/expeditions">Expeditions</Link><Link className={nav('reports')} to="/reports" activeOptions={{ exact: true }}>Reports</Link><Link className={nav('rules')} to="/rules">Rules</Link>{isAdmin && <Link className={nav('reviews')} to="/apply/reviews">App reviews</Link>}{(isAdmin || isSupervisor) && <Link className={nav('report-reviews')} to="/reports/reviews">Report reviews</Link>}</nav>
      <div className="header-actions"><DiscordAccount /><Button className="admin-button" variant="ghost" onClick={() => setEditor(true)}><LockKeyhole />{role.data || access.data?.staff ? 'Control room' : user ? 'Account' : 'Admin'}</Button></div>
    </div></header>
    <main>{children}</main>
    <footer className="apex-footer site-width"><Link className="brand" to="/">{brand}</Link><span className="footer-copy">© {new Date().getFullYear()} {settings.name}. {settings.footer_text}</span><nav className="footer-links" aria-label="Site information"><Link to="/rules">Rules</Link><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link></nav></footer>
    <DiscordSettings />
    <SiteHelper discordUrl={settings.discord_url} />
    <SocialPopups discordUrl={settings.discord_url} />
    <ApexEditor open={editor} onOpenChange={setEditor} data={data} />
    {notice && <div className="notice" role="status">{notice}<Button variant="ghost" size="icon" aria-label="Dismiss message" onClick={() => onNotice?.('')}><X /></Button></div>}
  </>;
}
