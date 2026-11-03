/**
 * NomadCore Power Calculator engine (website copy).
 *
 * MIRROR of NomadCore/src/services/power/powerEngine.ts. The app and this page must
 * give the same answer for the same inputs:
 * NomadCore/src/services/power/__tests__/powerEngine.parity.test.ts loads this file
 * and fails if the two drift. Change one, change the other.
 *
 * Pure math, runs entirely in the browser. Nothing entered is sent anywhere.
 * See the TS file for the model notes and sources.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PowerEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GENERATOR_HEADROOM = 1.25;
  var INVERTER_HEADROOM = 1.2;
  var BATTERY_USABLE = 0.85;
  var SOLAR_DERATE = 0.75;
  var FUEL_A = 0.04;
  var FUEL_B = 0.14;
  var PROPANE_FACTOR = 1.4;
  var PROPANE_TANK_GAL = 4.7;
  var GAS_CAN_GAL = 5;
  var GENERATOR_SIZES = [1000, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 7500, 9000, 10000, 12000];
  var PORTABLE_GENERATOR_MAX = 12000;
  var PORTABLE_STATION_MAX_OUTPUT = 3600;
  var PORTABLE_STATION_MAX_WH = 6000;

  var SUN_HOUR_PRESETS = [
    { id: 'cloudy', label: 'Cloudy or winter', hours: 2 },
    { id: 'typical', label: 'Typical', hours: 4 },
    { id: 'sunny', label: 'Sunny summer', hours: 5.5 },
  ];

  var APPLIANCES = [
    { id: 'refrigerator', name: 'Refrigerator', category: 'essential', runningWatts: 200, startingWatts: 1200, hoursPerDay: 8, note: 'Hours = compressor time. It cycles about a third of the day.', cycles: true },
    { id: 'chest-freezer', name: 'Chest freezer', category: 'essential', runningWatts: 100, startingWatts: 800, hoursPerDay: 8, cycles: true },
    { id: 'mini-fridge-meds', name: 'Mini fridge (medicine)', category: 'medical', runningWatts: 80, startingWatts: 400, hoursPerDay: 8, cycles: true },
    { id: 'cpap', name: 'CPAP machine', category: 'medical', runningWatts: 60, startingWatts: 60, hoursPerDay: 8, note: 'Heated humidifier off uses far less. Ask your supplier about a DC cord.' },
    { id: 'oxygen-concentrator', name: 'Oxygen concentrator', category: 'medical', runningWatts: 350, startingWatts: 700, hoursPerDay: 24, note: 'Keep backup oxygen too. Tell your utility you depend on power.', continuous: true },
    { id: 'sump-pump', name: 'Sump pump (1/2 HP)', category: 'essential', runningWatts: 1050, startingWatts: 2150, hoursPerDay: 2, cycles: true },
    { id: 'well-pump', name: 'Well pump (1/2 HP)', category: 'essential', runningWatts: 1000, startingWatts: 2100, hoursPerDay: 2, note: 'Most well pumps are 240 V and need a transfer switch wired by an electrician.', requires240V: true, cycles: true },
    { id: 'furnace-fan', name: 'Gas furnace blower', category: 'essential', runningWatts: 875, startingWatts: 2350, hoursPerDay: 8, note: 'Needs a transfer switch or inlet. Never backfeed through an outlet.', cycles: true },
    { id: 'lights', name: 'LED lights (per room)', category: 'essential', runningWatts: 10, startingWatts: 10, hoursPerDay: 5 },
    { id: 'phone', name: 'Phone charging', category: 'electronics', runningWatts: 10, startingWatts: 10, hoursPerDay: 3 },
    { id: 'router', name: 'Wi-Fi router + modem', category: 'electronics', runningWatts: 20, startingWatts: 20, hoursPerDay: 24 },
    { id: 'laptop', name: 'Laptop', category: 'electronics', runningWatts: 60, startingWatts: 60, hoursPerDay: 4 },
    { id: 'tv', name: 'TV (LED, 50 in)', category: 'electronics', runningWatts: 100, startingWatts: 100, hoursPerDay: 4 },
    { id: 'fan', name: 'Box or ceiling fan', category: 'comfort', runningWatts: 75, startingWatts: 120, hoursPerDay: 8 },
    { id: 'window-ac', name: 'Window AC (10,000 BTU)', category: 'comfort', runningWatts: 1200, startingWatts: 1800, hoursPerDay: 8 },
    { id: 'space-heater', name: 'Electric space heater', category: 'comfort', runningWatts: 1500, startingWatts: 1500, hoursPerDay: 6, note: 'Uses more power than almost anything else here.' },
    { id: 'microwave', name: 'Microwave (1,000 W)', category: 'kitchen', runningWatts: 1500, startingWatts: 1500, hoursPerDay: 0.3, note: 'A "1,000 W" microwave draws about 1,500 W from the outlet.' },
    { id: 'coffee-maker', name: 'Coffee maker', category: 'kitchen', runningWatts: 900, startingWatts: 900, hoursPerDay: 0.25 },
    { id: 'kettle', name: 'Electric kettle', category: 'kitchen', runningWatts: 1500, startingWatts: 1500, hoursPerDay: 0.2 },
  ];

  var DEFAULT_SELECTION = { refrigerator: 1, lights: 3, phone: 2, router: 1 };

  var GENERATOR_SAFETY = [
    'Outside only, 20 feet or more from the house, exhaust pointed away from doors and windows. Never in a garage, even with the door open.',
    'Carbon monoxide has no smell. Put a battery CO alarm inside. Headache, dizziness or nausea means get out now.',
    'Never plug a generator into a wall outlet (backfeeding). It can kill a lineworker. Use extension cords or a transfer switch.',
    'Turn it off and let it cool before refueling.',
  ];

  var FUEL_STORAGE = [
    'Store fuel in approved containers, outside the house, away from the generator.',
    'Gasoline goes stale in a few months. Add fuel stabilizer and rotate it into your car.',
    'Many local fire codes cap how much gasoline you can keep at home. Check yours.',
  ];

  var ESTIMATE_DISCLAIMER =
    'Estimate only. Appliance watts vary; check the label on yours and edit the numbers. Sizes and fuel are rounded up on purpose.';

  function roundUp(value, step) {
    return Math.ceil(value / step - 1e-9) * step;
  }
  function round1(value) {
    return Math.round(value * 10) / 10;
  }
  function clampNumber(value, min, max) {
    if (typeof value !== 'number' || !isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  function itemFromAppliance(appliance, quantity) {
    return {
      id: appliance.id,
      name: appliance.name,
      quantity: quantity === undefined ? 1 : quantity,
      runningWatts: appliance.runningWatts,
      startingWatts: appliance.startingWatts,
      hoursPerDay: appliance.hoursPerDay,
      requires240V: appliance.requires240V,
      continuous: appliance.continuous,
    };
  }

  function sanitizeItem(item) {
    var runningWatts = clampNumber(item.runningWatts, 0, 20000);
    var out = {};
    for (var k in item) if (Object.prototype.hasOwnProperty.call(item, k)) out[k] = item[k];
    out.quantity = Math.round(clampNumber(item.quantity, 0, 50));
    out.runningWatts = runningWatts;
    out.startingWatts = Math.max(runningWatts, clampNumber(item.startingWatts, 0, 40000));
    out.hoursPerDay = clampNumber(item.hoursPerDay, 0, 24);
    return out;
  }

  function tankGallonsFor(runningWatts) {
    if (runningWatts <= 1000) return 0.6;
    if (runningWatts <= 2500) return 1;
    if (runningWatts <= 4000) return 4;
    if (runningWatts <= 7500) return 6.5;
    return 8;
  }

  function calculatePower(raw) {
    var items = raw.items.map(sanitizeItem).filter(function (i) { return i.quantity > 0; });
    var days = clampNumber(raw.days, 0.5, 30);
    var sunHours = clampNumber(raw.sunHours, 0.5, 8);

    var totalRunningWatts = 0, largestSurge = 0, dailyWh = 0, continuousHours = 0;
    items.forEach(function (i) {
      totalRunningWatts += i.runningWatts * i.quantity;
      largestSurge = Math.max(largestSurge, i.startingWatts - i.runningWatts);
      dailyWh += i.runningWatts * i.quantity * i.hoursPerDay;
      if (i.continuous) continuousHours = Math.max(continuousHours, i.hoursPerDay);
    });
    var peakStartingWatts = totalRunningWatts + largestSurge;
    var generatorHoursPerDay = Math.max(clampNumber(raw.generatorHoursPerDay, 1, 24), continuousHours);

    // ----- Gas / propane generator -----
    var neededRunning = totalRunningWatts * GENERATOR_HEADROOM;
    var genRunning = null;
    for (var s = 0; s < GENERATOR_SIZES.length; s++) {
      if (GENERATOR_SIZES[s] >= neededRunning && GENERATOR_SIZES[s] * 1.3 >= peakStartingWatts) {
        genRunning = GENERATOR_SIZES[s];
        break;
      }
    }
    if (genRunning === null) {
      genRunning = Math.max(roundUp(neededRunning, 1000), roundUp(peakStartingWatts / 1.3, 1000));
    }
    var genStarting = Math.max(peakStartingWatts, Math.round(genRunning * 1.3));
    var empty = items.length === 0;

    var avgLoadKw = Math.min(dailyWh / generatorHoursPerDay, totalRunningWatts) / 1000;
    var gasGalPerHour = FUEL_A * (genRunning / 1000) + FUEL_B * avgLoadKw;
    var gallonsPerHour = gasGalPerHour * (raw.fuel === 'propane' ? PROPANE_FACTOR : 1);
    var gallonsPerDay = empty ? 0 : gallonsPerHour * generatorHoursPerDay;
    var totalGallons = gallonsPerDay * days;
    var tankGallons = raw.fuel === 'propane' ? PROPANE_TANK_GAL : tankGallonsFor(genRunning);
    var hoursPerTank = gallonsPerHour > 0 ? tankGallons / gallonsPerHour : 0;
    var refillsPerDay = empty ? 0 : gallonsPerDay / tankGallons;
    var containerGal = raw.fuel === 'propane' ? PROPANE_TANK_GAL : GAS_CAN_GAL;

    var generator = {
      runningWatts: empty ? 0 : genRunning,
      startingWatts: empty ? 0 : genStarting,
      inverterRecommended: !empty && genRunning <= 4000,
      gallonsPerDay: round1(gallonsPerDay),
      totalGallons: round1(totalGallons),
      tankGallons: tankGallons,
      hoursPerTank: round1(hoursPerTank),
      refillsPerDay: round1(refillsPerDay),
      totalRefills: Math.ceil(refillsPerDay * days - 1e-9),
      containers: Math.ceil(totalGallons / containerGal - 1e-9),
      containerLabel: raw.fuel === 'propane' ? '20-lb propane tanks' : '5-gallon gas cans',
      beyondPortable: genRunning > PORTABLE_GENERATOR_MAX,
    };

    // ----- Solar generator / battery -----
    var outputWatts = roundUp(totalRunningWatts * INVERTER_HEADROOM, 100);
    var batteryWhWithSolar = roundUp(dailyWh / BATTERY_USABLE, 100);
    var solar = {
      outputWatts: outputWatts,
      surgeWatts: peakStartingWatts,
      batteryWhWithSolar: batteryWhWithSolar,
      batteryWhNoRecharge: roundUp((dailyWh * days) / BATTERY_USABLE, 100),
      panelWatts: roundUp(dailyWh / (sunHours * SOLAR_DERATE), 50),
      beyondPortable:
        outputWatts > PORTABLE_STATION_MAX_OUTPUT || batteryWhWithSolar > PORTABLE_STATION_MAX_WH,
    };

    // ----- Warnings -----
    var warnings = [];
    function has(id) { return items.some(function (i) { return i.id === id; }); }
    if (items.some(function (i) { return i.requires240V; })) {
      warnings.push('A 240 V load (like a well pump) needs a generator with a 240 V outlet and a transfer switch installed by a licensed electrician. Most portable power stations cannot run it.');
    }
    if (has('oxygen-concentrator') || has('cpap') || has('mini-fridge-meds')) {
      warnings.push('Medical equipment: do not rely on this estimate alone. Confirm the watts with your supplier, keep a backup (bottled oxygen, spare battery), and register with your utility as a customer who depends on power.');
    }
    if (continuousHours >= 24) {
      warnings.push('Something on your list needs power around the clock, so the generator has to run 24 hours a day. That is a lot of fuel and noise; a battery that covers the night is worth considering.');
    }
    if (has('space-heater') || has('window-ac')) {
      warnings.push('Heating and cooling are the biggest loads here. Cutting them shrinks the generator and the fuel more than anything else.');
    }
    if (generator.beyondPortable) {
      warnings.push('This is more than a portable generator can carry. Talk to a licensed electrician about a standby generator, or trim the list.');
    }
    if (solar.beyondPortable) {
      warnings.push('This is beyond a portable power station. It would take a home battery system, or a fuel generator for the big loads.');
    }

    return {
      totalRunningWatts: totalRunningWatts,
      peakStartingWatts: peakStartingWatts,
      dailyWh: Math.round(dailyWh),
      generator: generator,
      solar: solar,
      warnings: warnings,
      empty: empty,
    };
  }

  // ===== "What each size can run" (mirror of solarSizeTable in powerEngine.ts) =====

  var SOLAR_SIZE_TIERS = [
    { id: 'small', label: 'Small', capacityWh: 256, outputWatts: 300 },
    { id: 'medium', label: 'Medium', capacityWh: 512, outputWatts: 500 },
    { id: '1kwh', label: '1 kWh', capacityWh: 1024, outputWatts: 1800 },
    { id: '2kwh', label: '2 kWh', capacityWh: 2048, outputWatts: 2400 },
    { id: '3kwh', label: '3.6 kWh', capacityWh: 3600, outputWatts: 3600 },
    { id: 'expanded', label: 'Expanded (extra battery)', capacityWh: 6000, outputWatts: 3600 },
    { id: '10kwh', label: '10 kWh (home backup)', capacityWh: 10000, outputWatts: 7200 },
  ];
  var MAX_RUNTIME_DAYS = 30;
  var STATION_SURGE_FACTOR = 2;
  var SIZE_TABLE_APPLIANCES = [
    'refrigerator', 'chest-freezer', 'cpap', 'oxygen-concentrator', 'lights', 'phone', 'router',
    'laptop', 'tv', 'fan', 'sump-pump', 'window-ac', 'microwave', 'space-heater',
  ];

  function fitFor(tier, runningWatts, peakWatts, whPerDay) {
    if (runningWatts > tier.outputWatts) {
      return { canRun: false, reason: 'output', neededWatts: runningWatts };
    }
    if (peakWatts > tier.outputWatts * STATION_SURGE_FACTOR) {
      return { canRun: false, reason: 'surge', neededWatts: peakWatts };
    }
    var usable = tier.capacityWh * BATTERY_USABLE;
    var days = whPerDay > 0 ? Math.floor((usable / whPerDay) * 1000) / 1000 : 0;
    var hours = runningWatts > 0 ? Math.floor((usable / runningWatts) * 1000) / 1000 : 0;
    return { canRun: true, days: days, hours: hours };
  }

  function solarSizeTable(raw) {
    var result = calculatePower(raw);
    var sunHours = clampNumber(raw.sunHours, 0.5, 8);
    return SOLAR_SIZE_TIERS.map(function (tier) {
      var appliances = SIZE_TABLE_APPLIANCES.map(function (id) {
        var a = APPLIANCES.filter(function (x) { return x.id === id; })[0];
        return {
          id: a.id,
          name: a.name,
          cycles: !!a.cycles,
          fit: fitFor(tier, a.runningWatts, a.startingWatts, a.runningWatts * a.hoursPerDay),
        };
      });
      return {
        tier: tier,
        usableWh: Math.round(tier.capacityWh * BATTERY_USABLE),
        panelWattsToRefill: roundUp(tier.capacityWh / (sunHours * SOLAR_DERATE), 50),
        yourList: result.empty
          ? null
          : fitFor(tier, result.totalRunningWatts, result.peakStartingWatts, result.dailyWh),
        appliances: appliances,
      };
    });
  }

  function formatRuntime(fit, cycles) {
    if (cycles === undefined) cycles = true;
    if (fit.days > MAX_RUNTIME_DAYS) return MAX_RUNTIME_DAYS + '+ days';
    if (fit.days >= 1) {
      var d = Math.floor(fit.days * 10) / 10;
      return d + ' ' + (d === 1 ? 'day' : 'days');
    }
    var hours = cycles ? fit.days * 24 : fit.hours;
    var suffix = cycles ? '' : ' running';
    var h = Math.floor(hours * 10) / 10;
    if (h >= 1) return h + ' h' + suffix;
    return Math.max(0, Math.floor(hours * 60)) + ' min' + suffix;
  }


  return {
    APPLIANCES: APPLIANCES,
    DEFAULT_SELECTION: DEFAULT_SELECTION,
    SUN_HOUR_PRESETS: SUN_HOUR_PRESETS,
    GENERATOR_SAFETY: GENERATOR_SAFETY,
    FUEL_STORAGE: FUEL_STORAGE,
    ESTIMATE_DISCLAIMER: ESTIMATE_DISCLAIMER,
    itemFromAppliance: itemFromAppliance,
    calculatePower: calculatePower,
    SOLAR_SIZE_TIERS: SOLAR_SIZE_TIERS,
    SIZE_TABLE_APPLIANCES: SIZE_TABLE_APPLIANCES,
    solarSizeTable: solarSizeTable,
    formatRuntime: formatRuntime,
  };
});
