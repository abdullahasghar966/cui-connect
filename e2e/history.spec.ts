import { io } from 'socket.io-client';
import { expect, openConversation, PEOPLE, signIn, test } from './fixtures';

test('scrolling up loads older messages page by page', async ({ person, page, baseURL }) => {
  // Ali posts more than one page (40) of messages into the class group.
  const ali = await person('FA23-BCS-001');
  const session = (await ali.context().cookies()).find((c) => c.name === 'cui_session');
  const groups = await (await ali.request.get('/api/groups')).json();
  const classGroup = groups.find((g: { name: string }) => g.name === 'BCS-7A Class');
  const socket = io(baseURL, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { cookie: `cui_session=${session?.value}` },
  });
  for (let i = 1; i <= 60; i++) {
    const res = await socket.timeout(5_000).emitWithAck('message:send', {
      groupId: classGroup.id,
      body: `Revision question ${i}`,
      clientId: `history-${Date.now()}-${i}`,
    });
    expect(res.ok).toBe(true);
  }
  socket.disconnect();

  await signIn(page, PEOPLE.hira);
  await openConversation(page, 'BCS-7A Class');
  const list = page.locator('main [aria-relevant="additions"]');
  const bubbles = list.locator('.group\\/message');
  await expect(list.getByText('Revision question 60')).toBeVisible();
  await expect(bubbles).toHaveCount(40);
  await expect(list.getByText('This is the beginning of BCS-7A Class.')).toHaveCount(0);

  await list.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(list.getByText('This is the beginning of BCS-7A Class.')).toBeVisible();
  expect(await bubbles.count()).toBeGreaterThan(60);
  await expect(list.getByText('Revision question 1', { exact: true })).toBeVisible();
});
