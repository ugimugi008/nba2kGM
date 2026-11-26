// Local / self-hosted server: serves the Vite app and the party API.
// On Vercel this file is not used — see api/party.ts and vercel.json.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleHealth, handlePartyRequest } from './server/partyHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  const r = await handleHealth();
  res.status(r.status).json(r.body);
});

app.all(['/api/party', '/api/party/:code', '/api/party/:code/:action'], async (req, res) => {
  const r = await handlePartyRequest({
    method: req.method,
    segments: [req.params.code, req.params.action].filter((s): s is string => Boolean(s)),
    body: req.body,
    query: { since: typeof req.query.since === 'string' ? req.query.since : undefined },
  });
  res.set('Cache-Control', 'no-store');
  if (r.body === undefined) res.status(r.status).end();
  else res.status(r.status).json(r.body);
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) res.sendFile(indexHtml);
      else res.status(404).send('Build output not found. Run `npm run build` first.');
    });
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hardwood GM listening on http://localhost:${PORT}`);
  });
}

startServer();
