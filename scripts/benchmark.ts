import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderBenchmarkMarkdown } from '../packages/core/src/markdown';
import { evaluateBenchmark, runBenchmark } from '../packages/agent/src/benchmark';
import { repoRoot, startVite } from './demo-server';

const port = Number(process.env.TESTFORGE_PORT ?? 4173);
const app = await startVite('apps/demo-app/vite.config.ts', port);

try {
  const report = await runBenchmark({
    repoRoot,
    baseURL: app.url,
    confirmWithPlaywright: process.env.TESTFORGE_SKIP_PLAYWRIGHT_CONFIRM !== '1',
    provider: 'heuristic',
    evidenceDir: path.join(repoRoot, 'apps/dashboard/public/evidence'),
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  mkdirSync(path.join(repoRoot, 'benchmark'), { recursive: true });
  writeFileSync(path.join(repoRoot, 'benchmark/latest.json'), json);
  writeFileSync(path.join(repoRoot, 'apps/dashboard/public/report.json'), json);
  const table = renderBenchmarkMarkdown(report);
  console.log(`\n${table}\n`);
  const problems = evaluateBenchmark(report);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Benchmark gates passed.');
  }
} finally {
  await app.close();
}
