// Signed-out look (2026 redesign, phase 9b). There is no account to read the
// interface mode from yet, so the landing and auth screens follow the look this
// device last used (InterfaceModeProvider mirrors it into localStorage), else
// the app default. A link on the Modern screens switches back to Classic.
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { DEFAULT_INTERFACE_MODE, isInterfaceMode, type InterfaceMode } from './interfaceMode';

const KEY = 'cp-interface-mode';

export function readDeviceMode(): InterfaceMode {
  try {
    const v = localStorage.getItem(KEY);
    if (isInterfaceMode(v)) return v;
  } catch { /* storage unavailable */ }
  return DEFAULT_INTERFACE_MODE;
}

/** The signed-out look and a setter that remembers it on this device. */
export function useSignedOutMode(signedIn: boolean) {
  const [mode, setModeState] = useState<InterfaceMode>(readDeviceMode);
  // Signing out: pick up the look the session just used.
  useEffect(() => { if (!signedIn) setModeState(readDeviceMode()); }, [signedIn]);
  const setMode = (next: InterfaceMode) => {
    try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
    setModeState(next);
  };
  return [mode, setMode] as const;
}

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
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
