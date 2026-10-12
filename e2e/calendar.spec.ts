import { expect, PEOPLE, test } from './fixtures';

const DIRECTOR = 'director.office@comsats.edu.pk';
const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

test("the Director's Office adds a holiday; students are told and see it", async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  await hira.goto('/academics/calendar');
  await expect(hira.getByRole('tab', { name: 'My calendar' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const director = await person(DIRECTOR);
  await director.goto('/academics/calendar');
  await expect(director.getByRole('region', { name: /November 2026/ })).toContainText('Iqbal Day');
  await director.getByRole('button', { name: 'Add a date' }).click();
  const dialog = director.getByRole('dialog');
  await dialog.getByLabel('Title').fill('Sports gala');
  await dialog.getByLabel('Kind').selectOption('holiday');
  await dialog.getByLabel('From').fill(today());
  await dialog.getByLabel('To').fill(today());
  await dialog.getByRole('button', { name: 'Save' }).click();

  // Everyone hears about it, and today's entry on Hira's calendar shows it.
  await expect(hira.getByText('Holiday: Sports gala')).toBeVisible();
  await expect(hira.getByRole('list', { name: /^On / })).toContainText('Sports gala');

  await director.getByRole('button', { name: 'Options for Sports gala' }).click();
  await director.getByRole('menuitem', { name: 'Remove' }).click();
  // (The "Sports gala added" toast may still be showing, so look for the entry itself.)
  await expect(director.getByRole('button', { name: 'Options for Sports gala' })).toHaveCount(0);
});
