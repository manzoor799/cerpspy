/**
 * cerpspy - SEO Insights & Age Lifecycle Engine
 * Evaluates domain maturity, trust score, crawl priority, and volatility
 * based on the customizable data/seo-insights.json brackets.
 */

const DEFAULT_BRACKETS = [
  {
    id: 'sandbox',
    minAgeMonths: 0,
    maxAgeMonths: 6,
    stageName: 'Infant / Sandbox Phase',
    trustScore: 20,
    badgeColor: '#D95338',
    crawlStatus: 'Cautious Crawl / Restricted Indexation',
    riskAssessment: 'High Algorithmic Volatility',
    seoStrategy: 'Focus on clean on-page technical foundation, long-tail informational queries, and brand search anchors. Do not aggressively build commercial links.',
    keySignals: [
      'Minimal historical search engine trust',
      'Subject to standard sandbox ranking delays',
      'High algorithmic volatility for commercial queries'
    ]
  },
  {
    id: 'emerging',
    minAgeMonths: 6,
    maxAgeMonths: 24,
    stageName: 'Emerging Domain',
    trustScore: 45,
    badgeColor: '#D97706',
    crawlStatus: 'Establishing Crawl Equity',
    riskAssessment: 'Moderate Volatility',
    seoStrategy: 'Scale topical authority clusters, improve internal link architecture, and acquire contextually relevant editorial backlinks.',
    keySignals: [
      'Escaping sandbox containment',
      'Gradual increase in crawl frequency',
      'Core topical relevance starting to register'
    ]
  },
  {
    id: 'established',
    minAgeMonths: 24,
    maxAgeMonths: 60,
    stageName: 'Established Authority',
    trustScore: 70,
    badgeColor: '#1E3A2F',
    crawlStatus: 'Priority Crawl / High Velocity',
    riskAssessment: 'Stable Algorithmic Resilience',
    seoStrategy: 'Target moderate to high difficulty commercial keywords and expand topical reach across secondary sub-niches.',
    keySignals: [
      'Proven ranking history and backlink diversity',
      'Healthy algorithmic immunity against routine core updates',
      'Frequent search bot crawl budget'
    ]
  },
  {
    id: 'mature',
    minAgeMonths: 60,
    maxAgeMonths: 120,
    stageName: 'Mature Authority',
    trustScore: 85,
    badgeColor: '#2D6A4F',
    crawlStatus: 'Continuous Deep Crawl',
    riskAssessment: 'Low Algorithmic Risk',
    seoStrategy: 'Consolidate top 3 SERP rankings, refresh legacy high-value URLs, and expand into competitive head terms.',
    keySignals: [
      'Over 5 years of continuous operational history',
      'Established entity authority and brand signals',
      'Consistently fast indexing of newly published content'
    ]
  },
  {
    id: 'veteran',
    minAgeMonths: 120,
    maxAgeMonths: 9999,
    stageName: 'Veteran Domain',
    trustScore: 95,
    badgeColor: '#1E3A2F',
    crawlStatus: 'VIP Authority Crawl',
    riskAssessment: 'Algorithmic Fortress',
    seoStrategy: 'Dominate industry head keywords; defend market share with high-velocity digital PR and comprehensive topic coverage.',
    keySignals: [
      'Decade-plus unbroken registration heritage',
      'Immense historical link equity and brand affinity',
      'Maximum algorithmic trust across competitive search spaces'
    ]
  }
];

let loadedCustomBrackets = null;

/**
 * Loads custom brackets from data/seo-insights.json if in Chrome extension runtime.
 */
async function loadSeoInsightsBrackets() {
  if (loadedCustomBrackets) return loadedCustomBrackets;

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.getURL) {
      const url = chrome.runtime.getURL('data/seo-insights.json');
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.brackets) && json.brackets.length > 0) {
          loadedCustomBrackets = json.brackets;
          return loadedCustomBrackets;
        }
      }
    }
  } catch (err) {
    // Fall back silently to default brackets
  }

  loadedCustomBrackets = DEFAULT_BRACKETS;
  return loadedCustomBrackets;
}

/**
 * Evaluates domain age against SEO lifecycle stages.
 */
function evaluateSEOInsights(ageData, customBrackets = null) {
  try {
    const brackets = customBrackets || loadedCustomBrackets || DEFAULT_BRACKETS;
    if (!ageData) return null;

    // Extract age in months
    let ageMonths = 0;
    if (typeof ageData === 'number') {
      ageMonths = ageData;
    } else if (ageData.age && typeof ageData.age.totalMonths === 'number') {
      ageMonths = ageData.age.totalMonths;
    } else if (typeof ageData.totalMonths === 'number') {
      ageMonths = ageData.totalMonths;
    } else if (ageData.age && typeof ageData.age.years === 'number') {
      ageMonths = (ageData.age.years * 12) + (ageData.age.months || 0);
    }

    // Find matching bracket
    let matched = brackets.find(b => ageMonths >= b.minAgeMonths && ageMonths < b.maxAgeMonths);
    if (!matched && brackets.length > 0) {
      matched = brackets[brackets.length - 1];
    }

    if (!matched) return null;

    return {
      stageId: matched.id,
      stageName: matched.stageName,
      trustScore: matched.trustScore,
      badgeColor: matched.badgeColor,
      crawlStatus: matched.crawlStatus,
      riskAssessment: matched.riskAssessment,
      seoStrategy: matched.seoStrategy,
      keySignals: matched.keySignals || [],
      isYoung: ageMonths < 12,
      isSandbox: ageMonths < 6,
      ageMonths
    };
  } catch (err) {
    return null;
  }
}

// Module export / worker scope exposure
if (typeof self !== 'undefined') {
  self.DEFAULT_BRACKETS = DEFAULT_BRACKETS;
  self.evaluateSEOInsights = evaluateSEOInsights;
  self.loadSeoInsightsBrackets = loadSeoInsightsBrackets;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_BRACKETS,
    evaluateSEOInsights,
    loadSeoInsightsBrackets
  };
}
