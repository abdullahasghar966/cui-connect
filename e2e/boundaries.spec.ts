import { io } from 'socket.io-client';
import {
  composer,
  conversation,
  expect,
  goToChats,
  openConversation,
  PEOPLE,
  signIn,
  test,
} from './fixtures';

const COURSE = 'Advanced Web Technologies · BCS-7A';

test('a student reads announcements but cannot post in them', async ({ page }) => {
  await signIn(page, PEOPLE.hira);
  await openConversation(page, 'CS Department Notices');
  await expect(page.getByTestId('composer-locked')).toContainText(
    'only the HOD and the department office can post',
  );
  await expect(composer(page)).toHaveCount(0);
});

test('messages arrive live for other members and never for other sections', async ({ person }) => {
  const imran = await person(PEOPLE.imran);
  const hira = await person(PEOPLE.hira);
  const usman = await person(PEOPLE.usman); // BCS-7B: not in this course

  await openConversation(imran, COURSE);
  await openConversation(hira, COURSE);
  await goToChats(usman);
  await expect(conversation(usman, COURSE)).toHaveCount(0);

  const text = `Quiz moved to Thursday (${Date.now()})`;
  await composer(imran).fill(text);
  await composer(imran).press('Enter');

  await expect(hira.getByRole('main').getByText(text)).toBeVisible({ timeout: 2_000 });
  await expect(usman.getByText(text)).toHaveCount(0);
});

test('an instructor locks a course and the student composer updates instantly', async ({
  person,
}) => {
  const imran = await person(PEOPLE.imran);
  const hira = await person(PEOPLE.hira);
  await openConversation(imran, COURSE);
  await openConversation(hira, COURSE);
  await expect(composer(hira)).toBeVisible();

  await imran.getByRole('button', { name: 'Lock group' }).click();
  await expect(hira.getByTestId('composer-locked')).toContainText('locked');

  await imran.getByRole('button', { name: 'Unlock group' }).click();
  await expect(composer(hira)).toBeVisible();
});

test('the people directory only offers allowed direct messages', async ({ page }) => {
  await signIn(page, PEOPLE.hira);
  await goToChats(page);
  // The workspace sidebar has two "New message" entry points (header icon and list row).
  await page.getByRole('button', { name: 'New message' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New message' });
  await expect(dialog.getByText('Dr. Naveed Anwar')).toBeVisible(); // teaches her
  await expect(dialog.getByText('Sadia Rehman')).toBeVisible(); // Examination Office
  await expect(dialog.getByText('Dr. Sana Javed')).toHaveCount(0); // EE, doesn't teach her
  await expect(dialog.getByText('IT Services Admin')).toHaveCount(0);

  await dialog.getByText('Dr. Naveed Anwar').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dr. Naveed Anwar' })).toBeVisible();
  await composer(page).fill('Sir, could you share the lexer rubric?');
  await composer(page).press('Enter');
  await expect(
    page.getByRole('main').getByText('Sir, could you share the lexer rubric?'),
  ).toBeVisible();
});

test('an admin adds a student to a group and it appears in their sidebar live', async ({
  person,
}) => {
  const admin = await person(PEOPLE.admin);
  const mehwish = await person(PEOPLE.mehwish);
  await goToChats(mehwish);
  await expect(conversation(mehwish, 'ACM CUI Chapter')).toHaveCount(0);

  const groups = await (await admin.request.get('/api/admin/groups?type=SOCIETY')).json();
  const acm = groups.find((g: { name: string }) => g.name === 'ACM CUI Chapter');
  const users = await (await admin.request.get(`/api/admin/users?q=${PEOPLE.mehwish}`)).json();
  const response = await admin.request.post(`/api/groups/${acm.id}/members`, {
    data: { userId: users[0].id },
  });
  expect(response.status()).toBe(201);

  await expect(conversation(mehwish, 'ACM CUI Chapter')).toBeVisible();
  await expect(mehwish.getByText('You were added to ACM CUI Chapter')).toBeVisible();
});

test('the server blocks a crafted post and the admin sees it live', async ({ person, baseURL }) => {
  const admin = await person(PEOPLE.admin);
  await admin.goto('/admin');
  await expect(admin.getByRole('heading', { name: 'Overview' })).toBeVisible();

  // Bypass the UI entirely (the composer is disabled) with a raw Socket.IO client using
  // Hira's session cookie: the server, not the browser, enforces the boundary.
  const hira = await person(PEOPLE.hira);
  const session = (await hira.context().cookies()).find((c) => c.name === 'cui_session');
  const groups = await (await hira.request.get('/api/groups')).json();
  const campus = groups.find((g: { name: string }) => g.name === 'CUI Islamabad Official');
  const socket = io(baseURL, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { cookie: `cui_session=${session?.value}` },
  });
  const result = await socket.timeout(5_000).emitWithAck('message:send', {
    groupId: campus.id,
    body: 'Tomorrow is a holiday!',
    clientId: `e2e-${Date.now()}`,
  });
  socket.disconnect();

  expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  await expect(
    admin.getByText(/Hira Khan was blocked from posting in "CUI Islamabad Official"/),
  ).toBeVisible();
  await expect(hira.getByText('Tomorrow is a holiday!')).toHaveCount(0);
});
