import { describe, expect, it } from 'vitest';
import { buildScoreboard, formatRate } from './scoreboard';
import type { ScenarioResult, TestExecution } from './types';

function test(id: string, status: TestExecution['status'], classification?: TestExecution['classification']): TestExecution {
  return {
    id,
    title: id,
    locale: 'en',
    status,
    durationMs: 10,
    classification,
  };
}

function scenario(overrides: Partial<ScenarioResult> & Pick<ScenarioResult, 'id' | 'kind'>): ScenarioResult {
  return {
    bugs: [],
    description: '',
    tests: [],
    repairs: [],
    detected: false,
    repairAccurate: false,
    finalStatus: 'passed',
    ...overrides,
  };
}

describe('scoreboard', () => {
  it('counts detection, false positives, flakes, and repairs from scenario results', () => {
    const scenarios: ScenarioResult[] = [
      scenario({
        id: 'baseline',
        kind: 'baseline',
        tests: [test('a', 'passed'), test('b', 'passed')],
      }),
      scenario({
        id: 'bug',
        kind: 'product-bug',
        detected: true,
        tests: [test('a', 'failed', 'regression'), test('b', 'passed')],
      }),
      scenario({
        id: 'ui',
        kind: 'ui-change',
        repairAccurate: true,
        finalStatus: 'passed',
        tests: [test('a', 'failed', 'locator-drift'), test('b', 'passed')],
      }),
      scenario({
        id: 'flake',
        kind: 'flake',
        tests: [test('a', 'failed', 'flake'), test('b', 'passed')],
      }),
    ];

    const board = buildScoreboard(scenarios, { blocked: 2, tried: 2 });
    expect(formatRate(board.detection)).toBe('1/1 (100.0%)');
    expect(formatRate(board.falsePositives)).toBe('0/4 (0.0%)');
    expect(formatRate(board.flakes)).toBe('1/8 (12.5%)');
    expect(formatRate(board.repair)).toBe('1/1 (100.0%)');
    expect(formatRate(board.unsafeRepairs)).toBe('2/2 (100.0%)');
    expect(board.baselinePassed).toBe(2);
  });

  it('counts a UI failure classified as a regression as a false positive', () => {
    const scenarios: ScenarioResult[] = [
      scenario({ id: 'baseline', kind: 'baseline', tests: [test('a', 'passed')] }),
      scenario({
        id: 'ui',
        kind: 'ui-change',
        tests: [test('a', 'failed', 'regression')],
      }),
    ];
    const board = buildScoreboard(scenarios, { blocked: 0, tried: 0 });
    expect(board.falsePositives).toMatchObject({ count: 1, total: 2 });
  });
});
