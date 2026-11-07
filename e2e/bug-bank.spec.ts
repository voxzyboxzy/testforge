import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
}

async function fillEnglish(page: Page, options: { email?: string; timezone?: boolean } = {}) {
  await page.getByLabel('Full name', { exact: true }).fill('Jordan Lee');
  await page.getByLabel('Email', { exact: true }).fill(options.email ?? 'jordan.lee@northline.dev');
  await page.getByLabel('Phone', { exact: true }).fill('+1 415 555 0148');
  await page.getByLabel('Role', { exact: true }).selectOption('qa');
  await page.getByRole('radio', { name: 'Remote', exact: true }).check();
  if (options.timezone !== false) {
    await page.getByLabel('Timezone', { exact: true }).selectOption('America/Mexico_City');
  }
  await page.getByLabel('Portfolio review', { exact: true }).selectOption('tue-10');
}

async function fillSpanish(page: Page, options: { email?: string; office?: boolean } = {}) {
  await page.getByLabel('Nombre completo', { exact: true }).fill('Sofía Reyes');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(options.email ?? 'sofia.reyes@correo.es');
  await page.getByLabel('Teléfono', { exact: true }).fill('+34 600 000 000');
  await page.getByLabel('Puesto', { exact: true }).selectOption('designer');
  await page.getByRole('radio', { name: 'Presencial', exact: true }).check();
  if (options.office !== false) {
    await page.getByLabel('Oficina', { exact: true }).selectOption('madrid');
  }
  await page.getByLabel('Revisión de portafolio', { exact: true }).selectOption('wed-14');
}

test.beforeEach(async ({ request }) => {
  const response = await request.delete('/api/submissions');
  expect(response.ok()).toBeTruthy();
});

test('english and spanish happy paths store one application', async ({ page, request }) => {
  await page.goto('/?lang=en');
  await fillEnglish(page);
  await page.getByTestId('submit-application').click();
  await expect(page.getByTestId('confirmation-banner')).toContainText('Application received');

  await request.delete('/api/submissions');
  await page.goto('/?lang=es');
  await fillSpanish(page);
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await expect(page.getByTestId('confirmation-banner')).toContainText('Solicitud recibida');
  expect(await (await request.get('/api/submissions')).json()).toHaveLength(1);
});

test('invalid email is rejected in both locales', async ({ page }) => {
  await page.goto('/?lang=en');
  await fillEnglish(page, { email: 'not-an-email' });
  await page.getByTestId('submit-application').click();
  await expect(page.getByRole('alert')).toContainText('Enter a valid email');

  await page.goto('/?lang=es');
  await fillSpanish(page, { email: 'not-an-email' });
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Introduce un correo válido');
});

test('spanish validation bug rejects a valid .es email', async ({ page, request }) => {
  await page.goto('/?lang=es&bugs=es-validation');
  await fillSpanish(page);
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Introduce un correo válido');
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(await (await request.get('/api/submissions')).json()).toHaveLength(0);
});

test('double click stores one application unless the bug is on', async ({ page, request }) => {
  await page.goto('/?lang=en');
  await fillEnglish(page);
  const submit = page.getByTestId('submit-application');
  await submit.click();
  await submit.click();
  await expect.poll(async () => ((await (await request.get('/api/submissions')).json()) as unknown[]).length).toBe(1);

  await request.delete('/api/submissions');
  await page.goto('/?lang=en&bugs=double-submit');
  await fillEnglish(page);
  const buggy = page.getByTestId('submit-application');
  await buggy.click();
  await buggy.click();
  await expect.poll(async () => ((await (await request.get('/api/submissions')).json()) as unknown[]).length).toBe(2);
});

test('remote timezone and on-site office stay required', async ({ page, request }) => {
  await page.goto('/?lang=en');
  await fillEnglish(page, { timezone: false });
  await page.getByTestId('submit-application').click();
  await expect(page.getByRole('alert')).toContainText('Timezone is required');
  expect(await (await request.get('/api/submissions')).json()).toHaveLength(0);

  await page.goto('/?lang=en&bugs=conditional-required');
  await fillEnglish(page, { timezone: false });
  await page.getByTestId('submit-application').click();
  await expect(page.getByTestId('confirmation-banner')).toContainText('Application received');

  await request.delete('/api/submissions');
  await page.goto('/?lang=es');
  await fillSpanish(page, { office: false });
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('La oficina es obligatoria');
});

test('baseline forms have no serious axe violations and the a11y seed does', async ({ page }) => {
  await page.goto('/?lang=en');
  expect(await seriousViolations(page)).toEqual([]);
  await page.goto('/?lang=es');
  expect(await seriousViolations(page)).toEqual([]);
  await page.goto('/?lang=en&bugs=a11y');
  const violations = await seriousViolations(page);
  expect(violations.map((violation) => violation.id)).toEqual(expect.arrayContaining(['image-alt', 'button-name']));
});

test('ui refactor renames test ids without changing accessible names', async ({ page }) => {
  await page.goto('/?lang=en&bugs=ui-refactor-both');
  await expect(page.getByTestId('submit-application')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit application', exact: true })).toHaveAttribute('data-testid', 'send-application');
  await fillEnglish(page);
  await page.getByRole('button', { name: 'Submit application', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Application received');
  await expect(page.getByRole('status')).toHaveAttribute('data-testid', 'receipt-banner');
});

test('flake seed hides confirmation on attempt 1 and shows it on attempt 2', async ({ page, request }) => {
  await page.goto('/?lang=en&bugs=flake&attempt=1');
  await fillEnglish(page);
  await page.getByTestId('submit-application').click();
  await expect(page.getByTestId('saving-note')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);

  await request.delete('/api/submissions');
  await page.goto('/?lang=en&bugs=flake&attempt=2');
  await fillEnglish(page);
  await page.getByTestId('submit-application').click();
  await expect(page.getByTestId('confirmation-banner')).toContainText('Application received');
});

test('language toggle keeps the bug flags and updates the document language', async ({ page }) => {
  await page.goto('/?lang=en&bugs=a11y');
  await page.getByRole('button', { name: 'Español' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByLabel('Correo electrónico')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('bugs')).toBe('a11y');
});
