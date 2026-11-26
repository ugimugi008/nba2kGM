/**
 * Framework-agnostic HTTP routing for the party API. Used by the Express dev
 * server (server.ts) and by the Vercel serverless function (api/party.ts).
 */
import { createPartyService, type PartyService } from './partyService.js';
import { getStorageFromEnv } from './storage.js';

export interface PartyRequest {
  method: string;
  /** Path segments after /api/party, e.g. [] | ['ABC123'] | ['ABC123', 'join'] */
  segments: string[];
  body: unknown;
  query: Record<string, string | undefined>;
}

export interface PartyResponse {
  status: number;
  body?: unknown;
}

let servicePromise: Promise<PartyService> | null = null;

export function getPartyService(): Promise<PartyService> {
  servicePromise ??= getStorageFromEnv().then(createPartyService);
  servicePromise.catch(() => {
    servicePromise = null;
  });
  return servicePromise;
}

/** On Vercel, in-memory rooms silently break (each request may hit another instance). */
function misconfiguredOnServerless(service: PartyService): boolean {
  return service.storageKind === 'memory' && Boolean(process.env.VERCEL);
}

const STORAGE_HELP =
  'Party server storage is not set up. In Vercel open Storage → add "Upstash for Redis" (free) to this project, then redeploy.';

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function out(result: { room?: unknown; error?: string; status?: number }, okStatus = 200): PartyResponse {
  if (result.error || !result.room) {
    return { status: result.status ?? 400, body: { error: result.error ?? 'Party error.' } };
  }
  return { status: okStatus, body: { room: result.room } };
}

export async function handleHealth(): Promise<PartyResponse> {
  const service = await getPartyService();
  return {
    status: 200,
    body: {
      ok: !misconfiguredOnServerless(service),
      storage: service.storageKind,
      ...(misconfiguredOnServerless(service) ? { error: STORAGE_HELP } : {}),
    },
  };
}

export async function handlePartyRequest(req: PartyRequest, service?: PartyService): Promise<PartyResponse> {
  try {
    const svc = service ?? (await getPartyService());
    if (misconfiguredOnServerless(svc)) {
      return { status: 503, body: { error: STORAGE_HELP } };
    }

    const method = req.method.toUpperCase();
    const [code, action] = req.segments;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

    if (!code) {
      if (method !== 'POST') return { status: 405, body: { error: 'Method not allowed.' } };
      return out(
        await svc.createRoom({
          hostToken: str(body.hostToken),
          hostName: str(body.hostName),
          draftMode: body.draftMode === 'open' ? 'open' : 'spin',
          includeHistoric: Boolean(body.includeHistoric),
          selectedYears: Array.isArray(body.selectedYears) ? (body.selectedYears as number[]) : undefined,
          seriesMode: body.seriesMode === 'bo7' ? 'bo7' : 'single',
        }),
        201
      );
    }

    if (!action) {
      if (method !== 'GET') return { status: 405, body: { error: 'Method not allowed.' } };
      // Cheap "has anything changed?" check used by client polling.
      const since = Number(req.query.since);
      if (Number.isFinite(since) && since > 0) {
        const rev = await svc.getRev(code);
        if (rev === null) return out({ error: `Party code "${code.toUpperCase()}" not found or expired.`, status: 404 });
        if (rev === since) return { status: 204 };
      }
      return out(await svc.getRoom(code));
    }

    if (method !== 'POST') return { status: 405, body: { error: 'Method not allowed.' } };
    const token = str(body.playerToken);

    switch (action) {
      case 'join':
        return out(await svc.joinRoom(code, str(body.guestToken), str(body.guestName)));
      case 'start': {
        const { playerToken: _t, ...payload } = body;
        return out(await svc.startDraft(code, token, payload));
      }
      case 'spin':
        return out(await svc.spinReels(code, token, body.spinState as never));
      case 'pick':
        return out(await svc.pickPlayer(code, token, str(body.playerId)));
      case 'lineup':
        return out(await svc.lockLineup(code, token, body.lineup));
      case 'next-game':
        return out(
          await svc.nextSeriesGame(
            code,
            token,
            Number(body.expectedGameNumber) || 1,
            body.winner === 'B' ? 'B' : 'A'
          )
        );
      case 'finish':
        return out(await svc.finishRoom(code, token));
      default:
        return { status: 404, body: { error: 'Unknown party action.' } };
    }
  } catch (err) {
    console.error('[party] request failed', err);
    return { status: 500, body: { error: 'Party server error. Please retry.' } };
  }
}
