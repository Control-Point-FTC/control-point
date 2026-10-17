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
  { id: 'test', label: 'Test log', description: 'What you tested, how, the runs and the verdict.', content: [heading('What we tested'), paragraph(), heading('Setup'), paragraph('Robot / mechanism version: '), paragraph('Conditions: '), heading('Procedure'), paragraph(), heading('Results'), paragraph('Run 1: '), paragraph('Run 2: '), paragraph('Run 3: '), heading('Verdict'), paragraph(), heading('Next steps'), checklist(['Next test'])] },
  { id: 'failure', label: 'Failure analysis', description: 'What broke, why, the fix and how to prevent it.', content: [heading('What failed'), paragraph('When and where: '), heading('Symptoms'), paragraph(), heading('Root cause'), paragraph('Why 1: '), paragraph('Why 2: '), paragraph('Why 3: '), heading('Fix'), paragraph(), heading('Prevention'), checklist(['Change to stop it happening again'])] },
  { id: 'outreach', label: 'Outreach event', description: 'Who you reached, what you did and the impact.', content: [heading('Event'), paragraph('Date and place: '), paragraph('Partner / audience: '), heading('Team members'), paragraph(), heading('What we did'), paragraph(), heading('Impact'), paragraph('People reached: '), paragraph('Hours: '), heading('Reflections and follow-up'), checklist(['Thank-you note sent'])] },
  { id: 'competition', label: 'Competition recap', description: "Matches, what worked, what didn't and the changes to make.", content: [heading('Event'), paragraph('Date and event: '), paragraph('Final rank: '), heading('Matches'), paragraph(), heading('What worked'), paragraph(), heading("What didn't"), paragraph(), heading('Judging and awards'), paragraph(), heading('Changes before the next event'), checklist(['Change to make'])] },
  { id: 'code', label: 'Code change', description: 'The problem, the change, how it was tested and the result.', content: [heading('Problem'), paragraph(), heading('Change'), paragraph('Files / branch: '), paragraph(), heading('How we tested it'), paragraph(), heading('Result'), paragraph(), heading('Follow-up'), checklist(['Next code task'])] },
  { id: 'iteration', label: 'Design iteration', description: 'Hypothesis, the changes, the results and what comes next.', content: [heading('Hypothesis'), paragraph('If we… then… because…'), heading('Changes from the last version'), paragraph(), heading('Results'), paragraph(), heading('Was the hypothesis right?'), paragraph(), heading('Next iteration'), checklist(['Next change to try'])] },
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
