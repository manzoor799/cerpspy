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
 * Fast public fallback to KWScanner DR endpoint when Ahrefs direct rate-limits or times out.
 */
async function fetchKWScannerDR(cleanTarget) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

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

    if (!response.ok) return null;
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
  } catch (e) {}
  return null;
}

/**
 * Fetches Domain Rating from Ahrefs API with automatic retry and instant backup resolver.
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
      let response = null;
      try {
        response = await fetchAhrefsDirect(cleanTarget, apiKey);
      } catch (netErr) {
        // Fallback to KWScanner DR immediately on network/timeout error
        const backup = await fetchKWScannerDR(cleanTarget);
        if (backup) {
          drMemoryCache.set(cleanTarget, backup);
          return backup;
        }
        throw netErr;
      }

      // If rate-limited (429) or non-200, fallback immediately to KWScanner DR (no sleep wait)
      if (response.status === 429 || !response.ok) {
        const backup = await fetchKWScannerDR(cleanTarget);
        if (backup) {
          drMemoryCache.set(cleanTarget, backup);
          return backup;
        }
      }

      if (response.status === 401 || response.status === 403) {
        const backup = await fetchKWScannerDR(cleanTarget);
        if (backup) {
          drMemoryCache.set(cleanTarget, backup);
          return backup;
        }
        return {
          success: false,
          domain: cleanTarget,
          error: 'Ahrefs API unauthorized. Please verify your API key.'
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          domain: cleanTarget,
          error: 'Ahrefs API rate limit reached. Please wait a moment.'
        };
      }

      if (!response.ok) {
        return {
          success: false,
          domain: cleanTarget,
          error: `Ahrefs API returned status ${response.status}`
        };
      }

      const data = await response.json();
      if (data && data.domain_rating && typeof data.domain_rating.domain_rating !== 'undefined') {
        const rawScore = data.domain_rating.domain_rating;
        const score = Math.round(rawScore * 10) / 10;
        const tier = getDRTier(score);

        const result = {
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
        drMemoryCache.set(cleanTarget, result);
        return result;
      }

      const backup = await fetchKWScannerDR(cleanTarget);
      if (backup) {
        drMemoryCache.set(cleanTarget, backup);
        return backup;
      }

      return {
        success: false,
        domain: cleanTarget,
        error: 'Unexpected Ahrefs API response format'
      };
    } catch (err) {
      const backup = await fetchKWScannerDR(cleanTarget);
      if (backup) {
        drMemoryCache.set(cleanTarget, backup);
        return backup;
      }

      if (err.name === 'AbortError') {
        return { success: false, domain: cleanTarget, error: 'Ahrefs request timed out' };
      }
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
  self.getDRTier = getDRTier;
  self.clearDrCache = clearDrCache;
}
if (typeof module !== 'undefined') {
  module.exports = { getDomainRating, fetchKWScannerDR, getDRTier, clearDrCache, DEFAULT_AHREFS_KEY };
}
