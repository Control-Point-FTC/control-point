# AGENTS.md

How coding agents (Claude Code and others) work in this repository. Rules are
numbered so code comments and reviews can cite them; add new rules at the end
and never renumber.

## Workflow

1. **Every change goes through a pull request.** Branch from `main`, push, and open the PR against `Control-Point-FTC/control-point`:
   `gh pr create -R Control-Point-FTC/control-point --head <branch>` (without `-R` gh may pick a fork).
2. **Greptile review to 5/5.** Trigger with a `@greptile review` comment, fix every finding, and reply on and resolve each thread. Merge only when the latest Greptile review is on the PR's **current head commit**, scores **5/5**, and **0 threads are unresolved**.
3. **Merging deploys.** A merge to `main` runs "Deploy to Oracle VM". After **every** merge, docs-only ones included, check that the run for that merge commit succeeded (`gh run list -R Control-Point-FTC/control-point --workflow "Deploy to Oracle VM" -L 1`) and that https://tryctrlpoint.org serves the new bundle (`index-*.js`). If it failed, read `gh run view <id> --log-failed` and fix it before merging anything else: a failed deploy silently leaves production on the old build.
4. **Tests and types before pushing.** `npm run lint` (tsc) and the relevant `npx vitest run <files>`. A bug fix comes with a test that fails on `main` and passes on the branch. Server tests start a real server (`server/__tests__/helpers/testServer.ts`); Bruno flows can be scripted end to end with the fake model in `server/__tests__/brunoFakeModel.test.ts`.

## Screenshots and verification

5. **User-visible changes ship with screenshots, captured before the PR opens.** If the diff changes anything a member sees (pages, components, styles, copy, or Bruno's visible replies), the PR body embeds at least one screenshot of the rendered change inline, before/after when the change is visual. A link out, a screenshot of code, or a promise to demo later does not satisfy this. A PR with no user-visible change writes "No user-visible change." in the template's Screenshots section rather than deleting it, so the reviewer sees the claim and can disagree.
6. **Capture the evidence yourself, then attach it with gh.** Run the app (`npm run dev`, or the live site for read-only views), capture the screen with the browser tooling, and save the images **outside the repository** (a temp or scratch directory; never commit screenshots for a PR). Attach them with the GitHub CLI (2.101 or newer; `gh --version`):
   ```bash
   gh pr create -R Control-Point-FTC/control-point --head <branch> --body-file body.md \
     --attach './before-tasks.png#Task sheet before' --attach './after-tasks.png#Task sheet after'
   ```
   A body that references `![alt](./after-tasks.png)` has the reference rewritten to the uploaded asset. `gh pr edit --attach` and `gh pr comment --attach` work the same way. Name files `before-…`/`after-…` so pairs are obvious. Do not open the PR and hand the missing media back as a TODO.
7. **Verify on production after the deploy, with evidence.** Once the deploy for the merge succeeds, check the change on https://tryctrlpoint.org and post a verification comment on the PR with a screenshot (`gh pr comment <n> --attach …`). Say plainly what could not be checked and why (for example, a race that can't be forced on a fast connection, or video that won't load in a hidden automation tab).

## Production safety

8. **Never touch real workspaces or team data.** Test on production only in a disposable workspace you created (for example "V5 Audit Team - DELETE ME"), with test data prefixed `ZZ-DELETE-ME`. The browser session may be shared with the owner: confirm `/api/auth/me` returns the expected `team_id` before every write, and don't switch the owner's active workspace without asking.
9. **No credentials.** Never type passwords, API keys or tokens anywhere; the owner signs in. Don't create production accounts.
10. **Permanent deletes are the owner's.** Emptying trash, deleting workspaces or chats on production: describe the steps and let the owner do them.

## Code conventions

11. **Migrations** live in `migrations/versions/NNN-description.sql`, one logical change each, idempotent where possible, wrapped in `BEGIN; … COMMIT;` when they have more than one statement (the runner applies a file as one batch and records it only on success).
12. **Line endings.** Many files are CRLF; keep each file's existing endings when editing.
13. **No spaces in file names.** The deploy and other scripts pass paths around in shell; a space has already broken deploys once (#230/#235).
14. **The server ships `src/`.** `server.ts` imports shared modules from `src/types`, `src/utils` and `src/notebook`; deploys copy them (see `.github/workflows/deploy.yml`). `docs/` is not shipped.
15. **Bruno's honesty rules** live in `ai.ts` (`BUILD_HELPER_SYSTEM`) and are pinned by `server/__tests__/brunoRules.test.ts`. Never weaken what Bruno can do to save cost.
