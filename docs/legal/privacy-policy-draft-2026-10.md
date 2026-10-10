# Privacy policy — proposed additions (draft for owner approval)

**Status:** draft. Nothing here is live. The published policy is `src/Legal.tsx`
(effective September 29, 2026). Once you approve or edit this, the sections
below get added there and `EFFECTIVE_DATE` is bumped.

**Why:** the October 10 production audit found that the live policy says nothing
about AI (Bruno), file uploads, browser storage or analytics. Its meta
description already promises AI and files. It also names hosting ("Render and
Turso") that may be out of date.

**Owner to confirm (marked ⚠ below):**
- where the database and the app are hosted;
- whether both AI providers are in use;
- how long uploaded files are kept after deletion.

---

## AI features (Bruno)

Bruno, the in-app assistant, answers questions and drafts content when you ask it
to. To do that, we send your message and the team information Bruno needs to
answer, such as tasks, events or the notebook page you're looking at, to an AI
model provider (⚠ Google Gemini and Anthropic). These providers process the
request to produce an answer.

- Bruno never reads notebook pages or sections that are protected for admins.
- Bruno changes your notebook only after you confirm a proposed change.
- We don't use your team's content to train AI models, and we don't share it for
  advertising.
- The app owner can turn AI off for members, and usage limits apply.

## Files you upload

Files and pictures you add to tasks, notebooks or other parts of the app are
stored with our file storage provider (⚠ Cloudflare R2). Who can open a file
depends on where it was added:

- Files on tasks and other team records: members of your team.
- Notebook attachments: team members who can see that notebook page (pages
  protected for admins only show their files to admins).
- Profile pictures: any signed-in user of the app, so they can appear next to
  your name.
- The app owner can open files across teams to run and support the service.

(⚠ owner: confirm these access rules before publishing.) Deleted notebook
content goes to the notebook trash first. Files are removed when that content is
permanently deleted (⚠ confirm retention).

## Notebook

Team notebooks store the pages, drawings, comments and attachments your team
creates. Pages protected for admins are visible only to team admins. A notebook
can be exported by team members who can see it.

## Information stored in your browser

We keep a small amount of information in your browser to run the app. This
includes your sign-in session cookie (required), and preferences such as theme,
layout, notebook view settings, favourite pens and unsaved drafts of personal
sticky notes. Your cookie choice is saved in the browser as well.

To let you keep working offline, the app also saves copies of notebook pages
you open (their title and content) and the notebook's page list in your
browser's storage on that device. These copies stay on the device until you
sign out or clear your browser data.
On a shared computer, sign out when you’re done.

We don’t use advertising or cross-site tracking cookies.

## Website analytics

To understand how many people visit our public pages (home, privacy, terms and
"How Predict works"), we count page views with our own counter.

- It uses no cookies and stores nothing in your browser.
- It doesn't record IP addresses, device details or any identifier. We keep only
  the total number of views per page per day.
- If your browser sends Do Not Track or Global Privacy Control, the visit isn't
  counted.
- Pages inside team workspaces are never counted.

## Storage and security (replacement text)

Data is hosted in the United States (⚠ confirm: application servers on Oracle
Cloud; database on Turso or the same servers; files on Cloudflare R2). Access
tokens for connected accounts are encrypted with a server-side key. While we take
reasonable measures to protect your information, no internet service is
completely secure.

## Contact

Unchanged: Sushil.m@icloud.com.
