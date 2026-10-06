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
