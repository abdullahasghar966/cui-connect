# CUI Connect: project context and handoff

> **For a new Claude Code session:** read this whole file before doing anything. It holds:
> - the assignment and the plan the user approved;
> - everything already built and verified;
> - the work in progress;
> - the ordered list of remaining tasks;
> - the conventions (including **push to GitHub after every completed task**).
>
> **Last updated:** Monday 2026-10-12 (Pakistan time).
> **Current work:** the **university features build** (§1a). Stage A, all of Stage B and C1–C6 are pushed. Next: C7 → C10, then the docs and the demo-site question.
> The assignment deadline (Fri 2026-10-09) has passed; this is now an extension project.
> **Repository:** https://github.com/abdullahasghar966/cui-connect (public), branch `main`.
> **Live site:** https://cui-connect.onrender.com. It **auto-deploys on every push to `main`**, so never push failing code.

**Prompt to paste into a new session** (from this project folder):

```
Read PROJECT_CONTEXT.md first, especially §1a (university features build). Continue the
checklist in §1a.2 from the first unticked item (if an entry says "written, not committed",
finish it from the state described there), then the docs and the demo-site question, using
the build → test → verify loop. After each feature: run all gates (lint, typecheck, npm test,
npm run e2e, npm audit), commit, push to origin main, and tick it off in §1a.2. Plans for these
features are pre-approved; explain anything I need to decide in simple terms. Do not use cloud
sessions; work only in this local session.
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
| GUI first run + deployment (user request 2026-10-09: "everything through GUI", one link) | **Code done** (`a8a6d4a`): browser setup page guarded by `SETUP_CODE`, 5-step admin checklist, self-service change password, `TRUST_PROXY`, `render.yaml` (Render free, Singapore + MongoDB Atlas). Vercel rejected: free-plan WebSockets end after 5 min and don't broadcast across instances. **Deployed 2026-10-09: https://cui-connect.onrender.com** (Render free, Singapore; Atlas M0, AWS Mumbai). The first deploy crashed on a wrong `MONGODB_URI`; startup now explains Mongo connection errors in plain words (`b19b9e9`). Verified from outside: health OK, setup closed, demo accounts 404, HSTS on. The user created the admin through the setup page. `docs/USER_GUIDE.md` covers every feature plus a 10-step viva demo |
| Final verification | **Done.** All gates green, `npm run build` + `npm start` smoke test as two users (localhost + 127.0.0.1): live message and live delete |
| Lint (Biome) / typecheck (TS 7) | Green |
| Unit + integration tests (Vitest) | **229 passing after C6** |
| End-to-end tests (Playwright) | **28 passing after C6**; 3 utility specs are skipped by design |
| University features | Stage A, B1–B6 and C1–C6 pushed. See §1a |
| `npm audit` | 0 vulnerabilities |
| GitHub | Public repo `abdullahasghar966/cui-connect`. All work up to this file is pushed |

## 1a. University features build (started 2026-10-11)

### 1a.1 What the user asked and agreed
- **The request (2026-10-11):**
  - "start adding the mentioned features. Then, start adding remaining features of 1 till 10".
  - The "mentioned" features are the five I recommended (timetable, catalog/search, live QR attendance, marks + GPA, exam date sheet + seating), plus the notification centre and polls.
  - "1 till 10" is the 10-area feature menu.
- **The approved plan:** `C:\Users\Abdullah\.claude\plans\elegant-shimmying-rossum.md`. Read it for the full feature list and the reasoning behind it.
- **Standing permissions:**
  - "whatever new plan you give for new features, it's an auto approval … just make sure it is the best of the best and work perfectly fine".
  - "push commits to github continuously and automatically whenever each new feature is built".
- **Decisions in the plan** (defaults the user accepted):
  1. **Files** (submissions, materials, photos) go in MongoDB **GridFS** in the existing Atlas database, 5 MB per file. No new accounts.
  2. **QR attendance:** token = HMAC(session secret, 10-second window). It's accepted for the current and previous window (about 20 s). The student must be signed in and enrolled. The teacher sees names appear live and can untick anyone. Honest limit: a code can still be forwarded instantly.
  3. **Grading defaults** (COMSATS-style, editable per course):
     - Weights: Quizzes 15, Assignments 10, Sessional I 10, Sessional II 15, Terminal 50.
     - Grade scale: A≥85 (4.00), A−≥80 (3.66), B+≥75 (3.33), B≥71 (3.00), B−≥68 (2.66), C+≥64 (2.33), C≥61 (2.00), C−≥58 (1.66), D+≥54 (1.33), D≥50 (1.00), F.
     - Minimum attendance: 80% (an amber warning within 5% of it).
  4. **Who manages what:**
     - New **Accounts Office** (`OFFICES` includes `ACCOUNTS`) handles fees.
     - **Student Affairs** handles jobs, complaints, lost & found and approving events.
     - **Admin** handles rooms, terms and transport.
     - The **timetable** belongs to admin or that department's Department Office.
     - **Exams** belong to the Examination Office.
     - The **academic calendar** belongs to the Director's Office.
  5. **Time zone:** Asia/Karachi (fixed +05:00) for "today", "next class" and reminders. The server runs on UTC.
  6. **Landing page:** Home (`/home`) after sign-in, instead of Chats.
  7. **Data:**
     - The live site starts empty for the new features; it's the user's real campus.
     - Local runs and tests get a full sample campus.
     - Admin pages offer CSV import for the catalog (timetable CSV is optional, not done).
     - **Still to ask the user after Stage B:** do they want a second free Render "demo" site with sample data?
  8. **New packages planned:**
     - `qrcode.react` (QR codes, B3 and the ID card);
     - `web-push` (C7).
     - Nothing else.

### 1a.2 Checklist (tick and push one by one)
- [x] **A. Foundations.** Commit `8144dd8`, pushed and deployed; the live site is healthy.
- [x] **B1 Timetable.** Pushed. The visual review found and fixed two grid bugs: overlap lanes were computed across the whole week (classes on different days squeezed each other), and hashed course colours made CSC491/CSC498 look the same (now `courseHues()` in `lib/utils.ts`).
- [x] **B2 Catalog search and course pages.** Pushed. `/academics/courses` (search, department filter, "offered this term") and `/academics/courses/:code` (sections with teacher, schedule, seats and a chat link for members; prerequisites and "required for"; degree plans; CLOs; outline; grading and grade scale). API: `GET /api/academics/courses/:code` (`courseDetail` in `services/catalog.ts`), `GET /api/academics/departments`, `catalog?offered=1`. The timetable class dialog links to the course page. `biome.json` uses `"preset": "recommended"` (note: `biome migrate` wrongly wrote `"none"`).
- [x] **B3 Attendance.** Pushed. Models `AttendanceSession` (secret `select: false`; unique offering+date+slot, so taking attendance again reopens) and `AttendanceRecord` (unique session+student; method `qr`/`manual`/`auto`), plus `CampusSettings` (`minAttendance`, admin card in Academic setup › Terms). `services/attendance.ts`: token = HMAC-SHA256(secret, `session:window`) shortened to 22 chars, accepted for the current and previous 10 s window (`timingSafeEqual`); check-in needs `canStudyIn`, an open session dated today, and a current code; late after 15 min from opening; a teacher's manual "absent" blocks re-scanning; closing marks the rest `auto` absent and `notify`s students who reach warning/short (key `attendance:<offering>:<state>`, once each). Live `attendance:update` goes only to the instructor and whoever opened it. Routes: new `routes/teaching.ts` (`/api/teaching/courses`, `/courses/:id/attendance`, `/attendance`, `/attendance/:id`, `/qr`, `/students/:id`, `/close`) and `/api/academics/attendance` (+ `/check-in`, `/settings`), `PUT /api/admin/settings`. Web: `/academics/attendance` (students: per-course %, bar with the minimum marker, "you can miss N more" from `attendanceOutlook`, class-by-class squares; teachers: courses with Take attendance/Sheet), `/academics/attendance/session/:id` (rotating `qrcode.react` code with countdown, full-screen mode, live roster with P/L/A/Lv buttons, close/reopen), `/academics/attendance/course/:id` (register, opens scrolled to the newest classes), `/attend/:id?t=` (check-in page; login keeps the link). The class dialog has Take attendance for the teacher on the day; course pages show Attendance to those with `canViewRecords`. Seed: closed sessions for every past class this term; `absencesFor()` keeps Ahmed (FA23-BCS-003) short in CSC441 and Hira warning in CSC455 whatever the date.
- [x] **B4 Marks, GPA/CGPA, results.** Pushed. Models `Assessment` (type, title, total, date, published), `Mark` (unique assessment+student; null = not entered), `Result` (final grade per student+term+code; `offeringId` null for imported earlier terms); `CourseOffering.finalizedAt`. `services/marks.ts`: marks sheet (teacher, or HOD/Exam Office read-only via `assertCanView`), add/edit/delete assessments (total can't drop below a given mark), bulk save (marks ≤ total; after publishing, changed students get "Mark updated"), publish/unpublish (each student hears their own score + class average once, key `results:<assessment>`), custom weights (must total 100; null = campus default), finalise (every weighted component needs a published assessment and every student a mark; writes `Result`s, notifies "Final grade… Your CGPA is now…", re-finalise allowed). Student `GET /api/academics/results`: published marks only, `courseStanding` breakdown, projected grade/GPA, official CGPA via shared `cgpa()`/`latestAttempts()` (a retaken course counts once, latest attempt), credits earned, history by term. Shared helpers moved to `services/offering-context.ts` (used by attendance too). Web: `/academics/results` (students: stats, per-course breakdown and marks, earlier terms; faculty: "Marks" list) and `/academics/marks/:offeringId` (spreadsheet grid: Enter moves down, invalid cells red, sticky unsaved bar, publish/edit/delete menu per column, weights dialog, finalise dialog, average/highest/lowest). Notifications of type results/attendance refresh those screens (`REFRESH_ON` in `useRealtimeSync`). Seed: Quiz 1, Assignment 1, Quiz 2, Sessional I published and Quiz 3 marked but hidden (by week of term); results for every earlier semester of each degree plan; Ahmed is a C student (CGPA under 2) who failed CSC211 in FA24 and passed it in SP25; Hira is strong.
- [x] **B5 Exams.** Pushed. Models `Exam` (term, kind, code, offeringIds, date/start/end, roomIds, published; unique term+kind+code) and `SeatAssignment` (unique exam+student). `services/exams.ts` + `routes/exams.ts` (`/api/exams`, `/mine`, `/options`, `/check`, `/publish`, `/:id`, `/:id/seats`, `/:id/seating`). Writes need `canManageExams` (Exam Office or IT). Blocking: a student with two overlapping papers, a room used by two overlapping papers, a second paper of the same kind for a course; warnings: seats < students, no room, date outside the term. Publishing a kind notifies each student once (key `exams:<term>:<kind>`); edits to a published paper notify its students; changing rooms or sections clears seats. Seating: `seededOrder` (repeatable shuffle per paper, so seats differ between papers) then `allocateSeats` (sections alternate); students are told their seat. Rooms booked for papers can't be deleted. Web: `/academics/exams` (Exam Office: tabs per kind, papers grouped by date, Add/Edit dialog with live clash check, Publish date sheet, Assign seats; students: My exams with seat; teachers: their papers + charts) and `/academics/exams/:id/seating` (printable grid per room; `data-print` in `index.css` prints only that page). Seed: published Sessional I (week 6) and Sessional II (week 11) date sheets with seats, placed greedily without clashes.
- [x] **B6 Polls in chats.** Pushed. `Message.kind` (`text`/`poll`) and `Message.poll` {question, options[{id o1…}], multiple, closedAt, closedById, votes[{userId, optionIds}]}; `MessageDTO.kind` + `poll` (`voterIds` per option, so no per-viewer data in broadcasts). Creating = `message:send` with `poll` (same `canPost`, idempotency and broadcast as messages). New acked events `poll:vote` (needs `canRead`; replaces the vote atomically with an update pipeline, `{ updatePipeline: true }` is required in Mongoose 9; empty list withdraws; its own token bucket 10/4 s) and `poll:close` (author or `canModerate`); `poll:updated` broadcast to the group room. Deleting the message erases the votes. Web: Create poll button + `PollDialog` in the composer, `PollCard` in the message list (optimistic vote, bars by share, close), `poll:updated` patches the cache; retrying a failed poll keeps its options.
- [x] **C1 Room finder.** Pushed. `GET /api/academics/rooms/finder?date&time` (default: now on campus) → each room's current booking, `freeUntil` (null = rest of day) and the day's bookings, from `classesOn(date)` in `services/timetable.ts` (after cancellations/moves) and that date's exams; an exam beats a class in the same room. The date-sheet check now also warns when a chosen room normally has a class then. Web: `/academics/rooms` (date, time, Now, free-for-at-least, kind, seats; free/in-use lists; expand for the day and a Week view link to the room timetable; refreshes every minute when following now).
- [x] **C2 Directory and search.** Pushed. `User.officeLocation` + `officeHours[]` (seeded clear of each teacher's classes by `seedOfficeHours`). `GET /api/academics/teachers/directory?q&departmentId` (office, hours, this term's courses, `canMessage` from `messageableIds()` in `services/direct.ts`, the same DM rules) and `PUT /api/academics/me/office` (faculty only). `GET /api/search?q` (courses, teachers, rooms, messages) and `/api/search/messages?q` (50): messages only from `readableGroups()` (memberships filtered by `canRead`; IT can't see DMs); ranked by a new text index on `Message.body`, then a word-prefix regex; snippets around the match; DMs named after the other person. Web: `/academics/teachers` (cards, in-office-hours badge, Message, Edit my office), Ctrl+K is now "Search CUI Connect" (conversations first, then courses, teachers, rooms, messages, "Search all messages"), `/search?q=` page, and `/chat/:id?message=` loads older pages until the message is there, then scrolls to and highlights it.
- [x] **C3** (attendance) was fully covered by B3.
- [x] **C4 What-do-I-need, transcript, degree progress.** Pushed. `services/records.ts`: `GET /api/academics/transcript?studentId` (terms oldest first, term GPA, CGPA, credits earned / required), `GET /api/academics/progress?studentId` (plan by semester: passed / failed / current / planned by the latest attempt, outside-plan passes, credits in progress, current semester) and `GET /api/academics/records/students?q` (who the viewer may open: everyone for Exam Office/IT, the department for HODs, taught/advised students for teachers, nobody for students). Access via `canViewStudentRecord` with teaches/advises facts. Web: `pages/academics/records-ui.tsx` (`RecordTabs`, `StudentPicker`, `WhatIfPanel` = `gradeTargets` + a what-if slider on Results), `/academics/transcript` (printable via `data-print`) and `/academics/progress`; "Student records" in the Academics sidebar for teachers, the Exam Office and IT.
- [x] **C5 Academic calendar, My calendar, reminders.** Pushed. Shared `CALENDAR_KINDS` (holiday, exams, registration, deadline, event; exams = "Exam period (no classes)"), `coversDate`, `CalendarEventDTO`, `CalendarItemDTO` (academic entries repeat on each day they cover, with `endsOn` for multi-day ones), `ClassOccurrenceDTO.suspended`, schemas `calendarEventSchema`, `calendarQuerySchema` (≤ 93 days, My calendar) and `academicCalendarQuerySchema` (≤ 400 days). Model `CalendarEvent`; `services/calendar.ts` (save/delete need `canManageCalendar` = Director's Office or IT; a new or moved holiday notifies all students and teachers, type `events`, and broadcasts `timetable:changed`; `myCalendar` merges academic entries, the viewer's classes (suspended ones skipped) and published papers with seats). Routes `GET /api/academics/calendar`, `GET /calendar/mine`, `POST /calendar`, `PUT/DELETE /calendar/:id`. **Holidays and exam periods suspend classes:** `loadTerm()` loads `NO_CLASS_KINDS` into `TermContext.holidays` (a public holiday wins over an exam week on the same day); `expand()` marks those days' classes `cancelled`, `canChange: false`, `suspended: true` with a note ("Holiday: Iqbal Day" / "Sessional II week: no regular classes"), including a class moved onto a day that later became a holiday; `changeClass` refuses moving a class onto such a day; the date-sheet check warns about papers on holidays. `services/reminders.ts`: `runReminders(now)` at/after 18:00 campus time sends "Tomorrow: CSC337 Sessional II at 9:00 AM" (with seat) and "Tomorrow is a holiday", at/after 08:00 "Today: <deadline/registration>"; keys `remind:…` plus an in-memory set; `startReminderScheduler()` runs it every minute from `server.ts` (`StartOptions.reminders`, off in tests). Seed `CALENDAR` (FA26: Sessional I week 5–10 Oct, fee deadline 30 Oct, Iqbal Day Mon 9 Nov, Sessional II week 9–14 Nov, registration 14–19 Dec, Quaid-e-Azam Day Fri 25 Dec, terminal exams 11–22 Jan…); attendance and exam seeds skip those days. Web: `/academics/calendar` (`CalendarPage.tsx`: My calendar month grid, day panel and Coming up; Academic calendar list with Add/Edit/Remove for the Director's Office and IT); `BreakNotice` (exported from `TimetablePage.tsx`) explains suspended days on the timetable and Home's Today card. Tests: `calendar.test.ts` (7), `clearWeekMonday()` / `goToClearWeek()` keep date-sensitive tests off holidays and exam weeks.
- [x] **C6 Assignments, course materials, live quizzes.** Pushed.
  - **Files (GridFS):** `services/files.ts` + `routes/files.ts` (`POST /api/files?purpose&offeringId` takes the raw bytes with the name in `x-file-name`; `GET /api/files/:id`; `DELETE` for unattached uploads). Model `StoredFile` (owner, course, purpose `submission`/`material`/`assignment`, `attachedTo`); bytes in bucket `files`. Rules: extension allow-list `FILE_TYPES` (only images shown inline, everything else downloads; `content-security-policy: sandbox` on downloads), 5 MB per file (`express.raw` limit, friendly 413), 50 MB per person, at most 5 per item. Who may download: unattached = only the uploader; submissions = the student + `canViewOfferingRecords`; materials/handouts = the class. `claimFiles` attaches uploads (owner, purpose and course must match), `releaseFiles` deletes replaced ones, `sweepOrphanFiles` (hourly, `startFileSweeper`) removes uploads never attached after a day. `clearStoredFiles()` runs in seed and setup. `StartOptions.reminders` was renamed `background` (reminders + file sweeper; tests pass `background: false`).
  - **Assignments:** models `Assignment` (dueAt, lateUntil, total, attachmentIds, `assessmentId` unique) and `Submission` (unique assignment+student; files, note, submittedAt, late, feedback). Each assignment owns a marks-sheet column (Assessment type `assignment`): grading (`PUT /api/teaching/assignments/:id/grades`) goes through `saveMarks`, returning grades (`POST …/return`) is `publishAssessment` with a link to the assignment, so the "marks are out" notifications and projected grades just work; that column can't be deleted on its own (`deleteAssessment` refuses). Window: open until due, then late until `lateUntil` (if set), then closed (`submissionWindow`); changing the due time recomputes `late`; no changes after grades are returned. Notifications (type `coursework`): new assignment, new due date, and "Due soon" 24 h before to students who haven't handed in (`reminders.ts`).
  - **Materials:** model `Material` (week 1–18, title, file or http(s) link); one "new material" alert per course per day.
  - **Live quizzes:** models `Quiz` (questions with stable ids `q1…`, status draft/live/ended, `current`, `revealed`, `assessmentId`) and `QuizResponse` (unique quiz+question+student; choice, correct, points, ms). `services/quizzes.ts`: start (students told), next (conditional update, so a double click can't skip), the question closes when its time is up (+1.5 s grace, in-process timer) or when every student has answered, reveal, end, save scores as an unpublished quiz column (absent = 0; saving again updates it). Socket events: `quiz:join` (ack; students must be enrolled and the quiz started; the teacher also joins `quiz:<id>:host`), `quiz:leave`, `quiz:answer` (ack; first answer final, token bucket 6/2 s); server → `quiz:state` (to the quiz room and the course chat room: everyone refetches their own view), `quiz:tally` and `quiz:presence` (host only, so students can't follow the crowd). Ranking `rankQuiz` (score, then speed). Host view has a per-question breakdown.
  - **Web:** "Coursework" in the Academics sidebar (students, faculty): `/academics/coursework` (live banner, due soon / open assignments, courses with "to do" / "to grade"), `/academics/coursework/:offeringId` (tabs Assignments, Materials by week, Quizzes; teacher: New assignment, Add material, New quiz, Marks sheet), `/academics/assignments/:id` (student: hand in files + note, take back, grade and comments; teacher: every student with work, inline mark + comment, Save grades, Return/Hide grades), `/academics/quizzes/new?course=` and `/academics/quizzes/:id` (editor for drafts; host screen with lobby, countdown, live bars, Show answer, Next, results with breakdown and Save as quiz marks; student screen with big option buttons, "Correct! +2", rank). `components/coursework/files.tsx` (`FilePicker` uploads at once, `FileList`). Course pages link to Coursework. `REFRESH_ON` now lists several keys per type (results also refresh coursework).
  - **Seed:** `seed/coursework.ts` for Imran's CSC337 BCS-7A: materials for the weeks so far, Assignment 1 linked to the existing "Assignment 1" marks column (everyone handed in, Ahmed late, feedback by mark, returned), "Assignment 2: REST API with Express" due in 4 days (some handed in, Hira not), an ended warm-up quiz with answers, and the draft "Quick check: Socket.IO rooms" to run live in the demo.
  - **Tests:** `packages/shared/src/coursework.test.ts` (6), `apps/server/test/coursework.test.ts` (8: files, on-time/late/closed, grading and returning, overview, materials, a full live quiz over sockets, auto-close), `e2e/coursework.spec.ts` (3: hand in → grade → returned live; share a link; live quiz on a phone).
- [ ] C7 @mentions, pinned messages, reactions, replies, anonymous questions, office-hour booking, web push
- [ ] C8 Requests/applications, fee status, course registration, teacher evaluation, complaints
- [ ] C9 Events + RSVP, campus directory/map, jobs board, lost & found, transport
- [ ] C10 Profile + photo, digital ID card with public verification, notification settings
- [ ] After Stage B: ask the user about the demo site (decision 7); update `USER_GUIDE.md`, `ARCHITECTURE.md` and `README.md` for the new features.

### 1a.3 B1 Timetable: what was built
**Files:**
- **Shared** (`packages/shared/src`):
  - `academic-schemas.ts`: `timeSchema`, `classSlotSchema` (30 min to 4 h, 07:00–20:00), `classChangeSchema` (a `cancelled` or `moved` union), `TIMETABLE_VIEWS`, `timetableQuerySchema`.
  - `academic-dto.ts`: `SectionRefDTO`, `RoomRefDTO`, `ClassSlotDTO`, `OccurrenceStatus` (`scheduled`, `cancelled`, `moved-out`, `moved-in`), `ClassOccurrenceDTO`, `TimetableWeekDTO`, `TodayDTO`, `SlotCheckDTO`.
  - `events.ts`: `timetable:changed {offeringIds}`.
  - `academics.ts`: `formatShortDate('2026-10-12')` → `Mon 12 Oct`.
- **Server** (`apps/server/src`):
  - Models `ClassSlot` (offeringId, termId, plus sectionId and instructorId copied from the offering, roomId, day 1–6, start, end, kind) and `ClassChange` (slotId+date unique; cancelled or moved with newDate/newStart/newEnd/newRoomId and a note). Both are registered in `models/index.ts`.
  - `services/timetable.ts`:
    - `timetableWeek` (views me / section / teacher / room);
    - `todayFor` (now, next, today);
    - `checkSlot` and `saveSlot` (clash check; room, teacher and section clashes are blocking, a 409 with reasons; repeaters, room capacity and lab-in-classroom are warnings);
    - `deleteSlot`, `listSectionSlots`;
    - `changeClass` (cancel or move one date: past dates are refused, the date must match the weekday, moves are clash-checked against that day);
    - `restoreClass`, `roomInUse`.
  - Notifications use type `timetable`. Weekly edits are deduplicated to one per course per day (key `timetable:<offering>:<date>`). The person making the change isn't notified.
  - `realtime/notifier.ts`: `broadcastTimetableChanged` uses `io.emit` (timetables are public on campus).
  - `services/rooms.ts`: rooms with classes can't be deleted (409).
  - `http/routes/academics.ts` adds:
    - `GET /sections`, `/teachers`, `/offerings?sectionId=`;
    - `GET /timetable?view&id&week`, `/timetable/today`, `/timetable/sections/:id/slots`;
    - `POST /timetable/check`, `POST /timetable/slots`, `PUT` and `DELETE /timetable/slots/:id`;
    - `POST /timetable/slots/:id/changes`, `DELETE /timetable/slots/:id/changes/:date`.
  - `seed/academic.ts`: `seedTimetable()` is a greedy, clash-free placer: 2 lectures on different days, plus a 3-hour lab for courses with lab credits; FYP gets 1 meeting. It's called from `seed.ts` after the courses.
- **Tests:** `apps/server/test/timetable.test.ts` (8 tests):
  - the seeded timetable has no clashes;
  - views and permissions;
  - the department office can edit only its own department;
  - clash refusal, and the repeater warning;
  - a room in use can't be deleted;
  - cancel with a live notification only to enrolled students;
  - move and restore;
  - "now and next".
- **Web** (`apps/web/src`):
  - `lib/api.ts` (`academics.sections`, `teachers`, `offerings`, `timetable`, `today`, `sectionSlots`, `checkSlot`, `saveSlot`, `deleteSlot`, `changeClass`, `restoreClass`) and `lib/cache.ts` (keys `sections`, `teachers`, `timetable` = `['academics','timetable']`, `today`).
  - `components/timetable/WeekGrid.tsx`: a generic time grid with lanes for overlaps, a colour per course (`hueFor`), status badges and a now line.
  - `components/timetable/ClassDialog.tsx`: details, "Open course chat", and for the instructor: Cancel (with reason), Move (date, time, room), Undo.
  - `pages/academics/AcademicsLayout.tsx`: an `AreaLayout` with Timetable, plus Timetable editor for admin and the department office.
  - `pages/academics/TimetablePage.tsx`:
    - tabs Mine / Section / Teacher / Room, a picker, and week navigation (URL params `view`, `id`, `week`);
    - the grid on desktop and a day list on phones;
    - it also exports `useCampusClock` and `canEditTimetable`.
  - `pages/academics/TimetableEditorPage.tsx`: a section picker, each course's hours per week, and an "Add class" dialog with a live clash check (debounced `/timetable/check`).
  - `pages/home/HomeCard.tsx` (extracted), `pages/home/TodayCard.tsx` (Now, Next class with a countdown, today's list), and `pages/home/HomePage.tsx` (Today card for students and faculty).
  - `router.tsx`: `/academics` → `/academics/timetable`, plus `/academics/timetable/edit`.
  - `lib/nav.ts`: an Academics item for everyone.
  - `hooks/useRealtimeSync.ts`: `timetable:changed` invalidates `keys.timetable`.
- **E2E:** `e2e/academics.spec.ts` has two tests (passing): "Home shows the next class", and "a teacher cancels a class and the student sees it live" (it uses the Next week button, cancels the first CSC337 block, checks Hira's live update and bell, then clicks Undo change).
- **Visual review:** `e2e/tmp-visual.spec.ts`-style throwaway specs (screenshots into a scratch folder with `REVIEW_DIR`) are the way to check new screens; delete them before committing.

### 1a.4 Architecture of the university features (how to extend)
- **Shared** (`packages/shared/src`):
  - `academics.ts`: pure calculators and constants:
    - campus time (`campusClock`, `campusInstant`, `formatClock`, `formatShortDate`, `mondayOf`, `addDays`);
    - terms (`termCodeFor`, `semesterNumber`, …);
    - grading (`GRADE_SCALE`, `DEFAULT_GRADING`, `courseStanding`, `gradeTargets`, `gpa`);
    - attendance (`attendanceSummary`);
    - timetable (`findClashes`, `BLOCKING_CLASHES`);
    - exams (`allocateSeats`, `eventsOverlap`);
    - rooms (`ROOM_KINDS`).

    It's tested in `academics.test.ts`.
  - `access.ts`: record permissions returning the same `Decision` type as `policy.ts`:
    - `canManageOffering` (the instructor or admin);
    - `canViewOfferingRecords` (instructor, HOD, Exam Office, admin);
    - `canStudyIn` (enrolled students);
    - `canViewStudentRecord` (self, admin, Exam Office, a teacher of the student, the batch advisor, the HOD);
    - `canManageTimetable` (admin, the department office of that department);
    - `canManageCatalog` (admin, the HOD and department office of that department);
    - `canManageCampus` (admin);
    - `canManageExams` (Exam Office);
    - `canManageFees` (Accounts Office);
    - `canManageCalendar` (Director's Office);
    - `canManageStudentAffairs` (Student Affairs).

    It's tested in `access.test.ts`. New deny codes in `policy.ts`: `NOT_ALLOWED`, `NOT_ENROLLED`, `OFFICE_ONLY`.
  - `academic-dto.ts` and `academic-schemas.ts` hold the university types and Zod schemas. Every new feature adds its types here; they're exported from `index.ts`.
- **Server** (`apps/server/src`):
  - **Models:** `Term` (exactly one `current`), `Room`, `CatalogCourse` (keyed by `code`), `Program` (plan per semester), `Notification` (deduplicated by `userId + key`, deleted automatically after 120 days), `ClassSlot`, `ClassChange`.
  - **`CourseOffering`:** gained `termId`, `capacity` and `grading`. Its unique index is now (code, sectionId, termId). `initModels()` runs `syncIndexes()` for `CourseOffering` (the `SYNCED_MODELS` set in `models/index.ts`).
  - **`services/terms.ts`:** `currentTerm()` is cached and creates the term from today's date if none exists. Call `invalidateTermCache()` wherever data is wiped (seed and setup already do).
  - **`services/academic-setup.ts`:** `ensureAcademicDefaults()` runs at every start (in `server.ts`). It gives old offerings a term and backfills the catalog. This is how the user's live campus was upgraded.
  - **`services/catalog.ts`:** catalog and programmes (permission checks, CSV import, `ensureCatalogEntry`). `services/structure.ts` `createCourse` sets `termId` and adds the course to the catalog; `listCourses` lists the current term only.
  - **`services/notifications.ts`:** `notify(userIds, {type, title, body, link, key})` never throws. It pushes `notification:new` live to `user:<id>`. Use it for every feature's alerts.
  - **Routes:**
    - `http/routes/academics.ts` (`/api/academics/*`: anyone signed in reads; writes are checked with `access.ts`);
    - `http/routes/notifications.ts` (`/api/notifications`);
    - `admin.ts` adds `/api/admin/terms` and `/api/admin/rooms`, and the overview's `academics` counts.
  - **Helpers:** `lib/csv.ts` (`parseCsv`, `readCsv`), `lib/text.ts` (`escapeRegex`, `containsText`).
  - **Seed:**
    - `seed/academic-data.ts`: terms FA23–FA26 (FA26 current), 13 rooms, a 44-course catalog, BCS/BSE/BEE plans.
    - `seed/academic.ts`: `seedAcademicStructure`, `seedTimetable`.
    - `seed/data.ts` `COURSES`: each section's full current semester. BCS sections are taught only by CS faculty, which keeps the test "Hira can't DM Dr. Sana Javed (EE)" true.
- **Web** (`apps/web/src`):
  - Home (`/home`, the landing page).
  - The Academics area (`/academics/*`).
  - `/notifications`.
  - Admin `/admin/academic` (tabs Terms, Rooms, Course catalog, Degree programmes), plus the "Set up academics" checklist on Overview.
  - **Building blocks:**
    - `components/AreaLayout.tsx` (sidebar plus phone tabs for every area);
    - `components/page.tsx` (`PageHeader`, `Card`, `Table`, `Tabs`, `Stat`; `pages/admin/ui.tsx` re-exports it);
    - `hooks/useSubmit.ts` (`useSubmit` validates with the shared Zod schema; `useAction` runs buttons);
    - `hooks/useNotifications.ts`;
    - `components/NotificationBell.tsx` and `NotificationList.tsx`;
    - `components/MobileTabBar.tsx` (Home, Chats, Academics, Alerts, You);
    - `lib/nav.ts` (`areasFor` role decides the rail and tab items);
    - `hooks/academics.ts` (`useTerms`, `useCurrentTerm`, `useRooms`, `usePrograms`, `useStudentSemester`).
  - The chat sidebar's phone account row was removed; `UserMenu` now has variants `rail` and `tab`.
- **Real-time pattern:** a service changes data, then calls `notify()` for the affected people, then a notifier broadcast so open screens refetch (as with `timetable:changed`). The client handles it in `useRealtimeSync.ts` by invalidating the query keys.
- **Tests pattern:**
  - Shared unit tests sit next to their files.
  - Server integration tests are in `apps/server/test/*.test.ts` (`startTestApp()` is the seeded demo; `startTestApp({seed:false})` is empty; also `nextEvent`, `noEvent`, `userBy`).
  - Browser tests are in `e2e/*.spec.ts`:
    - sign-in lands on `/home`, so use `goToChats(page)` before reading the chat sidebar;
    - `openConversation` does that itself.

### 1a.5 Design notes for the remaining features (follow these)
- **B2 Catalog & course pages:**
  - `/academics/courses`: search by code or title and filter by department, using `GET /api/academics/catalog`.
  - `/academics/courses/:code`:
    - description, credits `formatCredits`, prerequisites as links, CLOs, weekly outline;
    - grading weights (`DEFAULT_GRADING` or the offering's own);
    - this term's sections with instructor, schedule (from `ClassSlot`) and seats;
    - "Open chat" when the viewer is a member.
  - Add an endpoint for course detail plus its offerings and slots.
- **B3 Attendance:**
  - **Models:** `AttendanceSession` {offeringId, slotId?, date, secret, status open|closed, openedBy} and `AttendanceRecord` {sessionId, offeringId, studentId, status present|late|absent|leave, method qr|manual}, unique (session, student).
  - **Teacher:** "Start attendance" opens a full-screen QR (`qrcode.react`) that refreshes by fetching the token from REST each window. It shows a live list via the `attendance:update` socket event to the instructor's `user:` room, plus manual roll call.
  - **Student:**
    - `/attend/:sessionId?t=` checks in, rechecking login, enrolment, token window and that the session is open;
    - "My attendance" shows a per-course % with `attendanceSummary` and shortage warnings, plus a notification when they're short.
  - `RequireAuth` already keeps `?search` in the login redirect.
- **B4 Marks:**
  - **Models:** `Assessment` {offeringId, type, title, total, date, published} and `Mark` {assessmentId, studentId, obtained|null}. `CourseOffering.grading` overrides `DEFAULT_GRADING` (it must total 100).
  - **Teacher:** a marks grid, then Publish, which sends `notify` type `results` ("AWT Sessional I marks are out").
  - **Student:**
    - a breakdown using `courseStanding`, with the projected grade from `gradeFor`;
    - term GPA and CGPA via `gpa`.

    Past terms need `Result` records: seed past-term offerings (no chat groups) with final grades for the transcript (C4).
- **B5 Exams:**
  - **Models:** `Exam` {termId, offeringIds, courseCode, kind sessional1|sessional2|terminal, date, start, end, roomIds, published} and `SeatAssignment` {examId, studentId, roomId, row, seat}.
  - **Exam Office** (a new "Office" area for staff): date sheet with a check that no student has two papers at once (`eventsOverlap`); Publish notifies students.
  - **Seating:** `allocateSeats` mixes sections across rooms using `Room.examRows × examCols`, gives a printable chart, and notifies each student of their seat.
  - **Students:** "My exams" with room, row and seat.
  - **Worked-out details (2026-10-11, not started in code):** one `Exam` per course code per kind covering all its sections (`offeringIds`); blocking checks: a student with two overlapping papers (`eventsOverlap`) and a room used by two overlapping exams; warning if total seats < students. Publishing a kind notifies each student once (key `exams:<term>:<kind>`); later date/room changes notify affected students; seat allocation notifies each student their seat. One route `/academics/exams`, role-based: Exam Office/admin manage (tabs Sessional I / II / Terminal, Add paper, Publish, Auto-assign seats, printable chart per room); students see My exams; teachers see their courses' exams and charts. Seats come from `Room.examRows × examCols` (seed: A-101 and A-102 have 6×6; add a hall if needed). Seed: Sessional I in the past (matches the marks' week-6 date) and Sessional II in weeks 11–12, published with seats, placed greedily without student or room clashes.
- **B6 Polls:**
  - `Message` gains `kind: 'text'|'poll'` and `poll {question, options[], multiple, closedAt}`, with votes stored on the message.
  - Socket `poll:vote` and `poll:close` with acknowledgements, and a `poll:updated` broadcast to the group room.
  - Creating a poll requires `canPost`; voting requires `canRead`. The composer gets "Create poll".
- **C-stage summary** (from the plan; same patterns):
  - **C1 Room finder:** free rooms now or at a chosen time, and what's on in each room, using slots and changes.
  - **C2 Search:** teacher directory with office location, courses and office hours; Ctrl+K searches chats, courses, teachers, rooms and messages; message search uses a Mongo text index limited to chats you can read.
  - **C4 Results:** "What do I need" (`gradeTargets`), printable transcript, degree progress against `Program.plan`.
  - **C5 Calendar:** `CalendarEvent` managed by the Director's Office; My calendar combines classes, exams, deadlines, events and bookings; a 1-minute in-process reminder scheduler with deduplication keys.
  - **C6 Coursework:** assignments with GridFS submissions, a late flag and grades that feed marks; materials by week; live quizzes over sockets (`quiz:*`) whose scores become quiz marks.
  - **C7 Chat upgrades:** mentions (autocomplete and notify), pins, reactions, replies, anonymous questions in course chats, office-hour booking (only if `canDM` allows), web push with VAPID keys generated and stored in the database, plus a PWA manifest and service worker.
  - **C8 Services:** requests with routing (leave → batch advisor, transcript/bonafide → Exam Office, ID card → Student Affairs) and a status tracker; fees by the Accounts Office with a printable challan; registration with prerequisites, clashes, seats, credit limit and advisor approval; anonymous evaluation (store responses without identity, plus a separate "submitted" marker); complaints to Student Affairs.
  - **C9 Campus life:** events with RSVP; directory/map of blocks → rooms with "now"; jobs board; lost & found; transport.
  - **C10 Profile:** profile with a GridFS photo; ID card with a signed QR leading to a public `/verify/:token` page; notification settings per type and for push.

### 1a.6 Environment notes learned in this build (Windows, this machine)
- **The user does not want cloud sessions used.** Work only in the local session.
- **GitHub branch `wip/timetable`** is an old backup of unfinished B1, now obsolete (B1 is on `main`). Offer to delete it (`git push origin --delete wip/timetable`); don't delete without a yes.
- **Editing files from Bash:** heredocs that contain both quotes and `$` sometimes fail to parse, and JSON patch files can't hold regex escapes like a backslash-d. Prefer the Edit/Write tools; Bash works for `node` scripts written to the scratchpad.
- **Node scripts that edit text:** never pass a replacement *string* containing `$` to `String.replace` (`` $` `` and `$&` are special: one such edit pasted the whole file into the middle of this file). Use `slice()` or a replacement function.
- **Mongoose 9** refuses update pipelines (arrays) unless the query passes `{ updatePipeline: true }`.
- **Tests and dates:** server tests use `clearWeekMonday()` and browser tests `goToClearWeek()` so they never land on a holiday or exam week.
- **Never use PowerShell `.Replace()` scripts for TypeScript template literals.** PowerShell treats the backtick as its escape character and swallowed them. Use the Edit tool for anything with backticks or `${…}`.
- **Bulk text edits:** use `[IO.File]::ReadAllText` / `WriteAllText(..., (New-Object Text.UTF8Encoding $false))` (no BOM). `Get-Content` shows UTF-8 like `·` and `…` as mojibake, but the files are fine.
- **Biome a11y:** `aria-label` on a plain `<span>` fails lint. Use an `sr-only` child instead.
- **Playwright:** `getByRole('cell', { name })` also matches action buttons named "Actions for X", so use `exact: true`.
- **The browser pane:** often hidden or not painting, so screenshots time out. Use Playwright screenshot specs instead (see `e2e/tmp-visual.spec.ts`).
- **What Claude can't do here:**
  - The Claude Terminal panel doesn't start (missing shell-integration file).
  - The auto-mode classifier blocks Claude from opening public tunnels (`npm run share`).
  - Claude may not create accounts or enter passwords on the live site; only the user can.

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
