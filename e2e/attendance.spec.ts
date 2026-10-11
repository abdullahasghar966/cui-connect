import { expect, PEOPLE, test } from './fixtures';

test('a student checks in with the QR code and the teacher sees it live', async ({ person }) => {
  const imran = await person(PEOPLE.imran);
  const hira = await person(PEOPLE.hira);

  await imran.goto('/academics/attendance');
  const awt = imran.getByRole('list', { name: 'Your courses' }).locator(':scope > li', {
    hasText: 'Advanced Web Technologies · BCS-7A',
  });
  await awt
    .getByRole('button', { name: /Take attendance/ })
    .first()
    .click();
  await expect(imran).toHaveURL(/\/academics\/attendance\/session\//);
  await expect(imran.getByText('0 / 6 checked in')).toBeVisible();

  // What a phone camera would open after scanning the code on the screen.
  const qr = imran.getByTestId('attendance-qr');
  await expect(qr).toHaveAttribute('data-checkin-path', /^\/attend\/.+\?t=.+/);
  const path = (await qr.getAttribute('data-checkin-path')) ?? '';
  await hira.goto(path);
  await expect(hira.getByRole('heading', { name: 'You are checked in' })).toBeVisible();

  // The teacher's roster updates without a refresh.
  await expect(imran.getByText('1 / 6 checked in')).toBeVisible();
  await expect(imran.getByRole('button', { name: 'Present: Hira Khan' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Roll call by hand, then close: everyone else becomes absent.
  await imran.getByRole('button', { name: 'Late: Ali Raza' }).click();
  await expect(imran.getByRole('button', { name: 'Late: Ali Raza' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await imran.getByRole('button', { name: 'Close attendance' }).click();
  await imran.getByRole('dialog').getByRole('button', { name: 'Close attendance' }).click();
  await expect(imran.getByText('Closed', { exact: true })).toBeVisible();
  await expect(imran.getByRole('button', { name: 'Absent: Ahmed Nawaz' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // A code from a closed session no longer works.
  await hira.goto(path);
  await expect(hira.getByRole('heading', { name: 'Not checked in' })).toBeVisible();
  await expect(hira.getByText(/closed/)).toBeVisible();
});

test('a student sees attendance per course with a warning near the minimum', async ({ person }) => {
  const hira = await person(PEOPLE.hira);
  await hira.goto('/academics/attendance');
  await expect(hira.getByRole('heading', { name: 'My attendance' })).toBeVisible();
  const cloud = hira.getByRole('region', { name: 'CSC455 Cloud Computing' });
  await expect(cloud.getByText('Close to the minimum')).toBeVisible();
  // How much room is left depends on how many classes have happened by the test date.
  await expect(cloud.getByText(/You can miss \d+ more class|Missing one more class/)).toBeVisible();
});
