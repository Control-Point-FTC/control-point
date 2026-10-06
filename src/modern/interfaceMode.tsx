// Interface mode (2026 redesign): Legacy vs Modern experience.
//
// Resolution: the user's own choice (members.interface_mode) → the workspace
// default (teams.default_interface_mode) → 'legacy'. Switching is instant: the
// mode lives in React state above both shells, saves optimistically and rolls
// back if the save fails. Business data stays in App state, so nothing reloads.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiFetch } from '../services/api';

export type InterfaceMode = 'legacy' | 'modern';
export const DEFAULT_INTERFACE_MODE: InterfaceMode = 'legacy';

export function isInterfaceMode(v: unknown): v is InterfaceMode {
  return v === 'legacy' || v === 'modern';
}

/** Pure resolution, exported for tests. */
export function resolveInterfaceMode(userMode: unknown, teamDefault: unknown): InterfaceMode {
  if (isInterfaceMode(userMode)) return userMode;
  if (isInterfaceMode(teamDefault)) return teamDefault;
  return DEFAULT_INTERFACE_MODE;
}

interface Ctx {
  mode: InterfaceMode;
  /** True when the user has made an explicit choice (vs following the default). */
  chosen: boolean;
  teamDefault: InterfaceMode | null;
  setMode: (mode: InterfaceMode) => Promise<boolean>;
}

const InterfaceModeContext = createContext<Ctx>({
  mode: DEFAULT_INTERFACE_MODE,
  chosen: false,
  teamDefault: null,
  setMode: async () => false,
});

export function InterfaceModeProvider({ user, team, onUserSaved, children }: {
  user: any;
  team: any;
  /** Merge the saved user back into App state. */
  onUserSaved: (u: any) => void;
  children: ReactNode;
}) {
  const teamDefault = isInterfaceMode(team?.default_interface_mode) ? team.default_interface_mode : null;
  const serverMode = isInterfaceMode(user?.interface_mode) ? user.interface_mode : null;
  // Optimistic override while a save is in flight (or after it fails we drop it).
  const [pending, setPending] = useState<InterfaceMode | null>(null);
  useEffect(() => { setPending(null); }, [serverMode]);
  // The membership currently shown. A save that finishes after a workspace
  // switch answers for the OLD membership and must not be merged into the new one.
  const memberIdRef = useRef<number | null>(user?.id ?? null);
  memberIdRef.current = user?.id ?? null;

  const mode = pending ?? resolveInterfaceMode(serverMode, teamDefault);

  const setMode = useCallback(async (next: InterfaceMode) => {
    if (!user?.id) return false;
    const requestedFor = user.id;
    setPending(next);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user.name || '', role: user.role || '', interface_mode: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.user) throw new Error(data.error || 'save failed');
      // Stale answer (the user switched workspaces meanwhile): the choice is
      // saved per account on the server, so only adopt the mode, not the row.
      if (memberIdRef.current !== requestedFor || data.user.id !== requestedFor) {
        if (memberIdRef.current != null) onUserSaved({ id: memberIdRef.current, interface_mode: next });
        return true;
      }
      onUserSaved({ ...data.user, interface_mode: next });
      return true;
    } catch {
      setPending(null); // roll back to the saved mode
      return false;
    }
  }, [user?.id, user?.name, user?.role, onUserSaved]);

  const value = useMemo<Ctx>(() => ({ mode, chosen: pending != null || serverMode != null, teamDefault, setMode }), [mode, pending, serverMode, teamDefault, setMode]);

  // Lets CSS (and the pre-paint guard in index.html) target the active layer.
  useEffect(() => {
    document.documentElement.dataset.ui = mode;
    try { localStorage.setItem('cp-interface-mode', mode); } catch { /* storage unavailable */ }
  }, [mode]);

  return <InterfaceModeContext.Provider value={value}>{children}</InterfaceModeContext.Provider>;
}

export function useInterfaceMode() {
  return useContext(InterfaceModeContext);
}
