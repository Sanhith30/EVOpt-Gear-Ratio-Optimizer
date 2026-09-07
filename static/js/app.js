// ── Splash screen dismiss ───────────────────────────────────────────────
(function () {
  const splash = document.getElementById('splash');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('splash-hide');
    splash.addEventListener('animationend', () => splash.remove(), { once: true });
  }, 2800);
})();

// ── Chart.js Global Defaults & Theme Support ─────────────────────────────
function applyChartTheme(isDark) {
  Chart.defaults.color          = isDark ? '#94a3b8' : '#64748b';
  Chart.defaults.borderColor    = isDark ? '#1e293b' : '#e2e8f0';
  Chart.defaults.font.family    = "'Plus Jakarta Sans', system-ui, sans-serif";
  Chart.defaults.font.size      = 12;

  // If charts are already rendered, update them
  Object.values(charts).forEach(c => {
    if (c && c.options && c.options.scales) {
      if (c.options.scales.x) {
        c.options.scales.x.ticks.color = isDark ? '#94a3b8' : '#64748b';
        c.options.scales.x.grid.color  = isDark ? '#1e293b' : '#f1f5f9';
      }
      if (c.options.scales.y) {
        c.options.scales.y.ticks.color = isDark ? '#94a3b8' : '#64748b';
        c.options.scales.y.grid.color  = isDark ? '#1e293b' : '#f1f5f9';
      }
      c.update();
    }
  });
}

// ── Color palette ───────────────────────────────────────────────────────
const C = {
  indigo:  '#4f46e5', indigoA: 'rgba(79,70,229,0.12)',
  violet:  '#7c3aed', violetA: 'rgba(124,58,237,0.12)',
  emerald: '#059669', emeraldA:'rgba(5,150,105,0.12)',
  amber:   '#d97706', amberA:  'rgba(217,119,6,0.12)',
  rose:    '#e11d48', roseA:   'rgba(225,29,72,0.12)',
  sky:     '#0284c7', skyA:    'rgba(2,132,199,0.12)',
  slate:   '#475569', slateA:  'rgba(71,85,105,0.1)',
};

// ── Field IDs ───────────────────────────────────────────────────────────
const FIELD_IDS = [
  'mass','motor_torque','motor_power','wheel_radius','efficiency',
  'crr','cd','frontal_area','speed','grade','motor_rpm',
  'initial_ratio','min_ratio','max_ratio','tolerance','max_iterations'
];

// Sliders mapped to number inputs
const SLIDER_FIELDS = [
  'mass', 'motor_torque', 'motor_power', 'wheel_radius', 'cd', 'speed', 'grade'
];

// Real-world OEM EV Presets
const PRESETS = {
  tesla: {
    mass: 1840, motor_torque: 450, motor_power: 220, wheel_radius: 0.34,
    efficiency: 96, crr: 0.010, cd: 0.23, frontal_area: 2.22,
    speed: 70, grade: 5, motor_rpm: 4200, initial_ratio: 5.0,
    min_ratio: 3.0, max_ratio: 7.0, tolerance: 1e-6, max_iterations: 50
  },
  taycan: {
    mass: 2295, motor_torque: 650, motor_power: 350, wheel_radius: 0.36,
    efficiency: 95, crr: 0.012, cd: 0.22, frontal_area: 2.33,
    speed: 85, grade: 5, motor_rpm: 4500, initial_ratio: 4.5,
    min_ratio: 2.5, max_ratio: 7.5, tolerance: 1e-6, max_iterations: 50
  },
  nexon: {
    mass: 1400, motor_torque: 215, motor_power: 105, wheel_radius: 0.31,
    efficiency: 94, crr: 0.013, cd: 0.32, frontal_area: 2.30,
    speed: 50, grade: 5, motor_rpm: 3600, initial_ratio: 5.5,
    min_ratio: 3.0, max_ratio: 8.0, tolerance: 1e-6, max_iterations: 50
  },
  city: {
    mass: 1080, motor_torque: 160, motor_power: 60, wheel_radius: 0.28,
    efficiency: 93, crr: 0.014, cd: 0.35, frontal_area: 1.95,
    speed: 45, grade: 4, motor_rpm: 3200, initial_ratio: 6.0,
    min_ratio: 3.5, max_ratio: 8.5, tolerance: 1e-6, max_iterations: 50
  }
};

let charts = {};
let latestDriveCycleData = null;
let currentBatteryKwh = 60;

function readInputs() {
  const o = {};
  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    o[id] = el ? Number(el.value) : 0;
  });
  return o;
}

function setInputs(data) {
  Object.keys(data).forEach(k => {
    const numEl = document.getElementById(k);
    if (numEl) numEl.value = data[k];
    const sliderEl = document.getElementById(k + '-slider');
    if (sliderEl) sliderEl.value = data[k];
  });
}

// ── Chart builder using labels + plain data arrays ───────────────────────
function makeLineChart(canvasId, labels, datasets, xLabel, yLabel, extra = {}) {
  if (charts[canvasId]) { charts[canvasId].destroy(); }

  const el = document.getElementById(canvasId);
  if (!el) return;
  const ctx = el.getContext('2d');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: datasets.length > 1,
          labels: { boxWidth: 10, padding: 14, usePointStyle: true, color: isDark ? '#94a3b8' : '#475569' }
        },
        tooltip: {
          backgroundColor: isDark ? '#1e293b' : 'white',
          titleColor: isDark ? '#f8fafc' : '#0f172a',
          bodyColor: isDark ? '#cbd5e1' : '#475569',
          borderColor: isDark ? '#334155' : '#e2e8f0',
          borderWidth: 1,
          padding: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,.2)'
        }
      },
      scales: {
        x: {
          title: { display: true, text: xLabel, color: isDark ? '#94a3b8' : '#64748b', font: { weight: '600', size: 11 } },
          ticks: { maxTicksLimit: 8, color: isDark ? '#94a3b8' : '#64748b' },
          grid: { color: isDark ? '#1e293b' : '#f1f5f9' }
        },
        y: {
          title: { display: true, text: yLabel, color: isDark ? '#94a3b8' : '#64748b', font: { weight: '600', size: 11 } },
          ticks: { color: isDark ? '#94a3b8' : '#64748b' },
          grid: { color: isDark ? '#1e293b' : '#f1f5f9' },
          ...extra.yScale
        }
      },
      elements: { point: { radius: 0, hoverRadius: 5 } },
      ...extra.chartOpts
    }
  });
}

function lineDs(label, data, color, colorA, dashed = false) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: colorA,
    borderWidth: 2.5,
    fill: !!colorA,
    tension: 0.35,
    borderDash: dashed ? [5, 5] : []
  };
}

// ── Render 2-Speed Dual-Gear Transmission Comparison ────────────────────
function renderTwoSpeed(data) {
  if (!data) return;
  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  setTxt('ts-g1', data.g1_launch + ' : 1');
  setTxt('ts-g2', data.g2_cruise + ' : 1');
  setTxt('ts-shift-speed', data.shift_speed_kmh + ' km/h');
  setTxt('ts-single-ratio', data.single_opt + ' : 1');

  setTxt('ts-g1-accel', data.g1_accel + ' m/s²');
  setTxt('ts-g1-accel-badge', `+${data.accel_improvement_pct}% vs G*`);

  setTxt('ts-g1-grade', data.g1_gradeability + ' %');
  setTxt('ts-g1-grade-badge', `+${data.grade_improvement_pct}% vs G*`);

  setTxt('ts-g2-vmax', data.g2_vmax + ' km/h');
  setTxt('ts-g2-vmax-badge', `+${data.vmax_improvement_pct}% vs G*`);
}

// ── Render Drive Cycle & Range Estimator ────────────────────────────────
function renderDriveCycles(cycleData, kwh) {
  if (!cycleData) return;
  latestDriveCycleData = cycleData;
  currentBatteryKwh = kwh || currentBatteryKwh;

  const packData = cycleData.range_by_pack[String(currentBatteryKwh)];
  if (!packData) return;

  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  setTxt('range-wltp-km', packData.wltp_km + ' km');
  setTxt('cons-wltp', cycleData.consumption.wltp_kwh_100km + ' kWh/100 km');

  setTxt('range-city-km', packData.city_km + ' km');
  setTxt('cons-city', cycleData.consumption.city_kwh_100km + ' kWh/100 km');

  setTxt('range-hwy-km', packData.hwy_km + ' km');
  setTxt('cons-hwy', cycleData.consumption.hwy_kwh_100km + ' kWh/100 km');

  // Relative progress bars compared to 600km maximum benchmark
  const setBar = (id, km) => {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.min(100, Math.max(15, (km / 650) * 100)) + '%';
  };
  setBar('bar-wltp', packData.wltp_km);
  setBar('bar-city', packData.city_km);
  setBar('bar-hwy', packData.hwy_km);
}

// ── Main Run Optimization Dispatcher ────────────────────────────────────
async function run() {
  const btn = document.getElementById('run');
  const errDiv = document.getElementById('error');
  const runIcon = document.getElementById('run-icon');
  const runText = document.getElementById('run-text');

  btn.classList.add('loading');
  runIcon.textContent = '⏳';
  runText.textContent = 'SOLVING CONVERGENCE...';
  errDiv.className = '';
  errDiv.textContent = '';

  try {
    const payload = readInputs();
    const res = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Server error occurred during optimization');
    }

    const data = await res.json();
    document.getElementById('results').classList.remove('hidden');

    // 1. Result Hero
    document.getElementById('opt').textContent = data.optimal_ratio.toFixed(3);
    const lastErr = data.iterations.length ? data.iterations[data.iterations.length - 1].error : 0;
    document.getElementById('conv').textContent =
      `✓ CONVERGED IN ${data.iterations.length} ITERATIONS (RESIDUAL ERROR: ${lastErr.toExponential(2)})`;

    // 2. Metrics Cards
    const m = data.metrics;
    const setT = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setT('acc',      m.acceleration.toFixed(2));
    setT('speedout', m.max_speed.toFixed(1));
    setT('gradeout', m.gradeability.toFixed(1));
    setT('score',    m.performance_score.toFixed(3));
    setT('wt',       m.wheel_torque.toFixed(0));
    setT('ft',       m.tractive_force.toFixed(0));
    setT('ste',      m.specific_tractive.toFixed(3));
    setT('derating', m.derating_factor.toFixed(3));
    setT('pmotor',   m.motor_power_kw.toFixed(1));
    setT('pwheel',   m.wheel_power_kw.toFixed(1));
    setT('ploss',    m.power_loss_kw.toFixed(2));
    setT('energy',   m.energy_wh_per_km.toFixed(1));

    // 3. Force breakdown bar
    const fb = m.force_breakdown;
    const maxF = Math.max(fb.tractive, fb.rolling_resistance + fb.aerodynamic_drag + fb.grade_resistance, 1);
    const pct = v => Math.min(100, Math.max(0, (v / maxF) * 100)).toFixed(1);

    const forceBarsEl = document.getElementById('force-bars');
    if (forceBarsEl) {
      forceBarsEl.innerHTML = `
        <div class="force-bar-row">
          <span>Tractive Force F<sub>t</sub></span>
          <div class="force-bar-track"><div class="force-bar-fill" style="width:${pct(fb.tractive)}%;background:${C.emerald};"></div></div>
          <strong>${fb.tractive.toFixed(0)} N</strong>
        </div>
        <div class="force-bar-row">
          <span>Rolling Resistance F<sub>rr</sub></span>
          <div class="force-bar-track"><div class="force-bar-fill" style="width:${pct(fb.rolling_resistance)}%;background:${C.sky};"></div></div>
          <strong>${fb.rolling_resistance.toFixed(0)} N</strong>
        </div>
        <div class="force-bar-row">
          <span>Aerodynamic Drag F<sub>aero</sub></span>
          <div class="force-bar-track"><div class="force-bar-fill" style="width:${pct(fb.aerodynamic_drag)}%;background:${C.violet};"></div></div>
          <strong>${fb.aerodynamic_drag.toFixed(0)} N</strong>
        </div>
        <div class="force-bar-row">
          <span>Grade Resistance F<sub>grade</sub></span>
          <div class="force-bar-track"><div class="force-bar-fill" style="width:${pct(fb.grade_resistance)}%;background:${C.amber};"></div></div>
          <strong>${fb.grade_resistance.toFixed(0)} N</strong>
        </div>
        <div class="force-bar-row">
          <span>Net Acceleration Force</span>
          <div class="force-bar-track"><div class="force-bar-fill" style="width:${pct(fb.net_force)}%;background:${C.indigo};"></div></div>
          <strong>${fb.net_force.toFixed(0)} N</strong>
        </div>
      `;
    }

    // 4. Render 2-Speed Transmission Dual-Gear Feature
    if (data.two_speed) {
      renderTwoSpeed(data.two_speed);
    }

    // 5. Render Drive Cycle & Range Estimator Feature
    if (data.drive_cycles) {
      renderDriveCycles(data.drive_cycles, currentBatteryKwh);
    }

    // 6. Render 7 Synchronized Charts
    const c = data.curve;
    const ratios = c.gear_ratio.map(r => r.toFixed(2));

    makeLineChart('perfChart', ratios, [
      lineDs('Performance Score S(G)', c.performance, C.indigo, C.indigoA)
    ], 'Gear Ratio G', 'Score (0–1)');

    makeLineChart('accChart', ratios, [
      lineDs('Acceleration a(G)', c.acceleration, C.rose, C.roseA)
    ], 'Gear Ratio G', 'm/s²');

    makeLineChart('speedChart', ratios, [
      lineDs('Max Speed v_max(G)', c.max_speed, C.sky, C.skyA)
    ], 'Gear Ratio G', 'km/h');

    makeLineChart('gradeChart', ratios, [
      lineDs('Gradeability GR(G)', c.gradeability, C.amber, C.amberA)
    ], 'Gear Ratio G', '% grade');

    makeLineChart('tractionChart', ratios, [
      lineDs('Tractive Force F_t(G)', c.tractive_force, C.emerald, C.emeraldA)
    ], 'Gear Ratio G', 'N');

    makeLineChart('powerChart', ratios, [
      lineDs('Motor Power P_m', c.power_motor_kw, C.violet, null),
      lineDs('Wheel Power P_w', c.power_wheel_kw, C.emerald, null),
      lineDs('Power Loss P_loss', c.power_loss_kw, C.rose, C.roseA, true)
    ], 'Gear Ratio G', 'kW');

    // N-R convergence error log chart
    const cv = data.convergence;
    makeLineChart('convChart', cv.iterations.map(i => `Iter ${i}`), [
      lineDs('|G_{n+1} − G_n| Error', cv.errors, C.rose, C.roseA)
    ], 'Iteration', 'Absolute Error', {
      yScale: { type: 'logarithmic' }
    });

    // Force Balance Bar Chart
    if (charts['forceChart']) { charts['forceChart'].destroy(); }
    const fbCtx = document.getElementById('forceChart').getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    charts['forceChart'] = new Chart(fbCtx, {
      type: 'bar',
      data: {
        labels: ['Tractive Effort', 'Rolling Resist.', 'Aero Drag', 'Grade Force', 'Net Accel Force'],
        datasets: [{
          label: 'Force (N)',
          data: [fb.tractive, fb.rolling_resistance, fb.aerodynamic_drag, fb.grade_resistance, fb.net_force],
          backgroundColor: [C.emerald, C.sky, C.violet, C.amber, C.indigo],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#1e293b' : 'white',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#475569',
            borderColor: isDark ? '#334155' : '#e2e8f0',
            borderWidth: 1, padding: 10
          }
        },
        scales: {
          x: { ticks: { color: isDark ? '#94a3b8' : '#64748b' }, grid: { display: false } },
          y: {
            title: { display: true, text: 'Force (N)', color: isDark ? '#94a3b8' : '#64748b', font: { weight: '600', size: 11 } },
            ticks: { color: isDark ? '#94a3b8' : '#64748b' },
            grid: { color: isDark ? '#1e293b' : '#f1f5f9' }
          }
        }
      }
    });

    // 7. Iteration Table
    const tbody = document.querySelector('#iterations tbody');
    if (tbody) {
      tbody.innerHTML = data.iterations.map(it => `
        <tr>
          <td>${it.iteration}</td>
          <td>${it.G_n.toFixed(5)}</td>
          <td>${it.f_G.toExponential(4)}</td>
          <td>${it.f_prime_G.toFixed(4)}</td>
          <td>${it.G_next.toFixed(5)}</td>
          <td>${it.error.toExponential(4)}</td>
        </tr>
      `).join('');
    }

    // Scroll smoothly to results
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    errDiv.className = 'show';
    errDiv.textContent = '❌ Optimization failed: ' + err.message;
  } finally {
    btn.classList.remove('loading');
    runIcon.textContent = '⚡';
    runText.textContent = 'RUN NEWTON-RAPHSON OPTIMIZATION';
  }
}

// ── Debounced Run for Sliders ───────────────────────────────────────────
let sliderDebounceTimer = null;
function debouncedRun() {
  clearTimeout(sliderDebounceTimer);
  sliderDebounceTimer = setTimeout(() => {
    run();
  }, 250);
}

// ── Initialize Event Listeners ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // 1. Dark / Light Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('evopt-theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButton(savedTheme);
  applyChartTheme(savedTheme === 'dark');

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('evopt-theme', next);
      updateThemeButton(next);
      applyChartTheme(next === 'dark');
    });
  }

  function updateThemeButton(theme) {
    if (!themeToggle) return;
    const isDark = theme === 'dark';
    themeToggle.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
    themeToggle.querySelector('.theme-text').textContent = isDark ? 'Light' : 'Dark';
  }

  // 2. Real-World EV Presets Handler
  const presetButtons = document.querySelectorAll('.preset-btn');
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const presetKey = btn.getAttribute('data-preset');
      if (presetKey && PRESETS[presetKey]) {
        setInputs(PRESETS[presetKey]);
        run();
      }
    });
  });

  // 3. Bi-Directional Slider Synchronization
  SLIDER_FIELDS.forEach(field => {
    const numInput = document.getElementById(field);
    const sliderInput = document.getElementById(field + '-slider');

    if (numInput && sliderInput) {
      sliderInput.addEventListener('input', () => {
        numInput.value = sliderInput.value;
        debouncedRun();
      });
      numInput.addEventListener('input', () => {
        sliderInput.value = numInput.value;
      });
    }
  });

  // 4. Battery Pack Selector for Range Estimator
  const batteryPills = document.querySelectorAll('.batt-btn');
  batteryPills.forEach(pill => {
    pill.addEventListener('click', () => {
      batteryPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const kwh = Number(pill.getAttribute('data-kwh'));
      if (latestDriveCycleData) {
        renderDriveCycles(latestDriveCycleData, kwh);
      }
    });
  });

  // 5. PDF Engineering Report Generator
  const printReport = () => {
    const dateEl = document.getElementById('print-date');
    if (dateEl) {
      dateEl.textContent = 'Generated: ' + new Date().toLocaleString();
    }
    // Make sure results are displayed before printing
    if (document.getElementById('results').classList.contains('hidden')) {
      run().then(() => window.print());
    } else {
      window.print();
    }
  };

  const btnPdfTop = document.getElementById('btn-export-pdf-top');
  const btnPdfMain = document.getElementById('btn-export-pdf-main');
  if (btnPdfTop) btnPdfTop.addEventListener('click', printReport);
  if (btnPdfMain) btnPdfMain.addEventListener('click', printReport);

  // 6. Run Button Listener
  const runBtn = document.getElementById('run');
  if (runBtn) runBtn.addEventListener('click', run);

  // Auto-run initial optimization on page load so charts and metrics appear immediately
  setTimeout(run, 600);
});
