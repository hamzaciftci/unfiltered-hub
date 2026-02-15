/**
 * UnfilteredHub — Shared Utilities
 * Common helpers used across multiple modules.
 */

/* ── HTML / XML escaping ───────────────────────────────── */

export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* ── Client IP extraction ──────────────────────────────── */

export function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || '0.0.0.0';
}

/* ── Language detection ────────────────────────────────── */

export type Lang = 'tr' | 'en';

export function detectLang(
  url: URL,
  request: Request,
  defaultLang: Lang = 'en',
): Lang {
  const param = url.searchParams.get('lang');
  if (param === 'en') return 'en';
  if (param === 'tr') return 'tr';
  const accept = request.headers.get('Accept-Language') || '';
  if (accept.startsWith('tr')) return 'tr';
  return defaultLang;
}

/* ── DNS response header builder ───────────────────────── */

export function dnsJsonHeaders(
  resolver: string,
  scoreHeader: string,
  abuseFlag: string,
  cached: boolean = false,
): HeadersInit {
  return {
    'Content-Type': 'application/dns-json',
    'Access-Control-Allow-Origin': '*',
    'X-Cache': cached ? 'HIT' : 'MISS',
    'X-Resolver': resolver,
    'X-Resolver-Score': scoreHeader,
    'X-Abuse-Flag': abuseFlag,
  };
}

export function dnsWireHeaders(
  resolver: string,
  scoreHeader: string,
  abuseFlag: string,
): HeadersInit {
  return {
    'Content-Type': 'application/dns-message',
    'Access-Control-Allow-Origin': '*',
    'X-Resolver': resolver,
    'X-Resolver-Score': scoreHeader,
    'X-Abuse-Flag': abuseFlag,
  };
}
