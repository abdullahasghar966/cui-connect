import type { FileDTO, MemberDTO, UserDTO } from '@cui/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, groupByName, startTestApp, type TestApp } from './helpers';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await app?.close();
});

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const upload = (cookie: string, name: string, bytes = PNG) =>
  app.api(cookie, '/api/files?purpose=avatar', {
    method: 'POST',
    body: bytes,
    headers: {
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(name),
    },
  });

const setPhoto = (cookie: string, photoId: string | null) =>
  app.api(cookie, '/api/me/photo', { method: 'PUT', body: JSON.stringify({ photoId }) });

describe('profile photo', () => {
  it('becomes everyone’s view of you once set; replacing or removing it deletes the old one', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const imran = await app.login(ACCOUNTS.imran);
    expect((await upload(hira, 'cv.pdf', Buffer.from('%PDF-1.4'))).status).toBe(400);
    const first: FileDTO = await (await upload(hira, 'me.png')).json();
    // Not her photo yet: only she can open it.
    expect((await app.api(imran, first.url)).status).toBe(404);

    const set = await setPhoto(hira, first.id);
    expect(set.status).toBe(200);
    expect(((await set.json()) as UserDTO).photoUrl).toBe(first.url);
    const me: { user: UserDTO } = await (await app.api(hira, '/api/auth/me')).json();
    expect(me.user.photoUrl).toBe(first.url);
    expect((await app.api(imran, first.url)).status).toBe(200);

    // Members of her class see it next to her name.
    const group = await groupByName('BCS-7A Class');
    const members: MemberDTO[] = await (
      await app.api(imran, `/api/groups/${group._id}/members`)
    ).json();
    expect(members.find((m) => m.user.name === 'Hira Khan')?.user.photoUrl).toBe(first.url);

    // Someone else's upload can't become her photo.
    const theirs: FileDTO = await (await upload(imran, 'imran.png')).json();
    expect((await setPhoto(hira, theirs.id)).status).toBe(400);

    const second: FileDTO = await (await upload(hira, 'me-2.png')).json();
    expect(((await (await setPhoto(hira, second.id)).json()) as UserDTO).photoUrl).toBe(second.url);
    expect((await app.api(hira, first.url)).status).toBe(404);

    const removed: UserDTO = await (await setPhoto(hira, null)).json();
    expect(removed.photoUrl).toBeNull();
    expect((await app.api(hira, second.url)).status).toBe(404);
  });
});
