# Feature parity: status checklist

Snapshot of `docs/parity-checklist.md` on 2026-10-17, with the owner's decisions applied.

**Shortlist: about 68% done** (85 done, 5 in an open PR, 2 partly done, 35 to do). 137 unfinished items are off the shortlist and struck through below; they stay listed for reference. The percentage counts shipped work only: partly done items count as half, and work in an open PR doesn't count until it merges.

**Paused** at the owner’s request after the work below; nothing new starts until they say continue.

Legend: ✅ done · 🔄 in an open PR · 🟡 partly done · ⬜ not started · ❌ / ~~struck~~ not doing

## The shortlist (owner, 2026-10-17)

"We don’t need an exact replica of all the features." What stays, in order:

1. Finish the journal (3.2, open PR #289) and the mentor review queue (3.4, open PR #298)
2. Awards page (7.1)
3. Judge-ready PDF (3.5)
4. Orders, approvals and paste-a-link (8.2–8.4)
5. Attention-first dashboard (13.1)
6. "Notify members" on create (0.4)
7. Season rollover (12.6)
8. Data export (14.1)
9. Field clock and practice runs (5.1, 5.2)
10. Live demo (12.5)
11. In-team streaks and badges (16)

Everything else not already shipped is dropped.

## Earlier owner decisions

- Fiscal sponsorship, donation pages, team cards (8.9): **not doing**
- Website builder (9.7): **not doing**
- Shared team email inbox (11.3): **not doing** (no mail reading, no Google feature); the Communication log stays
- Public directory (Phase 15): **not doing**
- Gamification (Phase 16): **in-team streaks and badges only**, no cash
- Live demo (12.5): **yes**, read-only sample workspace
- Crowdsourced event scouting (6.5) and event-staff tools (14.5): skipped (no objection)

## Shipped this run (merged and deployed)

| PR | What |
|---|---|
| #253, #259 | Parity checklist (docs) |
| #254 | Module switches and robot subsystems (Bruno `workspace` card) |
| #255 | Task start date and subsystem / award / label tags |
| #257 | Cancelled task status |
| #258 | Test servers skip Vite (no more random 30 s test timeouts) |
| #260 | Task dependencies and related links |
| #261 | Per-person task completion |
| #262 | Task comments, activity timeline, watchers |
| #263 | Task filters and Columns pivot (priority / assignee / subsystem) |
| #264 | Timeline (Gantt) view and WIP limits |
| #265 | Mine count, Alt+arrow moves, completion animation, on-time Insights |
| #266 | Smart assignee groups (Everyone, Coaches & mentors, Alumni) |
| #267 | Bruno suggests task tags (AI tagged, Undo) |
| #268 | Sketches on tasks |
| #269 | Auto-save task edits, due-date shortcuts, Move to tomorrow |
| #270 | Event types, start chips, multi-day events, clickable locations, agenda |
| #271 | RSVPs, attendees by role, auto-excused attendance |
| #272 | Event-linked attendance: late window, mark the rest absent, RSVP follow-through |
| #273, #277 | This status checklist (docs) |
| #278 | Tasks due on the calendar |
| #279 | Mini-month navigator |
| #280 | Import official FIRST competitions |
| #281 | Unavailable times per member (Away on events, Bruno) |
| #282 | High-contrast event blocks |
| #283 | Pit display |
| #284 | Status checklist refresh (docs) |
| #285 | Six more notebook templates, Start from a template |
| #286 | Notebook entry details: work date, type, stage, subsystems, awards, byline, read time (Bruno tags) |
| #287 | Download Markdown for a page |
| #288 | Checklists module |
| #291 | Bruno switches light/dark mode; the notebook follows light mode |
| #292 | Bruno adds lines to the CAD parts list |
| #293 | Resizable notebook pages list; bright yellow Show sections and pages |
| #294 | @mention a teammate in a notebook page to notify them |
| #295 | Recent chats in the Bruno side panel |
| #296 | Bruno adds rows into notebook tables and cleans up its own stray copies |
| #297 | Bruno reads pasted store links and goBILDA part numbers (names, links, prices) |

**Open:** [#289](https://github.com/Control-Point-FTC/control-point/pull/289) the journal (3.2) and [#298](https://github.com/Control-Point-FTC/control-point/pull/298) mentor review (3.4), both in review. Amazon links can’t be read from the production server (Amazon blocks datacenter IPs and asks for its Product Advertising API); using that API needs an Associates account, so it’s the owner’s call.

## Progress by phase

| Phase | Done | In PR (not counted) | Partly | To do | Off the shortlist | % shipped |
|---|---|---|---|---|---|---|
| 0. Shared foundations (unblocks almost everything else) | 7 | 0 | 0 | 1 | 11 | 88% |
| 1. Tasks overhaul | 29 | 0 | 0 | 0 | 4 | 100% |
| 2. Calendar, events and attendance | 22 | 0 | 0 | 0 | 3 | 100% |
| 3. Engineering notebook upgrades | 13 | 5 | 0 | 1 | 4 | 68% |
| 4. Checklists and 3D printing (new modules) | 7 | 0 | 0 | 0 | 12 | 100% |
| 5. Practice and competition | 0 | 0 | 0 | 9 | 2 | 0% |
| 6. Scouting and event day | 1 | 0 | 0 | 0 | 13 | 100% |
| 7. Awards and stats | 0 | 0 | 0 | 4 | 6 | 0% |
| 8. Money | 1 | 0 | 1 | 9 | 19 | 14% |
| 9. Outreach and public presence | 1 | 0 | 0 | 0 | 22 | 100% |
| 10. Library and knowledge | 1 | 0 | 0 | 0 | 8 | 100% |
| 11. Communication | 1 | 0 | 0 | 0 | 7 | 100% |
| 12. Members and onboarding | 1 | 0 | 0 | 2 | 14 | 33% |
| 13. Dashboard | 1 | 0 | 0 | 8 | 0 | 11% |
| 14. Platform and integrations | 0 | 0 | 1 | 0 | 9 | 50% |
| 15. Public directory  (separate product) | 0 | 0 | 0 | 0 | 2 | — |
| 16. Gamification | 0 | 0 | 0 | 1 | 1 | 0% |

## Phase 0: Shared foundations (unblocks almost everything else)

### 0.1 Season-wide taxonomies · ✅ Done
- [x] Subsystem list per team (defaults: Drivetrain, Intake, Outtake, Arm, Autonomous, Electrical, Chassis, Sensors), editable in settings
- [x] FTC award taxonomy constant (Think, Connect, Reach, Sustain, Innovate, Control, Design, Inspire) with one-line "what judges look for" text per award, in `src/types` so the server can use it
- [x] Shared tag chips and toggle pickers (award chip hover shows judging criteria) — `src/modern/pages/tasks/TaskTags.tsx`
- [x] Tag storage: JSON arrays on each record (`subsystems`, `awards`, `labels`), queryable with `json_each` for rollups
- ~~Seasons table + season selector component (current season default; past seasons readable)~~ *(not on the shortlist)*

### 0.2 Permissions expansion · ❌ Off the shortlist
- ~~Custom roles with colours (have) — add Owner / Manager / Member presets~~ *(not on the shortlist)*
- ~~18 permission keys (have) — expand to cover every new module (orders.approve, orders.request, finance.view, donors.manage, printing.manage, checklists.manage, scouting.manage, website.manage, forms.view, inbox.view/send, wiki.edit, settings.manage …)~~ *(not on the shortlist)*
- ~~Finance view rules in the role editor (who can see balances/donors)~~ *(not on the shortlist)*
- ~~Inline "needs the X permission" explanations instead of hiding actions~~ *(not on the shortlist)*
- ~~Role impersonation ("view as role") for admins~~ *(not on the shortlist)*
- ~~403 page that says who can grant access ("A team manager can grant it from Settings → Roles")~~ *(not on the shortlist)*

### 0.3 Per-team module switches · ✅ Done
- [x] `teams.disabled_modules` setting: turn whole modules off (every current module; new modules join the list as they ship)
- [x] Sidebar, mobile tabs, the ⌘K search menu and Bruno respect the switches (Bruno sees them in workspace facts and can flip them with a confirm card)
- ~~Dashboard widgets respect the switches (lands with the Phase 13 dashboard)~~ *(not on the shortlist)*
- [x] Settings page: toggles with one-line descriptions

### 0.4 Notification engine upgrade · ⬜ Not started
- ~~Instant/digest/off prefs (have) — move to a per-event × per-channel matrix (in-app / email / push / Discord DM / webhook)~~ *(not on the shortlist)*
- ~~PWA manifest + service worker (have) — add Web Push (VAPID) subscriptions, including the iOS home-screen flow with an "Add to Home Screen" help card~~ *(not on the shortlist)*
- ~~Central event catalogue (task assigned, task due, event created, order needs approval, form response, mention, etc.)~~ *(not on the shortlist)*
- [ ] "Notify members" option on any create action honouring each person's prefs

## Phase 1: Tasks overhaul

### 1.1 Task data model · ✅ Done
- [x] Statuses: To do / In progress / Done / Cancelled (Cancelled kept but hidden by default; "Show cancelled" adds the column)
- ~~Custom task statuses per team~~ *(not on the shortlist)*
- [x] Priority: Low / Medium / High / Urgent pills
- [x] Start date (have due date + due time)
- [x] Blocked state + task dependencies ("blocked by an incomplete task" warning)
- [x] Linked tasks ("2 linked")
- [x] Subsystem tags (uses PR 0.1)
- [x] Labels
- [x] Award tags on tasks (uses PR 0.1)
- [x] Completion mode per task: "everyone assigned completes it separately" vs "one deliverable, closed once by whoever finishes"
- [x] Assign-by-role plus smart groups: Everyone, Coaches & mentors, Alumni (from role names; "All members" is the team's Member role)

### 1.2 Task detail panel · ✅ Done
- ~~Side panel/sheet with title, status chip, right rail (State, Priority, Start, Due + "Tomorrow" shortcut, Assignees, Completion, Labels, Subsystem, Awards, Checklist link) — sheet and "Move to tomorrow" / due shortcuts done; checklist link waits for checklists~~ *(not on the shortlist)*
- [x] Top actions: Copy link, Watch/Unwatch, Duplicate, Delete, Reopen
- ~~Rich-text description (bold/italic/strike/code/heading/lists/checklist/link/@mention/photo paste)~~ *(not on the shortlist)*
- [x] Comments (plain text with @mentions), Ctrl/⌘ + Enter to post, edit/delete
- [x] Activity timeline (opened, status changes, completed, edits)
- [x] Watchers + notifications on comments (assignees follow by default)
- [x] Auto-save on edit (only changed fields, with a "Saving… / All changes saved" status; Done saves anything pending)

### 1.3 Board views and toolbar · ✅ Done
- [x] Kanban with drag between columns
- [x] List view
- [x] Gantt / timeline view (start → due bars, week navigation, today line)
- [x] "Columns:" pivot — group by Status / Priority / Assignee / Subsystem (drag between Priority columns sets priority)
- [x] "Mine" filter with count
- [x] Filters: priority, subsystem, label, award evidence, due (overdue / next 7 days / none); search; assignee; kept in the URL
- [x] Saved filters — filters live in the URL, so a filtered board is bookmarkable/shareable
- [x] Bulk actions
- [x] Alt/Option + ← → keyboard move between columns (with on-page hint)
- [x] Completion animation (reduced-motion variant)
- ~~"Notebook entries" counter on each card (did you write it down?) — needs structured notebook↔task links (Phase 3)~~ *(not on the shortlist)*
- [x] WIP limits per column (the competitor lacks this; cheap win)
- [x] Insights tab — on-time rate, overdue and missing-due-date "needs attention" (Bruno reads the same numbers)

### 1.4 AI auto-tagging (Bruno) · ✅ Done
- [x] Bruno suggests subsystem / labels / award tags on new tasks, shown as "AI tagged" with an explanation tooltip, one-click undo

### 1.5 Sketchpad on tasks · ✅ Done
- [x] Sketches on a task, drawn with the notebook's ink (pen, highlighter, its colours and pressure-shaped strokes); stored as strokes, so they stay editable

## Phase 2: Calendar, events and attendance

### 2.1 New Event dialog rebuild · ✅ Done
- [x] Event types: meeting, competition, scrimmage, outreach, deadline, social, other
- [x] Start-time quick chips (3:30, 4:00, 5:00, 6:00, 7:00 PM) + "+2h from start"
- [x] Multi-day events ("+ Add another day"; one event per day, each with its own times)
- [x] Location accepts an address or a video-call link (clickable)
- [x] Agenda field (in exports, Bruno's lookup and Bruno's event cards)
- [x] Attendees default to whole team, with role chips to narrow (only they're notified and can RSVP)
- [x] Repeats weekly / recurring series
- ~~"Notify members" checkbox (uses PR 0.4)~~ *(not on the shortlist)*

### 2.2 RSVP · ✅ Done
- [x] RSVP style per event: No RSVP / Can't-make-it-only (with reason → auto-excused) / Full RSVP
- ~~RSVP buttons in the event popover and dashboard (done); in notifications (to do)~~ *(not on the shortlist)*
- [x] RSVP counts on the event (and who answered; reasons for managers)

### 2.3 Event-linked attendance · ✅ Done
- [x] Attendance by date, linked to today's event (its RSVPs beside each name)
- [x] Sheet "waits until people have had a chance to turn up" (15-minute late window, then one click marks the rest absent)
- [x] Attendance rate vs RSVPs stat (RSVP follow-through in Insights and Bruno's facts)

### 2.4 Calendar polish · ✅ Done
- [x] Month / Week / Agenda views
- [x] ICS subscription feed
- [x] Task-due overlay on the calendar ("2 tasks" day badge, toggleable; due tasks in the day list)
- [x] Event-type filter toggles in the toolbar (already there)
- [x] "Unavailable times" per member (date ranges or weekly slots with a private note; "Away" on clashing events; Bruno lists them and adds or removes your own)
- [x] Mini-month navigator (Week and Agenda views)
- [x] High-contrast event blocks (a "High contrast" toggle, on by itself under prefers-contrast: more: solid fill, full-strength text, thick type bar, finished events struck through instead of faded)
- [x] FIRST event calendar import (official comps added from FTC Events / FTC Scout with one click; re-running skips ones already imported)
- ~~Google Calendar inbound sync (changes made in Google come back into CP)~~ *(not on the shortlist)*

### 2.5 Pit display · ✅ Done
- [x] Full-screen kiosk route for a spare screen: agenda, banners, next match, QR check-in (/pit/<token>: this week, #announcements, next match at a live imported event, the check-in QR while a session runs)
- [x] Auto-refresh, no-login token link (admins make, replace or turn it off in Calendar → Pit display, or through Bruno's workspace card)

## Phase 3: Engineering notebook upgrades

### 3.1 Entry metadata · ✅ Done
- [x] "Work happened on" date separate from created date
- [x] Type chips: Prototype, Build, Code, Test, Outreach, Meeting, Competition, Failure
- [x] Stage chips: Identify Problem, Brainstorm, Research, Design, Build, Program, Test, Iterate
- [x] Subsystem chips (PR 0.1)
- [x] Award chips with judging hover (PR 0.1)
- [x] Multiple authors per entry + "Written by … · last edited by …" footer
- ~~Linked records rail: link tasks, events, orders, checklist runs~~ *(not on the shortlist)*
- [x] Read-time estimate

### 3.2 Journal and Board views · 🔄 In open PR — [PR #289](https://github.com/Control-Point-FTC/control-point/pull/289)
- [x] Book/section/page tree
- [ ] 🔄 Journal view: entries grouped by week ("This week", "Last week"), cards with excerpt, photos, chips, authors *(in open PR #289)*
- ~~Board view: kanban by subsystem, drag to retag, "New entry in X" per column, Alt+arrow move~~ *(not on the shortlist)*
- [ ] 🔄 Awards view: entries grouped by award *(in open PR #289)*
- [ ] 🔄 Filters by type/stage/subsystem/author/season *(in open PR #289)*

### 3.3 Templates · ✅ Done
- [x] Blank, meeting, to-do, engineering log, design review
- [x] Add: Test Log, Failure Analysis, Outreach Event, Competition Recap, Code Change, Design Iteration (hypothesis/changes/results)
- [x] "Start from a template" menu on the notebook toolbar (on the ribbon before a page is open; Insert → Page templates with one)

### 3.4 Mentor review queue · 🔄 In open PR — [PR #298](https://github.com/Control-Point-FTC/control-point/pull/298)
- [ ] 🔄 Submit entry for review → mentor approves / requests changes, with comments *(in open PR #298)*
- [ ] 🔄 Queue page for reviewers + dashboard count *(in open PR #298)*

### 3.5 Export and extras · 🟡 Partly done
- [x] Print / PDF export
- [ ] Judge-ready PDF (cover, TOC, award-tagged sections, filtered by season)
- [x] Markdown export per entry (File → Download Markdown)
- ~~Bruno auto-tag new entries ("AI tagged" badge with explanation)~~ *(not on the shortlist)*
- ~~Contextual guide link "How to keep a great engineering notebook · N min"~~ *(not on the shortlist)*

## Phase 4: Checklists and 3D printing (new modules)

### 4.1 Checklists module · ✅ Done
- ~~Templates with sections (timed: Morning / Between Matches / End of Day; or category: Power / Electronics / Pit), quantities (sections done; per-item quantities not yet)~~ *(not on the shortlist)*
- [x] Starter templates: Pre-match (24), Post-match (9), Pit setup (27), Pit teardown (19), Travel day (12), Robot lockup (14), Competition debrief (8)
- [x] Runs with names, progress ("2 of 24"), item check-off recording who + time
- [x] Item assignees
- [x] N/A and partial states on items
- [x] Finish run; Reset run with confirmation (a weak point in the competitor)
- [x] Link a run to an event
- [x] Run log with Reopen
- ~~Offline check-off~~ *(not on the shortlist)*

### 4.2 Checklist automation · ❌ Off the shortlist
- ~~Auto-start triggers (e.g. "15 min before every match", before an event type)~~ *(not on the shortlist)*
- ~~"Write it up": create a notebook entry from a finished run~~ *(not on the shortlist)*
- ~~Link a checklist from a task~~ *(not on the shortlist)*

### 4.3 3D print queue · ❌ Off the shortlist
- ~~Printers tab: member-owned printers, materials (PLA/PETG/TPU/ABS/Nylon)~~ *(not on the shortlist)*
- ~~Request a print: file (.stl from Library/CAD), material + colour, printer, due date, priority~~ *(not on the shortlist)*
- ~~Printer owner accepts ("Waiting for the printer's owner to accept")~~ *(not on the shortlist)*
- ~~Queue ordering, one-click Mark printing / Mark printed / Failed~~ *(not on the shortlist)*
- ~~"Everything" / "I asked for" filters, last-30-days history~~ *(not on the shortlist)*
- ~~Print-time estimate + filament inventory link to Inventory (the competitor lacks both)~~ *(not on the shortlist)*
- ~~STL preview using the existing CAD 3D viewer (the competitor lacks this)~~ *(not on the shortlist)*

## Phase 5: Practice and competition

### 5.1 Field clock · ⬜ Not started
- [ ] Full-match timer on real FTC timing (ready 0:30, auto, transition, teleop, endgame) with buzzers and call-outs
- [ ] Mute cues, Test sound, Live clock vs Tally mode
- [ ] Tap-to-score per game element for the current season, "fix a count from another period"
- [ ] Season scoring config file (so next season is data, not code)

### 5.2 Practice runs and history · ⬜ Not started
- [ ] "Enter a score" manual mode with auto-summed points
- [ ] Save panel: played time, Solo / Full alliance, auto routine (+ new), robot version (+ new), drivers/operators, notes
- [ ] "Save and start the next run"
- [ ] History: score trend + 5-run average; compare by driver, auto routine, robot version; per-run breakdown
- [ ] Mechanism drills: made/missed per mechanism and robot version, kept out of match numbers

### 5.3 Scoring calculator + kickoff countdown · ❌ Off the shortlist
- ~~Public scoring calculator for the current game (reuses PR 5.1 config)~~ *(not on the shortlist)*
- ~~Kickoff countdown page/widget~~ *(not on the shortlist)*

## Phase 6: Scouting and event day

### 6.1 Event hub · ❌ Off the shortlist
- ~~Match scouting templates (have) — wrap them in a per-event hub: This event / Teams / Matches / Strategy / Picklist / Questions / Our robot, with in-page nav (a weak point in the competitor)~~ *(not on the shortlist)*
- ~~Our next matches, current rank, last match result, "you go back at Q25"~~ *(not on the shortlist)*
- ~~Starred teams / watchlist with private notes ("Only your team sees this")~~ *(not on the shortlist)*
- ~~Privacy labels on every surface (public / team-only / private)~~ *(not on the shortlist)*

### 6.2 Pit scouting · ❌ Off the shortlist
- ~~Pit-sheet form (drivetrain, autos, endgame, photo, custom questions)~~ *(not on the shortlist)*
- ~~Coverage tracker ("23 of 27"), tap a team to fill~~ *(not on the shortlist)*
- ~~Printable pit sheets~~ *(not on the shortlist)*
- ~~Custom questions editor for match + pit scouting~~ *(not on the shortlist)*

### 6.3 Picklist and alliance selection · ✅ Done
- [x] Shortlist/picklist board
- ~~Live alliance-selection mode: ranked order, mark picked/declined teams as they go, lock the list~~ *(not on the shortlist)*
- ~~Playoff bracket from the real alliance structure~~ *(not on the shortlist)*
- ~~Advancement points per event~~ *(not on the shortlist)*

### 6.4 Strategy board · ❌ Off the shortlist
- ~~Draw a match plan on the field image (reuse notebook canvas), save per match, share link with alliance partners~~ *(not on the shortlist)*

### 6.5 Crowdsourced event scouting · ❌ Off the shortlist (skipped (cross-team data; belongs in Control Scout))
- ~~Pit codes so other teams fill their own sheet, public event report, coordinator dashboard (cross-team data — decide whether CP wants this)~~ *(not on the shortlist)*

## Phase 7: Awards and stats

### 7.1 Awards page · ⬜ Not started
- [ ] One row per award with what judges look for, season selector
- [ ] Evidence rollup from tagged tasks, entries, events, outreach, messages, photos
- [ ] Progress per award + "what to do next" suggestions (the competitor lacks this; Bruno can drive it)
- [ ] Honest empty state

### 7.2 Team-health stats · ❌ Off the shortlist
- ~~Tabs: Overview / On the field / Tasks / Attendance / Notebook / Checklists / Outreach~~ *(not on the shortlist)*
- ~~Tiles: attendance rate vs RSVPs, task on-time rate, days since last entry, active days + longest streak, best match score~~ *(not on the shortlist)*
- ~~"Needs attention" actions (e.g. "5 of 18 open tasks are missing a due date · Go to Tasks")~~ *(not on the shortlist)*
- ~~Filters by subsystem, subteam, member, season~~ *(not on the shortlist)*
- ~~Season activity heatmap with methodology footnote~~ *(not on the shortlist)*
- ~~Season branch graph (git-style lanes per subsystem linking entries/tasks/meetings/orders)~~ *(not on the shortlist)*

## Phase 8: Money

### 8.1 Budget plan · ✅ Done
- [x] Income/expense ledger, categories, CSV export
- ~~Season budget with category allocations + sub-budgets (Build & Parts → Competition robot / Practice robot / Tools; Travel → Hotels / Food; Outreach; Marketing; Registration; Team ops; Contingency; Other)~~ *(not on the shortlist)*
- ~~Spent-vs-budget per line with progress bars~~ *(not on the shortlist)*
- ~~Team currency setting~~ *(not on the shortlist)*
- ~~Force a category at entry (avoid the competitor's "Uncategorized" problem); bulk categorize~~ *(not on the shortlist)*

### 8.2 Orders pipeline · ⬜ Not started
- [ ] Order requests: items, vendor, part number, qty, price, budget category, subsystem, due date, priority, requester
- [ ] Statuses: Draft → Requested → Approved → Partially ordered → Ordered → Received; Rejected; Cancelled
- [ ] Tabs: All / Drafts / Open / Received / Closed
- [ ] Edits allowed until Ordered
- [ ] Timeline audit trail
- [ ] Group items by vendor; carts
- [ ] Received → optionally add to Inventory (CP-only win)

### 8.3 Approvals · ⬜ Not started
- [ ] orders.approve permission (PR 0.2), "N orders waiting on your approval"
- [ ] Inline Approve / Reject from dashboard and notifications

### 8.4 Paste-a-link autofill · 🟡 Partly done
- [ ] 🟡 REV / goBILDA import exists in Inventory — reuse for orders: name, price, part number, photo from AndyMark, REV, goBILDA, Amazon, generic OpenGraph *(partly done)*

### 8.5 Expenses and receipts · ❌ Off the shortlist
- ~~Receipt upload on any expense~~ *(not on the shortlist)*
- ~~Payment method (team card / cash / personal)~~ *(not on the shortlist)*
- ~~Link expense to an order ("Charged $X of $Y")~~ *(not on the shortlist)*
- ~~Receipt-missing nudges~~ *(not on the shortlist)*

### 8.6 Reimbursements · ❌ Off the shortlist
- ~~Request form: amount, receipt, what for, mailing address + "Use team address"~~ *(not on the shortlist)*
- ~~States with the named blocker ("Waiting on a budget manager's approval") → Approved → Paid, with history~~ *(not on the shortlist)*
- ~~"$ fronted" tag on the roster~~ *(not on the shortlist)*

### 8.7 Donors, sponsors and income · ❌ Off the shortlist
- ~~Donor records with gifts, anonymous donors, Thanked / Thanks pending~~ *(not on the shortlist)*
- ~~Sponsor tiers (priced levels)~~ *(not on the shortlist)*
- ~~Fundraising goals with dates + pipeline Idea → Asked → Committed → Deposited~~ *(not on the shortlist)*
- ~~Donor communication history (link to Communication log; the competitor lacks it)~~ *(not on the shortlist)*

### 8.8 Money overview and reports · ❌ Off the shortlist
- ~~Overview: balance, spent this season, open orders (committed), needs-attention strip, income shown too (the competitor is spend-only)~~ *(not on the shortlist)*
- ~~Reports: budget burn, spend by category / month / vendor / member / subsystem, with drill-down (the competitor's are static)~~ *(not on the shortlist)*
- ~~Sankey money-flow diagram, export PNG + CSV~~ *(not on the shortlist)*

### 8.9 Fiscal sponsorship, donation pages, team cards · ❌ Off the shortlist (dropped by owner)
- ~~Needs legal/ops go-ahead (501(c)(3), payments, cards, fees). Do not build without the owner's call.~~ *(not on the shortlist)*

## Phase 9: Outreach and public presence

### 9.1 Outreach log upgrade · ✅ Done
- [x] Events with hours, location, attendees, funds raised
- ~~Types: In person / Digital / Media / Donation & kits~~ *(not on the shortlist)*
- ~~Audience segments with headcounts (Elementary, Middle, Adults & families, Other FIRST teams, Educators & mentors) + season totals~~ *(not on the shortlist)*
- ~~Photos with captions on entries ("Photos help your awards case")~~ *(not on the shortlist)*
- ~~Recurring outreach; hours derived from event attendance~~ *(not on the shortlist)*
- ~~Award tags (Connect/Reach/Inspire)~~ *(not on the shortlist)*

### 9.2 Outreach planning + partners · ❌ Off the shortlist
- ~~Planning pipeline: Idea / Contacted / Awaiting reply / Confirmed / Scheduled / Dropped~~ *(not on the shortlist)*
- ~~"Chase it" → task, "Schedule" → calendar event~~ *(not on the shortlist)*
- ~~Expected reach marked "Estimates, not evidence"~~ *(not on the shortlist)*
- ~~Partners with contact info~~ *(not on the shortlist)*

### 9.3 Photo collection without accounts · ❌ Off the shortlist
- ~~Shareable upload link (no login) for parents/hosts to drop outreach photos, with moderation~~ *(not on the shortlist)*

### 9.4 Public team profile · ❌ Off the shortlist
- ~~Public `/team/<number>` page: logo, banner (or gradient presets), bio (2000 chars), socials, gallery (12), season stats from FTCScout, events, awards~~ *(not on the shortlist)*
- ~~Profile editor in settings~~ *(not on the shortlist)*

### 9.5 Followers · ❌ Off the shortlist
- ~~Follow by email; send match results, reminders, event recaps~~ *(not on the shortlist)*
- ~~Follow page + QR PNG + printable flyer + Instagram post/story images~~ *(not on the shortlist)*
- ~~Follower count/list (the competitor lacks it)~~ *(not on the shortlist)*
- ~~Composer can post to Members or Followers~~ *(not on the shortlist)*

### 9.6 Contact forms · ❌ Off the shortlist
- ~~Form builder, public form URLs, responses table, Awaiting / Resolved, reply by email, spam protection~~ *(not on the shortlist)*
- ~~Sidebar "N new" badge~~ *(not on the shortlist)*

### 9.7 Website builder  (big) · ❌ Off the shortlist (dropped by owner)
- ~~Block editor (header, hero, stats, awards, CTA, sponsor wall, season recap, footer) with style variants, device preview, accent + light/dark, pages~~ *(not on the shortlist)*
- ~~Custom domains incl. www~~ *(not on the shortlist)*
- ~~Site analytics (views, outbound clicks, country) ~~ *(not on the shortlist)*

### 9.8 Embeds · ❌ Off the shortlist
- ~~Live embeds (rankings, next match, award history) as iframe/snippet for external sites~~ *(not on the shortlist)*

## Phase 10: Library and knowledge

### 10.1 Wiki · ❌ Off the shortlist
- ~~Private team wiki (could be a special notebook book): `[[` page links, @mentions, / blocks~~ *(not on the shortlist)*
- ~~"Promote to wiki" from notebook entries~~ *(not on the shortlist)*

### 10.2 Library hub · ✅ Done
- [x] Links library with categories
- ~~Link open counts, pinned group, sort by most opened, favicons, go/short links~~ *(not on the shortlist)*
- ~~Files page: name, "Used in", size, added; drag-and-drop upload~~ *(not on the shortlist)*
- ~~Images page: All / Unfiled~~ *(not on the shortlist)*
- ~~Storage meter per team + dedup~~ *(not on the shortlist)*
- ~~Version history on files (the competitor lacks it)~~ *(not on the shortlist)*

### 10.3 Global semantic search · ❌ Off the shortlist
- ~~CommandMenu searches pages/actions; notebook has its own search — add search across tasks, events, notebook, wiki, messages, files, orders; typo-tolerant, meaning-based (embeddings)~~ *(not on the shortlist)*

## Phase 11: Communication

### 11.1 Announcements upgrade · ✅ Done
- [x] Post-restricted channels act as announcements; reactions; attachments
- ~~Pinned announcements~~ *(not on the shortlist)*
- ~~Polls~~ *(not on the shortlist)*
- ~~Scheduled posts and silent posts~~ *(not on the shortlist)*
- ~~"Notified: N members" + read receipts (the competitor lacks receipts)~~ *(not on the shortlist)*

### 11.2 Direct messages · ❌ Off the shortlist
- ~~One-to-one and small-group DMs in chat (verify current state first)~~ *(not on the shortlist)*

### 11.3 Shared team email inbox · ❌ Off the shortlist (dropped by owner (no mail reading / Google))
- ~~Real team address (`team@…`), inbound + send-as-team, threads, labels, snooze, star, close, templates, rules, schedule send, undo send, plain text view, remote image blocking, 20 MB attachments, "No one wrote back yet" nudge, assignment~~ *(not on the shortlist)*
- ~~Needs a mail provider + domain decision; the Communication log is the bridge until then~~ *(not on the shortlist)*

## Phase 12: Members and onboarding

### 12.1 Roster upgrade · ❌ Off the shortlist
- ~~Grade, subteam titles (Captain, Build Lead…), open-task count per member~~ *(not on the shortlist)*
- ~~Simple (cards) / Advanced (table) toggle~~ *(not on the shortlist)*
- ~~Show past members (with dates) / invitees~~ *(not on the shortlist)*
- ~~Member custom fields editable in-roster~~ *(not on the shortlist)*
- ~~Role legend (a weak point in the competitor)~~ *(not on the shortlist)*
- ~~Export roster~~ *(not on the shortlist)*

### 12.2 Placeholder members · ❌ Off the shortlist
- ~~Members without accounts, bulk-invite later, merge on sign-up~~ *(not on the shortlist)*

### 12.3 Join codes and team verification · ✅ Done
- [x] Access codes + invite links + join requests
- ~~8-char codes skipping look-alike characters~~ *(not on the shortlist)*
- ~~Verify FTC team number (one-time link in the coach dashboard's Team Website field)~~ *(not on the shortlist)*
- ~~Mentor / coach / parent / alumni role presets~~ *(not on the shortlist)*

### 12.4 Guides and help · ❌ Off the shortlist
- ~~Jobs-to-be-done guides with time estimates (build season, notebook, outreach, budget, competition, sponsors, reading a game manual, drivetrain picking)~~ *(not on the shortlist)*
- ~~Contextual "How to… · N min" link in each module~~ *(not on the shortlist)*
- ~~Sidebar footer: What's new, Help, Send feedback~~ *(not on the shortlist)*
- ~~FAQ: "Do we have to use everything?", "Will this replace Drive?", "What happens to our data if we leave?"~~ *(not on the shortlist)*

### 12.5 Live demo · ⬜ Not started
- [ ] Read-only demo workspace with seeded fixtures, no account, "Create your team / Exit demo" banner

### 12.6 Season rollover · ⬜ Not started
- [ ] Start a new season: archive tasks/notebook/budget by season, carry over roster/roles/templates

## Phase 13: Dashboard

### 13.1 Attention-first overview · 🟡 Partly done
- [x] Dashboard with my work, upcoming, activity, Bruno briefing
- [ ] Automatic vs Custom layout + Customize (add/remove/reorder widgets)
- [ ] "Waiting on a decision" queue with inline Approve/Reject (orders, reimbursements, form responses, review queue)
- [ ] Robot status: per-subsystem open/blocked tasks + "last entry Nd ago" + Set status
- [ ] Event-day widget (rank, last match, next match), alliance-selection card
- [ ] Widgets: checklists, watchlist, coming up, print queue, on the field (OPR, W-L-T), next competition (days out, meetings before), team links row, activity heatmap
- [ ] Stat strip: open tasks, overdue, approvals, days since last entry, next meeting
- [ ] Hide the hero when nothing needs attention; no truncated labels (weak points in the competitor)
- [ ] Sidebar badge counts ("2 new")

## Phase 14: Platform and integrations

### 14.1 Data export · 🟡 Partly done
- [ ] 🟡 Per-page CSV + account export (have) — add a team export builder: Team, Planning, Resources, Scouting, Finance, Stored files; spreadsheets + zip of files/images *(partly done)*

### 14.2 Discord bot · ❌ Off the shortlist
- ~~Link a Discord server; map channels~~ *(not on the shortlist)*
- ~~Two-way sync of tasks and events (create/edit/delete)~~ *(not on the shortlist)*
- ~~Notifications as Discord DMs (PR 0.4 channel)~~ *(not on the shortlist)*
- ~~Slash commands: `/task mine`, `/next`, `/rank`, `/compare`, `/bracket`, `/nearby`, plus `/bruno`~~ *(not on the shortlist)*
- ~~Approval buttons in channels~~ *(not on the shortlist)*

### 14.3 Team API + webhooks · ❌ Off the shortlist
- ~~API keys per team with scopes, documented REST endpoints~~ *(not on the shortlist)*
- ~~Outgoing webhooks (notification channel)~~ *(not on the shortlist)*

### 14.4 MCP server · ❌ Off the shortlist
- ~~MCP server over the Team API so external agents can read/act on team data~~ *(not on the shortlist)*

### 14.5 Event-staff / region-coordinator tools · ❌ Off the shortlist (skipped (unclear scope))
- ~~Unknown scope in the competitor; decide if relevant~~ *(not on the shortlist)*

## Phase 15: Public directory  (separate product) — ~~dropped by owner~~

### Phase items · ❌ Off the shortlist
- ~~Public team directory, event pages, latest results, season high scores / record book, rankings, near-me search, "This week in FTC", claim-this-team, metric explainers~~ *(not on the shortlist)*
- ~~FTCScout + FTC Events data and Predict already exist inside the app; a public face is a strategic call~~ *(not on the shortlist)*

## Phase 16: Gamification

### Phase items · ⬜ Not started
- ~~Points for referrals/usage, monthly leaderboard, cash grants (needs funding decision)~~ *(not on the shortlist)*
- [ ] Cheaper alternative: in-team streaks and badges (no money)

