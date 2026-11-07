import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, type Page } from '@playwright/test';
import { classify } from '../../core/src/classify';
import { FORMULAS, buildScoreboard, isProductBugDetected, isRepairAccurate } from '../../core/src/scoreboard';
import { PipelineMachine } from '../../core/src/state-machine';
import type { CaseRun } from './execute';
import { runCase } from './execute';
import { explore, planFromExploration } from './explore';
import { emitSpec } from './emit';
import { createProvider, type LlmProvider } from './llm';
import { GENERATED_SPEC, commitRepair, proposePlan, unifiedDiff } from './repair';
import { loadCriteria, type AcceptanceCase, type LocatorPlan } from './criteria';
import { SCENARIOS, type ScenarioSpec } from './scenarios';
import type { Report, ScenarioResult, TestExecution } from '../../core/src/types';

export interface BenchmarkOptions {
  repoRoot: string;
  baseURL: string;
  scenarioIds?: string[];
  confirmWithPlaywright?: boolean;
  provider?: 'heuristic' | 'ollama';
  evidenceDir?: string;
}

function hashTree(root: string): string {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx?|css|html)$/.test(entry)) files.push(full);
    }
  };
  walk(root);
  files.sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(path.relative(root, file));
    hash.update('\0');
    hash.update(readFileSync(file));
  }
  return hash.digest('hex');
}

function writeSpec(repoRoot: string, source: string): void {
  const full = path.join(repoRoot, GENERATED_SPEC);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, source);
}

async function classifyRuns(runs: CaseRun[], provider: LlmProvider): Promise<TestExecution[]> {
  const executions: TestExecution[] = [];
  for (const run of runs) {
    if (run.status === 'passed' || !run.evidence) {
      executions.push({
        id: run.id,
        title: run.title,
        locale: run.locale,
        status: run.status,
        durationMs: run.durationMs,
        retryStatus: run.retryStatus,
      });
      continue;
    }
    const decision = classify(run.evidence);
    const rationale = await provider.explain({ kind: decision.kind, rationale: decision.rationale });
    executions.push({
      id: run.id,
      title: run.title,
      locale: run.locale,
      status: 'failed',
      durationMs: run.durationMs,
      retryStatus: run.retryStatus,
      classification: decision.kind,
      rationale,
      evidence: run.evidence,
    });
  }
  return executions;
}

async function runScenario(
  page: Page,
  cases: AcceptanceCase[],
  plan: LocatorPlan,
  scenario: ScenarioSpec,
  options: BenchmarkOptions,
  names: { en: string; es: string },
): Promise<CaseRun[]> {
  const runs: CaseRun[] = [];
  let captured = false;
  for (const testCase of cases) {
    const first = await runCase(page, testCase, plan, {
      baseURL: options.baseURL,
      bugs: scenario.bugs,
      attempt: scenario.kind === 'flake' ? 1 : null,
      names,
    });
    if (first.status === 'passed') {
      runs.push(first);
      continue;
    }
    if (!captured && options.evidenceDir && first.evidence) {
      mkdirSync(options.evidenceDir, { recursive: true });
      const filename = `${scenario.id}.png`;
      await page.screenshot({ path: path.join(options.evidenceDir, filename) });
      first.evidence.screenshot = `/evidence/${filename}`;
      captured = true;
    }
    const second = await runCase(page, testCase, plan, {
      baseURL: options.baseURL,
      bugs: scenario.bugs,
      attempt: scenario.kind === 'flake' ? 2 : null,
      names,
    });
    if (first.evidence) first.evidence.passedOnRetry = second.status === 'passed';
    first.retryStatus = second.status;
    runs.push(first);
  }
  return runs;
}

function runPlaywright(repoRoot: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['playwright', 'test', '-c', 'playwright.generated.config.ts'], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) {
        const tail = output.split('\n').slice(-40).join('\n');
        console.error(tail);
      }
      resolve(code ?? 1);
    });
  });
}

function probeUnsafe(repoRoot: string, source: string): { blocked: number; tried: number } {
  const originalPath = path.join(repoRoot, GENERATED_SPEC);
  const original = readFileSync(originalPath, 'utf8');
  const probes = [
    {
      file: GENERATED_SPEC,
      before: source,
      after: source.replaceAll('.toBe(1)', '.toBe(2)'),
    },
    {
      file: 'apps/demo-app/src/App.tsx',
      before: 'const keep = true;\n',
      after: 'const keep = false;\n',
    },
  ];
  let blocked = 0;
  try {
    for (const probe of probes) {
      let wrote = false;
      try {
        commitRepair(repoRoot, probe);
        wrote = true;
      } catch {
        blocked += 1;
      }
      if (wrote) {
        throw new Error(`Unsafe repair was committed for ${probe.file}`);
      }
    }
  } finally {
    writeFileSync(originalPath, original);
  }
  return { blocked, tried: probes.length };
}

export async function runBenchmark(options: BenchmarkOptions): Promise<Report> {
  const provider = createProvider(options.provider);
  const cases = loadCriteria(path.join(options.repoRoot, 'criteria/job-application.yaml'));
  const selected = SCENARIOS.filter((scenario) => !options.scenarioIds || options.scenarioIds.includes(scenario.id));
  if (selected.length === 0) throw new Error('No scenarios selected');
  const appDir = path.join(options.repoRoot, 'apps/demo-app');
  const beforeHash = hashTree(appDir);
  const machine = new PipelineMachine();
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    machine.transition('exploring');
    const exploration = await explore(page, options.baseURL, cases);
    machine.transition('generating');
    const initialPlan = planFromExploration(exploration);
    const originalSource = emitSpec(cases, initialPlan);
    writeSpec(options.repoRoot, originalSource);

    machine.transition('running');
    const rawPasses = new Map<string, CaseRun[]>();
    for (const scenario of selected) {
      rawPasses.set(scenario.id, await runScenario(page, cases, initialPlan, scenario, options, exploration.submitNames));
    }

    machine.transition('inspecting');
    for (const tests of rawPasses.values()) {
      for (const test of tests) {
        if (test.status === 'failed' && !test.evidence) {
          throw new Error(`Failure ${test.id} has no inspection evidence`);
        }
      }
    }

    machine.transition('classifying');
    const firstPasses = new Map<string, TestExecution[]>();
    for (const [id, runs] of rawPasses) {
      const classified = await classifyRuns(runs, provider);
      for (const test of classified) {
        if (test.status === 'failed' && !test.classification) {
          throw new Error(`Failure ${test.id} was not classified`);
        }
      }
      firstPasses.set(id, classified);
    }

    machine.transition('proposing');
    const scenarios: ScenarioResult[] = [];
    for (const spec of selected) {
      const tests = firstPasses.get(spec.id) ?? [];
      if (spec.kind !== 'ui-change') {
        scenarios.push({
          ...spec,
          tests,
          repairs: [],
          detected: false,
          repairAccurate: false,
          finalStatus: tests.every((test) => test.status === 'passed') ? 'passed' : 'failed',
        });
        continue;
      }

      let plan = initialPlan;
      let source = originalSource;
      let observed = tests;
      const repairs: ScenarioResult['repairs'] = [];
      let finalStatus: 'passed' | 'failed' = tests.every((test) => test.status === 'passed') ? 'passed' : 'failed';

      for (let pass = 1; pass <= 3 && finalStatus === 'failed'; pass += 1) {
        const nextPlan = proposePlan(plan, observed, exploration.submitNames);
        if (!nextPlan) break;
        const updated = emitSpec(cases, nextPlan);
        const diff = unifiedDiff(source, updated, GENERATED_SPEC);
        try {
          commitRepair(options.repoRoot, { file: GENERATED_SPEC, before: source, after: updated });
        } catch (error) {
          repairs.push({
            pass,
            file: GENERATED_SPEC,
            diff,
            policyOk: false,
            policyReasons: [error instanceof Error ? error.message : String(error)],
            rerunPassed: false,
            playwrightConfirmed: null,
          });
          break;
        }
        const rerun = await classifyRuns(
          await runScenario(page, cases, nextPlan, spec, { ...options, evidenceDir: undefined }, exploration.submitNames),
          provider,
        );
        const rerunPassed = rerun.every((test) => test.status === 'passed');
        repairs.push({
          pass,
          file: GENERATED_SPEC,
          diff,
          policyOk: true,
          policyReasons: [],
          rerunPassed,
          playwrightConfirmed: null,
        });
        plan = nextPlan;
        source = updated;
        observed = rerun;
        finalStatus = rerunPassed ? 'passed' : 'failed';
      }

      if (finalStatus === 'passed' && options.confirmWithPlaywright !== false && repairs.length > 0) {
        writeSpec(options.repoRoot, source);
        const code = await runPlaywright(options.repoRoot, {
          TESTFORGE_BASE_URL: options.baseURL,
          TESTFORGE_BUGS: spec.bugs.join(','),
          TESTFORGE_NO_WEBSERVER: '1',
          TESTFORGE_GENERATED_DIR: path.join(options.repoRoot, 'generated'),
          CI: '',
        });
        const confirmed = code === 0;
        repairs[repairs.length - 1].playwrightConfirmed = confirmed;
        if (!confirmed) finalStatus = 'failed';
      }

      writeSpec(options.repoRoot, originalSource);
      scenarios.push({
        ...spec,
        tests,
        repairs,
        detected: false,
        repairAccurate: false,
        finalStatus,
      });
    }

    const unsafe = probeUnsafe(options.repoRoot, originalSource);
    machine.transition('awaiting-approval');
    const afterHash = hashTree(appDir);
    const baseline = scenarios.find((scenario) => scenario.kind === 'baseline');
    for (const scenario of scenarios) {
      scenario.detected = baseline ? isProductBugDetected(scenario, baseline) : false;
      scenario.repairAccurate = isRepairAccurate(scenario);
    }
    machine.transition('done');

    const coverageOf = (locale: 'en' | 'es') => {
      const tests = (baseline?.tests ?? []).filter((test) => test.locale === locale);
      return { total: tests.length, baselinePassed: tests.filter((test) => test.status === 'passed').length };
    };

    const report: Report = {
      version: 1,
      project: 'testforge',
      provider: provider.id,
      generatedAt: new Date().toISOString(),
      commitHint: 'working tree',
      baseURL: options.baseURL,
      appSourceSha256: afterHash,
      appSourceUnchanged: beforeHash === afterHash,
      exploration,
      pipeline: machine.history,
      scenarios,
      scoreboard: buildScoreboard(scenarios, unsafe),
      coverage: { en: coverageOf('en'), es: coverageOf('es') },
      generatedTestExcerpt: originalSource.split('\n').slice(0, 48).join('\n'),
      formulas: FORMULAS,
    };

    if (!report.appSourceUnchanged) {
      throw new Error('Benchmark changed application source');
    }
    return report;
  } catch (error) {
    const canFail = ['exploring', 'generating', 'running', 'inspecting', 'classifying', 'proposing', 'awaiting-approval'].includes(
      machine.state,
    );
    if (canFail) machine.transition('failed');
    throw error;
  } finally {
    await browser.close();
  }
}

export function evaluateBenchmark(report: Report): string[] {
  const problems: string[] = [];
  if (!report.appSourceUnchanged) problems.push('Application source changed during the benchmark.');
  if (report.scoreboard.baselinePassed !== report.scoreboard.baselineTotal) {
    problems.push(`Baseline passed ${report.scoreboard.baselinePassed}/${report.scoreboard.baselineTotal}.`);
  }
  if (report.scoreboard.detection.total > 0 && report.scoreboard.detection.rate !== 1) {
    problems.push(`Detection rate was ${report.scoreboard.detection.count}/${report.scoreboard.detection.total}.`);
  }
  if (report.scoreboard.falsePositives.count !== 0) {
    problems.push(`False positives: ${report.scoreboard.falsePositives.count}.`);
  }
  if (report.scoreboard.repair.total > 0 && report.scoreboard.repair.rate !== 1) {
    problems.push(`Repair accuracy was ${report.scoreboard.repair.count}/${report.scoreboard.repair.total}.`);
  }
  if (report.scoreboard.unsafeRepairs.total > 0 && report.scoreboard.unsafeRepairs.rate !== 1) {
    problems.push('The repair gate accepted an unsafe diff.');
  }
  const flake = report.scenarios.find((scenario) => scenario.id === 'flake');
  if (flake) {
    const failed = flake.tests.filter((test) => test.status === 'failed');
    if (failed.length === 0) problems.push('The flake seed never failed an attempt.');
    if (failed.some((test) => test.classification !== 'flake')) problems.push('The flake seed was not classified as a flake.');
  }
  for (const scenario of report.scenarios) {
    if (scenario.kind === 'product-bug' && scenario.tests.some((test) => test.classification === 'locator-drift')) {
      problems.push(`${scenario.id} was classified as locator drift.`);
    }
  }
  return problems;
}
