import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { handleApiRequest, type MoonCodeServerEnv } from './server/shared/githubSyncHandler.ts';

const PORT = Number(process.env.PORT || 3000);

function toFetchRequest(req: express.Request): Request {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers.host || `localhost:${PORT}`;
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody ? (req as unknown as { rawBody?: Buffer }).rawBody : undefined;

  return new Request(fullUrl, {
    method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });
}

async function startServer(): Promise<void> {
  const app = express();

  // Capture raw body and dispatch all /api/* routes cleanly (compatible with Express 4)
  app.use('/api', (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', async () => {
      try {
        (req as unknown as { rawBody?: Buffer }).rawBody = Buffer.concat(chunks);
        const fetchReq = toFetchRequest(req);
        const env = process.env as unknown as MoonCodeServerEnv;
        const fetchRes = await handleApiRequest(fetchReq, env);

        res.status(fetchRes.status);
        fetchRes.headers.forEach((value, key) => {
          if (key.toLowerCase() === 'set-cookie') {
            const prev = res.getHeader('Set-Cookie');
            const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
            res.setHeader('Set-Cookie', [...list, value]);
          } else {
            res.setHeader(key, value);
          }
        });

        const arrayBuf = await fetchRes.arrayBuffer();
        res.send(Buffer.from(arrayBuf));
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Internal Server Error',
        });
      }
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Production build not found. Run npm run build first.');
      }
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MoonCode server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
