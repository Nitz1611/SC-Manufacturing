/**
 * Manufacturing Console — Production-grade UI
 * Left expanding sidebar, seeded realistic visuals, PepsiCo palette
 */

(function () {
  'use strict';

  const SLICERS = {
    showIn: { id: 'showIn', label: 'Show in', multi: false, options: ['Millions (M)', 'Thousands (K)', 'Actual', 'Percentage (%)'], default: 'Millions (M)' },
    timeframe: { id: 'timeframe', label: 'Timeframe', multi: false, options: ['FY', 'Quarter', 'Month', 'Week'], default: 'FY' },
    year: { id: 'year', label: 'Year', multi: false, options: ['2026', '2025', '2024', '2023'], default: '2026' },
    site: { id: 'site', label: 'Site', multi: false, options: ['All', 'ABERDEEN', 'ARLINGTON', 'FRISCO', 'MODESTO', 'PLANO'], default: 'All' },
    region: { id: 'region', label: 'Region', multi: true, options: ['North America', 'Latin America', 'Europe', 'Asia Pacific', 'Middle East & Africa'], default: ['All'] },
    market: { id: 'market', label: 'Market', multi: true, options: ['Snacks', 'Beverages', 'Food', 'Quaker', 'International'], default: ['All'] },
  };

  const PAGES = [
    { id: 'intel-brief', title: 'Intel Brief', desc: 'Executive summary and key alerts', icon: 'brief' },
    {
      id: 'kpi-overview', title: 'KPI Overview', desc: 'Unplanned downtime analytics', icon: 'kpi', children: [
        { id: 'overview', title: 'Overview', desc: 'Full dashboard snapshot' },
        { id: 'by-category', title: 'DT % by Category', desc: 'RSN category breakdown' },
        { id: 'by-line', title: 'DT % by Line/Category', desc: 'Line-level performance' },
        { id: 'by-dow', title: 'DT % by Day of Week', desc: 'Weekly shift patterns' },
        { id: 'by-reason', title: 'DT % by Reason/Trend', desc: 'Root causes & period trend' },
      ],
    },
    { id: 'insights', title: 'Insights', desc: 'AI-driven recommendations', icon: 'insights' },
    { id: 'rca', title: 'Root Cause Analysis', desc: 'Deep-dive investigations', icon: 'rca' },
  ];

  const PERIODS = ['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10'];
  const PERIOD_COLORS = ['#002855','#004080','#0066cc','#0088cc','#00a896','#5c6bc0','#9e9e9e','#ffb74d','#ff9800','#e53935'];
  const CATEGORIES = ['Changeover','Equipment','Facilities','Materials','No Event','Operation','Personnel','Sanitation','Warehouse'];
  const LINES = ['BCP1','FCP1','PTZ3','SUN1','TCS1','DIP1','FUN1','FCC1','PC1','PC2'];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const REASONS = ['No Event','Unplanned Sanitation','Insufficient Qualified St','Equipment Failure','Material Shortage','Changeover Delay','Operator Error','Utility Outage'];
  const REASON_HOURS = [6241.25, 3107.66, 2890, 2100, 1850, 1200, 980, 650];
  const TREND_DATA = [9.2, 8.8, 9.5, 10.1, 9.8, 10.4, 10.8, 10.2, 10.6];

  const state = { page: 'kpi-overview', kpiTab: 'overview', filters: {}, charts: {}, expanded: 'kpi-overview' };

  /* Seeded PRNG for stable realistic data */
  function seededRandom(seed) {
    let s = seed;
    return () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  const rng = seededRandom(42);

  function resetRng(seed) { Object.assign(rng, seededRandom(seed)); }

  function stableVal(base, variance, decimals = 2) {
    return +(base + (rng() - 0.5) * variance).toFixed(decimals);
  }

  /* Pre-built realistic category matrix [category][period] */
  const CATEGORY_BASE = {
    Changeover: [0.3, 0.5, 0.4, 0.6, 0.8, 0.7, 0.5, 0.9, 0.6, 0.4],
    Equipment: [2.1, 2.8, 3.0, 2.5, 3.2, 2.9, 3.5, 2.7, 3.1, 2.4],
    Facilities: [0.8, 1.0, 0.9, 1.1, 0.7, 0.8, 1.2, 0.9, 1.0, 0.8],
    Materials: [1.2, 1.5, 1.3, 1.8, 1.6, 1.4, 1.7, 1.5, 1.3, 1.2],
    'No Event': [0.5, 0.6, 0.4, 0.7, 0.5, 0.6, 0.8, 0.5, 0.4, 0.5],
    Operation: [1.0, 1.2, 1.1, 1.3, 1.0, 1.4, 1.2, 1.1, 1.3, 1.0],
    Personnel: [0.6, 0.8, 0.7, 0.9, 0.8, 0.7, 0.6, 0.8, 0.7, 0.6],
    Sanitation: [0.4, 0.5, 0.6, 0.5, 0.4, 0.5, 0.6, 0.4, 0.5, 0.4],
    Warehouse: [0.2, 0.3, 0.2, 0.4, 0.3, 0.2, 0.3, 0.2, 0.3, 0.2],
  };

  const LINE_BASE = {
    BCP1: [8.2, 9.1, 10.2, 9.5, 10.8, 11.2, 10.5, 9.8, 10.1, 9.4],
    FCP1: [5.1, 5.8, 6.2, 5.5, 6.0, 5.9, 6.4, 5.7, 5.5, 5.2],
    PTZ3: [3.2, 3.8, 4.1, 3.5, 4.0, 3.9, 4.2, 3.6, 3.4, 3.1],
    SUN1: [6.5, 7.2, 7.8, 7.0, 7.5, 7.3, 8.0, 7.1, 6.9, 6.5],
    TCS1: [4.0, 4.5, 5.0, 4.2, 4.8, 4.6, 5.1, 4.4, 4.2, 4.0],
    DIP1: [2.8, 3.2, 3.5, 3.0, 3.4, 3.3, 3.6, 3.1, 2.9, 2.7],
    FUN1: [7.0, 7.8, 8.5, 7.5, 8.2, 8.0, 8.8, 7.6, 7.4, 7.0],
    FCC1: [4.5, 5.0, 5.5, 4.8, 5.2, 5.0, 5.6, 4.9, 4.7, 4.4],
    PC1: [3.0, 3.5, 3.8, 3.2, 3.6, 3.5, 3.9, 3.3, 3.1, 2.9],
    PC2: [2.5, 2.9, 3.2, 2.7, 3.0, 2.8, 3.3, 2.6, 2.5, 2.4],
  };

  const DOW_DATA = {
    '2026P09W01': [12.5, 14.2, 15.8, 14.5, 16.2, 13.8, 11.2],
    '2026P09W04': [10.2, 11.8, 13.5, 12.8, 14.0, 11.5, 9.8],
    '2026P09W03': [8.5, 9.8, 11.2, 10.5, 12.0, 9.5, 8.0],
  };

  const ICONS = {
    brief: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
    kpi: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
    insights: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.8 5.7 21l2.3-7-6-4.6h7.6z"/></svg>',
    rca: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/></svg>',
  };

  document.addEventListener('DOMContentLoaded', () => {
    buildSidebar();
    initFilters();
    initSidebarToggle();
    renderKpiContent();
    switchPage('kpi-overview', true);
    switchKpiTab('overview', true);
    document.addEventListener('click', closeSlicersOnOutsideClick);
  });

  /* ── Sidebar ── */
  function buildSidebar() {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;
    nav.innerHTML = '';

    PAGES.forEach(page => {
      const group = document.createElement('div');
      group.className = 'sidenav-group' + (page.children ? ' has-children' : '');
      group.dataset.page = page.id;
      if (page.id === state.expanded) group.classList.add('expanded');

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'sidenav-header';
      header.innerHTML = `
        <span class="sidenav-icon">${ICONS[page.icon] || ICONS.kpi}</span>
        <span class="sidenav-text">
          <span class="sidenav-title">${page.title}</span>
          <span class="sidenav-desc">${page.desc}</span>
        </span>
        ${page.children ? '<span class="sidenav-chevron"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></span>' : ''}`;

      header.addEventListener('click', () => {
        if (page.children) {
          const wasExpanded = group.classList.contains('expanded');
          document.querySelectorAll('.sidenav-group').forEach(g => g.classList.remove('expanded'));
          if (!wasExpanded || state.page !== page.id) {
            group.classList.add('expanded');
            state.expanded = page.id;
          }
          switchPage(page.id);
        } else {
          document.querySelectorAll('.sidenav-group').forEach(g => g.classList.remove('expanded'));
          switchPage(page.id);
        }
      });

      group.appendChild(header);

      if (page.children) {
        const children = document.createElement('div');
        children.className = 'sidenav-children';
        page.children.forEach(child => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'sidenav-child';
          btn.dataset.tab = child.id;
          btn.textContent = child.title;
          btn.title = child.desc;
          btn.addEventListener('click', e => {
            e.stopPropagation();
            switchPage(page.id, true);
            switchKpiTab(child.id);
          });
          children.appendChild(btn);
        });
        group.appendChild(children);
      }

      nav.appendChild(group);
    });
  }

  function updateSidebarUI() {
    document.querySelectorAll('.sidenav-group').forEach(g => {
      const pid = g.dataset.page;
      g.classList.toggle('active', pid === state.page);
      g.classList.toggle('expanded', pid === state.expanded && pid === 'kpi-overview');
    });
    document.querySelectorAll('.sidenav-child').forEach(c => {
      c.classList.toggle('active', state.page === 'kpi-overview' && c.dataset.tab === state.kpiTab);
    });
    const page = PAGES.find(p => p.id === state.page);
    const child = page?.children?.find(c => c.id === state.kpiTab);
    const crumb = child ? `${page.title} · ${child.title}` : (page?.title || '');
    const el = document.getElementById('context-breadcrumb');
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => { el.textContent = crumb; el.style.opacity = '1'; }, 150);
    }
  }

  function initSidebarToggle() {
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('open');
    });
  }

  /* ── Filters (unchanged logic) ── */
  function initFilters() {
    const bar = document.getElementById('filter-bar');
    if (!bar) return;
    Object.values(SLICERS).forEach(cfg => {
      state.filters[cfg.id] = cfg.multi ? [...cfg.default] : cfg.default;
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
    trigger.addEventListener('click', e => { e.stopPropagation(); toggleSlicer(wrap); });
    const panel = document.createElement('div');
    panel.className = 'slicer-panel';
    if (cfg.multi) {
      const selectAll = document.createElement('div');
      selectAll.className = 'slicer-select-all';
      selectAll.textContent = 'Select All';
      selectAll.addEventListener('click', e => { e.stopPropagation(); state.filters[cfg.id] = [...cfg.options]; refreshSlicer(wrap, cfg); });
      panel.appendChild(selectAll);
      const searchWrap = document.createElement('div');
      searchWrap.className = 'slicer-search-wrap';
      const search = document.createElement('input');
      search.type = 'text'; search.className = 'slicer-search'; search.placeholder = 'Search…';
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
      if (!val.length) return 'None';
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
    cfg.options.filter(opt => !term || opt.toLowerCase().includes(term)).forEach(opt => {
      const row = document.createElement('div');
      row.className = 'slicer-option';
      const selected = cfg.multi ? state.filters[cfg.id].includes(opt) : state.filters[cfg.id] === opt;
      if (selected) row.classList.add('selected');
      if (cfg.multi) {
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = selected;
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
          if (idx >= 0) arr.splice(idx, 1); else arr.push(opt);
        } else {
          state.filters[cfg.id] = opt;
          closeAllSlicers();
        }
        refreshSlicer(wrap, cfg);
      });
      optionsEl.appendChild(row);
    });
  }

  function filterOptions(wrap, cfg, term) { renderSlicerOptions(wrap, cfg, term); }
  function refreshSlicer(wrap, cfg) {
    wrap.querySelector('.slicer-value').textContent = formatFilterDisplay(cfg);
    renderSlicerOptions(wrap, cfg, wrap.querySelector('.slicer-search')?.value || '');
  }
  function toggleSlicer(wrap) {
    const wasOpen = wrap.classList.contains('open');
    closeAllSlicers();
    if (!wasOpen) wrap.classList.add('open');
  }
  function closeAllSlicers() { document.querySelectorAll('.slicer.open').forEach(s => s.classList.remove('open')); }
  function closeSlicersOnOutsideClick(e) { if (!e.target.closest('.slicer')) closeAllSlicers(); }

  /* ── Navigation ── */
  function switchPage(pageId, instant) {
    if (pageId === state.page && !instant) return;
    const current = document.querySelector('.page-panel.active');
    const next = document.getElementById(`page-${pageId}`);

    if (pageId === 'kpi-overview') {
      state.expanded = 'kpi-overview';
    }

    const run = () => {
      document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active', 'leaving'));
      next?.classList.add('active');
      state.page = pageId;
      updateSidebarUI();
      if (pageId === 'kpi-overview') {
        requestAnimationFrame(() => refreshChartsForTab(state.kpiTab));
      }
    };

    if (instant || !current) { run(); return; }

    current.classList.add('leaving');
    current.classList.remove('active');
    setTimeout(run, 260);
  }

  function switchKpiTab(tabId, instant) {
    if (tabId === state.kpiTab && !instant) return;
    document.querySelectorAll('.kpi-tab-panel').forEach(p => {
      p.classList.toggle('active', p.dataset.tab === tabId);
    });
    state.kpiTab = tabId;
    state.expanded = 'kpi-overview';
    updateSidebarUI();
    requestAnimationFrame(() => refreshChartsForTab(tabId));
  }

  function refreshChartsForTab(tabId) {
    if (tabId === 'overview') initOverviewCharts();
    else initTabCharts(tabId);
  }

  /* ── Formatting helpers ── */
  function fmtPct(v) {
    return v.toFixed(2) + '%';
  }

  function valClass(v) {
    if (v >= 5) return 'val-high';
    if (v >= 2.5) return 'val-mid';
    return 'val-low';
  }

  function sumRow(matrix, key) {
    const row = matrix[key];
    return row.reduce((a, b) => a + b, 0) / row.length;
  }

  /* ── Metric strip ── */
  function metricStripHTML() {
    const dt = 6.24, waste = 3.02, stops = 819, oee = 78.4;
    return `
      <div class="metric-strip">
        <div class="metric-card"><div class="metric-label">Unplanned DT %</div><div class="metric-value">${dt.toFixed(2)}%</div><div class="metric-delta up">↑ 1.24pp vs target (5%)</div></div>
        <div class="metric-card"><div class="metric-label">Waste %</div><div class="metric-value">${waste.toFixed(2)}%</div><div class="metric-delta down">↓ 0.18pp vs prior week</div></div>
        <div class="metric-card"><div class="metric-label">STOPS</div><div class="metric-value">${stops.toLocaleString()}</div><div class="metric-delta down">↓ 2,451 vs prior week</div></div>
        <div class="metric-card"><div class="metric-label">OEE</div><div class="metric-value">${oee.toFixed(1)}%</div><div class="metric-delta neutral">1.6pp below 80% target</div></div>
      </div>`;
  }

  function aiSummaryHTML() {
    return `
      <div class="ai-summary">
        <div class="ai-summary-icon">✦</div>
        <div>
          <div class="ai-summary-label">AI Summary</div>
          <p class="ai-summary-text">Overall unplanned downtime shows variation across sites, lines, categories, days, and periods. Equipment and Changeover categories drive the largest share at Aberdeen, with BCP1 and SUN1 lines contributing disproportionately. Latest periods (P8–P10) show an upward trend — prioritize Mechanical failure root causes and Shift B handover gaps.</p>
        </div>
      </div>`;
  }

  function buildCategoryTable() {
    const site = state.filters.site === 'All' ? 'ABERDEEN' : state.filters.site;
    let rows = '';
    CATEGORIES.forEach(cat => {
      const vals = CATEGORY_BASE[cat];
      const cells = vals.map(v => `<td class="${valClass(v)}">${fmtPct(v)}</td>`).join('');
      const total = sumRow(CATEGORY_BASE, cat);
      rows += `<tr><td class="indent">${cat}</td><td></td>${cells}<td class="${valClass(total)}">${fmtPct(total)}</td><td class="${valClass(total * 1.1)}">${fmtPct(total * 1.1)}</td></tr>`;
    });
    const totals = PERIODS.map((_, i) => {
      const s = CATEGORIES.reduce((a, c) => a + CATEGORY_BASE[c][i], 0);
      return `<td class="${valClass(s)}">${fmtPct(s)}</td>`;
    }).join('');
    rows += `<tr class="row-total"><td>Total</td><td></td>${totals}<td>${fmtPct(6.29)}</td><td>${fmtPct(7.12)}</td></tr>`;

    return `<div class="table-scroll"><table class="data-table"><thead><tr>
      <th>Site</th><th>Year / Category</th>
      ${PERIODS.map(p => `<th>2026 ${p}</th>`).join('')}
      <th>2026 Total</th><th>Total</th></tr></thead><tbody>
      <tr><td><span class="expand-btn">−</span>${site}</td><td></td>${PERIODS.map(() => '<td>—</td>').join('')}<td>—</td><td>—</td></tr>
      ${rows}</tbody></table></div>`;
  }

  function buildLineTable() {
    const site = state.filters.site === 'All' ? 'ABERDEEN' : state.filters.site;
    let rows = LINES.map(line => {
      const vals = LINE_BASE[line];
      const cells = vals.map(v => `<td class="${valClass(v)}">${fmtPct(v)}</td>`).join('');
      const total = sumRow(LINE_BASE, line);
      return `<tr><td class="indent">${line}</td><td></td>${cells}<td class="${valClass(total)}">${fmtPct(total)}</td><td class="${valClass(total * 1.08)}">${fmtPct(total * 1.08)}</td></tr>`;
    }).join('');
    const totals = PERIODS.map((_, i) => {
      const s = LINES.reduce((a, l) => a + LINE_BASE[l][i], 0) / LINES.length;
      return `<td class="${valClass(s)}">${fmtPct(s)}</td>`;
    }).join('');
    rows += `<tr class="row-total"><td>Total</td><td></td>${totals}<td>${fmtPct(6.85)}</td><td>${fmtPct(8.42)}</td></tr>`;

    return `<div class="table-scroll"><table class="data-table"><thead><tr>
      <th>Site</th><th>Line</th>
      ${PERIODS.map(p => `<th>2026 ${p}</th>`).join('')}
      <th>2026 Total</th><th>Total</th></tr></thead><tbody>
      <tr><td><span class="expand-btn">−</span>${site}</td><td></td>${PERIODS.map(() => '<td>—</td>').join('')}<td>—</td><td>—</td></tr>
      ${rows}</tbody></table></div>`;
  }

  function dataCard(title, body, toggleId) {
    const toggle = toggleId ? `<div class="view-toggle">
      <button type="button" class="view-toggle-btn active" data-view="table" data-card="${toggleId}" title="Table"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></button>
      <button type="button" class="view-toggle-btn" data-view="chart" data-card="${toggleId}" title="Chart"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 16l4-8 4 5 5-9"/></svg></button>
    </div>` : '';
    return `<div class="data-card"><div class="data-card-header"><span class="data-card-title">${title}</span>${toggle}</div><div class="data-card-body">${body}</div></div>`;
  }

  function renderKpiContent() {
    const overview = document.getElementById('kpi-tab-overview');
    if (!overview) return;

    overview.innerHTML = `
      ${metricStripHTML()}
      ${aiSummaryHTML()}
      ${dataCard('Unplanned DT % by Category',
        `<div id="view-category-table">${buildCategoryTable()}</div>
         <div id="view-category-chart" class="hidden-view"><div class="chart-wrap"><canvas id="chart-category"></canvas></div></div>`, 'category')}
      ${dataCard('Unplanned DT % by Line/Category',
        `<div id="view-line-table">${buildLineTable()}</div>
         <div id="view-line-chart" class="hidden-view"><div class="chart-wrap tall"><canvas id="chart-line"></canvas></div></div>`, 'line')}
      <div class="overview-grid-3">
        ${dataCard('Unplanned DT % by Day of Week', '<div class="chart-wrap short"><canvas id="chart-dow"></canvas></div>')}
        ${dataCard('Unplanned DT Hours by Reason', '<div class="chart-wrap short"><canvas id="chart-reason"></canvas></div>')}
        ${dataCard('Unplanned DT % by Period Trend', '<div class="chart-wrap short"><canvas id="chart-trend"></canvas></div>')}
      </div>`;

    ['category','line'].forEach(id => {
      document.querySelectorAll(`.view-toggle-btn[data-card="${id}"]`).forEach(btn => {
        btn.addEventListener('click', () => toggleCardView(id, btn.dataset.view));
      });
    });

    document.getElementById('kpi-tab-by-category').innerHTML = metricStripHTML() + aiSummaryHTML() +
      dataCard('Unplanned DT % by Category', '<div class="chart-wrap tall"><canvas id="chart-tab-category"></canvas></div>');
    document.getElementById('kpi-tab-by-line').innerHTML = metricStripHTML() + aiSummaryHTML() +
      dataCard('Unplanned DT % by Line/Category', '<div class="chart-wrap tall"><canvas id="chart-tab-line"></canvas></div>');
    document.getElementById('kpi-tab-by-dow').innerHTML = metricStripHTML() + aiSummaryHTML() +
      dataCard('Unplanned DT % by Day of Week', '<div class="chart-wrap tall"><canvas id="chart-tab-dow"></canvas></div>');
    document.getElementById('kpi-tab-by-reason').innerHTML = metricStripHTML() + aiSummaryHTML() +
      `<div class="overview-grid-3">
        ${dataCard('Unplanned DT Hours by Reason', '<div class="chart-wrap"><canvas id="chart-tab-reason"></canvas></div>')}
        ${dataCard('Unplanned DT % by Period Trend', '<div class="chart-wrap"><canvas id="chart-tab-trend"></canvas></div>')}
      </div>`;
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
      if (cardId === 'category') makeGroupedBarChart('chart-category', CATEGORIES, CATEGORY_BASE, 8);
      if (cardId === 'line') makeGroupedBarChart('chart-line', LINES, LINE_BASE, 14);
    }
  }

  /* ── Chart defaults ── */
  const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 1200, easing: 'easeOutQuart' },
    plugins: {
      legend: { labels: { font: { family: 'Inter', size: 11 }, boxWidth: 12, padding: 14 } },
      tooltip: {
        backgroundColor: '#002855',
        titleFont: { family: 'Inter', weight: '600' },
        bodyFont: { family: 'Inter' },
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
      },
    },
  };

  function destroyChart(id) {
    if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
  }

  function makeGroupedBarChart(canvasId, labels, matrix, yMax) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    const datasets = PERIODS.map((p, i) => ({
      label: p,
      data: labels.map(l => matrix[l]?.[i] ?? 0),
      backgroundColor: PERIOD_COLORS[i],
      borderRadius: { topLeft: 3, topRight: 3 },
      borderSkipped: false,
      barPercentage: 0.85,
      categoryPercentage: 0.78,
    }));

    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        ...CHART_DEFAULTS,
        plugins: { ...CHART_DEFAULTS.plugins, legend: { ...CHART_DEFAULTS.plugins.legend, position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, max: yMax, grid: { color: 'rgba(0,40,85,0.06)' }, ticks: { callback: v => v + '%', font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  function makeDowChart(canvasId) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const weeks = Object.keys(DOW_DATA);
    const colors = ['#002855', '#0066cc', '#ff9800'];

    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: DAYS,
        datasets: weeks.map((w, i) => ({
          label: w, data: DOW_DATA[w], backgroundColor: colors[i], borderRadius: 4,
        })),
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { ...CHART_DEFAULTS.plugins, legend: { ...CHART_DEFAULTS.plugins.legend, position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, max: 20, grid: { color: 'rgba(0,40,85,0.06)' }, ticks: { callback: v => v + '%' } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  function makeReasonChart(canvasId) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, '#002855');
    grad.addColorStop(1, '#0066cc');

    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: REASONS,
        datasets: [{
          label: 'Hours', data: REASON_HOURS,
          backgroundColor: grad, borderRadius: 4,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        indexAxis: 'y',
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(0,40,85,0.06)' } },
          y: { grid: { display: false } },
        },
      },
    });
  }

  function makeTrendChart(canvasId) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, 'rgba(0,102,204,0.25)');
    grad.addColorStop(1, 'rgba(0,102,204,0)');

    state.charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: ['1','2','3','4','5','6','7','8','9'],
        datasets: [{
          label: 'Unplanned DT %', data: TREND_DATA,
          borderColor: '#0066cc', backgroundColor: grad, fill: true,
          tension: 0.42, pointRadius: 5, pointHoverRadius: 7,
          pointBackgroundColor: '#fff', pointBorderColor: '#0066cc', pointBorderWidth: 2,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
        interaction: { intersect: false, mode: 'index' },
        scales: {
          y: { min: 7, max: 11.5, grid: { color: 'rgba(0,40,85,0.06)' }, ticks: { callback: v => v.toFixed(1) + '%' } },
          x: { title: { display: true, text: 'Period', font: { size: 11 } }, grid: { display: false } },
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
      'by-category': () => makeGroupedBarChart('chart-tab-category', CATEGORIES, CATEGORY_BASE, 8),
      'by-line': () => makeGroupedBarChart('chart-tab-line', LINES, LINE_BASE, 14),
      'by-dow': () => makeDowChart('chart-tab-dow'),
      'by-reason': () => { makeReasonChart('chart-tab-reason'); makeTrendChart('chart-tab-trend'); },
    };
    map[tabId]?.();
  }

  window.ManufacturingConsole = { state, switchPage, switchKpiTab };
})();
