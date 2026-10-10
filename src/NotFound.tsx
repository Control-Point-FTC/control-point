import { Link } from 'react-router-dom';
import { Bolt, ArrowLeft } from 'lucide-react';

/** Branded page for paths the app doesn't have. The server answers these
 *  with a 404 status; this is what a person sees. App sets the tab title. */
export default function NotFoundPage({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="min-h-screen bg-primary text-text-base flex items-center justify-center px-4">
      <main className="max-w-md text-center">
        <span className="mx-auto mb-6 w-12 h-12 rounded-2xl bg-accent flex items-center justify-center">
          <Bolt className="w-6 h-6 text-accent-ink" strokeWidth={2.75} aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-accent mb-2">404</p>
        <h1 className="font-display text-3xl font-bold tracking-tight mb-3">Page not found</h1>
        <p className="text-text-muted mb-8">
          The link may be mistyped, or the page may have moved. Nothing from your team is shown here.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link to={signedIn ? '/dashboard' : '/'} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:opacity-90">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {signedIn ? 'Go to dashboard' : 'Go to home'}
          </Link>
          {!signedIn && <Link to="/privacy" className="text-sm text-text-muted hover:text-text-base">Privacy</Link>}
          {!signedIn && <Link to="/terms" className="text-sm text-text-muted hover:text-text-base">Terms</Link>}
        </div>
      </main>
    </div>
  );
}
