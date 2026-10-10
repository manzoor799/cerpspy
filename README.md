# cerpspy — SEO & Keyword Intelligence

A clean, fast, lightweight Chrome Extension (Manifest V3) engineered for SEO professionals, niche builders, and digital marketers.

**cerpspy** enriches your Google search experience with:
1. **Search Bar Intel Strip**: Live monthly Search Volume, Cost Per Click (CPC), and interactive 12-Month Volume Trend Sparklines powered by the KWScanner API.
2. **SERP Authority Badges**: Compact smart chips displaying official **Ahrefs Domain Rating (DR)**, **Domain Age**, and **Young Website** indicators directly beside organic search results.
3. **Dedicated Domain Analyzer**: Fast popup to inspect domain authority and registration age for any website with a single click.

---

## Key Features

1. **Top Search Bar Intelligence Strip**
   - Injects directly beneath the Google search bar with strict boundary alignment.
   - Shows monthly **Search Volume** (e.g. `60.5K/mo`), advertiser **CPC** (e.g. `$1.20`), and **Ad Competition**.
   - **Search Intent Classifier**: Automatically identifies Informational, Commercial, Transactional, or Navigational intent.
   - Interactive **12-Month Sparkline** in `#4032c9` with hover breakdown popover (candlesticks & peak detection).
   - **⚡ Tools ▾ Menu**: Quick 1-click access to CSV Export, PAA Harvester, Keyword Bookmark, and SERP Filter toggles.
   - Dedicated refresh button to pull live data instantly.

2. **Clean SERP Result Badges**
   - Injects sleek smart chips beside organic results: `[ DR 85 · Age: 5 y · 🌱 Young Website ]`.
   - Injected directly beside the domain site name on the top line.
   - **Zero Noise Exclusion**: Intelligently excluded from AI Overviews, FAQs (People Also Ask), Video carousels, Knowledge Panels, and Ads.

3. **SERP Opportunity & Weak Spot Intel Popover**
   - 1-Click analysis of Page 1 competition directly from the Search Bar Strip opportunity pill.
   - Instantly detects ranking opportunities where low-authority domains (DR ≤ 20), young sites (< 1 yr), or discussion forums rank in the Top 10.
   - Client-side micro-filter pills (`All`, `🎯 DR ≤ 20`, `🌱 Young`) to toggle SERP results in 0ms without page reloads.

4. **Domain Age & SEO Lifecycle Stage Analyzer**
   - Direct registry RDAP queries (Verisign, PIR, Identity Digital, Nominet, etc.) with ICANN and Archive.org fallback.
   - Dynamic classification of domains into lifecycle stages: Sandbox, Emerging, Established, Mature, and Veteran.

5. **Dedicated Popup & Settings Drawer**
   - Real-time KWScanner live credit balance display and user profile info.
   - One-click **Test Connection** buttons for KWScanner and Ahrefs.
   - Full toggle customization for search bar strip items, SERP badges, and cache duration.

6. **High-Performance 30-Day Cache Policy**
   - Saves API credits with persistent sub-millisecond local caching in `chrome.storage.local`.
   - User-configurable cache duration: 30 Days (Fastest), 7 Days, 24 Hours, or Always Live.

---

## File Structure

```
cerpspy/
├── manifest.json              # Chrome Manifest V3 configuration
├── service-worker.js          # Background orchestrator & cache engine
├── icons/                     # Extension branding icons (16, 48, 128px)
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── popup/                     # Clean extension popup interface
│   ├── popup.html             # Authority card & preferences drawer
│   ├── popup.css              # Modern, flat stylesheet (#4032c9 brand theme)
│   └── popup.js               # Analyzer, connection testers & settings manager
├── content/                   # SERP injection overlay
│   ├── content.js             # Search bar strip & SERP badge injector
│   └── content.css            # Dark/light theme styles for Google SERP
├── data/
│   └── seo-insights.json      # Customizable age brackets & SEO lifecycle metadata
└── utils/                     # Active API modules
    ├── kwScanner.js           # KWScanner keyword volume, CPC & trend engine
    ├── domainRating.js        # Ahrefs Domain Rating (DR) integration
    ├── domainAge.js           # Direct RDAP & Archive.org domain age resolver
    └── seoInsights.js         # SEO maturity & lifecycle assessment engine
```

---

## Installation Guide (Chrome / Edge / Brave)

1. Open your browser and navigate to:
   ```
   chrome://extensions
   ```
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left toolbar.
4. Select the project directory:
   ```
   /Volumes/Manzoor/cerpspy
   ```
5. Pin **cerpspy** to your browser toolbar.
