import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, Compass, HeartHandshake, LifeBuoy, Megaphone, Route as RouteIcon, ShieldAlert, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ApplyShell, apexQuery } from '@/components/apply-shell';
import { HeroBackdrop } from '@/components/hero-slides';

export const Route = createFileRoute('/rules')({
  head: () => ({ meta: [{ title: 'Expedition Expectations — Apex' }, { name: 'description', content: 'The rules every climber follows on an Apex expedition.' }, { property: 'og:title', content: 'Expedition Expectations — Apex' }, { property: 'og:description', content: 'The rules every climber follows on an Apex expedition.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(apexQuery),
  component: Rules,
});

const RULES: { icon: ReactNode; title: string; points: string[]; callout?: string }[] = [
  { icon: <Users />, title: 'Stay With The Group', points: ['Remain with the expedition at all times.', 'Do not advance ahead of the Lead Guide or Sherpas unless instructed to do so.', 'If the group stops, you stop.'] },
  { icon: <RouteIcon />, title: 'Follow The Route', points: ['Stay on the designated expedition path.', 'Shortcuts, route skipping, and bypassing obstacles are prohibited.', 'Follow all checkpoints, camps, and designated rest stops.'], callout: 'Stay BEHIND the guide.' },
  { icon: <Megaphone />, title: 'Listen To Staff', points: ['Guides and Sherpas are responsible for expedition safety and progression.', 'Follow instructions promptly and respectfully.', 'Decisions made by expedition staff are final during the climb.'] },
  { icon: <HeartHandshake />, title: 'Maintain Professionalism', points: ['Treat all climbers, Sherpas, and Guides with respect.', 'Excessive trolling, disruption, or obnoxious behavior is not permitted.', 'Help create an enjoyable environment for everyone.'] },
  { icon: <LifeBuoy />, title: 'Safety First', points: ['Report issues or concerns to expedition staff immediately.', 'Do not intentionally endanger yourself or others.', 'If you become separated from the group, notify a Guide or Sherpa as soon as possible.'] },
];

function Rules() {
  return <ApplyShell active="rules">
    <section className="page-hero page-banner"><HeroBackdrop /><div className="site-width page-hero-inner">
      <div className="eyebrow"><span className="line" />BEFORE YOU CLIMB</div>
      <h1 className="apply-title">Expedition Expectations</h1>
      <p className="apply-lede">Every climber on an Apex expedition follows these. They keep the group together and the climb enjoyable for everyone.</p>
    </div></section>
    <section className="site-width rules-page">
      <ol className="rules-list">{RULES.map((rule, i) => <li key={rule.title} className="rule-card">
        <header><span className="rule-number">{i + 1}</span><h2>{rule.title}</h2><span className="rule-icon">{rule.icon}</span></header>
        <ul>{rule.points.map(point => <li key={point}>{point}</li>)}</ul>
        {rule.callout && <p className="rule-callout"><Compass />{rule.callout}</p>}
      </li>)}
        <li className="rule-card rule-reminder">
          <header><span className="rule-number">6</span><h2>Reminder</h2><span className="rule-icon"><ShieldAlert /></span></header>
          <p>Failure to follow expedition expectations may result in warnings, removal from the expedition, or further moderation action depending on the severity of the offense.</p>
        </li>
      </ol>
      <div className="report-callout rules-report">
        <div><span className="callout-icon"><ShieldAlert /></span><div><h2>Saw someone break these?</h2><p>Send a private report with proof. Only Apex supervision can read it.</p></div></div>
        <Button variant="outline" asChild><Link to="/reports">Report a member<ArrowRight /></Link></Button>
      </div>
    </section>
  </ApplyShell>;
}
