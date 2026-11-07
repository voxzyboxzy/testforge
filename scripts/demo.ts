import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { renderBenchmarkMarkdown } from '../packages/core/src/markdown';
import { evaluateBenchmark, runBenchmark } from '../packages/agent/src/benchmark';
import { repoRoot, startVite } from './demo-server';

async function ensureChromium(): Promise<void> {
  try {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    await browser.close();
  } catch {
    const install = spawnSync('npx', ['playwright', 'install', 'chromium'], { stdio: 'inherit' });
    if (install.status !== 0) process.exit(install.status ?? 1);
  }
}

await ensureChromium();

const app = await startVite('apps/demo-app/vite.config.ts', Number(process.env.TESTFORGE_PORT ?? 4173));

const report = await runBenchmark({
  repoRoot,
  baseURL: app.url,
  confirmWithPlaywright: true,
  provider: process.env.TESTFORGE_LLM === 'ollama' ? 'ollama' : 'heuristic',
  evidenceDir: path.join(repoRoot, 'apps/dashboard/public/evidence'),
});

const json = `${JSON.stringify(report, null, 2)}\n`;
mkdirSync(path.join(repoRoot, 'benchmark'), { recursive: true });
writeFileSync(path.join(repoRoot, 'benchmark/latest.json'), json);
writeFileSync(path.join(repoRoot, 'apps/dashboard/public/report.json'), json);
console.log(renderBenchmarkMarkdown(report));

const problems = evaluateBenchmark(report);
if (problems.length > 0) {
  console.error(problems.join('\n'));
  await app.close();
  process.exit(1);
}

const dashboard = await startVite('apps/dashboard/vite.config.ts', 5174);
console.log(`\nNorthline demo app  ${app.url}`);
console.log(`TestForge dashboard ${dashboard.url}`);
console.log('Heuristic provider. No API key. Ctrl+C stops both servers.\n');

const shutdown = async () => {
  await dashboard.close();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
