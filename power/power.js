/* NomadCore Power Calculator UI. Math lives in power-engine.js (mirrors the app). */

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

(function () {
  'use strict';
  var E = window.PowerEngine;
  var AMAZON_TAG = 'nomadcore-20';
  // Same examples (and ASINs) as the app's ProductLinksService "Power" category.
  var STATIONS = [
    { name: 'EcoFlow RIVER 2 Max', asin: 'B0BVLPGS79', capacityWh: 512, outputWatts: 500, price: '$449' },
    { name: 'EcoFlow DELTA 2', asin: 'B0D14FMFZD', capacityWh: 1024, outputWatts: 1800, price: '$999' },
  ];
  var CATEGORIES = [
    ['essential', 'Essentials'],
    ['medical', 'Medical'],
    ['electronics', 'Phones & electronics'],
    ['comfort', 'Heating & cooling'],
    ['kitchen', 'Kitchen'],
  ];

  var state = {
    qty: {},
    edits: {},
    days: 3,
    fuel: 'gasoline',
    hours: 12,
    sun: 'typical',
    openSizes: {},
  };
  for (var k in E.DEFAULT_SELECTION) state.qty[k] = E.DEFAULT_SELECTION[k];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function kwh(wh) { return (wh / 1000).toFixed(wh < 10000 ? 1 : 0) + ' kWh'; }
  function amazonSearch(q) {
    return 'https://www.amazon.com/s?k=' + encodeURIComponent(q) + '&tag=' + AMAZON_TAG;
  }
  function amazonItem(asin) { return 'https://www.amazon.com/dp/' + asin + '?tag=' + AMAZON_TAG; }

  function currentItems() {
    return E.APPLIANCES.filter(function (a) { return (state.qty[a.id] || 0) > 0; }).map(function (a) {
      var item = E.itemFromAppliance(a, state.qty[a.id]);
      var e = state.edits[a.id] || {};
      ['runningWatts', 'startingWatts', 'hoursPerDay'].forEach(function (f) {
        if (e[f] !== undefined && e[f] !== '' && isFinite(Number(e[f]))) item[f] = Number(e[f]);
      });
      return item;
    });
  }

  function sunPreset() {
    return E.SUN_HOUR_PRESETS.filter(function (p) { return p.id === state.sun; })[0] || E.SUN_HOUR_PRESETS[1];
  }

  // ----- Appliance list (rendered once; steppers update in place) -----
  function renderAppliances() {
    var html = '';
    CATEGORIES.forEach(function (cat) {
      html += '<h3 class="cat">' + esc(cat[1]) + '</h3>';
      E.APPLIANCES.filter(function (a) { return a.category === cat[0]; }).forEach(function (a) {
        html +=
          '<div class="appliance" data-id="' + a.id + '">' +
            '<div class="appliance-main">' +
              '<button type="button" class="appliance-name" aria-expanded="false" aria-controls="edit-' + a.id + '">' +
                '<span class="name">' + esc(a.name) + '</span>' +
                '<span class="meta" id="meta-' + a.id + '"></span>' +
              '</button>' +
              '<div class="stepper">' +
                '<button type="button" class="step minus" aria-label="Remove one ' + esc(a.name) + '">&minus;</button>' +
                '<span class="qty" id="qty-' + a.id + '" aria-live="polite"></span>' +
                '<button type="button" class="step plus" aria-label="Add one ' + esc(a.name) + '">+</button>' +
              '</div>' +
            '</div>' +
            '<div class="edit" id="edit-' + a.id + '" hidden>' +
              field(a, 'runningWatts', 'Running W') +
              field(a, 'startingWatts', 'Starting W') +
              field(a, 'hoursPerDay', 'Hours/day') +
              (a.note ? '<p class="note">' + esc(a.note) + '</p>' : '') +
            '</div>' +
          '</div>';
      });
    });
    var root = document.getElementById('appliances');
    root.innerHTML = html;

    root.addEventListener('click', function (ev) {
      var row = ev.target.closest('.appliance');
      if (!row) return;
      var id = row.getAttribute('data-id');
      if (ev.target.closest('.plus')) { state.qty[id] = Math.min(20, (state.qty[id] || 0) + 1); update(); }
      else if (ev.target.closest('.minus')) { state.qty[id] = Math.max(0, (state.qty[id] || 0) - 1); update(); }
      else if (ev.target.closest('.appliance-name')) {
        var btn = row.querySelector('.appliance-name');
        var panel = row.querySelector('.edit');
        var open = panel.hasAttribute('hidden');
        if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    });
    root.addEventListener('input', function (ev) {
      var input = ev.target;
      if (!input.matches('input[data-field]')) return;
      var id = input.closest('.appliance').getAttribute('data-id');
      state.edits[id] = state.edits[id] || {};
      state.edits[id][input.getAttribute('data-field')] = input.value;
      update();
    });
  }

  function field(a, key, label) {
    var inputId = 'f-' + a.id + '-' + key;
    return '<label class="field" for="' + inputId + '"><span>' + esc(label) + '</span>' +
      '<input id="' + inputId + '" type="number" inputmode="decimal" min="0" step="any" data-field="' + key + '" value="' + a[key] + '"></label>';
  }

  // ----- Option chips -----
  function chips(containerId, options, key) {
    var el = document.getElementById(containerId);
    el.innerHTML = options.map(function (o) {
      return '<button type="button" role="radio" class="chip" data-value="' + esc(o.value) + '">' + esc(o.label) + '</button>';
    }).join('');
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('.chip');
      if (!b) return;
      var v = b.getAttribute('data-value');
      state[key] = typeof state[key] === 'number' ? Number(v) : v;
      update();
    });
  }
  function syncChips(containerId, value) {
    Array.prototype.forEach.call(document.querySelectorAll('#' + containerId + ' .chip'), function (b) {
      var on = b.getAttribute('data-value') === String(value);
      b.classList.toggle('selected', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  // ----- Results -----
  function update() {
    var items = currentItems();
    var preset = sunPreset();
    var r = E.calculatePower({
      items: items, days: state.days, fuel: state.fuel,
      generatorHoursPerDay: state.hours, sunHours: preset.hours,
    });

    E.APPLIANCES.forEach(function (a) {
      var item = items.filter(function (i) { return i.id === a.id; })[0] || E.itemFromAppliance(a, 0);
      var e = state.edits[a.id] || {};
      var w = e.runningWatts !== undefined && e.runningWatts !== '' ? Number(e.runningWatts) : item.runningWatts;
      var h = e.hoursPerDay !== undefined && e.hoursPerDay !== '' ? Number(e.hoursPerDay) : item.hoursPerDay;
      document.getElementById('meta-' + a.id).textContent = fmt(w) + ' W · ' + h + ' h/day · edit';
      document.getElementById('qty-' + a.id).textContent = state.qty[a.id] || 0;
      document.querySelector('.appliance[data-id="' + a.id + '"]').classList.toggle('on', (state.qty[a.id] || 0) > 0);
    });
    syncChips('days', state.days);
    syncChips('fuel', state.fuel);
    syncChips('hours', state.hours);
    syncChips('sun', state.sun);

    var summary = document.getElementById('summary');
    summary.innerHTML = r.empty
      ? '<p>Add something below to see what it takes to power it.</p>'
      : stat(fmt(r.totalRunningWatts) + ' W', 'running') +
        stat(fmt(r.peakStartingWatts) + ' W', 'peak start') +
        stat(kwh(r.dailyWh), 'per day');

    var out = document.getElementById('results');
    if (r.empty) { out.innerHTML = ''; return; }
    var g = r.generator, s = r.solar, d = state.days, dd = d === 1 ? 'day' : 'days';

    var gasHtml =
      '<section class="power-card"><h2>Fuel generator</h2>' +
      '<p class="big">' + fmt(g.runningWatts) + ' W running · ' + fmt(g.startingWatts) + ' W starting</p>' +
      '<p>' + (g.inverterRecommended
        ? 'An inverter generator this size is quieter, sips fuel, and is safe for electronics and medical devices.'
        : 'A conventional portable generator. Plug electronics into a surge protector.') + '</p>' +
      '<div class="stats">' +
        stat(g.gallonsPerDay + ' gal', state.fuel + ' / day') +
        stat(g.totalGallons + ' gal', 'for ' + d + ' ' + dd) +
        stat(String(g.containers), g.containerLabel) +
      '</div>' +
      '<p>' + (state.fuel === 'propane'
        ? 'Swap the 20-lb tank about every ' + g.hoursPerTank + ' hours of running (' + g.totalRefills + ' swaps over ' + d + ' ' + dd + ').'
        : 'Refill the ~' + g.tankGallons + '-gallon tank about every ' + g.hoursPerTank + ' hours of running (' + g.totalRefills + ' refills over ' + d + ' ' + dd + ').') + '</p>' +
      '<p><a class="shop" target="_blank" rel="noopener noreferrer sponsored" href="' +
        esc(amazonSearch(g.runningWatts + ' watt ' + (g.inverterRecommended ? 'inverter ' : '') + 'generator CO shutoff' + (state.fuel === 'propane' ? ' dual fuel' : ''))) +
        '">Shop ' + fmt(g.runningWatts) + ' W generators with CO shutoff</a></p>' +
      '<div class="safety"><h3>Generator safety</h3><ul>' +
        E.GENERATOR_SAFETY.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') +
        E.FUEL_STORAGE.map(function (l) { return '<li class="muted">' + esc(l) + '</li>'; }).join('') +
      '</ul></div></section>';

    var fits = STATIONS.filter(function (p) {
      return p.outputWatts >= s.outputWatts && p.capacityWh >= s.batteryWhWithSolar;
    });
    var shop = fits.length
      ? fits.map(function (p) {
          return '<p><a class="shop" target="_blank" rel="noopener noreferrer sponsored" href="' + esc(amazonItem(p.asin)) + '">Fits: ' + esc(p.name) + ' (' + esc(p.price) + ')</a></p>';
        }).join('')
      : s.beyondPortable ? '' :
        '<p><a class="shop" target="_blank" rel="noopener noreferrer sponsored" href="' +
          esc(amazonSearch(s.batteryWhWithSolar + 'Wh ' + s.outputWatts + 'W portable power station')) +
          '">Shop ' + fmt(s.batteryWhWithSolar) + ' Wh+ power stations</a></p>';

    var solarHtml =
      '<section class="power-card"><h2>Solar generator</h2>' +
      '<p class="big">' + fmt(s.batteryWhWithSolar) + ' Wh battery · ' + fmt(s.outputWatts) + ' W output</p>' +
      '<div class="stats">' +
        stat(fmt(s.panelWatts) + ' W', 'solar panels') +
        stat(fmt(s.surgeWatts) + ' W', 'surge needed') +
        stat(kwh(s.batteryWhNoRecharge), 'no sun, ' + d + ' d') +
      '</div>' +
      '<p>The battery covers one day, and the panels refill it on a ' + esc(preset.label.toLowerCase()) + ' day. ' +
      'Storms are cloudy: with no sun at all you would need ' + kwh(s.batteryWhNoRecharge) + ' for ' + d + ' ' + dd + '. ' +
      "Check that the unit's surge rating covers " + fmt(s.surgeWatts) + ' W.</p>' + shop +
      sizeTableHtml(items, preset) + '</section>';

    var warnHtml = r.warnings.length
      ? '<section class="power-card warn"><ul>' + r.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></section>'
      : '';

    out.innerHTML = gasHtml + solarHtml + warnHtml;
  }

  // ----- What each size can run -----
  function fitText(fit, cycles) {
    if (fit.canRun) return E.formatRuntime(fit, cycles);
    return fit.reason === 'output'
      ? 'Too big: needs ' + fmt(fit.neededWatts) + ' W output'
      : "Can't start it: needs " + fmt(fit.neededWatts) + ' W surge';
  }

  function sizeTableHtml(items, preset) {
    var rows = E.solarSizeTable({
      items: items, days: state.days, fuel: state.fuel,
      generatorHoursPerDay: state.hours, sunHours: preset.hours,
    });
    var bestIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      var y = rows[i].yourList;
      if (y && y.canRun && y.days >= 1) { bestIdx = i; break; }
    }
    var html = '<h3 class="size-title">What each size can run</h3>' +
      '<p class="hint">One full charge, no sun, at typical daily use. Output and surge are typical for each size; check the spec sheet of a real unit.</p>';
    rows.forEach(function (row, i) {
      var y = row.yourList;
      var yourText = y ? fitText(y) : 'Add something above';
      var cls = 'size-row' + (i === bestIdx ? ' best' : '') + (y && !y.canRun ? ' no' : '');
      html += '<details class="' + cls + '" data-tier="' + row.tier.id + '"' + (state.openSizes[row.tier.id] ? ' open' : '') + '>' +
        '<summary>' +
          '<span class="size-head"><strong>' + esc(row.tier.label) + '</strong> \u00b7 ' +
            fmt(row.tier.capacityWh) + ' Wh \u00b7 ' + fmt(row.tier.outputWatts) + ' W</span>' +
          '<span class="size-your">Your list: ' + esc(yourText) + '</span>' +
          (i === bestIdx ? '<span class="size-badge">Smallest that covers a day</span>' : '') +
        '</summary>' +
        '<ul class="size-list">' +
          row.appliances.map(function (a) {
            return '<li class="' + (a.fit.canRun ? '' : 'no') + '"><span>' + esc(a.name) + '</span><span>' + esc(fitText(a.fit, a.cycles)) + '</span></li>';
          }).join('') +
        '</ul>' +
        '<p class="size-refill">Refill a full charge in one ' + esc(preset.label.toLowerCase()) + ' day with about ' +
          fmt(row.panelWattsToRefill) + ' W of solar panels.</p>' +
      '</details>';
    });
    return html;
  }

  function stat(value, label) {
    return '<div class="stat"><span class="v">' + esc(value) + '</span><span class="l">' + esc(label) + '</span></div>';
  }

  renderAppliances();
  // 'toggle' does not bubble: listen in the capture phase so rebuilt rows keep their open state.
  document.getElementById('results').addEventListener('toggle', function (ev) {
    var d = ev.target;
    if (d && d.matches && d.matches('details[data-tier]')) state.openSizes[d.getAttribute('data-tier')] = d.open;
  }, true);
  chips('days', [1, 3, 7, 14].map(function (d) { return { value: d, label: d + (d === 1 ? ' day' : ' days') }; }), 'days');
  chips('fuel', [{ value: 'gasoline', label: 'Gasoline' }, { value: 'propane', label: 'Propane' }], 'fuel');
  chips('hours', [8, 12, 24].map(function (h) { return { value: h, label: h + ' h' }; }), 'hours');
  chips('sun', E.SUN_HOUR_PRESETS.map(function (p) { return { value: p.id, label: p.label }; }), 'sun');
  document.getElementById('disclaimer').textContent = E.ESTIMATE_DISCLAIMER +
    ' Some links are affiliate links: as an Amazon Associate, NomadCore earns from qualifying purchases at no extra cost to you.';
  update();
})();
