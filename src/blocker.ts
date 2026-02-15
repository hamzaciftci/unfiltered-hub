/**
 * UnfilteredHub — DNS Blocker Engine
 * Checks domains against core blocklist + optional KV extended list.
 * Builds blocked DNS responses in both JSON and wireformat.
 */

import { CORE_BLOCKLIST } from './blocklist';

/**
 * Check if a domain (or any of its parent domains) is blocked.
 * Checks KV first (if available), then falls back to the embedded core list.
 */
export async function isBlocked(
  domain: string,
  kv?: KVNamespace,
): Promise<boolean> {
  const normalized = domain.toLowerCase().replace(/\.$/, '');
  const parts = normalized.split('.');

  // Check each level: ads.example.com → ads.example.com, example.com
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');

    // KV check (extended list)
    if (kv) {
      try {
        const val = await kv.get(candidate);
        if (val !== null) return true;
      } catch {
        // KV unavailable, continue to core list
      }
    }

    // Core embedded list
    if (CORE_BLOCKLIST.has(candidate)) return true;
  }

  return false;
}

/**
 * Build a blocked DNS response in JSON format (application/dns-json).
 * Returns NXDOMAIN (Status: 3) with no answers.
 */
export function buildBlockedJsonResponse(): Response {
  return new Response(
    JSON.stringify({
      Status: 3, // NXDOMAIN
      TC: false,
      RD: true,
      RA: true,
      AD: false,
      CD: false,
      Question: [],
      Answer: [],
      Comment: 'Blocked by UnfilteredHub',
    }),
    {
      headers: {
        'Content-Type': 'application/dns-json',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}

/**
 * Build a blocked DNS response in wireformat (application/dns-message).
 * Creates a minimal NXDOMAIN response matching the query ID.
 */
export function buildBlockedWireResponse(queryBuffer: ArrayBuffer): Response {
  const query = new Uint8Array(queryBuffer);

  // Minimum valid DNS message is 12 bytes (header only)
  if (query.length < 12) {
    return new Response('Invalid DNS query', { status: 400 });
  }

  // Build response header:
  // - Copy query ID (bytes 0-1)
  // - Set QR=1, OPCODE=0, AA=0, TC=0, RD=1, RA=1, RCODE=3 (NXDOMAIN)
  const response = new Uint8Array(query.length);
  response.set(query); // Copy the entire query

  // Byte 2: QR=1 (bit 7), RD=1 (bit 0) → 0x81
  response[2] = 0x81;
  // Byte 3: RA=1 (bit 7), RCODE=3 (bits 0-3) → 0x83
  response[3] = 0x83;
  // ANCOUNT = 0
  response[6] = 0;
  response[7] = 0;
  // NSCOUNT = 0
  response[8] = 0;
  response[9] = 0;
  // ARCOUNT = 0
  response[10] = 0;
  response[11] = 0;

  return new Response(response.buffer, {
    headers: {
      'Content-Type': 'application/dns-message',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Parse domain name from a DNS wireformat query buffer.
 * DNS names are encoded as a sequence of labels: [length][chars][length][chars]...[0]
 */
export function parseDomainFromWire(buffer: ArrayBuffer): string | null {
  const data = new Uint8Array(buffer);

  // DNS header is 12 bytes, question starts at byte 12
  if (data.length < 13) return null;

  const labels: string[] = [];
  let offset = 12;

  while (offset < data.length) {
    const len = data[offset];
    if (len === 0) break; // Root label

    // Pointer (compression) — shouldn't appear in questions, but handle it
    if ((len & 0xc0) === 0xc0) break;

    // Sanity check
    if (len > 63 || offset + 1 + len > data.length) return null;

    const label = new TextDecoder().decode(data.slice(offset + 1, offset + 1 + len));
    labels.push(label);
    offset += 1 + len;
  }

  return labels.length > 0 ? labels.join('.') : null;
}
