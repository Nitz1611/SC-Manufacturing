/**
 * Manufacturing Console — Requirement #1
 * Navigation, slicers, KPI tabs, placeholder charts/tables
 */

(function () {
  'use strict';

  /* ── Slicer config ── */
  const SLICERS = {
    showIn: {
      id: 'showIn', label: 'Show in', multi: false,
      options: ['Millions (M)', 'Thousands (K)', 'Actual', 'Percentage (%)'],
      default: 'Millions (M)',
    },
    timeframe: {
      id: 'timeframe', label: 'Timeframe', multi: false,
      options: ['FY', 'Quarter', 'Month', 'Week'],
      default: 'FY',
    },
    year: {
      id: 'year', label: 'Year', multi: false,
      options: ['2026', '2025', '2024', '2023'],
      default: '2026',
    },
    site: {
      id: 'site', label: 'Site', multi: false,
      options: ['All', 'ABERDEEN', 'ARLINGTON', 'FRISCO', 'MODESTO', 'PLANO'],
      default: 'All',
    },
    region: {
      id: 'region', label: 'Region', multi: true,
      options: ['North America', 'Latin America', 'Europe', 'Asia Pacific', 'Middle East & Africa'],
      default: ['All'],
    },
    market: {
      id: 'market', label: 'Market', multi: true,
      options: ['Snacks', 'Beverages', 'Food', 'Quaker', 'International'],
      default: ['All'],
    },
  };

  const PERIODS = ['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10'];
  const PERIOD_COLORS = [
    '#002855','#004080','#0066cc','#0088cc','#00a896',
    '#5c6bc0','#9e9e9e','#ffb74d','#ff9800','#e53935',
  ];
  const CATEGORIES = [
    'Changeover','Equipment','Facilities','Materials','No Event',
    'Operation','Personnel','Sanitation','Warehouse',
  ];
  const LINES = ['BCP1','FCP1','PTZ3','SUN1','TCS1','DIP1','FUN1','FCC1','PC1','PC2'];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const REASONS = [
    'No Event','Unplanned Sanitation','Insufficient Qualified St',
    'Equipment Failure','Material Shortage','Changeover Delay',
    'Operator Error','Utility Outage',
  ];

  const state = {
    page: 'kpi-overview',
    kpiTab: 'overview',
    filters: {},
    charts: {},
  };

  /* ── Init ── */
  document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    initNavigation();
    initKpiTabs();
    renderKpiContent();
    document.addEventListener('click', closeSlicersOnOutsideClick);
  });

  /* ── Filters ── */
  function initFilters() {
    const bar = document.getElementById('filter-bar');
    if (!bar) return;

    Object.values(SLICERS).forEach(cfg => {
      state.filters[cfg.id] = cfg.multi
        ? [...cfg.default]
        : cfg.default;

      const group = document.createElement('div');
      group.className = 'filter-group';
      group.innerHTML = `<span class="filter-label">${cfg.label}</span>`;
      group.appendChild(buildSlicer(cfg));
      bar.appendChild(group);
    });
  }

  function buildSlicer(cfg) {
    const wrap = document.createElement('div');
    wrap.className = 'slicer';
    wrap.dataset.slicer = cfg.id;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'slicer-trigger';
    trigger.innerHTML = `<span class="slicer-value">${formatFilterDisplay(cfg)}</span><span class="slicer-chevron"></span>`;
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      toggleSlicer(wrap);
    });

    const panel = document.createElement('div');
    panel.className = 'slicer-panel';

    if (cfg.multi) {
      const selectAll = document.createElement('div');
      selectAll.className = 'slicer-select-all';
      selectAll.textContent = 'Select All';
      selectAll.addEventListener('click', e => {
        e.stopPropagation();
        state.filters[cfg.id] = [...cfg.options];
        refreshSlicer(wrap, cfg);
      });
      panel.appendChild(selectAll);

      const searchWrap = document.createElement('div');
      searchWrap.className = 'slicer-search-wrap';
      const search = document.createElement('input');
      search.type = 'text';
      search.className = 'slicer-search';
      search.placeholder = 'Search…';
      search.addEventListener('input', () => filterOptions(wrap, cfg, search.value));
      searchWrap.appendChild(search);
      panel.appendChild(searchWrap);
    }

    const options = document.createElement('div');
    options.className = 'slicer-options';
    panel.appendChild(options);

    wrap.appendChild(trigger);
    wrap.appendChild(panel);
    renderSlicerOptions(wrap, cfg);
    return wrap;
  }

  function formatFilterDisplay(cfg) {
    const val = state.filters[cfg.id];
    if (cfg.multi) {
      if (val.length === 0) return 'None';
      if (val.length === cfg.options.length) return 'All';
      if (val.length === 1) return val[0];
      return `${val.length} selected`;
    }
    return val;
  }

  function renderSlicerOptions(wrap, cfg, searchTerm = '') {
    const optionsEl = wrap.querySelector('.slicer-options');
    optionsEl.innerHTML = '';
    const term = (searchTerm || '').toLowerCase();

    cfg.options
      .filter(opt => !term || opt.toLowerCase().includes(term))
      .forEach(opt => {
        const row = document.createElement('div');
        row.className = 'slicer-option';
        const selected = cfg.multi
          ? state.filters[cfg.id].includes(opt)
          : state.filters[cfg.id] === opt;
        if (selected) row.classList.add('selected');

        if (cfg.multi) {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = selected;
          row.appendChild(cb);
        } else {
          row.appendChild(document.createElement('span')).className = 'radio-dot';
        }

        const label = document.createElement('span');
        label.textContent = opt;
        row.appendChild(label);

        row.addEventListener('click', e => {
          e.stopPropagation();
          if (cfg.multi) {
            const arr = state.filters[cfg.id];
            const idx = arr.indexOf(opt);
            if (idx >= 0) arr.splice(idx, 1);
            else arr.push(opt);
          } else {
            state.filters[cfg.id] = opt;
            closeAllSlicers();
          }
          refreshSlicer(wrap, cfg);
        });

        optionsEl.appendChild(row);
      });
  }

  function filterOptions(wrap, cfg, term) {
    renderSlicerOptions(wrap, cfg, term);
  }

  function refreshSlicer(wrap, cfg) {
    wrap.querySelector('.slicer-value').textContent = formatFilterDisplay(cfg);
    renderSlicerOptions(wrap, cfg, wrap.querySelector('.slicer-search')?.value || '');
  }

  function toggleSlicer(wrap) {
    const wasOpen = wrap.classList.contains('open');
    closeAllSlicers();
    if (!wasOpen) wrap.classList.add('open');
  }

  function closeAllSlicers() {
    document.querySelectorAll('.slicer.open').forEach(s => s.classList.remove('open'));
  }

  function closeSlicersOnOutsideClick(e) {
    if (!e.target.closest('.slicer')) closeAllSlicers();
  }

  /* ── Page navigation ── */
  function initNavigation() {
    document.querySelectorAll('.nav-link').forEach(btn => {
      btn.addEventListener('click', () => switchPage(btn.dataset.page));
    });
    switchPage(state.page, true);
  }

  function switchPage(pageId, instant) {
    if (pageId === state.page && !instant) return;

    const current = document.querySelector('.page-panel.active');
    const next = document.getElementById(`page-${pageId}`);

    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.page === pageId);
    });

    if (instant || !current) {
      document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active', 'leaving'));
      next?.classList.add('active');
      state.page = pageId;
      return;
    }

    current.classList.add('leaving');
    current.classList.remove('active');

    setTimeout(() => {
      current.classList.remove('leaving');
      document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active'));
      next?.classList.add('active');
      state.page = pageId;
    }, 220);
  }

  /* ── KPI tabs ── */
  function initKpiTabs() {
    document.querySelectorAll('.kpi-tab').forEach(tab => {
      tab.addEventListener('click', () => switchKpiTab(tab.dataset.tab));
    });
    switchKpiTab(state.kpiTab, true);
  }

  function switchKpiTab(tabId, instant) {
    if (tabId === state.kpiTab && !instant) return;

    document.querySelectorAll('.kpi-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabId);
    });

    document.querySelectorAll('.kpi-tab-panel').forEach(p => {
      p.classList.toggle('active', p.dataset.tab === tabId);
    });

    state.kpiTab = tabId;

    if (tabId === 'overview') {
      requestAnimationFrame(() => initOverviewCharts());
    } else {
      requestAnimationFrame(() => initTabCharts(tabId));
    }
  }

  /* ── Mock data helpers ── */
  function randPct(min, max) {
    return (Math.random() * (max - min) + min).toFixed(2) + '%';
  }

  function randVal(min, max) {
    return (Math.random() * (max - min) + min).toFixed(2);
  }

  function periodData(count, min, max) {
    return Array.from({ length: count }, () =>
      parseFloat(randVal(min, max))
    );
  }

  /* ── AI Summary ── */
  function aiSummaryHTML() {
    return `
      <div class="ai-summary">
        <div class="ai-summary-icon">✦</div>
        <div>
          <div class="ai-summary-label">AI Summary</div>
          <p class="ai-summary-text">
            Overall unplanned downtime shows variation across sites, lines, categories, days, and periods.
            A few high-impact lines and reasons contribute significantly to downtime, while the latest periods
            show an upward trend. Focus on the key contributors to prioritize corrective action.
          </p>
        </div>
      </div>`;
  }

  /* ── Table builders ── */
  function buildCategoryTable() {
    const site = state.filters.site === 'All' ? 'ABERDEEN' : state.filters.site;
    let rows = '';
    CATEGORIES.forEach(cat => {
      const cells = PERIODS.map(() => `<td>${randPct(0, 4)}</td>`).join('');
      rows += `<tr><td class="indent">${cat}</td><td></td>${cells}<td>${randPct(1, 5)}</td><td>${randPct(2, 8)}</td></tr>`;
    });
    const totalCells = PERIODS.map(() => `<td>${randPct(1, 6)}</td>`).join('');
    rows += `<tr class="row-total"><td>Total</td><td></td>${totalCells}<td>${randPct(3, 8)}</td><td>${randPct(5, 12)}</td></tr>`;

    return `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Site</th><th>Year / Category</th>
              ${PERIODS.map(p => `<th>2026 ${p}</th>`).join('')}
              <th>2026 Total</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="expand-btn">−</span>${site}</td>
              <td></td>
              ${PERIODS.map(() => `<td>—</td>`).join('')}
              <td>—</td><td>—</td>
            </tr>
            ${rows}
          </tbody>
        </table>
      </div>`;
  }

  function buildLineTable() {
    const site = state.filters.site === 'All' ? 'ABERDEEN' : state.filters.site;
    let rows = LINES.map(line => {
      const cells = PERIODS.map(() => `<td>${randPct(0, 12)}</td>`).join('');
      return `<tr><td class="indent">${line}</td><td></td>${cells}<td>${randPct(2, 15)}</td><td>${randPct(4, 20)}</td></tr>`;
    }).join('');
    const totalCells = PERIODS.map(() => `<td>${randPct(2, 10)}</td>`).join('');
    rows += `<tr class="row-total"><td>Total</td><td></td>${totalCells}<td>${randPct(5, 15)}</td><td>${randPct(8, 25)}</td></tr>`;

    return `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Site</th><th>Line</th>
              ${PERIODS.map(p => `<th>2026 ${p}</th>`).join('')}
              <th>2026 Total</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="expand-btn">−</span>${site}</td>
              <td></td>
              ${PERIODS.map(() => `<td>—</td>`).join('')}
              <td>—</td><td>—</td>
            </tr>
            ${rows}
          </tbody>
        </table>
      </div>`;
  }

  function dataCard(title, body, toggleId) {
    const toggle = toggleId ? `
      <div class="view-toggle">
        <button type="button" class="view-toggle-btn active" data-view="table" data-card="${toggleId}" title="Table">☰</button>
        <button type="button" class="view-toggle-btn" data-view="chart" data-card="${toggleId}" title="Chart">📈</button>
      </div>` : '';

    return `
      <div class="data-card" data-card-id="${toggleId || ''}">
        <div class="data-card-header">
          <span class="data-card-title">${title}</span>
          ${toggle}
        </div>
        <div class="data-card-body">${body}</div>
      </div>`;
  }

  /* ── Render KPI panels ── */
  function renderKpiContent() {
    const overview = document.getElementById('kpi-tab-overview');
    if (!overview) return;

    overview.innerHTML = `
      ${aiSummaryHTML()}
      ${dataCard('Unplanned DT % by Category',
        `<div id="view-category-table">${buildCategoryTable()}</div>
         <div id="view-category-chart" class="hidden-view"><div class="chart-wrap"><canvas id="chart-category"></canvas></div></div>`,
        'category')}
      ${dataCard('Unplanned DT % by Line/Category',
        `<div id="view-line-table">${buildLineTable()}</div>
         <div id="view-line-chart" class="hidden-view"><div class="chart-wrap tall"><canvas id="chart-line"></canvas></div></div>`,
        'line')}
      <div class="overview-grid-3">
        ${dataCard('Unplanned DT % by Day of Week',
          `<div class="chart-wrap short"><canvas id="chart-dow"></canvas></div>`)}
        ${dataCard('Unplanned DT Hours by Reason',
          `<div class="chart-wrap short"><canvas id="chart-reason"></canvas></div>`)}
        ${dataCard('Unplanned DT % by Period Trend',
          `<div class="chart-wrap short"><canvas id="chart-trend"></canvas></div>`)}
      </div>`;

    ['category','line'].forEach(id => {
      document.querySelectorAll(`.view-toggle-btn[data-card="${id}"]`).forEach(btn => {
        btn.addEventListener('click', () => toggleCardView(id, btn.dataset.view));
      });
    });

    document.getElementById('kpi-tab-by-category').innerHTML =
      aiSummaryHTML() + dataCard('Unplanned DT % by Category',
        `<div class="chart-wrap"><canvas id="chart-tab-category"></canvas></div>`);

    document.getElementById('kpi-tab-by-line').innerHTML =
      aiSummaryHTML() + dataCard('Unplanned DT % by Line/Category',
        `<div class="chart-wrap tall"><canvas id="chart-tab-line"></canvas></div>`);

    document.getElementById('kpi-tab-by-dow').innerHTML =
      aiSummaryHTML() + dataCard('Unplanned DT % by Day of Week',
        `<div class="chart-wrap"><canvas id="chart-tab-dow"></canvas></div>`);

    document.getElementById('kpi-tab-by-reason').innerHTML =
      aiSummaryHTML() +
      `<div class="overview-grid-3">
        ${dataCard('Unplanned DT Hours by Reason', `<div class="chart-wrap"><canvas id="chart-tab-reason"></canvas></div>`)}
        ${dataCard('Unplanned DT % by Period Trend', `<div class="chart-wrap"><canvas id="chart-tab-trend"></canvas></div>`)}
      </div>`;

    initOverviewCharts();
  }

  function toggleCardView(cardId, view) {
    document.querySelectorAll(`.view-toggle-btn[data-card="${cardId}"]`).forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    const tableEl = document.getElementById(`view-${cardId}-table`);
    const chartEl = document.getElementById(`view-${cardId}-chart`);
    if (view === 'table') {
      tableEl?.classList.remove('hidden-view');
      chartEl?.classList.add('hidden-view');
    } else {
      tableEl?.classList.add('hidden-view');
      chartEl?.classList.remove('hidden-view');
      if (cardId === 'category') makeGroupedBarChart('chart-category', CATEGORIES, 20);
      if (cardId === 'line') makeGroupedBarChart('chart-line', LINES, 30);
    }
  }

  /* ── Charts ── */
  function destroyChart(id) {
    if (state.charts[id]) {
      state.charts[id].destroy();
      delete state.charts[id];
    }
  }

  function makeGroupedBarChart(canvasId, labels, yMax) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    const datasets = PERIODS.map((p, i) => ({
      label: p,
      data: labels.map(() => parseFloat(randVal(0, yMax * 0.8))),
      backgroundColor: PERIOD_COLORS[i],
      borderRadius: 2,
      barPercentage: 0.9,
      categoryPercentage: 0.85,
    }));

    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, font: { size: 10 } },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: yMax,
            ticks: { callback: v => v + '%' },
            grid: { color: '#eef2f6' },
          },
          x: { grid: { display: false } },
        },
      },
    });
  }

  function makeDowChart(canvasId) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    const weeks = ['2026P09W01','2026P09W04','2026P09W03'];
    const colors = ['#002855','#0066cc','#ff9800'];

    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: DAYS,
        datasets: weeks.map((w, i) => ({
          label: w,
          data: periodData(7, 2, 18),
          backgroundColor: colors[i],
          borderRadius: 3,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } },
        scales: {
          y: { beginAtZero: true, max: 20, ticks: { callback: v => v + '%' }, grid: { color: '#eef2f6' } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  function makeReasonChart(canvasId) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    const values = [6241.25, 3107.66, 2890, 2100, 1850, 1200, 980, 650];

    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: REASONS,
        datasets: [{
          label: 'Hours',
          data: values,
          backgroundColor: '#002855',
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: '#eef2f6' } },
          y: { grid: { display: false } },
        },
      },
    });
  }

  function makeTrendChart(canvasId) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    state.charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: ['1','2','3','4','5','6','7','8','9'],
        datasets: [{
          label: 'Unplanned DT %',
          data: [9.2, 8.8, 9.5, 10.1, 9.8, 10.4, 10.8, 10.2, 10.6],
          borderColor: '#0066cc',
          backgroundColor: 'rgba(0,102,204,0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#0066cc',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 7, max: 11, ticks: { callback: v => v.toFixed(1) + '%' }, grid: { color: '#eef2f6' } },
          x: { title: { display: true, text: 'Period' }, grid: { display: false } },
        },
      },
    });
  }

  function initOverviewCharts() {
    makeDowChart('chart-dow');
    makeReasonChart('chart-reason');
    makeTrendChart('chart-trend');
  }

  function initTabCharts(tabId) {
    const map = {
      'by-category': () => makeGroupedBarChart('chart-tab-category', CATEGORIES, 20),
      'by-line': () => makeGroupedBarChart('chart-tab-line', LINES, 30),
      'by-dow': () => makeDowChart('chart-tab-dow'),
      'by-reason': () => {
        makeReasonChart('chart-tab-reason');
        makeTrendChart('chart-tab-trend');
      },
    };
    map[tabId]?.();
  }

  /* expose for future requirements */
  window.ManufacturingConsole = { state, switchPage, switchKpiTab };
})();
