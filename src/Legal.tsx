import { Link } from 'react-router-dom';
import { CONTACT_EMAIL } from './utils/contact';
import { usePublicPageView } from './utils/pageViews';
import { Bolt, ArrowLeft } from 'lucide-react';

type LegalKind = 'privacy' | 'terms';

const EFFECTIVE_DATE = 'September 29, 2026';


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
          This policy explains what information we collect, how we use it, and the choices you have.
        </p>
      </Section>
      <Section title="Information we collect">
        <p><strong className="text-text-base/90">Account information.</strong> When you sign up, we collect your name, email address, and password (stored as a secure hash), or basic profile information from Google, Discord, or GitHub if you sign in with one of those providers.</p>
        <p><strong className="text-text-base/90">Team content.</strong> Information you and your team create in the app: members, attendance records, tasks, events, messages, budget entries, inventory, and outreach activity.</p>
        <p><strong className="text-text-base/90">Connected social accounts.</strong> If a team admin links a YouTube channel or connects a TikTok account in the Outreach section, we store the channel/account identifiers and the public metrics we sync (such as subscriber and follower counts). YouTube data comes from public YouTube Data API responses. TikTok data comes through TikTok Login Kit — see below.</p>
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
      </Section>
      <Section title="How we use information">
        <p>
          We use the information we collect to operate and improve Control Point: creating and managing
          teams, syncing the social metrics you asked us to track, and keeping your account secure.
          We do not sell your personal information, and we do not use it for advertising.
        </p>
      </Section>
      <Section title="Storage and security">
        <p>
          Data is hosted on Render and Turso infrastructure in the United States. Access tokens for
          connected accounts are encrypted with a server-side key. While we take reasonable measures
          to protect your information, no internet service is completely secure.
        </p>
      </Section>
      <Section title="Your choices">
        <p>
          You may update your profile information in the app, disconnect linked social accounts at any
          time, and request deletion of your account and associated data by contacting us at the email
          below. Team admins manage their own teams' membership and content.
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
          (Login Kit), YouTube (Data API), Google, Discord, and GitHub. Your use of those services is
          governed by their own terms and privacy policies. Connecting an account authorizes us only to
          access the specific data described in our Privacy Policy.
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
