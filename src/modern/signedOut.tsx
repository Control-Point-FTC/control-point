// Signed-out screens (landing, auth): Modern theme tokens + toasts while no
// InterfaceModeProvider is mounted.
import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { Toaster } from '../components/ui-kit';

/**
 * Wraps a Modern signed-out screen: turns on the Modern theme tokens (scoped to
 * html[data-ui="modern"]; the provider that normally sets this is not mounted
 * while signed out) and honours reduced motion like ModernShell does.
 */
export function SignedOutModern({ children }: { children: ReactNode }) {
  // Set before paint (no flash of the Classic palette)…
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.ui = 'modern';
    // Signing in mounts the provider, which sets its own mode after this runs.
    return () => { if (root.dataset.ui === 'modern') delete root.dataset.ui; };
  }, []);
  // …and again after passive effects: on sign-out the provider's unmount
  // cleanup (which clears the attribute) runs after the layout effect above.
  useEffect(() => { document.documentElement.dataset.ui = 'modern'; }, []);
  // Toasts (e.g. "Password updated") go to Sonner in Modern; ModernShell's
  // Toaster isn't mounted while signed out, so these screens bring their own.
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Toaster />
    </MotionConfig>
  );
}
