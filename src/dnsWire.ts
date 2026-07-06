/**
 * UnfilteredHub — DNS Wireformat Helpers
 * Centralized parsing/building utilities for RFC 1035 wire messages.
 *
 * Used by:
 *   - blocker.ts  → domain extraction for blocklist checks
 *   - abuse.ts    → QTYPE/QCLASS extraction for dangerous-query detection
 *   - cache.ts    → cache key parts, TTL extraction, transaction-ID rewrite
 *   - index.ts    → question parsing on the wire GET/POST paths
 */

/* ── Constants ─────────────────────────────────────────── */

export const DNS_HEADER_SIZE = 12;

/** Resource record TYPE for EDNS OPT pseudo-record (RFC 6891) */
const TYPE_OPT = 41;

/* ── Types ─────────────────────────────────────────────── */

export interface WireQuestion {
  /** Lowercased query name without trailing dot ("" for root) */
  qname: string;
  qtype: number;
  qclass: number;
  /** Offset of the first byte after the question section */
  endOffset: number;
}

/* ── Header field readers ──────────────────────────────── */

function u16(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

/** RCODE from the low nibble of header byte 3. */
export function getRcode(buffer: ArrayBuffer): number {
  const data = new Uint8Array(buffer);
  if (data.length < DNS_HEADER_SIZE) return -1;
  return data[3] & 0x0f;
}

/** ANCOUNT from header bytes 6-7. */
export function getAnswerCount(buffer: ArrayBuffer): number {
  const data = new Uint8Array(buffer);
  if (data.length < DNS_HEADER_SIZE) return 0;
  return u16(data, 6);
}

/** CD (Checking Disabled) flag: header byte 3, bit 4. */
export function parseCdFlag(buffer: ArrayBuffer): boolean {
  const data = new Uint8Array(buffer);
  if (data.length < DNS_HEADER_SIZE) return false;
  return (data[3] & 0x10) !== 0;
}

/* ── Question parsing ──────────────────────────────────── */

/**
 * Parse the first question of a DNS message.
 * Returns null on malformed input (bounds violations, compression
 * pointers inside the question name, oversized labels).
 */
export function parseQuestion(buffer: ArrayBuffer): WireQuestion | null {
  const data = new Uint8Array(buffer);
  if (data.length < DNS_HEADER_SIZE + 5) return null; // header + root label + type + class
  if (u16(data, 4) < 1) return null; // QDCOUNT

  const labels: string[] = [];
  let offset = DNS_HEADER_SIZE;

  while (offset < data.length) {
    const len = data[offset];
    if (len === 0) { offset++; break; }
    // Compression pointers are invalid as the first name in a message
    if ((len & 0xc0) === 0xc0) return null;
    if (len > 63 || offset + 1 + len > data.length) return null;
    labels.push(new TextDecoder().decode(data.slice(offset + 1, offset + 1 + len)));
    offset += 1 + len;
  }

  if (offset + 4 > data.length) return null;

  return {
    qname: labels.join('.').toLowerCase(),
    qtype: u16(data, offset),
    qclass: u16(data, offset + 2),
    endOffset: offset + 4,
  };
}

/**
 * Parse domain name from a DNS wireformat query buffer.
 * Convenience wrapper around parseQuestion() for blocklist checks.
 */
export function parseDomainFromWire(buffer: ArrayBuffer): string | null {
  const q = parseQuestion(buffer);
  return q && q.qname.length > 0 ? q.qname : null;
}

/**
 * Parse QTYPE and QCLASS from a DNS wireformat query.
 * Returns null if parsing fails.
 */
export function parseQueryMeta(
  buffer: ArrayBuffer,
): { qtype: number; qclass: number; querySize: number } | null {
  const q = parseQuestion(buffer);
  if (!q) return null;
  return { qtype: q.qtype, qclass: q.qclass, querySize: buffer.byteLength };
}

/* ── Record walking ────────────────────────────────────── */

/**
 * Skip a (possibly compressed) name starting at `offset`.
 * Returns the offset after the name, or -1 on malformed input.
 */
function skipName(data: Uint8Array, offset: number): number {
  while (offset < data.length) {
    const len = data[offset];
    if (len === 0) return offset + 1;
    if ((len & 0xc0) === 0xc0) return offset + 2; // compression pointer ends the name
    if (len > 63 || offset + 1 + len > data.length) return -1;
    offset += 1 + len;
  }
  return -1;
}

/**
 * EDNS DO (DNSSEC OK) flag from the OPT pseudo-record in the additional
 * section (RFC 6891 §6.1.3 — DO is the high bit of the 3rd TTL byte).
 * Returns false when there is no OPT record or the message is malformed.
 */
export function parseEdnsDoFlag(buffer: ArrayBuffer): boolean {
  const data = new Uint8Array(buffer);
  const q = parseQuestion(buffer);
  if (!q) return false;

  const total = u16(data, 6) + u16(data, 8) + u16(data, 10); // AN + NS + AR
  let offset = q.endOffset;

  for (let i = 0; i < total; i++) {
    offset = skipName(data, offset);
    if (offset < 0 || offset + 10 > data.length) return false;

    const type = u16(data, offset);
    if (type === TYPE_OPT) {
      // TTL bytes at offset+4..7 = [ext-rcode, version, DO|Z, Z]
      return (data[offset + 6] & 0x80) !== 0;
    }

    const rdlen = u16(data, offset + 8);
    offset += 10 + rdlen;
  }

  return false;
}

/**
 * Extract the minimum TTL across answer/authority/additional records
 * of a wireformat DNS response. OPT pseudo-records are skipped (their
 * TTL field holds EDNS flags, not a TTL).
 * Returns null when no real records are present or parsing fails.
 */
export function extractMinTtlFromWire(buffer: ArrayBuffer): number | null {
  const data = new Uint8Array(buffer);
  const q = parseQuestion(buffer);
  if (!q) return null;

  const total = u16(data, 6) + u16(data, 8) + u16(data, 10);
  let offset = q.endOffset;
  let minTtl: number | null = null;

  for (let i = 0; i < total; i++) {
    offset = skipName(data, offset);
    if (offset < 0 || offset + 10 > data.length) break;

    const type = u16(data, offset);
    const ttl =
      ((data[offset + 4] << 24) |
        (data[offset + 5] << 16) |
        (data[offset + 6] << 8) |
        data[offset + 7]) >>> 0;
    const rdlen = u16(data, offset + 8);

    if (type !== TYPE_OPT) {
      minTtl = minTtl === null ? ttl : Math.min(minTtl, ttl);
    }

    offset += 10 + rdlen;
  }

  return minTtl;
}

/* ── Transaction ID handling ───────────────────────────── */

/**
 * Copy a response and stamp it with the transaction ID of `requestBuffer`.
 * Cached wire responses MUST NOT be returned with the original requester's
 * ID — each client expects its own ID echoed back (bytes 0-1).
 */
export function withRequestId(response: Uint8Array, requestBuffer: ArrayBuffer): Uint8Array {
  const out = new Uint8Array(response); // copy
  const req = new Uint8Array(requestBuffer);
  if (out.length >= 2 && req.length >= 2) {
    out[0] = req[0];
    out[1] = req[1];
  }
  return out;
}

/* ── Base64url decoding (RFC 8484 GET ?dns=) ───────────── */

/**
 * Decode the base64url `?dns=` parameter into a standalone ArrayBuffer.
 * Returns null on invalid input.
 */
export function decodeDnsParam(dnsParam: string): ArrayBuffer | null {
  try {
    const raw = atob(dnsParam.replace(/-/g, '+').replace(/_/g, '/'));
    const buf = new ArrayBuffer(raw.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
    return buf;
  } catch {
    return null;
  }
}
