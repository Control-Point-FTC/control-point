// Changelog — version history for the "What's New" feature.
// Add a new entry at the top for each release. Keep it user-friendly:
// what changed, what was added, what was fixed.

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  added: string[];
  improved: string[];
  fixed: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.2.0',
    date: '2026-10-04',
    title: 'Settings makeover + sounds + PWA',
    added: [
      'Notification sounds and call ringtones (WebAudio, no downloads)',
      'Add to Home Screen prompt — install Control Point like a native app',
      'Service worker for faster loads and basic offline support',
      'FTC coding preferences: OpMode style, code conventions, safety checks',
      'Bruno AI settings: explanation style, response format, auto-explain, confirm-before-changes',
      'Full background grid customization: size, brightness, pulse speed/intensity, cursor glow',
      'Overdue tasks now show an orange "Overdue" label everywhere',
      '"What\'s New" changelog in Settings',
    ],
    improved: [
      'Incoming call dialog redesigned — pulsing avatar, clear Accept/Decline buttons',
      'Language switching now shows instant confirmation in the new language',
      'Settings navigation titles now translate with the app language',
      'My Account: unsaved-changes warning, inline validation, better status picker',
    ],
    fixed: [
      'User menu dropdown no longer shows page content through it',
      'Removed "Max" AI output length — High is now the maximum',
      'YouTube subscriber deltas show red when negative',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-03',
    title: 'Voice channels + Oracle migration',
    added: [
      'Voice channels with Discord-style participant visibility',
      'Auto-expanding channels when people join',
      'Front camera default on mobile',
    ],
    improved: [
      'Task columns and cards use solid backgrounds for readability',
      'Task extraction placeholder with better examples',
    ],
    fixed: [
      'Calendar hides finished events from "Up Next"',
      'Finished events show crossed out in month view',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-01',
    title: 'Production launch',
    added: [
      'Control Point launches on tryctrlpoint.org',
      'Volt & Carbon theme',
      'Six languages: English, Spanish, French, Portuguese, Romanian, German',
      'Bruno AI assistant with teaching mode',
    ],
    improved: [],
    fixed: [],
  },
];

export const CURRENT_VERSION = '1.2.0';
