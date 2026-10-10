/**
 * cerpspy - Modern SERP Content Script
 * Clean, lightweight, ultra-fast implementation focusing strictly on:
 * 1. Top Search Bar Strip: Volume, CPC, and 12-Month Trend Sparkline with proper clearance.
 * 2. SERP Result Badges: Ahrefs DR, Domain Age, and Young Website badge positioned beside the domain name.
 */

(function () {
  'use strict';

  // Constants
  const SEARCHBAR_PANEL_ID = 'cerpspy-searchbar-intel';
  const INJECTED_FLAG = 'data-cerpspy-injected';

  // User Settings (Clean default state)
  let searchBarPanelEnabled = true;
  let showVolume = true;
  let showCpc = true;
  let showCompetition = true;
  let showTrend = true;
  let showExport = true;
  let showPaa = true;
  let showBookmark = true;
  let showOpportunity = true;
  let showIntentClassifier = true;
  let showSerpFilters = true;
  let currentSerpFilter = 'all';
  let latestTopResults = [];
  let targetCountry = 'global';
  let kwNetwork = 'google_search_and_partners';
  let serpBadgesEnabled = true;
  let showDomainRating = true;
  let showDomainAge = true;
  let showYoungBadge = true;
  let showForumBadge = true;
  let showWeakBadge = true;
  let autoFetchKeywords = true;
  let isAhrefsDiscontinued = false;
  let isKwScannerDiscontinued = false;

  // In-memory caches for instant 0ms rendering
  const contentDomainCache = new Map();
  const contentKeywordCache = new Map();
  // Track in-flight keyword requests by cacheKey (Map prevents overwrites across concurrent calls)
  const inFlightKeywordRequests = new Map();

  /**
   * Sanitizes and cleans search queries before requesting Google Ads/KWScanner metrics.
   * Ensures identical cache key hashing with background service worker.
   */
  function cleanKeywordForVolume(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/\b(?:site|inurl|allinurl|intitle|allintitle|intext|allintext|filetype|ext|related|cache|info|define):[^\s]+/gi, ' ');
    cleaned = cleaned.replace(/\b(?:allintitle|allinurl|allintext|allinanchor):/gi, ' ');
    cleaned = cleaned.replace(/(?:^|\s)-[^\s]+/g, ' ');
    cleaned = cleaned.replace(/[,:;|"`~^<>{}[\]\\]+/g, ' ');
    cleaned = cleaned.replace(/^['"]+|['"]+$/g, '');
    cleaned = cleaned.replace(/^[\s\-_?!.]+|[\s\-_?!.]+$/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      cleaned = raw.trim().replace(/^['"]+|['"]+$/g, '').trim();
    }
    return cleaned.toLowerCase();
  }

  /**
   * Normalizes regional country codes to match the background service worker's caching keys.
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

  let isContextInvalidated = false;

  function isExtensionValid() {
    if (isContextInvalidated) return false;
    try {
      if (!chrome?.runtime?.id) {
        isContextInvalidated = true;
        return false;
      }
      return true;
    } catch (_) {
      isContextInvalidated = true;
      return false;
    }
  }

  function safeGetURL(path) {
    try {
      if (isExtensionValid()) {
        return chrome.runtime.getURL(path);
      }
    } catch (_) {}
    return '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Intercept and swallow "Extension context invalidated" unhandled rejections
  // so Chrome extensions page never shows red error badge upon extension updates
  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = String(event?.reason?.message || event?.reason || '');
    if (reasonStr.includes('Extension context invalidated')) {
      try { event.preventDefault(); } catch (_) {}
      isContextInvalidated = true;
      showExtensionReloadBanner();
    }
  });

  function showExtensionReloadBanner() {
    if (isContextInvalidated && document.getElementById('cerpspyBtnReloadPage')) return;
    isContextInvalidated = true;
    console.info('[cerpspy] Extension context invalidated (extension reloaded). Please refresh page.');
    const strip = document.getElementById(SEARCHBAR_PANEL_ID);
    if (strip) {
      strip.innerHTML = `
        <span class="cerpspy-kw-item" title="cerpspy extension was reloaded in Chrome. Click Refresh to reconnect.">
          <span class="cerpspy-kw-lbl">cerpspy:</span>
          <strong class="cerpspy-kw-val">Extension updated</strong>
        </span>
        <span class="cerpspy-kw-sep">|</span>
        <button type="button" class="cerpspy-kw-refresh-btn is-reload" id="cerpspyBtnReloadPage" title="Click to refresh page and reconnect cerpspy" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;padding:2px 6px;">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 8a6 6 0 1 1-1.8-4.2M14 2v6h-6" />
          </svg>
          <span style="font-size:11px;font-weight:700;">Refresh Page</span>
        </button>
      `;
      strip.querySelector('#cerpspyBtnReloadPage')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.reload();
      });
    }
  }

  /**
   * Safely sends a message to the background service worker,
   * guarding against extension context invalidation with auto-retry and timeout.
   */
  async function safeSendMessage(msg, timeoutMs = 8000, retries = 2) {
    if (!chrome.runtime?.id) {
      showExtensionReloadBanner();
      return null;
    }
    try {
      let timerId;
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error('Extension message response timeout')), timeoutMs);
      });
      const response = await Promise.race([
        chrome.runtime.sendMessage(msg),
        timeoutPromise
      ]);
      clearTimeout(timerId);
      // Service worker sometimes resolves with undefined when it drops the message
      // (e.g. waking from sleep, port closed). Treat as retriable failure.
      if (response === undefined && retries > 0) {
        await new Promise(r => setTimeout(r, 500));
        return safeSendMessage(msg, timeoutMs, retries - 1);
      }
      return response;
    } catch (err) {
      const errStr = String(err?.message || err);
      if (errStr.includes('Extension context invalidated') || !chrome.runtime?.id) {
        showExtensionReloadBanner();
        return null;
      }
      if (retries > 0) {
        // Longer backoff for connection errors (service worker waking up)
        const backoffMs = errStr.includes('Could not establish connection') ? 800 : 250;
        await new Promise(r => setTimeout(r, backoffMs));
        return safeSendMessage(msg, timeoutMs, retries - 1);
      }
      return null;
    }
  }

  /**
   * Loads user preferences from chrome.storage.local.
   */
  async function loadSettings() {
    if (!chrome.runtime?.id) return;
    try {
      const res = await chrome.storage.local.get('cerpspy_settings');
      const s = res.cerpspy_settings || {};

      searchBarPanelEnabled = s.searchBarPanelEnabled !== false;
      showVolume = s.showVolume !== false;
      showCpc = s.showCpc !== false;
      showCompetition = s.showCompetition !== false;
      showTrend = s.showTrend !== false;
      showExport = s.showExport !== false;
      showPaa = s.showPaa !== false;
      showBookmark = s.showBookmark !== false;
      showOpportunity = s.showOpportunity !== false;
      showIntentClassifier = s.showIntentClassifier !== false;
      showSerpFilters = s.showSerpFilters !== false;
      targetCountry = (s.manualCountrySelected && s.targetCountry)
        ? s.targetCountry.trim()
        : (s.targetCountry && s.targetCountry !== 'auto' ? s.targetCountry.trim() : 'global');
      kwNetwork = (s.kwNetwork && s.kwNetwork.trim()) ? s.kwNetwork.trim() : 'google_search_and_partners';
      serpBadgesEnabled = s.serpBadgesEnabled !== false;
      showDomainRating = s.showDomainRating !== false;
      showDomainAge = s.showDomainAge !== false;
      showYoungBadge = s.showYoungBadge !== false;
      showForumBadge = s.showForumBadge !== false;
      showWeakBadge = s.showWeakBadge !== false;
      autoFetchKeywords = s.autoFetchKeywords !== false;
      isKwScannerDiscontinued = s.kwScannerDiscontinued === true || !s.kwScannerApiKey;
      isAhrefsDiscontinued = s.ahrefsDiscontinued === true || !s.ahrefsApiKey;
    } catch (e) {
      // Context invalidated or storage unavailable
    }
  }

  // Authoritative list of user-generated discussion forums and social communities
  const FORUM_DOMAINS = new Set([
    'reddit.com', 'quora.com', 'medium.com', 'stackoverflow.com',
    'pinterest.com', 'facebook.com', 'twitter.com', 'x.com',
    'discussions.apple.com', 'answers.microsoft.com', 'tripadvisor.com',
    'community.hubspot.com', 'news.ycombinator.com', 'trustpilot.com'
  ]);

  /**
   * Identifies whether a given domain is an open discussion forum or UGC community.
   */
  function isForumDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;
    const clean = domain.toLowerCase().trim();
    return FORUM_DOMAINS.has(clean);
  }

  /**
   * Normalizes a raw URL into a clean root domain (e.g. "https://blog.google.com/post" -> "google.com")
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
   * Humanizes domain age into short format requested:
   * e.g. "1 y", "5 y", "12 m", "2 week", "1 day"
   */
  function formatDomainAgeShort(age) {
    if (!age) return '—';
    const years = age.years || 0;
    const months = age.months || 0;
    const days = age.days || 0;
    const totalDays = age.totalDays !== undefined ? age.totalDays : (years * 365 + months * 30 + days);
    const totalMonths = age.totalMonths !== undefined ? age.totalMonths : (years * 12 + months);

    if (totalMonths > 12 || years > 1) {
      return `${Math.max(1, years)} y`;
    }
    if (totalMonths >= 1) {
      return `${totalMonths} m`;
    }
    if (totalDays >= 7) {
      const w = Math.max(1, Math.round(totalDays / 7));
      return `${w} week${w > 1 ? 's' : ''}`;
    }
    const d = Math.max(1, totalDays || days);
    return `${d} day${d > 1 ? 's' : ''}`;
  }

  /**
   * Extracts active search query from Google search input or URL.
   */
  function extractSearchQuery() {
    // 1. Canonical query from URL query parameter (matches the SERP results on screen)
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q');
      if (q && q.trim()) return q.trim();
    } catch (_) {}

    // 2. Fallback to search input only if URL parameter is absent
    const input = document.querySelector('input[name="q"], textarea[name="q"], input.gLFyf, #APjFqb');
    if (input && input.value && input.value.trim()) {
      return input.value.trim();
    }

    const title = document.title || '';
    if (title.includes(' - Google Search')) {
      return title.replace(' - Google Search', '').trim();
    }
    return '';
  }

  /**
   * Detects the regional location/country for Google Search (e.g. 'in', 'us', 'uk', 'ca', etc.)
   * Covers user setting override, Google region switcher pill (e.g. "[ 🇮🇳 IN ▾ ]"),
   * URL query params (&gl=, &cr=), and international Google hostnames across 138+ countries.
   */
  function detectSearchCountry() {
    // If targetCountry is explicitly configured (not 'auto'), respect user choice
    if (targetCountry && targetCountry !== 'auto') {
      return normalizeKWLocation(targetCountry);
    }

    // 1. Explicit Google URL query parameters
    try {
      const params = new URLSearchParams(window.location.search);
      const gl = params.get('gl');
      if (gl) return normalizeKWLocation(gl);
      const cr = params.get('cr');
      if (cr && cr.toLowerCase().startsWith('country')) {
        return normalizeKWLocation(cr.toLowerCase().replace('country', ''));
      }
    } catch (_) {}

    // 2. Visible Google Region / Location Picker Pill in Header (e.g. "[ 🇮🇳 IN ▾ ]", "[ 🇨🇱 CL ▾ ]", etc.)
    try {
      const regionEls = document.querySelectorAll(
        'button[aria-label*="region" i], button[aria-label*="región" i], button[aria-label*="country" i], button[aria-label*="location" i], button[aria-label*="ubicación" i], .Q37Uud, [data-region], [aria-label*="choose region" i], [aria-label*="select region" i], #searchform button, header button, .sfbg button'
      );
      for (const el of regionEls) {
        const text = (el.textContent || '').trim();
        const match = text.match(/\b([A-Z]{2})\b/);
        if (match && match[1]) {
          const code = match[1].toLowerCase();
          if (code !== 'ai' && code !== 'ad' && code !== 'ok') {
            return normalizeKWLocation(code);
          }
        }
      }
    } catch (_) {}

    // 3. Google Hostname ccTLD
    try {
      const host = window.location.hostname.toLowerCase();
      const m = host.match(/google\.(?:com?\.)?([a-z]{2,3})$/);
      if (m && m[1]) {
        const tld = m[1].toLowerCase();
        if (tld !== 'com' && tld !== 'net' && tld !== 'org') {
          return normalizeKWLocation(tld);
        }
      }
    } catch (_) {}

    return 'global';
  }

  /**
   * Accurately determines if Google SERP is currently rendered in Dark Mode.
   */
  function isGoogleDarkMode() {
    // 1. Check actual computed background color of body or documentElement (ground truth)
    try {
      const targetEl = document.body || document.documentElement;
      if (targetEl) {
        const bodyBg = window.getComputedStyle(targetEl).backgroundColor;
        if (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') {
          const rgb = bodyBg.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            const brightness = (Number(rgb[0]) * 0.299 + Number(rgb[1]) * 0.587 + Number(rgb[2]) * 0.114);
            return brightness < 128;
          }
        }
      }
    } catch (_) {}

    // 2. Check search box input background (ground truth)
    try {
      const input = document.querySelector('input[name="q"], textarea[name="q"], .gLFyf, #APjFqb');
      if (input) {
        const inputBg = window.getComputedStyle(input).backgroundColor;
        const rgb = inputBg?.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const brightness = (Number(rgb[0]) * 0.299 + Number(rgb[1]) * 0.587 + Number(rgb[2]) * 0.114);
          return brightness < 128;
        }
      }
    } catch (_) {}

    // 3. Fallback: explicit dark attributes if background color was transparent/unresolved
    if (
      document.documentElement?.getAttribute('dark') === 'true' ||
      document.body?.getAttribute('data-darkmode') === 'true' ||
      document.body?.classList.contains('dark-mode') ||
      document.documentElement?.classList.contains('dark-theme')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Applies dark/light theme class to elements matching Google's color scheme.
   */
  function applyThemeClass(el) {
    if (!el) return;
    const isDark = isGoogleDarkMode();

    if (isDark) {
      el.classList.add('cerpspy-theme-dark');
      el.classList.remove('cerpspy-theme-light');
    } else {
      el.classList.add('cerpspy-theme-light');
      el.classList.remove('cerpspy-theme-dark');
    }
  }

  // =========================================================================
  // 1. TOP SEARCH BAR INTEL STRIP (Volume, CPC, Trend)
  // =========================================================================

  /**
   * Identifies Google's top navigation filter tabs (AI Mode, All, Images, Videos, News, etc.).
   */
  function findGoogleFilterNav() {
    const filterNames = [
      'all', 'ai mode', 'images', 'videos', 'short videos', 
      'forums', 'news', 'places', 'places sites', 'web', 'maps', 'shopping', 'finance'
    ];

    // Strategy 1: Tab matching modern Google filter categories near top (< 380px)
    const candidateTabs = Array.from(document.querySelectorAll('a, div[role="tab"], div[role="link"], span')).filter(el => {
      const txt = el.textContent.trim().toLowerCase();
      return filterNames.includes(txt) && el.children.length === 0;
    });

    for (const tab of candidateTabs) {
      const nav = tab.closest('#top_nav, #hdtb, #hdtb-msb, #hdtb-sc, .crJ18e, .IUggIf, [role="tablist"]');
      if (nav && nav.id !== 'searchform' && nav.tagName !== 'FORM') {
        const rect = nav.getBoundingClientRect();
        if (rect.top >= 0 && rect.top < 380) {
          return nav.closest('#top_nav, #hdtb, #hdtb-msb, #hdtb-sc') || nav;
        }
      }
    }

    // Strategy 2: Direct selector for header tab bar
    const direct = document.querySelector('#top_nav, #hdtb, #hdtb-msb, #hdtb-sc, .crJ18e, .IUggIf, div:has(> [role="tablist"])');
    if (direct && direct.id !== 'searchform' && direct.tagName !== 'FORM') {
      const rect = direct.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < 380) {
        return direct;
      }
    }

    return null;
  }

  /**
   * Creates comfortable, clean vertical space between the search bar panel and Google's navigation tabs.
   * Prevents any overlap with "AI Mode", "All", "Images", "Videos", etc.
   */
  function adjustGoogleLayoutForStrip(isActive) {
    try {
      const searchForm = document.getElementById('searchform') || document.querySelector('form[role="search"]');
      const strip = document.getElementById(SEARCHBAR_PANEL_ID);

      if (searchForm) {
        if (isActive) {
          if (searchForm.style.height !== 'auto') searchForm.style.setProperty('height', 'auto', 'important');
          if (searchForm.style.overflow !== 'visible') searchForm.style.setProperty('overflow', 'visible', 'important');
          if (searchForm.style.paddingBottom !== '4px') searchForm.style.setProperty('padding-bottom', '4px', 'important');
          if (searchForm.style.marginBottom !== '6px') searchForm.style.setProperty('margin-bottom', '6px', 'important');
        } else {
          searchForm.style.removeProperty('height');
          searchForm.style.removeProperty('overflow');
          searchForm.style.removeProperty('padding-bottom');
          searchForm.style.removeProperty('margin-bottom');
        }
      }

      // Clean up any deprecated second-row filter bar
      document.getElementById('cerpspyFilterBar')?.remove();

      // Push Google navigation filter tabs (AI Mode, All, Images, etc.) down with clean clearance
      const nav = findGoogleFilterNav();
      if (nav) {
        if (isActive) {
          const stripHeight = strip ? (strip.offsetHeight || strip.getBoundingClientRect().height) : 22;
          const neededMargin = Math.max(Math.round(stripHeight + 10), 34);
          const targetMargin = `${neededMargin}px`;
          if (nav.style.marginTop !== targetMargin) {
            nav.style.setProperty('margin-top', targetMargin, 'important');
          }
          if (nav.style.paddingTop !== '2px') {
            nav.style.setProperty('padding-top', '2px', 'important');
          }
        } else {
          nav.style.removeProperty('margin-top');
          nav.style.removeProperty('padding-top');
        }
      }
    } catch (e) {}
  }

  /**
   * Horizontally aligns the intelligence strip with the left edge of Google's search input.
   */
  function alignStripWithSearchInput(strip) {
    if (!strip || !strip.parentElement) return;
    try {
      const inputEl = document.querySelector('textarea[name="q"], input[name="q"], #APjFqb, .gLFyf');
      const searchBox = document.querySelector('.RNNXgb, .A8SBwf, #searchform .minidiv') || inputEl;
      if (inputEl) {
        const inputRect = inputEl.getBoundingClientRect();
        const parentRect = strip.parentElement.getBoundingClientRect();
        // Guard: do not compute invalid margin if search input has not completed initial layout
        if (inputRect.width === 0 && inputRect.left === 0) return;
        const targetLeft = Math.max(0, Math.round(inputRect.left - parentRect.left));
        const currentMargin = parseInt(strip.style.marginLeft, 10) || 0;
        if (Math.abs(currentMargin - targetLeft) >= 2) {
          strip.style.setProperty('margin-left', `${targetLeft}px`, 'important');
        }

        // Strictly constrain max-width to the search box width so it never exceeds the camera icon
        if (searchBox) {
          const boxRect = searchBox.getBoundingClientRect();
          if (boxRect.width > 0) {
            strip.style.setProperty('max-width', `${Math.round(boxRect.width)}px`, 'important');
          }
        }
        return;
      }
    } catch (e) {}
  }

  /**
   * Finds the optimal container to place the intelligence strip directly beneath the search input.
   */
  function findSearchBarAnchor() {
    // 1. Primary: Directly after Google's search input container (.A8SBwf or .RNNXgb) inside #searchform
    const searchInputContainer = document.querySelector('.A8SBwf, .RNNXgb');
    if (searchInputContainer && searchInputContainer.parentNode) {
      let ref = searchInputContainer.nextSibling;
      if (ref && (ref.id === SEARCHBAR_PANEL_ID || (ref.classList && ref.classList.contains('cerpspy-kw-strip')))) {
        ref = ref.nextSibling;
      }
      return { parent: searchInputContainer.parentNode, reference: ref };
    }

    // 2. Directly BEFORE Google's navigation filter tabs row
    const navTabs = findGoogleFilterNav();
    if (navTabs && navTabs.parentNode) {
      return { parent: navTabs.parentNode, reference: navTabs };
    }

    // 3. Below searchform
    const searchForm = document.getElementById('searchform') || document.querySelector('form[role="search"]') || document.getElementById('tsf');
    if (searchForm && searchForm.parentNode) {
      return { parent: searchForm.parentNode, reference: searchForm.nextSibling };
    }

    return null;
  }

  /**
   * Creates or returns the Search Bar Intel Strip container.
   */
  function getOrCreateSearchBarStrip() {
    let strip = document.getElementById(SEARCHBAR_PANEL_ID);
    if (strip) return strip;

    const anchor = findSearchBarAnchor();
    if (!anchor || !anchor.parent) return null;

    strip = document.createElement('div');
    strip.id = SEARCHBAR_PANEL_ID;
    strip.className = 'cerpspy-kw-strip';
    applyThemeClass(strip);
    strip.style.opacity = '0';

    if (anchor.reference) {
      anchor.parent.insertBefore(strip, anchor.reference);
    } else {
      anchor.parent.appendChild(strip);
    }

    alignStripWithSearchInput(strip);
    adjustGoogleLayoutForStrip(true);

    requestAnimationFrame(() => {
      if (strip) strip.style.opacity = '1';
    });

    return strip;
  }

  /**
   * Formats large integers into compact human-readable strings (e.g. 5M, 120K)
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
    if (val >= 10_000) {
      return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    if (val >= 1_000) {
      return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return String(num);
  }

  /**
   * Generates 8 mini bars showing relative recent monthly search trend (matches KW Scanner).
   */
  function buildMiniBarsHtml(trend) {
    const raw = Array.isArray(trend) ? trend : [];
    const points = raw.length >= 6 ? raw.slice(-8) : [
      { volume: 40 }, { volume: 70 }, { volume: 55 }, { volume: 90 },
      { volume: 60 }, { volume: 80 }, { volume: 100 }, { volume: 95 }
    ];
    const maxV = Math.max(...points.map(p => (typeof p === 'number' ? p : (p.volume || 0)))) || 1;
    const barsHtml = points.map(p => {
      const v = typeof p === 'number' ? p : (p.volume || 0);
      const h = Math.max(3, Math.round((v / maxV) * 12));
      return `<div class="cerpspy-mini-bar" style="height: ${h}px;"></div>`;
    }).join('');
    return `<div class="cerpspy-mini-bars" id="cerpspyMiniBarsTrigger" title="Monthly Trend. Click or hover for breakdown">${barsHtml}</div>`;
  }

  /**
   * Detects whether Google AI Overview (AIO) is rendered on this search query
   * and extracts all cited external root domains.
   */
  function getAiOverviewInfo() {
    try {
      const aioContainer = document.querySelector(
        'div[data-attrid="wa:/description"], div.mJ3Y2c, .kO201e, .GcK7Id, div[aria-label*="AI Overview" i]'
      );
      if (!aioContainer) return { hasAio: false, citedDomains: new Set() };

      const citedDomains = new Set();
      const links = aioContainer.querySelectorAll('a[href^="http"]');
      links.forEach(a => {
        const d = extractRootDomain(a.href);
        if (d && !d.includes('google.') && d !== 'schema.org') {
          citedDomains.add(d);
        }
      });
      return { hasAio: true, citedDomains };
    } catch (_) {
      return { hasAio: false, citedDomains: new Set() };
    }
  }

  /**
   * Scans Google's People Also Ask (PAA) elements and extracts question strings.
   */
  function harvestPeopleAlsoAskQuestions() {
    const questions = [];
    const seen = new Set();
    try {
      const qElements = document.querySelectorAll(
        '.related-question-pair, div[jsname="yEVEwb"], div[data-q], div.cb77Re'
      );
      qElements.forEach(el => {
        const text = (el.getAttribute('data-q') || el.innerText || '').trim();
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          const clean = line.replace(/^[▼▲►▼\s]+|[▼▲►▼\s]+$/g, '').trim();
          if (clean.length > 8 && clean.endsWith('?') && !seen.has(clean)) {
            seen.add(clean);
            questions.push(clean);
            break;
          }
        }
      });

      // Fallback: search for any accordion header with question marks
      if (questions.length === 0) {
        document.querySelectorAll('div[jscontroller] div[role="button"]').forEach(btn => {
          const t = btn.innerText?.trim();
          if (t && t.length > 8 && t.endsWith('?') && !seen.has(t)) {
            seen.add(t);
            questions.push(t);
          }
        });
      }
    } catch (e) {
      console.info('[cerpspy] Error harvesting PAA:', e);
    }
    return questions;
  }

  /**
   * Exports all organic SERP rankings, domains, DR scores, and domain age to CSV.
   * Completely client-side in memory with 0 network calls.
   */
  function exportSerpToCsv(query, kd) {
    try {
      const headings = Array.from(document.querySelectorAll('h3, div[role="heading"][aria-level="3"]')).filter(h => {
        const card = h.closest('.yuRUbf, .tF2Cxc, div.g, .g') || h.parentElement;
        return card && !isExcludedElement(h) && !isExcludedElement(card);
      });

      const seenUrls = new Set();
      const rows = [
        ['Rank', 'Domain', 'Title', 'URL', 'Ahrefs DR', 'Domain Age', 'Young Site', 'Target Query', 'Search Volume', 'CPC']
      ];

      let rank = 1;
      headings.forEach(heading => {
        const card = heading.closest('.yuRUbf, .tF2Cxc, div.g, .g') || heading.parentElement;
        const a = heading.closest('a') || heading.querySelector('a') || card?.querySelector('a[href^="http"]');
        if (!a || !a.href) return;
        const url = a.href;
        if (!url.startsWith('http') || seenUrls.has(url)) return;
        const domain = extractRootDomain(url);
        if (!domain || domain.includes('google.') || domain === 'schema.org') return;

        seenUrls.add(url);
        const title = (heading.innerText || '').replace(/[\r\n\t]+/g, ' ').trim();
        const data = contentDomainCache.get(domain) || null;

        const dr = (data?.dr && typeof data.dr.dr === 'number') ? Math.round(data.dr.dr) : '';
        const ageFormatted = data?.ageFormatted || (data?.age?.age ? formatDomainAgeShort(data.age.age) : '');
        const isYoung = Boolean(data?.isYoung || (data?.age?.age && ((data.age.age.totalMonths || 0) < 12))) ? 'Yes' : 'No';

        const vol = kd?.searchVolume || '';
        const cpc = kd?.cpc ? `$${kd.cpc}` : '';

        rows.push([
          rank++,
          domain,
          title,
          url,
          dr,
          ageFormatted,
          isYoung,
          query || '',
          vol,
          cpc
        ]);
      });

      if (rows.length <= 1) {
        alert('No organic search results found to export.');
        return false;
      }

      const csvContent = rows.map(r => r.map(val => {
        const str = String(val ?? '').replace(/"/g, '""');
        return `"${str}"`;
      }).join(',')).join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const safeQ = (query || 'serp').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
      link.href = URL.createObjectURL(blob);
      link.download = `cerpspy_${safeQ}_serp.csv`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return true;
    } catch (err) {
      console.warn('[cerpspy] Error exporting CSV:', err);
      return false;
    }
  }

  /**
   * Fast, deterministic NLP rule classifier for Google Search intent.
   * Runs in 0ms client-side with 0 API calls and 0 credits.
   */
  function classifySearchIntent(query) {
    if (!query) return null;
    const q = query.toLowerCase().trim();

    // 1. Transactional Signals
    if (/\b(buy|order|purchase|coupon|discount|cheap|deal|shop|shopping|store|sale|hire|pricing|cost|quote|booking|download|install|sign up|register)\b/i.test(q)) {
      return {
        type: 'transactional',
        label: 'Trans',
        tooltip: 'Search Intent: Transactional (Trans). Searchers are ready to buy, subscribe, download, or convert.'
      };
    }

    // 2. Commercial Investigation Signals
    if (/\b(best|top|vs|versus|review|reviews|compare|comparison|alternative|alternatives|ratings|difference between|pros and cons|which is better|recommendation)\b/i.test(q)) {
      return {
        type: 'commercial',
        label: 'Comm',
        tooltip: 'Search Intent: Commercial Investigation (Comm). Searchers are comparing solutions, reviews, or alternatives.'
      };
    }

    // 3. Navigational Signals
    if (/\b(login|log in|signin|sign in|portal|official site|website|account|dashboard|app|support|customer service)\b/i.test(q) || /^[a-z0-9-]+\.(com|org|net|io|co|in|edu|gov)$/i.test(q)) {
      return {
        type: 'navigational',
        label: 'Nav',
        tooltip: 'Search Intent: Navigational (Nav). Searcher is looking for a specific brand, portal, or website destination.'
      };
    }

    // 4. Informational Signals (Default Search Intent)
    return {
      type: 'informational',
      label: 'Info',
      tooltip: 'Search Intent: Informational (Info). Searcher is seeking guides, instructions, facts, or answers.'
    };
  }

  /**
   * Builds the HTML items for Search Volume, CPC, Competition, and Trend with clean pipe separators.
   */
  function buildSearchBarHtml(kd, query) {
    const items = [];

    // 1. Search Intent Classifier
    if (showIntentClassifier && query) {
      const intent = classifySearchIntent(query);
      if (intent) {
        items.push(`
          <span class="cerpspy-kw-item" title="${intent.tooltip}">
            <span class="cerpspy-intent-badge is-${intent.type}">${intent.label}</span>
          </span>
        `);
      }
    }

    // 2. Monthly Search Volume & 12-Month Sparkline Trend (paired together, compact formatting)
    if (showVolume) {
      const volExact = kd?.searchVolumeExactFormatted || (kd?.searchVolume !== undefined && kd?.searchVolume !== null ? Number(kd.searchVolume).toLocaleString() : '0');
      const volShort = kd?.searchVolumeFormatted || (kd?.searchVolume ? formatCompactNumber(kd.searchVolume) : volExact);
      const poolLoc = (kd?.poolLocation || kd?.country || 'global').toUpperCase();
      const poolDisplay = poolLoc === 'GLOBAL' ? 'Global' : poolLoc;
      const netLabel = kd?.network === 'google_search_and_partners' ? 'Search & Partners' : 'Google Search';
      const volTitle = `Monthly Search Volume: ${volExact}/mo (${poolDisplay} pool, ${netLabel})`;

      const isManualCountry = Boolean(targetCountry && targetCountry !== 'auto' && targetCountry !== 'global');
      const marketBadgeHtml = isManualCountry ? ` <span class="cerpspy-kw-market-badge" title="Manual Target: ${poolDisplay}">[${poolDisplay}]</span>` : '';

      let sparklineHtml = '';
      if (showTrend) {
        const trendData = kd?.trend12mo || kd?.trend || [];
        const miniBarsHtml = buildMiniBarsHtml(trendData);
        const trendDir = kd?.trendDirection || 'stable';
        const trendPct = kd?.trendChangePct || 0;
        const pctLabel = trendPct > 0 ? `+${trendPct}%` : (trendPct < 0 ? `${trendPct}%` : '0%');
        const dirTitle = `12-Month Search Volume Trend: ${trendDir} (${pctLabel}). Click or hover for monthly breakdown`;
        sparklineHtml = `
          <span class="cerpspy-kw-sparkline-item" id="cerpspySparklineTrigger" title="${dirTitle}">
            ${miniBarsHtml}
          </span>
        `;
      }

      items.push(`
        <span class="cerpspy-kw-item" title="${volTitle}">
          <span class="cerpspy-kw-lbl">Vol${marketBadgeHtml}:</span>
          <strong class="cerpspy-kw-val">${volShort}/mo</strong>
          ${sparklineHtml}
        </span>
      `);
    } else if (showTrend) {
      const trendData = kd?.trend12mo || kd?.trend || [];
      const miniBarsHtml = buildMiniBarsHtml(trendData);
      const trendDir = kd?.trendDirection || 'stable';
      const trendPct = kd?.trendChangePct || 0;
      const pctLabel = trendPct > 0 ? `+${trendPct}%` : (trendPct < 0 ? `${trendPct}%` : '0%');
      const dirTitle = `12-Month Search Volume Trend: ${trendDir} (${pctLabel}). Click or hover for monthly breakdown`;

      items.push(`
        <span class="cerpspy-kw-item" title="${dirTitle}">
          <span class="cerpspy-kw-lbl">Trend:</span>
          <span class="cerpspy-kw-sparkline-item" id="cerpspySparklineTrigger" title="${dirTitle}">
            ${miniBarsHtml}
          </span>
        </span>
      `);
    }

    // 3. Estimated CPC (Cost Per Click)
    if (showCpc) {
      const cpcVal = (kd && kd.cpc !== null && kd.cpc !== undefined && kd.cpc !== '--') ? `$${kd.cpc}` : '$0.00';
      items.push(`
        <span class="cerpspy-kw-item" title="Estimated Google Ads Cost Per Click">
          <span class="cerpspy-kw-lbl">CPC:</span>
          <strong class="cerpspy-kw-val">${cpcVal}</strong>
        </span>
      `);
    }

    // 4. Paid Search Competition (Matches KW Scanner)
    if (showCompetition) {
      const compDecimal = (kd && kd.competitionDecimal !== undefined && kd.competitionDecimal !== null)
        ? kd.competitionDecimal
        : (kd && typeof kd.competition === 'number' ? kd.competition.toFixed(2) : '0.00');
      const compLabel = kd?.competition || (Number(compDecimal) > 0.65 ? 'HIGH' : Number(compDecimal) > 0.35 ? 'MEDIUM' : 'LOW');
      items.push(`
        <span class="cerpspy-kw-item" title="Google Ads Paid Competition: ${compDecimal} (${compLabel})">
          <span class="cerpspy-kw-lbl">Comp:</span>
          <strong class="cerpspy-kw-val">${compDecimal}</strong>
        </span>
      `);
    }

    // 5. SERP Opportunity & Instant Filters container (BRIDGING QUERY TO SERP RESULTS)
    if (showOpportunity || showSerpFilters) {
      items.push(`
        <span class="cerpspy-opp-container" id="cerpspyOppContainer"></span>
      `);
    }

    // 6. Action Utilities (Tools Dropdown: Export, PAA, Bookmark)
    items.push(...buildActionButtonsHtml());

    // 7. Refresh action button
    items.push(`
      <button type="button" class="cerpspy-kw-refresh-btn" id="cerpspyBtnRefreshKw" title="Refresh live keyword volume & CPC">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 8a6 6 0 1 1-1.8-4.2M14 2v6h-6" />
        </svg>
      </button>
    `);

    return items.join('<span class="cerpspy-kw-sep">|</span>');
  }

  /**
   * Builds the common utility buttons (AI Overview, Tools Dropdown).
   */
  function buildActionButtonsHtml() {
    const aio = getAiOverviewInfo();
    const items = [];
    if (aio.hasAio) {
      items.push(`
        <span class="cerpspy-kw-item" title="Google AI Overview active on this search query">
          <span class="cerpspy-kw-aio-chip">🤖 AI Overview</span>
        </span>
      `);
    }

    // Unified Tools Dropdown (Export CSV, PAA Harvester, Bookmark Summary)
    const hasAnyTool = showExport || showPaa || showBookmark;
    if (hasAnyTool) {
      items.push(`
        <button type="button" class="cerpspy-tools-btn" id="cerpspyBtnToolsDropdown" title="Click to open Cerpspy utilities (CSV Export, PAA, Bookmark)">
          <span>⚡ Tools</span>
          <svg viewBox="0 0 10 6" width="7" height="4" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M1 1l4 4 4-4" />
          </svg>
        </button>
      `);
    }

    return items;
  }

  /**
   * Builds fallback retry HTML when keyword volume could not be fetched.
   */
  function buildSearchBarRetryHtml(query) {
    const items = [];
    if (showIntentClassifier && query) {
      const intent = classifySearchIntent(query);
      if (intent) {
        items.push(`
          <span class="cerpspy-kw-item" title="${intent.tooltip}">
            <span class="cerpspy-intent-badge is-${intent.type}">${intent.label}</span>
          </span>
        `);
      }
    }
    if (showVolume) {
      items.push(`
        <span class="cerpspy-kw-item" title="Volume lookup pending / retry">
          <span class="cerpspy-kw-lbl">Volume:</span>
          <strong class="cerpspy-kw-val">—</strong>
        </span>
      `);
    }
    if (showCpc) {
      items.push(`
        <span class="cerpspy-kw-item" title="CPC lookup pending / retry">
          <span class="cerpspy-kw-lbl">CPC:</span>
          <strong class="cerpspy-kw-val">—</strong>
        </span>
      `);
    }
    if (showTrend) {
      items.push(`
        <span class="cerpspy-kw-item" title="Trend lookup pending / retry">
          <span class="cerpspy-kw-lbl">Trend:</span>
          <strong class="cerpspy-kw-val">—</strong>
        </span>
      `);
    }
    if (showOpportunity || showSerpFilters) {
      items.push(`
        <span class="cerpspy-opp-container" id="cerpspyOppContainer"></span>
      `);
    }
    items.push(...buildActionButtonsHtml());
    items.push(`
      <button type="button" class="cerpspy-kw-refresh-btn is-retry" id="cerpspyBtnRefreshKw" title="Click to retry loading search volume, CPC & trend" style="display:inline-flex;align-items:center;">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 8a6 6 0 1 1-1.8-4.2M14 2v6h-6" />
        </svg>
        <span style="font-size:11px;font-weight:600;margin-left:3px;">Retry</span>
      </button>
    `);
    return items.join('<span class="cerpspy-kw-sep">|</span>');
  }

  /**
   * Builds clean strip HTML when KWScanner API has been discontinued or disabled by the user.
   */
  function buildSearchBarDiscontinuedHtml(query) {
    const items = [];
    if (showIntentClassifier && query) {
      const intent = classifySearchIntent(query);
      if (intent) {
        items.push(`
          <span class="cerpspy-kw-item" title="${intent.tooltip}">
            <span class="cerpspy-intent-badge is-${intent.type}">${intent.label}</span>
          </span>
        `);
      }
    }
    if (showVolume) {
      items.push(`
        <span class="cerpspy-kw-item" title="KWScanner API token is discontinued in extension preferences">
          <span class="cerpspy-kw-lbl">Volume:</span>
          <strong class="cerpspy-kw-val" style="opacity: 0.65; font-size: 11px;">Off</strong>
        </span>
      `);
    }
    if (showCpc) {
      items.push(`
        <span class="cerpspy-kw-item" title="KWScanner API token is discontinued in extension preferences">
          <span class="cerpspy-kw-lbl">CPC:</span>
          <strong class="cerpspy-kw-val" style="opacity: 0.65; font-size: 11px;">Off</strong>
        </span>
      `);
    }
    if (showTrend) {
      items.push(`
        <span class="cerpspy-kw-item" title="KWScanner API token is discontinued in extension preferences">
          <span class="cerpspy-kw-lbl">Trend:</span>
          <strong class="cerpspy-kw-val" style="opacity: 0.65; font-size: 11px;">Off</strong>
        </span>
      `);
    }
    if (showOpportunity || showSerpFilters) {
      items.push(`
        <span class="cerpspy-opp-container" id="cerpspyOppContainer"></span>
      `);
    }
    items.push(...buildActionButtonsHtml());
    items.push(`
      <button type="button" class="cerpspy-kw-refresh-btn" id="cerpspyBtnRefreshKw" title="Click to refresh keyword metrics" style="display:inline-flex;align-items:center;">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 8a6 6 0 1 1-1.8-4.2M14 2v6h-6" />
        </svg>
      </button>
    `);
    return items.join('<span class="cerpspy-kw-sep">|</span>');
  }

  /**
   * Builds Credit Saver Mode HTML when user has paused auto-fetching.
   * Displays an interactive 1-click button to fetch metrics on demand.
   */
  function buildCreditSaverStripHtml(query) {
    const items = [];
    if (showIntentClassifier && query) {
      const intent = classifySearchIntent(query);
      if (intent) {
        items.push(`
          <span class="cerpspy-kw-item" title="${intent.tooltip}">
            <span class="cerpspy-intent-badge is-${intent.type}">${intent.label}</span>
          </span>
        `);
      }
    }
    if (showOpportunity || showSerpFilters) {
      items.push(`
        <span class="cerpspy-opp-container" id="cerpspyOppContainer"></span>
      `);
    }
    items.push(`
      <button type="button" class="cerpspy-kw-load-btn" id="cerpspyBtnFetchKw" title="Click to load live search volume, CPC & 12-month trends for this keyword">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:4px;">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span>Load Volume &amp; CPC</span>
      </button>
    `);
    items.push(...buildActionButtonsHtml());
    return items.join('<span class="cerpspy-kw-sep">|</span>');
  }

  /**
   * Attaches interactions to the Search Bar Intel Strip:
   * 1. Refresh / Retry button (click to force fresh fetch)
   * 2. Bookmark icon (1-click to copy keyword + metrics to clipboard & persist in saved keywords)
   */
  function attachSearchBarInteractions(strip, kd, query) {
    if (!strip) return;

    // Refresh / Retry button
    const refreshBtn = strip.querySelector('#cerpspyBtnRefreshKw');
    if (refreshBtn && !refreshBtn.dataset.cerpspyBound) {
      refreshBtn.dataset.cerpspyBound = 'true';
      refreshBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        strip.innerHTML = `
          ${showVolume ? '<span class="cerpspy-kw-item"><span class="cerpspy-kw-lbl">Volume:</span> <strong class="cerpspy-kw-val pulse">...</strong></span>' : ''}
          ${showVolume && (showCpc || showTrend) ? '<span class="cerpspy-kw-sep">|</span>' : ''}
          ${showCpc ? '<span class="cerpspy-kw-item"><span class="cerpspy-kw-lbl">CPC:</span> <strong class="cerpspy-kw-val pulse">...</strong></span>' : ''}
          ${showCpc && showTrend ? '<span class="cerpspy-kw-sep">|</span>' : ''}
          ${showTrend ? '<span class="cerpspy-kw-item"><span class="cerpspy-kw-lbl">Trend:</span> <strong class="cerpspy-kw-val pulse">...</strong></span>' : ''}
        `;
        renderSearchBarStrip(true);
      });
    }

    // Bookmark / Save button (1-Click Copy & Save Keyword)
    // Helper: copies keyword intel summary
    const handleBookmark = async (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      await copyKeywordIntelSummary(query, kd, strip.querySelector('#cerpspyBtnBookmarkKw') || strip.querySelector('#cerpspyBtnToolsDropdown'));
    };

    // Bookmark / Save button (if present)
    const bookmarkBtn = strip.querySelector('#cerpspyBtnBookmarkKw');
    if (bookmarkBtn && !bookmarkBtn.dataset.cerpspyBound) {
      bookmarkBtn.dataset.cerpspyBound = 'true';
      bookmarkBtn.addEventListener('click', handleBookmark);
      bookmarkBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') handleBookmark(e);
      });
    }

    // Export SERP to CSV button (if present)
    const exportBtn = strip.querySelector('#cerpspyBtnExportCsv');
    if (exportBtn && !exportBtn.dataset.cerpspyBound) {
      exportBtn.dataset.cerpspyBound = 'true';
      exportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const success = exportSerpToCsv(query, kd);
        showMenuActionToast(exportBtn, success ? '✓ Done' : 'No Data');
      });
    }

    // Copy People Also Ask (PAA) questions button (if present)
    const paaBtn = strip.querySelector('#cerpspyBtnCopyPaa');
    if (paaBtn && !paaBtn.dataset.cerpspyBound) {
      paaBtn.dataset.cerpspyBound = 'true';
      paaBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyPaaQuestionsToClipboard(query, paaBtn);
      });
    }

    // Unified ⚡ Tools Dropdown (Export CSV, PAA Harvester, Copy Intel)
    const toolsBtn = strip.querySelector('#cerpspyBtnToolsDropdown');
    if (toolsBtn) {
      attachToolsDropdown(toolsBtn, query, kd);
    }
  }

  /**
   * Copies formatted keyword intelligence (query, vol, CPC, competition, trend) to clipboard
   * and saves the record into chrome.storage.local for historical analytics.
   */
  async function copyKeywordIntelSummary(query, kd, targetEl) {
    const q = query || extractSearchQuery() || '';
    const vol = kd?.searchVolumeFormatted || (typeof kd?.searchVolume === 'number' ? kd.searchVolume.toLocaleString() : '—');
    const cpc = kd?.cpcFormatted || (kd?.cpc !== undefined && kd?.cpc !== null ? `$${Number(kd.cpc).toFixed(2)}` : '—');
    const compDecimal = (kd && kd.competitionDecimal !== undefined && kd.competitionDecimal !== null)
      ? kd.competitionDecimal
      : (kd && typeof kd.competition === 'number' ? kd.competition.toFixed(2) : '0.00');
    const trendDir = kd?.trendDirection || 'stable';
    const trendPct = kd?.trendChangePct || 0;
    const pctLabel = trendPct > 0 ? `+${trendPct}%` : (trendPct < 0 ? `${trendPct}%` : '0%');
    const trend = `${trendDir} (${pctLabel})`;

    const clipText = `Keyword: ${q}\nVolume: ${vol}\nCPC: ${cpc}\nCompetition: ${compDecimal}\nTrend: ${trend}\nGoogle SERP: ${window.location.href}`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(clipText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = clipText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
    } catch (err) {
      console.warn('[cerpspy] Clipboard copy failed:', err);
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const res = await chrome.storage.local.get('cerpspy_saved_keywords');
        const saved = Array.isArray(res.cerpspy_saved_keywords) ? res.cerpspy_saved_keywords : [];
        const updated = [
          {
            keyword: q,
            volume: vol,
            cpc: cpc,
            competition: compDecimal,
            trend: trend,
            timestamp: Date.now()
          },
          ...saved.filter(item => item.keyword.toLowerCase() !== q.toLowerCase())
        ].slice(0, 100);
        await chrome.storage.local.set({ cerpspy_saved_keywords: updated });
      }
    } catch (_) {}

    if (targetEl) {
      showMenuActionToast(targetEl, '✓ Copied Intel!');
    }
  }

  /**
   * Harvests People Also Ask (PAA) questions from SERP and copies them to clipboard as Markdown.
   */
  async function copyPaaQuestionsToClipboard(query, targetEl) {
    const questions = harvestPeopleAlsoAskQuestions();
    if (questions.length === 0) {
      if (targetEl) showMenuActionToast(targetEl, 'No PAA Found');
      return false;
    }

    const q = query || extractSearchQuery() || '';
    const mdText = `### People Also Ask (Query: ${q})\n\n` + questions.map((item, idx) => `${idx + 1}. ${item}`).join('\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(mdText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = mdText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      if (targetEl) showMenuActionToast(targetEl, `✓ Copied (${questions.length})`);
      return true;
    } catch (err) {
      console.warn('[cerpspy] PAA copy failed:', err);
      if (targetEl) showMenuActionToast(targetEl, 'Copy Failed');
      return false;
    }
  }

  /**
   * Displays a clean transient toast over a button.
   */
  function showMenuActionToast(targetEl, msg) {
    if (!targetEl) return;
    targetEl.querySelectorAll('.cerpspy-kw-copied-toast').forEach(t => t.remove());
    const toast = document.createElement('span');
    toast.className = 'cerpspy-kw-copied-toast';
    toast.textContent = msg;
    targetEl.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 2000);
  }

  /**
   * Attaches interactive floating dropdown menu for Cerpspy utilities (CSV Export, PAA, Bookmark).
   * Ensures tools consume minimal horizontal footprint on the search bar strip.
   */
  function attachToolsDropdown(btn, query, kd) {
    if (!btn) return;

    let menu = document.getElementById('cerpspyToolsMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'cerpspyToolsMenu';
      menu.className = 'cerpspy-tools-menu';
      document.body.appendChild(menu);
    }
    applyThemeClass(menu);

    const menuItems = [];
    if (showExport) {
      menuItems.push(`
        <button type="button" class="cerpspy-tools-item" id="cerpspyMenuExportCsv">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
            <path d="M13 10v3H3v-3M8 2v8m-3-3 3 3 3-3" />
          </svg>
          <div class="cerpspy-tools-item-text">
            <div class="cerpspy-tools-item-title">Export SERP to CSV</div>
            <div class="cerpspy-tools-item-sub">Download Top 10 rankings &amp; DR scores</div>
          </div>
        </button>
      `);
    }

    if (showPaa) {
      menuItems.push(`
        <button type="button" class="cerpspy-tools-item" id="cerpspyMenuCopyPaa">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
            <circle cx="8" cy="8" r="6" />
            <path d="M6 6.5a2 2 0 0 1 3.5 1.2c0 1.2-1.5 1.5-1.5 2.3" />
            <circle cx="8" cy="12" r="0.8" fill="currentColor" />
          </svg>
          <div class="cerpspy-tools-item-text">
            <div class="cerpspy-tools-item-title">Copy PAA Questions</div>
            <div class="cerpspy-tools-item-sub">Extract People Also Ask to clipboard</div>
          </div>
        </button>
      `);
    }

    if (showBookmark) {
      menuItems.push(`
        <button type="button" class="cerpspy-tools-item" id="cerpspyMenuCopyIntel">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          <div class="cerpspy-tools-item-text">
            <div class="cerpspy-tools-item-title">Copy Keyword Intel</div>
            <div class="cerpspy-tools-item-sub">Summary: Volume, CPC &amp; Competition</div>
          </div>
        </button>
      `);
    }

    if (showSerpFilters) {
      menuItems.push(`
        <button type="button" class="cerpspy-tools-item" id="cerpspyMenuFilterSerp">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
            <polygon points="2 3 14 3 9.5 9 9.5 13 6.5 13 6.5 9 2 3"></polygon>
          </svg>
          <div class="cerpspy-tools-item-text">
            <div class="cerpspy-tools-item-title">${currentSerpFilter !== 'all' ? 'Reset SERP (Show All)' : 'Filter SERP (DR ≤ 20)'}</div>
            <div class="cerpspy-tools-item-sub">${currentSerpFilter !== 'all' ? 'Restore all search results' : 'Isolate low-authority targets'}</div>
          </div>
        </button>
      `);
    }

    // Safety fallback: ensure menu is never blank
    if (menuItems.length === 0) {
      menuItems.push(`
        <button type="button" class="cerpspy-tools-item" id="cerpspyMenuExportCsv">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
            <path d="M13 10v3H3v-3M8 2v8m-3-3 3 3 3-3" />
          </svg>
          <div class="cerpspy-tools-item-text">
            <div class="cerpspy-tools-item-title">Export SERP to CSV</div>
            <div class="cerpspy-tools-item-sub">Download Top 10 rankings &amp; DR scores</div>
          </div>
        </button>
      `);
    }

    menu.innerHTML = menuItems.join('');

    function showMenu() {
      const rect = btn.getBoundingClientRect();
      const menuWidth = 220;
      let left = rect.right - menuWidth;
      if (left < 10) left = Math.max(10, rect.left);
      const top = rect.bottom + 5;

      menu.style.position = 'fixed';
      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;
      menu.style.display = 'block';
      menu.style.zIndex = '2147483647';
      btn.classList.add('is-open');
      applyThemeClass(menu);
    }

    function hideMenu() {
      if (menu) menu.style.display = 'none';
      if (btn) btn.classList.remove('is-open');
    }

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (menu.style.display === 'block') {
        hideMenu();
      } else {
        showMenu();
      }
    };

    btn.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        if (menu.style.display === 'block') hideMenu();
        else showMenu();
      }
    };

    const exportItem = menu.querySelector('#cerpspyMenuExportCsv');
    if (exportItem) {
      exportItem.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const success = exportSerpToCsv(query, kd);
        showMenuActionToast(btn, success ? '✓ CSV Exported' : 'No Data');
        hideMenu();
      };
    }

    const paaItem = menu.querySelector('#cerpspyMenuCopyPaa');
    if (paaItem) {
      paaItem.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await copyPaaQuestionsToClipboard(query, btn);
        hideMenu();
      };
    }

    const intelItem = menu.querySelector('#cerpspyMenuCopyIntel');
    if (intelItem) {
      intelItem.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await copyKeywordIntelSummary(query, kd, btn);
        hideMenu();
      };
    }

    const filterItem = menu.querySelector('#cerpspyMenuFilterSerp');
    if (filterItem) {
      filterItem.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentSerpFilter !== 'all') {
          currentSerpFilter = 'all';
          applySerpCardFilter('all', latestTopResults);
          updateSerpFilterBanner('all', latestTopResults);
          showMenuActionToast(btn, '✓ All Results Restored');
        } else {
          currentSerpFilter = 'low-dr';
          applySerpCardFilter('low-dr', latestTopResults);
          updateSerpFilterBanner('low-dr', latestTopResults);
          showMenuActionToast(btn, '✓ Filtered (DR ≤ 20)');
        }
        hideMenu();
      };
    }

    if (!menu.dataset.cerpspyListenersAttached) {
      menu.dataset.cerpspyListenersAttached = 'true';
      document.addEventListener('click', (e) => {
        if (menu && menu.style.display === 'block') {
          const currentBtn = document.getElementById('cerpspyBtnToolsDropdown');
          if (!menu.contains(e.target) && (!currentBtn || !currentBtn.contains(e.target))) {
            hideMenu();
          }
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menu && menu.style.display === 'block') {
          hideMenu();
        }
      });

      window.addEventListener('scroll', hideMenu, { passive: true });
      window.addEventListener('resize', hideMenu, { passive: true });
    }
  }

  /**
   * Injects and manages the floating monthly trend breakdown popover.
   * Features:
   * - 300ms hover grace period and invisible hover bridge so cursor never drops popover
   * - 1-Click to pin/unpin popover open
   * - Interactive candles (bars): hover/click any month to see exact volume readout
   */
  function attachSparklinePopover(strip, kd) {
    const trigger = strip.querySelector('#cerpspySparklineTrigger');
    if (!trigger || !Array.isArray(kd.monthlyBreakdown) || kd.monthlyBreakdown.length === 0) return;

    let popover = document.getElementById('cerpspyTrendPopover');
    if (!popover) {
      popover = document.createElement('div');
      popover.id = 'cerpspyTrendPopover';
      popover.className = 'cerpspy-trend-popover';
      document.body.appendChild(popover);
    }
    applyThemeClass(popover);

    const defaultAvgLabel = '12-Mo Avg:';
    const defaultAvgVal = `${kd.searchVolumeFormatted || '0'}/mo`;

    const maxV = Math.max(...kd.monthlyBreakdown.map(m => m.volume || 0)) || 1;
    const minV = Math.min(...kd.monthlyBreakdown.map(m => m.volume || 0)) || 0;
    const ratio = maxV / Math.max(1, minV);
    const exponent = ratio > 10 ? 0.40 : (ratio > 4 ? 0.60 : 1.0);

    const barsHtml = kd.monthlyBreakdown.map(m => {
      const rawFrac = Math.max(0, Math.min(1, (m.volume || 0) / maxV));
      const hPct = Math.max(14, Math.round(Math.pow(rawFrac, exponent) * 100));
      const isPeak = m.volume === maxV && maxV > 0;
      const monthStr = m.month || m.monthName || (m.label ? m.label.split(' ')[0] : '') || 'Mon';
      const labelStr = m.label || `${monthStr} ${m.year || ''}`.trim() || 'Month';
      const volStr = m.formattedVolume || (typeof m.volume === 'number' ? m.volume.toLocaleString() : '0');
      return `
        <div class="cerpspy-popover-col" data-label="${labelStr}" data-vol="${volStr}" data-month="${monthStr}">
          <div class="cerpspy-popover-bar-wrap">
            <div class="cerpspy-popover-bar ${isPeak ? 'is-peak' : ''}" style="height: ${hPct}%;"></div>
          </div>
          <span class="cerpspy-popover-month">${monthStr}</span>
        </div>
      `;
    }).join('');

    popover.innerHTML = `
      <div class="cerpspy-popover-header">
        <div class="cerpspy-popover-header-left">
          <span class="cerpspy-popover-title">12-Month Search Trend</span>
          <span class="cerpspy-popover-readout" id="cerpspyTrendReadout">
            <span class="cerpspy-readout-label">${defaultAvgLabel}</span>
            <strong class="cerpspy-readout-val">${defaultAvgVal}</strong>
          </span>
        </div>
        <button type="button" class="cerpspy-popover-close-btn" id="cerpspyBtnCloseTrend" title="Close (or click outside)">✕</button>
      </div>
      <div class="cerpspy-popover-chart">
        ${barsHtml}
      </div>
      <div class="cerpspy-popover-footer">
        <span class="cerpspy-popover-hint">Click or hover any month to inspect volume</span>
      </div>
    `;

    const readoutEl = popover.querySelector('#cerpspyTrendReadout');
    const closeBtn = popover.querySelector('#cerpspyBtnCloseTrend');
    const cols = popover.querySelectorAll('.cerpspy-popover-col');

    let hideTimer = null;
    let isPinned = false;
    let selectedCol = null;

    function updateReadout(label, val) {
      if (!readoutEl) return;
      readoutEl.innerHTML = `
        <span class="cerpspy-readout-label">${label}</span>
        <strong class="cerpspy-readout-val">${val}</strong>
      `;
    }

    function showPopover() {
      clearTimeout(hideTimer);
      const rect = trigger.getBoundingClientRect();
      const popoverWidth = 350;
      const maxLeft = Math.max(10, window.innerWidth - popoverWidth - 20 + window.scrollX);
      const targetLeft = Math.max(10, Math.min(rect.left + window.scrollX - 40, maxLeft));
      popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
      popover.style.left = `${targetLeft}px`;
      popover.style.display = 'block';
      applyThemeClass(popover);
    }

    function scheduleHide() {
      if (isPinned) return;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!isPinned) {
          popover.style.display = 'none';
          if (selectedCol) {
            selectedCol.classList.remove('is-active');
            selectedCol = null;
          }
          updateReadout(defaultAvgLabel, defaultAvgVal);
        }
      }, 300);
    }

    function cancelHide() {
      clearTimeout(hideTimer);
    }

    // Trigger events (hover + click to pin)
    trigger.addEventListener('mouseenter', showPopover);
    trigger.addEventListener('mouseleave', scheduleHide);

    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isPinned = !isPinned;
      if (isPinned) {
        showPopover();
      } else {
        popover.style.display = 'none';
      }
    });

    // Popover events
    popover.addEventListener('mouseenter', cancelHide);
    popover.addEventListener('mouseleave', scheduleHide);

    // Close button
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isPinned = false;
        popover.style.display = 'none';
        if (selectedCol) {
          selectedCol.classList.remove('is-active');
          selectedCol = null;
        }
        updateReadout(defaultAvgLabel, defaultAvgVal);
      });
    }

    // Interactive Candle (Bar) Hover & Click
    cols.forEach(col => {
      const lbl = col.getAttribute('data-label') || 'Month';
      const vol = col.getAttribute('data-vol') || '0';

      col.addEventListener('mouseenter', () => {
        cols.forEach(c => c.classList.remove('is-active'));
        col.classList.add('is-active');
        updateReadout(`${lbl}:`, `${vol}/mo`);
      });

      col.addEventListener('mouseleave', () => {
        if (selectedCol) {
          cols.forEach(c => c.classList.remove('is-active'));
          selectedCol.classList.add('is-active');
          const sLbl = selectedCol.getAttribute('data-label');
          const sVol = selectedCol.getAttribute('data-vol');
          updateReadout(`${sLbl}:`, `${sVol}/mo`);
        } else {
          col.classList.remove('is-active');
          updateReadout(defaultAvgLabel, defaultAvgVal);
        }
      });

      col.addEventListener('click', (e) => {
        e.stopPropagation();
        isPinned = true; // Pin popover when a candle is clicked
        if (selectedCol === col) {
          selectedCol.classList.remove('is-active');
          selectedCol = null;
          updateReadout(defaultAvgLabel, defaultAvgVal);
        } else {
          cols.forEach(c => c.classList.remove('is-active'));
          col.classList.add('is-active');
          selectedCol = col;
          updateReadout(`${lbl}:`, `${vol}/mo`);
        }
      });
    });

    // Dismiss on clicking outside (guarded against duplicate listener attachments)
    if (!popover.dataset.cerpspyListenersAttached) {
      popover.dataset.cerpspyListenersAttached = 'true';
      document.addEventListener('click', (e) => {
        if (popover && popover.style.display !== 'none') {
          if (!popover.contains(e.target) && !trigger.contains(e.target)) {
            isPinned = false;
            popover.style.display = 'none';
            if (selectedCol) {
              selectedCol.classList.remove('is-active');
              selectedCol = null;
            }
            updateReadout(defaultAvgLabel, defaultAvgVal);
          }
        }
      });

      // Dismiss on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popover && popover.style.display !== 'none') {
          isPinned = false;
          popover.style.display = 'none';
        }
      });
    }
  }


  /**
   * Safely formats domain registration date or domain age fallback.
   */
  function extractRegDateString(data) {
    if (!data) return '';
    const rd = data.registrationDate || data.age?.registrationDate;
    if (rd) {
      if (typeof rd === 'object') {
        if (rd.fullString) return rd.fullString;
        if (rd.shortString) return rd.shortString;
        if (rd.day && rd.monthName && rd.year) return `${rd.day} ${rd.monthName} ${rd.year}`;
        if (rd.year) return `${rd.monthName || ''} ${rd.year}`.trim();
      }
      if (typeof rd === 'string' && rd.trim()) {
        try {
          const d = new Date(rd);
          if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          }
        } catch (e) {}
        return rd.trim();
      }
    }
    // Fallback if exact date not yet available but age is known
    const ageFmt = data.ageFormatted || (data.age?.age ? formatDomainAgeShort(data.age.age) : null);
    if (ageFmt && ageFmt !== '—') {
      return `Est. ${ageFmt} old`;
    }
    if (data.isYoung) {
      return '< 1 year old';
    }
    return '';
  }

  /**
   * Generates clean HTML rows for weak competitors with badges and registration date metadata.
   */
  function renderCompetitorRowsHtml(competitors) {
    return competitors.map(comp => {
      const drVal = (comp.dr !== null && comp.dr !== undefined) ? comp.dr : (comp.da !== null && comp.da !== undefined ? `DA ${comp.da}` : '—');
      const drPill = `<span class="cerpspy-opp-mini-badge is-dr" title="Domain Authority Rating: ${drVal}">DR ${drVal}</span>`;
      const agePill = comp.ageFormatted
        ? `<span class="cerpspy-opp-mini-badge is-age" title="Domain Age: ${comp.ageFormatted}">Age ${comp.ageFormatted}</span>`
        : (comp.isYoung ? '<span class="cerpspy-opp-mini-badge is-age" title="Young Domain (< 1 Year)">🌱 &lt; 1y</span>' : '');

      let dateVal = comp.regDate;
      if (!dateVal && comp.ageFormatted) {
        dateVal = `Est. ${comp.ageFormatted} old`;
      } else if (!dateVal && comp.isYoung) {
        dateVal = '&lt; 1 year old';
      } else if (!dateVal) {
        dateVal = 'Pending RDAP';
      }

      return `
        <div class="cerpspy-opp-competitor-item" data-cerpspy-rank="${comp.rank}" data-cerpspy-domain="${escapeHtml(comp.domain)}" title="Click to view this result on Google SERP">
          <div class="cerpspy-opp-competitor-row">
            <span class="cerpspy-opp-domain-name" title="${escapeHtml(comp.domain)}">${escapeHtml(comp.domain)}</span>
            <div class="cerpspy-opp-mini-badges">
              <span class="cerpspy-opp-mini-badge is-rank">Rank #${comp.rank}</span>
              ${drPill}
              ${agePill}
            </div>
          </div>
          <div class="cerpspy-opp-date-meta">
            <span>📅 Reg Date: <strong>${dateVal}</strong></span>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Injects and manages the floating SERP Opportunity & Weakness breakdown popover.
   * Matches the cerpspy Extension Popup card and badge design system.
   */
  function attachOpportunityPopover(trigger, info) {
    if (!trigger || !info || !isExtensionValid()) return;
    try {
      let popover = document.getElementById('cerpspyOppPopover');
      const wasOpen = popover && popover.style.display === 'block';

      if (!popover) {
        popover = document.createElement('div');
        popover.id = 'cerpspyOppPopover';
        popover.className = 'cerpspy-opp-popover';
        document.body.appendChild(popover);
      }
      applyThemeClass(popover);

      // Combine all rankable target websites in the top 10 (DR <= 20 or young site < 1 yr)
      const displayLowDr = (info.lowDrTop10 && info.lowDrTop10.length > 0) ? info.lowDrTop10 : (info.top5Weak || []);
      const otherYoungSites = (info.topResults || []).slice(0, 10).filter(r => r.isYoung && !displayLowDr.some(l => l.domain === r.domain));
      const allTargets = [...displayLowDr];
      otherYoungSites.forEach(y => {
        if (!allTargets.some(t => t.domain === y.domain)) {
          allTargets.push(y);
        }
      });
      allTargets.sort((a, b) => (a.rank || 99) - (b.rank || 99));

      // Target rows HTML
      let targetsHtml = '';
      if (allTargets.length > 0) {
        targetsHtml = `
          <div class="cerpspy-opp-card">
            <div class="cerpspy-opp-card-label" style="display:flex;justify-content:space-between;align-items:center;">
              <span>RANKABLE TARGETS IN TOP 10</span>
              <span style="color:#10B981;font-weight:700;">${allTargets.length} FOUND</span>
            </div>
            ${renderCompetitorRowsHtml(allTargets)}
          </div>
        `;
      } else {
        targetsHtml = `
          <div class="cerpspy-opp-card cerpspy-opp-empty-box">
            <div style="font-size:16px;margin-bottom:4px;">🛡️</div>
            <div style="font-size:12px;font-weight:700;color:var(--cerpspy-text-primary);margin-bottom:3px;">High Authority SERP</div>
            <p style="font-size:11px;color:var(--cerpspy-text-secondary);line-height:1.4;margin:0;">No low-authority weak spots (DR ≤ 20) in Top 10. Established domains dominate this query. Target longer-tail variations.</p>
          </div>
        `;
      }

      // Strategy & Insights HTML
      let forumCardHtml = '';
      if (info.forumInTop5) {
        forumCardHtml = `
          <div class="cerpspy-opp-card">
            <div class="cerpspy-opp-card-label">FORUM GAP IN TOP 5</div>
            <div class="cerpspy-opp-competitor-item" data-cerpspy-rank="${info.forumInTop5.rank}" data-cerpspy-domain="${info.forumInTop5.domain}">
              <div class="cerpspy-opp-competitor-row">
                <span class="cerpspy-opp-domain-name" title="${info.forumInTop5.domain}">${info.forumInTop5.domain}</span>
                <div class="cerpspy-opp-mini-badges">
                  <span class="cerpspy-opp-mini-badge is-rank">Rank #${info.forumInTop5.rank}</span>
                  <span class="cerpspy-opp-mini-badge" style="background:rgba(234,179,8,0.18);color:#EAB308;">Discussion Forum</span>
                </div>
              </div>
              <div class="cerpspy-opp-card-desc" style="margin-top:4px;">
                Google ranks discussion forum threads when dedicated standalone articles are missing. Great opportunity to publish structured content.
              </div>
            </div>
          </div>
        `;
      }

      const barrierCardHtml = `
        <div class="cerpspy-opp-card">
          <div class="cerpspy-opp-card-label">AUTHORITY BARRIER</div>
          <div class="cerpspy-opp-card-desc">${info.barrierText}</div>
        </div>
      `;

      const recCardHtml = `
        <div class="cerpspy-opp-card">
          <div class="cerpspy-opp-card-label">STRATEGIC RECOMMENDATION</div>
          <div class="cerpspy-opp-card-desc">${info.recommendationText}</div>
        </div>
      `;

      const avgDrVal = typeof info.avgDr === 'number' ? info.avgDr : null;
      const avgBarColor = (avgDrVal && avgDrVal >= 75) ? '#EF4444' : ((avgDrVal && avgDrVal >= 40) ? '#F59E0B' : '#10B981');
      const avgDrHtml = avgDrVal !== null ? `
        <div class="cerpspy-opp-avg-row">
          <span>Top 10 Avg DR: <strong>${avgDrVal}</strong>/100</span>
          <div class="cerpspy-opp-avg-gauge">
            <div class="cerpspy-opp-avg-fill" style="width: ${Math.min(100, Math.max(8, avgDrVal))}%; background: ${avgBarColor};"></div>
          </div>
        </div>
      ` : '';

      // Filter controls inside popover (Option A)
      let filterBarHtml = '';
      const hasFilterableTargets = (displayLowDr.length > 0 || otherYoungSites.length > 0);
      if (showSerpFilters && hasFilterableTargets) {
        filterBarHtml = `
          <div class="cerpspy-opp-filter-row">
            <span class="cerpspy-opp-filter-lbl">Filter SERP:</span>
            <div class="cerpspy-opp-filter-buttons">
              <button type="button" class="cerpspy-opp-filter-pill ${currentSerpFilter === 'all' ? 'is-active' : ''}" data-filter="all">All (${(info.topResults || []).slice(0, 10).length})</button>
              ${displayLowDr.length > 0 ? `<button type="button" class="cerpspy-opp-filter-pill ${currentSerpFilter === 'low-dr' ? 'is-active' : ''}" data-filter="low-dr">🎯 DR ≤ 20 (${displayLowDr.length})</button>` : ''}
              ${otherYoungSites.length > 0 ? `<button type="button" class="cerpspy-opp-filter-pill ${currentSerpFilter === 'young' ? 'is-active' : ''}" data-filter="young">🌱 Young (${otherYoungSites.length})</button>` : ''}
            </div>
          </div>
        `;
      }

      popover.innerHTML = `
        <div class="cerpspy-opp-popover-header">
          <div class="cerpspy-opp-popover-brand">
            <img src="${safeGetURL('icons/icon-48.png')}" class="cerpspy-opp-brand-logo" alt="cerpspy" width="18" height="18" />
            <span class="cerpspy-opp-brand-name">cerpspy</span>
            <span class="cerpspy-opp-brand-tag">SERP INTEL</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="cerpspy-opp-popover-badge ${info.badgeClass}">${info.badgeTitle}</span>
            <button type="button" class="cerpspy-popover-close-btn" id="cerpspyBtnCloseOpp" title="Close">✕</button>
          </div>
        </div>

      <div class="cerpspy-opp-tab-nav">
        <button type="button" class="cerpspy-opp-tab-btn is-active" data-tab="targets">
          🎯 Targets (${allTargets.length})
        </button>
        <button type="button" class="cerpspy-opp-tab-btn" data-tab="strategy">
          💡 Strategy &amp; Barrier
        </button>
      </div>

      <div class="cerpspy-opp-tab-pane is-active" data-pane="targets">
        ${filterBarHtml}
        ${targetsHtml}
        ${avgDrHtml}
      </div>

      <div class="cerpspy-opp-tab-pane" data-pane="strategy">
        ${barrierCardHtml}
        ${recCardHtml}
        ${forumCardHtml}
      </div>

      <div class="cerpspy-opp-footer-meta" style="display:flex;justify-content:space-between;align-items:center;">
        <button type="button" class="cerpspy-opp-export-btn" id="cerpspyBtnExportOppTable" title="Copy top SERP competitors table to clipboard (for Excel / Sheets)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
          </svg>
          Export Table
        </button>
        <span>cerpspy Opportunity Scanner</span>
      </div>
    `;

    // Segmented tab switching
    const tabBtns = popover.querySelectorAll('.cerpspy-opp-tab-btn');
    const tabPanes = popover.querySelectorAll('.cerpspy-opp-tab-pane');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetTab = btn.getAttribute('data-tab');
        tabBtns.forEach(b => b.classList.toggle('is-active', b === btn));
        tabPanes.forEach(p => p.classList.toggle('is-active', p.getAttribute('data-pane') === targetTab));
      });
    });

    // In-popover filter buttons click handlers
    popover.querySelectorAll('.cerpspy-opp-filter-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const filterType = pill.getAttribute('data-filter');
        if (pill.classList.contains('is-active') && filterType !== 'all') {
          currentSerpFilter = 'all';
        } else {
          currentSerpFilter = filterType;
        }
        popover.querySelectorAll('.cerpspy-opp-filter-pill').forEach(p => {
          p.classList.toggle('is-active', p.getAttribute('data-filter') === currentSerpFilter);
        });
        applySerpCardFilter(currentSerpFilter, info.topResults);
        updateSerpFilterBanner(currentSerpFilter, info.topResults);
      });
    });

    // Click competitor row to scroll to Google SERP result
    popover.querySelectorAll('.cerpspy-opp-competitor-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const domain = item.getAttribute('data-cerpspy-domain');
        let targetCard = null;
        if (domain) {
          const badge = document.querySelector(`.cerpspy-serp-badge-container[data-cerpspy-domain="${domain}"]`);
          if (badge) {
            targetCard = badge.closest('.yuRUbf, .tF2Cxc, div.g, .g') || badge.parentElement;
          }
        }
        if (!targetCard) {
          const rank = parseInt(item.getAttribute('data-cerpspy-rank'), 10);
          if (!isNaN(rank)) {
            const headings = Array.from(document.querySelectorAll('h3, div[role="heading"][aria-level="3"]')).filter(h => {
              const card = h.closest('.yuRUbf, .tF2Cxc, div.g, .g') || h.parentElement;
              return card && !isExcludedElement(h) && !isExcludedElement(card);
            });
            const targetHeading = headings[rank - 1];
            targetCard = targetHeading ? (targetHeading.closest('.yuRUbf, .tF2Cxc, div.g, .g') || targetHeading) : null;
          }
        }
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetCard.style.outline = '2px solid #10B981';
          targetCard.style.outlineOffset = '4px';
          targetCard.style.borderRadius = '8px';
          setTimeout(() => {
            targetCard.style.outline = 'none';
          }, 2500);
        }
      });
    });

    // 1-Click Copy SERP Table to Clipboard (formatted for Excel / Google Sheets)
    const exportBtn = popover.querySelector('#cerpspyBtnExportOppTable');
    if (exportBtn && Array.isArray(info.topResults) && info.topResults.length > 0) {
      exportBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const query = extractSearchQuery() || '';
        const rows = [
          ['Rank', 'Domain', 'DR', 'DA', 'Age', 'Type', 'Search Query']
        ];

        info.topResults.forEach(r => {
          const type = r.isForum ? 'Forum' : (r.isYoung ? 'Young Site' : ((r.dr !== null && r.dr <= 20) ? 'Weak Domain' : 'Standard'));
          rows.push([
            r.rank,
            r.domain,
            r.dr !== null ? r.dr : '—',
            r.da !== null ? r.da : '—',
            r.ageFormatted || '—',
            type,
            query
          ]);
        });

        // Tab-delimited formatting enables direct pasting into Google Sheets & Excel cells
        const tsv = rows.map(cols => cols.join('\t')).join('\n');

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(tsv);
          } else {
            const ta = document.createElement('textarea');
            ta.value = tsv;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
          }

          const originalContent = exportBtn.innerHTML;
          exportBtn.innerHTML = `
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" style="margin-right:4px;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span style="color:#10B981;font-weight:700;">Copied Table!</span>
          `;
          setTimeout(() => {
            exportBtn.innerHTML = originalContent;
          }, 2000);
        } catch (err) {
          console.warn('[cerpspy] Table export failed:', err);
        }
      };
    } else if (exportBtn) {
      exportBtn.style.display = 'none';
    }

    function show() {
      const rect = trigger.getBoundingClientRect();
      popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
      popover.style.left = `${Math.max(10, rect.left + window.scrollX - 20)}px`;
      popover.style.display = 'block';
      applyThemeClass(popover);
    }

    function hide() {
      popover.style.display = 'none';
    }

    if (wasOpen) {
      show();
    }

    trigger.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (popover.style.display === 'block') hide();
      else show();
    };

    const closeBtn = popover.querySelector('#cerpspyBtnCloseOpp');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        hide();
      };
    }

    // Dismiss on clicking outside (guarded against duplicate listener attachments)
    if (!popover.dataset.cerpspyListenersAttached) {
      popover.dataset.cerpspyListenersAttached = 'true';
      document.addEventListener('click', (e) => {
        if (popover && popover.style.display === 'block') {
          if (!popover.contains(e.target) && !trigger.contains(e.target)) {
            hide();
          }
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popover && popover.style.display === 'block') {
          hide();
        }
      });
    }
  } catch (err) {
    if (String(err?.message || err).includes('Extension context invalidated')) {
      isContextInvalidated = true;
      showExtensionReloadBanner();
    }
  }
}

  /**
   * Evaluates top SERP search results to identify ranking weaknesses and opportunities:
   * 1. Top 5 weak competitors (DR <= 20 or young site < 1 yr)
   * 2. Top 10 positions 6-10 weak competitors (DR <= 20 or young site)
   * 3. Forum gap in Top 5 (Reddit, Quora, etc.)
   * 4. High Authority / Moderate competition average DR
   */
  /**
   * Applies client-side instant filtering to Google organic search result cards.
   * Runs in 0ms client-side with 0 API calls and 0 credits.
   */
  function applySerpCardFilter(filterType, topResults, isDrBelow20Fn) {
    const isBelow20 = isDrBelow20Fn || ((r) => (typeof r.dr === 'number' && r.dr <= 20) || (typeof r.da === 'number' && r.da <= 20));
    const headings = Array.from(document.querySelectorAll('h3, div[role="heading"][aria-level="3"]')).filter(h => {
      const card = h.closest('.yuRUbf, .tF2Cxc, div.g, .g') || h.parentElement;
      return card && !isExcludedElement(h) && !isExcludedElement(card);
    });

    headings.forEach(heading => {
      const card = heading.closest('.yuRUbf, .tF2Cxc, div.g, .g') || heading.parentElement;
      if (!card) return;
      const a = heading.closest('a') || heading.querySelector('a') || card.querySelector('a[href^="http"]');
      if (!a || !a.href) return;
      const domain = extractRootDomain(a.href);
      const item = topResults ? topResults.find(r => r.domain === domain) : null;

      let showCard = true;
      if (filterType === 'low-dr') {
        showCard = Boolean(item && isBelow20(item));
      } else if (filterType === 'young') {
        showCard = Boolean(item && item.isYoung);
      }

      if (showCard) {
        card.classList.remove('cerpspy-filter-hidden');
        card.style.removeProperty('display');
      } else {
        card.classList.add('cerpspy-filter-hidden');
        card.style.setProperty('display', 'none', 'important');
      }
    });
  }

  /**
   * Floating banner displayed whenever an active in-page SERP filter is applied.
   * Clearly alerts the user that results are filtered and provides a 1-click reset.
   */
  function updateSerpFilterBanner(filterType, topResults) {
    let banner = document.getElementById('cerpspySerpFilterBanner');
    if (filterType === 'all' || !filterType) {
      banner?.remove();
      return;
    }

    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'cerpspySerpFilterBanner';
      banner.className = 'cerpspy-serp-filter-banner';
      document.body.appendChild(banner);
    }
    applyThemeClass(banner);

    const filterLabel = filterType === 'low-dr' ? 'DR ≤ 20' : 'Young Websites';
    const matchCount = filterType === 'low-dr'
      ? (topResults ? topResults.filter(r => (r.dr !== null && r.dr <= 20) || (r.da !== null && r.da <= 20)).length : 1)
      : (topResults ? topResults.filter(r => r.isYoung).length : 1);

    banner.innerHTML = `
      <div class="cerpspy-filter-banner-content">
        <span class="cerpspy-filter-banner-text">
          🔍 Filtered SERP: Showing <strong>${matchCount}</strong> result${matchCount === 1 ? '' : 's'} (${filterLabel})
        </span>
        <button type="button" class="cerpspy-filter-banner-reset" id="cerpspyBtnResetFilter" title="Click to show all Google organic search results">
          Show All Results ✕
        </button>
      </div>
    `;

    const resetBtn = banner.querySelector('#cerpspyBtnResetFilter');
    if (resetBtn) {
      resetBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        currentSerpFilter = 'all';
        applySerpCardFilter('all', topResults);
        banner.remove();
        document.querySelectorAll('.cerpspy-opp-filter-pill').forEach(b => {
          b.classList.toggle('is-active', b.getAttribute('data-filter') === 'all');
        });
      };
    }
  }

  /**
   * Scans all organic ranking results currently on the page and updates
   * the Top Search Bar Intel Strip with single-line interactive filters and ranking verdict.
   * Everything lives in ONE unified line in sequence, with zero collision with Google tabs.
   */
  function updateSerpOpportunityPill() {
    if (!isExtensionValid()) return;
    const container = document.getElementById('cerpspyOppContainer');
    // Ensure any leftover separate filterBar is completely removed
    document.getElementById('cerpspyFilterBar')?.remove();

    if (!container) return;
    if (!showOpportunity && !showSerpFilters) {
      container.innerHTML = '';
      document.querySelectorAll('.cerpspy-filter-hidden').forEach(c => {
        c.classList.remove('cerpspy-filter-hidden');
        c.style.removeProperty('display');
      });
      adjustGoogleLayoutForStrip(true);
      return;
    }

    const headings = Array.from(document.querySelectorAll('h3, div[role="heading"][aria-level="3"]')).filter(h => {
      const card = h.closest('.yuRUbf, .tF2Cxc, div.g, .g') || h.parentElement;
      return card && !isExcludedElement(h) && !isExcludedElement(card);
    });

    if (headings.length === 0) {
      container.innerHTML = '';
      return;
    }

    const seenCards = new Set();
    const seenDomains = new Set();
    const topResults = [];

    headings.forEach((heading) => {
      const card = heading.closest('.yuRUbf, .tF2Cxc, div.g, .g') || heading.parentElement;
      if (card && seenCards.has(card)) return;

      const a = heading.closest('a') || heading.querySelector('a') || card?.querySelector('a[href^="http"]');
      if (!a || !a.href) return;
      const domain = extractRootDomain(a.href);
      if (!domain || domain.includes('google.') || domain === 'schema.org' || seenDomains.has(domain)) return;

      if (card) seenCards.add(card);
      seenDomains.add(domain);

      const data = contentDomainCache.get(domain) || null;
      let dr = null;
      if (data && data.dr !== undefined && data.dr !== null) {
        if (typeof data.dr.dr === 'number') dr = Math.round(data.dr.dr);
        else if (typeof data.dr === 'number') dr = Math.round(data.dr);
      }
      let da = null;
      if (data && data.da !== undefined && data.da !== null) {
        if (typeof data.da.da === 'number') da = Math.round(data.da.da);
        else if (typeof data.da === 'number') da = Math.round(data.da);
      }

      const isYoung = Boolean(data?.isYoung || (data?.age?.age && ((data.age.age.totalMonths || 0) < 12)));
      const ageFormatted = data?.ageFormatted || (data?.age?.age ? formatDomainAgeShort(data.age.age) : null);
      const regDate = extractRegDateString(data);

      topResults.push({
        rank: topResults.length + 1,
        domain,
        dr,
        da,
        isYoung,
        ageFormatted,
        regDate,
        isForum: isForumDomain(domain)
      });
    });

    if (topResults.length === 0) return;

    // DR <= 20 filter: purely by domain rating (DR <= 20 or DA <= 20) across all top 10
    const isDrBelow20 = (r) => {
      if (typeof r.dr === 'number' && !isNaN(r.dr)) return r.dr <= 20;
      if (typeof r.da === 'number' && !isNaN(r.da)) return r.da <= 20;
      return false;
    };
    const lowDrTop10 = topResults.slice(0, 10).filter(isDrBelow20);
    const youngTop10 = topResults.slice(0, 10).filter(r => r.isYoung);

    const isWeak = (r) => isDrBelow20(r) || r.isYoung;
    const top5 = topResults.slice(0, 5);
    const top5Weak = top5.filter(isWeak);
    const pos6to10 = topResults.slice(5, 10);
    const pos6to10Weak = pos6to10.filter(isWeak);

    const forumInTop5 = top5.find(r => r.isForum);

    // Calculate average DR of top 10
    const resolvedDrs = topResults.slice(0, 10).map(r => r.dr).filter(d => typeof d === 'number');
    const avgDr = resolvedDrs.length > 0 ? Math.round(resolvedDrs.reduce((a, b) => a + b, 0) / resolvedDrs.length) : null;

    let pillType = '';
    let pillText = '';
    let popoverBadgeTitle = '';
    let popoverBadgeClass = '';
    let barrierText = '';
    let recommendationText = '';
    let pillTooltip = 'Click to view cerpspy SERP ranking intel';

    if (lowDrTop10.length > 0) {
      pillType = 'is-opportunity';
      pillText = lowDrTop10.length === 1
        ? `#${lowDrTop10[0].rank} DR ${lowDrTop10[0].dr !== null ? lowDrTop10[0].dr : (lowDrTop10[0].da !== null ? lowDrTop10[0].da : '≤ 20')}`
        : `${lowDrTop10.length} Sites DR ≤ 20`;
      pillTooltip = `${lowDrTop10.length} websites in the Top 10 are below DR 20. Click to view rankable opportunities.`;
      popoverBadgeTitle = 'High Opportunity: Rankable';
      popoverBadgeClass = 'is-opportunity';
      barrierText = `Heavy legacy backlinks and DR 70+ authority are NOT required. Multiple accessible domains (DR ≤ 20) rank in the Top 10.`;
      recommendationText = `Build a high-velocity, intent-focused solution or calculator to capture this ranking gap and displace weak competitors.`;
    } else if (top5Weak.length > 0 || pos6to10Weak.length > 0) {
      const youngList = [...top5Weak, ...pos6to10Weak].filter(r => r.isYoung);
      if (youngList.length > 0) {
        pillType = 'is-opportunity';
        pillText = `Young Site (#${youngList[0].rank})`;
        pillTooltip = `New domain under 1 year old ranks at #${youngList[0].rank}. Click to view ranking intel.`;
        popoverBadgeTitle = 'Page 1 Opportunity: Young Domain';
        popoverBadgeClass = 'is-opportunity';
        barrierText = `Newer domains under 1 year old are currently ranking in the Top 10, proving fresh content can penetrate Page 1.`;
        recommendationText = `Target content recency and search intent match to compete alongside newly indexed competitors.`;
      }
    } else if (forumInTop5) {
      pillType = 'is-opportunity';
      const shortDomain = forumInTop5.domain.replace(/\.com$/, '');
      pillText = `Forum Gap (${shortDomain})`;
      pillTooltip = `Discussion forum (${shortDomain}) ranks in the Top 5. Click to view content gap.`;
      popoverBadgeTitle = 'Forum Gap: Content Deficit';
      popoverBadgeClass = 'is-opportunity';
      barrierText = `Google defaults to user forum threads when dedicated, authoritative standalone guides are lacking.`;
      recommendationText = `Build a comprehensive, structured guide to decisively outrank the unorganized forum thread.`;
    } else if (avgDr !== null && avgDr >= 75) {
      pillType = 'is-hard';
      pillText = `Avg DR ${avgDr}`;
      pillTooltip = `High authority SERP: Top 10 averages DR ${avgDr}. Click to view details.`;
      popoverBadgeTitle = 'High Authority Dominated';
      popoverBadgeClass = 'is-hard';
      barrierText = `Page 1 is heavily contested by established enterprise brands and legacy domains averaging DR ${avgDr}.`;
      recommendationText = `Target longer-tail semantic keyword variants with lower authority competition first.`;
    } else if (avgDr !== null) {
      pillType = 'is-moderate';
      pillText = `Avg DR ${avgDr}`;
      pillTooltip = `Moderate competition: Top 10 averages DR ${avgDr}. Click to view details.`;
      popoverBadgeTitle = 'Moderate Competition';
      popoverBadgeClass = 'is-moderate';
      barrierText = `Balanced SERP landscape with mid-tier domain authority averaging DR ${avgDr}.`;
      recommendationText = `Requires quality on-page optimization, direct search intent match, and targeted foundational links.`;
    }

    const popoverData = {
      badgeTitle: popoverBadgeTitle,
      badgeClass: popoverBadgeClass,
      top5Weak,
      pos6to10Weak,
      lowDrTop10,
      forumInTop5,
      barrierText,
      recommendationText,
      avgDr,
      topResults
    };

    latestTopResults = topResults;

    // Option A: The Search Bar Strip ALWAYS renders the Opportunity Badge cleanly!
    // It NEVER splits into multiple chips or shows a confusing ℹ️ icon.
    // Clicking the badge ALWAYS opens the SERP Intel Popover.
    if (showOpportunity && pillText) {
      container.innerHTML = `
        <span class="cerpspy-opp-pill ${pillType}" id="cerpspyOppPillTrigger" title="${pillTooltip}">
          <span class="cerpspy-opp-dot"></span>
          <span>${pillText}</span>
        </span>
      `;

      const trigger = container.querySelector('#cerpspyOppPillTrigger');
      if (trigger) {
        attachOpportunityPopover(trigger, popoverData);
      }
    } else {
      container.innerHTML = '';
      document.querySelectorAll('.cerpspy-filter-hidden').forEach(c => {
        c.classList.remove('cerpspy-filter-hidden');
        c.style.removeProperty('display');
      });
    }

    // Apply any active in-page filter state and update reset banner
    applySerpCardFilter(currentSerpFilter, topResults, isDrBelow20);
    updateSerpFilterBanner(currentSerpFilter, topResults);

    adjustGoogleLayoutForStrip(true);
  }

  /**
   * Renders the Top Search Bar Intel Strip with live volume, CPC, and trend.
   * Completely immune to layout jumping, flickering, or DOM mutation feedback loops.
   */
  async function renderSearchBarStrip(forceRefresh = false) {
    if (!isExtensionValid()) return;
    if (!searchBarPanelEnabled) {
      document.getElementById(SEARCHBAR_PANEL_ID)?.remove();
      document.getElementById('cerpspyFilterBar')?.remove();
      document.querySelectorAll('.cerpspy-filter-hidden').forEach(c => {
        c.classList.remove('cerpspy-filter-hidden');
        c.style.removeProperty('display');
      });
      document.getElementById('cerpspy-sidebar-container')?.remove();
      adjustGoogleLayoutForStrip(false);
      return;
    }

    const query = extractSearchQuery();
    if (!query) {
      document.getElementById(SEARCHBAR_PANEL_ID)?.remove();
      document.getElementById('cerpspyFilterBar')?.remove();
      document.querySelectorAll('.cerpspy-filter-hidden').forEach(c => {
        c.classList.remove('cerpspy-filter-hidden');
        c.style.removeProperty('display');
      });
      document.getElementById('cerpspy-sidebar-container')?.remove();
      adjustGoogleLayoutForStrip(false);
      return;
    }

    const cleanKw = cleanKeywordForVolume(query);
    if (!cleanKw) return;

    // IMMEDIATE ZERO-COST GUARD:
    // If the strip already exists, is already populated with metrics for this exact clean query,
    // and not force refreshing -> EXIT IMMEDIATELY in 0ms! Never recalculate layout or shift styles!
    const existingStrip = document.getElementById(SEARCHBAR_PANEL_ID);
    if (!forceRefresh && existingStrip && existingStrip.getAttribute('data-cerpspy-query') === cleanKw && existingStrip.getAttribute('data-cerpspy-loaded') === 'true') {
      updateSerpOpportunityPill();
      return;
    }

    const rawCountry = detectSearchCountry();
    const country = normalizeKWLocation(rawCountry);
    const network = kwNetwork === 'google_search_and_partners' ? 'google_search_and_partners' : 'google_search';
    const cacheKey = `kw_${country}_${network}_${cleanKw}`;

    if (forceRefresh) {
      contentKeywordCache.delete(cacheKey);
    }

    // 0ms In-Memory Instant Render (guarantees zero-flicker across Google DOM mutations)
    if (!forceRefresh) {
      const memKd = contentKeywordCache.get(cacheKey);
      if (memKd && memKd.success) {
        const strip = getOrCreateSearchBarStrip();
        if (!strip) return;
        strip.removeAttribute('data-cerpspy-loading');
        strip.innerHTML = buildSearchBarHtml(memKd, query);
        strip.setAttribute('data-cerpspy-query', cleanKw);
        strip.setAttribute('data-cerpspy-loaded', 'true');
        if (Array.isArray(memKd.monthlyBreakdown) && memKd.monthlyBreakdown.length > 0) {
          attachSparklinePopover(strip, memKd);
        }
        updateSerpOpportunityPill();
        alignStripWithSearchInput(strip);
        adjustGoogleLayoutForStrip(true);
        attachSearchBarInteractions(strip, memKd, query);
        return;
      }
    }

    // 0ms Persistent Storage Cache Check for this exact country, network, and keyword
    if (!forceRefresh && typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get([cacheKey]);
        const storedKd = stored?.[cacheKey]?.data;
        if (storedKd && storedKd.success) {
          contentKeywordCache.set(cacheKey, storedKd);
          const strip = getOrCreateSearchBarStrip();
          if (strip) {
            strip.removeAttribute('data-cerpspy-loading');
            strip.innerHTML = buildSearchBarHtml(storedKd, query);
            strip.setAttribute('data-cerpspy-query', cleanKw);
            strip.setAttribute('data-cerpspy-loaded', 'true');
            if (Array.isArray(storedKd.monthlyBreakdown) && storedKd.monthlyBreakdown.length > 0) {
              attachSparklinePopover(strip, storedKd);
            }
            updateSerpOpportunityPill();
            alignStripWithSearchInput(strip);
            adjustGoogleLayoutForStrip(true);
            attachSearchBarInteractions(strip, storedKd, query);
          }
          return;
        }
      } catch (e) {}
    }

    const strip = getOrCreateSearchBarStrip();
    if (!strip) return;

    alignStripWithSearchInput(strip);
    adjustGoogleLayoutForStrip(true);
    strip.setAttribute('data-cerpspy-query', cleanKw);
    applyThemeClass(strip);

    // CREDIT SAVER MODE: If user disabled auto-fetch and this query is not in cache,
    // display an on-demand "Load Volume & CPC" chip so credits are never wasted on casual searches.
    if (!autoFetchKeywords && !forceRefresh) {
      strip.removeAttribute('data-cerpspy-loading');
      strip.setAttribute('data-cerpspy-query', cleanKw);
      strip.innerHTML = buildCreditSaverStripHtml(query);
      updateSerpOpportunityPill();
      alignStripWithSearchInput(strip);
      adjustGoogleLayoutForStrip(true);

      strip.querySelector('#cerpspyBtnFetchKw')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        renderSearchBarStrip(true);
      });
      attachSearchBarInteractions(strip, null, query);
      return;
    }

    // Initial loading placeholder (only show if not already displaying valid metrics for this clean query)
    const isAlreadyLoaded = (strip.getAttribute('data-cerpspy-query') === cleanKw && strip.getAttribute('data-cerpspy-loaded') === 'true');
    if (!isAlreadyLoaded && strip.getAttribute('data-cerpspy-loading') !== cleanKw) {
      strip.setAttribute('data-cerpspy-loading', cleanKw);
      strip.innerHTML = `
        ${showVolume ? '<span class="cerpspy-kw-item"><span class="cerpspy-kw-lbl">Volume:</span> <strong class="cerpspy-kw-val pulse">...</strong></span>' : ''}
        ${showVolume && (showCpc || showTrend) ? '<span class="cerpspy-kw-sep">|</span>' : ''}
        ${showCpc ? '<span class="cerpspy-kw-item"><span class="cerpspy-kw-lbl">CPC:</span> <strong class="cerpspy-kw-val pulse">...</strong></span>' : ''}
        ${showCpc && showTrend ? '<span class="cerpspy-kw-sep">|</span>' : ''}
        ${showTrend ? '<span class="cerpspy-kw-item"><span class="cerpspy-kw-lbl">Trend:</span> <strong class="cerpspy-kw-val pulse">...</strong></span>' : ''}
      `;
    }

    // Concurrency control: if a lookup is already in-flight for this exact cacheKey, reuse its promise
    if (!forceRefresh && inFlightKeywordRequests.has(cacheKey)) {
      try {
        const response = await inFlightKeywordRequests.get(cacheKey);
        const curStrip = document.getElementById(SEARCHBAR_PANEL_ID);
        if (curStrip && curStrip.getAttribute('data-cerpspy-query') === cleanKw) {
          const kd = (response && response.data && response.data.success) ? response.data : null;
          curStrip.removeAttribute('data-cerpspy-loading');
          if (kd) {
            contentKeywordCache.set(cacheKey, kd);
            curStrip.innerHTML = buildSearchBarHtml(kd, query);
            curStrip.setAttribute('data-cerpspy-loaded', 'true');
            if (Array.isArray(kd.monthlyBreakdown) && kd.monthlyBreakdown.length > 0) {
              attachSparklinePopover(curStrip, kd);
            }
            updateSerpOpportunityPill();
          } else if (response && (response.discontinued || response.data?.discontinued)) {
            curStrip.innerHTML = buildSearchBarDiscontinuedHtml(query);
            curStrip.setAttribute('data-cerpspy-loaded', 'true');
            updateSerpOpportunityPill();
          } else {
            curStrip.innerHTML = buildSearchBarRetryHtml(query);
          }
          alignStripWithSearchInput(curStrip);
          adjustGoogleLayoutForStrip(true);
          attachSearchBarInteractions(curStrip, kd, query);
        }
      } catch (_) {}
      return;
    }

    // Safety timeout: if the strip is still showing "..." after 18 seconds,
    // automatically replace it with the Retry button so the user is never stuck.
    const safetyTimer = setTimeout(() => {
      const safeStrip = document.getElementById(SEARCHBAR_PANEL_ID);
      if (safeStrip && safeStrip.getAttribute('data-cerpspy-loading') === cleanKw) {
        safeStrip.removeAttribute('data-cerpspy-loading');
        safeStrip.innerHTML = buildSearchBarRetryHtml(query);
        attachSearchBarInteractions(safeStrip, null, query);
      }
    }, 18000);

    const fetchPromise = safeSendMessage({
      action: 'GET_KEYWORD_DATA',
      keyword: query,
      country,
      network,
      forceRefresh
    }, 20000, 1);

    inFlightKeywordRequests.set(cacheKey, fetchPromise);

    try {
      const response = await fetchPromise;
      clearTimeout(safetyTimer);
      const currentStrip = document.getElementById(SEARCHBAR_PANEL_ID);
      if (!currentStrip || currentStrip.getAttribute('data-cerpspy-query') !== cleanKw) return;

      currentStrip.removeAttribute('data-cerpspy-loading');
      const kd = (response && response.data && response.data.success) ? response.data : null;
      if (kd) {
        contentKeywordCache.set(cacheKey, kd);
        currentStrip.innerHTML = buildSearchBarHtml(kd, query);
        currentStrip.setAttribute('data-cerpspy-loaded', 'true');
        if (Array.isArray(kd.monthlyBreakdown) && kd.monthlyBreakdown.length > 0) {
          attachSparklinePopover(currentStrip, kd);
        }
        updateSerpOpportunityPill();
      } else if (response && (response.discontinued || response.data?.discontinued)) {
        currentStrip.innerHTML = buildSearchBarDiscontinuedHtml(query);
        currentStrip.setAttribute('data-cerpspy-loaded', 'true');
        updateSerpOpportunityPill();
      } else {
        currentStrip.innerHTML = buildSearchBarRetryHtml(query);
      }

      alignStripWithSearchInput(currentStrip);
      adjustGoogleLayoutForStrip(true);
      attachSearchBarInteractions(currentStrip, kd, query);
    } catch (err) {
      clearTimeout(safetyTimer);
      console.info('[cerpspy] Search bar intel notice:', err);
      const currentStrip = document.getElementById(SEARCHBAR_PANEL_ID);
      if (currentStrip && currentStrip.getAttribute('data-cerpspy-query') === cleanKw) {
        currentStrip.removeAttribute('data-cerpspy-loading');
        currentStrip.innerHTML = buildSearchBarRetryHtml(query);
        attachSearchBarInteractions(currentStrip, null, query);
      }
    } finally {
      inFlightKeywordRequests.delete(cacheKey);
    }
  }

  // =========================================================================
  // 2. SERP RESULT BADGES (Ahrefs DR, Domain Age, Young Website)
  // =========================================================================

  /**
   * Filters out non-organic or excluded Google elements (AI Overview, FAQs, Videos, Ads).
   */
  function isExcludedElement(el) {
    if (!el) return true;

    // AI Overview exclusion
    if (
      el.closest('.g-blk, [data-attrid="wa:/description"], [jsname="F7ec1c"], [data-snf="x5jWN"], .X7NTVe') ||
      el.closest('#st-ai-overview, div[aria-label*="AI Overview" i], [data-mc-element="ai_overview"]')
    ) {
      return true;
    }

    // FAQs / People Also Ask exclusion
    if (
      el.closest('.related-question-pair, .JlqpRe, [jsname="yEVEwb"], .g-accordion-expander, .c2xzTb, .wQiwMc') ||
      el.closest('[data-q], div[aria-level="3"][role="heading"][jsname="b38bdf"]')
    ) {
      return true;
    }

    // Video, Top Stories, Knowledge Panel, Ads, and Sitelinks exclusion
    if (
      el.closest('.commercial-unit-desktop-top, #tvcap, #bottomads, .uEierd') ||
      el.closest('.video-carousel, g-scrolling-carousel, [data-entityname], .kp-blk') ||
      el.closest('table.AaVjTc, .usJj9c, .a-no-hover-decoration, .mslg')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Creates a placeholder badge element for a domain.
   */
  function createBadgePlaceholder(domain) {
    const wrapper = document.createElement('span');
    wrapper.className = 'cerpspy-serp-badge-container';
    wrapper.setAttribute('data-cerpspy-domain', domain);
    applyThemeClass(wrapper);

    wrapper.innerHTML = `
      <span class="cerpspy-badge-pill cerpspy-badge-dr pulse" title="Loading DR for ${domain}...">DR: ...</span>
      ${showDomainAge ? `<span class="cerpspy-badge-pill cerpspy-badge-age pulse" title="Loading domain age for ${domain}...">Age: ...</span>` : ''}
    `;

    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      fetchAndPopulateDomain(wrapper, domain, true);
    });

    return wrapper;
  }

  /**
   * Populates the badge pills with DR, Age, Young Website, Forum UGC, Low DR, and AIO citations.
   */
  function populateBadge(wrapper, domain, data) {
    if (!wrapper) return;
    applyThemeClass(wrapper);

    const drVal = (data?.dr && data.dr.success && data.dr.dr !== undefined) ? Math.round(data.dr.dr) : null;

    // Domain Age and Young website evaluation
    const ageFormatted = data?.ageFormatted || (data?.age?.age ? formatDomainAgeShort(data.age.age) : null);
    const isYoung = data?.isYoung ?? (data?.age?.age ? (data.age.age.totalMonths < 12) : false);
    const regDateStr = data?.registrationDate?.fullString || data?.age?.registrationDate?.fullString || '';

    // Forum UGC, Weak Spot, and AI Overview citation detection
    const isForum = isForumDomain(domain);
    const aioInfo = getAiOverviewInfo();
    const isAioCited = Boolean(aioInfo?.hasAio && aioInfo?.citedDomains && aioInfo.citedDomains.has(domain));

    const items = [];

    // 1. Ahrefs DR Pill (First)
    if (showDomainRating) {
      if (isAhrefsDiscontinued || data?.dr?.discontinued) {
        items.push(`
          <span class="cerpspy-badge-pill cerpspy-badge-dr is-inactive" title="Ahrefs DR API token is discontinued in extension preferences">
            DR: <strong style="opacity: 0.65; font-size: 11px;">Off</strong>
          </span>
        `);
      } else {
        const drText = drVal !== null ? drVal : '—';
        items.push(`
          <span class="cerpspy-badge-pill cerpspy-badge-dr" title="Ahrefs Domain Rating: ${drText}/100 (Click to refresh)">
            DR: <strong>${drText}</strong>
          </span>
        `);
      }
    }

    // 2. Domain Age Pill (Second)
    if (showDomainAge) {
      if (data?.agePending && !ageFormatted) {
        items.push(`
          <span class="cerpspy-badge-pill cerpspy-badge-age pulse" title="Resolving domain age for ${domain}...">
            Age: ...
          </span>
        `);
      } else {
        const ageText = ageFormatted || '—';
        const regTitle = regDateStr ? ` (Registered: ${regDateStr})` : '';
        items.push(`
          <span class="cerpspy-badge-pill cerpspy-badge-age" title="Domain Age: ${ageText}${regTitle} (Click to refresh)">
            Age: <strong>${ageText}</strong>
          </span>
        `);
      }
    }

    // 3. Young Website Badge (< 1 Year)
    if (showYoungBadge && isYoung) {
      items.push(`
        <span class="cerpspy-badge-pill cerpspy-badge-young" title="Young Domain (< 1 Year Old)">
          🌱 Young Website
        </span>
      `);
    }

    // 4. Forum / User Generated Content Badge (LowFruits style)
    if (showForumBadge && isForum) {
      items.push(`
        <span class="cerpspy-badge-pill cerpspy-badge-forum" title="Discussion Forum / UGC: High opportunity gap for structured articles">
          💬 Forum UGC
        </span>
      `);
    }

    // 5. Weak Spot / Low Authority Badge (DR <= 20, non-young, non-forum)
    if (showWeakBadge && drVal !== null && drVal <= 20 && !isYoung && !isForum) {
      items.push(`
        <span class="cerpspy-badge-pill cerpspy-badge-weak" title="Low Authority Weak Spot (DR <= 20): Easier ranking opportunity">
          🎯 Low DR
        </span>
      `);
    }

    // 6. Google AI Overview Citation Badge
    if (isAioCited) {
      items.push(`
        <span class="cerpspy-badge-pill cerpspy-badge-aio" title="Cited directly in Google AI Overview for this search query">
          🤖 AIO Cited
        </span>
      `);
    }

    if (items.length === 0) {
      wrapper.style.display = 'none';
      return;
    }

    wrapper.innerHTML = items.join('');
  }

  /**
   * Fetches domain intelligence and populates the badge.
   */
  async function fetchAndPopulateDomain(wrapper, domain, forceRefresh = false) {
    if (!forceRefresh && contentDomainCache.has(domain)) {
      const cached = contentDomainCache.get(domain);
      const isDrMissing = showDomainRating && !isAhrefsDiscontinued && (!cached?.dr || !cached.dr.success || cached.dr.dr === null || cached.dr.dr === undefined);
      const isAgeMissing = showDomainAge && (!cached?.age || !cached.age.success || !cached.age.age);
      if (!isDrMissing && !isAgeMissing) {
        populateBadge(wrapper, domain, cached);
        return;
      }
    }

    if (!forceRefresh && typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get(`cache_${domain}`);
        const c = stored?.[`cache_${domain}`]?.data;
        const isDrMissing = showDomainRating && !isAhrefsDiscontinued && (!c?.dr || !c.dr.success || c.dr.dr === null || c.dr.dr === undefined);
        const isAgeMissing = showDomainAge && (!c?.age || !c.age.success || !c.age.age);
        if (c && !isDrMissing && !isAgeMissing) {
          contentDomainCache.set(domain, c);
          populateBadge(wrapper, domain, c);
          return;
        }
      } catch (e) {}
    }

    try {
      const response = await safeSendMessage({
        action: forceRefresh ? 'REFRESH_DOMAIN_DATA' : 'GET_DOMAIN_DATA',
        domain,
        forceRefresh,
        context: 'serp'
      });

      if (response && response.success && response.data) {
        contentDomainCache.set(domain, response.data);
        populateBadge(wrapper, domain, response.data);
      } else {
        // Populate with fallback state so pills never remain stuck in infinite loading pulse
        populateBadge(wrapper, domain, {
          domain,
          dr: { dr: null },
          da: { da: null },
          age: null
        });
      }
    } catch (err) {
      console.info(`[cerpspy] Error fetching metrics for ${domain}:`, err);
      populateBadge(wrapper, domain, {
        domain,
        dr: { dr: null },
        da: { da: null },
        age: null
      });
    }
  }

  /**
   * Scans Google SERP headings and injects DR, DA, and Spam Score pills right beside the domain name.
   * Employs a 2-stage pipeline:
   * 1. 0ms instant display from storage & memory cache
   * 2. Single batch network query for any remaining uncached domains
   */
  async function processSearchResults() {
    if (!isExtensionValid()) return;
    if (!serpBadgesEnabled) {
      document.querySelectorAll('.cerpspy-serp-badge-container').forEach(el => el.remove());
      return;
    }

    const headings = document.querySelectorAll('h3, div[role="heading"][aria-level="3"]');
    const newItems = [];

    headings.forEach(heading => {
      if (heading.hasAttribute(INJECTED_FLAG)) return;

      // Filter out FAQs, Videos, AI Overviews, Carousels, and Ads
      if (isExcludedElement(heading)) {
        heading.setAttribute(INJECTED_FLAG, 'true');
        return;
      }

      const resultCard =
        heading.closest('.yuRUbf') ||
        heading.closest('.tF2Cxc') ||
        heading.closest('div.g') ||
        heading.closest('.g') ||
        heading.parentElement;

      if (!resultCard || isExcludedElement(resultCard)) {
        heading.setAttribute(INJECTED_FLAG, 'true');
        return;
      }

      // Find the associated title anchor
      const titleAnchor =
        heading.closest('a') ||
        heading.querySelector('a') ||
        heading.parentElement?.closest('a') ||
        resultCard.querySelector('a[href^="http"]');

      if (!titleAnchor || !titleAnchor.href || titleAnchor.hasAttribute(INJECTED_FLAG)) {
        heading.setAttribute(INJECTED_FLAG, 'true');
        return;
      }

      const href = titleAnchor.href;
      if (!href.startsWith('http://') && !href.startsWith('https://')) {
        heading.setAttribute(INJECTED_FLAG, 'true');
        return;
      }

      const domain = extractRootDomain(href);
      if (!domain || domain.includes('google.') || domain === 'google' || domain === 'schema.org') {
        heading.setAttribute(INJECTED_FLAG, 'true');
        return;
      }

      // Avoid duplicates
      if (resultCard.querySelector('.cerpspy-serp-badge-container')) {
        heading.setAttribute(INJECTED_FLAG, 'true');
        titleAnchor.setAttribute(INJECTED_FLAG, 'true');
        return;
      }

      heading.setAttribute(INJECTED_FLAG, 'true');
      titleAnchor.setAttribute(INJECTED_FLAG, 'true');

      const badgeWrapper = createBadgePlaceholder(domain);

      // Placement: Insert directly beside the site name (e.g. kwheute.de) on the top line!
      const siteNameEl =
        resultCard.querySelector('.VuuXrf') ||
        resultCard.querySelector('span[role="text"]') ||
        resultCard.querySelector('.notranslate > span');

      if (siteNameEl && siteNameEl.parentNode) {
        siteNameEl.parentNode.insertBefore(badgeWrapper, siteNameEl.nextSibling);
      } else {
        const byrV5b = resultCard.querySelector('.byrV5b');
        if (byrV5b) {
          if (byrV5b.firstChild) {
            byrV5b.insertBefore(badgeWrapper, byrV5b.firstChild.nextSibling || byrV5b.firstChild);
          } else {
            byrV5b.appendChild(badgeWrapper);
          }
        } else {
          const citeNode = resultCard.querySelector('cite');
          if (citeNode && citeNode.parentNode) {
            citeNode.parentNode.insertBefore(badgeWrapper, citeNode);
          } else if (titleAnchor.parentNode) {
            titleAnchor.parentNode.insertBefore(badgeWrapper, titleAnchor);
          } else if (heading.parentNode) {
            heading.parentNode.insertBefore(badgeWrapper, heading);
          }
        }
      }

      // Unclip parent overflow so badges beside domain are fully visible
      resultCard.querySelectorAll('.byrV5b, .TbwUpd, .B6fmyf, .G5AeWb, .H93uRe, .ap9ZKc').forEach(n => {
        n.style.setProperty('overflow', 'visible', 'important');
        n.style.setProperty('max-width', 'none', 'important');
        n.style.setProperty('width', 'auto', 'important');
      });

      newItems.push({ wrapper: badgeWrapper, domain });
    });

    if (newItems.length === 0) return;

    // Stage 1: 0ms instant display from memory cache
    const pendingStorageCheck = [];
    newItems.forEach(({ wrapper, domain }) => {
      if (contentDomainCache.has(domain)) {
        populateBadge(wrapper, domain, contentDomainCache.get(domain));
      } else {
        pendingStorageCheck.push({ wrapper, domain });
      }
    });

    if (pendingStorageCheck.length === 0) return;

    // Stage 2: 0ms instant display from chrome.storage.local (single multi-key read)
    const uniqueDomains = [...new Set(pendingStorageCheck.map(p => p.domain))];
    const cacheKeys = uniqueDomains.map(d => `cache_${d}`);
    let storageResults = {};
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        storageResults = await chrome.storage.local.get(cacheKeys);
      } catch (e) {}
    }

    const uncachedDomains = new Set();
    pendingStorageCheck.forEach(({ wrapper, domain }) => {
      const key = `cache_${domain}`;
      const entry = storageResults?.[key]?.data;
      const isDrMissing = showDomainRating && !isAhrefsDiscontinued && (!entry?.dr || !entry.dr.success || entry.dr.dr === null || entry.dr.dr === undefined);
      if (entry && !isDrMissing) {
        contentDomainCache.set(domain, entry);
        populateBadge(wrapper, domain, entry);
      } else {
        if (entry) {
          // Pre-populate what we have (Age, DA) while fetching fresh DR
          populateBadge(wrapper, domain, entry);
        }
        uncachedDomains.add(domain);
      }
    });

    if (uncachedDomains.size === 0) return;

    // Stage 3: Single batch IPC request for uncached domains
    try {
      const response = await safeSendMessage({
        action: 'GET_BATCH_DOMAIN_DATA',
        domains: Array.from(uncachedDomains),
        context: 'serp'
      });

      if (response && response.success && response.data) {
        Object.entries(response.data).forEach(([dom, data]) => {
          contentDomainCache.set(dom, data);
          document.querySelectorAll(`.cerpspy-serp-badge-container[data-cerpspy-domain="${dom}"]`).forEach(w => {
            populateBadge(w, dom, data);
          });
        });
        updateSerpOpportunityPill();
      }
    } catch (err) {
      console.info('[cerpspy] Error in batch SERP domain resolution:', err);
      // Fallback individually on error
      uncachedDomains.forEach(domain => {
        document.querySelectorAll(`.cerpspy-serp-badge-container[data-cerpspy-domain="${domain}"]`).forEach(w => {
          fetchAndPopulateDomain(w, domain);
        });
      });
      updateSerpOpportunityPill();
    }
  }

  // =========================================================================
  // 3. INITIALIZATION & OBSERVERS
  // =========================================================================

  /**
   * Helper that accurately identifies any cerpspy element to prevent self-mutation cascades.
   */
  function isCerpspyNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (
      node.id === SEARCHBAR_PANEL_ID ||
      node.id === 'cerpspyTrendPopover' ||
      node.id === 'cerpspyOppPopover' ||
      node.id === 'cerpspyToolsMenu' ||
      node.classList?.contains('cerpspy-kw-strip') ||
      node.classList?.contains('cerpspy-serp-badge-container') ||
      node.classList?.contains('cerpspy-badge-wrapper') ||
      node.classList?.contains('cerpspy-badge-pill') ||
      node.classList?.contains('cerpspy-trend-popover') ||
      node.classList?.contains('cerpspy-opp-popover') ||
      node.classList?.contains('cerpspy-tools-menu') ||
      node.hasAttribute?.('data-cerpspy-domain') ||
      node.hasAttribute?.('data-cerpspy-query')
    ) {
      return true;
    }
    return Boolean(node.closest?.(`#${SEARCHBAR_PANEL_ID}, .cerpspy-kw-strip, .cerpspy-serp-badge-container, #cerpspyTrendPopover, #cerpspyOppPopover, #cerpspyToolsMenu`));
  }

  let scanDebounceTimer = null;
  function triggerScan() {
    if (!isExtensionValid()) return;
    clearTimeout(scanDebounceTimer);
    scanDebounceTimer = setTimeout(() => {
      if (!isExtensionValid()) return;
      const oppPop = document.getElementById('cerpspyOppPopover');
      if (oppPop) oppPop.style.display = 'none';
      const trendPop = document.getElementById('cerpspyTrendPopover');
      if (trendPop) trendPop.style.display = 'none';
      const toolsMenu = document.getElementById('cerpspyToolsMenu');
      if (toolsMenu) toolsMenu.style.display = 'none';
      currentSerpFilter = 'all';
      document.querySelectorAll('.cerpspy-filter-hidden').forEach(c => {
        c.classList.remove('cerpspy-filter-hidden');
        c.style.removeProperty('display');
      });
      document.getElementById('cerpspy-sidebar-container')?.remove();
      document.getElementById('kw-sidebar-container')?.remove();
      renderSearchBarStrip();
      processSearchResults();
    }, 220);
  }

  async function init() {
    document.getElementById('cerpspy-sidebar-container')?.remove();
    document.getElementById('kw-sidebar-container')?.remove();
    await loadSettings();
    renderSearchBarStrip();
    processSearchResults();

    // Listen for Google search AJAX / pagination / dynamic DOM updates
    // Thoroughly filters out all cerpspy elements to completely eliminate self-mutation feedback loops
    const observer = new MutationObserver((mutations) => {
      if (!isExtensionValid()) {
        try { observer.disconnect(); } catch (_) {}
        return;
      }
      let isExternal = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        const target = m.target;
        if (!target) continue;

        // Ignore mutations targeting cerpspy elements or inside cerpspy wrappers
        if (isCerpspyNode(target)) continue;

        // Check added nodes: if all added nodes are cerpspy elements, ignore
        if (m.addedNodes && m.addedNodes.length > 0) {
          let hasExternalAdded = false;
          for (let j = 0; j < m.addedNodes.length; j++) {
            if (!isCerpspyNode(m.addedNodes[j])) {
              hasExternalAdded = true;
              break;
            }
          }
          if (hasExternalAdded) {
            isExternal = true;
            break;
          }
        }

        // Check removed nodes: if all removed nodes are cerpspy elements, ignore
        if (m.removedNodes && m.removedNodes.length > 0) {
          let hasExternalRemoved = false;
          for (let j = 0; j < m.removedNodes.length; j++) {
            if (!isCerpspyNode(m.removedNodes[j])) {
              hasExternalRemoved = true;
              break;
            }
          }
          if (hasExternalRemoved) {
            isExternal = true;
            break;
          }
        }
      }

      if (isExternal) {
        triggerScan();
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    // Listen for Google SPA URL / navigation changes immediately
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function (...args) {
      const ret = originalPushState.apply(this, args);
      if (isExtensionValid()) triggerScan();
      return ret;
    };
    history.replaceState = function (...args) {
      const ret = originalReplaceState.apply(this, args);
      if (isExtensionValid()) triggerScan();
      return ret;
    };
    window.addEventListener('popstate', () => {
      if (isExtensionValid()) triggerScan();
    });

    // Window resize handler to maintain horizontal alignment
    window.addEventListener('resize', () => {
      const strip = document.getElementById(SEARCHBAR_PANEL_ID);
      if (strip) {
        alignStripWithSearchInput(strip);
        adjustGoogleLayoutForStrip(true);
      }
    });

    // Listen for live setting updates and late-arriving domain metrics from background worker
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!isExtensionValid()) return false;
      if (msg && msg.action === 'SETTINGS_UPDATED') {
        // Purge all in-memory caches so stale data from a previous
        // API key is never re-served after a settings change.
        contentKeywordCache.clear();
        contentDomainCache.clear();
        inFlightKeywordRequests.clear();
        // Remove existing badge containers and injected flags so everything cleanly re-renders
        document.querySelectorAll('.cerpspy-serp-badge-container').forEach(el => el.remove());
        document.querySelectorAll(`[${INJECTED_FLAG}]`).forEach(el => el.removeAttribute(INJECTED_FLAG));
        loadSettings().then(() => {
          renderSearchBarStrip(true);
          processSearchResults();
        });
        if (typeof sendResponse === 'function') {
          try { sendResponse({ received: true }); } catch (_) {}
        }
      } else if (msg && msg.action === 'DOMAIN_DATA_UPDATED' && msg.domain && msg.data) {
        contentDomainCache.set(msg.domain, msg.data);
        const wrappers = document.querySelectorAll(`[data-cerpspy-domain="${msg.domain}"]`);
        wrappers.forEach(w => populateBadge(w, msg.domain, msg.data));
        updateSerpOpportunityPill();
      } else if (msg && msg.action === 'TRIGGER_SERP_EXPORT') {
        const query = extractSearchQuery() || '';
        const cleanKw = cleanKeywordForVolume(query);
        const kd = contentKeywordCache.get(cleanKw) || null;
        exportSerpToCsv(query, kd);
        if (typeof sendResponse === 'function') {
          sendResponse({ success: true, count: document.querySelectorAll('h3').length });
        }
      } else if (msg && msg.action === 'TRIGGER_COPY_PAA') {
        const questions = harvestPeopleAlsoAskQuestions();
        if (questions.length > 0) {
          const text = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text);
          }
        }
        if (typeof sendResponse === 'function') {
          sendResponse({ success: true, count: questions.length, questions });
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
