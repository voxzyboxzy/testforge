import { readFileSync, statSync } from 'node:fs';
import { renderBenchmarkMarkdown } from '../packages/core/src/markdown';
import type { Report } from '../packages/core/src/types';

const report = JSON.parse(readFileSync('benchmark/latest.json', 'utf8')) as Report;
const expected = renderBenchmarkMarkdown(report).trim();
const readme = readFileSync('README.md', 'utf8');
const start = readme.indexOf('<!-- benchmark:start -->');
const end = readme.indexOf('<!-- benchmark:end -->');
if (start < 0 || end < start) {
  console.error('README is missing benchmark markers.');
  process.exit(1);
}
const actual = readme.slice(start + '<!-- benchmark:start -->'.length, end).trim();
if (actual !== expected) {
  console.error('README benchmark tables do not match benchmark/latest.json.');
  console.error('--- expected ---');
  console.error(expected);
  process.exit(1);
}

const published = readFileSync('apps/dashboard/public/report.json', 'utf8');
if (published !== readFileSync('benchmark/latest.json', 'utf8')) {
  console.error('Dashboard report.json does not match benchmark/latest.json.');
  process.exit(1);
}

for (const file of [
  'screenshots/dashboard-scoreboard.png',
  'screenshots/dashboard-evidence.png',
  'screenshots/dashboard-repair.png',
]) {
  const size = statSync(file).size;
  if (size < 20_000) {
    console.error(`${file} is too small to be a dashboard screenshot (${size} bytes).`);
    process.exit(1);
  }
}

console.log('README benchmark tables match the measured report.');
