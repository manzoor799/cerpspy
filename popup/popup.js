/**
 * cerpspy - Popup UI Logic
 * Streamlined domain analyzer and settings manager for cerpspy.
 * Focused strictly on:
 * - Domain Rating & Age (Ahrefs DR, Domain Age, Young Website)
 * - Top Search Bar settings (Volume, CPC, Trend)
 * - SERP Badges settings (DR, Domain Age, Young Website)
 * - Cache Policy & Active API Connections
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Header & Search
  const domainInput = document.getElementById('domainInput');
  const btnSearch = document.getElementById('btnSearch');
  const btnRefresh = document.getElementById('btnRefresh');
  const btnSettings = document.getElementById('btnSettings');

  // Views
  const mainView = document.getElementById('mainView');
  const skeletonView = document.getElementById('skeletonView');
  const errorView = document.getElementById('errorView');
  const errorMessage = document.getElementById('errorMessage');
  const dataView = document.getElementById('dataView');
  const settingsView = document.getElementById('settingsView');
  const currentDomainDisplay = document.getElementById('currentDomainDisplay');
  const domainBannerTags = document.getElementById('domainBannerTags');
  const youngWebsiteTag = document.getElementById('youngWebsiteTag');
  const lifecycleStageTag = document.getElementById('lifecycleStageTag');

  // Account & Live Credits Elements
  const accountCreditsCard = document.getElementById('accountCreditsCard');
  const accountUserInfo = document.getElementById('accountUserInfo');
  const accountUserName = document.getElementById('accountUserName');
  const accountUserEmail = document.getElementById('accountUserEmail');
  const liveCreditsDisplay = document.getElementById('liveCreditsDisplay');

  // Metrics Display
  const domainAgeDisplay = document.getElementById('domainAgeDisplay');
  const domainRegDateDisplay = document.getElementById('domainRegDateDisplay');
  const lifecycleDetailsBox = document.getElementById('lifecycleDetailsBox');
  const lifecycleBadge = document.getElementById('lifecycleBadge');
  const lifecycleDesc = document.getElementById('lifecycleDesc');

  const drScoreDisplay = document.getElementById('drScoreDisplay');
  const drStatusTitle = document.getElementById('drStatusTitle');
  const drProgressFill = document.getElementById('drProgressFill');
  // Settings Navigation
  const btnBackSettings = document.getElementById('btnBackSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');

  // Settings Toggles - Search Bar Strip
  const toggleSearchBarPanel = document.getElementById('toggleSearchBarPanel');
  const toggleShowVolume = document.getElementById('toggleShowVolume');
  const toggleShowCpc = document.getElementById('toggleShowCpc');
  const toggleShowTrend = document.getElementById('toggleShowTrend');
  const toggleShowCompetition = document.getElementById('toggleShowCompetition');
  const toggleAutoFetchKeywords = document.getElementById('toggleAutoFetchKeywords');
  const toggleShowExport = document.getElementById('toggleShowExport');
  const toggleShowPaa = document.getElementById('toggleShowPaa');
  const toggleShowBookmark = document.getElementById('toggleShowBookmark');
  const toggleShowOpportunity = document.getElementById('toggleShowOpportunity');
  const toggleShowIntent = document.getElementById('toggleShowIntent');
  const toggleShowFilters = document.getElementById('toggleShowFilters');
  const selectTargetCountry = document.getElementById('selectTargetCountry');
  const selectKwNetwork = document.getElementById('selectKwNetwork');

  // Google SERP Quick Tools elements in Popup
  const cardSerpTools = document.getElementById('cardSerpTools');
  const serpQueryDisplay = document.getElementById('serpQueryDisplay');
  const btnPopupExportCsv = document.getElementById('btnPopupExportCsv');
  const btnPopupCopyPaa = document.getElementById('btnPopupCopyPaa');
  const serpToolFeedback = document.getElementById('serpToolFeedback');

  // Settings Toggles - SERP Badges
  const toggleSerpBadges = document.getElementById('toggleSerpBadges');
  const toggleShowDR = document.getElementById('toggleShowDR');
  const toggleShowDomainAge = document.getElementById('toggleShowDomainAge');
  const toggleShowYoungBadge = document.getElementById('toggleShowYoungBadge');

  // Settings - Cache Policy
  const selectCache = document.getElementById('selectCache');
  const btnClearCache = document.getElementById('btnClearCache');

  // Settings - API Connections
  const kwScannerKeysList = document.getElementById('kwScannerKeysList');
  const inputNewKwScannerKey = document.getElementById('inputNewKwScannerKey');
  const btnToggleNewKwScannerMask = document.getElementById('btnToggleNewKwScannerMask');
  const btnAddKwScannerKey = document.getElementById('btnAddKwScannerKey');
  const rowAddKwScannerKey = document.getElementById('rowAddKwScannerKey');
  const btnToggleUpdateKwScanner = document.getElementById('btnToggleUpdateKwScanner');
  const kwScannerKeyStatus = document.getElementById('kwScannerKeyStatus');
  const btnTestKwScanner = document.getElementById('btnTestKwScanner');
  const kwScannerTestResult = document.getElementById('kwScannerTestResult');

  const ahrefsKeysList = document.getElementById('ahrefsKeysList');
  const inputNewAhrefsKey = document.getElementById('inputNewAhrefsKey');
  const rowAddAhrefsKey = document.getElementById('rowAddAhrefsKey');
  const btnToggleUpdateAhrefs = document.getElementById('btnToggleUpdateAhrefs');
  const btnToggleNewAhrefsMask = document.getElementById('btnToggleNewAhrefsMask');
  const btnAddAhrefsKey = document.getElementById('btnAddAhrefsKey');
  const ahrefsKeyStatus = document.getElementById('ahrefsKeyStatus');
  const btnTestAhrefs = document.getElementById('btnTestAhrefs');
  const ahrefsTestResult = document.getElementById('ahrefsTestResult');

  let userKwScannerKey = '';
  let isKwScannerDiscontinued = false;

  let userAhrefsKey = '';
  let isAhrefsDiscontinued = false;

  let activeDomain = '';

  const DEFAULT_KWSCANNER_KEY = '';
  const DEFAULT_AHREFS_KEY = '';

  /**
   * Utility: Clean and normalize domain name
   */
  function cleanDomain(input) {
    if (!input || typeof input !== 'string') return '';
    let str = input.trim().toLowerCase();
    str = str.replace(/^https?:\/\//i, '');
    str = str.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
    str = str.replace(/^www\./i, '');
    return str;
  }

  /**
   * UI State Switchers
   */
  function showLoading() {
    if (skeletonView) skeletonView.style.display = 'block';
    if (dataView) dataView.style.display = 'none';
    if (errorView) errorView.style.display = 'none';
  }

  function showData() {
    if (skeletonView) skeletonView.style.display = 'none';
    if (dataView) dataView.style.display = 'block';
    if (errorView) errorView.style.display = 'none';
  }

  function showError(msg) {
    if (skeletonView) skeletonView.style.display = 'none';
    if (dataView) dataView.style.display = 'none';
    if (errorView) {
      errorView.style.display = 'flex';
      if (errorMessage) errorMessage.textContent = msg || 'Unable to fetch domain metrics.';
    }
  }

  function openSettings() {
    if (mainView) mainView.style.display = 'none';
    if (settingsView) settingsView.style.display = 'block';
  }

  function closeSettings() {
    if (settingsView) settingsView.style.display = 'none';
    if (mainView) mainView.style.display = 'block';
  }

  /**
   * Updates API status pills (Active / Discontinued)
   */
  function updateKeyStatusPills() {
    if (kwScannerKeyStatus) {
      const active = Boolean(userKwScannerKey && userKwScannerKey.trim()) && !isKwScannerDiscontinued;
      kwScannerKeyStatus.textContent = active ? '● Active' : '○ Discontinued';
      kwScannerKeyStatus.className = `status-pill ${active ? 'status-active' : 'status-inactive'}`;
    }
    if (ahrefsKeyStatus) {
      const active = Boolean(userAhrefsKey && userAhrefsKey.trim()) && !isAhrefsDiscontinued;
      ahrefsKeyStatus.textContent = active ? '● Active' : '○ Discontinued';
      ahrefsKeyStatus.className = `status-pill ${active ? 'status-active' : 'status-inactive'}`;
    }
  }

  /**
   * Masks sensitive credentials for display (e.g. "kw_live_9a...7x")
   */
  function maskKeyPreview(key) {
    if (!key) return '';
    const clean = key.trim();
    if (clean.length <= 14) return clean;
    return `${clean.slice(0, 12)}...${clean.slice(-4)}`;
  }

  /**
   * Universal clipboard copy helper with visual feedback
   */
  async function copyToClipboard(text, btnElement) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const temp = document.createElement('textarea');
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
    }
    if (btnElement) {
      const orig = btnElement.textContent;
      btnElement.textContent = '✓ Copied';
      btnElement.classList.add('copied');
      setTimeout(() => {
        btnElement.textContent = orig;
        btnElement.classList.remove('copied');
      }, 1500);
    }
  }

  /**
   * Renders the active KWScanner API key card or discontinued message
   */
  function renderKwScannerKeysList() {
    if (!kwScannerKeysList) return;
    kwScannerKeysList.innerHTML = '';

    const hasActiveKey = Boolean(userKwScannerKey && userKwScannerKey.trim()) && !isKwScannerDiscontinued;

    if (rowAddKwScannerKey) {
      rowAddKwScannerKey.style.display = hasActiveKey ? 'none' : 'flex';
    }
    if (btnToggleUpdateKwScanner) {
      btnToggleUpdateKwScanner.style.display = hasActiveKey ? 'inline-block' : 'none';
      btnToggleUpdateKwScanner.textContent = 'Update Token';
    }

    if (!hasActiveKey) {
      kwScannerKeysList.innerHTML = `
        <div style="font-size:11px;color:#94A3B8;font-style:italic;padding:6px 2px;">
          No KWScanner key active. Google Search volume &amp; CPC disabled. Paste your free token from <a href="https://kwscanner.com" target="_blank" style="color:#60A5FA;">kwscanner.com</a> below.
        </div>
      `;
      updateKeyStatusPills();
      return;
    }

    const item = document.createElement('div');
    item.className = 'api-key-item';
    item.innerHTML = `
      <div class="api-key-info">
        <span class="api-key-index">Active Key</span>
        <span class="api-key-preview" title="Click to copy: ${userKwScannerKey}">${maskKeyPreview(userKwScannerKey)}</span>
      </div>
      <div class="api-key-actions">
        <button type="button" class="btn-copy-key" id="btnCopyKwScanner" title="Copy full token to clipboard">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span>Copy</span>
        </button>
        <button type="button" class="btn-disconnect-key" id="btnDiscontinueKwScanner" title="Disconnect / Delete KWScanner Key">
          <span>Disconnect</span>
        </button>
      </div>
    `;

    item.querySelector('#btnCopyKwScanner')?.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(userKwScannerKey, e.currentTarget);
    });

    item.querySelector('#btnDiscontinueKwScanner')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const confirmed = window.confirm('Are you sure you want to disconnect your KWScanner API key? You can re-enter it at any time.');
      if (!confirmed) return;

      userKwScannerKey = '';
      isKwScannerDiscontinued = true;
      saveSettings();
      renderKwScannerKeysList();
      if (kwScannerTestResult) {
        kwScannerTestResult.style.display = 'inline-block';
        kwScannerTestResult.textContent = 'KWScanner API disconnected.';
        kwScannerTestResult.className = 'test-result-badge';
      }
      loadLiveAccountCredits('');
    });

    kwScannerKeysList.appendChild(item);
    updateKeyStatusPills();
  }

  /**
   * Renders the active Ahrefs Free Token card or discontinued message
   */
  function renderAhrefsKeysList() {
    if (!ahrefsKeysList) return;
    ahrefsKeysList.innerHTML = '';

    const hasActiveKey = Boolean(userAhrefsKey && userAhrefsKey.trim()) && !isAhrefsDiscontinued;

    if (rowAddAhrefsKey) {
      rowAddAhrefsKey.style.display = hasActiveKey ? 'none' : 'flex';
    }
    if (btnToggleUpdateAhrefs) {
      btnToggleUpdateAhrefs.style.display = hasActiveKey ? 'inline-block' : 'none';
      btnToggleUpdateAhrefs.textContent = 'Update Token';
    }

    if (!hasActiveKey) {
      ahrefsKeysList.innerHTML = `
        <div style="font-size:11px;color:#94A3B8;font-style:italic;padding:6px 2px;">
          No custom Ahrefs key active. DR scores automatically powered by free public endpoint. Paste your own token below for direct access.
        </div>
      `;
      updateKeyStatusPills();
      return;
    }

    const item = document.createElement('div');
    item.className = 'api-key-item';
    item.innerHTML = `
      <div class="api-key-info">
        <span class="api-key-index">Active Key</span>
        <span class="api-key-preview" title="Click to copy: ${userAhrefsKey}">${maskKeyPreview(userAhrefsKey)}</span>
      </div>
      <div class="api-key-actions">
        <button type="button" class="btn-copy-key" id="btnCopyAhrefs" title="Copy full token to clipboard">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span>Copy</span>
        </button>
        <button type="button" class="btn-disconnect-key" id="btnDiscontinueAhrefs" title="Disconnect / Delete Ahrefs Key">
          <span>Disconnect</span>
        </button>
      </div>
    `;

    item.querySelector('#btnCopyAhrefs')?.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(userAhrefsKey, e.currentTarget);
    });

    item.querySelector('#btnDiscontinueAhrefs')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const confirmed = window.confirm('Are you sure you want to disconnect your Ahrefs token? DR will fallback to free public endpoint.');
      if (!confirmed) return;

      userAhrefsKey = '';
      isAhrefsDiscontinued = true;
      saveSettings();
      renderAhrefsKeysList();
      if (ahrefsTestResult) {
        ahrefsTestResult.style.display = 'inline-block';
        ahrefsTestResult.textContent = 'Ahrefs API disconnected.';
        ahrefsTestResult.className = 'test-result-badge';
      }
    });

    ahrefsKeysList.appendChild(item);
    updateKeyStatusPills();
  }



  /**
   * Short domain age formatter helper
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
   * Renders domain metrics onto the authority card
   */
  function renderDomainData(data) {
    if (!data) return;

    const domainName = data.domain || activeDomain || '—';
    if (currentDomainDisplay) {
      currentDomainDisplay.textContent = domainName;
    }

    // Domain Age & Registration Date
    const ageFormatted = data.ageFormatted || (data.age?.age ? (typeof formatDomainAgeShort === 'function' ? formatDomainAgeShort(data.age.age) : '—') : '—');
    const regDateStr = data.registrationDate?.fullString || data.age?.registrationDate?.fullString || (data.age?.success ? 'Available in registry' : 'Unavailable');
    if (domainAgeDisplay) domainAgeDisplay.textContent = ageFormatted;
    if (domainRegDateDisplay) domainRegDateDisplay.textContent = regDateStr;

    // Young Website Badge (< 1 Year)
    const isYoung = data.isYoung ?? (data.age?.age ? (data.age.age.totalMonths < 12) : false);
    if (youngWebsiteTag) {
      youngWebsiteTag.style.display = isYoung ? 'inline-flex' : 'none';
    }

    // SEO Lifecycle Stage
    const insights = data.insights || (data.age?.success && typeof evaluateSEOInsights === 'function' ? evaluateSEOInsights(data.age) : null);
    if (insights) {
      if (lifecycleStageTag) {
        lifecycleStageTag.textContent = insights.stageName;
        lifecycleStageTag.style.display = 'inline-flex';
        lifecycleStageTag.style.backgroundColor = `${insights.badgeColor}22`;
        lifecycleStageTag.style.color = insights.badgeColor;
      }
      if (lifecycleDetailsBox) {
        lifecycleDetailsBox.style.display = 'block';
        if (lifecycleBadge) {
          lifecycleBadge.textContent = insights.stageName;
          lifecycleBadge.style.backgroundColor = insights.badgeColor;
        }
        if (lifecycleDesc) {
          lifecycleDesc.textContent = insights.seoStrategy || insights.riskAssessment || '';
        }
      }
    } else {
      if (lifecycleStageTag) lifecycleStageTag.style.display = 'none';
      if (lifecycleDetailsBox) lifecycleDetailsBox.style.display = 'none';
    }

    if (domainBannerTags) {
      domainBannerTags.style.display = (isYoung || insights) ? 'flex' : 'none';
    }

    // Ahrefs DR
    const dr = (data.dr && data.dr.dr !== null && data.dr.dr !== undefined)
      ? Number(data.dr.dr)
      : null;

    if (drScoreDisplay) {
      drScoreDisplay.textContent = dr !== null ? dr : '—';
    }
    if (drProgressFill) {
      drProgressFill.style.width = dr !== null ? `${Math.min(100, Math.max(0, dr))}%` : '0%';
    }
    if (drStatusTitle) {
      if (data.dr?.tier) {
        drStatusTitle.textContent = data.dr.tier;
      } else if (dr !== null) {
        drStatusTitle.textContent = dr >= 80 ? 'Elite Authority' : dr >= 60 ? 'High Authority' : dr >= 40 ? 'Moderate Authority' : dr >= 20 ? 'Emerging Authority' : 'Minimal Authority';
      } else {
        drStatusTitle.textContent = 'Domain Rating';
      }
    }

    showData();
  }

  /**
   * Request domain intelligence from background service worker
   */
  async function fetchDomainData(domain, forceRefresh = false) {
    const clean = cleanDomain(domain);
    if (!clean) {
      showError('Please enter a valid domain name.');
      return;
    }

    activeDomain = clean;
    if (currentDomainDisplay) currentDomainDisplay.textContent = clean;

    // 0ms INSTANT Cache check: If this domain was already queried, render immediately without waiting
    if (!forceRefresh) {
      try {
        const cacheKey = `cache_${clean}`;
        const stored = await chrome.storage.local.get(cacheKey);
        if (stored && stored[cacheKey] && stored[cacheKey].data) {
          renderDomainData(stored[cacheKey].data);
          if (!/(?:^|\.)google\.[a-z.]+/i.test(clean)) {
            chrome.storage.local.set({ cerpspy_last_domain: clean }).catch(() => {});
          }
          return;
        }
      } catch (_) {}
    }

    showLoading();

    const action = forceRefresh ? 'REFRESH_DOMAIN_DATA' : 'GET_DOMAIN_DATA';
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action, domain: clean, context: 'popup' },
        (response) => {
          if (chrome.runtime.lastError) {
            showError(chrome.runtime.lastError.message || 'Service worker connection error.');
            resolve();
            return;
          }
          if (response && response.success && response.data) {
            renderDomainData(response.data);
            if (!/(?:^|\.)google\.[a-z.]+/i.test(clean)) {
              chrome.storage.local.set({ cerpspy_last_domain: clean }).catch(() => {});
            }
          } else {
            showError(response?.error || 'Failed to fetch domain authority.');
          }
          resolve();
        }
      );
    });
  }

  /**
   * Load settings directly from storage (0ms instant response)
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['cerpspy_settings']);
      const s = result.cerpspy_settings || {};

      if (toggleSearchBarPanel) toggleSearchBarPanel.checked = s.searchBarPanelEnabled !== false;
      if (toggleShowVolume) toggleShowVolume.checked = s.showVolume !== false;
      if (toggleShowCpc) toggleShowCpc.checked = s.showCpc !== false;
      if (toggleShowCompetition) toggleShowCompetition.checked = s.showCompetition !== false;
      if (toggleShowTrend) toggleShowTrend.checked = s.showTrend !== false;
      if (toggleAutoFetchKeywords) toggleAutoFetchKeywords.checked = s.autoFetchKeywords !== false;
      if (toggleShowExport) toggleShowExport.checked = s.showExport !== false;
      if (toggleShowPaa) toggleShowPaa.checked = s.showPaa !== false;
      if (toggleShowBookmark) toggleShowBookmark.checked = s.showBookmark !== false;
      if (toggleShowOpportunity) toggleShowOpportunity.checked = s.showOpportunity !== false;
      if (toggleShowIntent) toggleShowIntent.checked = s.showIntentClassifier !== false;
      if (toggleShowFilters) toggleShowFilters.checked = s.showSerpFilters !== false;

      if (selectTargetCountry && s.targetCountry && s.manualCountrySelected) {
        selectTargetCountry.value = s.targetCountry;
      } else if (selectTargetCountry && s.targetCountry && s.targetCountry !== 'auto') {
        selectTargetCountry.value = s.targetCountry;
      } else if (selectTargetCountry) {
        selectTargetCountry.value = 'global';
      }

      if (selectKwNetwork && s.kwNetwork) {
        selectKwNetwork.value = s.kwNetwork;
      } else if (selectKwNetwork) {
        selectKwNetwork.value = 'google_search_and_partners';
      }

      if (toggleSerpBadges) toggleSerpBadges.checked = s.serpBadgesEnabled !== false;
      if (toggleShowDR) toggleShowDR.checked = s.showDomainRating !== false;
      if (toggleShowDomainAge) toggleShowDomainAge.checked = s.showDomainAge !== false;
      if (toggleShowYoungBadge) toggleShowYoungBadge.checked = s.showYoungBadge !== false;

      if (selectCache && s.cacheTtlHours !== undefined) {
        selectCache.value = String(s.cacheTtlHours);
      }

      isKwScannerDiscontinued = s.kwScannerDiscontinued === true || s.kwScannerApiKey === '';
      userKwScannerKey = isKwScannerDiscontinued
        ? ''
        : ((s.kwScannerApiKey && s.kwScannerApiKey.trim())
            ? s.kwScannerApiKey.trim()
            : DEFAULT_KWSCANNER_KEY);

      isAhrefsDiscontinued = s.ahrefsDiscontinued === true || s.ahrefsApiKey === '';
      userAhrefsKey = isAhrefsDiscontinued
        ? ''
        : ((s.ahrefsApiKey && s.ahrefsApiKey.trim())
            ? s.ahrefsApiKey.trim()
            : DEFAULT_AHREFS_KEY);

      renderKwScannerKeysList();
      renderAhrefsKeysList();

      updateKeyStatusPills();
      loadLiveAccountCredits(isKwScannerDiscontinued ? '' : userKwScannerKey);
    } catch (e) {
      console.warn('[cerpspy] loadSettings notice:', e);
    }
  }

  /**
   * Persist settings to storage and notify active tabs
   */
  function saveSettings() {
    const updated = {
      searchBarPanelEnabled: toggleSearchBarPanel ? toggleSearchBarPanel.checked : true,
      showVolume: toggleShowVolume ? toggleShowVolume.checked : true,
      showCpc: toggleShowCpc ? toggleShowCpc.checked : true,
      showCompetition: toggleShowCompetition ? toggleShowCompetition.checked : true,
      showTrend: toggleShowTrend ? toggleShowTrend.checked : true,
      showExport: toggleShowExport ? toggleShowExport.checked : true,
      showPaa: toggleShowPaa ? toggleShowPaa.checked : true,
      showBookmark: toggleShowBookmark ? toggleShowBookmark.checked : true,
      showOpportunity: toggleShowOpportunity ? toggleShowOpportunity.checked : true,
      showIntentClassifier: toggleShowIntent ? toggleShowIntent.checked : true,
      showSerpFilters: toggleShowFilters ? toggleShowFilters.checked : true,
      autoFetchKeywords: toggleAutoFetchKeywords ? toggleAutoFetchKeywords.checked : true,
      targetCountry: selectTargetCountry ? selectTargetCountry.value : 'global',
      manualCountrySelected: Boolean(selectTargetCountry && selectTargetCountry.value !== 'auto'),
      kwNetwork: selectKwNetwork ? selectKwNetwork.value : 'google_search_and_partners',

      serpBadgesEnabled: toggleSerpBadges ? toggleSerpBadges.checked : true,
      showDomainRating: toggleShowDR ? toggleShowDR.checked : true,
      showDomainAge: toggleShowDomainAge ? toggleShowDomainAge.checked : true,
      showYoungBadge: toggleShowYoungBadge ? toggleShowYoungBadge.checked : true,

      cacheTtlHours: selectCache ? Number(selectCache.value) : 720,

      kwScannerDiscontinued: isKwScannerDiscontinued,
      kwScannerApiKey: isKwScannerDiscontinued ? '' : (userKwScannerKey || ''),
      ahrefsDiscontinued: isAhrefsDiscontinued,
      ahrefsApiKey: isAhrefsDiscontinued ? '' : (userAhrefsKey || '')
    };

    chrome.runtime.sendMessage({ action: 'SAVE_SETTINGS', settings: updated }, () => {
      if (chrome.runtime.lastError) {
        // Non-fatal if service worker is busy
      }
    });
    updateKeyStatusPills();
    loadLiveAccountCredits(isKwScannerDiscontinued ? '' : updated.kwScannerApiKey);
  }

  /**
   * Password Mask Toggle Helper
   */
  function setupMaskToggle(btn, input) {
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? '🙈' : '👁️';
    });
  }

  setupMaskToggle(btnToggleNewKwScannerMask, inputNewKwScannerKey);
  setupMaskToggle(btnToggleNewAhrefsMask, inputNewAhrefsKey);

  // Search input actions
  // Search input actions
  function handleAnalyzeTrigger() {
    closeSettings();
    let val = domainInput ? domainInput.value.trim() : '';
    if (!val && activeDomain) {
      val = activeDomain;
      if (domainInput) domainInput.value = activeDomain;
    }
    if (val) {
      if (btnSearch) {
        btnSearch.textContent = 'Analyzing...';
        btnSearch.disabled = true;
      }
      fetchDomainData(val, true).finally(() => {
        if (btnSearch) {
          btnSearch.textContent = 'Analyze';
          btnSearch.disabled = false;
        }
      });
    } else if (domainInput) {
      domainInput.focus();
    }
  }

  if (btnSearch && domainInput) {
    btnSearch.addEventListener('click', handleAnalyzeTrigger);

    domainInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAnalyzeTrigger();
      }
    });
  }

  // Refresh button action (Both arrows icon)
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      closeSettings();
      btnRefresh.classList.add('is-spinning');
      const target = (domainInput && domainInput.value.trim()) || activeDomain || 'nytimes.com';
      fetchDomainData(target, true).finally(() => {
        setTimeout(() => btnRefresh.classList.remove('is-spinning'), 800);
      });
    });
  }

  // Settings view toggling
  if (btnSettings) btnSettings.addEventListener('click', openSettings);
  if (btnBackSettings) btnBackSettings.addEventListener('click', closeSettings);
  if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);

  // Quick Competitor Scan Buttons
  document.querySelectorAll('.quick-domain-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const dom = btn.getAttribute('data-domain');
      if (dom) {
        if (domainInput) domainInput.value = dom;
        closeSettings();
        fetchDomainData(dom, false);
      }
    });
  });

  // Settings change listeners
  const allToggles = [
    toggleSearchBarPanel, toggleShowVolume, toggleShowCpc, toggleShowCompetition,
    toggleShowTrend, toggleAutoFetchKeywords,
    toggleShowExport, toggleShowPaa, toggleShowBookmark, toggleShowOpportunity,
    toggleShowIntent, toggleShowFilters,
    toggleSerpBadges, toggleShowDR,
    toggleShowDomainAge, toggleShowYoungBadge
  ];
  allToggles.forEach((el) => {
    if (el) el.addEventListener('change', saveSettings);
  });

  if (selectCache) selectCache.addEventListener('change', saveSettings);
  if (selectTargetCountry) selectTargetCountry.addEventListener('change', saveSettings);
  if (selectKwNetwork) selectKwNetwork.addEventListener('change', saveSettings);

  // Clear cache action
  if (btnClearCache) {
    btnClearCache.addEventListener('click', () => {
      const origText = btnClearCache.textContent;
      btnClearCache.textContent = 'Clearing...';
      btnClearCache.disabled = true;

      chrome.runtime.sendMessage({ action: 'CLEAR_CACHE' }, (res) => {
        if (chrome.runtime.lastError) {
          btnClearCache.textContent = origText;
          btnClearCache.disabled = false;
          return;
        }
        const count = res?.cleared || 0;
        btnClearCache.textContent = `Cleared ${count} entries!`;
        setTimeout(() => {
          btnClearCache.textContent = origText;
          btnClearCache.disabled = false;
          if (activeDomain) fetchDomainData(activeDomain, true);
        }, 1200);
      });
    });
  }

  /**
   * Fetches and displays live KWScanner account profile and credits balance.
   * Loads from storage cache instantly (0ms) so user never sees "Checking account..."
   */
  async function loadLiveAccountCredits(customKey = null) {
    if (!accountCreditsCard) return;

    if (isKwScannerDiscontinued || (customKey !== null && !customKey)) {
      if (liveCreditsDisplay) liveCreditsDisplay.textContent = 'Off';
      if (accountUserName) accountUserName.textContent = 'KWScanner Discontinued';
      if (accountUserEmail) {
        accountUserEmail.textContent = 'Enable in Settings';
        accountUserEmail.style.display = 'block';
      }
      return;
    }

    // 0ms instant display from local storage cache
    try {
      const cached = await chrome.storage.local.get('cerpspy_account_cache');
      const acct = cached?.cerpspy_account_cache;
      if (acct) {
        if (liveCreditsDisplay && acct.credits !== undefined) {
          liveCreditsDisplay.textContent = Number(acct.credits).toLocaleString();
        }
        if (accountUserName && acct.name) {
          accountUserName.textContent = acct.name;
          accountUserName.style.display = 'block';
        }
        if (accountUserEmail && acct.email) {
          accountUserEmail.textContent = acct.email;
          accountUserEmail.style.display = 'block';
        }
      }
    } catch (_) {}

    chrome.runtime.sendMessage({ action: 'GET_KWSCANNER_ACCOUNT', apiKey: customKey }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.success) {
        // Real-time live credits
        const credits = typeof res.credits === 'number' ? res.credits : 0;
        if (liveCreditsDisplay) {
          liveCreditsDisplay.textContent = Number(credits).toLocaleString();
        }

        // Account Name & Email
        const hasName = Boolean(res.name && res.name.trim());
        const hasEmail = Boolean(res.email && res.email.trim());

        if (accountUserName) {
          accountUserName.textContent = hasName ? res.name.trim() : 'KWScanner Account';
          accountUserName.style.display = 'block';
        }

        if (accountUserEmail) {
          if (hasEmail) {
            accountUserEmail.textContent = res.email.trim();
            accountUserEmail.style.display = 'block';
          } else {
            accountUserEmail.style.display = 'none';
          }
        }

        // Cache for 0ms instant load on next popup open
        chrome.storage.local.set({
          cerpspy_account_cache: {
            credits,
            name: hasName ? res.name.trim() : 'KWScanner Account',
            email: hasEmail ? res.email.trim() : ''
          }
        }).catch(() => {});
      } else if (res && res.discontinued) {
        if (liveCreditsDisplay) liveCreditsDisplay.textContent = 'Off';
        if (accountUserName) accountUserName.textContent = 'KWScanner Discontinued';
        if (accountUserEmail) {
          accountUserEmail.textContent = 'Enable in Settings';
          accountUserEmail.style.display = 'block';
        }
      }
    });
  }

  // Add new KWScanner key action
  if (btnAddKwScannerKey && inputNewKwScannerKey) {
    btnAddKwScannerKey.addEventListener('click', () => {
      const val = inputNewKwScannerKey.value.trim();
      if (!val) {
        if (kwScannerTestResult) {
          kwScannerTestResult.style.display = 'inline-block';
          kwScannerTestResult.textContent = 'Please enter a valid KWScanner API token.';
          kwScannerTestResult.className = 'test-result-badge error';
        }
        return;
      }
      userKwScannerKey = val;
      isKwScannerDiscontinued = false;
      inputNewKwScannerKey.value = '';
      saveSettings();
      renderKwScannerKeysList();
      if (kwScannerTestResult) {
        kwScannerTestResult.style.display = 'inline-block';
        kwScannerTestResult.textContent = 'Token saved! Testing connection...';
        kwScannerTestResult.className = 'test-result-badge';
      }
      btnTestKwScanner?.click();
    });

    inputNewKwScannerKey.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnAddKwScannerKey.click();
      }
    });
  }

  // Toggle update token row for KWScanner
  if (btnToggleUpdateKwScanner && rowAddKwScannerKey) {
    btnToggleUpdateKwScanner.addEventListener('click', () => {
      const isHidden = rowAddKwScannerKey.style.display === 'none';
      if (isHidden) {
        rowAddKwScannerKey.style.display = 'flex';
        btnToggleUpdateKwScanner.textContent = 'Cancel';
        inputNewKwScannerKey?.focus();
      } else {
        rowAddKwScannerKey.style.display = 'none';
        btnToggleUpdateKwScanner.textContent = 'Update Token';
      }
    });
  }

  // Test KWScanner connection action
  if (btnTestKwScanner) {
    btnTestKwScanner.addEventListener('click', () => {
      const key = (userKwScannerKey || '').trim();
      if (!key || isKwScannerDiscontinued) {
        if (kwScannerTestResult) {
          kwScannerTestResult.style.display = 'inline-block';
          kwScannerTestResult.textContent = 'Please paste a valid KWScanner token above first.';
          kwScannerTestResult.className = 'test-result-badge error';
        }
        return;
      }

      btnTestKwScanner.disabled = true;
      btnTestKwScanner.textContent = 'Testing...';
      if (kwScannerTestResult) kwScannerTestResult.style.display = 'none';

      chrome.runtime.sendMessage({ action: 'TEST_KWSCANNER_AUTH', apiKey: key }, (res) => {
        btnTestKwScanner.disabled = false;
        btnTestKwScanner.textContent = 'Test Connection';
        if (chrome.runtime.lastError) {
          if (kwScannerTestResult) {
            kwScannerTestResult.style.display = 'inline-block';
            kwScannerTestResult.textContent = 'Error: ' + chrome.runtime.lastError.message;
            kwScannerTestResult.className = 'test-result-badge error';
          }
          return;
        }
        if (kwScannerTestResult) {
          kwScannerTestResult.style.display = 'inline-block';
          if (res && res.success) {
            const cr = Number(res.credits || 0).toLocaleString();
            const usr = res.name ? ` (${res.name})` : '';
            kwScannerTestResult.textContent = `Connected! ${cr} Credits${usr}`;
            kwScannerTestResult.className = 'test-result-badge success';
            loadLiveAccountCredits(key);
            saveSettings();
          } else {
            kwScannerTestResult.textContent = `Error: ${res?.error || 'Invalid API Token'}`;
            kwScannerTestResult.className = 'test-result-badge error';
          }
        }
      });
    });
  }

  // Add new Ahrefs key action
  if (btnAddAhrefsKey && inputNewAhrefsKey) {
    btnAddAhrefsKey.addEventListener('click', () => {
      const val = inputNewAhrefsKey.value.trim();
      if (!val) {
        if (ahrefsTestResult) {
          ahrefsTestResult.style.display = 'inline-block';
          ahrefsTestResult.textContent = 'Please enter an Ahrefs Free Token.';
          ahrefsTestResult.className = 'test-result-badge error';
        }
        return;
      }
      userAhrefsKey = val;
      isAhrefsDiscontinued = false;
      inputNewAhrefsKey.value = '';
      saveSettings();
      renderAhrefsKeysList();
      if (ahrefsTestResult) {
        ahrefsTestResult.style.display = 'inline-block';
        ahrefsTestResult.textContent = 'Token saved! Testing connection...';
        ahrefsTestResult.className = 'test-result-badge';
      }
      btnTestAhrefs?.click();
    });

    inputNewAhrefsKey.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnAddAhrefsKey.click();
      }
    });
  }

  // Toggle update token row for Ahrefs
  if (btnToggleUpdateAhrefs && rowAddAhrefsKey) {
    btnToggleUpdateAhrefs.addEventListener('click', () => {
      const isHidden = rowAddAhrefsKey.style.display === 'none';
      if (isHidden) {
        rowAddAhrefsKey.style.display = 'flex';
        btnToggleUpdateAhrefs.textContent = 'Cancel';
        inputNewAhrefsKey?.focus();
      } else {
        rowAddAhrefsKey.style.display = 'none';
        btnToggleUpdateAhrefs.textContent = 'Update Token';
      }
    });
  }

  // Test Ahrefs connection action
  if (btnTestAhrefs) {
    btnTestAhrefs.addEventListener('click', () => {
      const key = (userAhrefsKey || '').trim();
      if (!key || isAhrefsDiscontinued) {
        if (ahrefsTestResult) {
          ahrefsTestResult.style.display = 'inline-block';
          ahrefsTestResult.textContent = 'DR works automatically via free public endpoint. Enter a token above to test custom access.';
          ahrefsTestResult.className = 'test-result-badge';
        }
        return;
      }

      btnTestAhrefs.disabled = true;
      btnTestAhrefs.textContent = 'Testing...';
      if (ahrefsTestResult) ahrefsTestResult.style.display = 'none';

      chrome.runtime.sendMessage({ action: 'TEST_AHREFS_AUTH', apiKey: key }, (res) => {
        btnTestAhrefs.disabled = false;
        btnTestAhrefs.textContent = 'Test Connection';
        if (chrome.runtime.lastError) {
          if (ahrefsTestResult) {
            ahrefsTestResult.style.display = 'inline-block';
            ahrefsTestResult.textContent = 'Error: ' + chrome.runtime.lastError.message;
            ahrefsTestResult.className = 'test-result-badge error';
          }
          return;
        }
        if (ahrefsTestResult) {
          ahrefsTestResult.style.display = 'inline-block';
          if (res && res.success) {
            ahrefsTestResult.textContent = res.message || 'Connected! Valid Token';
            ahrefsTestResult.className = 'test-result-badge success';
            saveSettings();
          } else {
            ahrefsTestResult.textContent = `Error: ${res?.error || 'Failed to connect'}`;
            ahrefsTestResult.className = 'test-result-badge error';
          }
        }
      });
    });
  }

  // Detect active tab domain on startup
  async function detectCurrentTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0 && tabs[0].url) {
        const url = tabs[0].url;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const dom = cleanDomain(url);
          if (dom) {
            // If the user is on Google Search / engine, avoid querying google.com (DR 100)
            const isGoogle = /(?:^|\.)google\.[a-z.]+/i.test(dom);
            if (isGoogle) {
              try {
                const u = new URL(url);
                const q = u.searchParams.get('q');
                if (q && cardSerpTools && serpQueryDisplay) {
                  cardSerpTools.style.display = 'block';
                  serpQueryDisplay.textContent = `"${q}"`;
                  serpQueryDisplay.title = q;
                  setupSerpToolsActions(tabs[0].id, q);
                }
              } catch (_) {}

              const stored = await chrome.storage.local.get('cerpspy_last_domain');
              const fallback = stored?.cerpspy_last_domain || 'nytimes.com';
              activeDomain = fallback;
              if (domainInput) {
                domainInput.value = '';
                domainInput.placeholder = `Check competitor (e.g. ${fallback})...`;
              }
              fetchDomainData(fallback);
              return;
            }

            activeDomain = dom;
            if (domainInput) domainInput.value = dom;
            fetchDomainData(dom);
            return;
          }
        }
      }
      const stored = await chrome.storage.local.get('cerpspy_last_domain');
      const fallback = stored?.cerpspy_last_domain || 'nytimes.com';
      activeDomain = fallback;
      if (domainInput) domainInput.value = fallback;
      fetchDomainData(fallback);
    } catch (e) {
      activeDomain = 'nytimes.com';
      fetchDomainData('nytimes.com');
    }
  }

  // Hook up 1-click actions for SERP tools inside popup
  function setupSerpToolsActions(tabId, query) {
    if (btnPopupExportCsv) {
      btnPopupExportCsv.onclick = (e) => {
        e.preventDefault();
        btnPopupExportCsv.disabled = true;
        btnPopupExportCsv.classList.add('is-success');
        chrome.tabs.sendMessage(tabId, { action: 'TRIGGER_SERP_EXPORT' }, (res) => {
          setTimeout(() => {
            btnPopupExportCsv.disabled = false;
            btnPopupExportCsv.classList.remove('is-success');
          }, 1500);
          if (serpToolFeedback) {
            serpToolFeedback.style.display = 'block';
            serpToolFeedback.textContent = '✓ SERP Export CSV Downloaded!';
            setTimeout(() => { serpToolFeedback.style.display = 'none'; }, 2500);
          }
        });
      };
    }

    if (btnPopupCopyPaa) {
      btnPopupCopyPaa.onclick = (e) => {
        e.preventDefault();
        btnPopupCopyPaa.disabled = true;
        btnPopupCopyPaa.classList.add('is-success');
        chrome.tabs.sendMessage(tabId, { action: 'TRIGGER_COPY_PAA' }, (res) => {
          setTimeout(() => {
            btnPopupCopyPaa.disabled = false;
            btnPopupCopyPaa.classList.remove('is-success');
          }, 1500);
          if (serpToolFeedback) {
            serpToolFeedback.style.display = 'block';
            const count = res?.count || 0;
            serpToolFeedback.textContent = count > 0 ? `✓ Copied ${count} PAA Questions!` : '✓ Copied PAA Questions to clipboard!';
            setTimeout(() => { serpToolFeedback.style.display = 'none'; }, 2500);
          }
        });
      };
    }
  }

  // Initialize
  loadSettings();
  loadLiveAccountCredits();
  detectCurrentTab();
});
