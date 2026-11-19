import { expect, test } from '@playwright/test';

test('report a problem builds a prefilled email and GitHub issue', async ({ page }) => {
  await page.goto('/feedback?type=bug&tool=merge-videos&error=Export%20failed');
  await expect(page.getByRole('heading', { name: 'Report a problem' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'vishnubhotla.siddhanth@gmail.com' })).toBeVisible();
  await expect(page.getByLabel('Where?')).toHaveValue('merge-videos');
  await expect(page.getByLabel('What happened?')).toHaveValue(/Export failed/);

  await page.getByLabel('Steps to reproduce (optional)').fill('1. Add two files\n2. Press Merge');
  const mail = await page.getByRole('link', { name: 'Send by email' }).getAttribute('href');
  expect(mail).toMatch(/^mailto:vishnubhotla\.siddhanth@gmail\.com\?subject=/);
  const decoded = decodeURIComponent(mail!);
  expect(decoded).toContain('[Veyra Bug] Merge videos: I got this error: Export failed');
  expect(decoded).toContain('Steps to reproduce:');
  expect(decoded).toContain('Browser:');

  await page.getByRole('checkbox', { name: /Include browser details/ }).uncheck();
  expect(decodeURIComponent((await page.getByRole('link', { name: 'Send by email' }).getAttribute('href'))!)).not.toContain('Browser:');

  const issue = await page.getByRole('link', { name: 'Open a GitHub issue' }).getAttribute('href');
  expect(issue).toMatch(/^https:\/\/github\.com\/vnsiddhanth\/veyra\/issues\/new\?title=/);
});

test('an idea needs a description before it can be sent', async ({ page }) => {
  await page.goto('/feedback');
  await page.getByRole('radio', { name: /Idea/ }).check();
  await expect(page.getByRole('link', { name: 'Send by email' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByLabel('What would you like?').fill('Music for slideshows');
  await expect(page.getByRole('link', { name: 'Send by email' })).toHaveAttribute('aria-disabled', 'false');
});

test('tool errors link to a prefilled report', async ({ page }) => {
  await page.goto('/tools/compress-video');
  await page.getByRole('button', { name: 'Choose file' }).first().waitFor();
  await page.locator('main input[type=file]').first().setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video') });
  const report = page.getByRole('alert').getByRole('link', { name: 'Report this problem' });
  await expect(report).toBeVisible({ timeout: 20_000 });
  await report.click();
  await expect(page).toHaveURL(/\/feedback\?type=bug&tool=compress-video&error=/);
  await expect(page.getByLabel('What happened?')).toHaveValue(/I got this error:/);
});
