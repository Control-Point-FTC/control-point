import { Link } from 'react-router-dom';
import { CONTACT_EMAIL } from './utils/contact';
import { usePublicPageView } from './utils/pageViews';
import { Bolt, ArrowLeft } from 'lucide-react';

type LegalKind = 'privacy' | 'terms';

const EFFECTIVE_DATE = 'October 12, 2026';


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-display text-lg font-bold text-text-base mb-2.5">{title}</h2>
      <div className="text-[15px] leading-relaxed text-text-muted space-y-2.5">{children}</div>
    </section>
  );
}

function PrivacyBody() {
  return (
    <>
      <Section title="Overview">
        <p>
          Control Point ("we", "our") is a team-management platform for robotics clubs and teams.
          This policy explains what information we collect, how we use it, who we share it with, and the choices you have.
        </p>
      </Section>
      <Section title="Information we collect">
        <p><strong className="text-text-base/90">Account information.</strong> When you sign up, we collect your name, email address, and password (stored as a secure hash), or basic profile information from Google, Discord, or GitHub if you sign in with one of those providers.</p>
        <p><strong className="text-text-base/90">Team content.</strong> Information you and your team create in the app: members, attendance records, tasks, events, messages, notebook pages, budget entries, inventory, scouting notes, files, and outreach activity.</p>
        <p><strong className="text-text-base/90">Connected accounts.</strong> If you link Google Calendar, or a team admin links a YouTube channel or connects a TikTok account in the Outreach section, we store what that connection needs. The sections below describe each one.</p>
      </Section>
      <Section title="AI features (Bruno)">
        <p>
          Bruno, the in-app assistant, answers questions and drafts content when you ask it to. To do that, we send
          your message, any image you attach, and the team information Bruno needs to answer (such as tasks, events, or
          the notebook page you're looking at) to an AI model provider: Google (Gemini) or Anthropic (Claude). When a
          question needs current information from the web, the provider may run a web search for it. The provider
          processes the request to produce the answer.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Notebook pages and sections protected for admins are never visible to Bruno.</li>
          <li>Bruno changes your notebook only after you confirm a proposed change.</li>
          <li>You can turn off Bruno's access to your notebook and to your sticky notes in Settings.</li>
          <li>We can turn AI off for an account and set usage limits. We keep a record of AI usage (who used it and how much) to enforce those limits and prevent abuse.</li>
          <li>We don't sell your content or use it for advertising.</li>
        </ul>
      </Section>
      <Section title="Files you upload">
        <p>
          Files and pictures you add to tasks, messages, the notebook, CAD, and other parts of the app are stored on
          our servers or with our file-storage provider, Cloudflare R2. Who can open a file depends on where it was added:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Files on tasks, messages, and other team records: members of that team.</li>
          <li>Notebook attachments: team members who can see the notebook page they're on.</li>
          <li>Profile pictures: any signed-in user, so they can appear next to your name.</li>
          <li>We can open files outside the notebook to run and support the service.</li>
        </ul>
        <p>
          <strong className="text-text-base/90">When files are deleted.</strong> Deleted notebook content goes to the
          notebook trash first; its files are deleted when it is permanently deleted from the trash, unless another
          page still uses them. Replacing your profile picture deletes the old one, and deleting a custom emoji or a
          CAD snapshot deletes its files. Deleting a task deletes its completion photos, and deleting a message
          deletes its attachments, unless another task or message still uses them (for example, a forwarded
          message). Deleting a whole workspace deletes every file uploaded in it. Deleting your account deletes the
          files on your messages and on tasks assigned to you. Files uploaded before October 12, 2026 whose task,
          message or workspace was already deleted may still be stored; you can ask us to delete them at the email
          below.
        </p>
        <p>
          Files you add to your team's notebook or CAD belong to the team: they stay with the team after you leave it
          or delete your account.
        </p>
      </Section>
      <Section title="Google Calendar">
        <p>
          If you link Google Calendar in Settings, Google asks for your permission to let us manage events in your
          calendar. We store a refresh token, encrypted, so we can add your team's events to your primary calendar when
          your team turns calendar sync on. Unlinking deletes the stored token.
        </p>
      </Section>
      <Section title="TikTok data">
        <p>
          When you connect a TikTok account, TikTok's Login Kit asks for your permission to share limited
          profile information with Control Point. We request two scopes:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong className="text-text-base/90">user.info.basic</strong> — your TikTok display name, avatar, and Open ID, used to identify which account is connected.</li>
          <li><strong className="text-text-base/90">user.info.stats</strong> — aggregate counts such as followers and videos, used only to display your team's social growth in the Outreach dashboard.</li>
        </ul>
        <p>
          We do not request access to your TikTok videos, drafts, messages, or the ability to post on your
          behalf. OAuth tokens are encrypted at rest. You can disconnect the TikTok account at any time
          from the Outreach section, which deletes the stored tokens and stops future syncing.
        </p>
        <p>YouTube channel statistics come from public YouTube Data API responses; no YouTube sign-in is needed.</p>
      </Section>
      <Section title="Information stored in your browser">
        <p>
          We keep a small amount of information in your browser to run the app: your sign-in session cookie
          (required), your cookie choice, and preferences such as theme, layout, notebook view settings, favorite pens,
          and unsaved drafts.
        </p>
        <p>
          So you can keep working offline, the app also saves copies of notebook pages you open and of recent team data
          in your browser on that device. These are deleted when you sign out. Two things stay after you sign out, until
          you clear your browser data: scouting entries your team has saved (including ones not yet sent, so they
          aren't lost at an event without internet), and scouting data packs you download, which contain public FTC
          event data. On a shared computer, sign out and clear the browser's site data when you're done.
        </p>
        <p>We don't use advertising or cross-site tracking cookies.</p>
      </Section>
      <Section title="Website analytics">
        <p>
          To understand how many people visit our public pages (such as the home, privacy, and terms pages), we count
          page views with our own counter.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>It uses no cookies and stores nothing in your browser.</li>
          <li>It doesn't record IP addresses, device details, or any identifier. We keep only the number of views per page per day.</li>
          <li>If your browser sends Do Not Track or Global Privacy Control, the visit isn't counted.</li>
          <li>Pages inside team workspaces are never counted.</li>
        </ul>
      </Section>
      <Section title="How we use information">
        <p>
          We use the information we collect to operate and improve Control Point: creating and managing teams,
          sending the emails you need (such as sign-up codes and notifications), syncing the data you asked us to
          sync, and keeping your account secure. We do not sell your personal information, and we do not use it for
          advertising.
        </p>
      </Section>
      <Section title="Service providers">
        <p>We share information only as needed to run the features you use:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong className="text-text-base/90">Oracle Cloud</strong> hosts our servers.</li>
          <li><strong className="text-text-base/90">Cloudflare R2</strong> stores uploaded files.</li>
          <li><strong className="text-text-base/90">Resend</strong> delivers our emails (your email address and the message).</li>
          <li><strong className="text-text-base/90">Google (Gemini) and Anthropic (Claude)</strong> process Bruno requests, as described above.</li>
          <li><strong className="text-text-base/90">Google, Discord, and GitHub</strong> handle sign-in if you choose them. <strong className="text-text-base/90">Google Calendar</strong>, <strong className="text-text-base/90">TikTok</strong>, and <strong className="text-text-base/90">YouTube</strong> work as described above.</li>
          <li><strong className="text-text-base/90">Open-Meteo</strong> provides weather. We send it a city name or approximate location, not your identity.</li>
          <li><strong className="text-text-base/90">The FIRST Tech Challenge Events API and FTCScout</strong> provide public team and event data. We send them team numbers and event codes.</li>
          <li><strong className="text-text-base/90">GitHub</strong> provides the contents of public code repositories your team links.</li>
          <li>Voice calls use Google's public STUN servers to connect, which see your device's IP address.</li>
        </ul>
      </Section>
      <Section title="Storage and security">
        <p>
          Our servers are in the United States. Passwords are stored only as secure hashes, and access tokens for
          connected accounts are encrypted with a server-side key. While we take reasonable measures to protect your
          information, no internet service is completely secure.
        </p>
      </Section>
      <Section title="Your choices">
        <p>
          You may update your profile information in the app, unlink Google Calendar, disconnect linked social
          accounts, turn off Bruno's access to your notebook and sticky notes, and request deletion of your account and
          associated data by contacting us at the email below. Team admins manage their own teams' membership and content.
        </p>
      </Section>
      <Section title="Changes to this policy">
        <p>
          We may update this policy as Control Point evolves. Material changes will be noted here with
          an updated effective date.
        </p>
      </Section>
      <Section title="Contact">
        <p>Questions about this policy: <a className="text-accent hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
      </Section>
    </>
  );
}

function TermsBody() {
  return (
    <>
      <Section title="The service">
        <p>
          Control Point is a team-management platform for robotics clubs and teams, providing tools for
          attendance, tasks, scheduling, communication, budgeting, inventory, and social-outreach tracking.
          The service is provided on an "as is" basis while we continue to develop it.
        </p>
      </Section>
      <Section title="Accounts">
        <p>
          You must provide accurate information when creating an account and keep your credentials
          confidential. You are responsible for activity under your account. Team admins are responsible
          for managing their team's members, access codes, and content.
        </p>
      </Section>
      <Section title="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Use the service for any unlawful purpose or in violation of applicable regulations.</li>
          <li>Attempt to access other teams' data or interfere with the service's operation.</li>
          <li>Upload content you do not have the right to share.</li>
          <li>Misrepresent your team or its affiliations.</li>
        </ul>
      </Section>
      <Section title="Third-party services">
        <p>
          Control Point integrates with third-party services you choose to connect, including TikTok
          (Login Kit), YouTube (Data API), Google (sign-in and Calendar), Discord, and GitHub. Your use of those services is
          governed by their own terms and privacy policies. Connecting an account authorizes us only to
          access the specific data described in our Privacy Policy.
        </p>
      </Section>
      <Section title="AI features">
        <p>
          Bruno, the in-app assistant, is powered by third-party AI models and can make mistakes. Check important
          information, such as rules, part numbers, and deadlines, before relying on it.
        </p>
      </Section>
      <Section title="Content and intellectual property">
        <p>
          Your team retains ownership of the content it creates in Control Point. You grant us the
          limited right to store and display that content to operate the service. The Control Point
          name, logo, and interface are our property.
        </p>
      </Section>
      <Section title="Termination">
        <p>
          You may stop using the service and request account deletion at any time. We may suspend or
          terminate accounts that violate these terms.
        </p>
      </Section>
      <Section title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, Control Point is provided without warranties of any
          kind, and we are not liable for indirect or consequential damages arising from your use of
          the service.
        </p>
      </Section>
      <Section title="Changes">
        <p>We may update these terms; continued use of the service after changes take effect constitutes acceptance.</p>
      </Section>
      <Section title="Contact">
        <p>Questions about these terms: <a className="text-accent hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
      </Section>
    </>
  );
}

export default function LegalPage({ page }: { page: LegalKind }) {
  const isPrivacy = page === 'privacy';
  usePublicPageView(`/${page}`);
  return (
    <div className="min-h-screen bg-primary text-text-base">
      <header className="border-b border-text-base/[0.06]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 sm:px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
              <Bolt className="w-5 h-5 text-accent-ink" strokeWidth={2.75} />
            </span>
            <span className="font-display font-bold">Control Point</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-base transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          {isPrivacy ? 'Privacy Policy' : 'Terms of Service'}
        </h1>
        <p className="text-sm text-text-muted mb-10">Effective {EFFECTIVE_DATE}</p>
        {isPrivacy ? <PrivacyBody /> : <TermsBody />}
        <footer className="mt-12 border-t border-text-base/[0.06] pt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link to="/privacy" className={`hover:text-text-base transition-colors ${isPrivacy ? 'text-text-base font-semibold' : 'text-text-muted'}`}>
            Privacy Policy
          </Link>
          <Link to="/terms" className={`hover:text-text-base transition-colors ${!isPrivacy ? 'text-text-base font-semibold' : 'text-text-muted'}`}>
            Terms of Service
          </Link>
        </footer>
      </main>
    </div>
  );
}
