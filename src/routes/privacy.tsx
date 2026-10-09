import { createFileRoute, Link } from '@tanstack/react-router';
import { apexQuery } from '@/components/apply-shell';
import { LegalPage, type LegalSection } from '@/components/legal-page';

export const Route = createFileRoute('/privacy')({
  head: () => ({ meta: [{ title: 'Privacy Policy — Apex' }, { name: 'description', content: 'What the Apex website collects, why, and who can see it.' }, { property: 'og:title', content: 'Privacy Policy — Apex' }, { property: 'og:description', content: 'What the Apex website collects, why, and who can see it.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(apexQuery),
  component: Privacy,
});

const SECTIONS: LegalSection[] = [
  { title: 'Who we are', body: <>
    <p>This website is run by the staff of the Apex community for players of K2 Climbing Simulator. This policy explains what information the site collects, why, and who can see it.</p>
  </> },
  { title: 'What we collect', body: <>
    <ul>
      <li><strong>Your Discord identity.</strong> When you link Discord: your Discord user ID, username and profile picture, and your highest role in the Apex Discord server. We do not receive your email address or password from Discord.</li>
      <li><strong>Applications.</strong> Your answers, which application you applied for, when, the decision and any reason given. Staff may also keep private notes about an application.</li>
      <li><strong>Reports.</strong> The Discord ID and username of the person you report, what you wrote, any image you attach as proof, and messages exchanged with supervision about the report.</li>
      <li><strong>Expedition sign-ups.</strong> Which expeditions you signed up for.</li>
      <li><strong>Team and hall of fame.</strong> If staff list you there: your Discord name, picture, role and summit count.</li>
      <li><strong>Staff accounts.</strong> Staff who sign in to manage the site provide an email address.</li>
      <li><strong>Activity records.</strong> A log of actions on the site (for example “application submitted” or “report resolved”) with the Discord account involved. If staff switch it on, the log can also record which pages are opened and which social links are clicked.</li>
    </ul>
  </> },
  { title: 'Cookies and browser storage', body: <>
    <ul>
      <li>One sign-in cookie keeps your Discord account linked for up to seven days. It is only used for that.</li>
      <li>Your browser stores your unfinished application answers so you do not lose them, and remembers small choices such as closing the helper. This stays on your device.</li>
      <li>The site does not use advertising or cross-site tracking cookies.</li>
    </ul>
  </> },
  { title: 'How we use it', body: <>
    <ul>
      <li>To review applications and reports and tell you the outcome.</li>
      <li>To run expeditions and show who is taking part.</li>
      <li>To show your Discord name, picture and role next to things you do on the site.</li>
      <li>To keep the community safe and investigate misuse.</li>
    </ul>
    <p>We do not sell your information and we do not use it for advertising.</p>
  </> },
  { title: 'Who can see it', body: <>
    <ul>
      <li><strong>Everyone:</strong> the team list, the hall of fame, and the usernames of people signed up for an expedition.</li>
      <li><strong>Apex staff:</strong> applications, their decisions and staff notes.</li>
      <li><strong>Apex supervision and staff:</strong> reports, proof images and report chats. The person you report is not shown your report by the site.</li>
      <li><strong>Private staff channels on Discord:</strong> when you submit an application or a report, a summary (including your answers or the report details) is posted to a staff-only channel, and the activity log is posted to another.</li>
    </ul>
  </> },
  { title: 'Messages from the Apex bot', body: <>
    <p>The Apex Discord bot may send you a direct message when your application is accepted or denied, when supervision replies to or closes your report, and for similar updates. You can block these in your Discord privacy settings; the same information is shown on the site.</p>
  </> },
  { title: 'Services we rely on', body: <>
    <p>The site uses other companies to work, and they process information on our behalf or receive it when you use the site:</p>
    <ul>
      <li><strong>Discord</strong> for sign-in, roles, staff alerts and direct messages.</li>
      <li><strong>Our hosting provider</strong> for running the website and storing its records.</li>
      <li><strong>Supabase</strong> for staff sign-in.</li>
      <li><strong>Google Fonts</strong> for the site’s typefaces, which means your browser contacts Google when a page loads.</li>
    </ul>
    <p>Links to Instagram, Discord and Roblox take you to those services, which have their own privacy policies.</p>
  </> },
  { title: 'How long we keep it', body: <>
    <p>Applications, reports and related records are kept for as long as they are useful for running the community, or until staff delete them. Proof images are stored privately and only shown to reviewers through short-lived links.</p>
  </> },
  { title: 'Your choices', body: <>
    <ul>
      <li>Unlink your Discord account at any time from the top of the page.</li>
      <li>Ask Apex staff on Discord for a copy of what the site holds about you, or to correct or delete it. Some records may be kept where needed to handle a report or prevent abuse.</li>
      <li>Depending on where you live, you may have additional rights under local privacy law; contact staff and we will do our best to help.</li>
    </ul>
  </> },
  { title: 'Children', body: <>
    <p>The site is not meant for anyone under 13, or under the minimum age Discord sets in your country. If you believe a younger child has used it, tell Apex staff and we will remove their information.</p>
  </> },
  { title: 'Changes and contact', body: <>
    <p>We may update this policy as the site changes. The date at the side of this page shows when it last changed.</p>
    <p>Questions? Ask a member of Apex staff in the Discord server. See also the <Link to="/terms">Terms of Service</Link>.</p>
  </> },
];

function Privacy() {
  return <LegalPage eyebrow="YOUR INFORMATION" title="Privacy Policy" intro="What this website collects, why it collects it, and who can see it." sections={SECTIONS} other={{ to: '/terms', label: 'Read the Terms of Service' }} />;
}
