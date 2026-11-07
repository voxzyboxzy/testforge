import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';

export interface StoredSubmission {
  id: string;
  idempotencyKey: string;
  email: string;
  locale: string;
}

function send(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', Buffer.byteLength(data));
  res.end(data);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * In-memory application inbox shared by the demo UI and the tests.
 * Posts are serialized so idempotency checks stay deterministic under a double click.
 */
export function submissionsApi(): Plugin {
  const submissions: StoredSubmission[] = [];
  let sequence = 1000;
  let tail: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T> | T): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const handle: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url?.split('?')[0] ?? '';
    if (url !== '/api/submissions') {
      next();
      return;
    }

    void (async () => {
      try {
        if (req.method === 'DELETE') {
          await enqueue(() => {
            submissions.length = 0;
          });
          send(res, 200, { ok: true });
          return;
        }

        if (req.method === 'GET') {
          const list = await enqueue(() => submissions.map((item) => ({ ...item })));
          send(res, 200, list);
          return;
        }

        if (req.method !== 'POST') {
          send(res, 405, { error: 'Method not allowed' });
          return;
        }

        const raw = await readBody(req);
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const key = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
        if (!key) {
          send(res, 400, { error: 'idempotencyKey is required' });
          return;
        }

        const bugs = Array.isArray(body.bugs) ? body.bugs.map(String) : [];
        const attempt = typeof body.attempt === 'number' ? body.attempt : null;
        const result = await enqueue(() => {
          const suppressConfirmation = bugs.includes('flake') && attempt === 1;
          const existing = submissions.find((item) => item.idempotencyKey === key);
          if (existing && !bugs.includes('double-submit')) {
            return {
              id: existing.id,
              count: submissions.length,
              deduped: true,
              suppressConfirmation,
            };
          }
          sequence += 1;
          const id = `NL-${sequence}`;
          submissions.push({
            id,
            idempotencyKey: key,
            email: typeof body.email === 'string' ? body.email : '',
            locale: typeof body.locale === 'string' ? body.locale : 'en',
          });
          return {
            id,
            count: submissions.length,
            deduped: false,
            suppressConfirmation,
          };
        });
        send(res, 200, result);
      } catch (error) {
        send(res, 400, { error: error instanceof Error ? error.message : 'Bad request' });
      }
    })();
  };

  return {
    name: 'testforge-submissions',
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}
