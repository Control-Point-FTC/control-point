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
