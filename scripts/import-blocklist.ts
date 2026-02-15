/**
 * UnfilteredHub — Blocklist Import Script
 *
 * Fetches popular blocklists and imports domains into Cloudflare KV.
 *
 * Usage:
 *   npx tsx scripts/import-blocklist.ts
 *
 * Prerequisites:
 *   - npm install -D tsx
 *   - npx wrangler login
 *   - KV namespace created (see wrangler.toml)
 *
 * Environment:
 *   KV_NAMESPACE_ID  — your KV namespace ID (from wrangler.toml or dashboard)
 *   CF_ACCOUNT_ID    — your Cloudflare account ID
 *   CF_API_TOKEN     — Cloudflare API token with Workers KV write access
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

async function writeToKV(
  domains: string[],
  accountId: string,
  namespaceId: string,
  apiToken: string,
): Promise<void> {
  // Cloudflare KV bulk write API: max 10,000 key-value pairs per request
  const BATCH_SIZE = 10000;

  for (let i = 0; i < domains.length; i += BATCH_SIZE) {
    const batch = domains.slice(i, i + BATCH_SIZE);
    const body = batch.map((d) => ({ key: d, value: '1' }));

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`KV bulk write failed (batch ${i / BATCH_SIZE + 1}): ${err}`);
    }

    console.log(`  Written batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} domains)`);
  }
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

  // Write to KV
  console.log('\nWriting to Cloudflare KV...\n');
  const domainArray = Array.from(allDomains);
  await writeToKV(domainArray, accountId, namespaceId, apiToken);

  console.log('\n==========================================');
  console.log(`  Import complete! ${allDomains.size} domains imported.`);
  console.log('==========================================');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
