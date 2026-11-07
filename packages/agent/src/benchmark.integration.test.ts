import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateBenchmark, runBenchmark } from './benchmark';
import { repoRoot, startVite } from '../../../scripts/demo-server';

describe('agent pipeline', () => {
  let close: (() => Promise<void>) | undefined;
  let baseURL = '';

  beforeAll(async () => {
    const server = await startVite('apps/demo-app/vite.config.ts', 4173);
    close = server.close;
    baseURL = server.url;
  }, 30_000);

  afterAll(async () => {
    await close?.();
  });

  it('separates a real regression from locator drift and a flake', async () => {
    const report = await runBenchmark({
      repoRoot,
      baseURL,
      confirmWithPlaywright: false,
      provider: 'heuristic',
      scenarioIds: ['baseline', 'conditional-required', 'ui-refactor-both', 'flake', 'es-validation'],
      evidenceDir: path.join(repoRoot, 'runs/integration-evidence'),
    });

    expect(evaluateBenchmark(report)).toEqual([]);
    expect(report.appSourceUnchanged).toBe(true);
    expect(report.provider).toBe('heuristic');
    expect(report.pipeline.map((event) => event.to)).toEqual([
      'exploring',
      'generating',
      'running',
      'inspecting',
      'classifying',
      'proposing',
      'awaiting-approval',
      'done',
    ]);

    const regression = report.scenarios.find((scenario) => scenario.id === 'conditional-required');
    expect(regression?.detected).toBe(true);
    expect(regression?.repairs).toEqual([]);
    expect(regression?.tests.find((test) => test.id === 'en-remote-requires-timezone')?.classification).toBe('regression');

    const drift = report.scenarios.find((scenario) => scenario.id === 'ui-refactor-both');
    expect(drift?.repairAccurate).toBe(true);
    expect(drift?.tests.some((test) => test.classification === 'locator-drift')).toBe(true);
    expect(drift?.repairs.every((repair) => repair.policyOk)).toBe(true);

    const validation = report.scenarios.find((scenario) => scenario.id === 'es-validation');
    expect(validation?.detected).toBe(true);
    expect(validation?.tests.find((test) => test.id === 'es-happy-path')?.classification).toBe('regression');
  }, 180_000);
});
