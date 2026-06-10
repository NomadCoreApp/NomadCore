/**
 * NomadCore Threat Reality Profile — Risk Engine
 *
 * Computes Annualized Impact Scores (AIS) from FEMA National Risk Index data,
 * DOE EAGLE-I outage records, and expert estimates. Normalizes to relative
 * risk shares for display.
 *
 * Tiers:
 *   data      — backed by FEMA event counts / DOE outage records
 *   derived   — computed from existing data + location modifiers
 *   estimated — static expert estimates from published research
 */

// ===== Nav / UI bootstrap =====
(function() {
  var nav = document.getElementById('nav');
  window.addEventListener('scroll', function() {
    nav.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });

  var toggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  toggle.addEventListener('click', function() {
    toggle.classList.toggle('active');
    navLinks.classList.toggle('open');
  });
  navLinks.querySelectorAll('a').forEach(function(a) {
    a.addEventListener('click', function() {
      toggle.classList.remove('active');
      navLinks.classList.remove('open');
    });
  });

  var dlBtn = document.getElementById('downloadBtn');
  var dlMenu = document.getElementById('downloadMenu');
  if (dlBtn && dlMenu) {
    dlBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      dlMenu.classList.toggle('open');
    });
    document.addEventListener('click', function() {
      dlMenu.classList.remove('open');
    });
  }
})();

gtag('event', 'risk_profile_page_view', { event_category: 'engagement' });

// ===== Data =====
var zipToFips = null;
var countyData = null;

async function loadData() {
  if (zipToFips && countyData) return;
  var results = await Promise.all([
    fetch('../api/zip-to-fips.json'),
    fetch('../api/county-risk-data.json')
  ]);
  zipToFips = await results[0].json();
  countyData = await results[1].json();
}

// ===== Screen Management =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) {
    s.classList.remove('active');
  });
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== ZIP Input =====
var zipInput = document.getElementById('zipInput');
zipInput.addEventListener('input', function() {
  this.value = this.value.replace(/\D/g, '').slice(0, 5);
});
zipInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') checkRisk();
});

// Auto-fill from URL param
(function() {
  var params = new URLSearchParams(window.location.search);
  var zip = params.get('zip');
  if (zip && /^\d{5}$/.test(zip)) {
    zipInput.value = zip;
    setTimeout(checkRisk, 100);
  }
})();

// ===== Impact Weights =====
var DEFAULT_WEIGHTS = {
  tornado: 3.0, hurricane: 3.0, wildfire: 3.0, earthquake: 3.5,
  flood: 2.5, winter: 1.5, heat: 1.5, power_outage: 1.0,
  water_disruption: 2.0, supply_chain: 1.5, social_unrest: 1.0,
  medical_access: 2.0, mass_casualty: 1.5, communication: 1.0,
  economic: 1.5, pandemic: 2.0, cyber_attack: 1.5,
  em_grid_failure: 2.5, nuclear: 3.5, societal_collapse: 3.5
};
var weights = Object.assign({}, DEFAULT_WEIGHTS);

// ===== Icons =====
var ICONS = {
  'Tornado': '\u{1F32A}\uFE0F', 'Hurricane': '\u{1F300}', 'Wildfire': '\u{1F525}',
  'Earthquake': '\u{1FAE8}', 'Riverine Flooding': '\u{1F30A}', 'Coastal Flooding': '\u{1F30A}',
  'Winter Weather': '\u2744\uFE0F', 'Ice Storm': '\u{1F9CA}', 'Cold Wave': '\u{1F976}',
  'Heat Wave': '\u{1F321}\uFE0F', 'Strong Wind': '\u{1F4A8}', 'Hail': '\u{1F328}\uFE0F',
  power_outage: '\u26A1', water_disruption: '\u{1F6B0}', supply_chain: '\u{1F6D2}',
  social_unrest: '\u{1F6A8}', medical_access: '\u{1F3E5}', mass_casualty: '\u26A0\uFE0F',
  communication: '\u{1F4F1}', economic: '\u{1F4C9}', pandemic: '\u{1F9A0}',
  cyber_attack: '\u{1F4BB}', em_grid_failure: '\u{1F50C}', nuclear: '\u2622\uFE0F',
  societal_collapse: '\u{1F30D}'
};

// ===== NOAA Storm Events heat data (2019-2024) =====
// Composite: 70% event frequency + 30% mortality, normalized 0-100
// Source: https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/
var HEAT_RISK_BY_STATE = {
  'AK':{ score:0, eventsPerYear:0 }, 'AL':{ score:7, eventsPerYear:80.3 },
  'AR':{ score:15, eventsPerYear:184.8 }, 'AZ':{ score:58, eventsPerYear:345.7 },
  'CA':{ score:27, eventsPerYear:316.5 }, 'CO':{ score:0, eventsPerYear:1.5 },
  'CT':{ score:1, eventsPerYear:9.2 }, 'DC':{ score:0, eventsPerYear:2.0 },
  'DE':{ score:0, eventsPerYear:2.0 }, 'FL':{ score:3, eventsPerYear:38.2 },
  'GA':{ score:1, eventsPerYear:16.8 }, 'HI':{ score:0, eventsPerYear:0 },
  'IA':{ score:3, eventsPerYear:38.8 }, 'ID':{ score:1, eventsPerYear:6.3 },
  'IL':{ score:10, eventsPerYear:121.0 }, 'IN':{ score:3, eventsPerYear:33.8 },
  'KS':{ score:0, eventsPerYear:4.2 }, 'KY':{ score:8, eventsPerYear:96.7 },
  'LA':{ score:25, eventsPerYear:303.2 }, 'MA':{ score:0, eventsPerYear:3.3 },
  'MD':{ score:3, eventsPerYear:33.8 }, 'ME':{ score:1, eventsPerYear:16.8 },
  'MI':{ score:0, eventsPerYear:4.8 }, 'MN':{ score:3, eventsPerYear:36.5 },
  'MO':{ score:7, eventsPerYear:90.3 }, 'MS':{ score:19, eventsPerYear:237.0 },
  'MT':{ score:0, eventsPerYear:2.2 }, 'NC':{ score:1, eventsPerYear:10.5 },
  'ND':{ score:0, eventsPerYear:1.7 }, 'NE':{ score:2, eventsPerYear:26.3 },
  'NH':{ score:0, eventsPerYear:1.2 }, 'NJ':{ score:2, eventsPerYear:19.7 },
  'NM':{ score:0, eventsPerYear:2.7 }, 'NV':{ score:7, eventsPerYear:42.2 },
  'NY':{ score:7, eventsPerYear:89.5 }, 'OH':{ score:1, eventsPerYear:12.3 },
  'OK':{ score:43, eventsPerYear:520.2 }, 'OR':{ score:5, eventsPerYear:29.0 },
  'PA':{ score:1, eventsPerYear:10.7 }, 'PR':{ score:3, eventsPerYear:30.7 },
  'RI':{ score:0, eventsPerYear:0 }, 'SC':{ score:0, eventsPerYear:1.0 },
  'SD':{ score:5, eventsPerYear:63.8 }, 'TN':{ score:14, eventsPerYear:175.7 },
  'TX':{ score:72, eventsPerYear:853.3 }, 'UT':{ score:1, eventsPerYear:5.5 },
  'VA':{ score:3, eventsPerYear:35.3 }, 'VT':{ score:1, eventsPerYear:6.8 },
  'WA':{ score:3, eventsPerYear:33.7 }, 'WI':{ score:2, eventsPerYear:28.5 },
  'WV':{ score:1, eventsPerYear:9.0 }, 'WY':{ score:1, eventsPerYear:10.0 }
};

// ===== Hazard key mapping (FEMA display name -> weight key) =====
var HAZARD_KEY_MAP = {
  'Tornado': 'tornado', 'Hurricane': 'hurricane', 'Wildfire': 'wildfire',
  'Earthquake': 'earthquake', 'Riverine Flooding': 'flood', 'Coastal Flooding': 'flood',
  'Winter Weather': 'winter', 'Ice Storm': 'winter', 'Cold Wave': 'winter',
  'Heat Wave': 'heat'
};

// ===== Population Tier =====
function getPopTier(pop) {
  if (!pop) return { name: 'Unknown', modifier: 0 };
  if (pop >= 500000) return { name: 'Metro Core', modifier: 0.15 };
  if (pop >= 100000) return { name: 'Urban', modifier: 0.10 };
  if (pop >= 25000)  return { name: 'Suburban', modifier: 0 };
  if (pop >= 5000)   return { name: 'Rural', modifier: -0.05 };
  return { name: 'Frontier', modifier: -0.10 };
}

// ===== Compute Annualized Impact Scores =====
function computeRiskProfile(data) {
  var pop = data.population || 25000;
  var sv = data.socialVulnerability != null ? data.socialVulnerability : 50;
  var cr = data.communityResilience != null ? data.communityResilience : 50;
  var tier = getPopTier(pop);
  var svMod = sv / 50; // 1.0 at median

  var categories = [];

  // --- TIER A: Data-backed (FEMA hazards + NOAA heat) ---
  var fema = data.fema || [];
  var hazardsSeen = {};

  for (var i = 0; i < fema.length; i++) {
    var h = fema[i];
    var key = HAZARD_KEY_MAP[h.name];
    if (!key || hazardsSeen[key]) continue;

    // Skip heat here — handled separately below with NOAA data
    if (key === 'heat') continue;

    hazardsSeen[key] = true;

    var eventsPerYear = 0;
    var isModelBased = false;
    if (h.events && h.yearsOfData && h.yearsOfData > 1) {
      // Real historical events (tornado, flood, hurricane, winter)
      eventsPerYear = h.events / h.yearsOfData;
    } else {
      // Model-based hazards (wildfire, earthquake) or missing data.
      // FEMA NRI uses probability models for these — yearsOfData=1 and events=0.
      // The FEMA percentile score IS valid, just not event-derived.
      // Use a steeper curve so high scores (99th %ile wildfire) produce
      // proportionally higher AIS than the old linear 0.5x multiplier.
      // score^1.5 / 100^1.5 gives: score 99 -> 0.985, score 50 -> 0.354, score 20 -> 0.089
      var s = h.score || 0;
      eventsPerYear = Math.pow(s, 1.5) / Math.pow(100, 1.5);
      isModelBased = true;
    }

    // Auto-filter: skip negligible hazards
    if ((h.score || 0) < 20 && eventsPerYear < 0.05) continue;

    var w = weights[key] || 1.0;
    var ais = eventsPerYear * w;

    var itemDetail;
    if (isModelBased) {
      itemDetail = 'FEMA probability model (score: ' + (h.score || 0) + 'th percentile). Wildfire and earthquake use modeled risk, not historical event counts.';
    } else {
      itemDetail = h.events + ' events over ' + h.yearsOfData + ' years (' + eventsPerYear.toFixed(2) + '/yr). FEMA score: ' + (h.score || 0);
    }

    categories.push({
      id: key, name: h.name, icon: ICONS[h.name] || '\u26A0\uFE0F',
      ais: ais, tier: 'data', eventsPerYear: eventsPerYear,
      score: h.score, events: h.events, yearsOfData: h.yearsOfData,
      detail: itemDetail
    });
  }

  // Heat Wave — sourced from NOAA Storm Events Database (2019-2024)
  // FEMA NRI has "Insufficient Data" for heat across all US counties,
  // so we use actual NWS excessive heat event counts by state instead.
  var stateAbbr = data.state;
  var heatData = HEAT_RISK_BY_STATE[stateAbbr];
  if (heatData && heatData.score > 0) {
    // Use the composite score (0-100, blending 70% event frequency + 30% mortality)
    // as a normalized proxy rather than raw event counts, which are inflated by
    // NWS zone-based reporting (one heat wave day = dozens of "events").
    // score/100 * 2.0 gives max ~1.4 events/yr equivalent for TX (score 72).
    // This avoids overweighting states like CA where heat varies enormously
    // between Death Valley and the Sierra foothills.
    var heatEventsPerYear = heatData.score / 100 * 2.0;
    var heatAIS = heatEventsPerYear * weights.heat;
    categories.push({
      id: 'heat', name: 'Extreme Heat', icon: ICONS['Heat Wave'],
      ais: heatAIS, tier: 'data', eventsPerYear: heatEventsPerYear,
      score: heatData.score,
      detail: 'NOAA composite score: ' + heatData.score + '/100 (' + stateAbbr + ', 2019\u20132024). ' + Math.round(heatData.eventsPerYear) + ' NWS heat events/yr statewide. Heat is the #1 weather-related killer in the US.'
    });
  }

  // Power outage
  var o = data.outage || {};
  var outageRate = o.annual_rate || 0;
  if (outageRate > 0) {
    categories.push({
      id: 'power_outage', name: 'Power Outage', icon: ICONS.power_outage,
      ais: outageRate * weights.power_outage, tier: 'data',
      eventsPerYear: outageRate,
      detail: (o.events || 0) + ' grid events in ' + (o.years || 10) + ' years. Longest recorded: ' + formatDuration(o.longest_hrs || 0) + '. Note: DOE data often understates duration \u2014 wildfire and PSPS outages can last days to weeks but appear as shorter segments in utility reports.'
    });
  }

  // --- TIER B: Derived ---
  var powerAIS = outageRate * weights.power_outage;

  // Water disruption
  var waterBase = powerAIS * 0.3;
  var waterAIS = waterBase * svMod;
  if (waterAIS > 0.01) {
    categories.push({
      id: 'water_disruption', name: 'Water Disruption', icon: ICONS.water_disruption,
      ais: waterAIS * weights.water_disruption, tier: 'derived',
      detail: 'Correlated with power outage frequency \u00d7 social vulnerability'
    });
  }

  // Supply chain
  var supplyBase = 0.3 + (tier.modifier < 0 ? 0.2 : 0);
  var supplyAIS = supplyBase * (1 + Math.abs(tier.modifier));
  categories.push({
    id: 'supply_chain', name: 'Supply Chain Disruption', icon: ICONS.supply_chain,
    ais: supplyAIS * weights.supply_chain, tier: 'derived',
    detail: tier.name + ' area. ' + (tier.modifier < 0 ? 'Fewer stores, longer resupply lines' : 'More supply points, but higher demand')
  });

  // Social unrest
  var unrestBase = 0.1;
  var unrestAIS = (unrestBase + (tier.modifier > 0 ? tier.modifier : 0)) * svMod;
  categories.push({
    id: 'social_unrest', name: 'Social Unrest / Civil Disorder', icon: ICONS.social_unrest,
    ais: unrestAIS * weights.social_unrest, tier: 'derived',
    detail: 'Population: ' + tier.name + '. Social vulnerability: ' + sv.toFixed(0) + 'th percentile'
  });

  // Medical access
  var medBase = 0.2;
  var medAIS = medBase * (tier.modifier < 0 ? 1.5 : 1.0) * svMod;
  categories.push({
    id: 'medical_access', name: 'Medical Access Failure', icon: ICONS.medical_access,
    ais: medAIS * weights.medical_access, tier: 'derived',
    detail: (tier.modifier < 0 ? 'Rural/frontier areas have fewer hospitals and longer EMS response' : 'Urban areas have capacity but surge risk during events')
  });

  // Mass casualty event
  var massBase = 0.08;
  var massAIS = massBase * (1 + (tier.modifier > 0 ? tier.modifier * 0.5 : 0));
  categories.push({
    id: 'mass_casualty', name: 'Mass Casualty Event', icon: ICONS.mass_casualty,
    ais: massAIS * weights.mass_casualty, tier: 'derived',
    detail: 'Industrial accidents, chemical releases, infrastructure failures. Slightly elevated in metro areas'
  });

  // Communication breakdown
  var commBase = powerAIS * 0.2;
  var commAIS = commBase * (tier.modifier < 0 ? 1.3 : 1.0);
  if (commAIS > 0.01) {
    categories.push({
      id: 'communication', name: 'Communication Breakdown', icon: ICONS.communication,
      ais: commAIS * weights.communication, tier: 'derived',
      detail: 'Cell towers depend on grid power. Rural areas have fewer towers and less redundancy'
    });
  }

  // --- TIER C: Expert-estimated ---
  var tierC = [
    { id: 'economic', name: 'Economic Disruption', baseProb: 0.12,
      detail: 'Recession, inflation, AI job displacement, bank instability, crypto volatility. ~3 severe events per 20 years historically. Trend: increasing frequency and severity' },
    { id: 'pandemic', name: 'Pandemic / Major Outbreak', baseProb: 0.07,
      detail: 'Significant outbreak ~1 per 10\u201320 years (WHO). Impact amplified by density and hospital capacity. Source: WHO historical frequency data' },
    { id: 'cyber_attack', name: 'Cyberattack on Infrastructure', baseProb: 0.04,
      detail: 'Increasing attempts on utilities, pipelines, financial systems. Source: DHS/CISA annual threat assessments' },
    { id: 'em_grid_failure', name: 'Electromagnetic Grid Failure', baseProb: 0.015,
      detail: 'Solar storm (Carrington-class): ~1\u20132% per decade (NASA). EMP weapon: <0.1%, tied to nuclear conflict probability. Same prep for both scenarios' },
    { id: 'nuclear', name: 'Nuclear Conflict', baseProb: 0.003,
      detail: 'Bulletin of Atomic Scientists Doomsday Clock: 90 seconds to midnight. No historical precedent for use against civilian infrastructure' },
    { id: 'societal_collapse', name: 'Societal Collapse', baseProb: 0.001,
      detail: 'No modern precedent in developed nations. Requires simultaneous failure of governance, economy, supply chain, and social order' }
  ];

  for (var j = 0; j < tierC.length; j++) {
    var c = tierC[j];
    var prob = c.baseProb;
    // Pandemic gets localized modifier
    if (c.id === 'pandemic') {
      prob *= (1 + (tier.modifier > 0 ? tier.modifier : 0)) * (svMod * 0.5 + 0.5);
    }
    categories.push({
      id: c.id, name: c.name, icon: ICONS[c.id],
      ais: prob * weights[c.id], tier: 'estimated',
      detail: c.detail
    });
  }

  // --- Normalize ---
  var totalAIS = 0;
  for (var k = 0; k < categories.length; k++) totalAIS += categories[k].ais;
  for (var k = 0; k < categories.length; k++) {
    categories[k].share = totalAIS > 0 ? (categories[k].ais / totalAIS * 100) : 0;
  }
  categories.sort(function(a, b) { return b.ais - a.ais; });

  return {
    categories: categories, totalAIS: totalAIS,
    popTier: tier, population: pop,
    socialVulnerability: sv, communityResilience: cr
  };
}

// ===== Main Lookup =====
var currentZip = '';
var currentData = null;

async function checkRisk() {
  var zip = zipInput.value.trim();
  if (!/^\d{5}$/.test(zip)) { showError('Please enter a valid 5-digit ZIP code.'); return; }
  currentZip = zip;
  showScreen('screen-loading');

  try {
    await loadData();
    var fips = zipToFips[zip];
    if (!fips) { showError("We don't have data for this ZIP code yet. Try a nearby ZIP."); return; }
    var data = countyData[fips];
    if (!data) { showError('No risk data available for this county.'); return; }
    currentData = data;

    gtag('event', 'risk_profile_lookup', {
      event_category: 'engagement',
      event_label: data.state
    });

    window.history.replaceState(null, '', window.location.pathname + '?zip=' + zip);
    renderProfile(data);
    showScreen('screen-results');
  } catch (e) {
    showError('Unable to load risk data. Please check your connection and try again.');
  }
}

// ===== Render =====
function renderProfile(data) {
  var profile = computeRiskProfile(data);
  var cats = profile.categories;

  // Header
  document.getElementById('countyName').textContent = data.county + ', ' + data.state;
  document.getElementById('countySubtitle').textContent =
    profile.popTier.name + ' \u00b7 Pop. ' + (profile.population || 0).toLocaleString();

  // Rating badge
  var topShare = cats.length > 0 ? cats[0].share : 0;
  var ratingTier, ratingLabel;
  if (topShare > 25) { ratingTier = 'HIGH'; ratingLabel = 'Concentrated Risk'; }
  else if (topShare > 15) { ratingTier = 'MODERATE'; ratingLabel = 'Moderate Risk'; }
  else { ratingTier = 'LOW'; ratingLabel = 'Distributed Risk'; }

  document.getElementById('ratingBadge').innerHTML =
    '<span class="rating-badge rating-' + ratingTier + '">' + ratingLabel + '</span>';

  // Split sections
  var topThreats = [], otherRisks = [], lowProb = [];
  for (var i = 0; i < cats.length; i++) {
    var c = cats[i];
    if (topThreats.length < 5 && c.tier !== 'estimated') {
      topThreats.push(c);
    } else if (c.tier === 'estimated') {
      lowProb.push(c);
    } else {
      otherRisks.push(c);
    }
  }

  var maxShare = cats.length > 0 ? cats[0].share : 1;
  renderTopThreats(topThreats, maxShare);
  renderCollapsible('otherRisksSection', 'Other Local Risks', otherRisks, maxShare);
  renderCollapsible('lowProbSection', 'Low Probability Scenarios', lowProb, maxShare);
  renderCommunity(profile);
  renderCustomize();
}

function renderTopThreats(items, maxShare) {
  var el = document.getElementById('topThreatsSection');
  el.innerHTML = '<h3 style="font-size:1rem;font-weight:700;margin-bottom:16px;color:var(--gray-900);">Your Top Threats</h3>' +
    renderItems(items, maxShare);
}

function renderCollapsible(elId, title, items, maxShare) {
  var el = document.getElementById(elId);
  if (!items.length) { el.innerHTML = ''; return; }
  el.innerHTML =
    '<button class="section-toggle" onclick="toggleSection(this)">' +
      title + '<span class="section-count">(' + items.length + ')</span>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
    '</button>' +
    '<div class="section-content">' + renderItems(items, maxShare) + '</div>';
}

function renderItems(items, maxShare) {
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var c = items[i];
    var barPct = maxShare > 0 ? Math.max(2, (c.share / maxShare) * 100) : 2;
    var barClass = c.tier === 'data' ? 'bar-data' : (c.tier === 'derived' ? 'bar-derived' : 'bar-estimated');
    var confClass = c.tier === 'data' ? 'confidence-data' : (c.tier === 'derived' ? 'confidence-derived' : 'confidence-estimated');
    var confLabel = c.tier === 'data' ? 'Data' : (c.tier === 'derived' ? 'Derived' : 'Estimate');
    var shareStr = c.share < 0.1 ? '<0.1%' : c.share.toFixed(1) + '%';
    var detailHtml = c.detail
      ? '<div style="font-size:0.72rem;color:var(--gray-400);margin-top:2px;line-height:1.4;">' + c.detail + '</div>'
      : '';

    html += '<div class="risk-item">' +
      '<div class="risk-icon">' + c.icon + '</div>' +
      '<div class="risk-info">' +
        '<div class="risk-name">' + c.name + ' <span class="confidence-tag ' + confClass + '">' + confLabel + '</span></div>' +
        '<div class="risk-bar-bg"><div class="risk-bar-fill ' + barClass + '" style="width:' + barPct + '%;"></div></div>' +
        detailHtml +
      '</div>' +
      '<div class="risk-score">' + shareStr + '</div>' +
    '</div>';
  }
  return html;
}

function renderCommunity(profile) {
  var el = document.getElementById('communitySection');
  var sv = profile.socialVulnerability;
  var cr = profile.communityResilience;
  var svColor = sv > 66 ? 'var(--red)' : (sv > 33 ? 'var(--amber)' : 'var(--green)');
  var crColor = cr > 66 ? 'var(--green)' : (cr > 33 ? 'var(--amber)' : 'var(--red)');
  var svLabel = sv > 66 ? 'Higher vulnerability' : (sv > 33 ? 'Average vulnerability' : 'Lower vulnerability');
  var crLabel = cr > 66 ? 'Strong resilience' : (cr > 33 ? 'Average resilience' : 'Lower resilience');

  el.innerHTML =
    '<button class="section-toggle open" onclick="toggleSection(this)">' +
      'Community Profile' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
    '</button>' +
    '<div class="section-content open">' +
      '<div class="community-grid">' +
        '<div class="community-card">' +
          '<div class="community-label">Population</div>' +
          '<div class="community-value">' + (profile.population || 0).toLocaleString() + '</div>' +
          '<div class="community-sublabel">' + profile.popTier.name + '</div>' +
        '</div>' +
        '<div class="community-card">' +
          '<div class="community-label">Social Vulnerability</div>' +
          '<div class="community-value" style="color:' + svColor + '">' + sv.toFixed(0) + '<small style="font-size:0.7rem;color:var(--gray-400);">th %ile</small></div>' +
          '<div class="community-sublabel">' + svLabel + '</div>' +
          '<div class="community-bar"><div class="community-bar-fill" style="width:' + sv + '%;background:' + svColor + ';"></div></div>' +
        '</div>' +
        '<div class="community-card">' +
          '<div class="community-label">Community Resilience</div>' +
          '<div class="community-value" style="color:' + crColor + '">' + cr.toFixed(0) + '<small style="font-size:0.7rem;color:var(--gray-400);">th %ile</small></div>' +
          '<div class="community-sublabel">' + crLabel + '</div>' +
          '<div class="community-bar"><div class="community-bar-fill" style="width:' + cr + '%;background:' + crColor + ';"></div></div>' +
        '</div>' +
        '<div class="community-card">' +
          '<div class="community-label">Density Tier</div>' +
          '<div class="community-value" style="font-size:1rem;">' + profile.popTier.name + '</div>' +
          '<div class="community-sublabel">Affects derived risk modifiers</div>' +
        '</div>' +
      '</div>' +
      '<p style="font-size:0.75rem;color:var(--gray-400);margin-top:12px;line-height:1.5;">Social vulnerability and community resilience from FEMA National Risk Index. Higher vulnerability and lower resilience amplify the impact of any event. Scores reflect socioeconomic factors, housing, demographics, and institutional capacity.</p>' +
    '</div>';
}

function renderCustomize() {
  var el = document.getElementById('customizeContent');
  var sliders = [
    { id: 'tornado', label: 'Tornado' }, { id: 'hurricane', label: 'Hurricane' },
    { id: 'wildfire', label: 'Wildfire' }, { id: 'earthquake', label: 'Earthquake' },
    { id: 'flood', label: 'Flooding' }, { id: 'winter', label: 'Winter Storm' },
    { id: 'heat', label: 'Extreme Heat' }, { id: 'power_outage', label: 'Power Outage' },
    { id: 'water_disruption', label: 'Water Disruption' },
    { id: 'supply_chain', label: 'Supply Chain' },
    { id: 'medical_access', label: 'Medical Access' },
    { id: 'economic', label: 'Economic Disruption' },
    { id: 'pandemic', label: 'Pandemic' }
  ];

  var html = '<p style="font-size:0.85rem;color:var(--gray-500);margin-bottom:16px;line-height:1.5;">' +
    'Adjust impact weights to reflect your family\'s situation. For example, if a household member relies on powered medical equipment, increase the Power Outage weight.</p>';

  for (var i = 0; i < sliders.length; i++) {
    var s = sliders[i];
    var val = weights[s.id] || 1.0;
    html += '<div class="slider-item">' +
      '<div class="slider-header">' +
        '<span class="slider-label">' + s.label + '</span>' +
        '<span class="slider-value" id="sv-' + s.id + '">' + val.toFixed(1) + 'x</span>' +
      '</div>' +
      '<input type="range" class="slider-input" min="0" max="5" step="0.5" value="' + val + '" ' +
        'data-key="' + s.id + '" oninput="updateWeight(this)">' +
    '</div>';
  }
  html += '<button class="btn-reset-weights" onclick="resetWeights()">Reset to Defaults</button>';
  el.innerHTML = html;
}

function updateWeight(el) {
  var key = el.getAttribute('data-key');
  weights[key] = parseFloat(el.value);
  document.getElementById('sv-' + key).textContent = weights[key].toFixed(1) + 'x';
  if (currentData) renderProfile(currentData);
}

function resetWeights() {
  weights = Object.assign({}, DEFAULT_WEIGHTS);
  if (currentData) renderProfile(currentData);
}

// ===== Section Toggle =====
function toggleSection(btn) {
  btn.classList.toggle('open');
  btn.nextElementSibling.classList.toggle('open');
}

// ===== Share =====
function copyShareLink() {
  var url = window.location.origin + '/risk/?zip=' + currentZip;
  navigator.clipboard.writeText(url).then(function() {
    var btn = document.getElementById('btnCopyLink');
    btn.classList.add('copied');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
    setTimeout(function() {
      btn.classList.remove('copied');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Copy Link';
    }, 2000);
  });
}

// ===== Utilities =====
function formatDuration(hours) {
  if (hours < 1) return '< 1 hr';
  if (hours < 24) return Math.round(hours) + ' hrs';
  var days = Math.floor(hours / 24);
  var rem = Math.round(hours % 24);
  return days + 'd' + (rem > 0 ? ' ' + rem + 'h' : '');
}

function showError(msg) {
  document.getElementById('errorMessage').textContent = msg;
  showScreen('screen-error');
}

function tryAnother() {
  zipInput.value = '';
  window.history.replaceState(null, '', window.location.pathname);
  showScreen('screen-intro');
  setTimeout(function() { zipInput.focus(); }, 100);
}
