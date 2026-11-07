import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { ExplorationSummary } from '../../core/src/types';
import type { AcceptanceCase, LocatorPlan } from './criteria';
import { resetSubmissions } from './execute';

interface ControlRecord {
  locale: 'en' | 'es';
  tag: string;
  testId: string | null;
  name: string;
}

async function collect(page: Page, locale: 'en' | 'es'): Promise<ControlRecord[]> {
  const found = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a, input, select, textarea, img')).map((element) => ({
      tag: element.tagName.toLowerCase(),
      testId: element.getAttribute('data-testid'),
      name: (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    })),
  );
  return found.map((item) => ({ ...item, locale }));
}

async function seriousAxe(page: Page): Promise<number> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical').length;
}

export async function explore(page: Page, baseURL: string, cases: AcceptanceCase[]): Promise<ExplorationSummary> {
  const controls: ControlRecord[] = [];
  const axeSerious = { en: 0, es: 0 };

  for (const locale of ['en', 'es'] as const) {
    await page.goto(`${baseURL}/?lang=${locale}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1 }).waitFor();
    controls.push(...(await collect(page, locale)));
    axeSerious[locale] = await seriousAxe(page);
  }

  if (axeSerious.en > 0 || axeSerious.es > 0) {
    throw new Error(`Baseline accessibility check failed (en=${axeSerious.en}, es=${axeSerious.es})`);
  }

  const names: { en?: string; es?: string } = {};
  let submitTestId = '';
  let confirmationTestId = '';

  for (const id of ['en-happy-path', 'es-happy-path'] as const) {
    const testCase = cases.find((item) => item.id === id);
    if (!testCase) throw new Error(`Exploration requires ${id}`);
    await resetSubmissions(page, baseURL);
    await page.goto(`${baseURL}/?lang=${testCase.locale}`, { waitUntil: 'domcontentloaded' });
    for (const step of testCase.steps) {
      if (step.kind === 'fill') await page.getByLabel(step.label, { exact: true }).fill(step.value);
      else if (step.kind === 'select') await page.getByLabel(step.label, { exact: true }).selectOption(step.value);
      else if (step.kind === 'check') await page.getByRole('radio', { name: step.name, exact: true }).check();
      else if (step.kind === 'click') {
        const button = page.getByRole('button', { name: step.name, exact: true });
        const testId = await button.getAttribute('data-testid');
        if (!testId) throw new Error(`Submit button in ${testCase.locale} has no data-testid`);
        if (!submitTestId) submitTestId = testId;
        else if (submitTestId !== testId) throw new Error('Submit test id differs between locales on the baseline');
        names[testCase.locale] = step.name;
        await button.click();
        const status = page.getByRole('status');
        await status.waitFor({ timeout: 5000 });
        const confirmationId = await status.getAttribute('data-testid');
        if (!confirmationId) throw new Error('Confirmation status has no data-testid');
        if (!confirmationTestId) confirmationTestId = confirmationId;
        else if (confirmationTestId !== confirmationId) throw new Error('Confirmation test id differs between locales');
        const text = await status.innerText();
        if (testCase.expect.confirmation && !text.includes(testCase.expect.confirmation)) {
          throw new Error(`Baseline ${id} confirmation text was "${text}"`);
        }
      }
    }
  }

  if (!names.en || !names.es) throw new Error('Exploration did not observe both submit labels');

  const unique = new Set(controls.map((control) => `${control.locale}|${control.tag}|${control.testId ?? control.name}`));
  return {
    controls: unique.size,
    locales: ['en', 'es'],
    submitTestId,
    confirmationTestId,
    submitNames: { en: names.en, es: names.es },
    axeSerious,
  };
}

export function planFromExploration(exploration: ExplorationSummary): LocatorPlan {
  return {
    submit: { type: 'testid', id: exploration.submitTestId },
    confirmation: { type: 'testid', id: exploration.confirmationTestId },
  };
}
