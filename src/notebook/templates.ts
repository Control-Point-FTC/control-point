import type { JSONContent } from '@tiptap/core';
const text = (value: string): JSONContent[] => value ? [{ type: 'text', text: value }] : [];
const paragraph = (value = ''): JSONContent => ({ type: 'paragraph', content: text(value) });
const heading = (value: string): JSONContent => ({ type: 'heading', attrs: { level: 2 }, content: text(value) });
const checklist = (values: string[]): JSONContent => ({ type: 'taskList', content: values.map(v => ({ type: 'taskItem', attrs: { checked: false }, content: [paragraph(v)] })) });
export const NOTEBOOK_TEMPLATES = [
  { id: 'blank', label: 'Blank', description: 'Start with an empty page.', content: [paragraph()] },
  { id: 'meeting', label: 'Meeting notes', description: 'Agenda, notes, decisions and action items.', content: [heading('Meeting details'), paragraph('Date: '), paragraph('Attendees: '), heading('Agenda'), paragraph(), heading('Discussion'), paragraph(), heading('Decisions'), paragraph(), heading('Action items'), checklist(['Add an action item'])] },
  { id: 'todo', label: 'To-do list', description: 'An editable checklist for the team.', content: [heading('Team checklist'), checklist(['First task', 'Next task', 'Follow up'])] },
  { id: 'engineering', label: 'Engineering log', description: 'Goal, experiment, observations and next steps.', content: [heading('Goal / question'), paragraph(), heading('Setup and changes'), paragraph(), heading('Observations and results'), paragraph(), heading('What we learned'), paragraph(), heading('Next steps'), checklist(['Next experiment'])] },
  { id: 'design', label: 'Design review notes', description: 'Capture discussion, tradeoffs and decisions.', content: [heading('Design and context'), paragraph(), heading('Options and tradeoffs'), paragraph(), heading('Feedback and questions'), paragraph(), heading('Decisions'), paragraph(), heading('Follow-up notes'), paragraph()] },
] satisfies { id: string; label: string; description: string; content: JSONContent[] }[];
export function notebookTemplate(id: string): JSONContent {
  const template = NOTEBOOK_TEMPLATES.find(t => t.id === id) ?? NOTEBOOK_TEMPLATES[0];
  // Every page owns its content. Editing one instance cannot change a template
  // or a different page, and stable block IDs are generated for the new page.
  const content = structuredClone(template.content);
  if (content.at(-1)?.type !== 'paragraph') content.push(paragraph());
  return { type: 'doc', content };
}
