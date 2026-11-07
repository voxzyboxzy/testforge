import { formatRate } from './scoreboard';
import type { Report } from './types';

function classifications(reportScenario: Report['scenarios'][number]): string {
  const kinds = [...new Set(reportScenario.tests.map((test) => test.classification).filter(Boolean))];
  return kinds.length > 0 ? kinds.join(', ') : '—';
}

/** Tables embedded in the README. Generated from a benchmark report so the numbers cannot be hand-edited unnoticed. */
export function renderBenchmarkMarkdown(report: Report): string {
  const { scoreboard } = report;
  const lines = [
    '| Metric | Result |',
    '| --- | --- |',
    `| Detection rate | ${formatRate(scoreboard.detection)} |`,
    `| False positive rate | ${formatRate(scoreboard.falsePositives)} |`,
    `| Flake rate | ${formatRate(scoreboard.flakes)} |`,
    `| Repair accuracy | ${formatRate(scoreboard.repair)} |`,
    `| Unsafe repairs blocked | ${formatRate(scoreboard.unsafeRepairs)} |`,
    `| Baseline | ${scoreboard.baselinePassed}/${scoreboard.baselineTotal} passed |`,
    '',
    '| Scenario | Kind | Passed | Failed | Classifications | Detected |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const scenario of report.scenarios) {
    const passed = scenario.tests.filter((test) => test.status === 'passed').length;
    const failed = scenario.tests.length - passed;
    const detected = scenario.kind === 'product-bug' ? (scenario.detected ? 'yes' : 'no') : '—';
    lines.push(
      `| ${scenario.id} | ${scenario.kind} | ${passed} | ${failed} | ${classifications(scenario)} | ${detected} |`,
    );
  }

  return lines.join('\n');
}
