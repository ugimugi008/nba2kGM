import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleHealth } from '../server/partyHandler.js';

// GET /api/health → { ok, storage: "upstash" | "redis" | "memory" }
export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  const result = await handleHealth();
  res.statusCode = result.status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(result.body));
}
