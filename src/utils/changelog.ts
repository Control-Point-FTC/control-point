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
    version: '2.1.0',
    date: '2026-10-08',
    title: 'Repeating events, reviews and bulk select',
    added: [
      'Repeating calendar events: every day, week, 2 weeks or month, ending after a number of times or on a date. Edit or delete just one, this and the following ones, or the whole series',
      'Event reminders, from 10 minutes to 2 days before: everyone on the team gets a notification in their Inbox',
      'Subscribe to the team calendar from Google, Apple or Outlook: Calendar → Subscribe gives you a private link, and new events show up on their own',
      'Select many at once on every list (tasks, inventory, budget, CAD parts, outreach, communication, resources, members, attendance): select all, shift-click a range, then move, assign, change category or delete in one go',
      'Task priority (low to urgent) and repeating tasks: finishing one schedules the next',
      'Done tasks wait for a manager’s review: approve, or send back with a note so the assignees know what to fix',
      'Tasks → Completed: everything awaiting review or approved, with bulk Approve',
      'Leave or delete a workspace from Settings → Workspace',
      'A New task button that is always on the dashboard',
    ],
    improved: [
      'Quick-add understands times (4:30pm, noon, 3-5pm), priority, "every week" and "assign to Arnav", and puts each one in its own field instead of the description',
      'Task cards count down live when they are due within a week or overdue',
      'Move around the task board with the keyboard: arrows between cards, Shift + arrows to move a card',
      'The month calendar is easier to use on phones, and the "+ Add" on each day looks like a button',
      'Right-click now works on attendance rows, the conversation list and resource links',
      'The verify screen says when a sign-up email didn’t send, with a tip to check spam',
      'New roles start with Bruno (AI) turned off; turn it on per role',
    ],
    fixed: [
      'Deleting a workspace failed when it had QR check-ins, CAD files or call history',
      '"Today" in quick-add was a day late for evening entries in US time zones',
      'Editing one field of an inventory item or CAD part blanked the others',
      'Forms could be saved with required fields empty',
      'Budget notifications showed "$$" before the amount',
      'People who hadn’t verified their email showed up in the member list and attendance',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-10-06',
    title: 'Control Point, redesigned',
    added: [
      'A brand-new Modern experience, now the default: a calmer sidebar, ⌘K search and an Inbox for everything that needs you',
      'Every page rebuilt: Home, Tasks, Calendar, Attendance, People, Settings, Messages, Communication, Bruno, Team Stats, Predict, Budget, Inventory, Outreach, Resources, CAD, Code and the Owner console',
      'Bruno docks beside any page (⌘J) and shows its thinking steps; Stop ends a reply and keeps what it wrote',
      'New landing page and sign-in screens, a guided first-run setup, and a fresh interactive tour',
      'Pick Modern or Classic during setup, from the account menu or in Settings → Appearance; your choice follows you to every device',
      'Smooth animations throughout (turned off when your device asks for reduced motion)',
      'Refreshed emails, with a separate password-reset email and an "Open your tasks" button on task emails',
    ],
    improved: [
      'Unsent text survives switching looks: drafts, half-filled forms and in-progress saves carry over',
      'Phones get full-width sheets, bottom tabs and tap targets of at least 44 px',
      'Charts share one style and animate their numbers',
    ],
    fixed: [
      'Many race conditions where a slow save or reply could overwrite newer work',
      'Copying a resource link or your workspace access code works on plain-HTTP local networks and says when it fails',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-10-06',
    title: 'Predict (beta) + email-style threads',
    added: [
      'Predict (beta) under Compete: your odds of advancing at each event, simulated from every team’s match history',
      'Predict alliance scenarios: "Who should we pick?" for captains, "Best captains for us" if you’re likely to be picked',
      'Predict field and match views: every team’s odds and every upcoming match with predicted scores',
      '"How accurate is this?" — see how the predictions scored on real past events',
      'Communication Log threads: log replies so each contact becomes an email-style chain',
      'Team Stats and Predict buttons on the dashboard’s Team Performance card',
      'Admins can generate a new invite code from Settings → Team',
    ],
    improved: [
      'Brighter, full-size app icon for the browser tab, home screen and installed app',
      'Appearance settings use the whole screen, with the live preview beside the controls',
      'One FTC team number field in team settings (no more asking twice)',
      'Attendance chart: clearer grid lines, the next meeting marked, and today highlighted with a dot',
      'Attendance table grid lines are easier to see',
      'Settings gear in the sidebar user card',
      'Beta tags are now blue',
    ],
    fixed: [
      'Predict cards are solid instead of see-through',
      'The percentage and label in the Predict odds ring no longer overlap',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-10-05',
    title: 'Mini FTC Scout + Owner controls + Polish',
    added: [
      'Compete tab: deep-dive team performance — full match history with alliance scores, penalties, and point breakdowns',
      'Analyze tab: search any team or event and get Bruno’s scouting priorities',
      'Event field rankings: every team at an event, sortable by OPR/rank, tap any row for full detail',
      'Scouting shortlist: save and organize teams you\'re watching for alliance selection',
      'Bruno AI now knows what you\'re looking at — asks smarter questions in Analyze mode',
      'Owner portal: move users between workspaces silently (no notification sent)',
      'Live dashboard preview in Appearance settings — see theme changes in real time, expandable',
      'All emails now share the same polished template (OTP, task assignments, and future emails)',
    ],
    improved: [
      'Bruno AI colors fixed in light mode — readable everywhere now',
      'All dropdowns replaced with custom themed menus (no more boxy native Windows dropdowns)',
      'Appearance sliders: click any value to type it directly, snaps to valid steps',
      'One signature logo everywhere: hexagon favicon, app icons, and logo unified',
      'Dashboard preview shows live grid effects as you customize',
      'Moved users get the destination workspace\'s default Member role automatically',
    ],
    fixed: [
      'Concurrent workspace moves can\'t strand a team without an admin',
      'Moving a user with an existing account in the target workspace is blocked with a clear message',
      'Preview panel no longer squeezes settings on smaller screens',
      'Network errors during user moves show clear inline feedback',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-05',
    title: 'Bruno AI upgrades + FTC data overhaul',
    added: [
      'Bruno AI can now read PDF attachments (up to 5 per message — great for invoices)',
      'Bruno AI supports up to 5 images per message',
      'AI quick-add on task creation — describe it, Bruno fills the form',
      'FTC data now comes from the official FIRST Events API (fresher data, quicker updates)',
      '2026–27 BIOBUZZ season in Team Stats',
      'Clickable event history — tap any event for full match breakdowns (quals + playoffs, alliances, scores)',
      'Ask Bruno to scout teams: "who should we pair with for this event?" or "how is team 23375 doing?"',
      'Event-wide scouting — Bruno ranks the field by event standings, or by OPR (up to 40 teams) before rankings exist',
      'Channel renaming for admins (text + voice channels)',
      'Download button in the 3D model viewer',
    ],
    improved: [
      'Team Stats shows data source (Live via FIRST / FTC Scout / Cached) with last-updated time',
      'Event placement badges: gold/silver/bronze for 1st/2nd/3rd',
      'OPR tiles now show percentile ranks',
      'Team header shows sponsors',
      'Bruno logo consistent between sidebar and chat header',
      'Settings icon is now a crosshair (matches the app aesthetic)',
      'Control Point logo is now the browser tab icon',
      'Mobile chat header fixed (no more duplicate #)',
    ],
    fixed: [
      '3D viewer now authenticates correctly when loading models',
      'Snapshot delete errors show the real reason instead of a generic message',
      'Popups and dropdowns reliably close when clicking outside',
    ],
  },
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

export const CURRENT_VERSION = CHANGELOG[0].version;
