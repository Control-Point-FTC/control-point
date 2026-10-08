// Context-aware rotating starter prompts for Bruno.
// Each page gets a large pool showcasing what Bruno can DO there. The panel
// shows a few at a time, rotating through the pool without repeating until
// every prompt has been shown.

export const BRUNO_TITLE = 'FTC Coach · BIOBUZZ season';

type StarterPool = { greeting: string; prompts: string[] };

const DEFAULT_GREETING =
  "Hey, I'm Bruno — your FTC coach for the BIOBUZZ season. I can answer build questions, write code, and take action in the app: log emails, create tasks, schedule events, and more.";

const POOLS: Record<string, StarterPool> = {
  comm: {
    greeting:
      "I can manage your communication log — paste an email and I'll pull out the fields, or tell me about a reply or follow-up to log.",
    prompts: [
      'Log an email I just sent to our sponsor about the parts order',
      'I got a reply from the venue — log it under our booking thread',
      'Log a follow-up message to the parents about Saturday practice',
      'Add the email thread with REV Robotics support to the log',
      'Log an announcement to the whole team about the outreach event',
      'They responded to my sponsorship ask — add their reply to the thread',
      'Log the email I sent to the judges about our portfolio',
      'Record the message we sent to the rookie team we are mentoring',
      'Add a note about the call I had with the event coordinator',
      'Log the thank-you email we sent to our mentor',
      'I emailed FIRST about registration — log it',
      'Add their reply about the pit layout to the existing thread',
      'Log the reminder I sent about dues to the team parents',
      'Record the outreach email to the local library',
      'Log the follow-up I sent after the sponsor meeting',
      'Add the email chain with the machine shop to the log',
    ],
  },
  tasks: {
    greeting:
      'I can create and organize tasks — give me a title, who it is for, a due date, and any details.',
    prompts: [
      'Add a task: finish the intake prototype, due Friday at 6pm, assign it to the build team',
      'Create a task to order REV parts with a description of what we need',
      'Add a task for drive practice tomorrow at 4pm',
      'Make a task: update the engineering notebook, due Sunday night',
      'Create a task to test autonomous paths, high priority',
      'Add a task for the outreach team to plan the library demo next week',
      'Create a task: charge all batteries before Saturday, due Friday',
      'Add a task to review the game manual updates with the strategy team',
      'Make a task for CAD: model the new claw design, due Wednesday',
      'Create a task to pack the pit kit for the qualifier',
      'Add a recurring-style reminder task: weekly team meeting every Tuesday',
      'Create a task to write the judge presentation script',
      'Add a task: calibrate the color sensor, assign it to the programming team',
      'Make a task to email sponsors thank-you notes after the event',
      'Create a task for fundraising: car wash signup sheet, due next Monday',
      'Add a task to back up the robot code before the competition',
    ],
  },
  calendar: {
    greeting:
      'I can schedule events — tell me what, when, and where, and I will put it on the team calendar.',
    prompts: [
      'Schedule build session this Saturday 10am to 4pm at the workshop',
      'Add our qualifier on December 12th, all day',
      'Put drive practice on the calendar every Thursday at 5pm',
      'Schedule the outreach demo at the library next Friday at 3pm',
      'Add a strategy meeting tomorrow at 6pm',
      'Schedule robot inspection prep the night before the qualifier',
      'Put the fundraising car wash on Saturday the 18th from 9am to 1pm',
      'Add a CAD review session Wednesday evening',
      'Schedule programming sprint this weekend',
      'Add the parent info night to the calendar',
      'Put load-in for the competition on Friday at 5pm',
      'Schedule a scrimmage with the neighboring team next month',
    ],
  },
  outreach: {
    greeting:
      'I can log outreach activities and help plan them — tell me what the team did or is planning.',
    prompts: [
      'Log our library demo last Saturday — 40 kids attended',
      'Record the rookie team mentoring session we ran',
      'Add the STEM night at the elementary school to outreach',
      'Log the robot demo we did for the town council',
      'Help me plan an outreach event for next month',
      'Record our FLL team mentoring hours this week',
      'Add the science fair judging we volunteered for',
      'Log the workshop we ran for new programmers',
      'What outreach should we do before the qualifier?',
      'Record the food drive our team organized',
    ],
  },
  attendance: {
    greeting: 'I can help with attendance — ask me about meetings or who should be there.',
    prompts: [
      'Who missed the last three build sessions?',
      'Remind the build team about Saturday attendance',
      'Which members have the best attendance this month?',
      'Draft an attendance reminder for the team chat',
    ],
  },
  inventory: {
    greeting: 'I can help track parts — ask me what we have or what to order.',
    prompts: [
      'Do we have spare REV motors in inventory?',
      'What parts are we low on?',
      'Add the new shipment of mecanum wheels to inventory',
      'What should we order before the qualifier?',
    ],
  },
  stats: {
    greeting: 'I can analyze scouting data — ask me about alliance partners, weaknesses, or what to scout next.',
    prompts: [
      'Who is our best potential alliance partner here?',
      'Who should we scout next?',
      'What is our biggest weakness compared with the event average?',
      'What information is missing before we make a scouting decision?',
      'Which teams have the most consistent autonomous?',
      'Compare our cycle times to the top teams here',
    ],
  },
  code: {
    greeting:
      "I can write and debug FTC Java with you — OpModes, autonomous paths, PID tuning, the works.",
    prompts: [
      'Help me write a TeleOp OpMode in Java',
      'How do I use encoders in autonomous?',
      'How should we design an intake for BIOBUZZ pollen?',
      'Mecanum vs tank drive — which should we pick?',
      'How do I tune PID for our lift?',
      'My robot drifts in autonomous — where do I start?',
      'Write a simple autonomous that drives forward and parks',
      'How do I read the color sensor in code?',
      'Help me structure our code into subsystems',
      'What is the best way to handle gamepad input for a claw?',
      'How do I use the IMU for field-centric drive?',
      'Explain Road Runner vs Pedro Pathing for BIOBUZZ',
    ],
  },
  predict: {
    greeting:
      'I can see the forecast on your screen — ask me to explain it, run what-ifs, or plan how to improve your odds.',
    prompts: [
      'Explain this prediction in plain English',
      'Why is our advancement chance what it is?',
      'What would it take to raise our odds at this event?',
      'Which matches matter most for our ranking here?',
      'What if we lose our first two qualification matches?',
      'Who are the strongest teams in this field?',
      'If we captain an alliance, who should we pick?',
      'Which captains are most likely to pick us?',
      'How confident should we be in this forecast?',
      'What score do we need to average to rank top 4?',
      'Compare us to the teams ranked just above us',
      'How accurate have these predictions been on past events?',
    ],
  },
  budget: {
    greeting: 'I can log spending and income, and help you plan where the money goes.',
    prompts: [
      'Log $45.99 for goBILDA servos today',
      'We got a $500 sponsorship from a local business — add it',
      'How much have we spent this season?',
      'What are our biggest spending categories?',
      'Log the $150 registration fee for the qualifier',
      'Help me plan a budget for the rest of the season',
      'Add three purchases: wheels $60, belts $25, bearings $18',
      'Are we on track to stay under budget?',
    ],
  },
  cad: {
    greeting: 'I can help with mechanism design, part choices and your CAD review notes.',
    prompts: [
      'How should we design an intake for BIOBUZZ pollen?',
      'What gear ratio should our arm use?',
      'Review our drivetrain choice — mecanum or tank?',
      'What should we check before a CAD design review?',
      'Suggest a lighter way to build our lift',
      'Which parts in our BOM are still missing?',
      'How do we keep CAD and the real robot in sync?',
      'Help me write notes for our latest CAD snapshot',
    ],
  },
  chat: {
    greeting: 'I can help you write messages, summarise discussions and turn chat into tasks or events.',
    prompts: [
      'Turn the plans in this channel into tasks',
      'Draft an announcement about Saturday’s build session',
      'Summarise what the team decided this week',
      'Schedule the meeting we just talked about',
      'Write a friendly reminder about team dues',
      'Draft a message welcoming our new members',
    ],
  },
  resources: {
    greeting: 'I can point you to good FTC resources and help organise your team’s links.',
    prompts: [
      'What are the best resources for learning Road Runner?',
      'Find guides for tuning a PID lift',
      'What should every rookie read first?',
      'Recommend resources for our engineering portfolio',
      'Where can we learn about BIOBUZZ game strategy?',
      'What CAD tutorials are good for beginners?',
    ],
  },
  teams: {
    greeting: 'I can help organise people — roles, who owns what, and onboarding new members.',
    prompts: [
      'Suggest roles for a 12-person team',
      'Who has the most open tasks right now?',
      'Help me plan onboarding for new members',
      'Who hasn’t been assigned anything this week?',
      'Draft a welcome message for a new mentor',
      'How should we split build and programming work?',
    ],
  },
  inbox: {
    greeting: 'I can help you work through what needs you — tasks, mentions and updates.',
    prompts: [
      'What do I need to do today?',
      'Which of my tasks are overdue?',
      'Summarise this week’s team updates',
      'What’s coming up on the calendar?',
      'Help me prioritise my tasks',
      'Did anything change on the calendar this week?',
    ],
  },
  dashboard: {
    greeting: DEFAULT_GREETING,
    prompts: [
      'What can you do in this app?',
      'How should we design an intake for BIOBUZZ pollen?',
      'Mecanum vs tank drive — which should we pick?',
      'Help me write a TeleOp OpMode in Java',
      'How do I tune PID for our lift?',
      'What should our BIOBUZZ match strategy be?',
      'How do we prepare for the judges?',
      'My robot drifts in autonomous — where do I start?',
      'Add a task for build session this Saturday',
      'Schedule our next team meeting',
      'Log the email I sent to our sponsor',
      'What should we focus on this week?',
      'Explain the BIOBUZZ scoring to me',
      'Help me plan our build season timeline',
      'What makes a good engineering notebook?',
      'How do we pick an alliance partner?',
    ],
  },
};

export function starterPoolForPath(pathname: string): StarterPool {
  const seg = (pathname || '').split('/')[1] || 'dashboard';
  if (POOLS[seg]) return POOLS[seg];
  // CAD sub-pages (/cad-parts, /cad-reviews, …)
  if (seg.startsWith('cad')) return POOLS.cad;
  return POOLS.dashboard;
}

/**
 * Draw the next batch of starters from a pool without repeating until the
 * whole pool has been shown. `seen` holds indices already displayed.
 * Returns the batch and the updated seen list (reset when the pool cycles).
 */
export function nextStarters(pool: StarterPool, seen: number[], batchSize = 4): { batch: string[]; seen: number[] } {
  const total = pool.prompts.length;
  let remaining = seen;
  if (remaining.length >= total) remaining = [];
  const available = pool.prompts.map((_, i) => i).filter((i) => !remaining.includes(i));
  // Shuffle the available indices.
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  const picked = available.slice(0, batchSize);
  return { batch: picked.map((i) => pool.prompts[i]), seen: [...remaining, ...picked] };
}
