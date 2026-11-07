import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitRepair, proposePlan } from './repair';

describe('repair gate', () => {
  it('refuses to write an assertion change or an application file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'testforge-'));
    mkdirSync(path.join(root, 'generated'), { recursive: true });
    mkdirSync(path.join(root, 'apps/demo-app/src'), { recursive: true });
    const spec = path.join(root, 'generated/northline.spec.ts');
    const app = path.join(root, 'apps/demo-app/src/App.tsx');
    writeFileSync(spec, 'expect(page.getByTestId("confirmation-banner")).toContainText("Application received");\n');
    writeFileSync(app, 'export const intact = true;\n');

    expect(() =>
      commitRepair(root, {
        file: 'generated/northline.spec.ts',
        before: readFileSync(spec, 'utf8'),
        after: 'expect(page.getByTestId("confirmation-banner")).toContainText("Anything");\n',
      }),
    ).toThrow(/locators/);
    expect(() =>
      commitRepair(root, {
        file: 'apps/demo-app/src/App.tsx',
        before: 'export const intact = true;\n',
        after: 'export const intact = false;\n',
      }),
    ).toThrow(/generated\/northline.spec.ts/);

    expect(readFileSync(spec, 'utf8')).toContain('Application received');
    expect(readFileSync(app, 'utf8')).toContain('intact = true');
  });

  it('writes a locator-only repair into the generated spec', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'testforge-'));
    const before = "await page.getByTestId('submit-application').click();\n";
    const after = "await page.getByRole('button', { name: 'Submit application', exact: true }).click();\n";
    commitRepair(root, { file: 'generated/northline.spec.ts', before, after });
    expect(readFileSync(path.join(root, 'generated/northline.spec.ts'), 'utf8')).toBe(after);
  });

  it('proposes a role locator only for drifted test ids', () => {
    const next = proposePlan(
      { submit: { type: 'testid', id: 'submit-application' }, confirmation: { type: 'testid', id: 'confirmation-banner' } },
      [
        {
          id: 'en-happy-path',
          title: 'submit',
          locale: 'en',
          status: 'failed',
          durationMs: 1,
          classification: 'locator-drift',
          evidence: {
            target: 'submit',
            locatorStrategy: 'testid',
            locatorExpr: "page.getByTestId('submit-application')",
            message: 'missing',
            passedOnRetry: false,
            assertionReached: false,
            statusText: null,
            alerts: [],
            submissionCount: 0,
            standIns: [{ expr: 'page.getByRole("button")', reason: 'name unchanged' }],
            domExcerpt: [],
            trace: [],
          },
        },
      ],
      { en: 'Submit application', es: 'Enviar solicitud' },
    );
    expect(next?.submit).toMatchObject({ type: 'role-locale', en: 'Submit application', es: 'Enviar solicitud' });
  });
});
