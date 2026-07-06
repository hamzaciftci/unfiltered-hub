/**
 * UnfilteredHub — DNS-over-HTTPS Proxy
 * Cloudflare Worker entry point.
 *
 * Deploy: npx wrangler deploy
 * Test:   curl 'https://YOUR-WORKER.workers.dev/dns-query?name=example.com&type=A'
 */

import { generateLandingPage } from './landing';
import { generateMobileConfig } from './apple-profile';
import { generateAndroidGuide, generateAndroidConfig } from './android-profile';
import { isBlocked, buildBlockedJsonResponse, buildBlockedWireResponse } from './blocker';
import { handleAdmin } from './admin';
import {
  getCachedResponse,
  cacheResponse,
  getCachedWireResponse,
  cacheWireResponse,
  type WireCacheKeyParts,
} from './cache';
import { recordQuery } from './stats';
import { resolveJson, resolveWireGet, resolveWirePost, getUpstreams } from './resolver';
import { checkJsonAbuse, checkWireAbuse } from './abuse';
import { handleWhoAmI } from './whoami';
import { handleBlocklistPage, handleBlocklistTxt, handleBlocklistJson } from './blocklistViewer';
import { handleTransparency } from './transparency';
import { generateSetupPage } from './setup';
import { handleImpactApi } from './impactWidget';
import { getClientIp, detectLang, dnsWireHeaders, dnsJsonHeaders } from './utils';
import { decodeDnsParam, parseQuestion, parseCdFlag, parseEdnsDoFlag } from './dnsWire';

export interface Env {
  BLOCKLIST?: KVNamespace;
  ADMIN_KEY?: string;
  ADMIN_ALLOWED_IPS?: string;
  UPSTREAM?: string;
  VERSION?: string;
  BUILD_TIME?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      // CORS preflight is only meaningful for the public DoH endpoint.
      // Admin/dashboard calls are same-origin and need no CORS.
      if (url.pathname === '/dns-query') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Accept',
            'Access-Control-Max-Age': '86400',
          },
        });
      }
      return new Response(null, { status: 204, headers: { Allow: 'GET, POST, OPTIONS' } });
    }

    const upstreams = getUpstreams(env.UPSTREAM);

    // ── Lightweight endpoints (no KV, no DNS) ──

    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'unfilteredhub-doh',
        adblock: true,
        cache: true,
        resolvers: upstreams.map(u => u.name),
      });
    }

    if (url.pathname === '/api/impact') return handleImpactApi(env.BLOCKLIST, upstreams);
    if (url.pathname === '/whoami') return handleWhoAmI(request, upstreams);
    if (url.pathname === '/transparency') return handleTransparency(request, url, upstreams, env);

    if (url.pathname === '/setup') {
      const lang = detectLang(url, request, 'en');
      return new Response(generateSetupPage(lang, url.host), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (url.pathname === '/blocklist') return handleBlocklistPage(request, url);
    if (url.pathname === '/blocklist.txt') return handleBlocklistTxt();
    if (url.pathname === '/blocklist.json') return handleBlocklistJson();

    if (url.pathname === '/') {
      const lang = detectLang(url, request, 'tr');
      return new Response(generateLandingPage(lang), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // ── Profile generators ──

    if (url.pathname === '/apple-profile') {
      const domain = url.searchParams.get('domain');
      if (!domain) return Response.json({ error: 'Missing "domain" parameter' }, { status: 400 });
      return new Response(generateMobileConfig(domain), {
        headers: {
          'Content-Type': 'application/x-apple-asn1-config',
          'Content-Disposition': 'attachment; filename="unfilteredhub-doh.mobileconfig"',
        },
      });
    }

    if (url.pathname === '/android') {
      const domain = url.searchParams.get('domain');
      if (!domain) return Response.json({ error: 'Missing "domain" parameter' }, { status: 400 });
      const lang = detectLang(url, request, 'tr');
      return new Response(generateAndroidGuide(domain, lang), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (url.pathname === '/android-config') {
      const domain = url.searchParams.get('domain');
      if (!domain) return Response.json({ error: 'Missing "domain" parameter' }, { status: 400 });
      return new Response(JSON.stringify(generateAndroidConfig(domain), null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="unfilteredhub-doh.json"',
        },
      });
    }

    // ── Admin ──

    if (url.pathname.startsWith('/admin')) return handleAdmin(request, url, env, ctx);

    // ── DNS query handler ──

    if (url.pathname !== '/dns-query') {
      return new Response('UnfilteredHub DoH — /dns-query endpoint aktif', { status: 404 });
    }

    const clientIp = getClientIp(request);

    try {
      if (request.method === 'GET') {
        return await handleDnsGet(url, clientIp, upstreams, env, ctx);
      }
      if (request.method === 'POST') {
        return await handleDnsPost(request, clientIp, upstreams, env, ctx);
      }
      return new Response('Method Not Allowed', { status: 405 });
    } catch {
      return Response.json({ error: 'DNS proxy error — all resolvers failed' }, { status: 502 });
    }
  },
};

/* ── DNS GET handler ───────────────────────────────────── */

import type { DnsUpstream } from './resolver';

async function handleDnsGet(
  url: URL,
  clientIp: string,
  upstreams: DnsUpstream[],
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const dnsParam = url.searchParams.get('dns');

  if (dnsParam) {
    return handleWireGet(dnsParam, clientIp, upstreams, env, ctx);
  }

  const name = url.searchParams.get('name');
  if (name) {
    const type = url.searchParams.get('type') || 'A';
    const dnssecOk = url.searchParams.get('do') === '1';
    return handleJsonGet(name, type, dnssecOk, clientIp, upstreams, env, ctx);
  }

  return new Response('Missing dns or name parameter', { status: 400 });
}

/* ── Shared wireformat pipeline (GET ?dns= and POST) ───── */

/**
 * Common wire path: abuse check → blocklist → cache → upstream → cache-fill.
 * `resolve` performs the upstream fetch on cache miss.
 */
async function handleWireQuery(
  queryBuffer: ArrayBuffer,
  clientIp: string,
  env: Env,
  ctx: ExecutionContext,
  resolve: () => Promise<{ response: Response; resolver: string; scoreHeader: string }>,
): Promise<Response> {
  const question = parseQuestion(queryBuffer);
  const queryDomain = question && question.qname.length > 0 ? question.qname : null;

  // 1. Abuse protection — synchronous, in-memory, checks AND records
  const abuse = checkWireAbuse(clientIp, queryDomain, queryBuffer);
  if (!abuse.allowed) {
    ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: false, abused: true }));
    return abuse.response!;
  }

  // 2. Blocklist
  if (queryDomain && await isBlocked(queryDomain, env.BLOCKLIST)) {
    ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: true, cached: false }));
    return buildBlockedWireResponse(queryBuffer);
  }

  // 3. Cache lookup (only for parseable questions)
  let cacheParts: WireCacheKeyParts | null = null;
  if (question) {
    cacheParts = {
      qname: question.qname,
      qtype: question.qtype,
      qclass: question.qclass,
      dnssecOk: parseEdnsDoFlag(queryBuffer),
      cdFlag: parseCdFlag(queryBuffer),
    };
    const hit = await getCachedWireResponse(cacheParts, queryBuffer);
    if (hit) {
      ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: true }));
      return hit;
    }
  }

  // 4. Upstream resolve
  ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: false }));
  const { response: res, resolver, scoreHeader } = await resolve();

  // 5. Buffer the body so we can cache it and return it
  const body = await res.arrayBuffer();
  if (cacheParts && res.ok) {
    ctx.waitUntil(cacheWireResponse(cacheParts, body));
  }

  return new Response(body, {
    status: res.status,
    headers: dnsWireHeaders(resolver, scoreHeader, abuse.flag),
  });
}

/* ── Wireformat GET (?dns=) ────────────────────────────── */

async function handleWireGet(
  dnsParam: string,
  clientIp: string,
  upstreams: DnsUpstream[],
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const queryBuffer = decodeDnsParam(dnsParam);

  if (!queryBuffer) {
    // Undecodable base64 — still rate-limit the caller, then pass through
    const abuse = checkWireAbuse(clientIp, null, new ArrayBuffer(0));
    if (!abuse.allowed) return abuse.response!;

    ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: false }));
    const { response: res, resolver, scoreHeader } = await resolveWireGet(dnsParam, upstreams);
    return new Response(res.body, {
      status: res.status,
      headers: dnsWireHeaders(resolver, scoreHeader, abuse.flag),
    });
  }

  return handleWireQuery(queryBuffer, clientIp, env, ctx, () =>
    resolveWireGet(dnsParam, upstreams),
  );
}

/* ── JSON GET (?name=&type=) ───────────────────────────── */

async function handleJsonGet(
  name: string,
  type: string,
  dnssecOk: boolean,
  clientIp: string,
  upstreams: DnsUpstream[],
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // 1. Abuse protection — synchronous, in-memory, checks AND records
  const abuse = checkJsonAbuse(clientIp, name, type);
  if (!abuse.allowed) {
    ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: false, abused: true }));
    return abuse.response!;
  }

  // 2. Blocklist
  if (await isBlocked(name, env.BLOCKLIST)) {
    ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: true, cached: false }));
    return buildBlockedJsonResponse();
  }

  // 3. Cache
  const cached = await getCachedResponse(name, type, dnssecOk);
  if (cached) {
    ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: true }));
    return cached;
  }

  // 4. Upstream resolve + cache fill
  const { body, response: res, resolver, scoreHeader } = await resolveJson(name, type, upstreams, dnssecOk);
  ctx.waitUntil(cacheResponse(name, type, res, body, dnssecOk));
  ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: false }));

  return new Response(body, {
    headers: dnsJsonHeaders(resolver, scoreHeader, abuse.flag),
  });
}

/* ── DNS POST handler ──────────────────────────────────── */

async function handleDnsPost(
  request: Request,
  clientIp: string,
  upstreams: DnsUpstream[],
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const body = await request.arrayBuffer();
  return handleWireQuery(body, clientIp, env, ctx, () =>
    resolveWirePost(body, upstreams),
  );
}
