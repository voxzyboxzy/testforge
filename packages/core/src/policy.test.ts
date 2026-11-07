import { describe, expect, it } from 'vitest';
import { maskLocators, reviewRepair } from './policy';

const before = `import { test, expect } from '@playwright/test';

test('submits', async ({ page }) => {
  const locale = 'en' as const;
  await page.getByLabel('Full name').fill('Jordan Lee');
  await page.getByTestId('submit-application').click();
  await expect(page.getByTestId('confirmation-banner')).toContainText('Application received');
  await expect.poll(async () => submissionCount(page)).toBe(1);
});
`;

const repaired = `import { test, expect } from '@playwright/test';

test('submits', async ({ page }) => {
  const locale = 'en' as const;
  await page.getByLabel('Full name').fill('Jordan Lee');
  await page.getByRole('button', { name: locale === 'es' ? 'Enviar solicitud' : 'Submit application', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Application received');
  await expect.poll(async () => submissionCount(page)).toBe(1);
});
`;

describe('repair policy', () => {
  it('masks only locator calls', () => {
    expect(maskLocators(before)).toBe(maskLocators(repaired));
    expect(maskLocators(before)).toContain("toContainText('Application received')");
    expect(maskLocators(before)).toContain('.toBe(1)');
  });

  it('accepts a locator-only repair', () => {
    expect(reviewRepair({ file: 'generated/northline.spec.ts', before, after: repaired }).ok).toBe(true);
  });

  it('rejects a weaker expected outcome', () => {
    const after = before.replace("toContainText('Application received')", "toContainText('Saving')");
    const verdict = reviewRepair({ file: 'generated/northline.spec.ts', before, after });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/locators/);
  });

  it('rejects a changed submission count', () => {
    const after = before.replace('.toBe(1)', '.toBe(2)');
    expect(reviewRepair({ file: 'generated/northline.spec.ts', before, after }).ok).toBe(false);
  });

  it('rejects a removed assertion', () => {
    const after = before.replace("  await expect(page.getByTestId('confirmation-banner')).toContainText('Application received');\n", '');
    expect(reviewRepair({ file: 'generated/northline.spec.ts', before, after }).ok).toBe(false);
  });

  it('rejects skipped tests', () => {
    const after = before.replace("test('submits'", "test.skip('submits'");
    const verdict = reviewRepair({ file: 'generated/northline.spec.ts', before, after });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/test.skip/);
  });

  it('rejects edits outside the generated spec', () => {
    const verdict = reviewRepair({
      file: 'apps/demo-app/src/App.tsx',
      before: 'export const x = 1;\n',
      after: 'export const x = 2;\n',
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/generated\/northline.spec.ts/);
  });

  it('rejects a timeout stuffed into the action to hide a failure', () => {
    const after = before.replace('.click();', '.click({ timeout: 120000 });');
    expect(reviewRepair({ file: 'generated/northline.spec.ts', before, after }).ok).toBe(false);
  });
});
