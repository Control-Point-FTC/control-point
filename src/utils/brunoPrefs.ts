// brunoPrefs — typed reader for the Bruno AI + FTC coding preferences stored
// in localStorage by SettingsModal. Lets the Bruno chat layer pick these up
// later without reaching into settings internals.

export type ExplanationStyle = 'beginner' | 'balanced' | 'technical';
export type ResponseFormat = 'concise' | 'detailed' | 'step-by-step' | 'code-first';
export type OpmodeStyle = 'linear' | 'opmode' | 'ask';

export interface BrunoPreferences {
  explanationStyle: ExplanationStyle;
  responseFormat: ResponseFormat;
  autoExplain: boolean;
  confirmChanges: boolean;
  rememberPrefs: boolean;
  ftc: {
    opmodeStyle: OpmodeStyle;
    indent: 2 | 4;
    comments: boolean;
    beginnerComments: boolean;
    warnHardware: boolean;
    warnReversed: boolean;
    warnPower: boolean;
    warnBlocking: boolean;
  };
}

const DEFAULTS: BrunoPreferences = {
  explanationStyle: 'balanced',
  responseFormat: 'detailed',
  autoExplain: true,
  confirmChanges: true,
  rememberPrefs: true,
  ftc: {
    opmodeStyle: 'linear',
    indent: 4,
    comments: true,
    beginnerComments: false,
    warnHardware: true,
    warnReversed: true,
    warnPower: true,
    warnBlocking: true,
  },
};

function read(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readBool(key: string, fallback: boolean): boolean {
  const v = read(key);
  return v == null ? fallback : v === '1';
}

function readEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = read(key);
  return v != null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function getBrunoPreferences(): BrunoPreferences {
  return {
    explanationStyle: readEnum('controlpoint-bruno-explanation-style',
      ['beginner', 'balanced', 'technical'] as const, DEFAULTS.explanationStyle),
    responseFormat: readEnum('controlpoint-bruno-response-format',
      ['concise', 'detailed', 'step-by-step', 'code-first'] as const, DEFAULTS.responseFormat),
    autoExplain: readBool('controlpoint-bruno-auto-explain', DEFAULTS.autoExplain),
    confirmChanges: readBool('controlpoint-bruno-confirm-changes', DEFAULTS.confirmChanges),
    rememberPrefs: readBool('controlpoint-bruno-remember-prefs', DEFAULTS.rememberPrefs),
    ftc: {
      opmodeStyle: readEnum('controlpoint-ftc-opmode-style',
        ['linear', 'opmode', 'ask'] as const, DEFAULTS.ftc.opmodeStyle),
      indent: readEnum('controlpoint-ftc-indent', ['2', '4'] as const, '4') === '2' ? 2 : 4,
      comments: readBool('controlpoint-ftc-comments', DEFAULTS.ftc.comments),
      beginnerComments: readBool('controlpoint-ftc-beginner-comments', DEFAULTS.ftc.beginnerComments),
      warnHardware: readBool('controlpoint-ftc-warn-hardware', DEFAULTS.ftc.warnHardware),
      warnReversed: readBool('controlpoint-ftc-warn-reversed', DEFAULTS.ftc.warnReversed),
      warnPower: readBool('controlpoint-ftc-warn-power', DEFAULTS.ftc.warnPower),
      warnBlocking: readBool('controlpoint-ftc-warn-blocking', DEFAULTS.ftc.warnBlocking),
    },
  };
}
