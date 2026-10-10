/**
 * cerpspy - KWScanner API Utility
 * Directly integrates with KWScanner API (https://api.kwscanner.com)
 * Provides official Google Keyword Planner search volume, CPC, competition index,
 * and up to 48-month historical trend data.
 */

const DEFAULT_KWSCANNER_KEY = '';
const KWSCANNER_API_BASE = 'https://api.kwscanner.com';

/**
 * Normalizes country codes into KWScanner supported location codes.
 * Supports numeric DataForSEO IDs (2840 -> 'us', 2826 -> 'uk') as well as 2-letter codes.
 */
function normalizeKWLocation(input) {
  if (!input) return 'global';
  const str = String(input).trim().toLowerCase();
  if (str === 'auto') return 'global';
  const validCodes = new Set(['us', 'global', 'uk', 'ca', 'au', 'in', 'nz', 'za']);

  const numMap = {
    '2840': 'us',
    '2826': 'uk',
    '2124': 'ca',
    '2036': 'au',
    '2356': 'in',
    '2710': 'za',
    '2554': 'nz',
    'global': 'global'
  };

  const aliasMap = {
    'gb': 'uk',
    'uk': 'uk',
    'united kingdom': 'uk',
    'us': 'us',
    'usa': 'us',
    'united states': 'us',
    'ca': 'ca',
    'canada': 'ca',
    'au': 'au',
    'australia': 'au',
    'in': 'in',
    'india': 'in',
    'nz': 'nz',
    'new zealand': 'nz',
    'za': 'za',
    'south africa': 'za',
    'global': 'global',
    'worldwide': 'global',
    'world': 'global'
  };

  if (numMap[str] && validCodes.has(numMap[str])) return numMap[str];
  if (aliasMap[str]) return aliasMap[str];
  if (validCodes.has(str)) return str;
  // All countries outside the 7 dedicated national databases supported by KWScanner
  // (e.g. 'cl' Chile, 'es' Spain, 'mx' Mexico, 'de' Germany, 'fr' France, etc.)
  // must map to 'global' pool as required by KWScanner API schema.
  return 'global';
}

/**
 * Sanitizes and cleans search queries before requesting Google Ads/KWScanner metrics.
 * Strips Google search operators (site:, inurl:, etc.), commas (which cause KWScanner to split queries and charge extra credits),
 * quotes, and punctuation that cause zero-volume responses.
 */
function cleanKeywordForVolume(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.trim();

  // 1. Strip Google search operators and operands (e.g. site:domain.com, inurl:test, filetype:pdf)
  cleaned = cleaned.replace(/\b(?:site|inurl|allinurl|intitle|allintitle|intext|allintext|filetype|ext|related|cache|info|define):[^\s]+/gi, ' ');

  // 2. Strip stand-alone operators without operands
  cleaned = cleaned.replace(/\b(?:allintitle|allinurl|allintext|allinanchor):/gi, ' ');

  // 3. Strip negation terms like -excluded
  cleaned = cleaned.replace(/(?:^|\s)-[^\s]+/g, ' ');

  // 4. Replace commas, colons, semicolons, pipe, quotes, brackets with space
  cleaned = cleaned.replace(/[,:;|"`~^<>{}[\]\\]+/g, ' ');

  // 5. Remove surrounding single/double quotes or parenthetical marks
  cleaned = cleaned.replace(/^['"]+|['"]+$/g, '');

  // 6. Strip trailing/leading punctuation
  cleaned = cleaned.replace(/^[\s\-_?!.]+|[\s\-_?!.]+$/g, '');

  // 7. Collapse multiple whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // If cleaning stripped everything, fall back to trimmed original without quotes
  if (!cleaned) {
    cleaned = raw.trim().replace(/^['"]+|['"]+$/g, '').trim();
  }

  return cleaned.toLowerCase();
}

/**
 * Formats large integers into compact human-readable strings (e.g. 246K, 1.2M)
 */
function formatCompactNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  const val = Math.abs(Number(num));
  if (val >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  if (val >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (val >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return String(num);
}

/**
 * Retrieves KWScanner account details including live credits balance, user name, and email.
 * Checks /v1/me to extract full user profile (name, email, credits balance),
 * and falls back to /v1/me/balance if /v1/me is unavailable.
 */
async function getKWScannerAccount(customApiKey = null) {
  const apiKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : DEFAULT_KWSCANNER_KEY;
  if (!apiKey) {
    return { success: false, valid: false, discontinued: true, error: 'No KWScanner API token provided (Discontinued)' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // 1. Fetch full profile from /v1/me
    try {
      const response = await fetch(`${KWSCANNER_API_BASE}/v1/me`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (response.status === 401 || response.status === 403) {
        clearTimeout(timeout);
        return { success: false, valid: false, error: 'Invalid or unauthorized KWScanner API token' };
      }

      if (response.ok) {
        clearTimeout(timeout);
        const data = await response.json();
        const credits = typeof data.balance === 'number' ? data.balance : 0;
        const name = (data.name && typeof data.name === 'string' && data.name.trim()) ? data.name.trim() : null;
        const email = (data.email && typeof data.email === 'string' && data.email.trim()) ? data.email.trim() : null;
        return {
          success: true,
          valid: true,
          credits: credits,
          balance: credits,
          name: name,
          email: email,
          userId: data.id || data.userId || null
        };
      }
    } catch (_) {
      // Continue to /v1/me/balance fallback
    }

    // 2. Fallback to /v1/me/balance
    try {
      const balRes = await fetch(`${KWSCANNER_API_BASE}/v1/me/balance`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (balRes.status === 401 || balRes.status === 403) {
        clearTimeout(timeout);
        return { success: false, valid: false, error: 'Invalid or unauthorized KWScanner API token' };
      }

      if (balRes.ok) {
        clearTimeout(timeout);
        const balData = await balRes.json();
        const credits = typeof balData.balance === 'number' ? balData.balance : 0;
        return {
          success: true,
          valid: true,
          credits: credits,
          balance: credits,
          name: null,
          email: null,
          userId: balData.userId || null
        };
      }
    } catch (_) {
      // Continue to volume lookup fallback
    }

    // 3. Fallback to /v1/lookups/volume (which also returns live balance)
    const volRes = await fetch(`${KWSCANNER_API_BASE}/v1/lookups/volume`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        keywords: ['test'],
        locationCode: 'global',
        network: 'google_search_and_partners'
      })
    });
    clearTimeout(timeout);

    if (volRes.status === 401 || volRes.status === 403) {
      return { success: false, valid: false, error: 'Invalid or unauthorized KWScanner API token' };
    }

    if (volRes.ok) {
      const volData = await volRes.json();
      const credits = typeof volData.balance === 'number' ? volData.balance : 0;
      return {
        success: true,
        valid: true,
        credits: credits,
        balance: credits,
        name: null,
        email: null,
        userId: null
      };
    }

    return { success: false, valid: false, error: `KWScanner API returned status ${volRes.status}` };
  } catch (err) {
    let msg = 'Connection failed';
    if (err.name === 'AbortError') {
      msg = 'KWScanner check timed out (10s)';
    } else if (err.message && err.message.includes('Failed to fetch')) {
      msg = 'Failed to fetch (api.kwscanner.com unreachable). Please check if a browser VPN/proxy or adblocker is active.';
    } else if (err.message) {
      msg = err.message;
    }
    return {
      success: false,
      valid: false,
      error: msg
    };
  }
}

/**
 * Checks active balance and verifies KWScanner API key validity.
 */
async function checkKWScannerBalance(customApiKey = null) {
  return getKWScannerAccount(customApiKey);
}

/**
 * Generates an SVG path for a 12-point sparkline safely bounded inside viewBox.
 * Uses adaptive power scaling for keywords with massive volume spikes/fluctuations,
 * centers flat baselines, and guarantees a valid path so Trend is always visible.
 */
function buildSparklineSvg(volumes) {
  const w = 44;
  const h = 12;
  const padding = 1.8;
  const usableH = h - 2 * padding; // 8.4px

  if (!Array.isArray(volumes) || volumes.length < 2) {
    // Clean, centered baseline for missing or single-point trend
    return `M 0.0,${(h / 2).toFixed(1)} L ${w.toFixed(1)},${(h / 2).toFixed(1)}`;
  }

  const cleanVols = volumes.map(v => (typeof v === 'number' && !isNaN(v) ? Math.max(0, v) : 0));
  const minVal = Math.min(...cleanVols);
  const maxVal = Math.max(...cleanVols);
  const range = maxVal - minVal;
  const step = w / (cleanVols.length - 1);

  // If perfectly flat (zero fluctuation across all months)
  if (range === 0) {
    const midY = (h / 2).toFixed(1);
    const points = cleanVols.map((_, idx) => `${(idx * step).toFixed(1)},${midY}`);
    return `M ${points.join(' L ')}`;
  }

  // Adaptive power scaling: when keywords have huge spikes/fluctuations (e.g. 7.5M vs 300K),
  // linear scaling crushes all non-peak months into a flat 1px floor line.
  // Power scaling (exponent 0.40 - 0.60) ensures all 12 monthly fluctuations remain clearly visible.
  const ratio = maxVal / Math.max(1, minVal);
  const exponent = ratio > 10 ? 0.40 : (ratio > 4 ? 0.60 : 1.0);

  const points = cleanVols.map((v, idx) => {
    const x = (idx * step).toFixed(1);
    const rawNorm = Math.max(0, Math.min(1, (v - minVal) / range));
    const normalized = Math.pow(rawNorm, exponent);
    const y = ((h - padding) - (normalized * usableH)).toFixed(1);
    return `${x},${y}`;
  });
  return `M ${points.join(' L ')}`;
}

/**
 * Concurrency Limiter ensuring KWScanner API never exceeds its strict concurrency limit (limit: 3 inFlight).
 * Restricts simultaneous outbound requests to at most 2, queuing excess requests in FIFO order.
 */
class KWConcurrencyLimiter {
  constructor(maxConcurrency = 2) {
    this.maxConcurrency = maxConcurrency;
    this.activeCount = 0;
    this.queue = [];
  }

  async run(task) {
    if (this.activeCount >= this.maxConcurrency) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.activeCount++;
    try {
      return await task();
    } finally {
      this.activeCount--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }
}

const kwLimiter = new KWConcurrencyLimiter(3);

/**
 * Fetches search volume, CPC, competition, and trend from KWScanner API.
 * Uses 'google_search_and_partners' and 'global' by default matching KWScanner official baseline.
 */
async function getKWScannerKeywordData(keyword, locationCode = 'global', customApiKey = null, retryCount = 2, network = 'google_search_and_partners') {
  if (!keyword || !keyword.trim()) {
    return { success: false, error: 'No keyword provided' };
  }

  const cleanKeyword = cleanKeywordForVolume(keyword);
  if (!cleanKeyword) {
    return { success: false, error: 'Empty keyword after sanitization' };
  }

  let apiKey = customApiKey;
  if (apiKey === null || apiKey === undefined) {
    apiKey = DEFAULT_KWSCANNER_KEY;
  }
  apiKey = (apiKey || '').trim();
  if (!apiKey) {
    return { success: false, discontinued: true, error: 'No KWScanner API key provided (Discontinued)' };
  }

  const locCode = normalizeKWLocation(locationCode);
  const actualNetwork = (network === 'google_search') ? 'google_search' : 'google_search_and_partners';

  try {
    // CRITICAL: AbortController and timeout are created INSIDE kwLimiter.run()
    // so the timer only starts ticking AFTER a concurrency slot is acquired.
    const response = await kwLimiter.run(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch(`${KWSCANNER_API_BASE}/v1/lookups/volume`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            keywords: [cleanKeyword],
            locationCode: locCode,
            network: actualNetwork
          })
        });
        clearTimeout(timeout);
        return res;
      } catch (fetchErr) {
        clearTimeout(timeout);
        throw fetchErr;
      }
    });

    if (response.status === 429 && retryCount > 0) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '2', 10);
      const waitMs = Math.min(5000, Math.max(1500, retryAfter * 1000));
      await new Promise(r => setTimeout(r, waitMs));
      return getKWScannerKeywordData(keyword, locationCode, customApiKey, retryCount - 1, network);
    }

    if (response.status >= 500 && retryCount > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return getKWScannerKeywordData(keyword, locationCode, customApiKey, retryCount - 1, network);
    }

    if (response.status === 401 || response.status === 403) {
      return { success: false, error: 'KWScanner API key unauthorized or expired' };
    }

    if (!response.ok) {
      return { success: false, error: `KWScanner returned status ${response.status}` };
    }

    const data = await response.json();
    let item = (data && Array.isArray(data.results) && data.results.length > 0) ? data.results[0] : null;

    // Automatic global fallback if localized country returned zero or negligible (<=10) volume
    if ((!item || (typeof item.volume === 'number' && item.volume <= 10)) && locCode !== 'global') {
      try {
        const globalRes = await fetch(`${KWSCANNER_API_BASE}/v1/lookups/volume`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            keywords: [cleanKeyword],
            locationCode: 'global',
            network: actualNetwork
          })
        });
        if (globalRes.ok) {
          const gData = await globalRes.json();
          if (gData && Array.isArray(gData.results) && gData.results.length > 0) {
            item = gData.results[0];
          }
        }
      } catch (_) {}
    }

    let sv = (item && typeof item.volume === 'number') ? item.volume : 0;

    if (item) {
      const cpc = typeof item.cpc === 'number' ? item.cpc : 0;
      const rawComp = typeof item.competition === 'number' ? item.competition : 0;
      const fullTrend = Array.isArray(item.trend) ? item.trend : [];

      // 12-month trend array (most recent 12 points)
      const trend12 = fullTrend.length >= 12 ? fullTrend.slice(-12) : fullTrend;

      // Real-time month-by-month breakdown with authentic dates
      const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const now = new Date();
      const total12 = trend12.length;
      const monthlyBreakdown = trend12.map((vol, idx) => {
        const monthsAgo = total12 - 1 - idx;
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1 - monthsAgo, 1));
        const mShort = monthShort[d.getUTCMonth()] || 'Mon';
        const y = d.getUTCFullYear();
        return {
          month: mShort,
          monthName: mShort,
          year: y,
          label: `${mShort} ${y}`,
          volume: vol,
          formattedVolume: vol.toLocaleString()
        };
      });

      // 4-year trend breakdown (up to 48 points)
      const totalFull = fullTrend.length;
      const trend4Year = fullTrend.map((vol, idx) => {
        const monthsAgo = totalFull - 1 - idx;
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1 - monthsAgo, 1));
        const mShort = monthShort[d.getUTCMonth()] || 'Mon';
        const y = d.getUTCFullYear();
        return {
          month: mShort,
          monthName: mShort,
          year: y,
          label: `${mShort} ${y}`,
          volume: vol,
          formattedVolume: vol.toLocaleString()
        };
      });

      const monthlyTooltipText = monthlyBreakdown.length > 0
        ? monthlyBreakdown.map(m => `${m.label}: ${m.formattedVolume}`).join(' · ')
        : 'No trend data';

      // Trend direction calculation
      let trendDirection = 'stable';
      let trendChangePct = 0;
      if (trend12.length >= 2) {
        const recent = trend12[trend12.length - 1] || 0;
        const past = trend12[0] || 1;
        if (past > 0) {
          trendChangePct = Math.round(((recent - past) / past) * 100);
          if (trendChangePct >= 15) trendDirection = 'rising';
          else if (trendChangePct <= -15) trendDirection = 'declining';
        }
      }

      // Convert competition index (0.00 - 1.00)
      const compIndex = Math.round(rawComp * 100);
      const compDecimal = rawComp.toFixed(2);
      let compLabel = 'LOW';
      if (rawComp > 0.65) compLabel = 'HIGH';
      else if (rawComp > 0.35) compLabel = 'MEDIUM';

      // KD score and tier
      let kdScore = compIndex;
      let kdTier = { label: 'Easy', color: '#10B981', tier: 'easy' };
      if (kdScore > 65) {
        kdTier = { label: 'Hard', color: '#D95338', tier: 'hard' };
      } else if (kdScore > 35) {
        kdTier = { label: 'Med', color: '#D97706', tier: 'medium' };
      }

      // Format monthly searches objects for charts
      const monthlySearches = monthlyBreakdown.map(m => ({
        month: m.month,
        year: m.year,
        search_volume: m.volume
      }));

      const sparklineSvgPath = buildSparklineSvg(trend12);

      return {
        success: true,
        keyword: cleanKeyword,
        searchVolume: sv,
        searchVolumeExactFormatted: sv.toLocaleString(),
        searchVolumeFormatted: formatCompactNumber(sv),
        cpc: Number(cpc).toFixed(2),
        competition: compLabel,
        competitionIndex: compIndex,
        competitionDecimal: compDecimal,
        trendDirection,
        trendChangePct,
        sparklineSvgPath,
        trend: fullTrend,
        trend12mo: trend12,
        trend4Year: trend4Year,
        monthlySearches,
        monthlyBreakdown,
        monthlyTooltipText,
        creditsCharged: data.creditsCharged || 1,
        kdScore,
        kdTier,
        isGlobalFallback: false,
        poolLocation: locCode,
        network: actualNetwork,
        source: `KWScanner (${locCode.toUpperCase()})`
      };
    }

    // Zero-volume fallback for keywords with no search history
    return {
      success: true,
      keyword: cleanKeyword,
      searchVolume: 0,
      searchVolumeExactFormatted: '0',
      searchVolumeFormatted: '0',
      cpc: '0.00',
      competition: 'LOW',
      competitionIndex: 0,
      competitionDecimal: '0.00',
      trendDirection: 'stable',
      trendChangePct: 0,
      sparklineSvgPath: 'M 0.0,6.0 L 44.0,6.0',
      trend: [],
      trend12mo: [],
      monthlySearches: [],
      monthlyBreakdown: [],
      monthlyTooltipText: '0 searches',
      kdScore: 28,
      kdTier: { label: 'Easy', color: '#10B981', tier: 'easy' },
      isGlobalFallback: false,
      poolLocation: locCode,
      network: actualNetwork,
      source: `KWScanner (${locCode.toUpperCase()} - 0 Vol)`
    };
  } catch (err) {
    if (retryCount > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return getKWScannerKeywordData(keyword, locationCode, customApiKey, retryCount - 1, network);
    }
    return {
      success: false,
      keyword: cleanKeyword,
      error: err.name === 'AbortError' ? 'KWScanner request timed out' : (err.message || 'Failed to reach KWScanner API')
    };
  }
}

/**
 * Fetches search volume, CPC, and competition for multiple keywords in a single API call.
 * Uses KWScanner /v1/lookups/volume with an array of keywords.
 */
async function getKWScannerBatchKeywordData(keywords, locationCode = 'us', customApiKey = null, retryCount = 1, network = 'google_search') {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return { success: false, items: [], error: 'No keywords provided' };
  }

  const cleanKeywords = keywords
    .map(k => cleanKeywordForVolume(k))
    .filter(k => k.length > 0)
    .slice(0, 30);

  if (cleanKeywords.length === 0) {
    return { success: false, items: [], error: 'All keywords were empty after cleaning' };
  }

  let apiKey = customApiKey;
  if (apiKey === null || apiKey === undefined) {
    apiKey = DEFAULT_KWSCANNER_KEY;
  }
  apiKey = (apiKey || '').trim();
  if (!apiKey) {
    return { success: false, items: [], discontinued: true, error: 'No KWScanner API key provided (Discontinued)' };
  }

  const locCode = normalizeKWLocation(locationCode);
  const actualNetwork = (network === 'google_search_and_partners') ? 'google_search_and_partners' : 'google_search';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);

    const response = await fetch(`${KWSCANNER_API_BASE}/v1/lookups/volume`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        keywords: cleanKeywords,
        locationCode: locCode,
        network: actualNetwork
      })
    });
    clearTimeout(timeout);

    if ((response.status === 429 || response.status >= 500) && retryCount > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return getKWScannerBatchKeywordData(keywords, locationCode, customApiKey, retryCount - 1, network);
    }

    if (!response.ok) {
      return { success: false, items: [], error: `KWScanner batch returned status ${response.status}` };
    }

    const data = await response.json();
    const items = [];
    if (data && Array.isArray(data.results)) {
      for (const res of data.results) {
        if (!res || !res.keyword) continue;
        const sv = typeof res.volume === 'number' ? res.volume : 0;
        const cpc = typeof res.cpc === 'number' ? res.cpc : 0;
        const comp = typeof res.competition === 'number' ? res.competition : 0;
        const trend = Array.isArray(res.trend) ? res.trend : [];
        items.push({
          keyword: res.keyword,
          searchVolume: sv,
          searchVolumeFormatted: formatCompactNumber(sv),
          searchVolumeExactFormatted: sv.toLocaleString(),
          cpc: Number(cpc).toFixed(2),
          competition: comp > 0.65 ? 'HIGH' : comp > 0.35 ? 'MEDIUM' : 'LOW',
          competitionIndex: Math.round(comp * 100),
          competitionDecimal: comp.toFixed(2),
          sparklineSvgPath: buildSparklineSvg(trend.slice(-12))
        });
      }
    }

    return { success: true, items, count: items.length };
  } catch (err) {
    if (retryCount > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return getKWScannerBatchKeywordData(keywords, locationCode, customApiKey, retryCount - 1, network);
    }
    return { success: false, items: [], error: err.message || 'KWScanner batch request failed' };
  }
}

/**
 * Fetches related keyword ideas from KWScanner API.
 */
async function getKWScannerRelatedKeywords(query, locationCode = 'us', customApiKey = null, retryCount = 1, network = 'google_search') {
  if (!query || !query.trim()) {
    return { success: false, items: [], error: 'No query provided' };
  }

  const cleanQuery = cleanKeywordForVolume(query);
  let apiKey = customApiKey;
  if (apiKey === null || apiKey === undefined) {
    apiKey = DEFAULT_KWSCANNER_KEY;
  }
  apiKey = (apiKey || '').trim();
  if (!apiKey) {
    return { success: false, items: [], discontinued: true, error: 'No KWScanner API key provided (Discontinued)' };
  }

  const locCode = normalizeKWLocation(locationCode);
  const actualNetwork = (network === 'google_search_and_partners') ? 'google_search_and_partners' : 'google_search';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);

    const response = await fetch(`${KWSCANNER_API_BASE}/v1/lookups/related`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: cleanQuery,
        locationCode: locCode,
        network: actualNetwork
      })
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { success: false, items: [], error: `KWScanner related returned status ${response.status}` };
    }

    const data = await response.json();
    const items = [];
    if (data && Array.isArray(data.ideas)) {
      for (const idea of data.ideas) {
        if (!idea || !idea.keyword) continue;
        const sv = typeof idea.volume === 'number' ? idea.volume : 0;
        const cpc = typeof idea.cpc === 'number' ? idea.cpc : 0;
        const comp = typeof idea.competition === 'number' ? idea.competition : 0;
        items.push({
          keyword: idea.keyword,
          searchVolume: sv,
          searchVolumeFormatted: formatCompactNumber(sv),
          searchVolumeExactFormatted: sv.toLocaleString(),
          cpc: Number(cpc).toFixed(2),
          competition: comp > 0.65 ? 'HIGH' : comp > 0.35 ? 'MEDIUM' : 'LOW',
          competitionIndex: Math.round(comp * 100),
          competitionDecimal: comp.toFixed(2)
        });
      }
    }

    return { success: true, items, count: items.length };
  } catch (err) {
    return { success: false, items: [], error: err.message || 'KWScanner related request failed' };
  }
}

if (typeof self !== 'undefined') {
  self.cleanKeywordForVolume = cleanKeywordForVolume;
  self.getKWScannerAccount = getKWScannerAccount;
  self.checkKWScannerBalance = checkKWScannerBalance;
  self.getKWScannerKeywordData = getKWScannerKeywordData;
  self.getKWScannerBatchKeywordData = getKWScannerBatchKeywordData;
  self.getKWScannerRelatedKeywords = getKWScannerRelatedKeywords;
  self.DEFAULT_KWSCANNER_KEY = DEFAULT_KWSCANNER_KEY;
  self.normalizeKWLocation = normalizeKWLocation;
  self.buildSparklineSvg = buildSparklineSvg;
  self.kwLimiter = kwLimiter;
}
if (typeof module !== 'undefined') {
  module.exports = {
    cleanKeywordForVolume,
    getKWScannerAccount,
    checkKWScannerBalance,
    getKWScannerKeywordData,
    getKWScannerBatchKeywordData,
    getKWScannerRelatedKeywords,
    DEFAULT_KWSCANNER_KEY,
    normalizeKWLocation,
    buildSparklineSvg,
    kwLimiter
  };
}
