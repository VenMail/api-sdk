import { resolveTxt } from 'dns/promises';

interface ResolvedKey {
  publicKey: string;
  keyVersion?: number;
  status: string;
}

const cache = new Map<string, { data: ResolvedKey; expires: number }>();
const CACHE_TTL = 300_000;

function getCached(key: string): ResolvedKey | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: ResolvedKey): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

export async function resolveKey(
  agentName: string,
  domain: string,
  method: string,
  embeddedKey?: string
): Promise<ResolvedKey | null> {
  const cacheKey = `${method}:${agentName}@${domain}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  switch (method) {
    case 'well-known':
      return resolveWellKnown(agentName, domain, cacheKey);
    case 'dns':
      return resolveDns(agentName, domain, cacheKey);
    case 'embedded':
      if (!embeddedKey) return null;
      return { publicKey: embeddedKey, status: 'active' };
    default:
      return null;
  }
}

async function resolveWellKnown(agentName: string, domain: string, cacheKey: string): Promise<ResolvedKey | null> {
  try {
    const url = `https://${domain}/.well-known/venmail-agent/${encodeURIComponent(agentName)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const result: ResolvedKey = { publicKey: data.public_key, keyVersion: data.key_version, status: data.status };
    setCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

async function resolveDns(agentName: string, domain: string, cacheKey: string): Promise<ResolvedKey | null> {
  try {
    const records = await resolveTxt(`_venmail.${domain}`);
    for (const record of records) {
      const txt = record.join('');
      if (!txt.startsWith('v=VVS1')) continue;
      const parts = Object.fromEntries(
        txt.split(';').map(p => {
          const [k, ...v] = p.trim().split('=');
          return [k?.trim(), v.join('=').trim()];
        })
      );
      if (parts.agent !== agentName) continue;
      const result: ResolvedKey = {
        publicKey: parts.pubkey,
        keyVersion: parts.kv ? parseInt(parts.kv, 10) : undefined,
        status: parts.status || 'active',
      };
      setCache(cacheKey, result);
      return result;
    }
    return null;
  } catch {
    return null;
  }
}
