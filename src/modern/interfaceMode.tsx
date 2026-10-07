// Interface mode. The Classic look was retired in V3: every account and
// device now gets the Modern experience, whatever was saved before (the
// stored members.interface_mode / teams.default_interface_mode values are
// simply ignored). The provider and hook remain so the Modern components that
// read `mode` keep working, and so the html[data-ui="modern"] attribute that
// scopes the Modern theme tokens is still set.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

export type InterfaceMode = 'modern';
export const DEFAULT_INTERFACE_MODE: InterfaceMode = 'modern';

export function isInterfaceMode(v: unknown): v is InterfaceMode {
  return v === 'modern';
}

/** Always Modern (kept for callers and tests that resolve a mode). */
export function resolveInterfaceMode(_userMode?: unknown, _teamDefault?: unknown): InterfaceMode {
  return 'modern';
}

interface Ctx {
  mode: InterfaceMode;
}

const InterfaceModeContext = createContext<Ctx>({ mode: 'modern' });

export function InterfaceModeProvider({ children }: {
  user?: any;
  team?: any;
  onUserSaved?: (u: any) => void;
  children: ReactNode;
}) {
  const value = useMemo<Ctx>(() => ({ mode: 'modern' }), []);
  // Lets CSS (and the pre-paint guard in index.html) target the Modern layer.
  useEffect(() => {
    document.documentElement.dataset.ui = 'modern';
    try { localStorage.setItem('cp-interface-mode', 'modern'); } catch { /* storage unavailable */ }
  }, []);
  // Signed out (provider unmounts): the signed-out screens set it themselves.
  useEffect(() => () => { delete document.documentElement.dataset.ui; }, []);
  return <InterfaceModeContext.Provider value={value}>{children}</InterfaceModeContext.Provider>;
}

export function useInterfaceMode() {
  return useContext(InterfaceModeContext);
}
