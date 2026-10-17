// Checklists (feature parity 4.1): reusable templates split into sections
// (timed: Morning / Between matches / End of day, or by category: Power /
// Electronics / Pit), and runs of a template where each item is checked off
// by someone at a time, marked N/A, or left partial. Shared by the Checklists
// page, the server and Bruno.

export type ChecklistItem = { id: string; text: string };
export type ChecklistSection = { id: string; title: string; items: ChecklistItem[] };
export type ChecklistTemplate = { id?: number; title: string; description?: string; sections: ChecklistSection[]; starter?: string | null };

export const ITEM_STATES = ['open', 'done', 'partial', 'na'] as const;
export type ItemState = (typeof ITEM_STATES)[number];
export const ITEM_STATE_LABELS: Record<ItemState, string> = { open: 'Not done', done: 'Done', partial: 'Partly done', na: 'N/A' };

export const MAX_SECTIONS = 12;
export const MAX_ITEMS = 120;
export const MAX_TEXT = 200;
export const MAX_TITLE = 80;

const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const slug = (prefix: string, i: number) => `${prefix}${i + 1}`;

/**
 * A template as sent by a person or Bruno, validated: a title, 1–12 sections,
 * 1–120 items in all, every text trimmed. Item ids are kept when they are
 * well formed and unique (so edits keep check-offs), otherwise assigned.
 */
export function cleanChecklistTemplate(input: any): { value: ChecklistTemplate } | { error: string } {
  const title = cleanText(input?.title, MAX_TITLE);
  if (!title) return { error: 'Give the checklist a name' };
  const rawSections = Array.isArray(input?.sections) ? input.sections : Array.isArray(input?.items) ? [{ title: '', items: input.items }] : [];
  const seen = new Set<string>();
  const id = (v: unknown, fallback: string) => {
    const s = typeof v === 'string' && /^[\w-]{1,40}$/.test(v) && !seen.has(v) ? v : fallback;
    let out = s, n = 2;
    while (seen.has(out)) out = `${s}-${n++}`;
    seen.add(out);
    return out;
  };
  const sections: ChecklistSection[] = [];
  let total = 0;
  for (const [si, raw] of rawSections.entries()) {
    const items: ChecklistItem[] = [];
    for (const [ii, it] of (Array.isArray(raw?.items) ? raw.items : []).entries()) {
      const text = cleanText(typeof it === 'string' ? it : it?.text, MAX_TEXT);
      if (!text) continue;
      items.push({ id: id(typeof it === 'object' ? it?.id : undefined, `s${si + 1}i${ii + 1}`), text });
    }
    if (!items.length) continue;
    total += items.length;
    sections.push({ id: id(raw?.id, slug('s', si)), title: cleanText(raw?.title, MAX_TITLE), items });
  }
  if (!sections.length) return { error: 'Add at least one item' };
  if (sections.length > MAX_SECTIONS) return { error: `Keep it to ${MAX_SECTIONS} sections` };
  if (total > MAX_ITEMS) return { error: `Keep it to ${MAX_ITEMS} items` };
  const description = cleanText(input?.description, 300);
  return { value: { title, ...(description ? { description } : {}), sections } };
}

export const isItemState = (v: unknown): v is ItemState => typeof v === 'string' && (ITEM_STATES as readonly string[]).includes(v);

/** Progress of a run: done counts, N/A items leave the total ("2 of 24"). */
export function runProgress(sections: ChecklistSection[], states: Record<string, ItemState | undefined>): { done: number; total: number; partial: number; na: number } {
  let done = 0, total = 0, partial = 0, na = 0;
  for (const s of sections) for (const it of s.items) {
    const st = states[it.id] ?? 'open';
    if (st === 'na') { na++; continue; }
    total++;
    if (st === 'done') done++;
    if (st === 'partial') partial++;
  }
  return { done, total, partial, na };
}

const sec = (title: string, items: string[]) => ({ title, items });

/** Starter templates a team can add with one click (their own copy, editable). */
export const STARTER_CHECKLISTS: { key: string; title: string; description: string; sections: { title: string; items: string[] }[] }[] = [
  {
    key: 'pre-match', title: 'Pre-match', description: 'Before every match: robot, driver station and strategy.',
    sections: [
      sec('Robot', ['Battery charged (12.8 V or more) and strapped down', 'Main power switch on and reachable', 'Battery connector and power wires secure', 'Control Hub and Expansion Hub lights normal', 'Motor and servo cables seated', 'No loose screws, zip ties or parts', 'Drivetrain spins freely, no rubbing', 'Intake clear and working', 'Lift/arm moves through full range', 'Robot starts inside the sizing limits', 'Team number flags or signs on', 'Alliance-colour markers on the right colour']),
      sec('Driver station', ['Driver hub charged (or plugged in)', 'Controllers charged and paired', 'Correct OpMode selected for auto', 'Correct alliance and start position chosen', 'Robot connected to the driver hub', 'Spare controller ready']),
      sec('Strategy', ['Auto plan agreed with alliance partner', 'Start position agreed', 'Endgame plan agreed', 'Drivers know the match number and field', 'Coach has the match notes', 'Queue on time']),
    ],
  },
  {
    key: 'post-match', title: 'Post-match', description: 'Right after a match, before the next one.',
    sections: [sec('After the match', ['Swap in a charged battery', 'Check the score and note any penalties', 'Inspect for damage or loose parts', 'Check wiring and connectors', 'Check wheels and drivetrain', 'Note what worked and what didn\'t', 'Log any fixes needed', 'Check the next match time and alliance', 'Put the used battery on the charger'])],
  },
  {
    key: 'pit-setup', title: 'Pit setup', description: 'Setting up the pit at an event.',
    sections: [
      sec('Power', ['Power strip and extension cord placed', 'Battery chargers plugged in', 'Batteries on charge and labelled', 'Charging log started', 'Driver hub charger plugged in', 'Laptop chargers plugged in']),
      sec('Electronics', ['Spare Control/Expansion Hub ready', 'Spare motors and servos out', 'Spare wires and connectors out', 'Laptop with latest code ready', 'USB cables ready', 'Driver hub updated']),
      sec('Pit', ['Table and pit layout set', 'Team banner up', 'Robot cart in place', 'Toolbox opened and organised', 'Spare parts bins labelled', 'Safety glasses for everyone', 'First aid kit out', 'Trash bag set up', 'Engineering notebook ready for judges', 'Team handouts out', 'Pit display or poster up', 'Fire safety: chargers on a non-flammable surface', 'Team roster and schedule printed', 'Match schedule posted', 'Water and snacks stored away from the robot']),
    ],
  },
  {
    key: 'pit-teardown', title: 'Pit teardown', description: 'Packing up at the end of an event.',
    sections: [
      sec('Robot and electronics', ['Robot powered off and battery removed', 'Batteries unplugged and packed', 'Chargers packed', 'Hubs and spare electronics packed', 'Laptops and cables packed', 'Driver hub and controllers packed']),
      sec('Pit', ['Tools counted and packed', 'Spare parts packed', 'Banner and signs taken down', 'Table cleared', 'Power strips and cords packed', 'Safety glasses collected', 'Notebook and handouts packed', 'Trash removed', 'Pit area swept']),
      sec('Leaving', ['Robot cart loaded', 'Final walk-through of the pit', 'Thank the volunteers', 'Everyone accounted for']),
    ],
  },
  {
    key: 'travel-day', title: 'Travel day', description: 'Getting the team and robot to an event.',
    sections: [sec('Before leaving', ['Robot packed and padded', 'Batteries packed safely', 'Tool kit packed', 'Spare parts packed', 'Laptops, hubs and chargers packed', 'Engineering notebook packed', 'Team shirts and badges', 'Event registration and documents', 'Permission slips and medical forms', 'Transport confirmed', 'Departure time sent to families', 'Everyone accounted for'])],
  },
  {
    key: 'robot-lockup', title: 'Robot lockup', description: 'Securing the robot and gear overnight.',
    sections: [sec('Lockup', ['Robot powered off', 'Battery removed from the robot', 'Batteries off the chargers', 'Chargers unplugged', 'Robot on its cart', 'Robot covered or stored', 'Tools put away', 'Laptops taken with the team', 'Driver hub and controllers taken', 'Valuables taken', 'Pit tidied', 'Power strips switched off', 'Pit area checked one last time', 'Lockup time noted'])],
  },
  {
    key: 'competition-debrief', title: 'Competition debrief', description: 'After an event, while it\'s fresh.',
    sections: [sec('Debrief', ['Final rank and record noted', 'Awards and judging feedback noted', 'What worked well', 'What broke or failed', 'What to change before the next event', 'Scouting notes saved', 'Thank-you notes to sponsors and volunteers', 'Notebook entry written'])],
  },
];

/** A starter template as a team's own template (with item ids). */
export function starterTemplate(key: string): ChecklistTemplate | null {
  const s = STARTER_CHECKLISTS.find((t) => t.key === key);
  if (!s) return null;
  const c = cleanChecklistTemplate({ title: s.title, description: s.description, sections: s.sections });
  return 'error' in c ? null : { ...c.value, starter: s.key };
}

/** Items in a template. */
export const itemCount = (t: { sections: ChecklistSection[] }) => t.sections.reduce((n, s) => n + s.items.length, 0);
