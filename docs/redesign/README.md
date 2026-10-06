# Control Point 2026 redesign

The goal is to redesign Control Point as if it launched today, while keeping every workflow, permission, API and business rule exactly as it is. The current UI is a source of logic, workflows, permissions and data structures. It is not the target.

This document comes before any implementation. It has five parts:

1. Principles and visual language
2. Interface modes (Legacy and Modern), which is the architecture
3. Navigation
4. Screen by screen: current problems, then the redesign plan
5. Phasing

The code audits behind it (with file:line references) were done on `main` at `85c78bdb` on 2026-10-06.

---

## 1. Principles and visual language

Every screen should answer four questions within a few seconds: **Where am I? What matters? What can I do? What's next?** When two choices conflict, they rank in this order: clarity, speed, simplicity, consistency, accessibility, maintainability.

| | Legacy (today) | Modern |
|---|---|---|
| Page chrome | Top header bar repeats the page title; in-app footer repeats the nav | One page header per page (title, short description, actions). No header bar and no footer |
| Surfaces | Almost everything is a `card-surface` with a heavy shadow; cards nest inside cards | Sections are separated by headings, whitespace and hairlines. A card is used only for a real object (a task, an event, a file). Shadows only on overlays |
| Background | Animated volt grid, pulse and cursor glow | Flat page background with a faint top gradient. Background effects stay a Legacy feature |
| Type | Inter + Space Grotesk; 10–11px text is the most common arbitrary size (≈320 uses); 12 tracking values | Inter for all UI, Space Grotesk only for page titles and large numbers. Scale 12 / 13 / 14 / 16 / 20 / 24 / 32. **Nothing below 12px.** Two tracking values (normal, and `0.08em` for the few uppercase labels) |
| Radius | xl / lg / 2xl / 3xl / 1.25rem mixed | 6 (badges), 8 (controls), 12 (panels and cards), 16 (dialogs and sheets) |
| Colour | Volt yellow hard-coded about 40 times in shadows and gradients (so the team accent doesn't apply); raw emerald/rose/red/blue status colours | Accent only for the primary action, the active nav item, focus and key data. Status colours come from tokens (`success`, `warning`, `info`, `danger`). No hard-coded hex values |
| Spacing | Varies per screen (`mb-3`, `mt-3 sm:mt-4`, `mb-4`…) | 4px grid. Page gutter 32 / 24 / 16 (desktop / tablet / phone). 32 between sections, 16 inside a section. Content max width 1200px, except full-bleed workspaces (Messages, Tasks board, Calendar, Code) |
| Motion | Mixed, some decorative | 120–180ms ease-out for state changes; overlays fade and scale 0.98 → 1. No decorative motion. Honours `prefers-reduced-motion` |
| Components | Three primitive sets (App.tsx locals, `ui.tsx`, CadView's own), plus hand-rolled modals with no `role="dialog"`, Escape or focus trap | One kit: `src/components/ui-kit` (shadcn/ui on Radix, mapped to our tokens), plus `cmdk` for the command menu. Every overlay is a Radix Dialog, Sheet, Popover or DropdownMenu |
| Accessibility | Hover-only actions, right-click-only actions, unlabelled icon buttons, very few focus rings | Every action works by keyboard and touch. Icon buttons have `aria-label`. Visible focus ring on everything. `aria-current` on nav. No action is reachable only by right-click (context menus stay as shortcuts) |

Modern is dark-first and keeps the light theme and the per-team accent colour. It uses the same CSS variables, so the theme picker and team colours keep working.

---

## 2. Interface modes (Legacy and Modern)

Users choose between **Legacy Experience** and **Modern Experience** in Settings → Appearance. Think old/new Reddit or GitHub feature previews: two versions of the app over the same data.

- **Stored per user:** `members.interface_mode` (`'legacy' | 'modern' | NULL`). It's written to every member row with the user's email, so the choice follows the person across workspaces and devices.
- **Team default:** `teams.default_interface_mode`, which admins set in Workspace settings.
- **Resolution order:** user choice → team default → `legacy`. Legacy stays the default until Modern covers every screen; after that the recommended default becomes Modern.
- **Schema:** these two nullable columns are the redesign's only schema change. They're additive and added by a boot migration, the same way `bruno_teach_mode` was. The existing `PATCH /api/profile` and `PATCH /api/teams/:id` routes get one optional field each. Nothing else in the API changes.
- **Switching:** it's instant. An `InterfaceModeProvider` keeps the mode in React state, saves it optimistically (and rolls back if the save fails), and the app re-renders the other shell on the **same route**. There's no reload, and data, open chats and drafts are kept because all state lives above the shell. The saved choice is applied at login, before the first paint.
- **Separate presentation layer:** Modern code lives in `src/modern/` (shell, navigation, page header, command menu, and one page component per screen). `App.tsx` decides which shell to render. Every route keeps one shared data source (the same props, hooks and API calls). A Modern page reuses the same handlers and helpers, so only the presentation differs.
- **Incremental:** a screen that hasn't been redesigned yet renders its Legacy page inside the Modern shell. Modern is complete and usable from day one and gets better screen by screen.
- **Onboarding:** the tour targets (`data-onboard="nav-…"`, `header-bruno`, `nav-settings-gear`, …) get Modern equivalents, so the walkthrough works in both modes.

---

## 3. Navigation

### Current problems
- About 18 top-level destinations in a sidebar that scrolls. Collapsing it leaves unlabeled icons, and the collapsed state isn't remembered. Group headers look collapsible but aren't (`collapsedGroups` is dead code).
- CAD's 5 sub-pages appear both as sidebar children and as tabs inside the page. Roles is a sidebar child of Members, and the Members list appears again on the Roles page.
- The header bar repeats the page title and holds 7 controls (feedback, bell, team switcher, theme, Bruno, account menu…). Settings, sign out and feedback each appear twice. The account button uses a log-out icon.
- There are four settings surfaces: the Settings modal, `/settings`, `/profile` and the Bruno panel.
- Notifications are a dropdown whose actions only work by right-click. Opening it marks everything read, and items don't link anywhere.
- There's no search and no way to jump somewhere quickly.
- On mobile, the bottom bar's "More" opens the whole desktop sidebar as a drawer.

### Redesign plan
- **Sidebar (240px, collapses to a 56px rail with tooltips; state saved):**
  - **Workspace switcher** at the top: logo, team name and chevron. Its menu has switch workspace, copy invite code, workspace settings, and create or join a team.
  - **Search… ⌘K** opens the command menu.
  - **Primary:** Home, Inbox (notifications, with an unread count), Messages (mentions badge), Bruno.
  - **Collapsible sections (state saved):**
    - **Team:** Members, Attendance, Calendar, Tasks.
    - **Compete:** Team Stats, Predict (Beta).
    - **Build:** CAD, Code, Inventory.
    - **Operations:** Outreach, Communication, Budget, Resources.
    - **Admin:** Owner. Roles moves inside Members.
  - Every item keeps exactly today's visibility rules (`tabVisible`, scopes, perms, `ownerOnly`, the student whitelist).
  - **User button** at the bottom: avatar, name and status. Its menu has set status, Settings, theme, interface mode, What's New, Send feedback, Setup guide and Sign out. Each appears once.
- **No header bar.** Each page has a `PageHeader`: title, optional one-line description, primary action plus an overflow menu, and tabs when the page has them.
- **Command menu (⌘K / Ctrl+K):**
  - Go to any page you can see.
  - Create task, event, transaction, outreach event, communication log or part.
  - Actions: check in, start a QR session, switch workspace, toggle theme, switch to Legacy.
  - Find a member or teammate. Recent pages.
- **Bruno:** opened with ⌘J or from the sidebar as a right-hand sheet. Pages can still offer contextual "Ask Bruno" actions.
- **Mobile:** bottom tabs for Home, Messages, Tasks, Bruno and Menu. Menu opens a sheet with search, the full grouped nav and the user menu. The page header compacts: title on the left, primary action and overflow on the right. Lists become cards, and tables become stacked rows.

---

## 4. Screens

Each screen keeps every existing workflow and permission check. Line references are to `src/App.tsx` unless noted.

### Home (dashboard): `/dashboard`
**Current problems**
- Nine stacked cards (setup checklist, greeting, 4 KPIs, my status, Bruno bar, trend, upcoming, activity, performance, summary, access code) with no focus or ordering by importance.
- Three different spacing rhythms.
- The Budget KPI shows for admins without the budget scope.
- The whole trend card and the activity rows are clickable `div`s.
- The absence modal has no dialog semantics.
- Students get a separate dashboard whose "Scan QR" and "Enter code" both just open Attendance, with hard-coded English strings.

**Redesign plan:** one Home for everyone, with sections shown by permission.
- **Now** strip: greeting, today's date, your check-in status (I'm here / Late / Out inline; absence opens a Dialog), and the next event.
- **Needs attention:** overdue tasks assigned to you, unread mentions, pending check-in, and setup-checklist items. Each is a row with one action.
- **Team pulse:** a compact metric row of attendance today, open tasks, upcoming events and budget (budget only with the budget scope). Each links to its page. Below it, the attendance trend with the next-meet marker.
- **This week:** the upcoming timeline.
- **Compete:** a team performance summary with Team Stats and Predict links.
- **Activity:** a feed with real links.
- The AI summary/insights move behind an "Ask Bruno for a summary" action. The invite code moves to the workspace menu and Members.
- Students see the same layout without the admin-only sections. "Check in" opens the real scanner or code Dialog directly.

### Inbox (notifications): new page, `/inbox` in Modern
**Current problems:** a bell dropdown; mark-read, unread and delete work only by right-click; opening it marks everything read; items aren't links; the bell has no label or count.

**Redesign plan:** a full Inbox page with an unread count in the sidebar.
- List and detail layout with Unread / All filters.
- Each item links to its source (task, event, message, mention).
- Visible per-item actions (mark read/unread, delete), plus Mark all read and Clear all (confirmed).
- Items are marked read when viewed, not when the list opens.
- Uses the same `/api/notifications/*` endpoints.

### Messages: `/chat`
**Current problems**
- Each channel row has 3 hover-only icons plus a move menu, and drag duplicates the move menu.
- Message actions are hover-only (keyboard can't reach them), and delete has no confirmation.
- Text and voice section headers don't match.
- On mobile, the channel and member drawers have no backdrop or focus handling.
- No loading state when switching channels.
- A hard-coded logo in the header, and dead `VoiceChannelAdmin` code.

**Redesign plan:** keep the 3-pane model but make it calmer.
- **Channel list:** one consistent section style. Admin actions sit in a row overflow menu (rename, move, delete), drag stays as a shortcut, and voice channels show live participants.
- **Messages:** grouped by author and day. A message-actions toolbar appears on hover *and* on focus, with a long-press menu on touch. Delete confirms. A skeleton shows while a channel loads.
- **Composer:** attachments, mentions and a clear locked state when posting is restricted.
- **Members pane:** toggleable with presence, and call/video buttons always visible on focus.
- **Mobile:** the channel list is the screen, a channel opens full-screen, and members open in a Sheet.

### Bruno: panel and `/bruno`
**Current problems**
- Message rendering is duplicated between the panel and the full view, with three different text sizes.
- The copy-code button is hover-only, and there's no way to stop a streaming reply.
- The volt gradient is hard-coded 4 times, and a "BIOBUZZ season" subtitle is hard-coded.
- Output length can be set in two places.
- Chat rows are `div role="button"`.
- Note: PR 22 is changing BrunoPanel and BrunoView and adds BrunoQuickAdd and starters. **Bruno's redesign waits for PR 22 to merge and builds on it.**

**Redesign plan**
- One shared message component for the panel and the full view, using Beautiful UI (MIT) patterns: thinking/streaming states, tool and action rows (action proposals), code blocks with a visible copy button, and a prompt bar with attachments.
- A Stop button while streaming.
- The full view gets a chat list on the left (My chats / Team chats with search), the conversation, and starters grouped by topic.
- Output length lives in the prompt bar's options (one place). Settings links to it.

### Members and Roles: `/teams`, `/roles`
**Current problems**
- The Add Member button isn't hidden from non-admins.
- Forms use placeholders instead of labels, and a team title can read "#undefined".
- Icon buttons have no labels. No search and no empty state.
- A redundant "Team" column.
- Legacy scope chips duplicate the Roles system, and the members list appears again on the Roles page.
- Tiny 10px buttons.

**Redesign plan:** one Members page with tabs **People · Roles · Workspaces**.
- **People:** a searchable table (name, role, roles, board, status, last seen) with role and status filters. Clicking a row opens a Sheet with profile, edit, reset password and remove. Bulk-select comes later and only if the API supports it. The invite code and "Add member" (admins only) sit in the header.
- **Roles:** the existing RolesView flow (create/edit roles, permissions, assign) with the shared kit.
- **Workspaces:** the team cards (switch, leave, add/edit/delete for admins).
- The same permission checks as today.

### Attendance: `/attendance`, `/checkin/:token`
**Current problems**
- Up to 5 clicks per cell to reach a status, and cells have no labels.
- The column "Hide" button is hover-only and gets clipped on touch. "Hide All" has no confirmation.
- The legend sits apart from the grid. Status letters don't match: S means "School Event" vs "Sick", and A vs U.
- Raw colours.
- The fullscreen QR screen has no Escape.
- History items are buttons with no action.
- Refetches on every change.

**Redesign plan:** tabs **Today · Grid · History · Insights**.
- **Today:** the QR session panel (start, project fullscreen, end) plus a live list of who's checked in.
- **Grid:** each cell opens a small status Popover (P / L / E / U / S with labels) in one click, and keyboard arrows move between cells. The legend is pinned in the toolbar. Hiding dates moves to a "Meeting days" menu (by weekday, single date; confirm for Hide all). The member column is sticky with the theme surface.
- **History:** a date list linking to that day in the grid.
- **Insights:** the AI analysis plus the summary table, with an empty state.
- **Students:** a Check in card with Scan and Enter code side by side, plus their history.
- The data behaviour stays the same. Known logic bugs are tracked separately (bug-fix task) and aren't mixed into the redesign.

### Calendar: `/calendar`
**Current problems**
- Day cells are `div`s with no keyboard access, and "+N more" isn't clickable.
- Mobile gets a cramped 7-column grid with no agenda view.
- Non-managers can't open event details.
- The Upcoming colour bar doesn't use the event type colour.
- Selects have no labels, and the locale is hard-coded.

**Redesign plan**
- **Views:** Month · Week · Agenda (Agenda is the default on phones).
- Days are buttons; "+N more" opens a day Popover.
- Clicking an event opens a details Sheet for everyone; managers get Edit and Delete there.
- New Event keeps the AI quick-add ("Describe events…") as the first field of the form.
- The right rail shows Upcoming with type colours.
- Uses the browser locale.

### Tasks: `/tasks`
**Current problems**
- Edit works only by right-click, so tasks can't be edited on touch. Cards aren't clickable.
- "Back" from Done jumps to To Do. Column counts ignore filters.
- Cards have the same surface as the columns.
- Move arrows are hover-only. No search, assignee filter or drag and drop.

**Redesign plan:** views **Board · List · Analytics**.
- **Board:** clicking a card opens a task Sheet (edit, status, assignee, due date, delete). Columns can be dragged (or moved with a status menu, keyboard-friendly). Cards show assignee, due date and overdue state.
- **Toolbar:** search, assignee (Mine / All / person), team filter and "board tasks" for admins. Counts respect the filters.
- **Create:** the "New task" Dialog with the Bruno quick-add, plus bulk add ("Paste a list") as a secondary action.

### Team Stats: `/stats`
**Current problems**
- Cards nest 3–4 deep (mode tabs card > header card with orb > tile cards).
- Season pickers, season names, OPR tiles and placement badges each exist twice.
- The available seasons differ between Analyze, Compete and Predict.
- Opening Analyze auto-opens Bruno.
- Hard-coded placement colours, `-300` tints that are unreadable in light mode, and 9px labels.
- Hover-only tooltips.

**Redesign plan:** a `PageHeader` with team identity (number, name, location) and one season picker. Tabs **Overview · Events · Matches · Analyze**.
- **Overview:** an OPR breakdown stat row with ranks, trend charts and partners.
- **Events:** a list where each event opens a detail page or Sheet (rankings, alliances, matches).
- **Matches:** a filterable table.
- **Analyze:** the scouting workspace (search, field, shortlist) without auto-opening Bruno; "Ask Bruno" is a button.
- One `SeasonPicker` and one season list, shared with Predict.

### Predict (Beta): `/predict`
**Current problems:** about 12 cards on one page; two beta badge styles; cramped 4-column tabs on phones; students are sent to the admin `/settings` page to connect a team; long 11px paragraphs.

**Redesign plan:**
- The `PageHeader` has the event picker, season, stage and a Beta badge.
- **Odds:** a hero section with the ring and four stats in one row (no cards), plus rank and points sections with hairline dividers.
- **Alliance / Field / Matches:** tables or lists with the shared kit.
- The accuracy explanation moves into a Sheet with readable text.
- A student with no team connected sees "Ask an admin to connect your FTC team" instead of a dead link.

### CAD: `/cad`, `/cad-docs`, `/cad-reviews`, `/cad-snapshots`, `/cad-parts`
**Current problems**
- Sub-pages are duplicated as sidebar children and page tabs. The dashboard repeats the tab counts.
- Docs and Parts have no loading or error states.
- A card per BOM section with 720px-minimum tables.
- CadView redefines its own Card, Button, Modal and so on.
- Hard-coded section and viewer colours.

**Redesign plan:** one CAD page with tabs **Overview · Documents · Reviews · Snapshots · Parts**. The old routes map to the tabs, so links keep working.
- **Overview:** what needs review, recent snapshots and document links.
- **Reviews:** a list with status, and a detail Sheet (comments, transitions with the existing `canAct` rules).
- **Parts:** one BOM table grouped by section (sticky group headers) with an invoice import Dialog.
- The 3D viewer opens in a full-screen Dialog with labelled controls.
- Everything uses the shared kit.

### Code: `/code`
**Current problems:** a file dropdown instead of a tree; a read-only "TEAM" box wastes a row; 4 wrapping button groups with raw blue/green/red buttons; a fixed-width history panel with no mobile fallback; Compare is blank until both sides are picked; Revert has no confirmation.

**Redesign plan:** an IDE-like layout.
- **Left:** a file tree with search, plus New File.
- **Centre:** the editor with a toolbar: branch switch (Drafts / Main), Format, Compare, Download. One primary "Commit to main" button, with an overflow menu for delete and revert (confirmed).
- **Right:** a toggleable history panel (a Sheet on mobile). Compare defaults to Main vs. Drafts.
- Read-only users see a "Read-only" badge instead of disabled controls.
- GitHub repo linking lives in the page overflow menu.

### Inventory: `/inventory`
**Current problems**
- No page title.
- Three buttons crammed into the search row, and a 7-column table on phones.
- Add and Edit modals are near-duplicates.
- The "Cost" column actually shows the line total.
- Unlabelled row actions.
- Categories are inconsistent between the filter and the form.

**Redesign plan**
- A `PageHeader` with "Add part" (primary) and Import (invoice / REV link) in a split button.
- **Toolbar:** search, category filter and auto-categorize.
- A table with Unit cost and Total columns. Rows open an edit Sheet, which is the same form used to add a part.
- Stacked rows on phones.

### Outreach and Social: `/outreach`
**Current problems**
- Edit and Delete aren't gated (the context menu is).
- A pin-state field mismatch.
- A 5-column grid with only 4 tiles.
- Two "Link YouTube" buttons.
- Heavy event cards, and no sort or filter.

**Redesign plan:** tabs **Events · Social**.
- **Events:** a stat row (events, hours, people reached…), then an events table or list sorted by date with type filters. Rows open an edit Sheet (with the same gating as the context menu). "Log event" is the primary action and "Bulk add with Bruno" the secondary.
- **Social:** linked channels (YouTube) as rows with sync, pin and reorder, plus one Link button.
- Both bugs go in the separate bug-fix task.

### Communication: `/comm`, plus email import
**Current problems**
- No search or filter.
- An automatic "Did they respond?" modal adds a click to every log.
- Free-text dates.
- Three nested layers of borders.
- An unlabelled delete button.
- The import modal isn't responsive and uses its own styles.

**Redesign plan**
- A list-and-detail inbox with threads on the left (search, type filter) and the timeline on the right.
- "They replied" / "We followed up" become inline composer actions; the automatic prompt becomes a non-blocking toast.
- Date pickers.
- The email import Dialog is one responsive form with "Parse with Bruno" available straight away.

### Budget: `/budget`
**Current problems**
- Two stacked headings and a long description.
- No filters or category breakdown.
- Amounts can become NaN.
- Placeholders instead of labels.
- Duplicate only works by right-click.
- The desktop table has no empty state.

**Redesign plan:**
- A `PageHeader` with "Log transaction".
- A stat row: income, expenses, net.
- A category breakdown chart.
- A transactions table with search, type/category/date-range filters, and a row menu (edit, duplicate, delete).
- A validated form (the amount must be a number).
- Empty states.

### Resources: `/resources`
**Current problems:** delete has no confirmation and a hover-only button with no label; a filtered-but-empty list says "No resources yet"; no search.

**Redesign plan:**
- Category chips plus search.
- Link rows with favicon, title and domain, and a visible row menu.
- "Add with Bruno" (paste then preview) as the primary action.
- Correct empty-state copy for filters.

### Settings and Profile: modal, `/settings`, `/profile`
**Current problems**
- Four surfaces duplicate the FTC number, password, persona, voice and output length.
- Confirm dialogs and toasts render *under* the modal (z-50/60 vs z-70).
- Password copy says "You sign in with Google" for Discord and GitHub users too.
- `/settings` is reachable by URL for non-admins.
- Sliders hard-code the yellow.

**Redesign plan:** one full-page Settings in Modern at `/settings` with a left section nav, Linear-style.
- **Personal:** Account (profile, password, sign-in methods), Appearance (theme, **interface mode**, accent preview, language), Notifications & sounds, Voice & video, Bruno.
- **Workspace (admins):** General (name, FTC team with verify), Members & invite code, Roles, Voice & calls, Chatbot persona, AI absence evaluation, Messages, Storage, Google Calendar.
- **Owner:** AI limits.
- **Danger zone.**
- Every section keeps its existing gating. Each value lives in exactly one place.
- Overlays use the kit (Radix stacking), so confirms always sit on top.
- Legacy keeps its modal and pages unchanged.

### Owner portal: `/owner`
**Current problems**
- A failed load shows "No workspaces yet".
- Five parallel fetches block every tab.
- The drawer is hard-coded dark (breaks light mode), with no Escape or focus trap.
- Card-on-card stats and raw inputs.

**Redesign plan:**
- Tabs **Overview · Users · AI · Flags · Feedback**, each loading its own data with skeleton and error states.
- **Users:** a table with a user Sheet (AI controls, warn, usage, flags, move, delete with confirmation).
- Stat rows without nested cards.

### Auth, onboarding and What's New
**Current problems**
- Auth screens are state-only (no URLs, so Back doesn't work).
- Labels aren't tied to inputs.
- Three different logos.
- What's New and the Welcome screen can open at the same time, and What's New has no Escape.
- The tour skips Compete, Predict, CAD, Code and Budget.
- (PR 22 adds forgot-password and login error states.)

**Redesign plan:** Auth is shared by both modes (Legacy users sign in through it too), so it gets polished, not forked:
- One logo.
- Labelled fields.
- Consistent `AuthShell` layout including the login screen.

Also:
- Onboarding and What's New become kit Dialogs with Escape and focus handling, and never stack with each other.
- The Modern tour covers the new navigation and command menu.
- Auth URLs (Back button) are a later, separate change, because they touch routing for logged-out users.

### Documentation
There's no screen today: `/api/documentation` is fetched but never rendered. It's out of scope for the redesign, which changes presentation, not features. Noted for a future feature.

---

## 5. Phasing

Each phase is its own PR, reviewed to 5/5 with zero open threads, merged and deployed. Legacy stays untouched and remains the default throughout.

| Phase | Scope |
|---|---|
| 1 ✅ | UI kit: shadcn/ui on Radix mapped to our tokens (#24) |
| 2 | Interface modes (columns, provider, Appearance switch, "Try the new experience" prompt) and the Modern shell (sidebar, page header, ⌘K command menu, mobile nav, user menu), with Legacy pages embedded |
| 3 | Home and Inbox |
| 4 | Tasks, Calendar and Attendance |
| 5 | Members/Roles and unified Settings |
| 6 | Messages, Communication and Bruno (after PR 22 merges) |
| 7 | Team Stats and Predict |
| 8 | CAD, Code, Inventory, Outreach, Budget and Resources |
| 9 | Owner, auth and onboarding polish; switch the recommended default to Modern |

Bugs found during the audit (permission gating on some buttons, attendance and calendar logic) are fixed separately in a bug-fix task, so redesign PRs stay presentation-only.
