import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { Evidence } from '../../core/src/types';
import type { AcceptanceCase, LocatorPlan } from './criteria';
import { caseUrl, confirmationExpr, confirmationLocator, submitExpr, submitLocator } from './locators';

export interface RunOptions {
  baseURL: string;
  bugs: string[];
  attempt: number | null;
  names: { en: string; es: string };
}

export interface CaseRun {
  id: string;
  title: string;
  locale: 'en' | 'es';
  status: 'passed' | 'failed';
  durationMs: number;
  retryStatus?: 'passed' | 'failed';
  evidence?: Evidence;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0] : String(error);
}

async function stableCount(page: Page, baseURL: string): Promise<number> {
  let previous = -1;
  let stableSince = Date.now();
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    const count = await readCount(page, baseURL);
    const now = Date.now();
    if (count === previous && now - stableSince >= 200) return count;
    if (count !== previous) {
      previous = count;
      stableSince = now;
    }
    await page.waitForTimeout(40);
  }
  return previous;
}

async function readCount(page: Page, baseURL: string): Promise<number> {
  const response = await page.request.get(new URL('/api/submissions', baseURL).toString());
  const body = (await response.json()) as unknown[];
  return body.length;
}

async function snapshot(page: Page, baseURL: string): Promise<Pick<Evidence, 'alerts' | 'statusText' | 'domExcerpt' | 'submissionCount'>> {
  const alerts = (await page.getByRole('alert').count()) > 0 ? await page.getByRole('alert').allInnerTexts() : [];
  const status = page.getByRole('status');
  const statusText = (await status.count()) > 0 ? await status.first().innerText() : null;
  const domExcerpt = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, label, input, select, textarea, [role="status"], [role="alert"], img'))
      .slice(0, 24)
      .map((element) => {
        const testId = element.getAttribute('data-testid');
        const name = (element.getAttribute('aria-label') || element.textContent || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 90);
        return `<${element.tagName.toLowerCase()}${testId ? ` data-testid="${testId}"` : ''}>${name}`;
      }),
  );
  let submissionCount: number | null = null;
  try {
    submissionCount = await readCount(page, baseURL);
  } catch {
    submissionCount = null;
  }
  return { alerts, statusText, domExcerpt, submissionCount };
}

async function buttonStandIn(page: Page, names: { en: string; es: string }): Promise<Evidence['standIns']> {
  const english = page.getByRole('button', { name: names.en, exact: true });
  const spanish = page.getByRole('button', { name: names.es, exact: true });
  const englishCount = await english.count();
  const spanishCount = await spanish.count();
  if (englishCount !== 1 && spanishCount !== 1) return [];
  const visible = englishCount === 1 ? english : spanish;
  const testId = await visible.getAttribute('data-testid');
  return [
    {
      expr: submitExpr({ type: 'role-locale', role: 'button', en: names.en, es: names.es }),
      reason: `The submit button is still exposed with an unchanged accessible name (data-testid=${testId ?? 'none'}).`,
    },
  ];
}

async function failure(
  page: Page,
  baseURL: string,
  trace: string[],
  partial: Omit<Evidence, 'alerts' | 'statusText' | 'domExcerpt' | 'submissionCount' | 'trace' | 'passedOnRetry'> & {
    passedOnRetry?: boolean;
  },
): Promise<Evidence> {
  let shot: Pick<Evidence, 'alerts' | 'statusText' | 'domExcerpt' | 'submissionCount'>;
  try {
    shot = await snapshot(page, baseURL);
  } catch {
    shot = { alerts: [], statusText: null, domExcerpt: [], submissionCount: null };
  }
  return {
    passedOnRetry: partial.passedOnRetry ?? false,
    ...partial,
    ...shot,
    trace,
  };
}

export async function resetSubmissions(page: Page, baseURL: string): Promise<void> {
  const response = await page.request.delete(new URL('/api/submissions', baseURL).toString());
  if (!response.ok()) throw new Error(`Could not reset submissions (${response.status()})`);
}

export async function runCase(page: Page, testCase: AcceptanceCase, plan: LocatorPlan, options: RunOptions): Promise<CaseRun> {
  const started = Date.now();
  const trace: string[] = [];
  const done = (status: 'passed' | 'failed', evidence?: Evidence): CaseRun => ({
    id: testCase.id,
    title: testCase.title,
    locale: testCase.locale,
    status,
    durationMs: Date.now() - started,
    evidence,
  });

  try {
    await resetSubmissions(page, options.baseURL);
    const url = caseUrl(options.baseURL, testCase.locale, options.bugs, options.attempt);
    trace.push(`goto ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 5000 });

    for (const step of testCase.steps) {
      if (step.kind === 'fill') {
        trace.push(`fill ${step.label}`);
        await page.getByLabel(step.label, { exact: true }).fill(step.value, { timeout: 4000 });
      } else if (step.kind === 'select') {
        trace.push(`select ${step.label}=${step.value}`);
        await page.getByLabel(step.label, { exact: true }).selectOption(step.value, { timeout: 4000 });
      } else if (step.kind === 'check') {
        trace.push(`check ${step.name}`);
        await page.getByRole('radio', { name: step.name, exact: true }).check({ timeout: 4000 });
      } else if (step.kind === 'axe') {
        trace.push('axe');
        const results = await new AxeBuilder({ page }).analyze();
        const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
        if (serious.length > 0) {
          return done(
            'failed',
            await failure(page, options.baseURL, [...trace, 'axe violations'], {
              target: 'axe',
              locatorStrategy: 'none',
              locatorExpr: 'axe',
              message: `axe-core found ${serious.length} serious or critical violation(s): ${serious.map((violation) => violation.id).join(', ')}`,
              assertionReached: true,
              standIns: [],
            }),
          );
        }
      } else if (step.kind === 'click') {
        const locator = submitLocator(page, plan.submit, testCase.locale);
        const expr = submitExpr(plan.submit);
        trace.push(`click ${expr} x${step.count}`);
        try {
          for (let count = 0; count < step.count; count += 1) {
            await locator.click({ timeout: 4000 });
          }
        } catch (error) {
          const standIns = plan.submit.type === 'testid' ? await buttonStandIn(page, options.names) : [];
          return done(
            'failed',
            await failure(page, options.baseURL, [...trace, errorMessage(error)], {
              target: 'submit',
              locatorStrategy: plan.submit.type === 'testid' ? 'testid' : 'role',
              locatorExpr: expr,
              message: errorMessage(error),
              assertionReached: false,
              standIns,
            }),
          );
        }
      }
    }

    if (testCase.expect.alert) {
      const alert = page.getByRole('alert');
      const visible = await alert
        .waitFor({ state: 'visible', timeout: 2500 })
        .then(() => true)
        .catch(() => false);
      const text = visible ? await alert.innerText() : '';
      if (!visible || !text.includes(testCase.expect.alert)) {
        return done(
          'failed',
          await failure(page, options.baseURL, [...trace, 'alert assertion'], {
            target: 'alert',
            locatorStrategy: 'role',
            locatorExpr: "page.getByRole('alert')",
            message: visible ? `Alert text was "${text.trim()}"` : 'Expected an alert and none was visible',
            expectedText: testCase.expect.alert,
            expectedSubmissions: testCase.expect.submissions,
            assertionReached: true,
            standIns: [],
          }),
        );
      }
    }

    if (testCase.expect.confirmation) {
      const locator = confirmationLocator(page, plan.confirmation);
      const expr = confirmationExpr(plan.confirmation);
      const appeared = await locator
        .waitFor({ state: 'visible', timeout: 2500 })
        .then(() => true)
        .catch(() => false);
      const text = appeared ? await locator.innerText() : '';
      if (!appeared || !text.includes(testCase.expect.confirmation)) {
        const status = page.getByRole('status');
        const statusTextNow = (await status.count()) === 1 ? await status.innerText() : '';
        const textPresent = statusTextNow.includes(testCase.expect.confirmation);
        const standIns =
          plan.confirmation.type === 'testid' && textPresent
            ? [
                {
                  expr: "page.getByRole('status')",
                  reason: `The page contains "${testCase.expect.confirmation}" in a status element, while ${expr} does not resolve.`,
                },
              ]
            : [];
        return done(
          'failed',
          await failure(page, options.baseURL, [...trace, 'confirmation assertion'], {
            target: 'confirmation',
            locatorStrategy: plan.confirmation.type === 'testid' ? 'testid' : 'role',
            locatorExpr: expr,
            message: appeared ? `Confirmation text was "${text.trim()}"` : `${expr} was not visible`,
            expectedText: testCase.expect.confirmation,
            expectedSubmissions: testCase.expect.submissions,
            assertionReached: !textPresent,
            standIns,
          }),
        );
      }
    }

    if (testCase.expect.noConfirmation) {
      const locator = confirmationLocator(page, plan.confirmation);
      const count = await locator.count();
      if (count !== 0) {
        return done(
          'failed',
          await failure(page, options.baseURL, [...trace, 'unexpected confirmation'], {
            target: 'confirmation',
            locatorStrategy: plan.confirmation.type === 'testid' ? 'testid' : 'role',
            locatorExpr: confirmationExpr(plan.confirmation),
            message: `Expected no confirmation element and found ${count}`,
            assertionReached: true,
            standIns: [],
          }),
        );
      }
    }

    if (testCase.expect.submissions != null) {
      const expected = testCase.expect.submissions;
      const count = await stableCount(page, options.baseURL);
      if (count !== expected) {
        return done(
          'failed',
          await failure(page, options.baseURL, [...trace, `submissions ${count}`], {
            target: 'count',
            locatorStrategy: 'none',
            locatorExpr: 'submissionCount(page)',
            message: `Submission count was ${count}`,
            expectedSubmissions: expected,
            assertionReached: true,
            standIns: [],
          }),
        );
      }
    }

    return done('passed');
  } catch (error) {
    return done(
      'failed',
      await failure(page, options.baseURL, [...trace, errorMessage(error)], {
        target: 'other',
        locatorStrategy: 'label',
        locatorExpr: trace[trace.length - 1] ?? 'setup',
        message: errorMessage(error),
        assertionReached: false,
        standIns: [],
      }),
    );
  }
}
