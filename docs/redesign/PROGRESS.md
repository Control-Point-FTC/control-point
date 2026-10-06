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

## Phase 4c: Attendance

**Shared logic** lives in `src/components/attendance/`:
- **`useAttendanceController`:** the grid, meeting days (hidden dates), sessions and summary. It uses the same endpoints and request bodies as before: `POST /api/attendance/batch`, `/api/hidden-dates` (plus `bulk` and `bulk-delete`), `/api/attendance/sessions` and `/api/attendance/summary`.
- **`useQrSession`:** starts and stops the QR session and runs the countdown.
- **`useStudentCheckin`:** checks in by scanned token or by the day code. The typed code is **drafted**.
- **`useQrScanner`:** camera scanning. The scanner logic was moved out of App.tsx.
- Legacy `AttendanceView`, `QrSessionPanel`, `StudentCheckinView` and `QrScannerModal` now use these hooks, with their markup unchanged.

**Behaviour fixes made during the extraction (both modes):**
- **Optimistic cells are now keyed per member and date.** Before, they were keyed per member, so a second click on another date for the same member overwrote the first cell's pending value.
- **A failed save now rolls the cell back.** Before, it kept showing the unsaved value.
- **Confirmed optimistic values are dropped** once the server data agrees.
- **Student check-in no longer shows an error after a successful check-in.** Legacy never passed `refresh` to `StudentCheckinView`, so `refresh.attendance()` threw and showed an error toast after a successful check-in.
- **Legacy shows the drafted day code.** The code field now opens by itself when a drafted code exists.

### Modern Attendance (`src/modern/pages/attendance/`)
- **Admins** (`attendance` scope) get four tabs: **Today / Grid / History / Insights**.
  - **Today:**
    - A **roll call**: every member gets a P/L/E/U/S picker, and tapping the current status clears it.
    - A **QR check-in card**: session length toggle, live pulse, QR, day code, countdown, **Present** (a full-screen dialog for projectors), and End session.
    - A "here today" meter with per-status counts.
  - **Grid:**
    - Cells are buttons. Click or Enter opens a **popover status picker**, with focus on the current status.
    - With a cell focused, **P/L/E/U/S** set the status directly, **Backspace** clears it, and the **arrow keys** move between cells (roving tab stop).
    - Each column header has a menu with "Hide this date".
    - A **Meeting days** dropdown has one checkbox per weekday, plus show-all and hide-all.
    - A live Saving / Saved status.
    - Sticky member column with avatars.
  - **History:** each day has a present/late bar. Clicking a day opens a **sheet** where any status for that day can be changed.
  - **Insights:**
    - The shared check-ins area chart (`modern/ui/AttendanceArea`, now also used by Home).
    - Average rate and a "below 60%" count.
    - Bruno's analysis, with a shimmer while thinking.
    - Per-member table: rate bar (amber below 60%), P · A · L · E counts, last-5 dots.
- **Members** get a personal view:
  - A check-in card with a **Scan QR** dialog (camera) and a **day-code** field. The code is drafted.
  - A spring "You're checked in" state.
  - Stats: rate, streak, days checked in.
  - History grouped by month.
- **Status colours come from tokens:**
  - P = success
  - L = warning
  - E = info
  - U = destructive
  - S = chart-4
- **Dates use the browser locale.** The grid's range label keeps the Legacy format.

### Permissions (unchanged)
- The grid, QR sessions, meeting days and the history edit all need `hasScope('attendance')`. Everyone else sees the personal view.

### Tests
- **New (9 Modern Attendance tests):**
  - Roll call sends the **same batch POST as Legacy**, and clearing sends `status: null`.
  - A failed save rolls back with the Legacy error toast.
  - Grid keyboard entry.
  - The meeting-days weekday toggle sends one bulk request, with only Sundays.
  - A QR session starts with the chosen length.
  - The history sheet edits a day.
  - The personal view: **the drafted day code survives a remount**, code check-in refreshes without an error toast, and the stats and checked-in state are correct.
- **Totals:** 558 tests pass; the only failures are the known Windows-only ones. `tsc` is clean.
- **Local QA** on the test workspace, with six fake local members added through the API:
  - Marked statuses through the roll call.
  - Keyboard entry in the grid, and confirmed the tab stays put after saves (no remount).
  - The popover opens with focus inside.
  - 375 px: no page overflow, the grid scrolls inside its own container, every target is ≥44px, and the tabs fit once their icons are hidden.
  - 1440 px: Today, Grid and Insights.
- **Not covered:** no real phone was available for camera scanning. The scanner reuses the Legacy html5-qrcode logic unchanged.
- **Screenshots:** `docs/redesign/screenshots/phase4/attendance-*.jpg`.

## Phase 5a: People (Members, Roles, Workspaces)

**Shared logic** lives in `src/components/people/`:
- **`useMembersController`:** member add/edit/remove, password reset, and workspace create/edit.
  - Same endpoints and bodies as Legacy: `POST`/`PATCH /api/members`, `DELETE /api/members/:id`, `/api/auth/reset`, `PATCH /api/teams/:id`, and `onAddTeam`.
  - The member and workspace editors are drafted (`members:*`, `teams:*`), with a generation guard so a late save never closes a newer session.
  - **Fix:** a failed member save now shows the server's error and keeps the editor open. Before, the editor closed silently.
- **`useRolesController`:** roles, the permission catalogue, create/edit/delete, and per-member role toggles (optimistic, with rollback).
  - The role editor (which role is open, and its form) is drafted (`roles:*`).
- Legacy `TeamsView` and `RolesView` use the controllers. `RoleForm` is now controlled by the draft. Markup is unchanged.

### Modern People (`src/modern/pages/people/`)
One page with route-driven tabs: **Members** (`/teams`), **Roles** (`/roles`) and **Workspaces** (`/teams?tab=workspaces`). Both existing nav entries still land on the right tab.

- **Members:**
  - Search across names, emails, titles and roles, plus All / Online / Board filters.
  - Rows are sorted by presence, with presence dots, You and Board badges, and role chips.
  - Each row has an action menu: voice or video call (the same public team call), email, copy ID, manage roles, edit, reset password, remove.
  - A **member sheet** shows roles, details and scopes, with call buttons.
  - **Editor sheet:** name, email, title, team, a Board switch, and scope checkboxes that animate in.
  - **Remove** dialog shows the server error inline.
- **Roles:**
  - Cards show a colour stripe, holder count and names, and permission badges.
  - Hover reveals edit and delete on desktop; on phones they are always visible at 44px.
  - **Role editor sheet:** name with a live colour preview, swatch radios, and permission switches.
  - **Manage roles:** a Command list with search and checkmarks.
  - Without `manage_roles` the tab is read-only, with a note.
- **Workspaces:**
  - Cards show initials in the team accent, member count, and a **copyable join code**.
  - Actions: switch, edit or delete (admins), leave (others), and a "New workspace" tile.
  - The editor dialog shows number and accent only when editing, because create sends only the name, as in Legacy.

### Permissions
- Add, edit, remove, password reset and workspace edit/delete need the `admin` scope. This matches the server.
  - Legacy showed "Add Member" to everyone and the server then rejected it; Modern hides it.
- Role editing needs `manage_roles`, the same permission the Roles nav item requires.

### Tests
- **New (10 Modern People tests):**
  - Members without admin get no admin actions.
  - Calls go through the voice context.
  - Add member sends the Legacy POST body.
  - Edit member sends PATCH, and **the half-edited form survives a remount**.
  - Remove shows the server error.
  - Role assignment sends `POST /api/members/:id/roles`.
  - Role create sends the Legacy body, and **the half-written role survives a remount**.
  - System roles can't be edited, and without `manage_roles` the page is read-only.
  - Delete role waits for confirmation.
  - Workspace edit sends the Legacy PATCH body; switch and leave work.
- **Totals:** 440 frontend tests pass; the only failures are the known Windows-only ftcCache ones. `tsc` is clean.
- **Local QA:**
  - 1440 px: Members.
  - 375 px: Roles and Workspaces, with no overflow, every target ≥44px, and the tabs fitting once their icons are hidden.
- **Screenshots:** `docs/redesign/screenshots/phase5/`.

## Phase 5b: Unified Settings

**One Modern page** (`src/modern/pages/settings/`) now replaces the Settings modal, `/profile` and `/settings` in Modern mode. Sections are addressed by `?section=`.

**Navigation:**
- Modern entry points open the page instead of the modal: the user menu, the workspace switcher, ⌘K "Settings", the call bar and the voice controls. They all go through one `openSettings()`, which still opens the modal in Legacy.
- `/profile` redirects to `?section=profile`.
- "Connect your FTC team" deep links now go to `?section=workspace` (Legacy ignores the query).
- The Google OAuth return (`?cal_linked=1`) lands on Workspace.

**Sections:**
- **Profile**
  - Picture upload and remove (same endpoints as the modal).
  - Display name (validated), title, and the **personal accent** with live preview. The accent was only in Legacy `/profile` before.
  - Status picker.
  - Account facts: email, account type, scopes.
  - Volt & Carbon theme reset.
  - The details form is **drafted** (`settings:profile:<id>`), with Unsaved / Discard / Saved states. Save sends `PATCH /api/profile {name, role, accent_color}`.
- **Appearance**
  - Interface mode (shared picker), theme, and language (Select).
  - The Legacy background effects (grid, pulse, glow) sit in a collapsible on new shadcn Sliders. Their logic moved into the shared `useGridSettings` hook, which the modal now uses too.
- **Calls & sounds**
  - Sounds switch and camera default.
  - The device panel is reused for now; it gets rebuilt with calls in phase 6.
- **Bruno AI**
  - Teaching mode and answer length (member row, optimistic with revert).
  - Explanation, format and behaviour switches.
  - FTC coding preferences.
  - The NavGPT ❤️ persona for qualifying admins.
  - Same localStorage keys and endpoints as before, via a shared `components/settings/prefs.ts`.
- **Account & privacy**
  - Password change. Passwords are deliberately **not** drafted, for security.
  - Download my data, and cookie settings.
  - Delete account. It is disabled while you belong to a workspace; otherwise it asks you to type your email, then confirms.
- **Workspace**
  - Team name plus FTC number, with **Verify** (FTC Scout lookup). This merges the modal's team tab and `/settings`' FTC card. Save sends the modal's body. The form is drafted.
  - Invite code: copy, and regenerate with a two-step confirm.
  - Roles link and the workspace default interface.
  - Google Calendar: link or unlink, and team sync for `manage_calendar` / President.
  - Members see the team details read-only.
- **Admin** (admins, the owner, or `manage_voice`)
  - Calls policy (reused panel, phase 6).
  - AI absence criteria (drafted).
  - AI limits and provider (owner only, drafted).
  - Storage usage.
  - Message moderation: edit, or silently delete (optimistic, with rollback).
  - The President's "admin delegation" table (board flag and scopes) is covered by People → edit member, which sends the same `PATCH /api/members/:id`.

**Kit changes:**
- New shadcn `Slider`.
- `Switch` now has an invisible 44 px hit area, which fixes every page's switches on phones.

### Tests
- **New (8 Settings tests):**
  - Profile PATCH body and **draft survival across a remount**.
  - Name validation and status pick.
  - Password mismatch, then the same change-password request.
  - Delete-account gating and email confirmation.
  - Bruno teach-mode body and the localStorage style.
  - Workspace verify, the Legacy team PATCH body, and two-step code regeneration.
  - Members see read-only fields and no Admin section.
  - Admin: drafted criteria, owner-only AI limits, message delete, and storage size.
- **Totals:** 449 frontend tests pass; the only failures are the known Windows-only ftcCache ones. `tsc` is clean.
- **Local QA at 375 px**, every section:
  - Found and fixed a grid-column blow-out from the chip row (content was clipped at 963 px).
  - Found and fixed the active chip scrolling out of view.
  - Found and fixed the top bar saying "Team Settings".
  - No overflow afterwards.
- **Screenshots:** `docs/redesign/screenshots/phase5/settings-*.jpg`.
## Phase 6a: Bruno page

**Shared logic:** `src/components/bruno/useBrunoConversation.ts` holds everything that was inside Legacy `BrunoView`:
- Chat list paging, opening a chat, and creating one on first send.
- Streaming through `streamBuildHelper` (40 ms batching).
- Proposal confirm via `applyActionProposals` + `notifyBrunoDataChanged`.
- The NavGPT → Bruno handoff.
- Rename, share and delete.
- The panel's "expand" chat id, carried in route state.

Legacy `BrunoView` uses the hook with its markup unchanged.

The `wip/bruno-thinking` work is folded in, with its gaps closed:
- **Honest thinking steps.** They list only what Bruno is actually given (the page, attachments, scouting data, the conversation). After the reply they collapse to "Thought for Ns".
- **Streaming caret.**
- **Stop** (an AbortSignal through `postStream`). It keeps the partial text and appends "_Stopped._".
- The NavGPT handoff now gets thinking steps and Stop too; the WIP branch skipped it.
- The "Thinking" label's shimmer class now matches the stylesheet (`cp-shimmer-text`).
- The composer text is **drafted** (`bruno:input`).

### Modern Bruno (`src/modern/pages/bruno/`)
- **Layout:** full height (immersive), with a history rail.
  - The rail has **New chat**, chat search, and "Yours" / "Shared by the team" groups, plus "Show older chats".
  - On phones the rail becomes a left sheet.
- **Header:**
  - Chat title and privacy.
  - For owners: a Share switch and a menu with Rename, Share and Delete.
  - Admins can delete others' chats, as before.
- **Empty state:** "What are we working on?", with three starter groups (Do it for me / Code / Build & strategy) and "More ideas".
- **Conversation:**
  - User turns are right-aligned. Bruno's replies are plain prose next to an avatar.
  - Action proposals use a rebuilt card that keeps the same wording, via the exported `KIND_META` / `itemSummary`.
  - Live replies show thinking steps, then streamed text with a caret.
- **Composer:** auto-growing, with screenshot and PDF attach, paste-to-attach, Enter to send (Shift+Enter for a new line), and Send / Stop.
- **Shell:** immersive pages now get `min-h-0`, so they scroll internally.

### Not in this PR
The ⌘J side panel (`BrunoPanel`) is shared by both modes and still uses the Legacy look. Its Modern rebuild is phase 6b.

### Tests
- **New (5 Modern Bruno tests):**
  - Starting a chat creates it (POST), then streams and shows the reply.
  - **Stop** aborts the reply and keeps the partial text.
  - **A half-typed message survives a remount.**
  - A proposal confirm goes through apply-actions and refreshes the affected data.
  - Owners get share, rename and delete; others read only.
- Like the real server, the mock server stores each chat's history, so the tests are deterministic under load.
- **Totals:** 445 frontend tests pass; the only failures are the known Windows-only ftcCache ones. `tsc` is clean.
- **Local QA:**
  - 1440 px: the empty state, and a live send. The server error ("AI not configured" locally) is shown.
  - 375 px: no overflow, every target ≥44 px, the composer sits above the tab bar, and the middle scrolls.

## Phase 6b: Bruno side panel (⌘J)

**Shared logic:** `src/components/bruno/useBrunoPanelChat.ts` holds all of `BrunoPanel`'s behaviour:
- Lazy chat creation, throttled streaming (90 ms), thinking steps and Stop.
- Proposals.
- Analyze mode (the scouting context), page-aware rotating starters, and queued "Scout with Bruno" prompts.
- The output-length picker (now one save at a time).
- Escape to close, and the expand-to-chat id.

Legacy `BrunoPanel` uses the hook with its markup unchanged.

**The conversation survives a mode switch.** Messages, chat id, composer text, proposal and thinking state, and the busy flag live in the draft store. The in-flight AbortController is module-scoped. So switching between Legacy and Modern with the panel open keeps the conversation, and a reply that is still streaming keeps going and can still be stopped.

### Modern dock (`src/modern/BrunoDock.tsx`)
`BrunoPanelSwitch` renders the dock in Modern and `BrunoPanel` in Legacy. The dock keeps the same docking behaviour: it pushes the page aside on desktop and overlays it on phones.
- **Header:** avatar, name, Analyze-mode badge, and icon actions with tooltips (New chat, Open full Bruno, Close).
- **Toolbar:** an "answer length" dropdown with checkmarks, and a Resources dropdown (GM0, FTC Docs, REV Docs, Game & Season).
- **Body:** the greeting card and "Try one" starters with refresh. Replies reuse the Bruno page's parts: live thinking → streamed text with a caret → a finished reply with "Thought for Ns", and the proposal card.
- **Composer:** the same as the page, with attachments, paste and Stop.
- It brings its own `TooltipProvider`, since it renders outside the shell.

### Tests
- **New (5 dock tests):**
  - A fresh chat streams and reports its id for expand.
  - **The conversation is kept when the interface switches Modern → Legacy.**
  - Stop keeps the partial reply.
  - Answer length sends the same profile PATCH.
  - A queued "Scout with Bruno" prompt sends, and Escape closes.
- **Totals:** Modern suite green, plus the existing Legacy panel tests. `tsc` is clean.
- **Local QA:** ⌘J on Tasks at 1440 px docks the panel beside the page.
- **Screenshot:** `docs/redesign/screenshots/phase6/bruno-dock-1440-dark.jpg`.

## Phase 6c: Messages

**Shared logic:** `src/components/chat/useChatController.ts` holds `ChatView`'s state and handlers, moved mechanically. Every name `ChatView` declared is returned, so the Legacy JSX is untouched. It covers:
- Optimistic socket sends, reconciled by `client_id`.
- File upload (10 MB limit, paste and drop).
- Mentions: `@Name` → `@[Name]`, plus `@everyone` and `@here`.
- Reply, forward, copy and delete (optimistic, with rollback).
- Reactions and the reaction picker.
- Paging with the `before=` cursor.
- Collapsed categories.
- Admin actions: create, rename, move and drag-to-category for channels; create and rename for categories; and a `togglePostRestricted` with the same PATCH as Legacy's inline menu.

The composer text and the pending file stay drafted. Pure formatters (mention pills, linkify, first URL, day dividers, file size) live in `components/chat/chatFormat.tsx`.

### Modern Messages (`src/modern/pages/messages/`)
Three panes (channels · conversation · people). On phones the side panes become sheets.
- **Channels:**
  - A workspace switcher, and an admin "+" menu for a new channel or category.
  - Collapsible categories; channel rows with a lock for admin-only posting.
  - Admin menus. Channels: rename inline, Move to (submenu), Admin-only posting, Delete (not `#general`). Categories: new channel here, rename, delete.
  - Drag a channel onto a category.
  - Voice channels below.
- **Conversation:**
  - Header with the channel name and topic, and a people toggle.
  - "Load older messages".
  - Sticky day pills.
  - **Grouped runs:** consecutive messages from one sender within 5 minutes share one avatar and name; hovering a grouped line shows its time.
  - Reply quotes jump to the original. Forwarded labels, mention pills and links.
  - Images with a "no longer available" fallback; file cards.
  - Rebuilt link-preview cards (same `/api/link-preview`).
  - Reactions.
  - A floating action bar (React · Reply · Forward · Copy · Delete) on hover, keyboard focus, or tap on touch devices.
  - A "Drop to attach" overlay.
- **Composer:**
  - An @-mention suggestion list (Tab inserts the first).
  - Reply banner and attachment preview chip.
  - Auto-growing input, paperclip, Send.
  - In admin-only channels, members see an "Only admins can post" banner instead.
- **Forward:** a Command dialog listing channels.
- **People:** online and offline lists with voice and video call buttons.

### Permissions (unchanged)
- Delete is offered for your own messages or to admins. The server now enforces this too (Control-Point-FTC/control-point#37).
- The channel and category admin menus need admin.
- The client's "can post in a restricted channel" check still uses `isAdmin`, as in Legacy; the server uses `manage_members`.

### Tests
- **New (8 Modern Messages tests):**
  - Same socket payload as Legacy, with the optimistic message.
  - Mention suggestion, Tab to insert, and `@[Name]` conversion.
  - Reply sends `reply_to_id`; forward sends `is_forwarded`, `forwarded_from` and the target channel.
  - Members can delete only their own messages (optimistic DELETE).
  - Admin-only channels block members from posting.
  - **A half-typed message survives a remount.**
  - The admin-only toggle sends the Legacy PATCH.
  - Loading older messages uses the `before=` cursor.
- **Totals:** frontend suite green apart from the known Windows-only ftcCache failures. `tsc` is clean.
- **Local QA:**
  - 1440 px three-pane layout.
  - 375 px: no overflow, every target ≥44 px.
  - A **live socket round trip** on the local server: the message appears once, as one row, confirmed by the server echo.
- **Screenshots:** `docs/redesign/screenshots/phase6/messages-*.jpg`.

## Phase 6d: Communication

**Shared logic:** `src/components/communication/useCommunicationController.ts` holds `CommunicationView`'s logic:
- Threading: roots plus replies, the chain sorted by date, threads sorted by latest activity.
- The same `POST`/`PUT`/`DELETE /api/communications` bodies.
- Optimistic delete (a root deletes its replies), with rollback.
- The right-click delete menu.
- The "did they respond?" follow-up.

Changes from Legacy:
- **Drafted forms.** The open forms (new log, reply, edit) live in the draft store.
- **No more lost edits from a late save.** A save now only clears the form it submitted, so edits made while a save is in flight are kept.

Legacy keeps its markup and the edit dialog's focus trap.

### Modern Communication (`src/modern/pages/communication/`)
- **Header:** "Conversations", with counts of threads and of those awaiting a reply. **Log message** is a split button; its menu adds "Paste it to Bruno" (BrunoQuickAdd) and "Import an email file" (EmailImport).
- **Toolbar:** search across people, subjects and text, plus All / Awaiting reply / Email / Announcements filters.
- **Thread list:** cards with recipient, subject, last line, last activity, an Awaiting reply or Replied badge, and an entry count.
- **Thread view:**
  - A timeline of entries: their messages are blue and left-aligned ("From X"); ours are neutral and right-aligned ("You / Team").
  - Hover shows edit and delete. On phones the thread opens in a bottom sheet.
  - Buttons: **Log their reply** / **Follow up**.
- **Forms:**
  - Log a message is a sheet with a type toggle, To, Subject, a datetime-local Sent field, and the message.
  - Reply and Edit are dialogs. Recipient and subject can be edited only on the first entry, as in Legacy.
  - "Did they reply?" is a dialog that opens the reply form for the new thread.
- **Permissions (unchanged):** writes need the `communications` scope; everyone can read.

### Tests
- **New (5 Modern Communication tests):**
  - Threading order and the awaiting-reply filter.
  - The log body matches Legacy, followed by the did-they-reply → reply flow (`parent_id`, `direction`).
  - Edit sends PUT; deleting a thread waits for confirm.
  - Read-only without the scope.
  - **A half-written log survives a remount.**
- **Totals:** frontend suite green apart from the known Windows-only ftcCache failures. `tsc` is clean.
- **Local QA:**
  - Logged a real message on the local test workspace, saw the "Did they reply?" prompt, and found the thread listed as "Awaiting reply".
  - 375 px: no overflow, every target ≥44 px.
- **Screenshots:** `docs/redesign/screenshots/phase6/communication-*.jpg`.

## Phase 7a: Predict

### Shared controller (`src/components/predict/usePredictController.ts`)
Legacy `PredictView` logic moved into a hook; the Legacy JSX is unchanged. Both modes now share:
- `?season=&event=` sync in both directions, the advancing-events filter (championship parents skipped), the one automatic step back to last season, and the "not connected" detection.
- The latest-wins forecast request (`load(force)`), the stale-forecast guard (a forecast only shows under its own event), team names, and Bruno's `predictSeason` / `predictEvent` context.
- Status loading on mount and whenever the accuracy sheet opens.
- `usePartners` (Alliance scenarios; the cache is bypassed only for a Refresh made while the tab is open) and `preMatchCall` (Called it / Upset / No pre-match call).

### Modern Predict (`src/modern/pages/predict/`)
- **Header:** Compete · Beta eyebrow, and "How accurate is this?" as the page action.
- **Event picker:** a season toggle plus a scrollable row of **event chips** (name, date, "upcoming"), replacing Legacy's dropdown.
- **Stage stepper:** Before the event → Quals in progress → Quals finished → Alliances selected, with animated fills. Below it: slots (estimated or official), simulations, last update, and Refresh. Phones and tablets get short labels; screen readers always hear the full ones.
- **Outlook:** a large animated chance-to-advance figure with a growing bar and the "from match results alone" comparison. Next to it, Captain / Picked / Win / Finalist stats. Below, a **seed strip** (one cell per seed: the likely range lit, the average marked) and an animated points breakdown.
- **Alliance:** ranked partner or captain cards (two columns on desktop), with "Best fit", ± points badges and growing bars.
- **Field:** a new **team search**. Desktop gets a table; phones get a list. Our team is marked "You", and prequalified teams show "Qualified".
- **Matches:** new All / Upcoming / Played filter, plus the "Only team N's matches" switch. Each row shows the red side, a win-odds split bar and the blue side; scores sit next to each side. Results carry a Called it / Upset / No pre-match call badge.
- **Accuracy:** a kit sheet (right side on desktop, bottom on phones). It shows live-season metric tiles, advancement scores per stage, back-test tiles, and a new **calibration scatter** (predicted vs actual against the diagonal).
- **States:** "warming up" (503) with Try again, "No forecast for this event" (422), other errors with Try again, and "Connect your FTC team" → `/settings?section=workspace`.
- **Assumptions:** a collapsible "What this assumes" section.

### Tests
- **New (9 Modern Predict tests):** default event and Bruno context; the stale guard when switching events; matches, results, calls and filters; field search; alliance ranking, with Refresh forcing both the forecast and the scenarios; the accuracy sheet refetching on open; advancement scores with no played calls; the 422 and 503 states; and the not-connected link.
- The 7 Legacy PredictView tests still pass on the shared controller.
- **Totals:** 471 frontend tests pass; the only failures are the 2 known Windows-only ftcCache tests. `tsc` is clean.
- **Local QA** (real local engine, team 4215, 2025–26):
  - 1440 dark: Outlook and Matches.
  - 768 light: no page overflow.
  - 390 dark: Field, Matches and the accuracy sheet. No overflow, and every target is ≥44 px (the switch uses the kit's 44 px hit area).
  - No real phone was available.
- Screenshots: `docs/redesign/screenshots/phase7/`.

## Phase 7b: Team Stats · Compete

### Shared state
- **`useTeamStats`** (`src/components/scout/useTeamStats.ts`): Compete/Analyze mode (`?mode=analyze`), the season, our team number, and the step back on a direct Analyze visit. It also handles the Compete → Analyze hand-off (`viewTeam`). Legacy `TeamStatsView` now uses it, with unchanged JSX.
- **From `CompeteView`:** `useEvents`, `OPR_COMPONENT`, `TRENDS` and `TrendKey` are exported, so Modern reuses the same data hooks (`useScoutProfile` and its empty-season rules, plus lazy event loads).

### Modern Team Stats (`src/modern/pages/stats/`)
- **Page:** Compete / Analyze tabs under the page header. Analyze still renders the Legacy view in the interim frame; it is rebuilt in 7c.
- **`TeamProfile`** (reusable for any team in 7c):
  - **Hero:** a big team number, name, school / location / rookie year / last update, a collapsible sponsors line, a season toggle, and host actions (Scout with Bruno, shortlist, pin) when the host provides them.
  - **OPR:** four buttons with animated values, world rank, a "top N%" percentile bar and a hover lift. Each opens a kit sheet with the build-up per event, a ± badge against the event average, and the component split.
  - **Trends:** a single line chart that can show any of the 8 metrics (Legacy shows 8 sparkline cards). It shows the latest value and a Rising / Falling / Steady badge, with a collapsible "Event by event" table.
  - **Event history:** a timeline rail with rank medals (gold / silver / bronze). Each event expands with an animated height and loads lazily, with Try again on failure. Inside:
    - "Against the field" bars, with the event-average marker.
    - Strength and weakness badges.
    - Qualification and playoff match rows.
    - Rankings (top 8 / all; rows open the team in Analyze).
    - Alliance selection.
    - Teammates and opponents at that event.
  - **Partners & opponents:** loaded on demand, then shown in Partners / Opponents tabs. Each row has an actions menu (View matches / View team / Scout with Bruno / shortlist / pin). "View matches" opens a sheet of the shared matches.
  - **Match sheet:** red and blue cards (winner ring, clickable teams, surrogate / DQ marks), a mirrored scoring breakdown, the score difference and source notes, and Scout with Bruno.
  - **States:** loading skeleton; "No FTC team connected" → Settings; both sources down → Retry; empty season → a friendly "No 2025–26 · DECODE data yet". A failed refresh keeps the last loaded data and shows a Retry banner.

### Tests
- **New (11 tests):**
  - Compete: hero, OPR, trend chart and timeline order (no compare UI); lazy event load, then the match breakdown; event rankings → Analyze; the OPR sheet; partners on demand, then "View matches"; stepping back from an empty season; the mode tabs.
  - TeamProfile states: empty season, Retry, not connected, and host actions (shortlist, pin, Bruno prompt).
- The Legacy scout tests still pass.
- **Totals:** 494 frontend tests pass; the only failures are the 2 known Windows-only ftcCache tests. `tsc` is clean.
- **Local QA** (real FTC data, team 4215, 2025–26):
  - Desktop: the hero, OPR and trends, and an opened Championship event. The match lists were stacked into a single column because two columns were cramped.
  - 390 px: no overflow, and every target is ≥44 px.
  - No real phone was available.

## Phase 7c: Team Stats · Analyze

### Shared logic (`src/components/scout/useAnalyze.ts`)
Legacy `AnalyzeView` keeps its JSX; its logic moved into hooks that both modes use:
- **`useAnalyzeController`:** Team detail / side-panel peek, the event picker (defaults to the reference team's upcoming or most recently played event), pins (`controlpoint-scout-pins`), recents, the workspace shortlist (`useShortlist`, with serialized optimistic writes), shortlist rules (wait for the season's list; a team already listed opens the Shortlist tab) and Bruno's scouting context and greeting.
- **`useEventField`:** latest-wins event load, filter / round / alliance colour, sort (each column has its natural first direction), and paging.
- **`useTeamSearch`:** debounced search that drops stale responses.
- **`useShortlistNotes`:** notes live in the draft store under `scout-notes:<season>:<team>`. A half-written note survives a mode switch in both modes. A newer server value replaces the draft, which is what Legacy did.

### Modern Analyze (`src/modern/pages/stats/AnalyzeWorkspace.tsx`, `ShortlistBoard.tsx`)
- **Finder card** (replaces Legacy's left rail): a large search box with a results dropdown, and quick-pick chips for Pinned / Shortlist / Recent. Below them, the season toggle and **event chips**.
- **Views:** Event field / Team detail / Shortlist tabs, plus Ask Bruno.
- **Event field:**
  - A stat header (teams, matches played, average OPR and score).
  - A filter input, plus Round and Alliance toggle groups.
  - Desktop: a kit table with `aria-sort` headers and direction arrows, rank medals, a shortlist marker, and a row that opens a peek. Phones: cards with a Sort menu.
  - Each team has an actions menu: View team, View matches, Scout with Bruno, shortlist, pin.
  - Pagination, and a data-source line.
- **Peek:** a wide side sheet with the Modern `TeamProfile` and "Open in Team detail". Team detail itself is `TeamProfile`.
- **Match sheets:** "View matches" lists that team's matches; each opens the Modern match breakdown.
- **Shortlist:**
  - A Bruno recommendations panel: scout next, and partner fits for our team.
  - Team cards with a priority toggle, a Scout next switch, drafted notes (saved on blur) and strength / weakness badges. Suggested tags are dashed chips; custom tags can be added as a strength or weakness.
  - Upcoming matches as alliance-coloured badges, with alliance text for screen readers.
- Still no compare mode, comparison table or compare action.

### Tests
- **New (8 Modern Analyze tests):**
  - The Bruno greeting and context, with no compare UI.
  - Default event, sort, filter and the alliance filter.
  - Peek → Open in Team detail.
  - Search → Team detail and recents.
  - Add to shortlist from the menu, then priority, scout-next and tags.
  - **A half-written note survives a remount and saves on blur.**
  - Pin → quick pick.
  - View matches → match breakdown.
- The Legacy scout tests and the 7b tests still pass.
- **Totals:** 502 frontend tests pass; the only failures are the 2 known Windows-only ftcCache tests. `tsc` is clean.
- **Local QA** (real FTC data, 2025–26, NJ Championship Parkway, 24 teams): the desktop finder and field table (the table scrolls inside its frame when Bruno's dock is open). At 390 px: no overflow, every target ≥44 px, and the field shows as cards. No real phone was available.

## Phase 8a: Budget and Inventory

### Shared controllers
- **`useBudgetController`** (`src/components/budget/`): extracted from Legacy `BudgetView` with unchanged JSX.
  - Same `/api/budget` POST / PATCH / DELETE bodies, optimistic delete with rollback, duplicate-as-new, right-click menu (`budget-tx`) and totals.
  - The entry form is **drafted** (`budget:open`, `budget:editing`, `budget:form`). A save closes only the form it submitted.
  - Save and delete now have separate locks (Legacy shared one).
- **`useInventoryController`** (`src/components/inventory/`): extracted from Legacy `InventoryView` with unchanged JSX.
  - Same endpoints: add, edit, optimistic delete, REV link scrape, invoice parse → review → confirm, auto-categorize.
  - The add / edit forms and the invoice review are **drafted** (`inv:*`), with the same close-only-what-you-submitted guard.
  - REV and invoice results are dropped after a sign-out or workspace switch (`inEpoch`).
  - REV fills use a functional update, so typing during the fetch isn't lost.
  - Search tolerates parts with no part number.
- Kit: `SheetFooter`.

### Modern Budget (`src/modern/pages/budget/BudgetPage.tsx`)
- **Balance hero:** an animated net balance (red when negative), income and expense figures with an income-vs-expense split bar, and a new **cash-flow-by-month** bar chart (last six months with activity).
- **"Where the money goes":** the top expense categories, with bars.
- **Transactions:** All / Income / Expenses toggle and a search box, plus a **month-grouped ledger** with sticky month headers and each month's net.
  - Each row has an in/out icon, a category badge and a signed amount (with screen-reader text), and an actions menu (Edit / Duplicate / Delete).
- **Log / edit sheet:** Income / Expense toggle, `$` amount, description, category (suggested from past categories), date and team.
- Read-only without the `budget` permission.

### Modern Inventory (`src/modern/pages/inventory/InventoryPage.tsx`)
- **Header actions:** Import invoice and Add part.
- **Stats:** parts, units on hand and inventory value (animated).
- **Finding parts:** search, Auto-categorize (shown when anything is uncategorized), a card / table layout toggle, and category chips.
- **Part cards:** name, SKU and part number, quantity on hand and location, category badge, value and an actions menu. The table layout is a dense kit table.
- **Add / edit sheet:** REV import panel (when adding), a fields grid with kit Selects for category and team, and a description.
- **Invoice review dialog:** a checkbox per line, editable name / quantity / unit price, a category select, and "Import N items".
- Read-only without the `inventory` permission.

### Tests
- **New (17 tests):**
  - Budget: hero / ledger, filters, read-only, log (POST), edit (PATCH) / duplicate / delete, delete rollback, **draft survives remount**, and a slow save that doesn't close an edited form.
  - Inventory: cards / filters, read-only, required fields + POST, REV fill, edit (PATCH) / delete, invoice parse → untick → confirm body, auto-categorize, **draft survives remount**, table layout.
- **Totals:** 514 frontend tests pass. The failures are the 2 known Windows-only ftcCache tests, plus one Bruno Stop test that is known to be flaky under full-suite load (8/8 pass on their own three times). `tsc` is clean.
- **Local QA:** with local-only seed rows (6 transactions, 6 parts) in the dev DB:
  - Desktop dark: hero, chart, ledger, part grid, add sheet.
  - 768 light: Budget.
  - 390: both pages have no overflow, and every target is ≥44 px.
  - No real phone was available.

### Review follow-ups (8a)
- **No double submits:** a form's fields freeze while it saves (the exported setters ignore edits, so Legacy is covered too). The save locks (`budget:saving`, `inv:saving`, `inv:invoice-confirming`) are drafted, so they survive a remount. Each request releases only its own lock (`inEpoch`), so an old save can't unlock a new one after a workspace switch.
- **Delete rollback:** a failed delete restores only that row, near its old spot (`restoreRow`), so a refresh from a concurrent save isn't overwritten.
- **Validation:** browser number checks stay on (`step="any"` only where decimals are fine). The controllers also check numbers in both modes: budget amounts must be greater than 0; stock must be a whole number, 0 or more; costs can't be negative.

## Phase 8b: Outreach

### Shared controller (`src/components/outreach/`)
- **`useOutreachController`:** extracted from Legacy `OutreachView`.
  - Same `/api/outreach` and `/api/outreach/social` endpoints and bodies, totals, and the TikTok OAuth result banner.
  - The Bruno AI bulk log: quick local parse, or "Parse with Bruno" via `streamBuildHelper`.
  - Optimistic delete / unlink / pin / reorder.
  - Permissions as on the server: **any member** can log, edit and delete events; channels need `manage_outreach` (`hasScope('outreach')`).
- **`parseOutreachRows`:** moved to its own module; App re-exports it for its existing tests.
- **Lessons from the 8a review, applied up front:**
  - The event form, the bulk box and their **in-flight locks are drafted**, so returning mid-save can't log twice. Fields freeze while saving, and a save closes only the form it submitted.
  - A failed delete or unlink puts back **only that row**. A failed pin flips back only that profile; Legacy's optimistic pin also wrote the wrong field.
  - Unlink now uses the app's confirm dialog instead of `window.confirm`.

### Modern Outreach (`src/modern/pages/outreach/OutreachPage.tsx`)
- **Impact strip:** events, hours, people reached and funds raised, animated.
- **Event log:** a newest-first **timeline** with calendar date tiles. Each card has an hours badge, location, description, reached / raised badges and an Edit / Delete menu; right-click works too.
- **Channels:** YouTube cards with a big subscriber count, a growth badge and an **animated trend line**, views / videos / average per video, last sync, Open, and Sync now. A manage menu offers pin, move up / down and unlink. "Link YouTube" opens a dialog.
- **Log / edit sheet:** quick-type chips, title, description, date, location, hours / attendees / funds.
- **Bruno AI sheet:** paste box, Quick parse / Parse with Bruno, row preview with remove, and "Log all N events".
- **Validation:** browser number checks stay on (minimum 0; whole hours and attendees), with `step="any"` on funds so `$12.345` rounds to cents instead of being blocked.

### Tests
- **New (10 tests):** totals and timeline order, with TikTok hidden; member vs manager rights; quick-type log with normalised numbers; title required; edit / delete with row-only rollback; quick parse → remove → log all; Parse with Bruno; pin / sync / unlink; Link YouTube; **draft survives remount** and the **save lock survives leaving and coming back**.
- The `parseOutreachRows` tests (7) still pass. `tsc` is clean.
- **Local QA** (3 local-only seeded events): desktop dark and 390 px, with no overflow and every target ≥44 px. No real phone was available.

## Phase 8c: Resources

### Shared controller (`src/components/resources/useResourcesController.ts`)
Extracted from Legacy `ResourcesView`, whose JSX is unchanged apart from Discard now calling the controller.
- **Unchanged behaviour:**
  - The page owns its list (`GET /api/resources`) and refetches on the live `resources-changed` event.
  - Bruno's link extraction (`POST /api/resources/parse`) feeds an editable preview. Unknown categories become Other, and empty titles become the domain.
  - Bulk save, and optimistic delete with row-only rollback.
- **Changes:**
  - Loading is now latest-wins.
  - A failed delete puts the link back near its old spot (it used to go to the end).
  - The paste box, the preview and the **in-flight save lock are drafted** and released only by their own epoch. The preview **freezes while saving**, and Bruno's results are dropped after a sign-out.

### Modern Resources (`src/modern/pages/resources/ResourcesPage.tsx`)
- **Header:** a saved-links count.
- **"Add links in bulk" composer:** paste → Extract links with Bruno → an editable preview (title, kit Select for category, description, remove) → Discard / Save all.
- **Library:**
  - A new **search** box and category chips with counts.
  - Link cards with a category-coloured icon tile, a clickable title, the domain, a description, a category badge and who added it / when.
  - An actions menu: Open link, a new **Copy link**, and Delete.

### Tests
- **New (6 tests):** chips / search; extract → edit → remove → save all (request body); parse error; delete with row-only rollback in its original place; live refetch; **preview survives remount** and the **save lock survives leaving and coming back**.
- The component and modern suites pass apart from the known flaky / Windows-only tests. `tsc` is clean.
- **Local QA** (5 local-only seeded links): desktop dark, and 390 px with no overflow and every target ≥44 px. Locally, Bruno extraction returns "AI not configured" as expected.

## Phase 8d: CAD

### Shared hooks (`src/components/cad/useCad.ts`)
Legacy `CadView` keeps its JSX: local aliases map onto the hooks. The only change is the part-form open / close handlers. Its constants are re-exported.
- **Hooks:** `useCadDashboard`, `useCadDocs`, `useCadReviews` (filter, the same **status rules** via `canAct` / `actionsFor`, admin delete), `useReviewForm`, `useReviewComments`, `useCadSnapshots` (delete when admin or author), `useSnapshotForm` (STEP / STL check), `useCadParts`, `usePartForm`, `useCadInvoiceImport`.
- **Same endpoints and bodies** as Legacy.
- **Lessons from the 8a–8c reviews, applied up front:**
  - **Drafts:** every form, its open state and the invoice review are drafted (the comment draft is per review).
  - **Locks:** each save holds a **drafted lock released only by its own request** (`inEpoch`), and fields freeze while saving.
  - **Parsing:** the invoice parse has a drafted busy flag and newest-wins request ids.
  - **Refresh:** lists refresh through a small **CAD event bus**, so a save that finishes after a mode switch still refreshes the mounted page.
  - **Numbers:** BOM quantities must be whole and ≥ 1, and costs can't be negative (checked in both modes).
- **`drafts.ts`:** new `deleteDraft(key)` (used to drop a finished or discarded part form).

### Modern CAD (`src/modern/pages/cad/`)
- **Tabs:** one page with route-driven kit tabs: Overview / Onshape docs / Design reviews / Snapshots / Parts list.
- **Overview:** animated stat tiles that navigate, an amber "Review queue", quick actions, and an activity timeline.
- **Docs:** an inline link form, then doc cards with an Open / Unlink menu.
- **Reviews:**
  - A status filter with counts.
  - Cards with a screenshot, status badge, section / author / date and comment count.
  - A **detail sheet** with a **workflow stepper** (Concept → In review → Approved → Built, with Changes requested in amber), the screenshot and description, Open in Onshape, the permitted moves, admin delete, and the **discussion thread with a composer**.
  - "Submit design" opens a sheet with a styled file picker.
- **Snapshots:** grouped by subsystem; preview tiles open the 3D viewer (lazy-loaded); a menu has Delete for the owner or an admin; upload happens in a sheet.
- **Parts:** a BOM summary (animated total, a **status-mix bar**, Import invoice / Add part), per-subsystem tables with subtotals and row menus, an add / edit sheet, and an **invoice review dialog** (select all, editable rows, kit selects).

### Tests
- **New (9 Modern tests):**
  - Overview navigation; docs link / unlink.
  - Review permissions: author vs other vs admin moves, delete, comments.
  - Submit design (validation, FormData, **draft survives remount**).
  - Snapshots: viewer, owner-only delete, file-type checks, upload.
  - Parts: validation, add / edit / delete; invoice parse → untick → import.
  - **A save finishing after leaving refreshes the returning page.**
- **2 Legacy CadView smoke tests** on the hooks (parts add; the review form shares the Modern draft).
- **Totals:** 529 + new tests pass; the only failures are the 2 known Windows-only ftcCache tests. `tsc` is clean.
- **Local QA** (local-only seeded docs, reviews and parts): desktop dark (overview, parts, review sheet); 390 px on all five tabs with no overflow and every target ≥44 px. No real phone was available.


## Phase 8e: Code

### Shared hooks (`src/components/code/`)
- **`useCodeController`:** extracted from Legacy `CodeView`, whose JSX is unchanged.
  - **Same behaviour:** codeService endpoints; files scoped to the active team; drafts → main commits; 3-second auto-save; paged history; compare and revert; Bruno's `codeFileId`; code-scope rules.
  - **Drafted state:** the open file, branch, **editor buffer (with its unsaved flag)**, commit message and new-file form. **Unsaved code survives a mode switch**, and a remount keeps the unsaved buffer instead of reloading the server copy.
  - **Fixes:**
    - Loads are latest-wins, and the duplicate content load on every file change is gone.
    - **Auto-save marks the buffer saved only if nothing changed while saving** (Legacy marked it saved even if you kept typing).
    - **Commit first saves unsaved edits**, so they are part of the commit (Legacy committed only what had already auto-saved).
    - The commit / create locks are drafted and released only by their own request.
- **`useGitHubRepo`:** extracted from `GitHubRepoSection` (same endpoints, tree and helpers). Status and file loads are latest-wins, the repo URL is drafted, and a new `closePreview` closes the file preview.

### Modern Code (`src/modern/pages/code/CodePage.tsx`, lazy-loaded like Legacy because Monaco is heavy)
- **Layout:** a file rail (search when there are more than 6 files) and the **GitHub repo panel** underneath. Admins can connect, sync and unlink; the tree opens a **read-only preview dialog**.
- **Editor card:**
  - File name and language, a Drafts / Main toggle, and a **live save-status pill**.
  - Format, Compare, History, Commit, and a menu (Download branch / Delete file).
  - A Monaco editor sized to the viewport; it is read-only without the code scope.
- **History sheet:** view a commit, revert it, or pick **Base / Head** to compare (shown in the diff editor).
- **Dialogs:** a commit dialog (message required; says unsaved edits are saved first) and a new-file dialog with a language toggle.

### Tests
- **New (9 Modern tests):** open on drafts and switch to main (Bruno context); read-only rights; auto-save after 3 s; typing during a save stays unsaved; commit saves first, then promotes; **unsaved code survives a remount**; history view / revert / compare; create + delete; repo connect + tree preview.
- **1 Legacy CodeView smoke test** (shares the editor-buffer draft).
- **Totals:** 551 + new tests pass; the only failures are the 2 known Windows-only ftcCache tests. `tsc` is clean.
- **Local QA:** a local test file was created through the UI; Monaco renders in dark mode on desktop. 390 px: no overflow, and every target is ≥44 px. No real phone was available.

## Phase 9d: Emails

### Template (`email-verify.ts`)
- **New shared `emailTemplate`:**
  - Table-based layout with inline styles, so it renders the same in Gmail, Outlook and Apple Mail.
  - A light card with the CP mark and an accent bar.
  - A **hidden preheader** for the inbox preview line.
  - An optional **button**.
  - A footer that says **why the email was sent**, with a link to the site.
  - Plain parts (title, preheader, footnote, button) are escaped inside the template.
- **Verification:** "Confirm your email", with the code as six tiles.
- **Password reset now has its own email.** Before, it reused the signup text ("finish creating your account").
  - `issueVerificationCode(email, 'reset')` is used by `/api/auth/forgot-password`.
  - It has its own subject line and wording.
  - The codes, cooldowns and checks are unchanged.
- **Task assigned:** "You have a new task", with a task card (accent edge, description, due date) and an **"Open your tasks" button**. The button goes to `APP_URL/tasks`, falling back to https://tryctrlpoint.org. Every field is still escaped.

### Tests
- **New (5 tests, `src/emailTemplates.test.ts`):** code tiles, preheader and footnote; reset wording; task button link and escaping; the `appUrl` fallback; template escaping.
- The existing `taskEmail` and `email-verify` tests still pass.
- **Visual check:** rendered locally in the browser. Screenshots are in `screenshots/phase9/email-*.jpg`. No emails were sent.

## Phase 9c: Onboarding

### Shared engines (Classic JSX unchanged)
- **`components/onboarding/useWalkthrough.ts`:** the tour state machine moved out of `Walkthrough`. That covers the steps, target lookup with mobile fallbacks, spotlight geometry, tooltip placement, keyboard handling and resume position. Classic renders it exactly as before.
- **`components/onboarding/useSetupWizard.ts`:** the setup steps, profile save / skip bookkeeping, tour skip and the leave-with-unsaved-changes check.
  - The **step, name and role are drafted**, so switching look mid-setup carries on at the same step with the same text.
  - `clearSetupDrafts()` runs whenever the wizard closes (App watches `wizardOpen`), so the next setup starts fresh.
- `drafts.ts` gains `deleteDraft`, identical to the CAD / Owner branches.

### Modern screens (`src/modern/pages/onboarding/`)
Each is chosen by `ByMode` in App.
- **WelcomeDialog:** a wide split card.
  - A greeting over a slow aurora.
  - An "Up next" timeline of the three setup steps.
  - Get started / Skip for now, the same as Classic.
- **SetupDialog:**
  - A vertical stepper with an animated current-step marker (a progress bar on phones).
  - Profile form, frozen while saving.
  - **Your look:** theme cards plus a new **Layout (Modern / Classic)** choice, saved to the account through the interface-mode provider.
  - Tour start / retake / maybe later, and a summary.
- **TourCard:** the same spotlight engine, with a single-shadow accent outline, glow and dim.
  - A card with a progress ring, step dots that jump, text sliding in per step, and a keyboard hint.
  - The finish card.
  - On phones it is a bottom sheet, as in Classic.

### Tests
- **New (9 tests, `src/modern/__tests__/onboarding.test.tsx`):**
  - Welcome actions.
  - The full setup flow, with the requests made.
  - Blank-name error.
  - Theme and Layout choice (PATCH `interface_mode`).
  - **A look switch mid-setup keeps the step and typed name in Classic**, and a closed setup starts fresh.
  - Asks before leaving with unsaved edits.
  - Start / retake tour.
  - Tour next / finish with a missing target, dots, arrows and Escape.
- The Classic onboarding suites (136 tests) still pass. `tsc` is clean.
- **Local QA:**
  - Local QA account (`qa-student1@example.test`) with a local-only session and a reset onboarding row, at 1440 dark and 390.
  - Walked welcome → profile → look → **switched to Classic mid-setup** (it carried on at step 2) → back to Modern → tour.
  - No overflow and every target ≥44 px. No real phone was available.
- **Fixed during QA:** the Tailwind ring was overridden by the inline dim shadow, so the outline is now part of one shadow stack. The theme note now says it is kept on this device (it is stored in localStorage, not on the account).
- **Still to come in 9c:** the Modern zero-team screen. It renders outside the interface-mode provider and needs 9b's signed-out look helpers, so it lands after #51.


## Phase 9a: Owner console and QR check-in

### Shared logic
- **`src/components/owner/ownerUtils.ts`:** `fmtTokens`, `aiStatusOf`, `loginChips` and the flag reason / status maps, moved out of App.tsx.
- **`src/components/owner/useOwner.ts`:** Legacy `OwnerView`, `FlagCard` and `OwnerUserDrawer` keep their JSX (the flag-filter click now calls `chooseFlagFilter`).
  - **`useOwnerConsole`:** overview, users (search / team filter, quick delete), the AI overview in the owner's timezone (refreshed when the AI tab opens), flags (open / all) and feedback (resolving deletes it server-side). Reloads are latest-wins.
  - **`useFlagReview`:** a reviewer note **drafted per flag**, plus the action runner.
  - **`useOwnerUser`:** load, AI kill switch, timeouts, budgets (inputs show the saved value until edited; edits are **drafted per user** and digits-only), warn, move workspace (silent; with confirm) and delete membership / whole account. The confirm wording is unchanged.
- **`src/components/attendance/useQrCheckin.ts`:** session lookup (the alive guard handles token changes) and confirm (now guarded against double-submit).
- **`drafts.ts`:** `deleteDraft` (also on the 8d branch; identical).

### Modern pages
- **Owner console** (`src/modern/pages/owner/OwnerPage.tsx`): kit tabs with count badges (Overview / Users / AI control / Flags / Feedback).
  - **Overview:** animated stats and a workspace table.
  - **Users:** searchable rows with flag / warning / AI-status badges, Manage, and Delete.
  - **AI control:** stats, a **14-day messages + tokens combo chart** (kit chart instead of the lazy Legacy one), the heaviest users and the flagging rules.
  - **Flags:** flag cards with a quoted excerpt, a drafted note and the four actions.
  - **Feedback:** cards with image / video / file attachments and Resolve / Reopen.
  - **User sheet:** identity and login badges; an AI access panel (kit Switch, timeouts, Clear, limit forms); warnings; a usage bar strip; flag history; move workspace (kit Select); and a danger zone.
- **QR check-in** (`src/modern/pages/attendance/CheckinPage.tsx`): one focused card with a **spring-animated state icon** (asking / loading / checked in / wrong team / error).

### Tests
- **New (8 tests):**
  - Owner: overview + timezone URL; users search / delete; a flag action carries its drafted note; resolving feedback; user sheet (kill switch, timeout, digits-only budget, warn, remove); **a half-typed warning survives a remount**.
  - Check-in: ask → confirm; wrong team; expired session.
- **Totals:** 550 frontend tests pass; the only failures are the 2 known Windows-only ftcCache tests. `tsc` is clean.
- **Local QA:** the local server ran with `OWNER_EMAILS` set to the local QA account (local only). Desktop dark (overview, user sheet); 390 px on all five tabs with no overflow and every target ≥44 px. No real phone was available.

## Phase 9b: Landing and auth

### Which look the signed-out screens use (`src/modern/signedOut.tsx`)
- No account is loaded yet, so the landing and auth screens follow **the look this device last used**. `InterfaceModeProvider` already mirrors the active mode into `localStorage['cp-interface-mode']`. When nothing is stored, the app default applies.
- Signing out picks up the look the session just used.
- Every Modern screen has a **"Use the Classic look"** link, which this device remembers.
- `SignedOutModern` turns the Modern theme tokens on (`html[data-ui="modern"]`) while a Modern signed-out screen is shown. It sets them before paint, and again after the provider's unmount clean-up on sign-out. It also honours reduced motion with `MotionConfig`, the same way ModernShell does.

### Shared controllers (`src/components/auth/useAuthForms.ts`)
The logic moved out of the Classic screens. Their JSX is unchanged.
- `useTeamLookup`: FTC number lookup, which is now latest-wins.
- `useSignupForm`, `useOAuthSignup`, `useVerifyEmail` and `useForgotPassword` send the same requests, with the same validation, as before.
- **Drafted fields:**
  - Name, email, team number / name, access code and the OAuth role choice are **drafted**. Going back a step or switching looks keeps them.
  - Passwords are never drafted.
  - A drafted team number is looked up again on return. A typed team name is kept if the number still isn't an FTC team.
  - Drafts are cleared at sign-in (`persistSession`).
- Provider marks moved to `components/auth/ProviderIcons.tsx`.

### Modern screens (`src/modern/pages/auth/`)
- **Landing (`ModernLanding`):** a different page from Classic.
  - A fixed glass bar with section links.
  - A centred hero with a gradient headline.
  - A live **product window**: an animated attendance ring, build-board ticks, the next event, and a cash-flow line drawn left to right.
  - An 8-tile **bento** of what's inside, a **3-step timeline** with a drawn connector, an **FAQ accordion**, a closing CTA, and a footer with Privacy / Terms / Classic look.
- **Split auth layout (`AuthLayout`):**
  - On wide screens, a living brand panel: drifting light, a dot grid, and product highlights that rotate every few seconds with a progress bar.
  - The form column has Back, the Classic link and legal links.
  - Phones get the form only.
- **Sign in:**
  - Labelled fields, a show-password toggle, inline errors, and the providers enabled on the server.
  - First-time setup asks only for the new password.
  - Login and setup still run in App.
- **Password reset:** a kit **Dialog** with a 3-step progress bar (email → code → new password). It has a **six-box code input** over one real input, so paste and one-time-code autofill work, plus a resend countdown.
- **Role choice:** two cards, each with what you get, and provider sign-up.
- **Signup (admin / member):**
  - The FTC number is verified live, with a check in the field and a verified card. A typed name is the fallback.
  - The access-code field for members.
  - Fields are frozen while submitting.
- **OAuth completion:** an animated Team admin / Joining a team switch (a radiogroup), then the same fields.
- **Email check:** the same six-box code input and resend countdown.
- **Workspace ready:** shown to a new admin after signup in Modern. It is a dialog over the workspace, with the access code as separate tiles and a Copy button. Copying uses the shared `copyText` fallback and says when copying fails.

### Tests
- **New (14 tests, `src/modern/__tests__/auth.test.tsx`):**
  - Device look resolution, remembering Classic, and picking up the session look on sign-out.
  - The landing sets and clears the Modern tokens, and both exits work.
  - Sign-in wiring, errors and providers (enabled ones only), the setup variant, the password toggle, and the full reset flow (request bodies, digit filtering, mismatch error).
  - Role choice.
  - Admin signup payload with the looked-up team name.
  - Unknown number → typed name, with **drafts surviving a remount (password not kept)**.
  - Member signup error.
  - OAuth role switch and request body.
  - Email verify.
  - Workspace-ready copy.
- The Classic auth tests (`VerifyEmailScreen`) still pass. `tsc` is clean.
- **Local QA** (local dev server against the local API):
  - Checked at 1440 dark, 768 light and 390 dark, with no horizontal overflow and every target ≥44 px.
  - Wrong-password error from the real `/api/auth/login`.
  - Live FTC lookup.
  - A **look switch mid-signup kept the typed name and number** and showed the unchanged Classic screen.
  - No real phone was available.
- **Fixed during QA:**
  - The page body is the scroller on these screens, so the bar is `fixed` (sticky would not hold).
  - The cash-flow line is revealed with a clip instead of a path-length animation, which broke the non-scaling stroke.
- Screenshots are in `screenshots/phase9/`.

## Phase 9e: Modern by default

### The flip
- **`DEFAULT_INTERFACE_MODE` is now `'modern'`.**
  - Members who never chose a look, in workspaces without a default, get Modern.
  - New devices get the Modern landing page.
  - An explicit choice (account or workspace default) still wins.
  - Settings shows the workspace option "Not set" as "Not set (Modern)".
- **One name for the old look: "Classic".** It is used everywhere users see it: Settings → Interface, the account menu, ⌘K, the setup Layout step and the auth screens. Code and tests still say `legacy` internally.

### The interim frame is gone
- Every route now has a Modern page, so `ByMode` requires `modern` (a missing page is a type error).
- The `.m-legacy` wrapper and its interim CSS block in `modern.css` are deleted.

### Last Modern screens
- **Zero-team screen (`TeamlessPage`):**
  - Over a new shared `useTeamless` hook (Classic `TeamlessScreen` JSX unchanged).
  - Create / Join cards open their form in place.
  - The delete-account danger zone needs the email typed, then a confirmation.
  - Same App callbacks as Classic.
  - Shown by this device's look, since it renders outside the provider.
- **What's new (`WhatsNewDialog`):**
  - A kit dialog with a release rail.
  - The same changelog and seen-version rule.
  - One auto-open state for both looks, so switching never re-opens it.
- **Changelog v2.0.0, "Control Point, redesigned":** what changed for users.

### Flaky tests
- The Calendar Bruno quick-add, the Calendar stale-reply test and Bruno "Stop aborts" now use load-safe timeouts (5 s finds, 20 s per test). They passed alone and only timed out under full-suite load.

### Tests
- New: Modern zero-team (2 tests) and What's new (2 tests).
- Interface-mode tests now start in Classic through the workspace default, with resolution expecting Modern.
- Signed-out device-mode test expects Modern by default.
- Full suite: 667 tests run, all pass except the 2 known Windows-only `ftcCache` tests. `tsc` is clean.
- **Local QA:**
  - A brand-new device lands on the Modern landing page.
  - A local QA member with no saved look and no workspace default gets the Modern shell.
  - A sweep of 24 routes found no error screens and no `.m-legacy` frames, with no horizontal overflow.
  - `/teams`, `/roles` and `/code` send that student account to the dashboard, which is the existing permission rule.
  - No real phone was available.
- **Next (9f):** Modern versions of the global overlays: feedback, cookie consent, install prompt, the mention toast and the call UI.

## Phase 9f: Global overlays

Everything that floats over every page now has a Modern version, chosen by `ByMode`.

### Shared logic (Classic JSX unchanged)
- **`components/overlays/useOverlays.ts`:**
  - **`useCookieConsent`:** the same `cp-consent` storage and `cp:cookie-settings` reopen event.
  - **`useFeedbackForm`:**
    - The same `/api/feedback` multipart request, file rules (25 MB, images / video / documents) and paste-to-attach.
    - The topic, message and attachment are **drafted**, so a look switch keeps them.
    - A failed request now shows an error instead of an unhandled rejection.
  - **`useInstallPrompt`:** the same mobile-only, 30-day dismissal and iOS instructions.
- **`components/voice/useIncomingCall.ts`:** ringing, accept / decline / dismiss, and the explicit leave-and-join.
- **`components/voice/useCallView.ts`:** status announcements, fullscreen, the participant menu / list, and the featured order: screen share, then global spotlight, then personal spotlight, then pin.

### Modern components (`src/modern/overlays/`)
- **CookieBar:** a bottom card, with a Customize view using a kit Switch.
- **FeedbackDialog:** a kit dialog with a topic Select, a message, attach / preview / remove, and a sent state.
- **InstallBanner:** the install card and iOS steps.
- **MentionToastCard:** the mention toast with a Jump button.
- **CallDock:** a floating pill while minimized, with status, avatars and round media controls with tooltips.
- **IncomingCall:** an alert dialog with a pulsing ring, and Accept / Decline or Stay / Leave & join.
- **CallStage:** a tile grid or featured stage (screen share first), a bottom control dock, and a People sheet that is closed by default. It reuses the shared stream / audio / quality primitives and the participant menu.

### Tests
- **New (10 tests, `src/modern/__tests__/overlays.test.tsx`):**
  - Consent save and reopen.
  - Feedback request, with the draft surviving a remount, plus file rejection.
  - Android install.
  - Mention toast.
  - Dock controls and the hidden state.
  - Incoming accept / decline / explicit switch.
  - Stage tiles and People sheet.
  - Screen share takes the stage.
- The existing Classic voice tests pass on the new hooks.
- Full suite: 675 tests run, all pass except the 2 known Windows-only `ftcCache` tests. `tsc` is clean.
- **Local QA:** the Modern consent bar and feedback dialog were checked on a local QA account. The call UI needs a second participant, so it is covered by tests only. No real phone was available.

## Wrap-up

- **Status:** every phase is merged and live. Modern is the default, and Classic is one click away in Settings → Appearance, the account menu or ⌘K.
- **Rundown:** [`Control-Point-2026-Redesign.pdf`](Control-Point-2026-Redesign.pdf) covers every change, what was rebuilt and how, in 8 pages.
- **Final suite:** 684 tests run, all pass except the 2 known Windows-only `ftcCache` tests.

## Phase 10b: Messages widgets

The last Classic pieces inside Modern Messages are rebuilt.
- **Shared logic (Classic JSX unchanged):**
  - `useReactionToggle` (in `MessageReactions`) holds the optimistic toggle, the server reconcile, rollback with an error, and one request per emoji. It also names who reacted.
  - `useEmojiPicker` (in `ReactionPicker`) holds the category, a search of up to 64 matches, and your custom reactions.
  - `useVoiceChannels` holds auto-expanding live channels, joining (it asks about video per your camera default), join with video, and admin rename.
- **Modern `ReactionBar`:**
  - Spring-in chips, a count that ticks on change, and a kit tooltip with the big emoji and who reacted.
  - A "+" chip opens the picker. Chips are 36 px tall on phones.
- **Modern `EmojiPicker`:**
  - Quick reactions, a kit search input, and category tabs with a sliding marker.
  - A grid and your custom reactions.
  - Escape or a click outside closes it.
- **Modern `VoiceChannels`:**
  - Sidebar rows matching the text channels, with a live dot, Live call / lock / private markers and a people count.
  - Join with video and rename appear on hover (always on touch).
  - An animated participant list, and an inline rename form.
- **Found while building it:** the custom-reaction upload screen (`CustomReactionsSettings`) isn't rendered anywhere. It is flagged as a follow-up, and the Modern picker no longer points to a Settings page that doesn't exist.
- **Tests:**
  - 8 new: reaction toggle, rollback, the + chip, picker quick / search / category / custom / close, voice channels list, join rules and rename.
  - The Messages suite now mocks the new component; the Classic voice suite still passes.
