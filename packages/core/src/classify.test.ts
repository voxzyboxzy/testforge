import { describe, expect, it } from 'vitest';
import { classify } from './classify';
import type { Evidence } from './types';

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    target: 'submit',
    locatorStrategy: 'testid',
    locatorExpr: "page.getByTestId('submit-application')",
    message: 'Timeout 2000ms',
    passedOnRetry: false,
    assertionReached: false,
    statusText: null,
    alerts: [],
    submissionCount: 0,
    standIns: [],
    domExcerpt: [],
    trace: [],
    ...overrides,
  };
}

describe('failure classifier', () => {
  it('classifies a renamed test id with the same accessible name as locator drift', () => {
    const result = classify(
      evidence({
        standIns: [
          {
            expr: "page.getByRole('button', { name: locale === 'es' ? 'Enviar solicitud' : 'Submit application', exact: true })",
            reason: 'The button still exposes the name Submit application (data-testid=send-application).',
          },
        ],
      }),
    );
    expect(result.kind).toBe('locator-drift');
  });

  it('does not treat a broken label as locator drift, even if another query could find the control', () => {
    const result = classify(
      evidence({
        target: 'other',
        locatorStrategy: 'label',
        locatorExpr: "page.getByLabel('Email')",
        message: 'locator resolved to 0 elements',
        standIns: [{ expr: "page.getByPlaceholder('Email')", reason: 'placeholder only' }],
      }),
    );
    expect(result.kind).toBe('regression');
  });

  it('classifies a missing expected outcome as a regression', () => {
    const result = classify(
      evidence({
        target: 'confirmation',
        locatorStrategy: 'testid',
        assertionReached: true,
        expectedText: 'Timezone is required',
        alerts: [],
        statusText: 'Application received · NL-1001',
        submissionCount: 1,
        expectedSubmissions: 0,
        message: 'Expected alert was not shown',
      }),
    );
    expect(result.kind).toBe('regression');
    expect(result.rationale).toMatch(/refused/);
  });

  it('classifies a pass on retry as a flake before any other rule', () => {
    const result = classify(
      evidence({
        passedOnRetry: true,
        assertionReached: true,
        expectedText: 'Application received',
        message: 'confirmation missing',
      }),
    );
    expect(result.kind).toBe('flake');
  });

  it('fails closed when a test id disappears and nothing accessible replaces it', () => {
    const result = classify(evidence());
    expect(result.kind).toBe('regression');
  });
});
