# Chrome Web Store Listing — cerpspy

**Extension Name:** cerpspy: SERP SEO & Keyword Intelligence  
**Short Name:** cerpspy  
**Version:** 3.1.0  
**Category:** Productivity / Developer Tools / Search Tools  

---

## 1. Store Copy

### Single-Sentence Summary (132 chars max)
Live keyword search volume, CPC, search intent, 12-month trends, Ahrefs DR, domain age, and 1-click SERP filters on Google.

### Detailed Description
cerpspy is a clean, lightning-fast SEO extension designed for digital marketers, niche site builders, and SEO professionals. It enriches your Google Search workflow with essential search metrics and domain authority scores—with zero clutter.

★ KEY FEATURES:

1. SEARCH BAR INTEL STRIP
• Injects cleanly beneath the Google search bar with zero layout jitter.
• Search Intent Classifier: Automatically detects Informational, Commercial, Transactional, and Navigational intents.
• Displays monthly Search Volume and estimated advertiser CPC.
• Interactive 12-Month Search Volume Trend Sparkline with monthly breakdown popovers on hover.
• Instant one-click refresh button.

2. INSTANT CLIENT-SIDE SERP FILTER TOGGLES
• 1-Click micro-filter chips: All, DR ≤ 20, Young Sites (< 1 yr), and Hide Discussion Forums (Reddit/Quora).
• Toggles organic search result visibility in 0ms with zero network requests or credit consumption.

3. CLEAN SERP RESULT BADGES
• Surfaces compact smart chips beside organic search results: [ DR 85 · Age: 5 y · 🌱 Young Website ].
• Shows authoritative Ahrefs Domain Rating (DR), Domain Age, and Young Website badge.
• Identifies young websites (< 1 year old) to help detect emerging competitors.
• Clean exclusion filter: never clutters AI Overviews, FAQs (People Also Ask), video carousels, or sponsored ads.

4. SERP OPPORTUNITY & WEAKNESS SCANNER
• 1-Click analysis of Page 1 competition with compact 2-tab modal (Rankable Targets vs Strategy & Barrier).
• Instantly detects ranking opportunities where low-authority domains (DR ≤ 20) or young sites rank on Page 1.
• 1-Click Export to Google Sheets & Excel: Copy all top 10 SERP competitor metrics in clean tabular format.

5. ON-WEBSITE FLOATING AUTHORITY DOCK
• Displays a subtle, ultra-lightweight right-edge authority tab on any website you visit showing live `[DR]` and `[Age]`.
• Hover to expand the domain header, exact registration date, one-click refresh, or close button.
• Instant 0ms synchronization with Google SERP badges—opening any result from Google displays its metrics immediately.

6. DEDICATED DOMAIN ANALYZER POPUP
• Open the extension popup on any webpage or search any domain to view ranking authority and domain heritage.
• Visual authority progress meters with descriptive tier classifications and SEO lifecycle analysis.
• Live KWScanner credits balance display and API connection status indicators.

7. 30-DAY INSTANT LOCAL CACHING
• Fast 0ms repeat viewing and massive API credit savings.
• Configurable cache TTL: 30 Days (Recommended), 7 Days, 24 Hours, or Always Live.

8. PRIVACY FIRST & EFFICIENT
• No browsing history or personal data is collected or tracked.
• Zero background network requests when you are not actively viewing a domain or searching.

---

## 2. Permissions Justification

| Permission | Specific Plain-English Justification |
|---|---|
| `tabs` | Required to read the URL of your active tab to display domain metrics and broadcast live setting or metric updates across open tabs. |
| `storage` | Required to store user display toggles and cache domain/keyword lookup results locally for fast 0ms repeat viewing without burning API credits. |
| `activeTab` | Required to analyze the current website domain upon user interaction with the extension popup. |
| `host_permissions` (`<all_urls>`) | Required to render the on-website floating DR & Age dock on visited websites, inject SERP intelligence across regional Google Search domains, and query public RDAP/WHOIS registries, Ahrefs DR, and KWScanner API endpoints from the background service worker. |
