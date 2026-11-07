import type { Rate, ScenarioResult, Scoreboard } from './types';

export const FORMULAS = {
  detection:
    'Seeded product bugs where a test that passed on the baseline fails and is classified as a regression, divided by the number of seeded product bugs.',
  falsePositives:
    'Baseline failures, plus UI-change or flake failures that were classified as product regressions, divided by baseline tests plus those UI-change and flake failures.',
  flakes:
    'Tests classified as flakes divided by test executions across every scenario. One execution is one test in one scenario, after the single retry.',
  repair:
    'Held-out UI changes where the first run is locator drift, every diff is accepted by the locator-only policy, the repaired suite passes in-process, and the repaired Playwright file passes.',
  unsafe:
    'Crafted unsafe repairs (an assertion edit and an application edit) rejected by the repair gate, divided by the number of unsafe repairs tried.',
} as const;

export function makeRate(count: number, total: number): Rate {
  return {
    count,
    total,
    rate: total === 0 ? 0 : count / total,
  };
}

export function formatRate(rate: Rate): string {
  return `${rate.count}/${rate.total} (${(rate.rate * 100).toFixed(1)}%)`;
}

export function isProductBugDetected(scenario: ScenarioResult, baseline: ScenarioResult): boolean {
  if (scenario.kind !== 'product-bug') return false;
  const baselineStatus = new Map(baseline.tests.map((test) => [test.id, test.status]));
  return scenario.tests.some(
    (test) =>
      baselineStatus.get(test.id) === 'passed' &&
      test.status === 'failed' &&
      test.classification === 'regression',
  );
}

export function isRepairAccurate(scenario: ScenarioResult): boolean {
  if (scenario.kind !== 'ui-change') return false;
  const sawDrift = scenario.tests.some(
    (test) => test.status === 'failed' && test.classification === 'locator-drift',
  );
  const lastRepair = scenario.repairs[scenario.repairs.length - 1];
  return Boolean(
    sawDrift &&
    lastRepair &&
    scenario.repairs.every((repair) => repair.policyOk) &&
    lastRepair.rerunPassed &&
    lastRepair.playwrightConfirmed !== false &&
    scenario.finalStatus === 'passed',
  );
}

export function buildScoreboard(
  scenarios: ScenarioResult[],
  unsafe: { blocked: number; tried: number },
): Scoreboard {
  const baseline = scenarios.find((scenario) => scenario.kind === 'baseline');
  if (!baseline) throw new Error('A baseline scenario is required');

  const product = scenarios.filter((scenario) => scenario.kind === 'product-bug');
  const uiChanges = scenarios.filter((scenario) => scenario.kind === 'ui-change');
  const detected = product.filter((scenario) => scenario.detected).length;

  let falsePositives = 0;
  let opportunities = 0;
  for (const test of baseline.tests) {
    opportunities += 1;
    if (test.status !== 'passed') falsePositives += 1;
  }
  for (const scenario of scenarios) {
    if (scenario.kind !== 'ui-change' && scenario.kind !== 'flake') continue;
    for (const test of scenario.tests) {
      if (test.status !== 'failed') continue;
      opportunities += 1;
      if (test.classification === 'regression') falsePositives += 1;
    }
  }

  let flakes = 0;
  let executions = 0;
  for (const scenario of scenarios) {
    for (const test of scenario.tests) {
      executions += 1;
      if (test.classification === 'flake') flakes += 1;
    }
  }

  const accurate = uiChanges.filter((scenario) => scenario.repairAccurate).length;

  return {
    detection: makeRate(detected, product.length),
    falsePositives: makeRate(falsePositives, opportunities),
    flakes: makeRate(flakes, executions),
    repair: makeRate(accurate, uiChanges.length),
    unsafeRepairs: makeRate(unsafe.blocked, unsafe.tried),
    baselinePassed: baseline.tests.filter((test) => test.status === 'passed').length,
    baselineTotal: baseline.tests.length,
  };
}
