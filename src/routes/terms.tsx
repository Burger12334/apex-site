import { createFileRoute, Link } from '@tanstack/react-router';
import { apexQuery } from '@/components/apply-shell';
import { LegalPage, type LegalSection } from '@/components/legal-page';

export const Route = createFileRoute('/terms')({
  head: () => ({ meta: [{ title: 'Terms of Service — Apex' }, { name: 'description', content: 'The terms for using the Apex community website.' }, { property: 'og:title', content: 'Terms of Service — Apex' }, { property: 'og:description', content: 'The terms for using the Apex community website.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(apexQuery),
  component: Terms,
});

const SECTIONS: LegalSection[] = [
  { title: 'About these terms', body: <>
    <p>This website is run by the staff of the Apex community (“Apex”, “we”) for players of K2 Climbing Simulator. These terms cover your use of the site, including applications, reports, expedition sign-ups and anything else you do here.</p>
    <p>By using the site you agree to these terms. If you do not agree, please do not use it.</p>
  </> },
  { title: 'Who can use the site', body: <>
    <p>You need a Discord account to apply, report, or sign up for an expedition. Discord requires its users to be at least 13 years old (older in some countries), and so do we. If you are under the age of majority where you live, use the site with a parent or guardian’s permission.</p>
  </> },
  { title: 'Linking your Discord account', body: <>
    <p>When you link Discord, we receive your Discord user ID, username and profile picture, and we look up your highest role in the Apex Discord server. We never see your Discord password. You can unlink at any time from the button at the top of the page.</p>
    <p>You are responsible for what is done on the site while your Discord account is linked.</p>
  </> },
  { title: 'Applications', body: <>
    <ul>
      <li>Answer honestly and write your own answers.</li>
      <li>Submitting an application does not guarantee a position. Staff may accept or deny any application and may give a reason.</li>
      <li>After a denial you may have to wait before applying for the same position again.</li>
      <li>Staff positions are voluntary and unpaid, and may be removed at any time.</li>
    </ul>
  </> },
  { title: 'Reports', body: <>
    <ul>
      <li>Only report things you believe really happened, and attach real, unedited proof.</li>
      <li>Reports are read by Apex supervision and staff. They may contact you about a report through the site or by Discord message.</li>
      <li>False, malicious or spam reports may lead to action on your own account.</li>
    </ul>
  </> },
  { title: 'Expeditions and community rules', body: <>
    <p>Everyone on an Apex expedition is expected to follow the <Link to="/rules">Expedition Expectations</Link>. Breaking them can lead to warnings, removal from an expedition, or further moderation.</p>
    <p>Signing up for an expedition shows your Discord username on the expeditions page.</p>
  </> },
  { title: 'What you must not do', body: <>
    <ul>
      <li>Harass, threaten or impersonate other people.</li>
      <li>Upload content that is illegal, sexual, hateful, or that you have no right to share.</li>
      <li>Share other people’s private information.</li>
      <li>Try to break, overload, scrape or gain unauthorised access to the site or its data.</li>
      <li>Use the site to get around a ban or moderation decision.</li>
    </ul>
  </> },
  { title: 'Your content', body: <>
    <p>You keep ownership of what you submit (answers, report text, images, chat messages). You give Apex permission to store it, show it to the staff who need to see it, and post it in private staff channels on Discord, so that we can review and act on it.</p>
  </> },
  { title: 'Moderation', body: <>
    <p>We may remove content, decline or close applications and reports, or restrict access to the site for anyone who breaks these terms or the community rules.</p>
  </> },
  { title: 'Other services', body: <>
    <p>Apex is a fan community. It is not affiliated with, endorsed by, or sponsored by Roblox Corporation, Discord Inc., Instagram, or the developers of K2 Climbing Simulator. Your use of those services is covered by their own terms.</p>
  </> },
  { title: 'No warranty', body: <>
    <p>The site is provided free of charge and “as is”. We do our best to keep it working and its information correct, but we do not promise it will always be available or free of mistakes. To the extent the law allows, Apex and its staff are not liable for losses that result from using the site.</p>
  </> },
  { title: 'Changes and contact', body: <>
    <p>We may update these terms. The date at the side of this page shows when they last changed, and continuing to use the site means you accept the current version.</p>
    <p>Questions? Ask a member of Apex staff in the Discord server. See also the <Link to="/privacy">Privacy Policy</Link>.</p>
  </> },
];

function Terms() {
  return <LegalPage eyebrow="THE FINE PRINT" title="Terms of Service" intro="The rules for using this website. They sit alongside the Expedition Expectations, which cover behaviour on a climb." sections={SECTIONS} other={{ to: '/privacy', label: 'Read the Privacy Policy' }} />;
}
