// ── Splash screen dismiss ───────────────────────────────────────────────
(function () {
  const splash = document.getElementById('splash');
  if (!splash) return;
  // Dismiss after 2.8s (ring animation takes ~2.3s)
  setTimeout(() => {
    splash.classList.add('splash-hide');
    splash.addEventListener('animationend', () => splash.remove(), { once: true });
  }, 2800);
})();

// ── Chart.js Global Defaults (light theme) ─────────────────────────────

Chart.defaults.color          = '#64748b';
Chart.defaults.borderColor    = '#e2e8f0';
Chart.defaults.font.family    = "'Plus Jakarta Sans', system-ui, sans-serif";
Chart.defaults.font.size      = 12;

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

let charts = {};

function readInputs() {
  const o = {};
  FIELD_IDS.forEach(id => { o[id] = Number(document.getElementById(id).value); });
  return o;
}

// ── Build a line chart using labels + plain data arrays ─────────────────
//    This is the CORRECT Chart.js approach — avoids {x,y} parsing issues
function makeLineChart(canvasId, labels, datasets, xLabel, yLabel, extra = {}) {
  if (charts[canvasId]) { charts[canvasId].destroy(); }

  const ctx = document.getElementById(canvasId).getContext('2d');
  charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: datasets.length > 1,
          labels: { boxWidth: 10, padding: 14, usePointStyle: true }
        },
        tooltip: {
          backgroundColor: 'white',
          titleColor: '#0f172a',
          bodyColor: '#475569',
          borderColor: '#e2e8f0',
          borderWidth: 1,
          padding: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,.1)'
        }
      },
      scales: {
        x: {
          title: { display: true, text: xLabel, color: '#64748b', font: { weight: '600', size: 11 } },
          ticks: { maxTicksLimit: 8, color: '#94a3b8' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          title: { display: true, text: yLabel, color: '#64748b', font: { weight: '600', size: 11 } },
          ticks: { color: '#94a3b8' },
          grid: { color: '#f1f5f9' },
          ...extra.yScale
        }
      },
      elements: { point: { radius: 0, hoverRadius: 5 } },
      ...extra.chartOpts
    }
  });
}

// Helper: build a line dataset object
function lineDs(label, data, color, colorA, dashed = false) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: colorA,
    borderWidth: 2.5,
    tension: 0.3,
    fill: true,
    borderDash: dashed ? [6, 4] : [],
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHoverBackgroundColor: color,
  };
}

// ── Force breakdown HTML bars ────────────────────────────────────────────
function renderForceBars(fb) {
  const entries = [
    { label: 'Tractive Force  (Ft)',        val: fb.tractive,            color: C.indigo },
    { label: 'Rolling Resistance  (Frr)',   val: fb.rolling_resistance,  color: C.emerald },
    { label: 'Aerodynamic Drag  (Fdrag)',   val: fb.aerodynamic_drag,    color: C.amber },
    { label: 'Grade Resistance  (Fgrade)',  val: fb.grade_resistance,    color: C.rose },
    { label: 'Net Force  (Fnet)',           val: fb.net_force,           color: C.violet },
  ];
  const maxVal = Math.max(...entries.map(e => Math.abs(e.val)));
  document.getElementById('force-bars').innerHTML = entries.map(e => {
    const pct  = maxVal > 0 ? (Math.abs(e.val) / maxVal * 100).toFixed(1) : 0;
    const sign = e.val < 0 ? '−' : '+';
    return `
      <div class="force-row">
        <div class="force-row-label">${e.label}</div>
        <div class="force-bar-outer">
          <div class="force-bar-inner" style="width:${pct}%;background:${e.color}88;border:2px solid ${e.color}"></div>
        </div>
        <div class="force-row-val" style="color:${e.color}">${sign}${Math.abs(e.val).toFixed(1)} N</div>
      </div>`;
  }).join('');
}

// ── Force bar chart (canvas) ─────────────────────────────────────────────
function renderForceBarChart(fb) {
  if (charts['forceChart']) { charts['forceChart'].destroy(); }
  const ctx = document.getElementById('forceChart').getContext('2d');
  charts['forceChart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Tractive\n(Ft)', 'Rolling\n(Frr)', 'Aero Drag\n(Fdrag)', 'Grade Res.\n(Fgrade)', 'Net Force\n(Fnet)'],
      datasets: [{
        data: [fb.tractive, fb.rolling_resistance, fb.aerodynamic_drag, fb.grade_resistance, fb.net_force],
        backgroundColor: [C.indigoA, C.emeraldA, C.amberA, C.roseA, C.violetA],
        borderColor:     [C.indigo,  C.emerald,  C.amber,  C.rose,  C.violet],
        borderWidth: 2,
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } },
        y: {
          title: { display: true, text: 'Force (N)', color: '#64748b', font: { weight: '600', size: 11 } },
          ticks: { color: '#94a3b8' },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  });
}

// ── Convergence chart (log scale) ────────────────────────────────────────
function renderConvergenceChart(convergence) {
  if (charts['convChart']) { charts['convChart'].destroy(); }
  const { iterations: iters, errors } = convergence;
  if (!iters || iters.length === 0) return;

  const ctx = document.getElementById('convChart').getContext('2d');
  charts['convChart'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: iters,
      datasets: [{
        label: '|Gₙ₊₁ − Gₙ|',
        data: errors,
        borderColor: C.violet,
        backgroundColor: C.violetA,
        borderWidth: 2.5,
        tension: 0.2,
        fill: true,
        pointRadius: iters.length <= 20 ? 5 : 2,
        pointBackgroundColor: C.violet,
        pointBorderColor: 'white',
        pointBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'white', titleColor: '#0f172a',
          bodyColor: '#475569', borderColor: '#e2e8f0', borderWidth: 1, padding: 10,
          callbacks: { label: ctx => `Error: ${ctx.raw.toExponential(4)}` }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Iteration n', color: '#64748b', font: { weight: '600', size: 11 } },
          ticks: { stepSize: 1, color: '#94a3b8' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          type: 'logarithmic',
          title: { display: true, text: '|Error| — log scale', color: '#64748b', font: { weight: '600', size: 11 } },
          ticks: { color: '#94a3b8', callback: v => v.toExponential(0) },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  });
}

// ── Main click handler ───────────────────────────────────────────────────
document.getElementById('run').addEventListener('click', async () => {
  const errEl   = document.getElementById('error');
  const runIcon = document.getElementById('run-icon');
  const runText = document.getElementById('run-text');
  const btn     = document.getElementById('run');

  errEl.textContent  = '';
  runIcon.textContent = '⏳';
  runText.textContent = 'COMPUTING…';
  btn.disabled = true;

  try {
    const resp = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(readInputs())
    });
    const d = await resp.json();
    if (!resp.ok) throw new Error(d.error || 'Calculation failed');

    // Show results
    document.getElementById('results').classList.remove('hidden');

    // Hero
    document.getElementById('opt').textContent  = d.optimal_ratio.toFixed(4) + ' : 1';
    document.getElementById('conv').textContent =
      `✓ Converged in ${d.iterations.length} iteration(s)  ·  ε = ${readInputs().tolerance}`;

    const m = d.metrics;

    // Performance
    document.getElementById('acc').textContent      = m.acceleration.toFixed(4);
    document.getElementById('speedout').textContent = m.max_speed.toFixed(2);
    document.getElementById('gradeout').textContent = m.gradeability.toFixed(2);
    document.getElementById('score').textContent    = m.performance_score.toFixed(4);

    // Force
    document.getElementById('wt').textContent       = m.wheel_torque.toFixed(1);
    document.getElementById('ft').textContent       = m.tractive_force.toFixed(1);
    document.getElementById('ste').textContent      = m.specific_tractive.toFixed(4);
    document.getElementById('derating').textContent = m.derating_factor.toFixed(4);

    // Power & Energy
    document.getElementById('pmotor').textContent  = m.motor_power_kw.toFixed(2);
    document.getElementById('pwheel').textContent  = m.wheel_power_kw.toFixed(2);
    document.getElementById('ploss').textContent   = m.power_loss_kw.toFixed(2);
    document.getElementById('energy').textContent  = m.energy_wh_per_km.toFixed(1);

    // Force bars
    renderForceBars(m.force_breakdown);

    // ── Charts — use labels array + plain data arrays (NOT {x,y} objects) ──
    const c = d.curve;

    // Round gear ratios to 3 decimal places for x-axis labels
    const grLabels = c.gear_ratio.map(v => v.toFixed(3));

    // Row 1
    makeLineChart('perfChart',    grLabels, [lineDs('Performance Score', c.performance,    C.indigo,  C.indigoA)],  'Gear Ratio G', 'S(G)');
    makeLineChart('accChart',     grLabels, [lineDs('Acceleration',      c.acceleration,   C.emerald, C.emeraldA)], 'Gear Ratio G', 'a (m/s²)');
    makeLineChart('speedChart',   grLabels, [lineDs('Max Speed',         c.max_speed,      C.sky,     C.skyA)],     'Gear Ratio G', 'v_max (km/h)');

    // Row 2
    makeLineChart('gradeChart',   grLabels, [lineDs('Gradeability',     c.gradeability,    C.amber,   C.amberA)],  'Gear Ratio G', 'GR (%)');
    makeLineChart('tractionChart',grLabels, [lineDs('Tractive Force',   c.tractive_force,  C.violet,  C.violetA)], 'Gear Ratio G', 'Ft (N)');
    makeLineChart('powerChart',   grLabels, [
      lineDs('P_motor (kW)', c.power_motor_kw, C.amber,  C.amberA),
      lineDs('P_wheel (kW)', c.power_wheel_kw, C.emerald, C.emeraldA),
      lineDs('P_loss (kW)',  c.power_loss_kw,  C.rose,   C.roseA, true),
    ], 'Gear Ratio G', 'Power (kW)');

    // Row 3
    renderConvergenceChart(d.convergence);
    renderForceBarChart(m.force_breakdown);

    // ── Iteration table ─────────────────────────────────────────────────
    const tbody = document.querySelector('#iterations tbody');
    tbody.innerHTML = '';
    d.iterations.forEach(x => {
      const tr = document.createElement('tr');
      [x.iteration, x.G_n, x.f_G, x.f_prime_G, x.G_next, x.error].forEach((v, i) => {
        const td = document.createElement('td');
        td.textContent = i === 0 ? v : Number(v).toExponential(6);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    // Smooth scroll to results
    setTimeout(() => {
      document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

  } catch (e) {
    errEl.textContent = '⚠ ' + e.message;
  } finally {
    runIcon.textContent = '⚡';
    runText.textContent = 'OPTIMIZE GEAR RATIO';
    btn.disabled = false;
  }
});
