# Chrome Web Store Submission Package for cerpspy

Use this document as your direct copy-paste reference when filling out the **Chrome Web Store Developer Dashboard** (https://chrome.google.com/webstore/devconsole).

---

## 1. Store Listing Metadata

### Extension Name:
```text
cerpspy: SERP SEO & Keyword Intelligence
```

### Short Name:
```text
cerpspy
```

### Summary / Short Description (Maximum 132 characters):
```text
Live keyword search volume, CPC, 12-month trends, Ahrefs DR, domain age, and SERP competitor ranking gap intelligence on Google.
```

### Category:
* **Productivity** (Primary) or **Developer Tools** (Secondary)

---

## 2. Detailed Description (Copy & Paste directly into Web Store)

```markdown
cerpspy transforms Google Search into an instant, all-in-one SEO and keyword intelligence suite. Get live Google search volume, advertiser CPC, 12-month search trends, Ahrefs Domain Rating (DR), and domain age badges right inside your search results.

Find low-hanging ranking opportunities, uncover weak competitor domains ranking on Page 1, and make data-driven keyword decisions without ever leaving Google.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 KEY FEATURES & CAPABILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. TOP SEARCH BAR INTEL STRIP
• Instant Search Volume & Cost Per Click (CPC) under the Google search input.
• Search Intent Classifier: Identifies Informational, Commercial, Transactional, or Navigational intent.
• 12-Month Historical Search Volume Trend Sparkline.
• Interactive Monthly Volume Breakdown with peak month indicators.
• Credit Saver Mode: Toggle on-demand keyword fetching to protect your API credits.
• 1-Click Keyword Bookmark: Copy clean keyword metrics to clipboard and save for later research.

2. INSTANT CLIENT-SIDE SERP FILTER TOGGLES
• 1-Click micro-filter chips: All, DR ≤ 20, Young Sites (< 1 yr), and Hide Forums (Reddit/Quora).
• Toggles organic search result visibility in 0ms with zero network requests or credit consumption.

3. NATIVE SERP RESULT AUTHORITY BADGES
• Ahrefs Domain Rating (DR) chip beside every Google search result (0–100 scale).
• Domain Age & Registration Year badges powered by ICANN RDAP registry records.
• Young Website Alerts: Instantly highlights fresh sites under 12 months old that rank on Page 1.
• Clean, clutter-free design that perfectly blends into Google's native interface.

4. OPPORTUNITY & WEAKNESS SCANNER
• 1-Click analysis of Page 1 competition with compact 2-tab modal (Rankable Targets vs Strategy & Barrier).
• Instantly detects "ranking gaps" when low-authority domains (DR ≤ 20) or forum threads outrank enterprise brands.
• Provides clear strategic ranking recommendations for niche site builders and affiliate marketers.
• 1-Click Export to Google Sheets & Excel: Copy all top 10 SERP competitor metrics in clean tabular format.

5. DEDICATED POPUP ANALYZER
• Inspect any domain's authority and registration heritage on demand.
• Authority meter: Ahrefs DR backlink strength.
• SEO lifecycle stage analysis (Infant, Emerging, Established, Legacy).
• Clean Dark and Light mode adapting automatically to your browser theme.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 PRIVACY & SECURITY FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Zero tracking or personal data collection.
• Does not inspect or read private browsing history.
• Runs exclusively on Google Search results pages.
• Your API keys stay 100% private and encrypted in your local browser storage.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 GETTING STARTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Click "Add to Chrome" to install cerpspy.
2. Search anything on Google.
3. Live keyword volume, trends, and competitor DR badges will appear automatically!
```

---

## 3. Privacy Practices (Required by Google Reviewers)

When filling out the **Privacy Practices** tab in the developer console:

### Single Purpose Description:
> *"cerpspy provides live keyword search volume, advertiser cost-per-click, domain authority metrics, and domain registration age directly on Google Search results pages to assist users with search engine optimization and competitor research."*

### Permission Justifications:

| Permission | Justification for Google Reviewer |
| :--- | :--- |
| **`storage`** | *"Used strictly to cache domain authority ratings, keyword volume metrics, and user preferences locally on the client to provide instant 0ms responses and minimize API network calls."* |
| **`tabs`** | *"Used to detect the current active tab's domain when the user opens the popup analyzer so it can immediately inspect the domain they are actively viewing."* |
| **`activeTab`** | *"Used to interact with the current Google search tab when the user triggers manual refresh actions or opens the extension popup."* |
| **`host_permissions` (`<all_urls>`)** | *"Required strictly in background service worker to fetch RDAP domain registration records from accredited ICANN registry servers across international ccTLD registrars (e.g., rdap.verisign.com, rdap.nominet.uk, rdap.org) to determine domain age."* |

### Data Usage Declarations:
* **Does this extension collect user data?** Select **NO**.
* **Do you sell user data?** Select **NO**.
* **Do you use or transfer data for purposes unrelated to the extension's single purpose?** Select **NO**.
* **Do you use data for lending or creditworthiness?** Select **NO**.

---

## 4. Store Assets Checklist

Before submitting, prepare these image assets:

1. **Icons (Already Generated & Ready in `/icons`):**
   * `icon-16.png` (16x16)
   * `icon-48.png` (48x48)
   * `icon-128.png` (128x128) - Used as main store icon.

2. **Store Screenshots (Required: 1 to 5 screenshots):**
   * Resolution: **1280x800** or **640x400** pixels (PNG or JPEG).
   * Recommended screenshots:
     - Screenshot 1: Google Search results showing the Top Search Bar Intel strip (Volume, CPC, Sparkline).
     - Screenshot 2: Opportunity Scanner popover open with "Weak Sites in Top 5 (DR ≤ 20)".
     - Screenshot 3: SERP badges beside results (`DR: 19`, `Age: 8 m`, `Young Website`).
     - Screenshot 4: Extension Popup with Domain Rating meters and SEO lifecycle stage.
     - Screenshot 5: Extension Settings drawer showing customizable preferences and Credit Saver Mode.

3. **Small Promo Tile (Optional but recommended):**
   * Size: **440x280** pixels.

---

## 5. Creating Your Submission ZIP

To package the extension into a clean, store-ready ZIP file, run this command in your terminal from the project folder:

```bash
zip -r -FS cerpspy_v3.0.0.zip . -x "*.git*" "*.DS_Store" "CHROME_WEB_STORE_SUBMISSION.md"
```

Then upload `cerpspy_v3.0.0.zip` to the **Chrome Web Store Developer Dashboard**!
