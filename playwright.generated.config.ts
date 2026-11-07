import { defineConfig } from '@playwright/test';

const port = Number(process.env.TESTFORGE_PORT ?? 4173);
const baseURL = process.env.TESTFORGE_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: process.env.TESTFORGE_GENERATED_DIR ?? 'generated',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: process.env.TESTFORGE_NO_WEBSERVER
    ? undefined
    : {
        command: `npx vite --config apps/demo-app/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
