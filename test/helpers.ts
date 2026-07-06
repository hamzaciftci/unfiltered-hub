/**
 * Test helpers: mock KV, mock Cache API, DNS wire builders, worker ctx.
 * Runs on Node 18+ (global fetch/Response/TextDecoder/atob available).
 */

/* ── Mock KV namespace (counts every operation) ────────── */

export class MockKV {
  store = new Map<string, string>();
  reads = 0;
  writes = 0;
  deletes = 0;
  lists = 0;

  async get(key: string, type?: string): Promise<any> {
    this.reads++;
    const v = this.store.get(key);
    if (v === undefined) return null;
    return type === 'json' ? JSON.parse(v) : v;
  }

  async put(key: string, value: string, _opts?: unknown): Promise<void> {
    this.writes++;
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.deletes++;
    this.store.delete(key);
  }

  async list(_opts?: unknown): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor: string }> {
    this.lists++;
    return {
      keys: [...this.store.keys()].map((name) => ({ name })),
      list_complete: true,
      cursor: '',
    };
  }
}

/* ── Mock Cache API ────────────────────────────────────── */

export class MockCache {
  entries = new Map<string, { body: Uint8Array; status: number; headers: [string, string][] }>();
  hits = 0;
  puts = 0;

  async match(key: string | Request): Promise<Response | undefined> {
    const url = typeof key === 'string' ? key : key.url;
    const e = this.entries.get(url);
    if (!e) return undefined;
    this.hits++;
    return new Response(e.body.slice().buffer as ArrayBuffer, {
      status: e.status,
      headers: e.headers,
    });
  }

  async put(key: string | Request, res: Response): Promise<void> {
    const url = typeof key === 'string' ? key : key.url;
    this.puts++;
    this.entries.set(url, {
      body: new Uint8Array(await res.arrayBuffer()),
      status: res.status,
      headers: [...res.headers.entries()],
    });
  }
}

/** Install a fresh mock `caches.default` global; returns the mock. */
export function installMockCaches(): MockCache {
  const mock = new MockCache();
  (globalThis as any).caches = { default: mock };
  return mock;
}

/* ── Worker ExecutionContext mock ──────────────────────── */

export interface MockCtx {
  waitUntil(p: Promise<unknown>): void;
  passThroughOnException(): void;
  /** Await all waitUntil promises (background work) */
  drain(): Promise<void>;
}

export function makeCtx(): MockCtx {
  const promises: Promise<unknown>[] = [];
  return {
    waitUntil(p: Promise<unknown>) { promises.push(p.catch(() => {})); },
    passThroughOnException() {},
    async drain() { await Promise.all(promises.splice(0)); },
  };
}

/* ── DNS wireformat builders ───────────────────────────── */

export interface WireQueryOpts {
  id?: number;
  qtype?: number;
  qclass?: number;
  /** Add an EDNS OPT record with the DO bit */
  dnssecOk?: boolean;
  /** Set the CD header flag */
  cd?: boolean;
}

/** Build a minimal RFC 1035 query message. */
export function buildWireQuery(name: string, opts: WireQueryOpts = {}): Uint8Array {
  const { id = 0x1234, qtype = 1, qclass = 1, dnssecOk = false, cd = false } = opts;

  const labels = name === '' ? [] : name.split('.');
  const nameLen = labels.reduce((a, l) => a + 1 + l.length, 0) + 1;
  const ednsLen = dnssecOk ? 11 : 0;
  const buf = new Uint8Array(12 + nameLen + 4 + ednsLen);

  // Header
  buf[0] = (id >> 8) & 0xff;
  buf[1] = id & 0xff;
  buf[2] = 0x01; // RD
  buf[3] = cd ? 0x10 : 0x00;
  buf[5] = 1;    // QDCOUNT
  buf[11] = dnssecOk ? 1 : 0; // ARCOUNT

  // Question
  let o = 12;
  for (const label of labels) {
    buf[o++] = label.length;
    for (let i = 0; i < label.length; i++) buf[o++] = label.charCodeAt(i);
  }
  buf[o++] = 0; // root
  buf[o++] = (qtype >> 8) & 0xff;
  buf[o++] = qtype & 0xff;
  buf[o++] = (qclass >> 8) & 0xff;
  buf[o++] = qclass & 0xff;

  // EDNS OPT pseudo-record (RFC 6891)
  if (dnssecOk) {
    buf[o++] = 0x00;             // root name
    buf[o++] = 0x00; buf[o++] = 0x29; // TYPE 41
    buf[o++] = 0x10; buf[o++] = 0x00; // UDP size 4096
    buf[o++] = 0x00;             // ext-rcode
    buf[o++] = 0x00;             // version
    buf[o++] = 0x80; buf[o++] = 0x00; // DO bit set
    buf[o++] = 0x00; buf[o++] = 0x00; // RDLEN 0
  }

  return buf;
}

/** Find the end offset of the question section of a query. */
function questionEnd(query: Uint8Array): number {
  let o = 12;
  while (o < query.length && query[o] !== 0) o += 1 + query[o];
  return o + 1 + 4; // root byte + type/class
}

export interface WireAnswerOpts {
  ttl?: number;
  rcode?: number;
  /** Number of identical A answer records (0 → NODATA) */
  answers?: number;
}

/** Build a response to `query`: header+question echoed, N A-records appended. */
export function buildWireAnswer(query: Uint8Array, opts: WireAnswerOpts = {}): Uint8Array {
  const { ttl = 300, rcode = 0, answers = 1 } = opts;
  const qEnd = questionEnd(query);
  const rec = 16; // ptr(2) + type(2) + class(2) + ttl(4) + rdlen(2) + rdata(4)
  const out = new Uint8Array(qEnd + rec * answers);
  out.set(query.slice(0, qEnd));

  out[2] = 0x81;                 // QR=1, RD=1
  out[3] = 0x80 | (rcode & 0x0f); // RA=1, RCODE
  out[6] = (answers >> 8) & 0xff;
  out[7] = answers & 0xff;
  out[8] = 0; out[9] = 0;   // NSCOUNT
  out[10] = 0; out[11] = 0; // ARCOUNT

  let o = qEnd;
  for (let i = 0; i < answers; i++) {
    out[o++] = 0xc0; out[o++] = 0x0c;          // name pointer → question
    out[o++] = 0x00; out[o++] = 0x01;          // TYPE A
    out[o++] = 0x00; out[o++] = 0x01;          // CLASS IN
    out[o++] = (ttl >> 24) & 0xff; out[o++] = (ttl >> 16) & 0xff;
    out[o++] = (ttl >> 8) & 0xff;  out[o++] = ttl & 0xff;
    out[o++] = 0x00; out[o++] = 0x04;          // RDLEN 4
    out[o++] = 1; out[o++] = 2; out[o++] = 3; out[o++] = 4; // 1.2.3.4
  }

  return out;
}

/** base64url-encode bytes (for ?dns= GET parameter). */
export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ── Upstream fetch mocks ──────────────────────────────── */

/**
 * A fetch mock that answers wireformat DoH requests (GET ?dns= and POST)
 * by echoing the query with an A-record answer. Counts calls.
 */
export function makeWireUpstreamFetch(opts: WireAnswerOpts = {}) {
  const calls: string[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
    calls.push(url);

    let query: Uint8Array;
    if (init?.method === 'POST') {
      const body = init.body as ArrayBuffer;
      query = new Uint8Array(body);
    } else {
      const dnsParam = new URL(url).searchParams.get('dns')!;
      const raw = atob(dnsParam.replace(/-/g, '+').replace(/_/g, '/'));
      query = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) query[i] = raw.charCodeAt(i);
    }

    const answer = buildWireAnswer(query, opts);
    return new Response(answer.slice().buffer as ArrayBuffer, {
      headers: { 'Content-Type': 'application/dns-message' },
    });
  };
  return Object.assign(fn, { calls });
}

/** A fetch mock answering JSON DoH requests. Counts calls. */
export function makeJsonUpstreamFetch(payload?: object) {
  const calls: string[] = [];
  const fn = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
    calls.push(url);
    const u = new URL(url);
    const body = payload ?? {
      Status: 0,
      Answer: [{ name: u.searchParams.get('name'), type: 1, TTL: 300, data: '1.2.3.4' }],
    };
    return new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/dns-json' },
    });
  };
  return Object.assign(fn, { calls });
}

/* ── Worker request builders ───────────────────────────── */

export const WORKER_BASE = 'https://doh.test';

export function dnsGetRequest(params: Record<string, string>, ip = '203.0.113.1'): Request {
  const u = new URL(`${WORKER_BASE}/dns-query`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Request(u.toString(), {
    headers: { 'CF-Connecting-IP': ip, Accept: 'application/dns-message' },
  });
}

export function dnsPostRequest(query: Uint8Array, ip = '203.0.113.1'): Request {
  return new Request(`${WORKER_BASE}/dns-query`, {
    method: 'POST',
    headers: {
      'CF-Connecting-IP': ip,
      'Content-Type': 'application/dns-message',
    },
    body: query.slice().buffer as ArrayBuffer,
  });
}

export const STRONG_ADMIN_KEY = 'a-strong-admin-key-with-32-chars!';
