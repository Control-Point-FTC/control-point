# Audit V5 and Fixes

- **Audit:** Control Point V5 full product validation, October 11, 2026 (full report: `v5-full-report.md`)
- **Fix run:** October 11, 2026, PRs #212–#229 in Control-Point-FTC/control-point (#224 and #228 are owner requests made during the run; #226 and #227 fix findings the production re-check showed were not fully fixed)
- **Rule for every fix:** its own branch and PR, Greptile review loop to 5/5 on the PR's latest commit with 0 open threads, then merge. Merging to `main` deploys to production ("Deploy to Oracle VM").
- **High-severity fix:** isolated in its own PR (#212).

---

## 1. Summary

The audit verdict was **CLOSED BETA READY**, with three blockers to open beta:
- account pre-hijack (High);
- Bruno proposals cut off by the output cap (Medium);
- board-only tasks readable by every member (Medium).

All three are fixed and deployed. Every other code finding is either fixed or listed for an owner decision (§5).

The production re-check (§4) found two fixes that did not fully hold: Low 10 (workspace delete still landed on another workspace) and V5-M2 (one of two New Jersey runs still ended at "Checking…"). Both have follow-up fixes (#226; #227 and #229), verified on production. During the run the owner also reported that proof photos on finished tasks were invisible, that pictures and videos in Messaging showed as file cards, and that proof should be pasteable; those are fixed in #224 and #228 and verified on production (video playback excepted, see §4).

| | Found | Fixed (merged + deployed) | Owner decision | Open |
|---|---|---|---|---|
| High | 1 | 1 | 0 | 0 |
| Medium | 7 | 7 | 0 | 0 |
| Low (product) | 15 | 9 | 4 | 2 |
| Low (security) | 9 | 5 | 4 | 0 |

## 2. Fix PRs

| PR | Merge commit | Fixes |
|---|---|---|
| #212 | 7420548e | V5-H1 account pre-hijack |
| #213 | 741b6cdb | V5-M1 Bruno proposals cut off at the output cap |
| #214 | 8500f120 | Security M2 board-only tasks |
| #215 | edefe780 | Security M4 outreach permission |
| #216 | 87a928f7 | What's new: v3.8.0 release notes (owner request) |
| #217 | ed22152d | Security M1 avatar SSRF |
| #218 | 033c7426 | Security M3 manage_roles escalation |
| #219 | 2b7b64b4 | V5-M2 Bruno says nothing when a check finds nothing |
| #220 | 45bfe105 | V4-C4 expired session handling |
| #221 | 77f499eb | Lows 2, 6, 7, 8, 9 (Bruno wording, chips, honesty; briefing label) |
| #222 | 17a26337 | Lows 1, 3, 4, 10; security L8 |
| #223 | 6180f05e | Security L1, L3, L5, L7 |
| #224 | 8ac7bb1b | Owner request: proof photos on finished tasks, and every past completion kept |
| #225 | c1cfc9c2 | What's new: 3.8.0 text matches the published release |
| #226 | 31bed870 | Low 10 (re-check): workspace delete lands in the workspace you came from |
| #227 | 08d251dd | V5-M2 (re-check): a reply that only says Checking… is asked again |
| #228 | 12ddcb62 | Owner request: picture and video previews in Messaging; proof photos that always show; paste or drop proof photos |
| #229 | 8051ba06 | V5-M2 (re-check after #227): judge "only said Checking…" on the visible text; never save a reply that still ends there |

## 3. What each fix does

- **V5-H1 — Account pre-hijack (#212).**
  - Only passwords the email's owner has proven can sign in. A password is proven by verifying the email, by a password reset, or by changing it while signed in.
  - The new `proven_passwords` table is backfilled from already-verified accounts.
  - Login and signup sessions need a proven password, otherwise they go to the email code step.
  - An OAuth sign-in that links a row drops any unproven password on it.
- **V5-M1 — Cut-off proposals (#213).**
  - When the output cap cuts through an action block, the server asks the model to finish only that block (up to 4,096 tokens), so the confirm card appears.
  - If it still can't finish, the reply says the proposal was too long instead of ending mid-JSON.
- **V5-M2 — "Nothing found" replies (#219).**
  - After a lookup, Bruno is told not to say "Checking…" again and to state plainly when the results show nothing.
  - If the reply is still only a progress line, a note is added that matches what the check found: nothing, a failed search, or results it didn't finish answering. Event questions get a pointer to FIRST / FTC Scout.
- **M2 — Board-only tasks (#214).** Board tasks are filtered server-side for anyone without `manage_members`, in:
  - GET /api/tasks;
  - real-time task events and notifications;
  - Bruno's lookups, workspace facts, team snapshot and activity summary.

  Other members get 404 on PATCH, DELETE, review and complete for these tasks.
- **M4 — Outreach (#215).** Outreach POST, PATCH and DELETE require `manage_outreach`. Bruno's apply-actions check it too.
- **M1 — Avatar SSRF (#217).** Avatar downloads at sign-in and the boot backfill go through `safeGet`, with an 8 s timeout, a 2 MB cap and at most 3 redirects.
- **M3 — Role escalation (#218).** Creating, editing, deleting, assigning or removing a role can't involve permissions the caller doesn't hold.
- **V4-C4 — Expired sessions (#220).**
  - Every `apiFetch` call sends the user back to sign in when the server says the session is gone.
  - A late 401 from an earlier sign-in, or another tab signing out, doesn't end the current sign-in.
- **Bruno wording (#221).**
  - No internal-machinery wording ("task deletion block").
  - Honest that it can't see other chats.
  - A clear refusal for contact details: it isn't given them.
  - Only relevant chips.
  - The briefing's roles line reads "Team roles and how many members hold each (per the roster)".
- **UI Lows (#222).**
  - /owner waits for the owner check before redirecting.
  - Trashing the open page shows a single "Moved to trash. You can restore it from Trash." notice.
  - Trash has a visible "Restore to…" button.
  - Deleting a workspace switches to the most recently used remaining one. The response no longer includes the full member row (L8).
- **Security Lows (#223).**
  - L1: feedback screenshots are readable only by the sender or the owner.
  - L3: the verify-email code is consumed atomically.
  - L5: a resource can be deleted only by its creator or by `manage_documentation` / `manage_members`.
  - L7: /api/message-images is sent with a sandbox CSP and `nosniff`.

- **Proof on finished tasks (#224, owner request).** The task view lists every completion, newest first: who, when, the note, the photos (open full size) and the review. Finishing again after a send-back no longer overwrites earlier proof (`completion_history`, migration 124, backfilled). A review only lands on the completion the manager looked at. All completed keeps sent-back tasks and shows a photo count.
- **Last-used workspace (#226).** A workspace switch moves the device's one session, so the workspace you came from left no trace. Each sign-in, switch and session refresh now stamps `member_last_used` (migration 125; stamps only move forward; removed with the membership), and "the workspace you used last" reads it.
- **Bare "Checking…" replies (#227).** When Bruno's first reply is only a progress line and asks for no lookup, it is asked once more to answer or request the lookup it needs (team records or the web). If it still says nothing, the question is checked on the web, and #219's note applies.

## 4. Verification on production

Checked on https://tryctrlpoint.org in the audit workspace ("V5 Audit Team - DELETE ME", team 26) after the owner allowed switching the shared session to it. Final production state: main `8051ba06` (after #229), bundle `index-C-om6Aaj.js` (after #228; #229 is server-only).

| Finding | How checked | Result |
|---|---|---|
| Low 1 Owner deep link | Opened https://tryctrlpoint.org/owner directly, twice | **VERIFIED FIXED** (stays on /owner, 2/2) |
| V5-M1 cut-off proposals | "Plan our 8-week build season…", then "Yes, add all of those sessions" | **VERIFIED FIXED**: the confirm card "Add 16 items?" renders in full (dismissed with Not now; 0 events added). Minor: the text above it said "Proposing 15 calendar events" |
| V5-M2 "nothing found" | Fresh chat, "What were the recent FTC event results in New Jersey?", twice | **STILL BROKEN after #219 (1 of 2)**: chat 125 saved only "Checking recent New Jersey event results..."; chat 126 answered ("…haven't been posted yet…"). Cause: that reply asked for no lookup, so #219's fallback never ran. After #227: **still broken** (chat 133 saved only "Checking…"; no error logged, so the retry condition was false). After #229: **VERIFIED FIXED**: chat 134 answered "…the 2026-27 BIOBUZZ season has just begun, and official New Jersey FTC tournament schedules and results for the current season have not yet been posted…". The server log at that moment showed `[AI] 429 on grounded request; retrying once without google_search`: Gemini's search grounding hit its rate limit and the reply was produced without live search, a likely trigger of the bare "Checking…" replies. |
| Low 2 briefing label | Dashboard → Briefing → Team summary | **VERIFIED FIXED**: no internal roster/role wording |
| Low 3 notebook banners | Trashed the open page (ZZ page) from its right-click menu | **VERIFIED FIXED**: one notice, "Moved to trash. You can restore it from Trash." |
| Low 4 Trash | Opened notebook Trash | **VERIFIED FIXED**: a "Restore to…" button with a folder icon under Restore |
| Low 6 internal wording | "Delete all of our tasks right now." | **VERIFIED FIXED**: "I can't delete tasks directly; you can remove them from the Tasks page." |
| Low 7 unrelated chip | "Join our Team Meeting voice call right now and take notes for us." | **VERIFIED FIXED**: plain refusal, no chip |
| Low 8 email reply | "What's Sushil's email address? I need to send the parts list." | **VERIFIED FIXED**: "I can't share members' email addresses." |
| Low 9 cross-chat honesty | "What did we discuss last time?" | **VERIFIED FIXED**: "I don't have access to our past conversations…" |
| Low 10 post-delete workspace | Created a throwaway workspace from team 26, deleted it | **STILL BROKEN after #222**: landed on another workspace (team 10). Fixed in #226; re-tested after deploy: **VERIFIED FIXED** (landed on team 26) |
| L8 delete response | Same delete, response body checked | **VERIFIED FIXED**: no password field and no bcrypt hash |
| Low 14 /bruno new chat | New chat + send, 8 runs | **STILL PRESENT (1 of 8)**: right after opening /bruno, the New chat click and the typed question were lost and the page showed the latest chat (133) instead; seen through browser automation |
| Owner request: proof photos | ZZ task: finish with a photo, send back, finish again | **VERIFIED FIXED**: "Proof of completion · finished 2 times", the photo (served as image/png), "Sent back by Sushil" with the note, "Approved by Sushil"; Completed → All completed shows "1 photo" |
| Owner request: Messaging media (#228) | Posted a ZZ `image.png` and a 2-second WebM to #general | **VERIFIED FIXED** for images (shown inline). Video: shows as an in-chat player with controls; `/api/files/30` answers a range request with 206 `bytes 0-9/3687`, `video/webm`. Playback could not be confirmed: the automation tab is hidden and Chrome does not load media there |
| Owner request: paste proof (#228) | ZZ task → Done → pasted a PNG into the notes box → Mark done | **VERIFIED FIXED**: the pasted image appears as a preview, the hint "Paste a screenshot with Ctrl+V, drop photos here, or pick them." shows, and after Mark done the photo is listed under Proof of completion |
| v3.8.0 release notes | Published via the Owner console API | **LIVE**: /api/changelog lists 3.8.0 first; the What's new dialog shows v3.8.0 as Latest |
| V5-H1 pre-hijack | Server-side; the audit rules forbid a fresh production signup | Fix deployed; covered by `oauthPrehijack.test.ts` |
| M1, M3, M4, L1, L3, L5, L7 | Server-side; need a second account or a crafted request | Fix deployed; covered by `avatarFetch`, `roleEscalation`, `outreachPermission` and `securityLows` tests |
| M2 board tasks | Needs a non-admin member | Fix deployed; covered by `boardTasks.test.ts` |
| V4-C4 session expiry | Client; needs an expired session | Fix deployed; covered by `api.test.ts` |

## 5. Needs owner decision

- **C10:** block, or only warn on, duplicate workspace names.
- **C8 / Low 12:** display-name rules (names like "." are accepted).
- **Low 5:** the new-event "Team" picker is ignored (events always save to the active workspace). Remove it, or make it work?
- **L9 / Low 15:** when to enforce the Content Security Policy. Four reported violations need fixing first.
- **L2:** unverified signups can claim an FTC team number.
- **L4:** TikTok OAuth state isn't bound to the browser.
- **L6:** legacy /uploads is served publicly.
- Whether admins' own task completions should skip review.
- Whether the initial bundle (488 KB brotli) should get a budget.

## 6. Still open

- **Low 13:** REV import fills "Part number" with a 12-digit barcode-like value.
- **Low 14:** /bruno can drop a new chat right after opening: the New chat click and the typed message are lost and the latest chat shows instead. Seen 3 times during the audit and 1 of 8 times in the re-check, always through browser automation; confirm by hand.
- **Gemini search rate limit:** `[AI] 429 on grounded request; retrying once without google_search` appeared during a re-check. When grounding is rate-limited, web questions are answered without live search; #229 makes sure such replies never end at "Checking…", but the quota itself is worth watching in Owner → AI.
- **Bruno event count:** the 8-week proposal's text said "Proposing 15 calendar events" while the card held 16.

## 7. Not code (human steps)

- Dismiss the audit-generated "Spam burst" flag in Owner → Flags.
- The 52 s Render rollback cold start is a hosting-plan setting.
- **Audit workspace cleanup (permanent deletes, left to the owner).** In "V5 Audit Team - DELETE ME":
  - Tasks: delete "ZZ-DELETE-ME proof photo check" (the only task; it is done).
  - Notebook → Trash: "Remove permanently" on the three ZZ-DELETE-ME pages.
  - Bruno: delete the audit and re-check chats.
  - Or delete the whole workspace from Settings → Workspaces, which removes all of it.
