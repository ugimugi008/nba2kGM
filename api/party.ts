// Vercel serverless function for the party API.
// vercel.json rewrites /api/party/:code/:action → /api/party?code=:code&action=:action
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handlePartyRequest } from '../server/partyHandler.js';

type VercelRequest = IncomingMessage & {
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function handler(req: VercelRequest, res: ServerResponse) {
  const query = req.query ?? {};
  const code = first(query.code);
  const action = first(query.action);
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const result = await handlePartyRequest({
    method: req.method ?? 'GET',
    segments: [code, action].filter((s): s is string => Boolean(s)),
    body,
    query: { since: first(query.since) },
  });

  res.statusCode = result.status;
  res.setHeader('Cache-Control', 'no-store');
  if (result.body === undefined) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(result.body));
}
