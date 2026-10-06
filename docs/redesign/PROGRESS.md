# Redesign progress

One section per phase, added when the phase's PR merges. See [README.md](README.md) for the plan and the per-screen design. The brief's rules apply to every phase:
- Rebuild, don't restyle; no screen may be mappable 1:1 to Legacy.
- Build on shadcn/ui.
- Animation throughout.
- Every workflow, permission and API stays as it is.

## Phase 3: Home and Inbox (plus the shadcn foundation)

### What was rebuilt

**Foundation (used by every later phase)**
- **Theme:** shadcn/ui CSS-variable theming. `index.css` gains the shadcn semantic tokens (`background`, `foreground`, `card`, `popover`, `muted`, `border`, `input`, `ring`, `destructive`, `chart-1..5`). `modern.css` sets them per theme.
- **`modern.css` cleanup:** the global "reskin" overrides from #27 are gone. What's left is the theme, motion keyframes, and an *interim* block scoped to `.m-legacy`. That block only touches Legacy pages that are still shown inside the Modern shell, never a rebuilt page, and it's deleted in phase 9.
- **Kit additions** (shadcn source mapped to our tokens):
  - Avatar, Switch, Checkbox, RadioGroup, Radix Select, Progress, ToggleGroup, ScrollArea, Accordion, Collapsible.
  - Command and CommandDialog (cmdk).
  - Chart: `ChartContainer` + `ChartTooltipContent` over recharts.
  - Sonner `Toaster`. In Modern, `notify()` now shows Sonner toasts.
- **Page compositions** (`src/modern/ui/page.tsx`): `Page` (1200px max width), `PageHeader` (one per page: eyebrow, title, description, actions), `Section` (heading + hairline), `EmptyState`, `Stat`.
- **Motion** (`src/modern/ui/motion.tsx`): `Reveal`, `Stagger`/`StaggerItem` on motion/react.
  - Route changes cross-fade.
  - The shell's `MotionConfig reducedMotion="user"` and the CSS reduced-motion block turn everything off for users who ask.
- **`ByMode`:** every route renders its Modern page when one exists. Otherwise it renders the Legacy page inside the interim `.m-legacy` frame.
- **⌘K:** rebuilt on the canonical shadcn `CommandDialog`.
- **Shared logic extracted (Legacy now uses the same code; no behavior change):**
  - `useSelfReport`: check-in, from MyStatusStrip.
  - `useMyWork`: my tasks, my attendance stats, task toggle, from StudentDashboardView.
  - `buildAttendanceSeries`: the trend data.
  - `notifMeta` / `notificationTarget`: notification helpers.

**Home (`/dashboard`)**: one page for admins and members.
- **Header:** date eyebrow, greeting, team line. The **check-in control** (I'm here / Late / Out) sits in the header; Out opens a Dialog for the reason. **Ask Bruno ⌘J** sits next to it.
- **Needs attention:** one list for your missing check-in, overdue tasks, unread mentions and unfinished setup steps. Each row is one full-width action (≥44px touch target).
- **Admins, Team pulse:** a three-figure stat row (checked in, open tasks, budget; numbers count up), then a shadcn area chart that draws in, marks the next meet and pulses today's point.
- **Members, My work:** stats (open / overdue / attendance %), plus tasks with a checkbox. It uses the same done flow as before, which opens the completion dialog.
- **Activity:** a vertical timeline with links.
- **Right rail:**
  - This week (agenda).
  - Season: FTC OPR plus Team Stats / Predict links.
  - Briefing (admins): summary and attendance insights in an accordion, with Generate / Refresh.
- **Moved off Home:** the invite code is now in the workspace menu (copy) and Settings → Team (regenerate), as the plan says.

**Inbox (`/inbox`, new in Modern)**
- Full page with an Unread / All filter, grouped by day.
- Each row opens its source:
  - Mentions open the channel.
  - Task notifications now carry `task_id` and open `/tasks?task=…`.
  - Older rows say "Open in Tasks" honestly.
- A visible ⋯ menu per row (open, read/unread, delete), plus Mark all read and Clear all (confirmed).
- Rows animate in and out.
- The sidebar shows the Inbox as active with an unread count. The Inbox sheet was removed.
- **Server (additive):** task, budget and outreach notifications now store source ids in their existing `meta`.

### Screenshots (`docs/redesign/screenshots/phase3/`)
| Legacy | Modern |
|---|---|
| `home-legacy-1440-dark.jpg` | `home-modern-1440-dark.jpg`, `home-modern-1440-light.jpg`, `home-modern-390-light.jpg` |
| (bell dropdown) | `inbox-modern-1440-dark.jpg`, `inbox-modern-390-dark-empty.jpg` |

**Unrecognizable test**
- Legacy Home is a header bar plus nine stacked cards: KPI tiles, a status strip, a Bruno bar, chart / upcoming / activity / performance / summary / access-code cards.
- Modern has no header bar. Check-in and Ask Bruno live in the page header. Content is split into a list-first main column and a right rail.
- Nothing is in a card except real objects. The KPI tiles are gone (a stat row instead), and the invite-code card is gone (moved).
- Nothing maps 1:1.

### Tests
- **Unit:** 21 modern tests pass.
  - Admin vs member sections.
  - Needs-attention rows.
  - Check-in posts the same `/api/attendance/batch` body as Legacy.
  - **Absence-reason draft survives a remount (mode switch).**
  - Inbox: filter, open → mark read + navigate to the source, bulk actions, empty state.
  - Plus the earlier mode, draft and nav tests.
- **Legacy:** the dashboard tests (21) still pass after the logic extraction. `tsc` is clean.
- **Interaction, local:**
  - Check in → status chip + pulse 1/1 + activity row → Undo restores the control.
  - Inbox ⋯ menu opens; opening a task notification goes to `/tasks?task=3`.
  - ⌘K opens the shadcn CommandDialog.
- **Mobile, 390×844:** no horizontal overflow; every interactive element is ≥44px tall (checked in the DOM); the bottom nav doesn't cover content.
- **Themes:** dark and light checked at 1440. Light at 390. Dark Inbox at 390.
- **Permissions:**
  - Team pulse and Briefing only render for `isAdmin`, the same split as the Legacy admin/student dashboards.
  - Inbox only shows the user's own notifications (same endpoint).
- **Data integrity:** Home numbers match Legacy for the same account (members, open/overdue tasks, budget, the next event).
- **Not done / limits:**
  - No physical phone was available, so PWA install, notch and keyboard behavior were checked in mobile emulation only.
  - The 768px tablet capture is still to do, and the Legacy-vs-Modern light comparison is still to do.
  - The AI briefing can't be generated locally (no AI key), so only its error and empty states were seen.

## Phase 4a: Tasks

### What was rebuilt
**Shared logic:** `useTasksController` (`src/components/tasks/`) holds all Tasks state and handlers, taken verbatim from `TasksView`: create/edit, bulk import, Bruno quick-add, status moves (Done → proof dialog), delete, filters and analytics data.
- Legacy `TasksView` now uses it too. Its JSX is unchanged.
- The open editor, its fields and the bulk-paste text are kept in the **shared draft store**, so an open, half-written task survives a Legacy↔Modern switch.
- *Legacy side effect, intentional:* navigating away from Tasks and back with the editor open reopens it with your text.

**Modern Tasks (`/tasks`):**
- **Header:** title with open / overdue / done counts. **New task** is a split button whose menu has "Paste a list with Bruno".
- **Toolbar:** search, an assignee filter (Everyone / Assigned to me / person), a team filter when there are multiple teams, and a **Board / List / Insights** view switch.
- **Board:** three lanes with counts.
  - Cards show the title, a due chip (red when overdue), a Board badge, and an assignee avatar stack.
  - **Drag a card to another lane** to move it. Card moves are animated with layout springs.
  - On phones the lanes become a horizontal snap carousel.
  - Each lane has a "+" button (managers).
- **List:** a table sorted by status then due date, with an inline status Select on each row.
- **Insights:** a stat row (open, done this week, average days to done; numbers count up), a shadcn area chart of completions per day, and stacked bars of workload by person.
- **Task sheet** (right sheet; bottom sheet on phones):
  - Status ToggleGroup: moving to Done opens the proof dialog, exactly like Legacy.
  - Assignees, due date, completed time, description.
  - Edit and Delete for managers only.
- **Editor sheet:** Bruno quick-add (single result fills the form; several show a pick-list), title, description, team, assignees (shadcn Popover + Command multi-select with avatars), due date, and a Board toggle for admins.
- **Bulk import dialog:** paste text → editable table of title, description, status, assignee and due date → save all.
- **Proof-of-completion dialog:** rebuilt on the kit, with paste or pick photos.
- **Deep links:** `/tasks?task=ID` (from Inbox) opens that task's sheet.

**Kit:** `Label`, `Badge`, `Card`, `Input` and `Textarea` now follow shadcn styling. Legacy `Input` keeps its original markup.

### Permissions (unchanged)
- Create, edit, delete and bulk import need the `tasks` scope.
- Status moves are open to everyone (the server enforces its own rules).
- Board tasks are visible only with the `admin` scope.

### Tests
- **New (10 Modern Tasks tests):**
  - Lanes and counts; board tasks only for admins.
  - The sheet's status change sends the same `PATCH /api/tasks/:id {status}`.
  - Done asks for proof instead of PATCHing.
  - Members can't create or edit but can open tasks.
  - **A half-written new task survives a remount.**
  - Create sends the same POST body as Legacy (`is_board: 0`, default team).
  - Search filters the board.
  - The deep link opens the task.
- **Legacy:** the Tasks deep-link tests (manager → editor, member → no editor) pass on the shared controller.
- **Totals:** 528 tests pass; the only failures are the known Windows-only ones. `tsc` is clean.
- **Local interaction:** opened a task sheet; opened the New task sheet on a phone (bottom sheet, focus on quick add).
- **Phone (390×844):** no overflow, every target ≥44px, full-width search, snapping lanes.
- **Screenshot limit:** the browser pane runs at 125% display scaling, so desktop captures are cropped to the pane's visible slice (`tasks-modern-desktop-dark.jpg`, `tasks-modern-sheet-dark.jpg`). Desktop layout was verified with DOM geometry (no overflow at 1440).

## Phase 4b — Calendar

**Shared logic:** `src/components/calendar/useCalendarController.ts` now holds everything that was inside Legacy `CalendarView`: the same `POST /api/events`, `PATCH /api/events/:id` and `DELETE /api/events/:id` requests, optimistic updates with rollback, Bruno quick-add (one event fills the form; several can be created together through `applyActionProposals`), and the "finished" / "upcoming" rules. Legacy `CalendarView` uses the controller with its markup unchanged. The right-click delete now uses the shared optimistic delete, with an error toast if it fails.

**Drafts:** the editor's open state, the event being edited, the form, the Bruno text, its proposals and the quick-add panel state all live in the draft store (`calendar:*` keys). A half-written event survives a Legacy ↔ Modern switch. The draft is cleared when the editor closes, which is also the moment the optimistic save starts, so a late save can never wipe a newer draft.

### Modern Calendar (`src/modern/pages/calendar/`)
- **Header:**
  - The title is the month (or the week range, using the locale's `formatRange`, e.g. "Oct 4 – 10, 2026").
  - **New event** appears for calendar managers only.
- **Toolbar:**
  - A previous / Today / next stepper.
  - A **Month / Week / Agenda** switch. Agenda is the default on phones.
  - A multi-select **type filter** that doubles as the colour legend.
- **Month:**
  - Every day is a button. It selects the day, and the right rail lists that day's events, with **Add** for managers.
  - From `xl` up, days show event chips and a **"+N more"** popover. Narrower grids show coloured dots instead.
  - Days outside the month are shaded. Today has an accent ring.
- **Week:** seven day columns with time and title blocks. Each column has an Add button for managers. On phones the columns stack.
- **Agenda:** the month's days that have events, with large date markers. Past days are dimmed and finished events are struck through.
- **Next up:** the next eight unfinished events. It is hidden in phone Agenda, where it would duplicate the list.
- **Event sheet:** opens for **everyone**. It shows type, date, time, location, team and notes. Edit and Delete appear only for the `calendar` scope.
  - This fixes a Legacy bug where members clicking "Upcoming" opened the manager editor.
- **Editor sheet:**
  - Bruno quick-add comes first. ⌘/Ctrl+Enter parses; several results show a removable list and **Create all N events**.
  - Then title, a type toggle, date, start and end time, team, location and notes.
- **Type colours come from tokens:**
  - meeting = `info`
  - competition = `chart-4` (violet, so it never clashes with a team's accent)
  - deadline = `warning`
  - social = `success`
  - other = `muted`
- **Dates and times use the browser locale.**
- **Motion:** month and week steps slide in the direction of travel, and Agenda rows nudge on hover. All of it honours reduced motion through the shell's `MotionConfig`.

### Permissions (unchanged)
- Create, edit and delete need `hasScope('calendar')`. Everyone can view.

### Tests
- **New (8 Modern Calendar tests):**
  - Members get read-only sheets.
  - Create sends the **same POST body as Legacy**.
  - Edit sends `PATCH`.
  - Delete waits for confirmation and then sends `DELETE`. A cancelled delete sends nothing.
  - **A half-written event survives a remount.**
  - Bruno: a single result fills the form, and several results are created together through `applyActionProposals`.
  - The Month / Week / Agenda switch works.
  - The type filter works.
- **Totals:** 546 tests pass; the only failures are the known Windows-only ones (migration runner, taskCompletion, the fileStore timeout, ftcCache). `tsc` is clean.
- **Local QA** on the test account:
  - Created a Competition event through the sheet and it showed up immediately.
  - Week label and layout checked at 1440 in light mode.
  - 768: dots grid with no overflow.
  - 375: Agenda default, bottom event sheet, no horizontal scroll, every target ≥44px.
- **No real phone** was available; the PWA layout was checked only with mobile emulation.
- **Screenshots:** `docs/redesign/screenshots/phase4/calendar-*.jpg`.
