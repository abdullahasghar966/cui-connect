# CUI Connect: user guide

**Live site:** https://cui-connect.onrender.com

This guide walks through every feature in the order you'll use them: build the campus as the admin, hand out accounts, then chat, moderate and watch the boundaries work.

> **Good to know about the free hosting.** After 15 minutes with nobody online, the site sleeps. The next visitor waits about a minute while it wakes up. Nothing is lost: all data lives in MongoDB Atlas. Once people are chatting, it stays awake.

---

## 1. Build your campus (admin)

Sign in as the administrator you created on the setup page. The **Admin console → Overview** page shows a **Set up your campus** checklist. Follow it top to bottom: each step needs the one before it, and each ticks itself off when done.

The example below creates **8 people from different posts**, enough to show every communication boundary.

| # | Person | Post | How they sign in |
|---|---|---|---|
| 1 | You | IT Services admin | your email |
| 2 | Kamran Akhtar | Director's Office (staff) | `director@…` |
| 3 | Sadia Rehman | Examination Office (staff) | `exam@…` |
| 4 | Dr. Ayesha Siddiqui | HOD, Computer Science (faculty) | `ayesha@…` |
| 5 | Dr. Imran Haider | Lecturer, batch advisor of BCS-7A, teaches AWT (faculty) | `imran@…` |
| 6 | Ali Raza | Student, BCS-7A, class representative | `FA23-BCS-001` or email |
| 7 | Hira Khan | Student, BCS-7A | `FA23-BCS-002` or email |
| 8 | Usman Tariq | Student, BCS-7B, class representative | `FA23-BCS-031` or email |

Use real email addresses for real people. Each person gets an **initial password** from you and changes it after signing in (section 2).

### Step 1: Department
**Structure → Departments.** Code `CS`, name `Department of Computer Science` → **Add**.

Automatically created: **CS Department Notices**, **CS Faculty Lounge**, **CS CR Council**.

### Step 2: Faculty and staff
**Users → Add user**, once per person:

- **Dr. Ayesha:** Role *Faculty*, Department *CS*, Designation *Professor*, tick **Head of Department**.
- **Dr. Imran:** Role *Faculty*, Department *CS*, Designation *Lecturer*.
- **Kamran:** Role *Staff*, Office *Director's Office*.
- **Sadia:** Role *Staff*, Office *Examination Office*.

Fill **Full name**, **Email** and an **Initial password** (at least 8 characters) for each.

### Step 3: Sections
**Structure → Sections.**

- Department *CS*, Program `BCS`, Intake `FA23`, Name `BCS-7A`, Batch advisor *Dr. Imran* → **Add**.
- The same again for `BCS-7B` with batch advisor *Dr. Ayesha*.

Each section gets a class group (**BCS-7A Class**, **BCS-7B Class**). The batch advisor moderates it.

### Step 4: Students
**Users → Add user**, Role *Student*:

- **Ali:** Registration number `FA23-BCS-001`, Section *BCS-7A*, tick **Class representative (CR)**.
- **Hira:** `FA23-BCS-002`, Section *BCS-7A*.
- **Usman:** `FA23-BCS-031`, Section *BCS-7B*, tick **CR**.

**Many students at once:** **Users → Import CSV**. The first line names the columns:

```
name,email,role,department,section,regNo,designation,office,isCR,isHOD,password
Ali Raza,ali@example.com,student,CS,BCS-7A,FA23-BCS-001,,,true,,
Hira Khan,hira@example.com,student,CS,BCS-7A,FA23-BCS-002,,,,,
```

Rows without a password get the **Default password** you type in the dialog.

### Step 5: Courses
**Structure → Course offerings.** Code `CSC337`, Title `Advanced Web Technologies`, Section *BCS-7A*, Instructor *Dr. Imran* → **Add**.

Every BCS-7A student is enrolled automatically, and the group **Advanced Web Technologies · BCS-7A** appears in their sidebar.

**Repeaters and drops:** click the student-count button on a course row to open the enrollment manager. Use **Find a student to enroll** to add a student from another section, or the remove button to take someone out. Their sidebar changes instantly.

### Step 6 (optional): Societies and committees
**Groups & rules → New group.**

- **Society (open to join).** Example: `ACM CUI Chapter`. Anyone can find it under *Browse societies* and join.
- **Custom group (committee, office cell…).** Example: `Exam Coordination Cell`. Members are invited only. You choose:
  - **Who may be a member** (e.g. only staff and students).
  - **Who can post:** all members, only moderators, or chosen roles (e.g. only *Staff*, so the Exam Office posts and CRs read).

Then select the group and add people with **Find a person to add**, as Member, Moderator or Owner.

### Formats the forms expect
| Field | Format | Example |
|---|---|---|
| Department code | 2–6 letters | `CS`, `EE`, `SE` |
| Section name | Program-SemesterLetter | `BCS-7A` |
| Intake | FA or SP + year | `FA23` |
| Registration number | Intake-Program-Number | `FA23-BCS-001` |
| Course code | 3 letters + 3 digits | `CSC337` |
| Password | at least 8 characters | |

---

## 2. Give people their accounts

Send each person, privately: the site link, their **email or registration number**, and their **initial password**. When they sign in:

1. **Account menu** (their avatar at the bottom left) → **Change password**.
2. Enter the current password and a new one. They stay signed in on that device; any other device is signed out.

**Forgotten password:** **Users → ⋯ → Reset password** (admin). This signs them out everywhere.

---

## 3. Chatting (everyone)

**Sidebar.** Conversations are grouped into *Announcements*, *Courses*, *Class & department*, *Societies & groups* and *Direct messages*. Click a section title to collapse it. Green numbers are unread messages.

**Unreads home.** The **Chats** page lists every conversation with new messages and a preview of the latest one.

**Jump anywhere.** Press **Ctrl + K** (⌘ + K on Mac), type part of a name, and press Enter.

**Sending.**
- **Enter** sends; **Shift + Enter** starts a new line.
- Messages appear instantly for everyone in the group.
- A red **New** line marks where your unread messages start.

**Live signals.**
- *"Hira is typing…"* appears while someone types.
- Green dots on avatars show who is online.
- In direct messages, **Delivered** turns into **Seen** when the other person reads it.

**Why can't I post here?** In a read-only channel, the message box is replaced by a sentence explaining who can post (e.g. *Notices: only the HOD and the department office can post*). The header shows the same rule.

**Delete a message.** Hover over it → **⋯ (Message options)** → **Delete message**.
- Authors can delete their own messages for 15 minutes.
- Moderators can delete any message.

**Direct messages.** **New message** (pencil icon at the top of the sidebar) lists **only the people you're allowed to message**. For students that's their instructors, batch advisor, HOD, classmates, department peers, people who share a group, and the offices. Anyone may always reply to someone who messaged them first.

**Societies.** **Browse societies** → **Join**. To leave, open the society → **⋯ (More options)** → **Leave group**. Official groups (class, course, department) can't be left: they come from the university records.

**Members panel.** Click the member count (avatars at the top right) to see who's in the group, their roles and who's online. Open the **⋯** next to a person → **Send direct message**.

**Appearance.** Account menu → **Light**, **Dark** or **Match system**. The site also works on phones: open the same link in the phone's browser.

---

## 4. Moderating (instructors, batch advisors, HODs, group owners)

You moderate a group when you own it or are its moderator. For example: the instructor of a course, the batch advisor of a section, the HOD of department notices, the Director's Office in the campus channel, or the owner of a society.

| Action | Where | Effect |
|---|---|---|
| **Lock / Unlock** | **Lock** button in the group header | Locked: only moderators can post (announcement-only). Students' message boxes switch to read-only instantly |
| **Mute** | Members panel → person → **Mute for 15 minutes / 1 hour / 1 day** | They can read but not post until the time runs out; **Unmute** ends it early |
| **Change role** | Members panel → **Make moderator** / **Remove moderator role** | Moderators can lock, mute and delete |
| **Remove** | Members panel → **Remove from group** | The group disappears from their sidebar at once (custom groups and societies) |
| **Delete any message** | Message options → **Delete message** | Removed for everyone, live |

---

## 5. Admin console (IT Services)

**Overview**
- Live counters: students, faculty, staff, groups, messages, **Online now**, **Blocked / min**.
- **Blocked attempts** streams every boundary violation as it happens (e.g. *"Hira Khan was blocked from posting in CS Department Notices"*).
- The group-rules and direct-message-rules tables are the policy in plain words.

**Users.** Search by name, email or registration number, filter by role, and use **⋯** on a row:

| Action | Effect |
|---|---|
| **Edit details** | Name, email, designation, office. For students, change the **Section**: their class and course groups swap live |
| **Make class representative / Remove CR role** | Adds or removes the CR Council group live |
| **Appoint as HOD** | Replaces the current HOD; ownership of department notices, lounge and CR council moves with it |
| **Reset password** | Sets a new password and signs them out everywhere |
| **Deactivate / Reactivate** | Deactivating signs them out immediately with a message; they can't sign in again until reactivated |

**Structure.** Departments, sections (change a **Batch advisor** from the dropdown at any time), course offerings and the enrollment manager.

**Groups & rules.** Every group except private chats. Select one to:
- change **Who can post**, **Who may be a member** and **How people join**;
- tick **Locked**;
- add or remove members and set their roles.

Changes apply to everyone online immediately.

**Audit log.**
- Every administrative change and every blocked attempt, live.
- Tick **Blocked attempts only** to see just the boundary violations.
- Message text is **never** recorded, and admins **cannot read direct messages**.

---

## 6. Demo: prove the boundaries work (viva checklist)

Open the site in a normal window and a **private/incognito** window, or on a phone, to be two people at once.

1. **Read-only notices.** Hira opens *CS Department Notices*: she can read but the box says only the HOD and department office can post. Dr. Ayesha posts and Hira sees it instantly.
2. **Faculty lounge is private.** Hira's sidebar has no *CS Faculty Lounge*. In *Groups & rules*, try adding her: refused.
3. **Sections are isolated.** Usman (BCS-7B) never sees *BCS-7A Class* or its messages.
4. **Direct-message rules.** Hira → **New message**: her instructor, HOD, classmates and the offices are listed; the IT admin is not. (Add a faculty member from another department to show that unrelated faculty are hidden too.) Kamran (Director's Office) can message anyone.
5. **Live lock.** Dr. Imran presses **Lock** in the AWT course: Hira's message box changes to read-only without refreshing. **Unlock** restores it.
6. **Live mute.** Dr. Imran mutes Hira in *BCS-7A Class* for 15 minutes; her posts are refused until he unmutes her.
7. **Live membership.** Admin makes Hira a **CR**: *CS CR Council* appears in her sidebar while she watches.
8. **Repeater.** Admin enrolls Usman (BCS-7B) in *Advanced Web Technologies · BCS-7A* from the enrollment manager: the course group appears in his sidebar.
9. **Session revocation.** Admin **deactivates** Hira while she's online: she's signed out with a message.
10. **Audit.** Every refusal above appears live in **Overview → Blocked attempts** and the **Audit log**.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| The site takes about a minute to open | It was asleep (free plan). Wait; it wakes up |
| "Too many sign-in attempts" | 20 sign-ins per minute per network; wait a minute |
| "You are sending messages too quickly" | Bursts of 8 messages, then 2 per second |
| Someone forgot their password | Admin: **Users → ⋯ → Reset password** |
| "This account has been deactivated" | Admin: **Users → ⋯ → Reactivate** |
| A message box is missing | That person isn't allowed to post there; the sentence in its place says who can |
