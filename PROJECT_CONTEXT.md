# CUI Connect: project context and handoff

> **For a new Claude Code session:** read this whole file before doing anything. It holds:
> - the assignment and the plan the user approved;
> - everything already built and verified;
> - the work in progress;
> - the ordered list of remaining tasks;
> - the conventions (including **push to GitHub after every completed task**).
>
> **Last updated:** Thursday 2026-10-08, about 21:15 Pakistan time. **All remaining work is done.**
> **Deadline:** **Friday 2026-10-09, morning.**
> **Repository:** https://github.com/abdullahasghar966/cui-connect (public), branch `main`.

**Prompt to paste into a new session** (from this project folder):

```
Read PROJECT_CONTEXT.md first. Continue with "Remaining work" in order, using the
build → test → verify loop. After each completed task: run the gates, commit,
and push to GitHub (origin main). Explain anything I need to decide in simple terms.
```

---

## 1. Status at a glance

| Item | State |
|---|---|
| Assignment features (users, groups, communication boundaries, realistic COMSATS model) | **Done and verified** |
| Approved plan, phases 0–7 (backend, web app, admin console, E2E, docs) | **Done** |
| QA pass + extras (enrollment manager, edit user, fixes) | **Done** (commit `b4c916e`) |
| UI redesign ("make it look production-level": Slack-style workspace, Emerald accent) | **Done.** Visual review of all 27 screens (light, dark, mobile), fixes, new doc screenshots, README + ARCHITECTURE updated |
| Start from scratch + remote access (user request, 2026-10-08 night) | **Done.** `npm run setup` (empty campus + own admin; demo list hidden unless the DB holds the demo campus) and `npm run share` (production server + Cloudflare quick tunnel; cookie becomes Secure over HTTPS). cloudflared 2026.10.0 installed via winget. The auto-mode classifier blocks Claude from opening the tunnel itself: **the user runs `npm run share`**. The Claude Terminal panel fails to start on this machine (missing shell-integration file) |
| Final verification | **Done.** All gates green, `npm run build` + `npm start` smoke test as two users (localhost + 127.0.0.1): live message and live delete |
| Lint (Biome) / typecheck (TS 7) | Green |
| Unit + integration tests (Vitest) | **123 / 123 passing** (78 policy + 45 server integration) |
| End-to-end tests (Playwright) | **9 / 9 passing**; 3 utility specs are skipped by design |
| `npm audit` | 0 vulnerabilities |
| GitHub | Public repo `abdullahasghar966/cui-connect`. All work up to this file is pushed |

## 2. The assignment and the user's instructions

**Assignment** (Lab Assignment 1, CLO-5, Advanced Web Technologies, source file `Lab Assignment 1.docx`):

> "Create a communication system for Comsats University Islamabad using Socket.io. In this system, different users can be added, and their groups can be created. Communication boundaries should be in place so that we can define who can communicate in which group. Take realistic requirement of communication in COMSATS and implement it."

**The user's instructions, quoted verbatim:**

1. "analyse this docx file what's written in it and give me best of the best plan for building it using best and efficient tech stack. You will start building only when i approve the plan. Use build test verify loop. use plan mode too. Use 100% of Claude Code OPUS 5.5 capability."
2. Choices, made after plain-language explanations ("explain me this first in simple terms"):
   - **MongoDB + Mongoose**, with an embedded fallback so no install is needed;
   - **TypeScript**;
   - **Full realistic scope**;
   - extra deliverables: **README + architecture docs only** (no Word report, no demo script).
3. "i have time till friday morning keep this in mind too"
4. Plan **approved**; the full text is in Appendix A.
5. "ok it running uptill now. do the test for yourself too and make sure everything is working and continue building remainings and tell me what i need to do". This led to a full QA pass, fixes, the enrollment manager and the edit-user dialog (commit `b4c916e`).
6. "it looks like AI SLOP. Change the theme and make it look real Production level project". The user chose layout **"Workspace (Slack-style)"** and colour **"Emerald"**. This redesign is the work in progress.
7. "how many security layers are there in this project?" Answered: 12 layers (see §7).
8. "give me everything in detail in one .md file … create public repo on github and push everything … Then automatically start pushing everything being completed one by one". This file, the repo, and the push-after-each-task rule.

**Working style:**
- Plan first and get approval.
- Build → test → verify, with a commit per green step.
- Explain choices in **simple terms** before asking.
- The user must be able to **defend the work in a viva**.

## 3. What CUI Connect is

A real-time communication system for COMSATS University Islamabad:
- **Server:** Express 5 + Socket.IO 4.8 + MongoDB/Mongoose.
- **Web:** React 19.
- **Shared:** TypeScript packages for types, schemas and rules.

University structure (departments → sections → course offerings, plus offices and societies) **provisions groups automatically**. A pure, shared **policy engine** decides who can read, post, join, moderate and DM. The **server enforces it** on every Socket.IO event and REST call; the UI only uses it to explain disabled actions.

### Roles and the COMSATS model
- **admin:** IT Services.
- **faculty:** with `isHOD`; batch advisor of sections.
- **staff:** with an office: Director's Office, Examination Office, Student Affairs, Admissions, department office.
- **student:** registration number like `FA23-BCS-001`, a section, and `isCR` for class representatives.
- **Membership roles:** owner / moderator / member, plus `mutedUntil`.
- **Group types:**

| Type | Members | Who can post |
|---|---|---|
| CAMPUS_ANNOUNCEMENT | everyone | Director's Office + IT (moderators) |
| DEPARTMENT_ANNOUNCEMENT | the department | HOD + department office |
| FACULTY_LOUNGE | department faculty only (students can never be added) | all members |
| SECTION | section students + batch advisor (moderator) | all members |
| COURSE | instructor (owner) + enrolled students, repeaters allowed | all members; the instructor can lock it |
| CR_COUNCIL | CRs + HOD | all members |
| SOCIETY | open to join | configurable |
| CUSTOM | invite only, `eligibleRoles` | `all` / `moderators` / chosen `roles[]` |
| DIRECT | exactly two people | while the DM rules allow |

**DM rules:**
- Students can message their instructors, batch advisor, HOD, department peers, people who share a group with them, and any office.
- Students can't message IT admins or unrelated faculty.
- Faculty can message colleagues, admins, offices, students of their department and students they teach.
- Staff and admins can message anyone.
- **Reply rule:** anyone may reply to a conversation the other person started.
- Admins **cannot read DMs**.

## 4. Feature inventory (all verified)

**Real-time (Socket.IO)**
- Rooms `user:<id>` and `group:<id>`, plus the `/admin` namespace (admins only).
- Typed events with acknowledgements `{ok,data}` / `{ok:false,code,message}`.
- Optimistic send with `clientId`, so retries are idempotent.
- Typing indicators, presence (scoped to conversational groups) and unread counts.
- Read receipts: "Seen" in DMs, plus cross-tab sync.
- Live membership changes: `socketsJoin` / `socketsLeave`, `group:added` / `group:removed`.
- Live lock, mute and delete.
- Session revocation on deactivation or password reset.
- `connectionStateRecovery` (2 minutes) and reconnect with refetch.
- Per-socket token-bucket rate limit; Zod validation on every payload.

**Chat UI**
- Sidebar with sections.
- Notice-board style for announcement channels.
- Composer that explains why it's disabled.
- Members panel with moderation (mute 15 min / 1 h / 1 day, roles, remove).
- New-message directory listing only allowed people.
- Browse/join/leave societies.
- Dark mode, mobile layout, infinite scroll upward.

**Admin console**
- Overview: live stats and blocked attempts.
- Users: create, CSV import, **edit details**, move a student to another section (groups swap live), CR/HOD flags, reset password, deactivate/reactivate.
- Structure: departments, sections with batch advisors, course offerings, and the **enrollment manager** (repeaters from other sections).
- Groups & rules: policy editor and members.
- Live audit log.

**Security (12 layers, see §7).** Highlights:
- argon2id password hashing.
- httpOnly SameSite JWT cookie with `tokenVersion` revocation.
- helmet CSP.
- Rate limits.
- Zod validation.
- Policy engine and room isolation.
- XSS-safe rendering.
- Audit without message bodies.

## 5. Architecture quick reference

```
packages/shared/src/  constants.ts · policy.ts (+ policy.test.ts) · schemas.ts (Zod) · dto.ts · events.ts (typed Socket.IO maps)
apps/server/src/
  config/   env.ts (Zod-validated env; JWT secret auto-generated to .data/jwt-secret) · paths.ts
  db/       embedded.ts (mongodb-memory-server, persistent) · resolve.ts · embedded-cli.ts (npm run db)
  models/   User · Department · Section · CourseOffering · Group · Membership · Message · AuditLog
  auth/     password.ts (argon2id) · session.ts (jose JWT, cookie) · middleware.ts (requireAuth/requireAdmin)
  services/ provisioning.ts (groupKeys, reconcileUser) · direct.ts (DM facts, directory, openDirect)
            messages.ts · moderation.ts · users.ts (CSV import, edit) · structure.ts (sections, courses, enrollment)
            groups.ts (per-viewer GroupDTOs) · mappers.ts · audit.ts
  realtime/ io.ts (handshake auth, /admin ns) · handlers.ts (all events) · notifier.ts (room joins, broadcasts)
            presence.ts · rateLimit.ts · stats.ts · types.ts
  http/     app.ts (helmet, static SPA in prod, error handler) · routes/{auth,api,admin}.ts
  seed/     data.ts (demo campus) · seed.ts · cli.ts
  server.ts (startServer) · index.ts
apps/server/test/  auth · provisioning · realtime (+ helpers, globalSetup with in-memory mongod)
apps/web/src/
  lib/      api.ts · socket.ts (getSocket, withAck, connectAdminSocket) · cache.ts (React Query patches) · theme.ts · utils.ts
  hooks/    queries.ts · useRealtimeSync.ts (socket → cache) · useChatActions.ts · useAdminFeed.ts · useSignOut.ts · useDebounced.ts
  state/    realtime.ts (presence/typing) · ui.ts (switcher/dialog state)
  components/ ui/{button,form,badge,dialog,menu} · people.tsx · group-meta.tsx · feedback.tsx
              AppRail.tsx · Logo.tsx · QuickSwitcher.tsx · UserMenu.tsx   (the last four are new in the redesign)
  pages/    LoginPage · chat/{ChatLayout,Sidebar,ChatHome,ChatView,MessageList,Composer,MembersPanel,TypingIndicator,dialogs}
            admin/{AdminLayout,OverviewPage,UsersPage,StructurePage,GroupsPage,AuditPage,ui}
  router.tsx · main.tsx · index.css
e2e/        fixtures.ts (person fixture) · boundaries · admin · history · screenshots (skipped) · review (skipped)
docs/       ARCHITECTURE.md (diagrams, events, policy, data model, security, scaling) · screenshots/*.png
scripts/    wait-for-api.mjs (npm run dev starts Vite only after the API is up)
```

**Socket.IO events:**
- Client → server (with ack): `message:send`, `message:delete`, `message:read`, `group:lock`, `member:mute`, `group:join`, `group:leave`, `dm:open`, `presence:list`.
- Client → server (no ack): `typing:start`, `typing:stop`.
- Server → client: `message:new`, `message:deleted`, `typing`, `presence:update`, `read:update`, `group:added`, `group:removed`, `group:updated`, `member:updated`, `session:revoked`.
- `/admin` namespace: `stats`, `audit:new`.

**Policy functions** (in `packages/shared/src/policy.ts`): `canRead`, `canPost`, `canBeMember`, `canJoin`, `canLeave`, `canModerate`, `canManageMembers`, `canMuteMember`, `canDeleteMessage`, `canDM`, `describePostPolicy`, `defaultGroupSettings`.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the full design.

## 6. How to run, test and build

Requires Node 22.12+ (developed on Node 24.21) and npm 11. Run these in the project folder in **PowerShell**:

| Command | Purpose |
|---|---|
| `npm install` | Install. The first install downloads the MongoDB 8.2 binary once (about 750 MB on Windows), cached in `node_modules/.cache` |
| `npm run dev` | Embedded MongoDB (27019) + API (4000) + Vite (5173). Open http://localhost:5173 |
| `npm run seed` | Reset the demo data |
| `npm run lint` / `npm run format` | Biome |
| `npm run typecheck` | TypeScript, all workspaces |
| `npm test` | 123 Vitest tests (policy + Socket.IO integration) |
| `npm run e2e` | Builds, then runs 9 Playwright tests (production build on port 4200, own DB `.data/mongo-e2e`) |
| `npm run build` then `npm start` | Production: UI + API + Socket.IO on one port, http://localhost:4000 |
| `$env:SCREENSHOTS='1'; npx playwright test e2e/screenshots.spec.ts; Remove-Item Env:SCREENSHOTS` | Regenerate `docs/screenshots/*.png` (run `npm run build` first) |
| `$env:REVIEW_DIR='<folder>'; npx playwright test e2e/review.spec.ts; Remove-Item Env:REVIEW_DIR` | Capture review screenshots of every screen (run `npm run build` first) |

**Demo accounts.** The password for all of them is `Comsats@2026`; students can also sign in with their registration number.
- `admin@comsats.edu.pk`
- `director.office@comsats.edu.pk`
- `ayesha.siddiqui@comsats.edu.pk` (HOD CS)
- `imran.haider@comsats.edu.pk` (AWT instructor, BCS-7A advisor)
- `FA23-BCS-001` Ali (CR)
- `FA23-BCS-002` Hira
- `FA23-BCS-031` Usman (BCS-7B CR)
- `exam.office@comsats.edu.pk`

All 37 accounts are in `apps/server/src/seed/data.ts`.

**Two people at once:** use a normal window plus a private/incognito window. In production mode you can also use `http://localhost:4000` and `http://127.0.0.1:4000`.

**Ports and data folders (all in the ignored `.data/` folder):**

| Use | Ports | Data folder |
|---|---|---|
| dev | 5173 / 4000 / 27019 | `.data/mongo` |
| e2e | 4200 / 27029 | `.data/mongo-e2e` |
| ad-hoc QA | 4500 / 27049 | `.data/mongo-verify` |

The JWT secret lives in `.data/jwt-secret`. **Never commit `.data/` or `.env`.**

**Env vars** (all optional; see `.env.example`): `API_PORT`, `MONGODB_URI`, `MONGO_DB_NAME`, `EMBEDDED_MONGO_PORT`, `EMBEDDED_MONGO_DIR`, `JWT_SECRET`, `JWT_TTL`, `COOKIE_SECURE`, `AUTO_SEED`, `DEMO_MODE`, `SEED_ON_START`, `LOGIN_RATE_LIMIT`, `MESSAGE_BURST`, `MESSAGE_RATE_PER_SEC`, `LOG_LEVEL`.

## 7. Security layers (viva answer)

There are 12 layers:
1. helmet headers and a strict CSP.
2. Abuse limits: login 20/min/IP; message token bucket 8 burst, 2/s; typing limit; 300 KB JSON and 64 KB socket packets.
3. Authentication: argon2id; identical message and timing for unknown users; deactivated accounts refused.
4. Sessions: HS256 JWT, 12 h, httpOnly + SameSite=Lax + Secure behind HTTPS, `tokenVersion` revocation, random secret kept in `.data`.
5. Socket handshake auth; every event re-checks that the user is active; deactivation disconnects sockets.
6. Role-based access: `requireAdmin`, `/admin` namespace guard.
7. Communication-boundary policy engine (10 rule functions, server-enforced).
8. Room isolation: rooms mirror memberships.
9. Zod validation on every input; regex escaping; `passwordHash` never selected; generic 500s.
10. XSS-safe output: plain text, safe links, no `dangerouslySetInnerHTML`.
11. Privacy and audit: admins can't read DMs; the audit log never stores message bodies.
12. Dependency safety: npm audit clean, `allowScripts`.

**Honest limitations:**
- No HTTPS locally; set `COOKIE_SECURE=true` behind HTTPS.
- No end-to-end encryption.
- No 2FA.
- In-memory rate limits (single instance).
- No separate CSRF token (relies on SameSite plus a JSON API).

## 8. Work in progress: the UI redesign (Slack-style workspace, Emerald)

**Why:** the user said the first UI "looks like AI SLOP". The redesign removes:
- gradients and marketing copy;
- coloured icon tiles;
- rounded cards everywhere;
- "YOU CAN / YOU CAN'T" checklists;
- the Inter font;
- pills on every element.

It replaces them with real workspace-app patterns.

**What is already implemented** (committed with this file):
- **Theme (`apps/web/src/index.css`):**
  - System font stack.
  - Emerald primary `#0e7b58` (hover `#0b694b`, soft `#e7f3ee`).
  - Neutral greys.
  - Dark rail `#121417`, dark sidebar `#1b1d21`, active item emerald.
  - `.dark` variants of everything.
  - 14 px base.
  - Animations `.animate-in`, `.dialog-in`, `.typing-dot`.
- **New favicon and `Logo.tsx`:** emerald rounded square with a white "C" and a dot.
- **UI primitives:** button, form, badge, dialog, menu (Radix), people (square avatars with presence), group-meta (`#` / lock / megaphone icons), feedback (adds `Kbd`).
- **New components:**
  - `AppRail` (left rail: logo, Chats with unread badge, Admin for admins, account menu).
  - `UserMenu` (profile, appearance Light/Dark/System, Admin console, Sign out).
  - `QuickSwitcher` (**Ctrl/⌘+K** "Jump to a conversation", combobox with keyboard navigation).
  - `state/ui.ts`.
- **Chat:**
  - Dark sidebar with a workspace menu "COMSATS Islamabad".
  - Collapsible sections (remembered under the storage key `cui-sidebar-collapsed`).
  - Compact rows with unread pills.
  - "Unreads" home page.
  - Flat Slack-style message rows with a hover toolbar, a "New" divider, and a conversation intro ("This is the beginning of …").
  - `PolicyLine` in the header; members avatar stack.
  - Connection banner.
- **Login:** a calm centred form, demo accounts as rows (`aria-label="Sign in as …"`).
- **Admin:** dark admin sidebar (Overview, Users, Structure, Groups & rules, Audit log), stat strip, flat tables.
- **Already fixed during the review:**
  - QuickSwitcher accessibility lint errors.
  - Tiny avatar initials.
  - Ctrl vs ⌘ hint (`MOD_KEY`).
  - Login heading size.
  - The E2E selector for the now-duplicated "New message" button (`.first()`).

**Visual review so far** (screenshots from `e2e/review.spec.ts`):
- **Looked good:** login, Unreads home, channel view, dark channel, dark quick switcher, dark admin, dark login, mobile list/channel/admin.
- **Not reviewed yet:** members panel, message menu, dialogs, account/workspace menus, admin Users/Structure/Groups/Audit pages in detail, light-mode admin, the locked-course view.

**E2E-sensitive selectors** (keep them, or update the tests together with them):
- **Labels:** `Email or registration number`, `Password`, `Find a student to enroll`, `Search users`, `Section`.
- **Buttons:** `Sign in` (exact), `New message`, `Lock group` / `Unlock group`, `Members (N)`, `Enroll`, `Edit details`, `Save changes`, `Message options`, `Browse societies`, `Account menu`.
- **Structure:**
  - `navigation "Conversations"` links whose names start with the group name;
  - an `h1` with the group name;
  - `data-testid="composer-locked"` and `data-testid="connection"` (`data-state="connected"`);
  - the `.group/message` row class;
  - `main [aria-relevant="additions"]`;
  - the combobox `Jump to a conversation`.
- **Text:**
  - "This is the beginning of BCS-7A Class.";
  - the toast "You were added to …";
  - the overview blocked-attempt summaries ("Hira Khan was blocked from posting in …").

## 9. Remaining work (do in order; commit and push after each)

> **Status 2026-10-08 21:15: items 1–7 are done and pushed.** Item 8: `e2e/review.spec.ts` was kept as a dev tool (skipped unless `REVIEW_DIR` is set). Review fixes: toasts moved bottom-right above the composer, admin group names no longer wrap mid-name, users table rows keep an even height on mobile, Overview hint reads "Messages: N / min", and the screenshot spec waits for messages to load. `.claude/launch.json` gained a `cui-connect-prod` entry (`npm start`, port 4000).

1. **Fix the review script step.** In `e2e/review.spec.ts`, "review: desktop light" waits for "Message options" on an old seeded message, but authors can only delete their own messages within 15 minutes. Have Hira **post a fresh message first** and open the menu on that row.
2. **Finish the visual review.**
   - `npm run build`, then run the review spec (see §6) into a scratch folder.
   - Inspect every capture (01 to 27).
   - Fix anything that looks off, especially the admin pages Users / Structure / Groups / Audit, the members panel, dialogs and menus, in light, dark and mobile.
   - Acceptance: every screen looks like a real production workspace app, consistent with the Emerald theme.
3. **Run all gates:** `npm run lint`, `npm run typecheck`, `npm test` (123), `npm run e2e` (9). Fix any selector breakage.
4. **Regenerate the documentation screenshots** (§6) and check all 8: login, chat-instructor, announcement-read-only, course-locked, admin-overview, admin-groups, admin-enrollment, chat-dark.
5. **Update the docs for the new look.** In README:
   - add the Slack-style workspace, the Ctrl/⌘+K quick switcher, the Unreads home, the "New" divider, the conversation intro, the emerald theme and dark mode;
   - keep the feature, testing and demo sections accurate.

   In ARCHITECTURE, mention the UI building blocks only if they're useful.
6. **Final verification:**
   - `npm run lint; npm run typecheck; npm test; npm run e2e; npm run build; npm start`;
   - smoke-test http://localhost:4000 and http://127.0.0.1:4000 as two users;
   - `npm audit`.
7. **Final commit and push.** Update §1 of this file (status), then tell the user what changed and show the screenshots.
8. **Optional** (only if time remains): `e2e/review.spec.ts` can stay as a dev tool (it's skipped unless `REVIEW_DIR` is set) or be deleted.

**Out of scope** (deliberately excluded by the plan): file uploads, message search, push notifications, Redis scaling (documented only).

## 10. What the user needs to do before Friday morning

1. **Get the latest code:** it's on GitHub (`main`). Locally: `npm install`, then `npm run dev`, then open http://localhost:5173.
2. **Practise the demo** with two windows (normal + private):
   - **Boundaries:**
     - Hira can read CS notices but can't post.
     - Usman (BCS-7B) can't see BCS-7A.
     - Hira's *New message* doesn't list Dr. Sana Javed or the IT admin.
   - **Live moderation:** Dr. Imran locks the AWT course and Hira's composer changes instantly; he mutes and unmutes Hira in BCS-7A.
   - **Live admin:**
     - The admin makes Hira a CR: "CS CR Council" appears in her sidebar.
     - The admin enrolls a repeater in Compiler Construction · BCS-7A.
     - The admin deactivates Hira while she's online: she's signed out with a message.
     - The Overview shows blocked attempts live.
3. **Know these files for the viva:**
   - `packages/shared/src/policy.ts` (all the rules);
   - `apps/server/src/realtime/io.ts` (handshake auth, `/admin` namespace);
   - `apps/server/src/realtime/handlers.ts` (events and acks);
   - `apps/server/src/realtime/notifier.ts` (rooms join and leave live);
   - `apps/server/src/services/provisioning.ts` (groups from university structure).
4. **Likely viva topics:**
   - rooms vs namespaces;
   - acknowledgements;
   - middleware auth on the handshake;
   - `socketsJoin` / `socketsLeave`;
   - `connectionStateRecovery`;
   - why the server (not the UI) enforces rules;
   - the 12 security layers.
5. **Submit** the way your instructor asks:
   - the GitHub link: https://github.com/abdullahasghar966/cui-connect;
   - or a clean zip from `git archive -o cui-connect.zip HEAD` (this leaves out `node_modules` and `.data`).

## 11. Conventions for every session

- **Push after every completed task** (the user's standing instruction):
  1. Run the gates.
  2. Commit with the author flags and trailer below.
  3. Push to `origin main`.
  4. Tell the user what was pushed.
- **Git author.** Always use the **GitHub no-reply email**. The account has email privacy on, so GitHub rejects pushes that contain the Gmail address (`GH007`).
  ```
  git -c user.name="Abdullah" -c user.email="203540047+abdullahasghar966@users.noreply.github.com" commit -F <message-file>
  ```
  - Write the message to a scratch file with the Write tool, because PowerShell 5.1 breaks inline multi-line messages.
  - End every message with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Push without credential popups** (uses the logged-in GitHub CLI account `abdullahasghar966`; changes no global config):
  ```
  git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main
  ```
- **Code style:**
  - Biome: 2 spaces, single quotes, trailing commas, line width 100.
  - Comments only where intent isn't obvious.
  - Keep names consistent with the surrounding code.
  - The shared package exports TypeScript source.
- **Quality bar:** lint, typecheck, `npm test` and `npm run e2e` must all be green before pushing to `main`.

## 12. Environment pitfalls (Windows 11, this machine)

- **Use PowerShell for `npm` and `node`.** After a reboot, the Bash tool's PATH arrives in Windows format (`cat`, `node` and `npm` aren't found). Fix it in Bash with `export PATH="/usr/bin:/mingw64/bin:/c/Program Files/nodejs:$PATH"`.
- **PowerShell 5.1:**
  - There's no `&&`; use `;`.
  - Don't rewrite files with `Get-Content`/`Set-Content`: it corrupts UTF-8 (`·` becomes `Â·`) and adds a BOM. Use the Edit/Write tools.
  - Native stderr redirected with `2>&1` turns into error records.
- **The built-in browser pane is often hidden:**
  - `document.visibilityState` is `hidden`, so read receipts are (correctly) not sent;
  - IntersectionObserver never fires;
  - clicks on undrawn tabs fail; use `find` + `form_input`, or focus + Enter for Radix menus.
  - Use **Playwright** (`e2e/review.spec.ts`) for visual review instead.
- **socket.io-client in Node scripts/tests:** use `forceNew: true` for each user. Otherwise connections multiplex over the first user's cookie.
- **Playwright selectors:** the redesign has two "New message" buttons, so use `.first()`. Use `{ exact: true }` for "Sign in".
- **Embedded MongoDB on Windows** can stop uncleanly, which makes `estimatedDocumentCount` drift. The code uses `exists()` / `countDocuments()` instead.

## 13. History

| Commit | What |
|---|---|
| `45c8d3e` | Backend: policy engine, Socket.IO server, provisioning, embedded MongoDB, seed, 119 tests |
| `e4dbd33` | Web app: login, real-time chat, DMs, moderation UI |
| `1d7232c` | Admin console: overview, users, structure, groups, live audit |
| `397c05f` | Production build, Playwright E2E, plus fixes found by them (`/admin` namespace auto-connect, toast overlap, exact counts) |
| `9b6b92c` | Docs: README, ARCHITECTURE, screenshots |
| `b4c916e` | QA pass fixes (touch-visible actions, a11y names, title reset, 12-hour mute time, audit wording, shell-quote override, wait-for-api), enrollment manager, edit user, 123 + 9 tests |
| `7bab472` | UI redesign in progress (all gates green), E2E selector fix, PROJECT_CONTEXT.md |
| `6996031` | Review spec opens the message menu on a fresh message |
| `31a1ce0` | Visual review fixes: toasts, group names, users table, stat wording |
| `2afdb33` | Regenerated documentation screenshots |
| `9c6f1cc` | README "Workspace UI" section; ARCHITECTURE web-client data flow |

These commit IDs are from after the first push to GitHub. Before that push, the author email was changed from the Gmail address to the GitHub no-reply address; names, dates and content are unchanged.

**Notable bugs found and fixed** (useful for the viva's "challenges" question):
- The `/admin` namespace never connected in production: it shared the main Manager, which has `autoConnect: false`. Fixed with an explicit `connect()`.
- Toasts covered the Unlock button.
- The preview tooling's `PORT` collided with Vite, so the API moved to `API_PORT`.
- Database counts drifted after unclean shutdowns.
- Hover-only actions were invisible on touch screens.
- A stale unread count stayed in the tab title.
- Node socket clients multiplexed one cookie.

**Sessions:**
- The main build session ("Lab Assignment 1 analysis and tech plan", 2026-10-07 → 2026-10-08 13:22) stopped when the usage limit was reached.
- A side session on 2026-10-08:
  - answered the security question;
  - verified the redesign;
  - fixed the E2E selector;
  - wrote this file;
  - created the public GitHub repo;
  - switched commit emails to the no-reply address (GitHub blocked the private Gmail);
  - pushed.

---

## Appendix A: the approved plan (verbatim)

**Changes made since approval:**
- Palette: navy became **Emerald**, and the font changed from Inter to the system stack (user request, 2026-10-08).
- UI components were hand-written on Radix rather than generated with the shadcn CLI. The plan's risk section allowed for this.
- `PORT` became **`API_PORT`**.
- Added beyond the plan: enrollment manager, edit-user dialog, Ctrl/⌘+K switcher, Unreads home.
- More tests than planned.

# CUI Connect: Real-time communication system for COMSATS Islamabad (Socket.IO)

## Context
**Lab Assignment 1 (CLO-5, Advanced Web Technologies)** says: *"Create a communication system for COMSATS University Islamabad using Socket.io. Different users can be added, and their groups can be created. Communication boundaries should be in place so that we can define who can communicate in which group. Take realistic requirement of communication in COMSATS and implement it."*

The working folder `D:\FA23-BCS-7A\Advance Web Technologies\LAB ASSIGNMENT 1` is empty and is not a git repo yet. This machine has Node 24.21, npm 11.19, pnpm and git. MongoDB and Docker are not installed.

**Choices you made:** MongoDB + Mongoose, TypeScript, the full realistic system, and README + architecture docs as the extra deliverables.

**Goal:** a working, tested full-stack app. Admins add users and groups modelled on how COMSATS is organised (departments, sections, courses, offices and societies). Every message, DM and membership goes through a **server-side permission engine**, so the communication boundaries are enforced in real time and you can see them in the UI.

### 1. Tech stack and why each piece

| Layer | Choice (latest versions checked on npm) | Why |
|---|---|---|
| Monorepo | **npm workspaces**: `apps/server`, `apps/web`, `packages/shared` | Works with plain `npm install`. The grader doesn't need pnpm. |
| Language | **TypeScript 7** (strict) | One set of types for socket events and payloads on both client and server. If TS 7 has trouble with any tool, fall back to TS 5.9. |
| Realtime | **Socket.IO 4.8** (server + client), typed generics | Rooms, acknowledgements and namespaces. Uses connection-state recovery to survive brief disconnects. |
| HTTP API | **Express 5.2**, helmet, cookie-parser, express-rate-limit | Express 5 has native async error handling. |
| Validation | **Zod 4** schemas in `packages/shared` | The same schemas validate on the client and the server: every REST body and every socket payload. |
| Database | **MongoDB + Mongoose 9** | If `MONGODB_URI` is empty, the server starts an embedded **mongodb-memory-server 11** that keeps its data in `.data/mongo`. So it needs no install, and data survives restarts. It works with Atlas or a local URI when provided. |
| Auth | **JWT (jose 6)** in an httpOnly SameSite=Lax cookie; **argon2id** password hashing via `@node-rs/argon2` (prebuilt for Windows) | The same cookie authenticates the Socket.IO handshake. Argon2id is the OWASP-recommended hash. |
| Frontend | **React 19 + Vite 8 + React Router 8 + Tailwind CSS 4 + shadcn/ui** (Radix), lucide-react icons, sonner toasts | Fast dev server with accessible, polished components. |
| Client state | **TanStack Query 5** for REST and history (socket events update its cache) + **Zustand 5** for presence, typing and unread | Keeps one source of truth with no duplicated message state. |
| Server build | `tsx watch` in dev, **tsdown** bundle for production | Production is one command: Express serves the built web app plus API plus Socket.IO on **one port (4000)**. |
| Lint/format | **Biome 2** | One fast tool replaces ESLint and Prettier. |
| Tests | **Vitest 5** (unit + integration with multiple real `socket.io-client`s + supertest), **Playwright 1.63** (multi-user browser E2E) | Covers the build, test and verify loop. |
| Logging | **pino** | Structured logs. |

### 2. How COMSATS communication is modelled

**System roles:** `admin` (IT Services/Registrar, creates accounts) · `faculty` (flags: `isHOD`, batch advisor of sections) · `staff` (an office: Director's Office, Exam Office, Student Affairs) · `student` (reg no `FA23-BCS-001`, section, flag `isCR`).

**Organisation entities:** Department (CS, EE, MS) → Section (`BCS-7A`: program, intake, batch advisor) → Course Offering (code, title, section, instructor, enrolled students).

**Membership roles inside a group:** `owner` · `moderator` · `member`. A member can also be muted until a set time (`mutedUntil`).

#### Group types and default boundaries
Groups are created automatically when a department, section or course is created ("provisioning"), and members join automatically.

| Group type | Who is a member (auto) | Who may be a member | Who can post | Notes |
|---|---|---|---|---|
| `CAMPUS_ANNOUNCEMENT` ("CUI Islamabad Official") | everyone | everyone | admin + Director's Office (moderators) | Read-only for everyone else; no one can leave |
| `DEPARTMENT_ANNOUNCEMENT` ("CS Dept Notices") | all of the department | department members | HOD + department staff (moderators) | |
| `FACULTY_LOUNGE` (per department) | department faculty | **faculty/admin only** | all members | Students can't see it or be added |
| `SECTION` ("BCS-7A Class") | section students + batch advisor | the section's students + faculty | all members; the advisor moderates | |
| `COURSE` ("AWT · BCS-7A") | instructor + enrolled students | enrolled students + instructor | all members; the instructor can **lock** it to announcement-only | |
| `CR_COUNCIL` (per department) | CRs + HOD | students with `isCR` + faculty | all members | |
| `SOCIETY` (ACM, Sports) | open join | anyone | members; the owner and moderators manage it | Uses the `joinPolicy: open` setting |
| `CUSTOM` (e.g. "FYP Committee") | invited | configurable `eligibleRoles` | configurable: `all` / `moderators` / `roles[]` | Admin-created |
| `DIRECT` (DM, exactly 2 members) | created on the first DM | see the DM rules below | both, while DM rules allow | Admin **cannot** read DMs (privacy) |

#### DM rules (`canDM(sender, recipient, facts)`)
- Student → student: allowed if they are in the **same department or share a group**.
- Student → faculty: allowed only if the faculty member **teaches them**, is their **batch advisor**, or is their **HOD**.
- Faculty ↔ faculty, staff ↔ anyone, admin → anyone: allowed.
- **Reply rule:** anyone may reply in a DM the other person legitimately started. For example, a student can reply to a DM their teacher started.

#### Permission engine
- A **pure function** module in `packages/shared/src/policy.ts`: `canRead`, `canPost`, `canBeMember`, `canModerate`, `canManageMembers`, `canDM`.
- Each returns `{ allowed: boolean, reason?: string }`.
- The server is the authority and checks it on **every** socket event and REST call.
- The client calls the same function only to show hints, such as a disabled composer with the text "Only HOD & department staff can post here".
- When a post is denied, an audit entry is written. This shows the boundaries working in the admin's live audit feed.

### 3. Architecture (as planned)

```
LAB ASSIGNMENT 1/
├─ package.json            # workspaces + scripts: dev, build, start, seed, test, e2e, typecheck, lint
├─ tsconfig.base.json · biome.json · .env.example · .gitignore
├─ packages/shared/src/    # roles.ts, policy.ts, events.ts (typed Socket.IO maps), schemas.ts (Zod), dto.ts
├─ apps/server/src/
│  ├─ config/env.ts        # Zod-validated env
│  ├─ db/connect.ts        # Mongoose; embedded persistent mongod fallback
│  ├─ models/              # User, Department, Section, CourseOffering, Group, Membership, Message, AuditLog
│  ├─ auth/                # hashing, JWT cookie, requireAuth/requireAdmin middleware
│  ├─ services/            # provisioning.ts (auto groups/memberships), policyContext.ts (builds the facts the engine needs), messages.ts, audit.ts
│  ├─ http/routes/         # auth, admin (users + CSV import, depts, sections, courses), groups, memberships, messages (cursor pagination), directory (only DM-able users), audit
│  ├─ realtime/            # io.ts (setup + cookie auth middleware), handlers/{message,typing,read,moderation}.ts, presence.ts, rateLimit.ts, sync.ts (live socketsJoin/Leave), adminNs.ts
│  ├─ seed/seed.ts         # realistic COMSATS demo data
│  └─ index.ts
├─ apps/server/test/       # vitest integration (multi-client)
├─ apps/web/src/           # routes: /login, /chat/:groupId, /admin/{users,structure,groups,audit}
├─ e2e/                    # Playwright specs
├─ docs/ARCHITECTURE.md    # diagrams + events + permission matrix
└─ README.md
```

**Socket.IO design**
- **Namespace `/`** for authenticated users. On connect, the socket joins `user:<id>` (needed for multi-tab and direct pushes) and `group:<id>` for each readable membership.
- **Namespace `/admin`** for admins only (guarded by middleware). It carries the live audit stream, online count and messages per minute.
- **Client → server events** (all with ack `{ok, data}|{ok:false, code, reason}`): `message:send` (with `clientId` for idempotency and optimistic UI), `message:delete`, `typing:start/stop`, `message:read`, `group:lock`, `member:mute`, `group:join` (open societies).
- **Server → client events:** `message:new`, `message:deleted`, `typing`, `presence:update`, `read:update`, `group:added`, `group:removed`, `group:updated`, `member:updated`.
- **Live boundary changes:** when an admin adds or removes a member, the server runs `io.in('user:X').socketsJoin/socketsLeave('group:Y')` and emits `group:added/removed`. The sidebar updates immediately with no refresh. Deactivating a user runs `disconnectSockets()`.
- **Robustness:** connection-state recovery (2 min); the client fills gaps on reconnect via the history API (`after=<lastId>`); a per-socket token-bucket rate limit (`RATE_LIMITED` ack); Zod validation on every payload (body 1–4000 chars); messages are rendered as plain text, which prevents XSS.
- **Performance:** each broadcast goes only to the group's room; indexed `(groupId, _id desc)` cursor pagination and `lean()` queries; unread counts come from `Membership.lastReadMessageId`; presence updates are throttled; the docs describe a Redis adapter for scaling (not built).

**Data model (Mongoose):**
- User: name, email, regNo, passwordHash, role, departmentId, sectionId, designation, office, isHOD, isCR, active.
- Department: code, name.
- Section: name, program, intake, departmentId, batchAdvisorId.
- CourseOffering: code, title, sectionId, instructorId, studentIds[].
- Group: name, type, scope{dept|section|course}, settings{postPolicy, allowedPosterRoles, eligibleRoles, locked, joinPolicy}, system, dmKey, lastMessageAt.
- Membership: groupId, userId, role, mutedUntil, lastReadMessageId; unique index on (groupId, userId).
- Message: groupId, senderId, body, clientId, deletedAt/By.
- AuditLog: actorId, action, target, meta.

**UI (as planned):**
- Sidebar grouped into Announcements / Courses / Class / Department / Societies / Direct Messages, with unread badges, lock icons and presence dots.
- Chat view: a header showing the group's policy badge, infinite scroll upward, typing indicator, "Seen" on DMs, and a composer that's disabled with a reason when posting isn't allowed.
- Members drawer: roles and moderation actions.
- "New DM" dialog: lists only the people you're allowed to DM.
- Admin panel: users (create, CSV bulk import, deactivate), structure (departments, sections, courses), groups (policy editor, members) and a live audit feed.
- Dark/light theme, responsive layout, COMSATS-navy palette (text-only branding, no official logo). *Later changed to Emerald at the user's request.*

**Seed data** (`npm run seed`):
- 3 departments; admin, Director's Office, Exam Office and Student Affairs staff.
- 2 HODs and about 6 faculty members.
- Sections BCS-7A, BCS-7B, BSE-5A and BEE-7A with about 6 students each, CRs flagged.
- Courses such as Advanced Web Technologies (BCS-7A/7B), Compiler Construction and Software Engineering.
- ACM CUI and Sports societies, plus sample messages.
- The demo accounts and the shared demo password are documented in the README and seed file.

### 4. Build → Test → Verify phases (each phase must pass its gate before the next starts)

| # | Phase | Gate (must be green) |
|---|---|---|
| 0 | `git init`; workspaces, tsconfigs, Biome, scripts, `.env.example`, `.gitignore` | `npm install`, `npm run typecheck`, `npm run lint` |
| 1 | `packages/shared`: roles, DTOs, Zod schemas, typed events, **policy engine written test-first** | Vitest table-driven matrix (every role × group type × action + all DM rules), ~100% coverage of `policy.ts` |
| 2 | Server foundation: env, DB connect (embedded fallback), models + indexes, auth (login by email or reg no, `me`, logout), error middleware, pino | Supertest: login ok/bad, cookie set, guards return 401/403, the embedded DB persists across restarts |
| 3 | Provisioning + admin REST + audit + **seed** | Tests: creating a section/course auto-creates groups and memberships; FACULTY_LOUNGE rejects students; CSV import; `npm run seed` runs cleanly |
| 4 | Realtime layer (all events, presence, typing, read receipts, moderation, live sync, rate limit, `/admin` ns) | **Multi-client integration tests** (see Verification) |
| 5 | Web app (login, chat shell, group view, DMs, members drawer, admin panel) | `typecheck` + `vite build` + manual check in the **built-in browser pane** (two tabs as different users, screenshots) |
| 6 | Playwright E2E + polish (empty, loading and error states, responsive, dark mode, a11y) | `npm run e2e` green |
| 7 | Docs: `README.md` (setup, scripts, demo accounts, features) and `docs/ARCHITECTURE.md` (Mermaid system/sequence/ER diagrams, events table, rooms/namespaces, **permission matrix**, security, scaling) | Final full run: `npm run lint && npm run typecheck && npm test && npm run e2e && npm run build && npm start` smoke test |

A git commit at the end of each green phase, so progress can be reviewed and rolled back.

### 5. Verification (end-to-end)

**Integration tests** (Vitest; real server on a random port with in-memory MongoDB; several `socket.io-client`s logged in as seeded users):
1. A student posting in CS Dept Notices gets ack `FORBIDDEN` and **no other client receives the message**. The HOD's post reaches every member.
2. **Room isolation:** a BCS-7B student never receives BCS-7A messages.
3. When the instructor locks the AWT course group, student posts are denied. After unlock, they're allowed.
4. Muting a member denies their posts until `mutedUntil`.
5. When an admin adds a user to a group, that user's live socket receives `group:added` plus later messages. Removing them stops delivery immediately.
6. DM rules: a student → an unrelated faculty member is denied; a student → their own instructor is allowed; a faculty-started DM lets the student reply; an admin can't read DMs.
7. A burst of messages triggers `RATE_LIMITED`. A malformed payload triggers `VALIDATION`.
8. Deactivating a user disconnects them. Reconnecting with a stale cookie is rejected.
9. Typing, presence and read receipts propagate only to the right members.

**E2E (Playwright, Chromium, two browser contexts):** the student and faculty log in, a message arrives in under 1 s, the student sees a disabled composer in announcements, and a group the admin creates appears live in the student's sidebar.

**Manual:** run `npm run dev`, open the app in the built-in browser pane as two users side by side, walk through the main flows and take screenshots.

### 6. Risks and how they're handled
- **The first run downloads a MongoDB binary** (it turned out to be about 750 MB on Windows, cached once). `MONGODB_URI` in `.env` (Atlas or local) skips that download.
- **TypeScript 7 (new native compiler) may not work with a tool.** Fall back to TS 5.9 without changing any code. *(Not needed: TS 7 worked.)*
- **shadcn CLI or network hiccups.** The components can be vendored by hand if needed. *(They were hand-written on Radix.)*
- **Scope creep.** File uploads, search and push notifications are excluded on purpose. The architecture leaves room to add them.
