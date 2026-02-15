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
import { isBlocked, buildBlockedJsonResponse, buildBlockedWireResponse, parseDomainFromWire } from './blocker';
import { handleAdmin } from './admin';
import { getCachedResponse, cacheResponse } from './cache';
import { recordQuery } from './stats';
import { resolveJson, resolveWireGet, resolveWirePost, getUpstreams } from './resolver';
import { checkJsonAbuse, checkWireAbuse, recordDnsQuery } from './abuse';
import { handleWhoAmI } from './whoami';
import { handleBlocklistPage, handleBlocklistTxt, handleBlocklistJson } from './blocklistViewer';
import { handleTransparency } from './transparency';
import { generateSetupPage } from './setup';
import { handleImpactApi } from './impactWidget';
import { getClientIp, detectLang, dnsWireHeaders, dnsJsonHeaders } from './utils';

export interface Env {
  BLOCKLIST?: KVNamespace;
  ADMIN_KEY?: string;
  ADMIN_ALLOWED_IPS?: string;
  UPSTREAM?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept, X-API-Key',
        },
      });
    }

    const url = new URL(request.url);
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

/* ── Wireformat GET (?dns=) ────────────────────────────── */

async function handleWireGet(
  dnsParam: string,
  clientIp: string,
  upstreams: DnsUpstream[],
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  let decoded: Uint8Array | null = null;
  let queryDomain: string | null = null;

  try {
    decoded = Uint8Array.from(
      atob(dnsParam.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    );
    queryDomain = parseDomainFromWire(decoded.buffer);
  } catch {
    // Decoding failed — pass through to upstream
  }

  let abuseFlag = 'clean';

  if (decoded) {
    const abuse = await checkWireAbuse(clientIp, queryDomain, decoded.buffer, env.BLOCKLIST);
    abuseFlag = abuse.flag;

    if (!abuse.allowed) {
      ctx.waitUntil(recordDnsQuery(clientIp, env.BLOCKLIST, true, abuse._record));
      ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: false, abused: true }));
      return abuse.response!;
    }

    ctx.waitUntil(recordDnsQuery(clientIp, env.BLOCKLIST, abuseFlag === 'suspicious', abuse._record));

    if (queryDomain && await isBlocked(queryDomain, env.BLOCKLIST)) {
      ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: true, cached: false }));
      return buildBlockedWireResponse(decoded.buffer);
    }
  }

  ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: false }));
  const { response: res, resolver, scoreHeader } = await resolveWireGet(dnsParam, upstreams);
  return new Response(res.body, {
    status: res.status,
    headers: dnsWireHeaders(resolver, scoreHeader, abuseFlag),
  });
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
  const abuse = await checkJsonAbuse(clientIp, name, type, env.BLOCKLIST);

  if (!abuse.allowed) {
    ctx.waitUntil(recordDnsQuery(clientIp, env.BLOCKLIST, true, abuse._record));
    ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: false, abused: true }));
    return abuse.response!;
  }

  ctx.waitUntil(recordDnsQuery(clientIp, env.BLOCKLIST, abuse.flag === 'suspicious', abuse._record));

  if (await isBlocked(name, env.BLOCKLIST)) {
    ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: true, cached: false }));
    return buildBlockedJsonResponse();
  }

  const cached = await getCachedResponse(name, type, dnssecOk);
  if (cached) {
    ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: true }));
    return cached;
  }

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
  const queryDomain = parseDomainFromWire(body);

  const abuse = await checkWireAbuse(clientIp, queryDomain, body, env.BLOCKLIST);

  if (!abuse.allowed) {
    ctx.waitUntil(recordDnsQuery(clientIp, env.BLOCKLIST, true, abuse._record));
    ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: false, abused: true }));
    return abuse.response!;
  }

  ctx.waitUntil(recordDnsQuery(clientIp, env.BLOCKLIST, abuse.flag === 'suspicious', abuse._record));

  if (queryDomain && await isBlocked(queryDomain, env.BLOCKLIST)) {
    ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: true, cached: false }));
    return buildBlockedWireResponse(body);
  }

  ctx.waitUntil(recordQuery(env.BLOCKLIST, { blocked: false, cached: false }));
  const { response: res, resolver, scoreHeader } = await resolveWirePost(body, upstreams);
  return new Response(res.body, {
    status: res.status,
    headers: dnsWireHeaders(resolver, scoreHeader, abuse.flag),
  });
}
