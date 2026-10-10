/**
 * cerpspy - Background Service Worker (Manifest V3)
 * Streamlined orchestrator for:
 * 1. Top Search Bar: Search Volume, CPC, and 12-Month Trend (powered by KWScanner).
 * 2. SERP Badges: Ahrefs DR, Domain Age, and Young Website Badge.
 * 3. Local High-Performance 30-Day Cache.
 */

// Import active core utility modules
importScripts(
  'utils/domainRating.js',
  'utils/kwScanner.js',
  'utils/domainAge.js',
  'utils/seoInsights.js'
);

// Register global background resolution listener from domainAge.js
if (typeof setOnDomainAgeResolved === 'function') {
  setOnDomainAgeResolved(async (domain, bgAge) => {
    if (!bgAge || !bgAge.success || !bgAge.age) return;
    const cacheKey = `cache_${domain}`;
    const existing = domainMemoryCache.get(domain) || {};
    const bgInsights = evaluateSEOInsights(bgAge);
    const bgYoung = bgInsights?.isYoung ?? ((bgAge.age.totalMonths !== undefined ? bgAge.age.totalMonths : (bgAge.age.years * 12 + (bgAge.age.months || 0))) < 12);
    const bgAgeFormatted = formatDomainAgeShort(bgAge.age);
    const updated = {
      ...existing,
      domain,
      age: bgAge,
      insights: bgInsights,
      isYoung: bgYoung,
      ageFormatted: bgAgeFormatted,
      registrationDate: bgAge.registrationDate || null,
      agePending: false,
      timestamp: Date.now()
    };
    domainMemoryCache.set(domain, updated);
    await chrome.storage.local.set({
      [cacheKey]: {
        timestamp: Date.now(),
        data: updated
      }
    }).catch(() => {});

    // Broadcast live update to Google SERP tabs
    try {
      const tabs = await chrome.tabs.query({}).catch(() => []);
      for (const tab of tabs) {
        if (tab.id && tab.url && tab.url.includes('google.') && tab.url.includes('/search')) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'DOMAIN_DATA_UPDATED',
            domain,
            data: updated
          }).catch(() => {});
        }
      }
    } catch (_) {}
  });
}

const DEFAULT_SETTINGS = {
  kwScannerApiKey: '',
  ahrefsApiKey: '',
  // SERP Badges
  serpBadgesEnabled: true,
  showDomainRating: true,     // Ahrefs DR
  showDomainAge: true,        // Domain Age Pill
  showYoungBadge: true,       // Young Website Badge (< 1 year)
  // Search Bar Panel
  searchBarPanelEnabled: true,
  showVolume: true,
  showCpc: true,
  showCompetition: true,      // Google Ads paid competition (e.g. 0.00)
  showTrend: true,
  showExport: true,           // 1-Click SERP to CSV Export button
  showPaa: true,              // People Also Ask (PAA) Harvester button
  showBookmark: true,         // Bookmark / Save Keyword icon
  showOpportunity: true,      // SERP Opportunity & Weak Site Scanner pill
  showIntentClassifier: true, // Search Intent Classifier (Informational, Commercial, etc.)
  showSerpFilters: true,      // Instant client-side SERP filter toggles (DR <= 20, Young, No Forums)
  autoFetchKeywords: true,    // Credit Saver toggle: true = auto-fetch, false = on-demand click
  // Keyword Volume Factors
  targetCountry: 'global',      // 'global' (Worldwide Pool - KWScanner standard) | 'us' | 'uk' | 'ca' | 'au' | 'in' | 'nz' | 'za' | 'auto'
  kwNetwork: 'google_search_and_partners', // 'google_search_and_partners' (KWScanner standard) | 'google_search'
  // Cache TTL (default 30 days for maximum credit savings and instant sub-millisecond responses)
  cacheTtlHours: 720
};

/**
 * Retrieves user configuration from chrome.storage.local.
 */
async function getSettings() {
  const result = await chrome.storage.local.get('cerpspy_settings');
  const stored = result.cerpspy_settings || {};

  // Target country defaults to 'global' (KWScanner standard) unless user explicitly selected a manual country
  let targetCountry = DEFAULT_SETTINGS.targetCountry;
  if (stored.manualCountrySelected && stored.targetCountry) {
    targetCountry = stored.targetCountry;
  } else if (stored.targetCountry && stored.targetCountry !== 'auto') {
    targetCountry = stored.targetCountry;
  }

  // Network defaults to 'google_search_and_partners' (KWScanner standard)
  let kwNetwork = (stored.kwNetwork && stored.kwNetwork.trim())
    ? stored.kwNetwork.trim()
    : DEFAULT_SETTINGS.kwNetwork;

  const isKwDiscontinued = stored.kwScannerDiscontinued === true || stored.kwScannerApiKey === '';
  const isAhrefsDiscontinued = stored.ahrefsDiscontinued === true || stored.ahrefsApiKey === '';

  const kwScannerApiKey = isKwDiscontinued
    ? ''
    : ((stored.kwScannerApiKey && stored.kwScannerApiKey.trim())
        ? stored.kwScannerApiKey.trim()
        : DEFAULT_SETTINGS.kwScannerApiKey);

  const ahrefsApiKey = isAhrefsDiscontinued
    ? ''
    : ((stored.ahrefsApiKey && stored.ahrefsApiKey.trim())
        ? stored.ahrefsApiKey.trim()
        : DEFAULT_SETTINGS.ahrefsApiKey);

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    showCompetition: stored.showCompetition !== false,
    targetCountry,
    kwNetwork,
    kwScannerDiscontinued: isKwDiscontinued,
    kwScannerApiKey,
    ahrefsDiscontinued: isAhrefsDiscontinued,
    ahrefsApiKey
  };
}

// In-memory cache for ultra-fast instant 0ms responses within the service worker
const domainMemoryCache = new Map();
const inFlightRequests = new Map();
const inFlightKeywordRequests = new Map();

function getCacheKey(domain) {
  return `cache_${domain.toLowerCase().trim()}`;
}

/**
 * Normalizes a raw URL or domain string into a clean root domain (e.g. "https://blog.google.com/post" -> "google.com")
 */
function extractRootDomain(input) {
  if (!input || typeof input !== 'string') return '';
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//i, '');
  domain = domain.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  domain = domain.replace(/^www\./i, '');

  const parts = domain.split('.');
  if (parts.length <= 2) return domain;

  // Handle multi-part ccTLDs covering Tier 1, Tier 2, and Tier 3 countries globally (150+ extensions)
  const twoPartTlds = new Set([
    // UK & Ireland
    'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'ac.uk', 'gov.uk', 'sch.uk',
    // Australia & New Zealand
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
    'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz', 'geek.nz', 'school.nz',
    // South Asia
    'com.pk', 'org.pk', 'net.pk', 'edu.pk', 'gov.pk', 'gob.pk', 'gop.pk', 'gos.pk', 'gok.pk',
    'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in', 'ac.in', 'edu.in', 'res.in', 'gov.in',
    'com.bd', 'net.bd', 'org.bd', 'edu.bd', 'gov.bd', 'mil.bd', 'ac.bd',
    'com.np', 'org.np', 'edu.np', 'gov.np', 'net.np',
    'com.lk', 'org.lk', 'edu.lk', 'gov.lk', 'net.lk',
    // East Asia
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'ed.jp', 'ad.jp', 'gr.jp', 'lg.jp',
    'co.kr', 'ne.kr', 'or.kr', 're.kr', 'pe.kr', 'go.kr', 'mil.kr', 'ac.kr',
    'com.tw', 'net.tw', 'org.tw', 'idv.tw', 'game.tw', 'ebiz.tw', 'club.tw', 'edu.tw', 'gov.tw',
    'com.hk', 'net.hk', 'org.hk', 'idv.hk', 'edu.hk', 'gov.hk',
    // Southeast Asia
    'com.sg', 'net.sg', 'org.sg', 'edu.sg', 'gov.sg', 'per.sg',
    'com.my', 'net.my', 'org.my', 'gov.my', 'edu.my', 'mil.my', 'name.my',
    'com.ph', 'net.ph', 'org.ph', 'gov.ph', 'edu.ph', 'ngo.ph', 'mil.ph',
    'co.th', 'ac.th', 'go.th', 'in.th', 'mi.th', 'net.th', 'or.th',
    'co.id', 'net.id', 'org.id', 'ac.id', 'sch.id', 'go.id', 'mil.id', 'web.id', 'my.id', 'biz.id',
    'com.vn', 'net.vn', 'org.vn', 'edu.vn', 'gov.vn', 'int.vn', 'ac.vn', 'biz.vn', 'info.vn', 'name.vn', 'pro.vn',
    // Middle East
    'com.sa', 'net.sa', 'org.sa', 'gov.sa', 'med.sa', 'edu.sa', 'pub.sa', 'sch.sa',
    'com.ae', 'net.ae', 'org.ae', 'gov.ae', 'ac.ae', 'sch.ae', 'co.ae',
    'com.eg', 'net.eg', 'org.eg', 'gov.eg', 'edu.eg', 'sci.eg',
    'co.il', 'net.il', 'org.il', 'ac.il', 'gov.il', 'muni.il', 'idf.il', 'k12.il',
    'com.kw', 'net.kw', 'org.kw', 'edu.kw', 'gov.kw',
    'com.qa', 'net.qa', 'org.qa', 'edu.qa', 'gov.qa',
    'com.om', 'net.om', 'org.om', 'edu.om', 'gov.om',
    'com.bh', 'net.bh', 'org.bh', 'edu.bh', 'gov.bh',
    'com.jo', 'net.jo', 'org.jo', 'edu.jo', 'gov.jo',
    'com.lb', 'net.lb', 'org.lb', 'edu.lb', 'gov.lb',
    'com.tr', 'net.tr', 'org.tr', 'edu.tr', 'gov.tr', 'biz.tr', 'info.tr', 'tv.tr', 'gen.tr',
    // Africa
    'co.za', 'net.za', 'org.za', 'gov.za', 'ac.za', 'web.za',
    'com.ng', 'net.ng', 'org.ng', 'gov.ng', 'edu.ng', 'sch.ng', 'name.ng', 'mobi.ng',
    'co.ke', 'or.ke', 'ne.ke', 'go.ke', 'ac.ke', 'sc.ke', 'me.ke', 'mobi.ke', 'info.ke',
    'com.gh', 'edu.gh', 'gov.gh', 'org.gh', 'net.gh',
    'co.ug', 'or.ug', 'ac.ug', 'sc.ug', 'go.ug', 'ne.ug',
    'co.tz', 'or.tz', 'go.tz', 'ac.tz', 'sc.tz', 'ne.tz',
    'co.ma', 'net.ma', 'gov.ma', 'org.ma',
    // Latin America & Caribbean
    'com.br', 'net.br', 'org.br', 'adv.br', 'app.br', 'art.br', 'dev.br', 'edu.br', 'gov.br', 'ind.br', 'jus.br', 'leg.br', 'med.br',
    'com.mx', 'net.mx', 'org.mx', 'edu.mx', 'gob.mx',
    'com.ar', 'net.ar', 'org.ar', 'edu.ar', 'gob.ar', 'tur.ar',
    'com.co', 'net.co', 'org.co', 'nom.co', 'edu.co', 'gov.co',
    'com.pe', 'net.pe', 'org.pe', 'nom.pe', 'edu.pe', 'gob.pe',
    'co.cl', 'gob.cl', 'gov.cl',
    'com.ve', 'net.ve', 'org.ve', 'edu.ve', 'gob.ve',
    'com.ec', 'net.ec', 'org.ec', 'edu.ec', 'gob.ec',
    'com.uy', 'net.uy', 'org.uy', 'edu.uy', 'gub.uy',
    'com.bo', 'net.bo', 'org.bo', 'edu.bo', 'gob.bo',
    'com.py', 'net.py', 'org.py', 'edu.py', 'gov.py',
    'co.cr', 'ed.cr', 'fi.cr', 'go.cr', 'or.cr', 'sa.cr',
    'com.pa', 'net.pa', 'org.pa', 'edu.pa', 'gob.pa',
    'com.gt', 'net.gt', 'org.gt', 'edu.gt', 'gob.gt',
    'com.do', 'net.do', 'org.do', 'edu.do', 'gob.do',
    // Europe
    'com.es', 'nom.es', 'org.es', 'gob.es', 'edu.es',
    'com.pl', 'net.pl', 'org.pl', 'info.pl', 'biz.pl', 'edu.pl', 'gov.pl',
    'com.gr', 'net.gr', 'org.gr', 'edu.gr', 'gov.gr',
    'com.ua', 'net.ua', 'org.ua', 'edu.ua', 'gov.ua', 'in.ua', 'co.ua',
    'com.ru', 'net.ru', 'org.ru', 'pp.ru',
    'com.pt', 'edu.pt', 'gov.pt', 'org.pt',
    'gov.it', 'edu.it',
    'asso.fr', 'nom.fr', 'presse.fr', 'com.fr'
  ]);
  const lastTwo = parts.slice(-2).join('.');
  if (twoPartTlds.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/**
 * Preserves domain cache entries for maximum speed and credit savings.
 */
async function purgeIncompleteAgeCache() {
  return 0;
}

/**
 * Purges ephemeral keyword search cache.
 */
async function purgeSearchCache(reason = 'search') {
  try {
    const all = await chrome.storage.local.get(null);
    const staleKeys = Object.keys(all).filter(k => k.startsWith('kw_'));
    if (staleKeys.length > 0) {
      await chrome.storage.local.remove(staleKeys);
      console.log(`[cerpspy] Purged ${staleKeys.length} search keyword cache entries (${reason}).`);
    }
    return staleKeys.length;
  } catch (err) {
    return 0;
  }
}

/**
 * Scans cache and purges any entries with 0 search volume or failed lookups.
 */
async function purgeZeroVolumeCache() {
  try {
    const all = await chrome.storage.local.get(null);
    const keysToRemove = [];
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith('kw_')) {
        const item = v?.data;
        if (!item || !item.success || item.searchVolume === 0 || item.searchVolume === '0') {
          keysToRemove.push(k);
        }
      }
    }
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`[cerpspy] Purged ${keysToRemove.length} zero-volume keyword cache entries.`);
    }
    return keysToRemove.length;
  } catch (err) {
    return 0;
  }
}

/**
 * Completely wipes all domain and keyword cache entries from storage and memory.
 */
async function purgeAllCache(reason = 'manual') {
  try {
    domainMemoryCache.clear();
    inFlightRequests.clear();
    inFlightKeywordRequests.clear();
    const all = await chrome.storage.local.get(null);
    const staleKeys = Object.keys(all).filter(k => k.startsWith('cache_') || k.startsWith('kw_'));
    if (staleKeys.length > 0) {
      await chrome.storage.local.remove(staleKeys);
      console.log(`[cerpspy] Fully purged ${staleKeys.length} cache entries (${reason}).`);
    }
    return staleKeys.length;
  } catch (err) {
    return 0;
  }
}

/**
 * Fetches SEO data for a domain in REAL TIME: Ahrefs DR and Domain Age.
 */
async function fetchDomainIntelligence(rawDomain, forceRefresh = false, context = 'serp') {
  const domain = extractRootDomain(rawDomain);
  if (!domain) {
    return { error: 'Invalid domain specified' };
  }

  const cacheKey = getCacheKey(domain);
  const settings = await getSettings();
  const isLiveMode = !settings.cacheTtlHours || Number(settings.cacheTtlHours) === 0;

  const wantsAge = (settings.showDomainAge !== false || settings.showYoungBadge !== false);
  const isAhrefsActive = settings.showDomainRating !== false && !settings.ahrefsDiscontinued && Boolean(settings.ahrefsApiKey);
  const discontinuedDr = { success: false, valid: false, discontinued: true, error: 'Ahrefs API token discontinued or not provided' };

  // 1. Check in-memory cache for instant 0ms response
  if (!forceRefresh && domainMemoryCache.has(domain)) {
    const memData = domainMemoryCache.get(domain);
    const isDrMissing = isAhrefsActive && (!memData?.dr || !memData.dr.success || memData.dr.dr === null || memData.dr.dr === undefined);
    const isAgeMissing = wantsAge && (!memData?.age || !memData.age.success || !memData.age.age);
    if (memData && !isDrMissing && !isAgeMissing) {
      const dr = isAhrefsActive ? memData.dr : discontinuedDr;
      return { ...memData, dr, cached: true };
    }
  }

  // 2. Read persistent storage cache for instant 0ms response
  let cachedPayload = null;
  if (!forceRefresh && !isLiveMode) {
    const cachedEntry = await chrome.storage.local.get(cacheKey);
    if (cachedEntry && cachedEntry[cacheKey]) {
      const entry = cachedEntry[cacheKey];
      const age = Date.now() - (entry.timestamp || 0);
      const ttlMs = (Number(settings.cacheTtlHours) || 720) * 3600 * 1000;
      const isDrMissing = isAhrefsActive && (!entry.data?.dr || !entry.data.dr.success || entry.data.dr.dr === null || entry.data.dr.dr === undefined);
      const isAgeMissing = wantsAge && (!entry.data?.age || !entry.data.age.success || !entry.data.age.age);
      if (age < ttlMs && entry.data && !isDrMissing && !isAgeMissing) {
        const dr = isAhrefsActive ? entry.data.dr : discontinuedDr;
        domainMemoryCache.set(domain, { ...entry.data, dr });
        return { ...entry.data, dr, cached: true };
      }
      if (entry.data) {
        cachedPayload = entry.data;
      }
    }
  }

  if (!cachedPayload && domainMemoryCache.has(domain)) {
    cachedPayload = domainMemoryCache.get(domain);
  }

  // De-duplicate in-flight requests for the same domain
  if (inFlightRequests.has(domain)) {
    return inFlightRequests.get(domain);
  }

  const fetchPromise = (async () => {
    try {
      // DR handling: if Ahrefs discontinued or no key, mark discontinued immediately!
      let drPromise;
      if (settings.ahrefsDiscontinued || !settings.ahrefsApiKey) {
        drPromise = Promise.resolve({ success: false, valid: false, discontinued: true, error: 'Ahrefs API token discontinued or not provided' });
      } else if (cachedPayload?.dr?.success && cachedPayload.dr.dr !== null && cachedPayload.dr.dr !== undefined) {
        drPromise = Promise.resolve(cachedPayload.dr);
      } else if (settings.showDomainRating !== false) {
        drPromise = getDomainRating(domain, settings.ahrefsApiKey);
      } else {
        drPromise = Promise.resolve(null);
      }

      // Domain Age: Reuse cached Age if available, else race with 2500ms ceiling
      let agePromise = null;
      let fastAgePromise;
      if (cachedPayload?.age?.success && cachedPayload.age.age) {
        fastAgePromise = Promise.resolve(cachedPayload.age);
      } else if (wantsAge) {
        agePromise = getDomainAge(domain);
        fastAgePromise = Promise.race([
          agePromise,
          new Promise(resolve => setTimeout(() => resolve(null), 2500))
        ]);
      } else {
        fastAgePromise = Promise.resolve(null);
      }

      // Parallel execution: DR and Fast Age
      const [drResult, ageResult] = await Promise.all([
        drPromise,
        fastAgePromise
      ]);

      // Evaluate SEO lifecycle stage and domain age properties
      const insights = (ageResult && ageResult.success) ? evaluateSEOInsights(ageResult) : null;
      const isYoung = insights?.isYoung ?? (ageResult?.age ? ((ageResult.age.totalMonths !== undefined ? ageResult.age.totalMonths : (ageResult.age.years * 12 + (ageResult.age.months || 0))) < 12) : false);
      const ageFormatted = (ageResult && ageResult.success && ageResult.age) ? formatDomainAgeShort(ageResult.age) : null;

      const payload = {
        domain,
        dr: drResult,
        age: ageResult,
        insights,
        isYoung,
        ageFormatted,
        registrationDate: ageResult?.registrationDate || null,
        agePending: wantsAge && (!ageResult || ageResult.pending === true),
        fetchedAt: new Date().toISOString(),
        timestamp: Date.now()
      };

      // Update in-memory cache immediately
      domainMemoryCache.set(domain, payload);

      // Persist to storage cache if DR or Age succeeded
      const hasAnyValidData = (drResult && drResult.success) || (ageResult && ageResult.success);
      if (!isLiveMode && hasAnyValidData) {
        await chrome.storage.local.set({
          [cacheKey]: {
            timestamp: Date.now(),
            data: payload
          }
        }).catch(() => {});
      }

      // If Domain Age was still resolving when the fast ceiling fired, continue in background and broadcast!
      if (wantsAge && (!ageResult || ageResult.pending === true) && agePromise) {
        agePromise.then(async (bgAge) => {
          if (bgAge && bgAge.success && bgAge.age) {
            const bgInsights = evaluateSEOInsights(bgAge);
            const bgYoung = bgInsights?.isYoung ?? ((bgAge.age.totalMonths !== undefined ? bgAge.age.totalMonths : (bgAge.age.years * 12 + (bgAge.age.months || 0))) < 12);
            const bgAgeFormatted = formatDomainAgeShort(bgAge.age);
            const existing = domainMemoryCache.get(domain) || payload;
            const updated = {
              ...existing,
              domain,
              age: bgAge,
              insights: bgInsights,
              isYoung: bgYoung,
              ageFormatted: bgAgeFormatted,
              registrationDate: bgAge.registrationDate || null,
              agePending: false
            };
            domainMemoryCache.set(domain, updated);
            await chrome.storage.local.set({
              [cacheKey]: {
                timestamp: Date.now(),
                data: updated
              }
            }).catch(() => {});

            // Broadcast live update to Google SERP tabs (any regional Google domain e.g. .com, .es, .co.uk)
            try {
              const tabs = await chrome.tabs.query({}).catch(() => []);
              for (const tab of tabs) {
                if (tab.id && tab.url && tab.url.includes('google.') && tab.url.includes('/search')) {
                  chrome.tabs.sendMessage(tab.id, {
                    action: 'DOMAIN_DATA_UPDATED',
                    domain,
                    data: updated
                  }).catch(() => {});
                }
              }
            } catch (_) {}
          }
        }).catch(() => {});
      }

      return { ...payload, cached: false };
    } finally {
      inFlightRequests.delete(domain);
    }
  })();

  inFlightRequests.set(domain, fetchPromise);
  return fetchPromise;
}

/**
 * Message routing dispatcher.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    return false;
  }

  let isHandled = false;
  const safeSend = (payload) => {
    if (isHandled) return;
    isHandled = true;
    try {
      sendResponse(payload);
    } catch (e) {
      // Channel closed by sender (e.g. popup closed)
    }
  };

  (async () => {
    try {
      switch (message.action) {
        case 'GET_DOMAIN_DATA': {
          const force = message.forceRefresh === true;
          const context = message.context || 'serp';
          const data = await fetchDomainIntelligence(message.domain, force, context);
          safeSend({ success: true, data });
          break;
        }

        case 'GET_BATCH_DOMAIN_DATA': {
          const rawDomains = Array.isArray(message.domains) ? message.domains : [];
          const force = message.forceRefresh === true;
          const context = message.context || 'serp';

          // Process unique domains in parallel with fast return
          const unique = [...new Set(rawDomains.filter(Boolean))];
          const results = await Promise.all(
            unique.map(d => fetchDomainIntelligence(d, force, context))
          );
          const resultMap = {};
          results.forEach(r => {
            if (r && r.domain) resultMap[r.domain] = r;
          });
          safeSend({ success: true, data: resultMap });
          break;
        }

        case 'REFRESH_DOMAIN_DATA': {
          const context = message.context || 'popup';
          const data = await fetchDomainIntelligence(message.domain, true, context);
          safeSend({ success: true, data });
          break;
        }

        case 'GET_KEYWORD_DATA': {
          const rawKw = (message.keyword || '').trim();
          if (!rawKw) {
            safeSend({ success: false, error: 'Empty keyword provided' });
            break;
          }

          const kw = (typeof cleanKeywordForVolume === 'function')
            ? cleanKeywordForVolume(rawKw)
            : rawKw.replace(/^["']|["']$/g, '').trim().toLowerCase();

          const settings = await getSettings();
          if (settings.kwScannerDiscontinued || !settings.kwScannerApiKey) {
            safeSend({
              success: false,
              discontinued: true,
              error: 'KWScanner API is discontinued or key is missing',
              data: { discontinued: true, searchVolume: null, cpc: null, success: false }
            });
            break;
          }

          const targetCountrySetting = settings.targetCountry || 'global';
          const network = (message.network === 'google_search' || settings.kwNetwork === 'google_search')
            ? 'google_search'
            : 'google_search_and_partners';

          let country = 'global';
          if (targetCountrySetting && targetCountrySetting !== 'auto') {
            country = normalizeKWLocation(targetCountrySetting);
          } else if (message.country && message.country !== 'auto') {
            country = normalizeKWLocation(message.country);
          }

          const isLiveMode = !settings.cacheTtlHours || Number(settings.cacheTtlHours) === 0;
          const cacheKey = `kw_${country}_${network}_${kw}`;

          // If force refresh, purge stale cache keys immediately
          if (message.forceRefresh) {
            await chrome.storage.local.remove([cacheKey, `kw_${country}_${kw}`, `kw_${kw}`]).catch(() => {});
          }

          // Check persistent storage cache for this exact country and network (0ms instant response)
          if (!message.forceRefresh && !isLiveMode) {
            const cached = await chrome.storage.local.get([cacheKey]);
            const entry = cached?.[cacheKey];
            if (entry && entry.data && entry.data.success) {
              const cachedVol = entry.data.searchVolume;
              const kwCacheTtlMs = (Number(settings.cacheTtlHours) || 720) * 3600000;
              if (cachedVol !== undefined && cachedVol !== null && (Date.now() - entry.timestamp < kwCacheTtlMs)) {
                safeSend({ success: true, data: entry.data, cached: true });
                break;
              }
            }
          }

          // Re-use in-flight lookup for the exact same country, network, and keyword
          if (!message.forceRefresh && inFlightKeywordRequests.has(cacheKey)) {
            try {
              const result = await inFlightKeywordRequests.get(cacheKey);
              if (result && result.success) {
                safeSend({ success: true, data: result, cached: true });
              } else {
                safeSend({ success: false, error: result?.error || 'Keyword lookup failed', data: result });
              }
            } catch (infErr) {
              safeSend({ success: false, error: infErr.message || 'In-flight keyword lookup failed' });
            }
            break;
          }

          const fetchKwPromise = (async () => {
            try {
              const kwScannerKey = (settings.kwScannerApiKey || '').trim();
              const kwData = await getKWScannerKeywordData(kw, country, kwScannerKey, 2, network);

              const enriched = {
                ...(kwData || { success: false, error: 'No data' }),
                poolLocation: country,
                network: network
              };

              // Cache strictly under its country and network key (never pollute other countries)
              if (!isLiveMode && kwData && kwData.success) {
                await chrome.storage.local.set({
                  [cacheKey]: { timestamp: Date.now(), data: enriched }
                }).catch(() => {});
              }
              return enriched;
            } finally {
              inFlightKeywordRequests.delete(cacheKey);
            }
          })();

          inFlightKeywordRequests.set(cacheKey, fetchKwPromise);
          const enrichedResult = await fetchKwPromise;
          if (enrichedResult && enrichedResult.success) {
            safeSend({ success: true, data: enrichedResult, cached: false });
          } else {
            safeSend({
              success: false,
              error: enrichedResult?.error || 'Keyword lookup failed',
              data: enrichedResult
            });
          }
          break;
        }

        case 'GET_RELATED_KEYWORDS': {
          const rawQuery = (message.query || '').trim();
          if (!rawQuery) {
            safeSend({ success: false, items: [], error: 'No query provided' });
            break;
          }
          const settings = await getSettings();
          const country = normalizeKWLocation(message.country || settings.targetCountry || 'global');
          const network = (message.network === 'google_search' || settings.kwNetwork === 'google_search')
            ? 'google_search'
            : 'google_search_and_partners';
          const kwScannerKey = (settings.kwScannerApiKey || '').trim();
          const relatedData = await getKWScannerRelatedKeywords(rawQuery, country, kwScannerKey, 1, network);
          safeSend(relatedData);
          break;
        }

        case 'GET_KWSCANNER_ACCOUNT': {
          const settings = await getSettings();
          const customKey = (message.apiKey !== undefined && message.apiKey !== null)
            ? message.apiKey.trim()
            : (settings.kwScannerDiscontinued ? '' : (settings.kwScannerApiKey || '').trim());
          if (!customKey) {
            safeSend({ success: false, valid: false, discontinued: true, error: 'KWScanner API token discontinued or not provided' });
            break;
          }
          const result = await getKWScannerAccount(customKey);
          safeSend(result);
          break;
        }

        case 'TEST_KWSCANNER_AUTH': {
          const testKey = (message.apiKey || '').trim();
          const result = await getKWScannerAccount(testKey);
          safeSend(result);
          break;
        }

        case 'TEST_AHREFS_AUTH': {
          const testKey = (message.apiKey || '').trim();
          try {
            const res = await fetchAhrefsDirect('google.com', testKey);
            if (res.status === 200) {
              safeSend({ success: true, message: 'Valid Ahrefs API Token (Connected)' });
            } else if (res.status === 401 || res.status === 403) {
              safeSend({ success: false, error: 'Unauthorized: Invalid Ahrefs Token' });
            } else if (res.status === 429) {
              safeSend({ success: false, error: 'Rate limit reached on Ahrefs' });
            } else {
              safeSend({ success: false, error: `Ahrefs returned status ${res.status}` });
            }
          } catch (e) {
            safeSend({ success: false, error: e.message || 'Connection failed' });
          }
          break;
        }


        case 'CLEAR_CACHE': {
          const purged = await purgeAllCache('manual user purge');
          safeSend({ success: true, cleared: purged });
          break;
        }

        case 'GET_SETTINGS': {
          const settings = await getSettings();
          safeSend({ success: true, settings });
          break;
        }

        case 'SAVE_SETTINGS': {
          const current = await getSettings();
          const raw = message.settings || {};

          const isKwDiscontinued = (raw.kwScannerDiscontinued !== undefined)
            ? Boolean(raw.kwScannerDiscontinued)
            : (raw.kwScannerApiKey === '' ? true : Boolean(current.kwScannerDiscontinued));

          const isAhrefsDiscontinued = (raw.ahrefsDiscontinued !== undefined)
            ? Boolean(raw.ahrefsDiscontinued)
            : (raw.ahrefsApiKey === '' ? true : Boolean(current.ahrefsDiscontinued));

          const kwScannerApiKey = isKwDiscontinued
            ? ''
            : ((raw.kwScannerApiKey !== undefined)
                ? (raw.kwScannerApiKey || '').trim()
                : current.kwScannerApiKey);

          const ahrefsApiKey = isAhrefsDiscontinued
            ? ''
            : ((raw.ahrefsApiKey !== undefined)
                ? (raw.ahrefsApiKey || '').trim()
                : current.ahrefsApiKey);

          const updated = {
            ...current,
            ...raw,
            targetCountry: (raw.targetCountry && raw.targetCountry.trim()) || current.targetCountry || DEFAULT_SETTINGS.targetCountry,
            kwNetwork: (raw.kwNetwork && raw.kwNetwork.trim()) || current.kwNetwork || DEFAULT_SETTINGS.kwNetwork,
            kwScannerDiscontinued: isKwDiscontinued,
            kwScannerApiKey,
            ahrefsDiscontinued: isAhrefsDiscontinued,
            ahrefsApiKey
          };
          await chrome.storage.local.set({ cerpspy_settings: updated });

          // If the KWScanner API key changed, purge ALL cached keyword data
          // (fetched with the old key) from chrome.storage.local AND in-memory maps.
          // Without this, stale/wrong volume numbers from the previous key are served
          // for up to 30 days (the cache TTL).
          const kwKeyChanged = (updated.kwScannerApiKey || '').trim() !== (current.kwScannerApiKey || '').trim();
          const countryChanged = (updated.targetCountry || '') !== (current.targetCountry || '');
          const networkChanged = (updated.kwNetwork || '') !== (current.kwNetwork || '');
          if (kwKeyChanged || countryChanged || networkChanged) {
            try {
              const all = await chrome.storage.local.get(null);
              const kwCacheKeys = Object.keys(all).filter(k => k.startsWith('kw_'));
              if (kwCacheKeys.length > 0) {
                await chrome.storage.local.remove(kwCacheKeys);
                console.log(`[cerpspy] Purged ${kwCacheKeys.length} keyword cache entries after settings change.`);
              }
            } catch (e) {}
            inFlightKeywordRequests.clear();
          }

          // If the Ahrefs key changed, purge cached domain data
          const ahrefsKeyChanged = (updated.ahrefsApiKey || '').trim() !== (current.ahrefsApiKey || '').trim() || updated.ahrefsDiscontinued !== current.ahrefsDiscontinued;
          if (ahrefsKeyChanged) {
            try {
              const all = await chrome.storage.local.get(null);
              const domainCacheKeys = Object.keys(all).filter(k => k.startsWith('cache_') || k.startsWith('domain_'));
              if (domainCacheKeys.length > 0) {
                await chrome.storage.local.remove(domainCacheKeys);
                console.log(`[cerpspy] Purged ${domainCacheKeys.length} domain cache entries after Ahrefs API key update.`);
              }
            } catch (e) {}
            domainMemoryCache.clear();
            inFlightRequests.clear();
            if (typeof clearDrCache === 'function') {
              clearDrCache();
            } else if (self.clearDrCache) {
              self.clearDrCache();
            }
          }

          // Broadcast to active search tabs for live update using safe regex check
          try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
              if (tab.id && tab.url && /https?:\/\/(www\.)?google\.[a-z.]+\/search/i.test(tab.url)) {
                chrome.tabs.sendMessage(tab.id, { action: 'SETTINGS_UPDATED', settings: updated }, () => {
                  if (chrome.runtime.lastError) {
                    // Non-fatal if tab has not injected script yet
                  }
                });
              }
            }
          } catch (e) {}

          safeSend({ success: true, settings: updated });
          break;
        }

        default:
          safeSend({ success: false, error: `Unknown action: ${message.action}` });
      }
    } catch (err) {
      safeSend({ success: false, error: err.message || 'Internal error' });
    }
  })();

  return true;
});

// Clean up stale cache on install and migrate to standard KWScanner defaults
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const current = await chrome.storage.local.get('cerpspy_settings');
    const stored = current.cerpspy_settings || {};
    if (!stored.targetCountry || stored.targetCountry === 'auto') {
      stored.targetCountry = 'global';
    }
    if (!stored.kwNetwork || stored.kwNetwork === 'google_search') {
      stored.kwNetwork = 'google_search_and_partners';
    }
    if (stored.showCompetition === undefined) {
      stored.showCompetition = true;
    }
    // No default keys shipped — users provide their own API tokens
    await chrome.storage.local.set({ cerpspy_settings: { ...DEFAULT_SETTINGS, ...stored } });
    await purgeAllCache('onInstalled');
  } catch (err) {
    // Non-fatal install handler notice
  }
});

// Purge 0-volume entries safely on startup
chrome.runtime.onStartup.addListener(async () => {
  purgeZeroVolumeCache().catch(() => {});
});

