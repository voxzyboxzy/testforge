import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function startVite(configFile: string, port: number): Promise<{ url: string; close: () => Promise<void> }> {
  const server = await createServer({
    configFile: path.join(repoRoot, configFile),
    server: { host: '127.0.0.1', port, strictPort: true },
  });
  await server.listen();
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        return { url, close: () => server.close() };
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await server.close();
  throw new Error(`Vite server did not respond on ${url}: ${String(lastError)}`);
}
