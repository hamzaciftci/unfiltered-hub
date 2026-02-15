/**
 * UnfilteredHub — Core Blocklist
 * Curated set of the most common ad, tracker, and malware domains.
 * Works without KV — always available as a fallback.
 *
 * Sources: Steven Black unified hosts, AdGuard DNS filter, OISD small
 */

export const CORE_BLOCKLIST: Set<string> = new Set([
  // ── Google Ads / DoubleClick ──
  'pagead2.googlesyndication.com',
  'pagead.googlesyndication.com',
  'googlesyndication.com',
  'googleadservices.com',
  'googleads.g.doubleclick.net',
  'doubleclick.net',
  'ad.doubleclick.net',
  'static.doubleclick.net',
  'tpc.googlesyndication.com',
  'adservice.google.com',
  'adservice.google.com.tr',
  'www.googleadservices.com',
  'partner.googleadservices.com',
  'afs.googlesyndication.com',
  'ade.googlesyndication.com',

  // ── Google Analytics / Tag Manager ──
  'google-analytics.com',
  'www.google-analytics.com',
  'ssl.google-analytics.com',
  'googletagmanager.com',
  'www.googletagmanager.com',
  'googletagservices.com',

  // ── Facebook / Meta Ads & Tracking ──
  'pixel.facebook.com',
  'an.facebook.com',
  'ads.facebook.com',
  'www.facebook.com.tr',
  'tr.facebook.com',
  'ad.atdmt.com',
  'graph.facebook.com',

  // ── Amazon Ads ──
  'aax.amazon-adsystem.com',
  'z-na.amazon-adsystem.com',
  'amazon-adsystem.com',
  'aax-us-iad.amazon.com',
  'fls-na.amazon.com',
  'unagi.amazon.com',

  // ── Microsoft / Bing Ads ──
  'bat.bing.com',
  'c.bing.com',
  'c.msn.com',
  'ads.msn.com',
  'a-0001.a-msedge.net',
  'choice.microsoft.com',
  'choice.microsoft.com.nsatc.net',
  'telemetry.microsoft.com',
  'vortex.data.microsoft.com',
  'settings-win.data.microsoft.com',
  'compatexchange.cloudapp.net',
  'corp.sts.microsoft.com',
  'diagnostics.support.microsoft.com',
  'i1.services.social.microsoft.com',
  'feedback.microsoft-hohm.com',
  'watson.microsoft.com',
  'watson.ppe.telemetry.microsoft.com',
  'watson.telemetry.microsoft.com',

  // ── Twitter / X Ads ──
  'ads-api.twitter.com',
  'ads.twitter.com',
  'analytics.twitter.com',
  't.co',

  // ── TikTok Analytics ──
  'analytics.tiktok.com',
  'ads.tiktok.com',
  'log.tiktokv.com',
  'mon.tiktokv.com',

  // ── Criteo ──
  'dis.criteo.com',
  'gum.criteo.com',
  'static.criteo.net',
  'bidder.criteo.com',
  'cas.criteo.com',
  'cat.fr.eu.criteo.com',

  // ── Taboola ──
  'trc.taboola.com',
  'nr-data.net',
  'cdn.taboola.com',
  'api.taboola.com',

  // ── Outbrain ──
  'widgets.outbrain.com',
  'amplify.outbrain.com',
  'log.outbrain.com',

  // ── AppNexus / Xandr ──
  'ib.adnxs.com',
  'adnxs.com',
  'prebid.adnxs.com',
  'secure.adnxs.com',

  // ── Yahoo / Oath / Verizon Media ──
  'ads.yahoo.com',
  'analytics.yahoo.com',
  'geo.yahoo.com',
  'udc.yahoo.com',
  'udcm.yahoo.com',

  // ── Adobe Analytics / Marketing ──
  'demdex.net',
  'dpm.demdex.net',
  'omtrdc.net',
  'everesttech.net',
  '2o7.net',

  // ── DoubleVerify / IAS / MOAT ──
  'cdn.doubleverify.com',
  'tps.doubleverify.com',
  'pixel.adsafeprotected.com',
  'fw.adsafeprotected.com',
  'moatads.com',
  'z.moatads.com',

  // ── Tracking / Fingerprinting ──
  'tags.bluekai.com',
  'stags.bluekai.com',
  'bkrtx.com',
  'scorecardresearch.com',
  'sb.scorecardresearch.com',
  'b.scorecardresearch.com',
  'idsync.rlcdn.com',
  'id5-sync.com',
  'cm.g.doubleclick.net',
  'match.adsrvr.org',
  'sync.outbrain.com',
  'pixel.rubiconproject.com',
  'fastclick.net',
  'eus.rubiconproject.com',
  'optimized-by.rubiconproject.com',
  'sync.search.spotxchange.com',
  'hb.spotxchange.com',

  // ── Hotjar / FullStory / Session Replay ──
  'script.hotjar.com',
  'static.hotjar.com',
  'insights.hotjar.com',
  'vars.hotjar.com',
  'rs.fullstory.com',
  'edge.fullstory.com',

  // ── Mixpanel / Segment / Amplitude ──
  'api.mixpanel.com',
  'cdn.mxpnl.com',
  'api.segment.io',
  'cdn.segment.com',
  'api.amplitude.com',
  'cdn.amplitude.com',
  'api2.amplitude.com',

  // ── Crazy Egg / Optimizely / VWO ──
  'script.crazyegg.com',
  'cdn.optimizely.com',
  'logx.optimizely.com',
  'dev.visualwebsiteoptimizer.com',

  // ── Ad Networks (misc) ──
  'serving-sys.com',
  'bs.serving-sys.com',
  'adform.net',
  'track.adform.net',
  'smartadserver.com',
  'pubmatic.com',
  'ads.pubmatic.com',
  'image2.pubmatic.com',
  'hbopenbid.pubmatic.com',
  'openx.net',
  'us-u.openx.net',
  'rtb.openx.net',
  'ssp.yahoo.com',
  'advertising.com',
  'pixel.advertising.com',
  'mathtag.com',
  'pixel.mathtag.com',
  'adsrvr.org',
  'match.adsrvr.org',
  'insight.adsrvr.org',
  'casalemedia.com',
  'ad.casalemedia.com',
  'mediamath.com',
  'pixel.mediamath.com',
  'track.searchignite.com',
  'quantserve.com',
  'pixel.quantserve.com',
  'quantcount.com',
  'exelator.com',
  'load.s-exelator.com',
  'addthis.com',
  's7.addthis.com',
  'sharethrough.com',
  'cdn.sharethrough.com',
  'contextweb.com',

  // ── Popup / Redirect Networks ──
  'propellerads.com',
  'ad.propellerads.com',
  'popcash.net',
  'popads.net',
  'adcash.com',
  'clickadu.com',
  'trafficjunky.com',
  'juicyads.com',
  'exoclick.com',
  'hilltopads.com',

  // ── Malware / Phishing / Scam ──
  'malware-check.disconnect.me',
  'tracking.disconnect.me',
  'services.disconnect.me',

  // ── Turkish Ad Networks ──
  'reklam.mynet.com',
  'ads.yenisafak.com',
  'reklam.hurriyet.com.tr',
  'ad.mncdn.com',

  // ── Data Brokers / Identity ──
  'liveintent.com',
  'idx.liveintent.com',
  'ad.liveintent.com',
  'ib.mookie1.com',
  'mookie1.com',
  'liveramp.com',
  'pippio.com',
  'rlcdn.com',

  // ── Mobile Ad SDKs ──
  'app.adjust.com',
  'view.adjust.com',
  'app.appsflyer.com',
  'launches.appsflyer.com',
  'conversions.appsflyer.com',
  'events.kochava.com',
  'control.kochava.com',
  'mobileapptracking.com',
  'app.link',
  'branchster.link',
  'bnc.lt',

  // ── Telemetry / Crash Reporting ──
  'o.clarity.ms',
  'c.clarity.ms',
  'sentry.io',
  'browser.sentry-cdn.com',
  'ingest.sentry.io',
  'bugsnag.com',
  'notify.bugsnag.com',
  'sessions.bugsnag.com',
  'fire-data.crashlytics.com',
  'settings.crashlytics.com',

  // ── Social Widgets / Tracking ──
  'connect.facebook.net',
  'platform.twitter.com',
  'cdn.syndication.twimg.com',
  'platform.linkedin.com',
  'snap.licdn.com',
  'px.ads.linkedin.com',
  'widgets.pinterest.com',
  'ct.pinterest.com',
  'log.pinterest.com',
  'trk.pinterest.com',

  // ── Consent / Cookie Banners (tracking portion) ──
  'bat.r.msn.com',
  'a.bat.bing.com',

  // ── Fraud / Bot Detection (tracking) ──
  'cdn.perimeterx.net',
  'collector.perimeterx.net',
  'collector-cdn.github.com',

  // ── Content Recommendations (tracking) ──
  'beacon.krxd.net',
  'usermatch.krxd.net',
  'consumer.krxd.net',
  'cdn.krxd.net',
  'p.adsymptotic.com',
  'c.amazon-adsystem.com',

  // ── Video Ads ──
  'imasdk.googleapis.com',
  'vid.springserve.com',
  'search.spotxchange.com',
  'sync.search.spotxchange.com',

  // ── Email Tracking ──
  'pixel.app.returnpath.net',
  'sendgrid.net',
  'links.m.mimecast.com',

  // ── Crypto Mining ──
  'coinhive.com',
  'coin-hive.com',
  'authedmine.com',
  'minero.cc',
  'crypto-loot.com',
  'cryptoloot.pro',
  'jsecoin.com',

  // ── Porn / Adult Ad Networks ──
  'tsyndicate.com',
  'syndication.realsrv.com',
  'a.realsrv.com',

  // ── Known Malicious ──
  'zvelo.com',
  'count.getclicky.com',
  'in.getclicky.com',
  'static.getclicky.com',
  'cnzz.com',
  'w.cnzz.com',
  's.cnzz.com',
  'c.cnzz.com',
  'core.cnzz.net',
  'tongji.baidu.com',
  'hm.baidu.com',
  'pos.baidu.com',
  'cpro.baidu.com',

  // ── Misc Trackers ──
  'b-code.liadm.com',
  'p.liadm.com',
  'rp.liadm.com',
  'gscounters.us1.gigya.com',
  'cdns.gigya.com',
  'socialize.us1.gigya.com',
  'data.flurry.com',
  'adlog.com.com',
  'clicktale.net',
  'cdn.clicktale.net',
  'mouseflow.com',
  'cdn.mouseflow.com',
  'luckyorange.com',
  'cdn.luckyorange.com',
  'w1.luckyorange.com',
  'tctm.co',
  'go.toutapp.com',
  'pardot.com',
  'pi.pardot.com',
  'cdn.pardot.com',
  'piwik.pro',
  'hipay-tpp.com',
  'ct.capterra.com',
  'ct.capterra.com',
  'adroll.com',
  'd.adroll.com',
  's.adroll.com',
  'bidswitch.net',
  'x.bidswitch.net',
  'ad.turn.com',
  'ad.amgdgt.com',
  'pixel.advertising.com',

  // ── SmartTV / IoT Telemetry ──
  'samsungads.com',
  'config.samsungads.com',
  'device-metrics-us.amazon.com',
  'device-metrics-us-2.amazon.com',
  'fls-eu.amazon.com',
  'fls-na.amazon.com',
  'unagi-na.amazon.com',

  // ── DNS Rebinding / Canary Domains ──
  'use-application-dns.net',
]);

/** Number of domains in the core blocklist */
export const CORE_BLOCKLIST_SIZE = CORE_BLOCKLIST.size;
