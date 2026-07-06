/**
 * UnfilteredHub — Blocklist Import Script
 *
 * Fetches popular blocklists and writes them into Cloudflare KV as a
 * SINGLE snapshot value (key: bl:snapshot:v1, one domain per line).
 * The worker loads this snapshot into memory once per ~5 minutes per
 * isolate — this is what keeps per-query KV reads at zero.
 *
 * Usage:
 *   npx tsx scripts/import-blocklist.ts
 *
 * Prerequisites:
 *   - npm install -D tsx
 *   - KV namespace created (see wrangler.toml)
 *
 * Environment:
 *   KV_NAMESPACE_ID  — your KV namespace ID (from wrangler.toml or dashboard)
 *   CF_ACCOUNT_ID    — your Cloudflare account ID
 *   CF_API_TOKEN     — Cloudflare API token with Workers KV write access
 *   MAX_DOMAINS      — optional cap (default 30000). The worker parses the
 *                      snapshot on cold refresh; on the free tier's CPU
 *                      budget ~30k entries is a safe upper bound.
 */

const BLOCKLIST_SOURCES = [
  {
    name: 'Steven Black Unified',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
    format: 'hosts' as const,
  },
  {
    name: 'AdGuard DNS Filter (domains)',
    url: 'https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt',
    format: 'adblock' as const,
  },
];

function parseHostsFormat(text: string): string[] {
  const domains: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Format: 0.0.0.0 domain.com  or  127.0.0.1 domain.com
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && (parts[0] === '0.0.0.0' || parts[0] === '127.0.0.1')) {
      const domain = parts[1].toLowerCase();
      if (domain && domain !== 'localhost' && domain.includes('.')) {
        domains.push(domain);
      }
    }
  }
  return domains;
}

function parseAdblockFormat(text: string): string[] {
  const domains: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) continue;
    // Format: ||domain.com^
    const match = trimmed.match(/^\|\|([a-z0-9.-]+)\^$/);
    if (match) {
      const domain = match[1].toLowerCase();
      if (domain.includes('.')) {
        domains.push(domain);
      }
    }
  }
  return domains;
}

async function fetchBlocklist(source: typeof BLOCKLIST_SOURCES[0]): Promise<string[]> {
  console.log(`  Fetching ${source.name}...`);
  const res = await fetch(source.url);
  if (!res.ok) {
    console.error(`  Failed to fetch ${source.name}: ${res.status}`);
    return [];
  }
  const text = await res.text();
  const domains = source.format === 'hosts'
    ? parseHostsFormat(text)
    : parseAdblockFormat(text);
  console.log(`  Parsed ${domains.length} domains from ${source.name}`);
  return domains;
}

const SNAPSHOT_KEY = 'bl:snapshot:v1';

async function writeSnapshotToKV(
  domains: string[],
  accountId: string,
  namespaceId: string,
  apiToken: string,
): Promise<void> {
  // Single snapshot value: one domain per line ("@domain" = allowlist).
  // KV value limit is 25 MB — 30k domains ≈ 0.6 MB, comfortably within it.
  const snapshot = domains.join('\n');

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(SNAPSHOT_KEY)}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'text/plain',
      },
      body: snapshot,
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`KV snapshot write failed: ${err}`);
  }

  console.log(`  Snapshot written: ${domains.length} domains, ${(snapshot.length / 1024).toFixed(0)} KB (1 KV write)`);
}

async function main() {
  console.log('==========================================');
  console.log('  UnfilteredHub — Blocklist Import');
  console.log('==========================================\n');

  const accountId = process.env.CF_ACCOUNT_ID;
  const namespaceId = process.env.KV_NAMESPACE_ID;
  const apiToken = process.env.CF_API_TOKEN;

  if (!accountId || !namespaceId || !apiToken) {
    console.error('Missing environment variables. Required:');
    console.error('  CF_ACCOUNT_ID    — Cloudflare account ID');
    console.error('  KV_NAMESPACE_ID  — KV namespace ID');
    console.error('  CF_API_TOKEN     — API token with KV write permission');
    console.error('\nExample:');
    console.error('  CF_ACCOUNT_ID=abc KV_NAMESPACE_ID=xyz CF_API_TOKEN=token npx tsx scripts/import-blocklist.ts');
    process.exit(1);
  }

  // Fetch all blocklists
  console.log('Fetching blocklists...\n');
  const allDomains: Set<string> = new Set();

  for (const source of BLOCKLIST_SOURCES) {
    const domains = await fetchBlocklist(source);
    domains.forEach((d) => allDomains.add(d));
  }

  console.log(`\nTotal unique domains: ${allDomains.size}`);

  // Cap the snapshot — the worker parses it in memory on refresh, and the
  // free tier CPU budget favors keeping it bounded.
  const maxDomains = parseInt(process.env.MAX_DOMAINS || '30000', 10);
  let domainArray = Array.from(allDomains);
  if (domainArray.length > maxDomains) {
    console.log(`Capping to MAX_DOMAINS=${maxDomains} (was ${domainArray.length}).`);
    domainArray = domainArray.slice(0, maxDomains);
  }

  // Write single snapshot to KV
  console.log('\nWriting snapshot to Cloudflare KV...\n');
  await writeSnapshotToKV(domainArray, accountId, namespaceId, apiToken);

  console.log('\n==========================================');
  console.log(`  Import complete! ${domainArray.length} domains in snapshot.`);
  console.log('  Worker isolates pick it up within ~5 minutes.');
  console.log('==========================================');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
