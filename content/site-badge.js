/**
 * cerpspy - On-Website Floating Intelligence Dock (Content Script)
 * ---------------------------------------------------------------------------
 * Minimal, clean, native UI/UX matching cerpspy SERP badges:
 * - No thick blue left kernel border (clean 1px hairline border).
 * - No intrusive auto-popup covering the webpage on load.
 * - Ultra-compact tucked state on the right edge showing [DR] and [Age].
 * - Sleek, low-profile hover state showing the official cerpspy icon,
 *   domain name, refresh/close actions, and inline registration date.
 */

(function () {
  'use strict';

  if (window !== window.top) return;

  const HOST_ID = 'cerpspy-site-dock-host';
  if (document.getElementById(HOST_ID)) return;

  /**
   * Normalizes a raw hostname/URL into a clean root domain (e.g. "www.matkaresult.co" -> "matkaresult.co")
   */
  function extractRootDomain(input) {
    if (!input || typeof input !== 'string') return '';
    let domain = input.trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//i, '');
    domain = domain.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
    domain = domain.replace(/^www\./i, '');

    const parts = domain.split('.');
    if (parts.length <= 2) return domain;

    const twoPartTlds = new Set([
      'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk',
      'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
      'co.nz', 'org.nz', 'ac.nz', 'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in',
      'co.jp', 'ne.jp', 'or.jp', 'com.br', 'net.br', 'org.br',
      'com.mx', 'com.sg', 'co.za', 'org.za', 'com.pk', 'net.pk', 'org.pk',
      'com.tr', 'com.ar', 'com.co', 'com.pe', 'com.my', 'com.ph', 'com.vn', 'co.id',
      'com.ng', 'co.ke', 'com.eg', 'com.sa', 'ae.org', 'co.il', 'com.ua', 'com.pl', 'com.ro', 'com.gr'
    ]);

    const lastTwo = parts.slice(-2).join('.');
    if (twoPartTlds.has(lastTwo)) {
      return parts.slice(-3).join('.');
    }
    return lastTwo;
  }

  /**
   * Exact formatDomainAgeShort implementation matching utils/domainAge.js & content/content.js
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
   * Formats a registration date string into a compact, readable format (e.g. "10 Sep 2019")
   */
  function formatShortRegDate(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const map = {
      January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr',
      May: 'May', June: 'Jun', July: 'Jul', August: 'Aug',
      September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec'
    };
    return raw.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g, (m) => map[m] || m);
  }

  /**
   * Safely resolves extension asset URLs (e.g. icons/icon-48.png)
   */
  function safeGetURL(path) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        return chrome.runtime.getURL(path);
      }
    } catch (_) {}
    return '';
  }

  /**
   * Excludes Google search pages (handled by content.js), local addresses, and internal pages.
   */
  function shouldSkipCurrentPage() {
    const loc = window.location;
    if (!loc || (loc.protocol !== 'http:' && loc.protocol !== 'https:')) return true;
    const host = (loc.hostname || '').toLowerCase();
    if (!host || host === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.endsWith('.local')) {
      return true;
    }
    if (/(?:^|\.)google\.[a-z.]+$/i.test(host)) {
      return true;
    }
    return false;
  }

  if (shouldSkipCurrentPage()) return;

  const currentDomain = extractRootDomain(window.location.hostname);
  if (!currentDomain || !currentDomain.includes('.')) return;

  // User Settings state
  let siteBadgeEnabled = true;
  let serpBadgesEnabled = true;
  let showDomainRating = true;
  let showDomainAge = true;
  let showYoungBadge = true;
  let isAhrefsDiscontinued = false;

  // Dock state
  let hostEl = null;
  let shadowRoot = null;
  let dockEl = null;
  let latestData = null;
  let isFetchingMetrics = false;
  let hasAutoRetriedDr = false;
  let isDismissedForTab = false;

  function hasValidDr(data) {
    return Boolean(data?.dr && data.dr.success && data.dr.dr !== null && data.dr.dr !== undefined);
  }

  function hasValidAge(data) {
    return Boolean((data?.age && data.age.success && data.age.age) || data?.ageFormatted);
  }

  /**
   * Safely merges incoming domain data with existing state so a resolved DR or Age
   * is never overwritten by a partial update where the other metric is still in flight.
   */
  function mergeDomainData(prev, next) {
    if (!prev) return next ? { ...next } : null;
    if (!next) return { ...prev };

    const merged = { ...prev, ...next };

    if (!hasValidDr(next) && hasValidDr(prev)) {
      merged.dr = prev.dr;
      merged.drPending = false;
    }

    if (!hasValidAge(next) && hasValidAge(prev)) {
      merged.age = prev.age;
      merged.ageFormatted = prev.ageFormatted;
      merged.registrationDate = prev.registrationDate || next.registrationDate;
      merged.isYoung = prev.isYoung;
      merged.insights = prev.insights || next.insights;
      merged.agePending = false;
    }

    return merged;
  }

  /**
   * Sends a message safely to the background service worker with automatic wake-up retries.
   */
  async function safeSendMessage(payload, timeoutMs = 10000, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const result = await new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
          resolve(null);
          return;
        }
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(undefined);
          }
        }, timeoutMs);

        try {
          chrome.runtime.sendMessage(payload, (response) => {
            clearTimeout(timer);
            if (settled) return;
            settled = true;
            if (chrome.runtime.lastError) {
              resolve(undefined);
              return;
            }
            resolve(response);
          });
        } catch (_) {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            resolve(undefined);
          }
        }
      });

      if (result !== undefined) {
        return result;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    return null;
  }

  /**
   * Loads extension preferences from chrome.storage.local
   */
  async function loadSettings() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
      const res = await chrome.storage.local.get('cerpspy_settings');
      const s = res?.cerpspy_settings || {};
      applySettingsObject(s);
    } catch (_) {}
  }

  function applySettingsObject(s) {
    if (!s || typeof s !== 'object') return;
    serpBadgesEnabled = s.serpBadgesEnabled !== false;
    siteBadgeEnabled = s.siteBadgeEnabled !== false;
    showDomainRating = s.showDomainRating !== false;
    showDomainAge = s.showDomainAge !== false;
    showYoungBadge = s.showYoungBadge !== false;
    isAhrefsDiscontinued = s.ahrefsDiscontinued === true || !s.ahrefsApiKey;
  }

  /**
   * Clean, minimal White-Light CSS with zero thick blue border and compact hover card
   */
  function getShadowStyles() {
    return `
      :host {
        all: initial;
        --cerpspy-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        --cerpspy-dr-bg: #4032c9;
        font-family: var(--cerpspy-font);
        color: #0F172A;
        line-height: 1.35;
        -webkit-font-smoothing: antialiased;
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      @keyframes cerpspySpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      @keyframes cerpspyPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.55; }
      }

      .cerpspy-dock-wrap {
        position: fixed;
        top: var(--cerpspy-dock-top, 32%);
        right: 0;
        z-index: 2147483646;
        font-family: var(--cerpspy-font);
        user-select: none;
      }

      .cerpspy-dock-wrap.is-hidden {
        display: none !important;
      }

      /* =====================================================================
         1. DEFAULT TUCKED TAB ON RIGHT EDGE (Clean, Feather-Light, No Blue Border)
         ===================================================================== */
      .cerpspy-compact-tab {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 3px;
        background: #FFFFFF;
        border: 1px solid #CBD5E1;
        border-right: none;
        border-radius: 7px 0 0 7px;
        padding: 5px 6px;
        box-shadow: -2px 4px 12px rgba(15, 23, 42, 0.1);
        cursor: grab;
      }

      .cerpspy-compact-tab:active {
        cursor: grabbing;
      }

      .cerpspy-compact-tab .cerpspy-badge-pill {
        justify-content: center;
      }

      .cerpspy-dock-wrap:hover .cerpspy-compact-tab,
      .cerpspy-dock-wrap.is-dragging .cerpspy-compact-tab {
        display: none;
      }

      /* =====================================================================
         2. COMPACT HOVER CARD (Low-profile, clean 1px border, no nested boxes)
         ===================================================================== */
      .cerpspy-slide-popover {
        display: none;
        background: #FFFFFF;
        border: 1px solid #CBD5E1;
        border-right: none;
        border-radius: 8px 0 0 8px;
        padding: 7px 10px;
        box-shadow: -4px 8px 20px rgba(15, 23, 42, 0.12), 0 2px 6px rgba(15, 23, 42, 0.06);
        cursor: grab;
        width: max-content;
        max-width: 280px;
      }

      .cerpspy-slide-popover:active {
        cursor: grabbing;
      }

      .cerpspy-dock-wrap:hover .cerpspy-slide-popover,
      .cerpspy-dock-wrap.is-dragging .cerpspy-slide-popover {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      /* Top Row: Official Icon + Domain + Refresh & Close */
      .cerpspy-site-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .cerpspy-site-brand {
        display: flex;
        align-items: center;
        gap: 5.5px;
        min-width: 0;
      }

      .cerpspy-site-logo {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        display: block;
        flex-shrink: 0;
        object-fit: contain;
      }

      .cerpspy-site-domain {
        font-size: 12px;
        font-weight: 700;
        color: #0F172A;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 175px;
      }

      .cerpspy-site-actions {
        display: flex;
        align-items: center;
        gap: 2px;
        flex-shrink: 0;
      }

      .cerpspy-kw-refresh-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        width: 18px;
        height: 18px;
        padding: 0;
        color: #64748B;
        cursor: pointer;
        border-radius: 4px;
        transition: color 0.15s ease, background-color 0.15s ease, transform 0.25s ease;
      }

      .cerpspy-kw-refresh-btn:hover {
        color: #4032c9;
        background: #F1F5F9;
        transform: rotate(90deg);
      }

      .cerpspy-kw-refresh-btn.is-spinning svg {
        animation: cerpspySpin 0.75s linear infinite;
      }

      .cerpspy-popover-close-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        width: 18px;
        height: 18px;
        border-radius: 4px;
        color: #64748B;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;
      }

      .cerpspy-popover-close-btn:hover {
        background: #F1F5F9;
        color: #0F172A;
      }

      /* Bottom Row: Exact SERP Pills + Inline Registration Date */
      .cerpspy-site-metrics {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        gap: 5px;
      }

      .cerpspy-badge-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        padding: 2px 7px;
        border-radius: 4px;
        font-family: var(--cerpspy-font);
        font-size: 11px;
        font-weight: 700;
        line-height: 14px;
        color: #FFFFFF;
        background-color: var(--cerpspy-dr-bg);
        border: none;
        white-space: nowrap;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
      }

      .cerpspy-badge-pill strong {
        font-weight: 800;
        color: #FFFFFF;
      }

      .cerpspy-badge-dr {
        background-color: #4032c9;
      }

      .cerpspy-badge-dr.is-inactive {
        background-color: #475569;
        opacity: 0.75;
      }

      .cerpspy-badge-age {
        background-color: #F1F5F9;
        color: #334155;
        border: 1px solid #CBD5E1;
        box-shadow: none;
      }

      .cerpspy-badge-age strong {
        color: #0F172A;
      }

      .cerpspy-badge-young {
        background-color: #ECFDF5;
        color: #065F46;
        border: 1px solid #6EE7B7;
        box-shadow: none;
      }

      .cerpspy-site-reg {
        font-size: 10.5px;
        color: #64748B;
        font-weight: 500;
        white-space: nowrap;
        margin-left: 1px;
      }

      .pulse {
        animation: cerpspyPulse 1.4s infinite ease-in-out;
      }
    `;
  }

  /**
   * Creates the Shadow DOM host and Right-Edge Dock (supports document_start mounting)
   */
  async function createDockElement() {
    if (hostEl && dockEl) {
      if (!hostEl.isConnected) {
        const targetParent = document.body || document.documentElement;
        if (targetParent) targetParent.appendChild(hostEl);
      }
      return dockEl;
    }

    hostEl = document.createElement('div');
    hostEl.id = HOST_ID;
    hostEl.setAttribute('data-cerpspy-ignore', 'true');
    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.textContent = getShadowStyles();
    shadowRoot.appendChild(styleEl);

    dockEl = document.createElement('div');
    dockEl.className = 'cerpspy-dock-wrap';

    // Restore user's custom vertical drag position if saved
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const pos = await chrome.storage.local.get('cerpspy_dock_top_pct');
        const savedPct = Number(pos?.cerpspy_dock_top_pct);
        if (!isNaN(savedPct) && savedPct >= 8 && savedPct <= 88) {
          dockEl.style.setProperty('--cerpspy-dock-top', `${savedPct}%`);
        }
      }
    } catch (_) {}

    dockEl.innerHTML = buildDockInnerHtml(latestData, true);
    shadowRoot.appendChild(dockEl);

    const mountTarget = document.body || document.documentElement;
    if (mountTarget) {
      mountTarget.appendChild(hostEl);
    }

    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => {
        if (hostEl && document.body && hostEl.parentNode !== document.body) {
          document.body.appendChild(hostEl);
        }
      }, { once: true });
    }

    bindDockInteractions(dockEl);
    return dockEl;
  }

  /**
   * Builds the compact tucked tab and low-profile hover card
   */
  function buildDockInnerHtml(data, isLoading = false) {
    const drVal = (data?.dr && data.dr.success && data.dr.dr !== undefined && data.dr.dr !== null)
      ? Math.round(data.dr.dr)
      : null;

    const isDrLoading = Boolean((isLoading || isFetchingMetrics || data?.drPending) && drVal === null);
    const ageFormatted = data?.ageFormatted || (data?.age?.age ? formatDomainAgeShort(data.age.age) : null);
    const isAgePending = Boolean((isLoading || isFetchingMetrics || data?.agePending) && !ageFormatted);
    const isYoung = Boolean(data?.isYoung ?? (data?.age?.age ? (data.age.age.totalMonths < 12) : false));
    const regDateRaw = data?.registrationDate?.fullString || data?.age?.registrationDate?.fullString || '';
    const regShort = formatShortRegDate(regDateRaw);

    const badgesHtml = [];
    const compactPillsHtml = [];

    // 1. Ahrefs DR Pill
    if (showDomainRating) {
      if (isAhrefsDiscontinued || data?.dr?.discontinued) {
        const offPill = `
          <span class="cerpspy-badge-pill cerpspy-badge-dr is-inactive" title="Ahrefs DR API token is discontinued">
            DR: <strong style="opacity: 0.65; font-size: 11px;">Off</strong>
          </span>
        `;
        badgesHtml.push(offPill);
        compactPillsHtml.push(offPill);
      } else {
        const drText = isDrLoading ? '...' : (drVal !== null ? drVal : '—');
        const pulseCls = isDrLoading ? ' pulse' : '';
        const drPill = `
          <span class="cerpspy-badge-pill cerpspy-badge-dr${pulseCls}" title="Ahrefs Domain Rating: ${drText}/100">
            DR: <strong>${drText}</strong>
          </span>
        `;
        badgesHtml.push(drPill);
        compactPillsHtml.push(drPill);
      }
    }

    // 2. Domain Age Pill
    if (showDomainAge) {
      if (isAgePending && !ageFormatted) {
        const loadingAgePill = `
          <span class="cerpspy-badge-pill cerpspy-badge-age pulse" title="Resolving domain age for ${currentDomain}...">
            Age: ...
          </span>
        `;
        badgesHtml.push(loadingAgePill);
        compactPillsHtml.push(loadingAgePill);
      } else {
        const ageText = ageFormatted || '—';
        const regTitle = regDateRaw ? ` (Registered: ${regDateRaw})` : '';
        const agePill = `
          <span class="cerpspy-badge-pill cerpspy-badge-age" title="Domain Age: ${ageText}${regTitle}">
            Age: <strong>${ageText}</strong>
          </span>
        `;
        badgesHtml.push(agePill);
        compactPillsHtml.push(agePill);
      }
    }

    // 3. Young Website Badge (< 1 Year)
    if (showYoungBadge && isYoung) {
      const youngPill = `
        <span class="cerpspy-badge-pill cerpspy-badge-young" title="Young Domain (< 1 Year Old)">
          🌱 Young
        </span>
      `;
      badgesHtml.push(youngPill);
      if (compactPillsHtml.length === 0) compactPillsHtml.push(youngPill);
    }

    if (regShort) {
      badgesHtml.push(`<span class="cerpspy-site-reg" title="Registered: ${regDateRaw}">(${regShort})</span>`);
    }

    const logoUrl = safeGetURL('icons/icon-48.png');
    const logoImgHtml = logoUrl
      ? `<img src="${logoUrl}" class="cerpspy-site-logo" alt="cerpspy" width="14" height="14" />`
      : '';

    return `
      <div class="cerpspy-compact-tab" title="${currentDomain} • Hover for details, drag to move">
        ${compactPillsHtml.join('')}
      </div>

      <div class="cerpspy-slide-popover">
        <div class="cerpspy-site-head">
          <div class="cerpspy-site-brand">
            ${logoImgHtml}
            <span class="cerpspy-site-domain" title="${currentDomain}">${currentDomain}</span>
          </div>
          <div class="cerpspy-site-actions">
            <button type="button" class="cerpspy-kw-refresh-btn" id="cerpspyBtnRefreshSite" title="Refresh Live Data">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
            <button type="button" class="cerpspy-popover-close-btn" id="cerpspyBtnCloseSite" title="Hide on this tab">✕</button>
          </div>
        </div>
        <div class="cerpspy-site-metrics">
          ${badgesHtml.join('')}
        </div>
      </div>
    `;
  }

  /**
   * Wires up Refresh, Dismiss, and Vertical Dragging along the right edge
   */
  function bindDockInteractions(dock) {
    dock.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('#cerpspyBtnCloseSite');
      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        isDismissedForTab = true;
        dock.classList.add('is-hidden');
        return;
      }

      const refreshBtn = e.target.closest('#cerpspyBtnRefreshSite');
      if (refreshBtn) {
        e.preventDefault();
        e.stopPropagation();
        refreshBtn.classList.add('is-spinning');
        hasAutoRetriedDr = false;
        fetchAndRenderSiteMetrics(true).finally(() => {
          setTimeout(() => {
            const btn = dock.querySelector('#cerpspyBtnRefreshSite');
            if (btn) btn.classList.remove('is-spinning');
          }, 600);
        });
      }
    });

    // Vertical Dragging along the right edge
    let isDragging = false;
    let startY = 0;
    let startTopPx = 0;

    dock.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button')) return;

      isDragging = true;
      startY = e.clientY;
      const rect = dock.getBoundingClientRect();
      startTopPx = rect.top;
      dock.classList.add('is-dragging');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging || !dockEl) return;
      const deltaY = e.clientY - startY;
      const newTopPx = startTopPx + deltaY;
      const vh = window.innerHeight || document.documentElement.clientHeight || 800;
      const pct = Math.min(88, Math.max(8, (newTopPx / vh) * 100));
      dockEl.style.setProperty('--cerpspy-dock-top', `${pct.toFixed(1)}%`);
    }, { passive: true });

    window.addEventListener('mouseup', () => {
      if (!isDragging || !dockEl) return;
      isDragging = false;
      dockEl.classList.remove('is-dragging');
      const currentTop = dockEl.style.getPropertyValue('--cerpspy-dock-top');
      const numericPct = parseFloat(currentTop);
      if (!isNaN(numericPct) && typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ cerpspy_dock_top_pct: numericPct }).catch(() => {});
      }
    }, { passive: true });
  }

  /**
   * Renders the dock state based on current settings and domain data
   */
  async function renderDock(data, isLoading = false) {
    if (isDismissedForTab) return;

    const anyMetricEnabled = showDomainRating || showDomainAge || showYoungBadge;
    if (!serpBadgesEnabled || !siteBadgeEnabled || !anyMetricEnabled) {
      if (dockEl) dockEl.classList.add('is-hidden');
      return;
    }

    const dock = await createDockElement();
    dock.classList.remove('is-hidden');
    dock.innerHTML = buildDockInnerHtml(data, isLoading);
  }

  /**
   * Fetches metrics for the active website immediately at navigation start:
   * 1. Instant 0ms read from 30-day storage cache (0 API credits when clicked from Google SERP!)
   * 2. Live background service worker GET_DOMAIN_DATA with progressive DR & Age updates
   */
  async function fetchAndRenderSiteMetrics(forceRefresh = false) {
    await loadSettings();

    if (!serpBadgesEnabled || !siteBadgeEnabled) {
      if (dockEl) dockEl.classList.add('is-hidden');
      return;
    }

    if (!forceRefresh && typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const cacheKey = `cache_${currentDomain}`;
        const stored = await chrome.storage.local.get(cacheKey);
        const cachedData = stored?.[cacheKey]?.data;
        const isDrMissing = showDomainRating && !isAhrefsDiscontinued && !hasValidDr(cachedData);
        const isAgeMissing = (showDomainAge || showYoungBadge) && !hasValidAge(cachedData);

        if (cachedData && !isDrMissing && !isAgeMissing) {
          latestData = mergeDomainData(latestData, cachedData);
          isFetchingMetrics = false;
          await renderDock(latestData, false);
          return;
        } else if (cachedData) {
          latestData = mergeDomainData(latestData, cachedData);
          isFetchingMetrics = true;
          await renderDock(latestData, true);
        } else {
          isFetchingMetrics = true;
          await renderDock(latestData, true);
        }
      } catch (_) {
        isFetchingMetrics = true;
        await renderDock(latestData, true);
      }
    } else {
      isFetchingMetrics = true;
      await renderDock(latestData, true);
    }

    const response = await safeSendMessage({
      action: forceRefresh ? 'REFRESH_DOMAIN_DATA' : 'GET_DOMAIN_DATA',
      domain: currentDomain,
      forceRefresh,
      context: 'site_badge'
    });

    isFetchingMetrics = false;

    if (response && response.success && response.data) {
      latestData = forceRefresh ? response.data : mergeDomainData(latestData, response.data);
      await renderDock(latestData, false);
    } else {
      const fallback = mergeDomainData(latestData, {
        domain: currentDomain,
        dr: latestData?.dr || { dr: null },
        age: latestData?.age || null,
        agePending: false
      });
      latestData = fallback;
      await renderDock(fallback, false);
    }

    // Self-healing automatic retry if DR was still resolving or missed on initial cold navigation
    if (showDomainRating && !isAhrefsDiscontinued && !hasValidDr(latestData) && !hasAutoRetriedDr) {
      hasAutoRetriedDr = true;
      setTimeout(() => {
        if (!hasValidDr(latestData) && !isDismissedForTab) {
          fetchAndRenderSiteMetrics(true);
        }
      }, 650);
    }
  }

  // Listen for direct runtime broadcasts from service-worker.js
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== 'object') return;

      if (msg.action === 'DOMAIN_DATA_UPDATED' && msg.domain === currentDomain && msg.data) {
        latestData = mergeDomainData(latestData, msg.data);
        const stillWaitingForDr = showDomainRating && !isAhrefsDiscontinued && !hasValidDr(latestData) && (isFetchingMetrics || Boolean(msg.data.drPending));
        renderDock(latestData, stillWaitingForDr);
      } else if (msg.action === 'SETTINGS_UPDATED' && msg.settings) {
        applySettingsObject(msg.settings);
        if (!serpBadgesEnabled || !siteBadgeEnabled) {
          if (dockEl) dockEl.classList.add('is-hidden');
        } else if (latestData && hasValidDr(latestData)) {
          renderDock(latestData, false);
        } else {
          fetchAndRenderSiteMetrics(false);
        }
      }
    });
  }

  // Listen for chrome.storage.local cache writes (instant 0ms sync across SERP & website tabs)
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    const targetCacheKey = `cache_${currentDomain}`;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes[targetCacheKey] && changes[targetCacheKey].newValue?.data) {
        const newData = changes[targetCacheKey].newValue.data;
        latestData = mergeDomainData(latestData, newData);
        const stillWaitingForDr = showDomainRating && !isAhrefsDiscontinued && !hasValidDr(latestData) && (isFetchingMetrics || Boolean(newData.drPending));
        renderDock(latestData, stillWaitingForDr);
      }
    });
  }

  // Start immediately (0ms at document_start) so metrics resolve in parallel with page load
  fetchAndRenderSiteMetrics(false);
})();
