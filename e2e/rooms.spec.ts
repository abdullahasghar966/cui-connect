import { expect, PEOPLE, test } from './fixtures';

/** Next week's Monday on campus (Pakistan is UTC+5 all year). */
function nextMonday(): string {
  const campus = new Date(Date.now() + 5 * 3600_000);
  const day = campus.getUTCDay() || 7;
  campus.setUTCDate(campus.getUTCDate() + (8 - day));
  return campus.toISOString().slice(0, 10);
}

test('a student finds a free room and sees what is on in a busy one', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  await hira.goto(`/academics/rooms?date=${nextMonday()}&time=09:00`);
  const free = hira.getByRole('region', { name: 'Free rooms' });
  const busy = hira.getByRole('region', { name: 'Rooms in use' });
  await expect(free.getByRole('button').first()).toBeVisible();
  await expect(busy.getByText(/^CSC\d{3}|^[A-Z]{3}\d{3}/).first()).toBeVisible();

  // Expanding a busy room lists its day, with a link to its week.
  await busy.getByRole('button').first().click();
  await expect(busy.getByRole('list', { name: /on Mon / })).toBeVisible();
  await expect(busy.getByRole('link', { name: 'Week view' })).toBeVisible();

  // Asking for three free hours from 9:00 narrows the list.
  const before = await free.getByRole('button').count();
  await hira.getByLabel('Free for at least').selectOption('180');
  await expect(async () => {
    expect(await free.getByRole('button').count()).toBeLessThanOrEqual(before);
  }).toPass();
});
