// Bruno's appearance action: "turn on light mode" ends Bruno's reply with
//   ```appearance
//   {"theme":"light"}
//   ```
// ("light", "dark" or "system"). Appearance is a per-device preference kept
// in this browser (src/hooks/useTheme.ts), so the app applies it here as soon
// as the reply finishes; nothing changes on the server or for anyone else.
import { setAppearance, type ThemeChoice } from '../hooks/useTheme';

const BLOCK = /```appearance\s*\r?\n([\s\S]*?)\r?\n```/;

/** The theme a finished reply asks for, or null. */
export function appearanceRequest(text: string): ThemeChoice | null {
  const m = BLOCK.exec(String(text || ''));
  if (!m) return null;
  try {
    const t = JSON.parse(m[1])?.theme;
    return t === 'light' || t === 'dark' || t === 'system' ? t : null;
  } catch {
    return null;
  }
}

/** Applies a finished reply's appearance block on this device; returns what was set. */
export function applyAppearanceFromReply(text: string): ThemeChoice | null {
  const choice = appearanceRequest(text);
  if (choice) setAppearance(choice);
  return choice;
}
