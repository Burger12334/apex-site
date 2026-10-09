import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ApplyShell } from '@/components/apply-shell';
import { HeroBackdrop } from '@/components/hero-slides';

export type LegalSection = { title: string; body: ReactNode };
// Shown on both pages so the date only needs changing in one place when the text is updated.
export const LEGAL_UPDATED = 'October 9, 2026';

// Shared layout for the Terms of Service and the Privacy Policy: a banner, a contents list and numbered sections.
export function LegalPage({ eyebrow, title, intro, sections, other }: { eyebrow: string; title: string; intro: string; sections: LegalSection[]; other: { to: '/terms' | '/privacy'; label: string } }) {
  const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return <ApplyShell active="legal">
    <section className="page-hero page-banner banner-slim"><HeroBackdrop /><div className="site-width page-hero-inner">
      <div className="eyebrow"><span className="line" />{eyebrow}</div>
      <h1 className="apply-title">{title}</h1>
      <p className="apply-lede">{intro}</p>
    </div></section>
    <section className="site-width legal-page">
      <nav className="legal-contents" aria-label="On this page">
        <strong>On this page</strong>
        <ol>{sections.map(s => <li key={s.title}><a href={`#${slug(s.title)}`}>{s.title}</a></li>)}</ol>
        <p>Last updated {LEGAL_UPDATED}</p>
        <Link to={other.to}>{other.label}</Link>
      </nav>
      <article className="legal-body">
        {sections.map((s, i) => <section key={s.title} id={slug(s.title)}><h2><span>{i + 1}</span>{s.title}</h2>{s.body}</section>)}
      </article>
    </section>
  </ApplyShell>;
}
