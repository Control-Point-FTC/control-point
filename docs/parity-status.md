# Feature parity: status checklist

Snapshot of `docs/parity-checklist.md` on 2026-10-17, with the owner's decisions applied.

**Overall: about 28% done** (66 done, 0 in an open PR, 10 partly done, 177 to do; 11 not doing). The percentage counts shipped work only: partly done items count as half, and work in an open PR doesn't count until it merges.

Legend: ✅ done · 🔄 in an open PR · 🟡 partly done · ⬜ not started · ❌ / ~~struck~~ not doing

## Owner decisions

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

**Open:** [#283](https://github.com/Control-Point-FTC/control-point/pull/283), the pit display (2.5), in review. Google Calendar inbound sync (2.4) is waiting on the owner: it needs Google credentials to build and test.

## Progress by phase

| Phase | Done | In PR (not counted) | Partly | To do | Not doing | % shipped |
|---|---|---|---|---|---|---|
| 0. Shared foundations (unblocks almost everything else) | 7 | 0 | 4 | 8 | 0 | 47% |
| 1. Tasks overhaul | 29 | 0 | 1 | 3 | 0 | 89% |
| 2. Calendar, events and attendance | 20 | 0 | 1 | 4 | 0 | 82% |
| 3. Engineering notebook upgrades | 3 | 0 | 0 | 20 | 0 | 13% |
| 4. Checklists and 3D printing (new modules) | 0 | 0 | 0 | 19 | 0 | 0% |
| 5. Practice and competition | 0 | 0 | 0 | 11 | 0 | 0% |
| 6. Scouting and event day | 1 | 0 | 1 | 11 | 1 | 12% |
| 7. Awards and stats | 0 | 0 | 0 | 10 | 0 | 0% |
| 8. Money | 1 | 0 | 1 | 27 | 1 | 5% |
| 9. Outreach and public presence | 1 | 0 | 0 | 19 | 3 | 5% |
| 10. Library and knowledge | 1 | 0 | 1 | 7 | 0 | 17% |
| 11. Communication | 1 | 0 | 0 | 5 | 2 | 17% |
| 12. Members and onboarding | 1 | 0 | 0 | 16 | 0 | 6% |
| 13. Dashboard | 1 | 0 | 0 | 8 | 0 | 11% |
| 14. Platform and integrations | 0 | 0 | 1 | 8 | 1 | 6% |
| 15. Public directory  (separate product) | 0 | 0 | 0 | 0 | 2 | — |
| 16. Gamification | 0 | 0 | 0 | 1 | 1 | 0% |

## Phase 0: Shared foundations (unblocks almost everything else)

### 0.1 Season-wide taxonomies · 🟡 Partly done
- [x] Subsystem list per team (defaults: Drivetrain, Intake, Outtake, Arm, Autonomous, Electrical, Chassis, Sensors), editable in settings
- [x] FTC award taxonomy constant (Think, Connect, Reach, Sustain, Innovate, Control, Design, Inspire) with one-line "what judges look for" text per award, in `src/types` so the server can use it
- [x] Shared tag chips and toggle pickers (award chip hover shows judging criteria) — `src/modern/pages/tasks/TaskTags.tsx`
- [x] Tag storage: JSON arrays on each record (`subsystems`, `awards`, `labels`), queryable with `json_each` for rollups
- [ ] Seasons table + season selector component (current season default; past seasons readable)

### 0.2 Permissions expansion · 🟡 Partly done
- [ ] 🟡 Custom roles with colours (have) — add Owner / Manager / Member presets *(partly done)*
- [ ] 🟡 18 permission keys (have) — expand to cover every new module (orders.approve, orders.request, finance.view, donors.manage, printing.manage, checklists.manage, scouting.manage, website.manage, forms.view, inbox.view/send, wiki.edit, settings.manage …) *(partly done)*
- [ ] Finance view rules in the role editor (who can see balances/donors)
- [ ] Inline "needs the X permission" explanations instead of hiding actions
- [ ] Role impersonation ("view as role") for admins
- [ ] 403 page that says who can grant access ("A team manager can grant it from Settings → Roles")

### 0.3 Per-team module switches · 🟡 Partly done
- [x] `teams.disabled_modules` setting: turn whole modules off (every current module; new modules join the list as they ship)
- [x] Sidebar, mobile tabs, the ⌘K search menu and Bruno respect the switches (Bruno sees them in workspace facts and can flip them with a confirm card)
- [ ] Dashboard widgets respect the switches (lands with the Phase 13 dashboard)
- [x] Settings page: toggles with one-line descriptions

### 0.4 Notification engine upgrade · 🟡 Partly done
- [ ] 🟡 Instant/digest/off prefs (have) — move to a per-event × per-channel matrix (in-app / email / push / Discord DM / webhook) *(partly done)*
- [ ] 🟡 PWA manifest + service worker (have) — add Web Push (VAPID) subscriptions, including the iOS home-screen flow with an "Add to Home Screen" help card *(partly done)*
- [ ] Central event catalogue (task assigned, task due, event created, order needs approval, form response, mention, etc.)
- [ ] "Notify members" option on any create action honouring each person's prefs

## Phase 1: Tasks overhaul

### 1.1 Task data model · 🟡 Partly done
- [x] Statuses: To do / In progress / Done / Cancelled (Cancelled kept but hidden by default; "Show cancelled" adds the column)
- [ ] Custom task statuses per team
- [x] Priority: Low / Medium / High / Urgent pills
- [x] Start date (have due date + due time)
- [x] Blocked state + task dependencies ("blocked by an incomplete task" warning)
- [x] Linked tasks ("2 linked")
- [x] Subsystem tags (uses PR 0.1)
- [x] Labels
- [x] Award tags on tasks (uses PR 0.1)
- [x] Completion mode per task: "everyone assigned completes it separately" vs "one deliverable, closed once by whoever finishes"
- [x] Assign-by-role plus smart groups: Everyone, Coaches & mentors, Alumni (from role names; "All members" is the team's Member role)

### 1.2 Task detail panel · 🟡 Partly done
- [ ] 🟡 Side panel/sheet with title, status chip, right rail (State, Priority, Start, Due + "Tomorrow" shortcut, Assignees, Completion, Labels, Subsystem, Awards, Checklist link) — sheet and "Move to tomorrow" / due shortcuts done; checklist link waits for checklists *(partly done)*
- [x] Top actions: Copy link, Watch/Unwatch, Duplicate, Delete, Reopen
- [ ] Rich-text description (bold/italic/strike/code/heading/lists/checklist/link/@mention/photo paste)
- [x] Comments (plain text with @mentions), Ctrl/⌘ + Enter to post, edit/delete
- [x] Activity timeline (opened, status changes, completed, edits)
- [x] Watchers + notifications on comments (assignees follow by default)
- [x] Auto-save on edit (only changed fields, with a "Saving… / All changes saved" status; Done saves anything pending)

### 1.3 Board views and toolbar · 🟡 Partly done
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
- [ ] "Notebook entries" counter on each card (did you write it down?) — needs structured notebook↔task links (Phase 3)
- [x] WIP limits per column (the competitor lacks this; cheap win)
- [x] Insights tab — on-time rate, overdue and missing-due-date "needs attention" (Bruno reads the same numbers)

### 1.4 AI auto-tagging (Bruno) · ✅ Done
- [x] Bruno suggests subsystem / labels / award tags on new tasks, shown as "AI tagged" with an explanation tooltip, one-click undo

### 1.5 Sketchpad on tasks · ✅ Done
- [x] Sketches on a task, drawn with the notebook's ink (pen, highlighter, its colours and pressure-shaped strokes); stored as strokes, so they stay editable

## Phase 2: Calendar, events and attendance

### 2.1 New Event dialog rebuild · 🟡 Partly done
- [x] Event types: meeting, competition, scrimmage, outreach, deadline, social, other
- [x] Start-time quick chips (3:30, 4:00, 5:00, 6:00, 7:00 PM) + "+2h from start"
- [x] Multi-day events ("+ Add another day"; one event per day, each with its own times)
- [x] Location accepts an address or a video-call link (clickable)
- [x] Agenda field (in exports, Bruno's lookup and Bruno's event cards)
- [x] Attendees default to whole team, with role chips to narrow (only they're notified and can RSVP)
- [x] Repeats weekly / recurring series
- [ ] "Notify members" checkbox (uses PR 0.4)

### 2.2 RSVP · 🟡 Partly done
- [x] RSVP style per event: No RSVP / Can't-make-it-only (with reason → auto-excused) / Full RSVP
- [ ] 🟡 RSVP buttons in the event popover and dashboard (done); in notifications (to do) *(partly done)*
- [x] RSVP counts on the event (and who answered; reasons for managers)

### 2.3 Event-linked attendance · ✅ Done
- [x] Attendance by date, linked to today's event (its RSVPs beside each name)
- [x] Sheet "waits until people have had a chance to turn up" (15-minute late window, then one click marks the rest absent)
- [x] Attendance rate vs RSVPs stat (RSVP follow-through in Insights and Bruno's facts)

### 2.4 Calendar polish · 🟡 Partly done
- [x] Month / Week / Agenda views
- [x] ICS subscription feed
- [x] Task-due overlay on the calendar ("2 tasks" day badge, toggleable; due tasks in the day list)
- [x] Event-type filter toggles in the toolbar (already there)
- [x] "Unavailable times" per member (date ranges or weekly slots with a private note; "Away" on clashing events; Bruno lists them and adds or removes your own)
- [x] Mini-month navigator (Week and Agenda views)
- [x] High-contrast event blocks (a "High contrast" toggle, on by itself under prefers-contrast: more: solid fill, full-strength text, thick type bar, finished events struck through instead of faded)
- [x] FIRST event calendar import (official comps added from FTC Events / FTC Scout with one click; re-running skips ones already imported)
- [ ] Google Calendar inbound sync (changes made in Google come back into CP)

### 2.5 Pit display · ⬜ Not started
- [ ] Full-screen kiosk route for a spare screen: agenda, banners, next match, QR check-in
- [ ] Auto-refresh, no-login token link

## Phase 3: Engineering notebook upgrades

### 3.1 Entry metadata · ⬜ Not started
- [ ] "Work happened on" date separate from created date
- [ ] Type chips: Prototype, Build, Code, Test, Outreach, Meeting, Competition, Failure
- [ ] Stage chips: Identify Problem, Brainstorm, Research, Design, Build, Program, Test, Iterate
- [ ] Subsystem chips (PR 0.1)
- [ ] Award chips with judging hover (PR 0.1)
- [ ] Multiple authors per entry + "Written by … · last edited by …" footer
- [ ] Linked records rail: link tasks, events, orders, checklist runs
- [ ] Read-time estimate

### 3.2 Journal and Board views · 🟡 Partly done
- [x] Book/section/page tree
- [ ] Journal view: entries grouped by week ("This week", "Last week"), cards with excerpt, photos, chips, authors
- [ ] Board view: kanban by subsystem, drag to retag, "New entry in X" per column, Alt+arrow move
- [ ] Awards view: entries grouped by award
- [ ] Filters by type/stage/subsystem/author/season

### 3.3 Templates · 🟡 Partly done
- [x] Blank, meeting, to-do, engineering log, design review
- [ ] Add: Test Log, Failure Analysis, Outreach Event, Competition Recap, Code Change, Design Iteration (hypothesis/changes/results)
- [ ] "Start from a template" menu on the notebook toolbar

### 3.4 Mentor review queue · ⬜ Not started
- [ ] Submit entry for review → mentor approves / requests changes, with comments
- [ ] Queue page for reviewers + dashboard count

### 3.5 Export and extras · 🟡 Partly done
- [x] Print / PDF export
- [ ] Judge-ready PDF (cover, TOC, award-tagged sections, filtered by season)
- [ ] Markdown export per entry
- [ ] Bruno auto-tag new entries ("AI tagged" badge with explanation)
- [ ] Contextual guide link "How to keep a great engineering notebook · N min"

## Phase 4: Checklists and 3D printing (new modules)

### 4.1 Checklists module · ⬜ Not started
- [ ] Templates with sections (timed: Morning / Between Matches / End of Day; or category: Power / Electronics / Pit), quantities
- [ ] Starter templates: Pre-match (24), Post-match (9), Pit setup (27), Pit teardown (19), Travel day (12), Robot lockup (14), Competition debrief (8)
- [ ] Runs with names, progress ("2 of 24"), item check-off recording who + time
- [ ] Item assignees
- [ ] N/A and partial states on items
- [ ] Finish run; Reset run with confirmation (a weak point in the competitor)
- [ ] Link a run to an event
- [ ] Run log with Reopen
- [ ] Offline check-off

### 4.2 Checklist automation · ⬜ Not started
- [ ] Auto-start triggers (e.g. "15 min before every match", before an event type)
- [ ] "Write it up": create a notebook entry from a finished run
- [ ] Link a checklist from a task

### 4.3 3D print queue · ⬜ Not started
- [ ] Printers tab: member-owned printers, materials (PLA/PETG/TPU/ABS/Nylon)
- [ ] Request a print: file (.stl from Library/CAD), material + colour, printer, due date, priority
- [ ] Printer owner accepts ("Waiting for the printer's owner to accept")
- [ ] Queue ordering, one-click Mark printing / Mark printed / Failed
- [ ] "Everything" / "I asked for" filters, last-30-days history
- [ ] Print-time estimate + filament inventory link to Inventory (the competitor lacks both)
- [ ] STL preview using the existing CAD 3D viewer (the competitor lacks this)

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

### 5.3 Scoring calculator + kickoff countdown · ⬜ Not started
- [ ] Public scoring calculator for the current game (reuses PR 5.1 config)
- [ ] Kickoff countdown page/widget

## Phase 6: Scouting and event day

### 6.1 Event hub · 🟡 Partly done
- [ ] 🟡 Match scouting templates (have) — wrap them in a per-event hub: This event / Teams / Matches / Strategy / Picklist / Questions / Our robot, with in-page nav (a weak point in the competitor) *(partly done)*
- [ ] Our next matches, current rank, last match result, "you go back at Q25"
- [ ] Starred teams / watchlist with private notes ("Only your team sees this")
- [ ] Privacy labels on every surface (public / team-only / private)

### 6.2 Pit scouting · ⬜ Not started
- [ ] Pit-sheet form (drivetrain, autos, endgame, photo, custom questions)
- [ ] Coverage tracker ("23 of 27"), tap a team to fill
- [ ] Printable pit sheets
- [ ] Custom questions editor for match + pit scouting

### 6.3 Picklist and alliance selection · 🟡 Partly done
- [x] Shortlist/picklist board
- [ ] Live alliance-selection mode: ranked order, mark picked/declined teams as they go, lock the list
- [ ] Playoff bracket from the real alliance structure
- [ ] Advancement points per event

### 6.4 Strategy board · ⬜ Not started
- [ ] Draw a match plan on the field image (reuse notebook canvas), save per match, share link with alliance partners

### 6.5 Crowdsourced event scouting · ❌ Dropped (skipped (cross-team data; belongs in Control Scout))
- ~~Pit codes so other teams fill their own sheet, public event report, coordinator dashboard (cross-team data — decide whether CP wants this)~~ *(not doing)*

## Phase 7: Awards and stats

### 7.1 Awards page · ⬜ Not started
- [ ] One row per award with what judges look for, season selector
- [ ] Evidence rollup from tagged tasks, entries, events, outreach, messages, photos
- [ ] Progress per award + "what to do next" suggestions (the competitor lacks this; Bruno can drive it)
- [ ] Honest empty state

### 7.2 Team-health stats · ⬜ Not started
- [ ] Tabs: Overview / On the field / Tasks / Attendance / Notebook / Checklists / Outreach
- [ ] Tiles: attendance rate vs RSVPs, task on-time rate, days since last entry, active days + longest streak, best match score
- [ ] "Needs attention" actions (e.g. "5 of 18 open tasks are missing a due date · Go to Tasks")
- [ ] Filters by subsystem, subteam, member, season
- [ ] Season activity heatmap with methodology footnote
- [ ] Season branch graph (git-style lanes per subsystem linking entries/tasks/meetings/orders)

## Phase 8: Money

### 8.1 Budget plan · 🟡 Partly done
- [x] Income/expense ledger, categories, CSV export
- [ ] Season budget with category allocations + sub-budgets (Build & Parts → Competition robot / Practice robot / Tools; Travel → Hotels / Food; Outreach; Marketing; Registration; Team ops; Contingency; Other)
- [ ] Spent-vs-budget per line with progress bars
- [ ] Team currency setting
- [ ] Force a category at entry (avoid the competitor's "Uncategorized" problem); bulk categorize

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

### 8.5 Expenses and receipts · ⬜ Not started
- [ ] Receipt upload on any expense
- [ ] Payment method (team card / cash / personal)
- [ ] Link expense to an order ("Charged $X of $Y")
- [ ] Receipt-missing nudges

### 8.6 Reimbursements · ⬜ Not started
- [ ] Request form: amount, receipt, what for, mailing address + "Use team address"
- [ ] States with the named blocker ("Waiting on a budget manager's approval") → Approved → Paid, with history
- [ ] "$ fronted" tag on the roster

### 8.7 Donors, sponsors and income · ⬜ Not started
- [ ] Donor records with gifts, anonymous donors, Thanked / Thanks pending
- [ ] Sponsor tiers (priced levels)
- [ ] Fundraising goals with dates + pipeline Idea → Asked → Committed → Deposited
- [ ] Donor communication history (link to Communication log; the competitor lacks it)

### 8.8 Money overview and reports · ⬜ Not started
- [ ] Overview: balance, spent this season, open orders (committed), needs-attention strip, income shown too (the competitor is spend-only)
- [ ] Reports: budget burn, spend by category / month / vendor / member / subsystem, with drill-down (the competitor's are static)
- [ ] Sankey money-flow diagram, export PNG + CSV

### 8.9 Fiscal sponsorship, donation pages, team cards · ❌ Dropped (dropped by owner)
- ~~Needs legal/ops go-ahead (501(c)(3), payments, cards, fees). Do not build without the owner's call.~~ *(not doing)*

## Phase 9: Outreach and public presence

### 9.1 Outreach log upgrade · 🟡 Partly done
- [x] Events with hours, location, attendees, funds raised
- [ ] Types: In person / Digital / Media / Donation & kits
- [ ] Audience segments with headcounts (Elementary, Middle, Adults & families, Other FIRST teams, Educators & mentors) + season totals
- [ ] Photos with captions on entries ("Photos help your awards case")
- [ ] Recurring outreach; hours derived from event attendance
- [ ] Award tags (Connect/Reach/Inspire)

### 9.2 Outreach planning + partners · ⬜ Not started
- [ ] Planning pipeline: Idea / Contacted / Awaiting reply / Confirmed / Scheduled / Dropped
- [ ] "Chase it" → task, "Schedule" → calendar event
- [ ] Expected reach marked "Estimates, not evidence"
- [ ] Partners with contact info

### 9.3 Photo collection without accounts · ⬜ Not started
- [ ] Shareable upload link (no login) for parents/hosts to drop outreach photos, with moderation

### 9.4 Public team profile · ⬜ Not started
- [ ] Public `/team/<number>` page: logo, banner (or gradient presets), bio (2000 chars), socials, gallery (12), season stats from FTCScout, events, awards
- [ ] Profile editor in settings

### 9.5 Followers · ⬜ Not started
- [ ] Follow by email; send match results, reminders, event recaps
- [ ] Follow page + QR PNG + printable flyer + Instagram post/story images
- [ ] Follower count/list (the competitor lacks it)
- [ ] Composer can post to Members or Followers

### 9.6 Contact forms · ⬜ Not started
- [ ] Form builder, public form URLs, responses table, Awaiting / Resolved, reply by email, spam protection
- [ ] Sidebar "N new" badge

### 9.7 Website builder  (big) · ❌ Dropped (dropped by owner)
- ~~Block editor (header, hero, stats, awards, CTA, sponsor wall, season recap, footer) with style variants, device preview, accent + light/dark, pages~~ *(not doing)*
- ~~Custom domains incl. www~~ *(not doing)*
- ~~Site analytics (views, outbound clicks, country) ~~ *(not doing)*

### 9.8 Embeds · ⬜ Not started
- [ ] Live embeds (rankings, next match, award history) as iframe/snippet for external sites

## Phase 10: Library and knowledge

### 10.1 Wiki · ⬜ Not started
- [ ] Private team wiki (could be a special notebook book): `[[` page links, @mentions, / blocks
- [ ] "Promote to wiki" from notebook entries

### 10.2 Library hub · 🟡 Partly done
- [x] Links library with categories
- [ ] Link open counts, pinned group, sort by most opened, favicons, go/short links
- [ ] Files page: name, "Used in", size, added; drag-and-drop upload
- [ ] Images page: All / Unfiled
- [ ] Storage meter per team + dedup
- [ ] Version history on files (the competitor lacks it)

### 10.3 Global semantic search · 🟡 Partly done
- [ ] 🟡 CommandMenu searches pages/actions; notebook has its own search — add search across tasks, events, notebook, wiki, messages, files, orders; typo-tolerant, meaning-based (embeddings) *(partly done)*

## Phase 11: Communication

### 11.1 Announcements upgrade · 🟡 Partly done
- [x] Post-restricted channels act as announcements; reactions; attachments
- [ ] Pinned announcements
- [ ] Polls
- [ ] Scheduled posts and silent posts
- [ ] "Notified: N members" + read receipts (the competitor lacks receipts)

### 11.2 Direct messages · ⬜ Not started
- [ ] One-to-one and small-group DMs in chat (verify current state first)

### 11.3 Shared team email inbox · ❌ Dropped (dropped by owner (no mail reading / Google))
- ~~Real team address (`team@…`), inbound + send-as-team, threads, labels, snooze, star, close, templates, rules, schedule send, undo send, plain text view, remote image blocking, 20 MB attachments, "No one wrote back yet" nudge, assignment~~ *(not doing)*
- ~~Needs a mail provider + domain decision; the Communication log is the bridge until then~~ *(not doing)*

## Phase 12: Members and onboarding

### 12.1 Roster upgrade · ⬜ Not started
- [ ] Grade, subteam titles (Captain, Build Lead…), open-task count per member
- [ ] Simple (cards) / Advanced (table) toggle
- [ ] Show past members (with dates) / invitees
- [ ] Member custom fields editable in-roster
- [ ] Role legend (a weak point in the competitor)
- [ ] Export roster

### 12.2 Placeholder members · ⬜ Not started
- [ ] Members without accounts, bulk-invite later, merge on sign-up

### 12.3 Join codes and team verification · 🟡 Partly done
- [x] Access codes + invite links + join requests
- [ ] 8-char codes skipping look-alike characters
- [ ] Verify FTC team number (one-time link in the coach dashboard's Team Website field)
- [ ] Mentor / coach / parent / alumni role presets

### 12.4 Guides and help · ⬜ Not started
- [ ] Jobs-to-be-done guides with time estimates (build season, notebook, outreach, budget, competition, sponsors, reading a game manual, drivetrain picking)
- [ ] Contextual "How to… · N min" link in each module
- [ ] Sidebar footer: What's new, Help, Send feedback
- [ ] FAQ: "Do we have to use everything?", "Will this replace Drive?", "What happens to our data if we leave?"

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

### 14.2 Discord bot · ⬜ Not started
- [ ] Link a Discord server; map channels
- [ ] Two-way sync of tasks and events (create/edit/delete)
- [ ] Notifications as Discord DMs (PR 0.4 channel)
- [ ] Slash commands: `/task mine`, `/next`, `/rank`, `/compare`, `/bracket`, `/nearby`, plus `/bruno`
- [ ] Approval buttons in channels

### 14.3 Team API + webhooks · ⬜ Not started
- [ ] API keys per team with scopes, documented REST endpoints
- [ ] Outgoing webhooks (notification channel)

### 14.4 MCP server · ⬜ Not started
- [ ] MCP server over the Team API so external agents can read/act on team data

### 14.5 Event-staff / region-coordinator tools · ❌ Dropped (skipped (unclear scope))
- ~~Unknown scope in the competitor; decide if relevant~~ *(not doing)*

## Phase 15: Public directory  (separate product) — ~~dropped by owner~~

### Phase items · ❌ Dropped
- ~~Public team directory, event pages, latest results, season high scores / record book, rankings, near-me search, "This week in FTC", claim-this-team, metric explainers~~ *(not doing)*
- ~~FTCScout + FTC Events data and Predict already exist inside the app; a public face is a strategic call~~ *(not doing)*

## Phase 16: Gamification

### Phase items · ⬜ Not started
- ~~Points for referrals/usage, monthly leaderboard, cash grants (needs funding decision)~~ *(not doing)*
- [ ] Cheaper alternative: in-team streaks and badges (no money)

