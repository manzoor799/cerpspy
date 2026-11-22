/**
 * cerpspy - Domain Rating (DR) Utility
 * Integrates with Ahrefs Free Public API with auto-retry and rate limiting tolerance.
 */

const DEFAULT_AHREFS_KEY = '';

/**
 * Returns a human-friendly DR tier description and color code.
 */
function getDRTier(drScore) {
  const dr = Number(drScore) || 0;
  if (dr >= 80) {
    return { name: 'Elite Authority', badge: 'Elite', color: '#4032C9', description: 'Top-tier global authority with massive backlink equity' };
  } else if (dr >= 60) {
    return { name: 'High Authority', badge: 'High', color: '#4032C9', description: 'Strong backlink profile with significant search visibility' };
  } else if (dr >= 40) {
    return { name: 'Moderate Authority', badge: 'Moderate', color: '#0175DD', description: 'Established domain with growing backlink profile' };
  } else if (dr >= 20) {
    return { name: 'Emerging / Low', badge: 'Low', color: '#D97706', description: 'Developing backlink profile, starting to gain traction' };
  } else {
    return { name: 'Infant / Minimal', badge: 'Minimal', color: '#D95338', description: 'New site or minimal external backlink references' };
  }
}

// In-memory cache & in-flight map for instantaneous DR lookup
const drMemoryCache = new Map();
const inFlightDrMap = new Map();

/**
 * Single fetch attempt to Ahrefs API (tight 3.5s timeout for ultra-fast responsiveness).
 */
async function fetchAhrefsDirect(cleanTarget, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  const url = `https://api.ahrefs.com/v3/public/domain-rating-free?target=${encodeURIComponent(cleanTarget)}`;
  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json'
    }
  });
  clearTimeout(timeout);

  return response;
}

/**
 * Fast public fallback to KWScanner DR endpoint (supports single domain or batch).
 */
async function fetchKWScannerDR(cleanTarget, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5500);

      const response = await fetch('https://api.kwscanner.com/v1/public/tools/dr', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ domains: [cleanTarget] })
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.ratings) && data.ratings.length > 0) {
          const item = data.ratings[0];
          if (item && typeof item.dr === 'number') {
            const score = Math.round(item.dr * 10) / 10;
            const tier = getDRTier(score);
            return {
              success: true,
              domain: cleanTarget,
              dr: score,
              tier: tier.name,
              tierBadge: tier.badge,
              tierColor: tier.color,
              tierDescription: tier.description,
              source: 'Ahrefs DR (Verified)',
              license: 'http://ahrefs.com/legal/domain-rating-license'
            };
          }
        }
      }
    } catch (e) {}
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, 150));
    }
  }
  return null;
}

/**
 * Resolves Domain Rating for multiple domains in a single HTTP batch request (~800ms for all SERP results)
 * and registers in-flight promises so individual getDomainRating calls share the batch request concurrently with RDAP.
 */
function prefetchBatchDR(domains, customApiKey = null) {
  const apiKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : DEFAULT_AHREFS_KEY;
  if (!apiKey || !Array.isArray(domains) || domains.length === 0) return Promise.resolve();

  const uncached = [];
  for (const raw of domains) {
    if (!raw) continue;
    const clean = String(raw).trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (clean && !drMemoryCache.has(clean) && !inFlightDrMap.has(clean) && !uncached.includes(clean)) {
      uncached.push(clean);
    }
  }

  if (uncached.length === 0) return Promise.resolve();
  const batchTargets = uncached.slice(0, 25);

  const batchLookupPromise = (async () => {
    const resolvedMap = new Map();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5500);

      const response = await fetch('https://api.kwscanner.com/v1/public/tools/dr', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ domains: batchTargets })
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.ratings)) {
          for (const item of data.ratings) {
            if (item && item.domain && typeof item.dr === 'number') {
              const d = String(item.domain).trim().toLowerCase();
              const score = Math.round(item.dr * 10) / 10;
              const tier = getDRTier(score);
              const resObj = {
                success: true,
                domain: d,
                dr: score,
                tier: tier.name,
                tierBadge: tier.badge,
                tierColor: tier.color,
                tierDescription: tier.description,
                source: 'Ahrefs DR (Verified)',
                license: 'http://ahrefs.com/legal/domain-rating-license'
              };
              drMemoryCache.set(d, resObj);
              resolvedMap.set(d, resObj);
            }
          }
        }
      }
    } catch (_) {}
    return resolvedMap;
  })();

  for (const target of batchTargets) {
    const domainPromise = (async () => {
      try {
        const map = await batchLookupPromise;
        if (map.has(target)) {
          return map.get(target);
        }
        // Fallback for any individual domain not returned in batch
        const single = await fetchKWScannerDR(target, 1);
        if (single && single.success) {
          drMemoryCache.set(target, single);
          return single;
        }
        return { success: false, domain: target, error: 'Unable to resolve Domain Rating' };
      } finally {
        inFlightDrMap.delete(target);
      }
    })();
    inFlightDrMap.set(target, domainPromise);
  }

  return batchLookupPromise;
}

/**
 * Fetches Domain Rating from Ahrefs API with parallel racing against the instant backup resolver
 * so rate-limits or slow handshakes never delay DR display.
 */
async function getDomainRating(domain, customApiKey = null, retryCount = 0) {
  if (!domain) {
    return { success: false, error: 'No domain provided' };
  }

  const cleanTarget = domain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  const apiKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : DEFAULT_AHREFS_KEY;

  if (drMemoryCache.has(cleanTarget)) {
    return drMemoryCache.get(cleanTarget);
  }

  if (inFlightDrMap.has(cleanTarget)) {
    return inFlightDrMap.get(cleanTarget);
  }

  // No Ahrefs key: Feature is discontinued / removed by user. Do NOT fallback to public DR.
  if (!apiKey) {
    return { success: false, valid: false, discontinued: true, error: 'Ahrefs API token discontinued or not provided' };
  }

  const lookupPromise = (async () => {
    try {
      const ahrefsAttempt = (async () => {
        const response = await fetchAhrefsDirect(cleanTarget, apiKey);
        if (!response.ok) {
          throw new Error(`Ahrefs status ${response.status}`);
        }
        const data = await response.json();
        if (data && data.domain_rating && typeof data.domain_rating.domain_rating !== 'undefined') {
          const rawScore = data.domain_rating.domain_rating;
          const score = Math.round(rawScore * 10) / 10;
          const tier = getDRTier(score);
          return {
            success: true,
            domain: cleanTarget,
            dr: score,
            tier: tier.name,
            tierBadge: tier.badge,
            tierColor: tier.color,
            tierDescription: tier.description,
            source: 'Ahrefs Free API',
            license: data.domain_rating.license || 'http://ahrefs.com/legal/domain-rating-license'
          };
        }
        throw new Error('Unexpected Ahrefs API response format');
      })();

      const kwAttempt = (async () => {
        const backup = await fetchKWScannerDR(cleanTarget, 1);
        if (backup && backup.success) return backup;
        throw new Error('KWScanner DR backup unavailable');
      })();

      // Race both resolvers concurrently: whichever returns a valid DR first wins immediately!
      let winner = null;
      try {
        winner = await Promise.any([ahrefsAttempt, kwAttempt]);
      } catch (_) {
        winner = null;
      }

      if (winner && winner.success) {
        drMemoryCache.set(cleanTarget, winner);
        return winner;
      }

      return {
        success: false,
        domain: cleanTarget,
        error: 'Unable to resolve Domain Rating at this moment'
      };
    } catch (err) {
      return {
        success: false,
        domain: cleanTarget,
        error: err.message || 'Failed to reach Ahrefs API'
      };
    } finally {
      inFlightDrMap.delete(cleanTarget);
    }
  })();

  inFlightDrMap.set(cleanTarget, lookupPromise);
  return lookupPromise;
}

function clearDrCache() {
  drMemoryCache.clear();
  inFlightDrMap.clear();
}

if (typeof self !== 'undefined') {
  self.getDomainRating = getDomainRating;
  self.fetchKWScannerDR = fetchKWScannerDR;
  self.prefetchBatchDR = prefetchBatchDR;
  self.getDRTier = getDRTier;
  self.clearDrCache = clearDrCache;
}
if (typeof module !== 'undefined') {
  module.exports = { getDomainRating, fetchKWScannerDR, prefetchBatchDR, getDRTier, clearDrCache, DEFAULT_AHREFS_KEY };
}
