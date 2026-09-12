/**
 * Manufacturing Console — Production-grade UI
 */
(function () {
  'use strict';

  const SLICERS = {
    showIn: { id: 'showIn', label: 'Show in', multi: false, options: ['Millions (M)', 'Thousands (K)', 'Actual', 'Percentage (%)'], default: 'Millions (M)' },
    timeframe: { id: 'timeframe', label: 'Timeframe', multi: false, options: ['FY', 'Quarter', 'Month', 'Week'], default: 'FY' },
    year: { id: 'year', label: 'Year', multi: false, options: ['2026', '2025', '2024', '2023'], default: '2026' },
    site: { id: 'site', label: 'Site', multi: false, options: ['All', 'ABERDEEN', 'ARLINGTON', 'FRISCO', 'MODESTO', 'PLANO'], default: 'All' },
    region: { id: 'region', label: 'Region', multi: true, options: ['North America', 'Latin America', 'Europe', 'Asia Pacific', 'Middle East & Africa'], default: [] },
    market: { id: 'market', label: 'Market', multi: true, options: ['Snacks', 'Beverages', 'Food', 'Quaker', 'International'], default: [] },
  };

  const SITES = ['ABERDEEN', 'ARLINGTON', 'FRISCO', 'MODESTO', 'PLANO'];
  const HEATMAP_SITES = ['ABERDEEN', 'ARLINGTON', 'BELOIT', 'BRIDGEVIEW', 'BROOKHOLLOW', 'CAMBRIDGE', 'CANTON', 'CHARLOTTE', 'DENVER', 'FRISCO', 'HOUSTON', 'MODESTO', 'PLANO'];
  const SITE_MULTIPLIERS = {
    ABERDEEN: 1.0, ARLINGTON: 0.92, FRISCO: 1.08, MODESTO: 0.85, PLANO: 1.12,
    BELOIT: 1.1, BRIDGEVIEW: 4.5, BROOKHOLLOW: 1.05, CAMBRIDGE: 0.72, CANTON: 0.52,
    CHARLOTTE: 0.04, DENVER: 0.88, HOUSTON: 0.95,
  };
  const TOP_SITES = ['BRIDGEVIEW', 'BROOKHOLLOW', 'BELOIT', 'ABERDEEN', 'ARLINGTON'];
  const TOP_SITE_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#0ea5e9'];
  const SITE_DT_TOTALS = {
    BRIDGEVIEW: 22.51, BELOIT: 5.60, ABERDEEN: 5.08, BROOKHOLLOW: 5.02,
    CAMBRIDGE: 3.41, CANTON: 2.42, ARLINGTON: 1.97, CHARLOTTE: 0.10,
    DENVER: 4.12, FRISCO: 5.48, HOUSTON: 3.85, MODESTO: 4.31, PLANO: 5.69,
  };
  const CATEGORY_DT_TOTALS = {
    Equipment: 12.8, Operation: 9.6, Changeover: 6.1, Sanitation: 5.4,
    'No Event': 4.2, Facilities: 3.9, Materials: 3.1, Personnel: 1.8, Warehouse: 1.2,
  };
  const CATEGORY_BAR_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#14b8a6', '#f87171', '#eab308', '#1e3a8a', '#a78bfa'];
  const TOP_SITES_TRENDS = {
    BRIDGEVIEW: [18, 22, 25, 28, 30, 32, 35, 38, 42, 40],
    BROOKHOLLOW: [4.2, 4.8, 5.1, 5.4, 5.0, 5.6, 5.2, 5.8, 5.5, 5.3],
    BELOIT: [4.8, 5.2, 5.5, 5.8, 5.4, 5.9, 5.6, 6.0, 5.7, 5.5],
    ABERDEEN: [4.5, 5.0, 5.2, 5.5, 5.1, 5.4, 5.8, 5.3, 5.6, 5.2],
    ARLINGTON: [1.5, 1.8, 2.0, 2.2, 1.9, 2.1, 2.3, 2.0, 2.2, 1.8],
  };
  const SITE_PERIOD_OVERRIDES = {
    ABERDEEN: [5.08, 4.71, 8.29, 1.95, 4.23, 5.76, 2.83, 5.51, 6.69, 3.45],
    ARLINGTON: [4.66, 1.64, 3.81, null, 3.12, 6.39, 1.82, 5.33, 5.08, 6.22],
    BELOIT: [5.60, 3.70, 5.29, 4.13, 6.42, 3.73, 5.94, 4.47, 5.55, 3.65],
    BRIDGEVIEW: [31.14, 25.17, 23.42, 0.29, null, null, null, null, null, null],
    BROOKHOLLOW: [5.02, 4.83, 6.09, 3.12, 3.88, 4.94, 4.11, 5.66, 3.99, 4.52],
    CAMBRIDGE: [3.41, 2.88, 3.05, 2.74, 3.12, 2.95, 3.28, 2.81, 3.02, 2.89],
    CANTON: [2.42, 2.18, 2.05, 1.92, 2.31, 2.14, 2.48, 2.02, 2.19, 2.06],
    CHARLOTTE: [0.10, 0.08, 0.09, 0.07, 0.11, 0.08, 0.10, 0.07, 0.09, 0.08],
  };
  const LINE_TREND_SITES = ['ABERDEEN', 'ARLINGTON', 'BELOIT', 'BRIDGEVIEW', 'BROOKHOLLOW', 'CAMBRIDGE'];
  const LINE_TREND_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#0ea5e9'];
  const TOP_LINE_DT = {
    HP17T1: 36.74, FLK17T1: 28.91, SG808V1: 24.15, SUN1: 22.48, TCS1: 19.82,
    BCP1: 18.35, FUN1: 16.07, FCP1: 14.22, FCC1: 12.88, PTZ3: 11.54,
  };
  const DONUT_CATEGORY_COLORS = {
    Equipment: '#002855', Operation: '#2563eb', Changeover: '#0ea5e9', Sanitation: '#14b8a6',
    Materials: '#eab308', 'No Event': '#f97066', Facilities: '#22c55e', Personnel: '#a78bfa', Warehouse: '#9ca3af',
  };
  const LINE_TREND_OVERRIDES = {
    BRIDGEVIEW: [22, 26, 28, 30, 32, 34, 36, 38, 42, 40],
    ARLINGTON: [8, 10, 12, 11, 9, 13, 12, 14, 11, 10],
    BELOIT: [5, 6, 7, 8, 6, 7, 8, 7, 6, 5],
    ABERDEEN: [4, 5, 6, 5, 4, 6, 7, 5, 6, 4],
    BROOKHOLLOW: [2, 2.2, 2.1, 2.3, 2, 2.2, 2.1, 2.3, 2, 2.1],
    CAMBRIDGE: [3, 3.5, 4, 3.8, 3.2, 3.6, 4.2, 3.4, 3.1, 3],
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
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const DAY_LABELS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const REASONS = ['No Event','Unplanned Sanitation','Insufficient Qualified St','Equipment Failure','Material Shortage','Changeover Delay','Operator Error','Utility Outage'];
  const REASON_HOURS = [6241.25, 3107.66, 2890, 2100, 1850, 1200, 980, 650];
  const TREND_DATA = [9.2, 8.8, 9.5, 10.1, 9.8, 10.4, 10.8, 10.2, 10.6];

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

  const state = {
    page: 'kpi-overview',
    kpiTab: 'overview',
    filters: {},
    charts: {},
    expandedNav: 'kpi-overview',
    compareMode: false,
    compareContext: null,
    compareCategory: null,
    compareLine: null,
    detailCategory: null,
    expandedHeatmapSites: { ABERDEEN: true },
    expandedLineSites: { ABERDEEN: true },
    topSitesCount: 5,
    lineTrendFilter: 'all',
  };

  document.addEventListener('DOMContentLoaded', () => {
    buildSidebar();
    initFilters();
    initSidebarToggle();
    initCompare();
    renderKpiContent();
    switchPage('kpi-overview', true);
    switchKpiTab('overview', true);
    document.addEventListener('click', closeSlicersOnOutsideClick);
  });

  /* ── Site/category data helpers ── */
  function activeSite() {
    return state.filters.site === 'All' ? 'ABERDEEN' : state.filters.site;
  }

  function categoryValuesForSite(site, category) {
    const mult = SITE_MULTIPLIERS[site] || 1;
    return (CATEGORY_BASE[category] || []).map(v => +(v * mult).toFixed(2));
  }

  function periodBaseTotals() {
    return PERIODS.map((_, i) => CATEGORIES.reduce((a, c) => a + (CATEGORY_BASE[c][i] || 0), 0));
  }

  function sitePeriodTotals(site) {
    if (SITE_PERIOD_OVERRIDES[site]) return [...SITE_PERIOD_OVERRIDES[site]];
    const total = SITE_DT_TOTALS[site] || 5;
    const weights = [1.08, 1.02, 0.98, 0.94, 1.05, 1.1, 1.12, 0.92, 0.96, 1.0];
    const wSum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => +(total * w / wSum * 0.42).toFixed(2));
  }

  function categoryValuesForSiteHeatmap(site, category) {
    const sitePeriods = sitePeriodTotals(site);
    const base = CATEGORY_BASE[category] || [];
    const baseSum = periodBaseTotals();
    return PERIODS.map((_, i) => {
      if (sitePeriods[i] == null) return null;
      const ratio = (base[i] || 0) / (baseSum[i] || 1);
      return +(sitePeriods[i] * ratio).toFixed(2);
    });
  }

  function avgOf(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function sumOf(arr) { return arr.reduce((a, b) => a + (b || 0), 0); }

  function fmtPct(v) { return v.toFixed(2) + '%'; }

  function exportBtnHTML(id, title = 'Export data') {
    return `<button type="button" class="export-btn" id="${id}" title="${title}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      Export
    </button>`;
  }

  function downloadCSV(filename, rows) {
    const csv = rows.map(row => row.map(cell => {
      const s = String(cell ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportHeatmapCategoryCSV(filename = 'unplanned-dt-by-category.csv') {
    const headers = ['Site', 'Category', ...PERIODS.map(p => `2026 ${p}`), '2026 Total', 'Total'];
    const rows = [headers];
    HEATMAP_SITES.forEach(site => {
      const sitePeriods = sitePeriodTotals(site);
      const siteTotal = +sumOf(sitePeriods).toFixed(2);
      const sitePrevTotal = +(siteTotal * 1.08).toFixed(2);
      rows.push([site, '', ...sitePeriods, siteTotal, sitePrevTotal]);
      CATEGORIES.forEach(cat => {
        const vals = categoryValuesForSiteHeatmap(site, cat);
        const total = +sumOf(vals).toFixed(2);
        rows.push([site, cat, ...vals, total, +(total * 1.08).toFixed(2)]);
      });
      rows.push([site, 'Total', ...sitePeriods, siteTotal, sitePrevTotal]);
    });
    downloadCSV(filename, rows);
  }

  function exportLineHeatmapCSV(filename = 'unplanned-dt-by-line.csv') {
    const headers = ['Site', 'Line', ...PERIODS.map(p => `2026 ${p}`), '2026 Total', 'Total'];
    const rows = [headers];
    HEATMAP_SITES.forEach(site => {
      const sitePeriods = linePeriodTotalsForSite(site);
      const siteTotal = +sumOf(sitePeriods).toFixed(2);
      const sitePrevTotal = +(siteTotal * 1.08).toFixed(2);
      rows.push([site, '', ...sitePeriods, siteTotal, sitePrevTotal]);
      LINES.forEach(line => {
        const vals = lineValuesForSite(site, line);
        const total = +sumOf(vals).toFixed(2);
        rows.push([site, line, ...vals, total, +(total * 1.08).toFixed(2)]);
      });
      rows.push([site, 'Site Total', ...sitePeriods, siteTotal, sitePrevTotal]);
    });
    downloadCSV(filename, rows);
  }

  function bindExportButtons() {
    const exports = {
      'export-overview-category': () => exportHeatmapCategoryCSV('overview-unplanned-dt-by-category.csv'),
      'export-heatmap-category': () => exportHeatmapCategoryCSV('unplanned-dt-by-category.csv'),
      'export-overview-line': () => exportLineHeatmapCSV('overview-unplanned-dt-by-line.csv'),
      'line-export-btn': () => exportLineHeatmapCSV('unplanned-dt-by-line.csv'),
    };
    Object.entries(exports).forEach(([id, fn]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.replaceWith(btn.cloneNode(true));
      document.getElementById(id)?.addEventListener('click', fn);
    });
  }

  function heatStyle(value, max = 8, isTotalCol = false) {
    if (value == null || Number.isNaN(value)) return { bg: '#ffffff', color: '#9ca3af' };
    if (value <= 0.05) return { bg: '#ffffff', color: '#1a2b4a' };
    const t = Math.min(1, Math.max(0, value / max));
    const intensity = isTotalCol ? Math.min(1, t * 1.08) : t;

    const stops = [
      [255, 255, 255],
      [255, 244, 240],
      [255, 228, 220],
      [255, 200, 188],
      [255, 168, 150],
      [255, 130, 110],
      [255, 100, 88],
      [244, 76, 66],
    ];
    const idx = intensity * (stops.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, stops.length - 1);
    const f = idx - lo;
    const r = Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * f);
    const g = Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * f);
    const b = Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * f);
    return { bg: `rgb(${r},${g},${b})`, color: '#1a2b4a' };
  }

  function heatTd(value, max = 8, extraClass = '') {
    if (value == null || value === '-') return `<td class="heat-cell heat-empty ${extraClass}">-</td>`;
    const isTotalCol = extraClass.includes('col-total');
    const style = heatStyle(value, max, isTotalCol);
    return `<td class="heat-cell ${extraClass}" style="background:${style.bg};color:${style.color}">${fmtPct(value)}</td>`;
  }

  function heatmapLegendHTML(compact = false) {
    return `<div class="heatmap-legend${compact ? ' compact' : ''}">
      <span class="legend-label">Lower DT %</span>
      <div class="legend-bar"></div>
      <span class="legend-label">Higher DT %</span>
    </div>`;
  }

  function valClass(v) {
    if (v >= 5) return 'val-high';
    if (v >= 2.5) return 'val-mid';
    return 'val-low';
  }

  /* ── Sidebar ── */
  function buildSidebar() {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;
    nav.innerHTML = '';

    PAGES.forEach(page => {
      const group = document.createElement('div');
      group.className = 'sidenav-group' + (page.children ? ' has-children' : '');
      group.dataset.page = page.id;

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

      header.addEventListener('click', () => onSidebarHeaderClick(page, group));
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
            collapseAllExcept(page.id);
            state.expandedNav = page.id;
            switchPage(page.id, true);
            switchKpiTab(child.id);
          });
          children.appendChild(btn);
        });
        group.appendChild(children);
      }

      nav.appendChild(group);
    });
    updateSidebarUI();
  }

  function onSidebarHeaderClick(page, group) {
    collapseAllExcept(null);
    if (page.children) {
      const opening = state.expandedNav !== page.id;
      state.expandedNav = opening ? page.id : null;
      switchPage(page.id);
    } else {
      state.expandedNav = null;
      switchPage(page.id);
    }
  }

  function collapseAllExcept(pageId) {
    document.querySelectorAll('.sidenav-group').forEach(g => {
      g.classList.toggle('expanded', g.dataset.page === pageId && pageId !== null);
    });
  }

  function updateSidebarUI() {
    document.querySelectorAll('.sidenav-group').forEach(g => {
      const pid = g.dataset.page;
      g.classList.toggle('active', pid === state.page);
      g.classList.toggle('expanded', pid === state.expandedNav);
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
      setTimeout(() => { el.textContent = crumb; el.style.opacity = '1'; }, 120);
    }
  }

  function initSidebarToggle() {
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('open');
    });
  }

  /* ── Compare & inline detail panels ── */
  function initCompare() {
    bindCompareButtons();
  }

  function bindCompareButtons() {
    document.querySelectorAll('.compare-btn-card').forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll('.compare-btn-card').forEach(btn => {
      btn.addEventListener('click', () => toggleCompareMode(btn));
    });
  }

  function toggleCompareMode(btn) {
    const cardId = btn.dataset.compareCard || 'category';
    const wasActive = btn.classList.contains('active');

    document.querySelectorAll('.compare-btn-card').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.compare-hint').forEach(h => h.remove());
    closeInlinePanel();

    if (wasActive) {
      state.compareMode = false;
      state.compareContext = null;
    } else {
      state.compareMode = true;
      state.compareContext = cardId;
      btn.classList.add('active');
      addCompareHint(btn, cardId);
    }
    refreshAllTables();
  }

  function addCompareHint(btn, cardId) {
    const cardBody = btn.closest('.data-card')?.querySelector('.data-card-body');
    if (!cardBody) return;
    const hint = document.createElement('div');
    hint.className = 'compare-hint';
    hint.textContent = cardId === 'line'
      ? 'Select a line to compare sites across periods.'
      : 'Select a category to compare sites across periods.';
    const tableView = cardBody.querySelector('.category-table-view, .panel-overlay-host');
    if (tableView) cardBody.insertBefore(hint, tableView);
    else cardBody.prepend(hint);
  }

  function refreshAllTables() {
    const catOverview = document.getElementById('view-category-table');
    if (catOverview) catOverview.innerHTML = buildHeatmapTable(true);
    const heatmapTab = document.getElementById('view-heatmap-table');
    if (heatmapTab) heatmapTab.innerHTML = buildHeatmapTable(false);
    const lineEl = document.getElementById('view-line-table');
    if (lineEl) lineEl.innerHTML = buildLineHeatmapTable(true);
    const lineTabEl = document.getElementById('view-line-tab-table');
    if (lineTabEl) lineTabEl.innerHTML = buildLineHeatmapTable(false);
    bindHeatmapTableEvents();
    bindLineHeatmapEvents();
  }

  function getOverlayHost(fromEl, cardBody) {
    return fromEl?.closest('.panel-overlay-host') || cardBody?.querySelector('.panel-overlay-host:not(.hidden-view)') || cardBody;
  }

  function mountOverlayPanel(host, panel) {
    panel.classList.add('overlay-panel');
    host.appendChild(panel);
  }

  function closeInlinePanel() {
    state.compareCategory = null;
    state.compareLine = null;
    state.detailCategory = null;
    document.querySelectorAll('#inline-panel').forEach(p => p.remove());
    destroyChart('compare-chart');
    destroyChart('detail-chart');
    document.querySelectorAll('.cat-row, .heat-cat-row, .line-detail-row').forEach(r => {
      r.classList.remove('compare-active', 'detail-active');
    });
  }

  function openComparePanel(category, anchorEl, cardBody) {
    closeInlinePanel();
    state.compareCategory = category;

    const site = activeSite();
    const compareSites = anchorEl?.classList.contains('heat-cat-row') ? HEATMAP_SITES : SITES;
    const rows = compareSites.map(s => {
      const vals = categoryValuesForSite(s, category);
      const total = avgOf(vals);
      return { site: s, vals, total, isCurrent: s === site };
    });
    const best = rows.reduce((a, b) => (a.total < b.total ? a : b));
    const worst = rows.reduce((a, b) => (a.total > b.total ? a : b));

    const panel = document.createElement('div');
    panel.id = 'inline-panel';
    panel.className = 'inline-panel';
    panel.innerHTML = `
      <div class="inline-panel-header">
        <div>
          <div class="inline-panel-title">${category} — Site Comparison</div>
          <div class="inline-panel-sub">Unplanned DT % by period · current site: ${site}</div>
        </div>
        <button type="button" class="inline-panel-close" aria-label="Close">&times;</button>
      </div>
      <div class="inline-panel-body overlay-panel-body">
        <div class="compare-chart-wrap"><canvas id="compare-chart"></canvas></div>
        <div class="table-scroll">
          <table class="data-table compare-table">
            <thead><tr>
              <th>Site</th>
              ${PERIODS.map(p => `<th>2026 ${p}</th>`).join('')}
              <th>Avg</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => {
                const cls = r.site === best.site ? 'site-best' : r.site === worst.site ? 'site-worst' : '';
                return `<tr class="${cls}${r.isCurrent ? ' selected' : ''}">
                  <td>${r.site}${r.isCurrent ? ' ★' : ''}</td>
                  ${r.vals.map(v => heatTd(v, 8).replace('class="heat-cell"', 'class="heat-cell compare-cell"')).join('')}
                  ${heatTd(r.total, 12, 'col-total compare-cell')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    mountOverlayPanel(getOverlayHost(anchorEl, cardBody), panel);
    anchorEl?.classList.add('compare-active');

    panel.querySelector('.inline-panel-close').addEventListener('click', () => {
      closeInlinePanel();
    });

    requestAnimationFrame(() => {
      destroyChart('compare-chart');
      const canvas = document.getElementById('compare-chart');
      if (!canvas || typeof Chart === 'undefined') return;
      state.charts['compare-chart'] = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: compareSites,
          datasets: PERIODS.map((p, i) => ({
            label: p,
            data: rows.map(r => r.vals[i]),
            backgroundColor: PERIOD_COLORS[i],
            borderRadius: { topLeft: 3, topRight: 3 },
            borderSkipped: false,
          })),
        },
        options: {
          ...CHART_DEFAULTS,
          plugins: { ...CHART_DEFAULTS.plugins, legend: { ...CHART_DEFAULTS.plugins.legend, position: 'bottom' } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,40,85,0.06)' }, ticks: { callback: v => v + '%' } },
            x: { grid: { display: false }, ticks: HORIZONTAL_X_TICKS },
          },
        },
      });
    });
  }

  function openLineComparePanel(line, anchorEl, cardBody) {
    closeInlinePanel();
    state.compareLine = line;

    const site = activeSite();
    const rows = HEATMAP_SITES.map(s => {
      const vals = lineValuesForSite(s, line);
      const total = avgOf(vals);
      return { site: s, vals, total, isCurrent: s === site };
    });
    const best = rows.reduce((a, b) => (a.total < b.total ? a : b));
    const worst = rows.reduce((a, b) => (a.total > b.total ? a : b));

    const panel = document.createElement('div');
    panel.id = 'inline-panel';
    panel.className = 'inline-panel';
    panel.innerHTML = `
      <div class="inline-panel-header">
        <div>
          <div class="inline-panel-title">${line} — Site Comparison</div>
          <div class="inline-panel-sub">Unplanned DT % by period · current site: ${site}</div>
        </div>
        <button type="button" class="inline-panel-close" aria-label="Close">&times;</button>
      </div>
      <div class="inline-panel-body overlay-panel-body">
        <div class="compare-chart-wrap"><canvas id="compare-chart"></canvas></div>
        <div class="table-scroll">
          <table class="data-table compare-table">
            <thead><tr>
              <th>Site</th>
              ${PERIODS.map(p => `<th>2026 ${p}</th>`).join('')}
              <th>Avg</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => {
                const cls = r.site === best.site ? 'site-best' : r.site === worst.site ? 'site-worst' : '';
                return `<tr class="${cls}${r.isCurrent ? ' selected' : ''}">
                  <td>${r.site}${r.isCurrent ? ' ★' : ''}</td>
                  ${r.vals.map(v => heatTd(v, 14).replace('class="heat-cell"', 'class="heat-cell compare-cell"')).join('')}
                  ${heatTd(r.total, 14, 'col-total compare-cell')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    mountOverlayPanel(getOverlayHost(anchorEl, cardBody), panel);
    anchorEl?.classList.add('compare-active');

    panel.querySelector('.inline-panel-close').addEventListener('click', () => {
      closeInlinePanel();
    });

    requestAnimationFrame(() => {
      destroyChart('compare-chart');
      const canvas = document.getElementById('compare-chart');
      if (!canvas || typeof Chart === 'undefined') return;
      state.charts['compare-chart'] = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: HEATMAP_SITES,
          datasets: PERIODS.map((p, i) => ({
            label: p,
            data: rows.map(r => r.vals[i]),
            backgroundColor: PERIOD_COLORS[i],
            borderRadius: { topLeft: 3, topRight: 3 },
            borderSkipped: false,
          })),
        },
        options: {
          ...CHART_DEFAULTS,
          plugins: { ...CHART_DEFAULTS.plugins, legend: { ...CHART_DEFAULTS.plugins.legend, position: 'bottom' } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,40,85,0.06)' }, ticks: { callback: v => v + '%' } },
            x: { grid: { display: false }, ticks: HORIZONTAL_X_TICKS },
          },
        },
      });
    });
  }

  function openCategoryDetailPanel(category, overlayHost) {
    closeInlinePanel();
    state.detailCategory = category;

    const site = activeSite();
    const vals = categoryValuesForSite(site, category);
    const avg = avgOf(vals);
    const peak = Math.max(...vals);
    const peakIdx = vals.indexOf(peak);

    const panel = document.createElement('div');
    panel.id = 'inline-panel';
    panel.className = 'inline-panel';
    panel.innerHTML = `
      <div class="inline-panel-header">
        <div>
          <div class="inline-panel-title">Detailed View — ${category}</div>
          <div class="inline-panel-sub">${site} · period breakdown</div>
        </div>
        <button type="button" class="inline-panel-close" aria-label="Close">&times;</button>
      </div>
      <div class="inline-panel-body overlay-panel-body">
        <div class="inline-detail-grid">
          <div class="compare-chart-wrap"><canvas id="detail-chart"></canvas></div>
          <div class="category-detail-stats">
            <div class="detail-stat"><div class="detail-stat-label">Average DT %</div><div class="detail-stat-value">${fmtPct(avg)}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Peak Period</div><div class="detail-stat-value">${PERIODS[peakIdx]} · ${fmtPct(peak)}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">vs 5% Target</div><div class="detail-stat-value ${avg >= 5 ? 'val-high' : 'val-low'}">${avg >= 5 ? 'Above target' : 'Below target'}</div></div>
          </div>
        </div>
        <div class="table-scroll" style="margin-top:16px">
          <table class="data-table compare-table heatmap-table">
            <thead><tr><th>Metric</th>${PERIODS.map(p => `<th>2026 ${p}</th>`).join('')}<th>Avg</th></tr></thead>
            <tbody><tr>
              <td>Unplanned DT %</td>
              ${vals.map(v => heatTd(v, 8)).join('')}
              ${heatTd(avg, 12, 'col-total')}
            </tr></tbody>
          </table>
        </div>
      </div>`;

    mountOverlayPanel(overlayHost, panel);
    panel.querySelector('.inline-panel-close').addEventListener('click', closeInlinePanel);

    requestAnimationFrame(() => {
      destroyChart('detail-chart');
      const canvas = document.getElementById('detail-chart');
      if (!canvas || typeof Chart === 'undefined') return;
      state.charts['detail-chart'] = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: PERIODS,
          datasets: [{
            label: `${category} DT %`,
            data: vals,
            backgroundColor: PERIOD_COLORS,
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: false,
          }],
        },
        options: {
          ...CHART_DEFAULTS,
          plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ...PRO_AXIS, ticks: { ...PRO_AXIS.ticks, callback: v => v + '%' } },
            x: { ...PRO_AXIS },
          },
        },
      });
    });
  }

  function openLineDetailPanel(line, overlayHost) {
    closeInlinePanel();
    state.detailCategory = line;

    const site = activeSite();
    const vals = lineValuesForSite(site, line);
    const avg = avgOf(vals);
    const peak = Math.max(...vals);
    const peakIdx = vals.indexOf(peak);

    const panel = document.createElement('div');
    panel.id = 'inline-panel';
    panel.className = 'inline-panel';
    panel.innerHTML = `
      <div class="inline-panel-header">
        <div>
          <div class="inline-panel-title">Detailed View — ${line}</div>
          <div class="inline-panel-sub">${site} · line period breakdown</div>
        </div>
        <button type="button" class="inline-panel-close" aria-label="Close">&times;</button>
      </div>
      <div class="inline-panel-body overlay-panel-body">
        <div class="inline-detail-grid">
          <div class="compare-chart-wrap"><canvas id="detail-chart"></canvas></div>
          <div class="category-detail-stats">
            <div class="detail-stat"><div class="detail-stat-label">Average DT %</div><div class="detail-stat-value">${fmtPct(avg)}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Peak Period</div><div class="detail-stat-value">${PERIODS[peakIdx]} · ${fmtPct(peak)}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">vs 5% Target</div><div class="detail-stat-value ${avg >= 5 ? 'val-high' : 'val-low'}">${avg >= 5 ? 'Above target' : 'Below target'}</div></div>
          </div>
        </div>
        <div class="table-scroll" style="margin-top:16px">
          <table class="data-table compare-table heatmap-table">
            <thead><tr><th>Metric</th>${PERIODS.map(p => `<th>2026 ${p}</th>`).join('')}<th>Avg</th></tr></thead>
            <tbody><tr>
              <td>Unplanned DT %</td>
              ${vals.map(v => heatTd(v, 14)).join('')}
              ${heatTd(avg, 14, 'col-total')}
            </tr></tbody>
          </table>
        </div>
      </div>`;

    mountOverlayPanel(overlayHost, panel);
    panel.querySelector('.inline-panel-close').addEventListener('click', closeInlinePanel);

    requestAnimationFrame(() => {
      destroyChart('detail-chart');
      const canvas = document.getElementById('detail-chart');
      if (!canvas || typeof Chart === 'undefined') return;
      state.charts['detail-chart'] = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: PERIODS,
          datasets: [{
            label: `${line} DT %`,
            data: vals,
            backgroundColor: PERIOD_COLORS,
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: false,
          }],
        },
        options: {
          ...CHART_DEFAULTS,
          plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
          scales: {
            y: { beginAtZero: true, max: 14, ...PRO_AXIS, ticks: { ...PRO_AXIS.ticks, callback: v => v + '%' } },
            x: { ...PRO_AXIS },
          },
        },
      });
    });
  }

  /* ── Filters ── */
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
      search.addEventListener('input', () => renderSlicerOptions(wrap, cfg, search.value));
      searchWrap.appendChild(search);
      panel.appendChild(searchWrap);
    }
    panel.appendChild(document.createElement('div')).className = 'slicer-options';
    wrap.appendChild(trigger);
    wrap.appendChild(panel);
    renderSlicerOptions(wrap, cfg);
    return wrap;
  }

  function formatFilterDisplay(cfg) {
    const val = state.filters[cfg.id];
    if (cfg.multi) {
      if (!val.length) return 'All';
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
          closeInlinePanel();
          state.compareMode = false;
          state.compareContext = null;
          document.querySelectorAll('.compare-btn-card.active').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.compare-hint').forEach(h => h.remove());
          refreshAllTables();
        }
        refreshSlicer(wrap, cfg);
      });
      optionsEl.appendChild(row);
    });
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

  function closeAllSlicers() { document.querySelectorAll('.slicer.open').forEach(s => s.classList.remove('open')); }
  function closeSlicersOnOutsideClick(e) { if (!e.target.closest('.slicer')) closeAllSlicers(); }

  /* ── Navigation ── */
  function switchPage(pageId, instant) {
    if (pageId === state.page && !instant) return;
    const current = document.querySelector('.page-panel.active');
    const next = document.getElementById(`page-${pageId}`);

    if (pageId !== 'kpi-overview') state.expandedNav = null;

    const run = () => {
      document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active', 'leaving'));
      next?.classList.add('active');
      state.page = pageId;
      updateSidebarUI();
      if (pageId === 'kpi-overview') requestAnimationFrame(() => refreshChartsForTab(state.kpiTab));
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
    state.expandedNav = 'kpi-overview';
    updateSidebarUI();
    requestAnimationFrame(() => refreshChartsForTab(tabId));
  }

  function refreshChartsForTab(tabId) {
    if (tabId === 'overview') initOverviewCharts();
    else initTabCharts(tabId);
  }

  /* ── Content builders ── */
  function metricStripHTML() {
    return `<div class="metric-strip">
      <div class="metric-card"><div class="metric-label">Unplanned DT %</div><div class="metric-value">6.24%</div><div class="metric-delta up">↑ 1.24pp vs target (5%)</div></div>
      <div class="metric-card"><div class="metric-label">Waste %</div><div class="metric-value">3.02%</div><div class="metric-delta down">↓ 0.18pp vs prior week</div></div>
      <div class="metric-card"><div class="metric-label">STOPS</div><div class="metric-value">819</div><div class="metric-delta down">↓ 2,451 vs prior week</div></div>
      <div class="metric-card"><div class="metric-label">OEE</div><div class="metric-value">78.4%</div><div class="metric-delta neutral">1.6pp below 80% target</div></div>
    </div>`;
  }

  function aiSummaryHTML() {
    return `<div class="ai-summary"><div class="ai-summary-icon">✦</div><div>
      <div class="ai-summary-label">AI Summary</div>
      <p class="ai-summary-text">Overall unplanned downtime shows variation across sites, lines, categories, days, and periods. Equipment and Changeover categories drive the largest share at Aberdeen, with BCP1 and SUN1 lines contributing disproportionately. Latest periods (P8–P10) show an upward trend — prioritize Mechanical failure root causes and Shift B handover gaps.</p>
    </div></div>`;
  }

  function categoryTabSummaryHTML() {
    return `<div class="ai-summary"><div class="ai-summary-icon">✦</div><div>
      <div class="ai-summary-label">AI Summary</div>
      <p class="ai-summary-text">Unplanned downtime is primarily driven by a few key categories and sites. Equipment and Operation categories contribute the largest share across the network, while Bridgeview and Brookhollow lead site-level totals. Periods P8–P10 show elevated Equipment downtime — prioritize mechanical failure root causes and cross-site benchmarking for Changeover and Sanitation categories.</p>
    </div></div>`;
  }

  function lineTabSummaryHTML() {
    return `<div class="ai-summary"><div class="ai-summary-icon">✦</div><div>
      <div class="ai-summary-label">AI Summary</div>
      <p class="ai-summary-text">Line-level downtime is concentrated in a few high-impact line/category combinations. TCS1 and SUN1 at Aberdeen drive disproportionate share, while Bridgeview site totals remain elevated across periods. Prioritize mechanical failures on top lines and standardize changeover procedures across HP17T1 and FLK17T1 performers.</p>
    </div></div>`;
  }

  function lineValuesForSite(site, line) {
    const mult = SITE_MULTIPLIERS[site] || 1;
    return (LINE_BASE[line] || []).map(v => +(v * mult * 0.95).toFixed(2));
  }

  function linePeriodTotalsForSite(site) {
    return PERIODS.map((_, i) => {
      const sum = LINES.reduce((a, l) => a + lineValuesForSite(site, l)[i], 0);
      return +sum.toFixed(2);
    });
  }

  function buildLineHeatmapTable(showLegend = true) {
    const compareReady = state.compareMode && state.compareContext === 'line' ? ' compare-ready' : '';
    let rows = '';

    HEATMAP_SITES.forEach(site => {
      const expanded = !!state.expandedLineSites[site];
      const sitePeriods = linePeriodTotalsForSite(site);
      const siteTotal = +sumOf(sitePeriods).toFixed(2);
      const sitePrevTotal = +(siteTotal * 1.08).toFixed(2);
      const chevron = expanded ? '▼' : '▶';

      rows += `<tr class="site-row${expanded ? ' expanded' : ''}" data-site="${site}">
        <td class="site-name-cell">
          <button type="button" class="line-site-toggle" data-site="${site}" aria-label="Toggle ${site}">${chevron}</button>
          <span>${site}</span>
        </td>
        <td class="cat-label-cell"></td>
        ${sitePeriods.map(v => heatTd(v, 35)).join('')}
        ${heatTd(siteTotal, 35, 'col-total')}
        ${heatTd(sitePrevTotal, 35, 'col-total')}
      </tr>`;

      if (expanded) {
        LINES.forEach(line => {
          const vals = lineValuesForSite(site, line);
          const total = sumOf(vals);
          const activeCompare = state.compareLine === line ? ' compare-active' : '';
          rows += `<tr class="line-detail-row${compareReady}${activeCompare}" data-line="${line}">
            <td class="site-name-cell indent"></td>
            <td class="cat-label-cell">${line}</td>
            ${vals.map(v => heatTd(v, 14)).join('')}
            ${heatTd(total, 14, 'col-total')}
            ${heatTd(total * 1.08, 14, 'col-total')}
          </tr>`;
        });

        rows += `<tr class="row-total heat-site-total">
          <td class="site-name-cell indent"></td>
          <td class="cat-label-cell">Site Total</td>
          ${sitePeriods.map(v => heatTd(v, 35)).join('')}
          ${heatTd(siteTotal, 35, 'col-total')}
          ${heatTd(sitePrevTotal, 35, 'col-total')}
        </tr>`;
      }
    });

    return `<div class="table-scroll heatmap-scroll">${showLegend ? heatmapLegendHTML(true) : ''}<table class="data-table heatmap-table"><thead>
      <tr class="header-group"><th rowspan="2">Site</th><th rowspan="2">Line</th>
        <th colspan="10">2026</th><th colspan="2">Total</th></tr>
      <tr>${PERIODS.map(p => `<th>${p}</th>`).join('')}<th>2026 Total</th><th>Total</th></tr>
      </thead><tbody>${rows}</tbody></table></div>`;
  }

  function lineHeatmapCardHTML() {
    return `<div class="data-card heatmap-card">
      <div class="data-card-header heatmap-header">
        <div class="heatmap-header-left">
          <span class="data-card-title">Unplanned DT % by Line/Category</span>
          <span class="chart-card-sub">Percentage of unplanned downtime across periods (YTD)</span>
          <div class="status-badges">
            <span class="status-badge">ACTIVE LINES <strong>${Object.keys(TOP_LINE_DT).length} Lines</strong></span>
            <span class="status-badge accent">OVERALL DT AVG <strong>10.61%</strong></span>
          </div>
        </div>
        <div class="heatmap-header-right">
          <select class="chart-select" id="line-view-select" aria-label="View mode">
            <option value="percentage">Percentage</option>
            <option value="hours">Hours</option>
          </select>
          <div class="heatmap-legend">
            <span class="legend-label">Lower DT %</span>
            <div class="legend-bar"></div>
            <span class="legend-label">Higher DT %</span>
          </div>
          <div class="card-header-actions">
            ${exportBtnHTML('line-export-btn')}
            <button type="button" class="compare-btn-card" data-compare-card="line" title="Compare sites by line">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
              Compare Sites
            </button>
          </div>
        </div>
      </div>
      <div class="data-card-body">
        <div id="view-line-tab-table" class="panel-overlay-host">${buildLineHeatmapTable(false)}</div>
      </div>
    </div>`;
  }

  function bindLineHeatmapEvents() {
    document.querySelectorAll('.line-site-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const site = btn.dataset.site;
        state.expandedLineSites[site] = !state.expandedLineSites[site];
        refreshAllTables();
      });
    });
    document.querySelectorAll('.line-detail-row').forEach(row => {
      row.addEventListener('click', () => {
        if (!state.compareMode || state.compareContext !== 'line') return;
        const line = row.dataset.line;
        if (!line) return;
        const cardBody = row.closest('.data-card-body');
        if (cardBody) openLineComparePanel(line, row, cardBody);
      });
    });
  }

  function buildHeatmapTable(showLegend = true) {
    const compareReady = state.compareMode && state.compareContext !== 'line' ? ' compare-ready' : '';
    let rows = '';

    HEATMAP_SITES.forEach(site => {
      const expanded = !!state.expandedHeatmapSites[site];
      const sitePeriods = sitePeriodTotals(site);
      const siteTotal = +sumOf(sitePeriods).toFixed(2);
      const sitePrevTotal = +(siteTotal * 1.08).toFixed(2);
      const chevron = expanded ? '▼' : '▶';

      rows += `<tr class="site-row${expanded ? ' expanded' : ''}" data-site="${site}">
        <td class="site-name-cell">
          <button type="button" class="site-toggle" data-site="${site}" aria-label="Toggle ${site}">${chevron}</button>
          <span>${site}</span>
        </td>
        <td class="cat-label-cell"></td>
        ${sitePeriods.map(v => heatTd(v, 35)).join('')}
        ${heatTd(siteTotal, 35, 'col-total')}
        ${heatTd(sitePrevTotal, 35, 'col-total')}
      </tr>`;

      if (expanded) {
        CATEGORIES.forEach(cat => {
          const vals = categoryValuesForSiteHeatmap(site, cat);
          const total = sumOf(vals);
          const prevTotal = total * 1.08;
          const activeCompare = state.compareCategory === cat ? ' compare-active' : '';
          const activeDetail = state.detailCategory === cat ? ' detail-active' : '';
          rows += `<tr class="cat-row heat-cat-row${compareReady}${activeCompare}${activeDetail}" data-category="${cat}" data-site="${site}">
            <td class="site-name-cell indent"></td>
            <td class="cat-label-cell">${cat}</td>
            ${vals.map(v => heatTd(v, 8)).join('')}
            ${heatTd(total, 12, 'col-total')}
            ${heatTd(prevTotal, 12, 'col-total')}
          </tr>`;
        });

        const totals = PERIODS.map((_, i) => sitePeriods[i]);
        rows += `<tr class="row-total heat-site-total">
          <td class="site-name-cell indent"></td>
          <td class="cat-label-cell">Total</td>
          ${totals.map(v => heatTd(v, 35)).join('')}
          ${heatTd(siteTotal, 35, 'col-total')}
          ${heatTd(sitePrevTotal, 35, 'col-total')}
        </tr>`;
      }
    });

    return `<div class="table-scroll heatmap-scroll">${showLegend ? heatmapLegendHTML(true) : ''}<table class="data-table heatmap-table"><thead>
      <tr class="header-group"><th rowspan="2">Site</th><th rowspan="2">Year / Category</th>
        <th colspan="10">2026</th><th colspan="2">Total</th></tr>
      <tr>${PERIODS.map(p => `<th>${p}</th>`).join('')}<th>2026 Total</th><th>Total</th></tr>
      </thead><tbody>${rows}</tbody></table></div>`;
  }

  function bindHeatmapTableEvents() {
    document.querySelectorAll('.site-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const site = btn.dataset.site;
        state.expandedHeatmapSites[site] = !state.expandedHeatmapSites[site];
        refreshAllTables();
      });
    });
    document.querySelectorAll('.heat-cat-row').forEach(row => {
      row.addEventListener('click', () => {
        if (!state.compareMode || state.compareContext === 'line') return;
        const category = row.dataset.category;
        const cardBody = row.closest('.data-card-body');
        if (cardBody) openComparePanel(category, row, cardBody);
      });
    });
  }

  function heatmapCardHTML() {
    return `<div class="data-card heatmap-card">
      <div class="data-card-header heatmap-header">
        <div class="heatmap-header-left">
          <span class="data-card-title">Unplanned Downtime Heatmap</span>
          <div class="status-badges">
            <span class="status-badge">ACTIVE SITES <strong>${HEATMAP_SITES.length} Sites</strong></span>
            <span class="status-badge accent">OVERALL DT AVG <strong>5.08%</strong></span>
          </div>
        </div>
        <div class="heatmap-header-right">
          <div class="heatmap-legend">
            <span class="legend-label">Lower DT %</span>
            <div class="legend-bar"></div>
            <span class="legend-label">Higher DT %</span>
          </div>
          ${categoryCardActions('heatmap', false, 'export-heatmap-category')}
        </div>
      </div>
      <div class="data-card-body">
        <div id="view-heatmap-table" class="panel-overlay-host category-table-view">${buildHeatmapTable(false)}</div>
      </div>
    </div>`;
  }

  function bindCategoryTableEvents() {
    document.querySelectorAll('.cat-row:not(.heat-cat-row)').forEach(row => {
      row.addEventListener('click', () => {
        if (!state.compareMode || state.compareContext === 'line') return;
        const category = row.dataset.category;
        const cardBody = row.closest('.data-card-body');
        if (cardBody) openComparePanel(category, row, cardBody);
      });
    });
  }

  function refreshCategoryTable() {
    refreshAllTables();
  }

  function categoryCardActions(cardId, includeToggle, exportId = null, compareType = 'category') {
    const exportBtn = exportId ? exportBtnHTML(exportId) : '';
    const compareBtn = `<button type="button" class="compare-btn-card"${cardId ? ` data-compare-card="${compareType === 'line' ? 'line' : cardId === 'heatmap' ? 'heatmap' : 'category'}"` : ''} title="${compareType === 'line' ? 'Compare sites by line' : 'Compare sites by category'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
        Compare Sites
      </button>`;
    const toggle = includeToggle ? `<div class="view-toggle">
        <button type="button" class="view-toggle-btn active" data-view="table" data-card="${cardId}" title="Table"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></button>
        <button type="button" class="view-toggle-btn" data-view="chart" data-card="${cardId}" title="Chart"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 16l4-8 4 5 5-9"/></svg></button>
      </div>` : '';
    return `<div class="card-header-actions">${exportBtn}${compareBtn}${toggle}</div>`;
  }

  function dataCard(title, body, toggleId, compareCard = false, exportId = null, compareType = 'category') {
    const actions = (compareCard || toggleId)
      ? (compareCard ? categoryCardActions(toggleId, !!toggleId, exportId, compareType) : `<div class="card-header-actions">${exportId ? exportBtnHTML(exportId) : ''}<div class="view-toggle">
          <button type="button" class="view-toggle-btn active" data-view="table" data-card="${toggleId}" title="Table"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></button>
          <button type="button" class="view-toggle-btn" data-view="chart" data-card="${toggleId}" title="Chart"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 16l4-8 4 5 5-9"/></svg></button>
        </div></div>`)
      : '';
    return `<div class="data-card"><div class="data-card-header"><span class="data-card-title">${title}</span>${actions}</div><div class="data-card-body">${body}</div></div>`;
  }

  function renderKpiContent() {
    const overview = document.getElementById('kpi-tab-overview');
    if (!overview) return;

    overview.innerHTML = `
      ${metricStripHTML()}${aiSummaryHTML()}
      ${dataCard('Unplanned DT % by Category',
        `<div id="view-category-table" class="panel-overlay-host category-table-view">${buildHeatmapTable(true)}</div>
         <div id="view-category-chart" class="hidden-view panel-overlay-host"><div class="chart-wrap chart-wrap-pro"><canvas id="chart-category"></canvas></div></div>`, 'category', true, 'export-overview-category')}
      ${dataCard('Unplanned DT % by Line/Category',
        `<div id="view-line-table" class="panel-overlay-host">${buildLineHeatmapTable()}</div>
         <div id="view-line-chart" class="hidden-view panel-overlay-host"><div class="chart-wrap tall chart-wrap-pro"><canvas id="chart-line"></canvas></div></div>`, 'line', true, 'export-overview-line', 'line')}
      <div class="overview-grid-3">
        ${dataCard('Unplanned DT % by Day of Week', '<div class="chart-wrap short"><canvas id="chart-dow"></canvas></div>')}
        ${dataCard('Unplanned DT Hours by Reason', '<div class="chart-wrap short"><canvas id="chart-reason"></canvas></div>')}
        ${dataCard('Unplanned DT % by Period Trend', '<div class="chart-wrap short"><canvas id="chart-trend"></canvas></div>')}
      </div>`;

    bindCompareButtons();
    bindExportButtons();
    bindHeatmapTableEvents();
    bindLineHeatmapEvents();
    ['category','line'].forEach(id => {
      document.querySelectorAll(`.view-toggle-btn[data-card="${id}"]`).forEach(btn => {
        btn.addEventListener('click', () => toggleCardView(id, btn.dataset.view));
      });
    });

    document.getElementById('kpi-tab-by-category').innerHTML = `
      ${metricStripHTML()}
      ${categoryTabSummaryHTML()}
      ${heatmapCardHTML()}
      ${chartCardWithSelect('Unplanned DT % by Period (Top Sites)', 'Trend of downtime percentage across periods for top sites.', 'chart-top-sites', 'top-sites-select', [
        { value: 5, label: 'Top 5 Sites' },
        { value: 3, label: 'Top 3 Sites' },
        { value: 8, label: 'Top 8 Sites' },
      ])}
      <div class="overview-grid-2">
        ${chartCardWithSelect('Unplanned DT % by Site', '', 'chart-cat-by-site', 'site-metric-select', [
          { value: 'total', label: 'Total DT %' },
          { value: 'avg', label: 'Avg DT %' },
        ])}
        ${chartCardWithSelect('Unplanned DT % by Category (All Sites)', 'Breakdown of downtime percentage by category', 'chart-cat-all-sites', 'cat-metric-select', [
          { value: 'total', label: 'Total DT %' },
          { value: 'avg', label: 'Avg DT %' },
        ])}
      </div>`;
    bindCategoryTableEvents();
    bindCompareButtons();
    bindExportButtons();
    bindHeatmapTableEvents();
    bindByCategoryControls();

    document.getElementById('kpi-tab-by-line').innerHTML = `
      ${metricStripHTML()}
      ${lineTabSummaryHTML()}
      <div class="overview-grid-2">
        ${chartCardWithSelect('Unplanned DT % by Line – Top 10 Lines', 'Highest unplanned downtime lines across the network.', 'chart-top-lines', 'top-lines-select', [
          { value: 10, label: 'Top 10 Lines' },
          { value: 5, label: 'Top 5 Lines' },
        ])}
        ${chartCardWithSelect('Unplanned DT % by Category (All Sites)', 'Category share of total unplanned downtime', 'chart-line-donut', 'line-donut-select', [
          { value: 'total', label: 'Total DT %' },
        ], 'donut-wrap')}
      </div>
      ${lineHeatmapCardHTML()}
      ${chartCardWithSelect('Trend of Unplanned DT %', 'Line-level downtime trend across periods by site.', 'chart-line-trend', 'line-trend-select', [
        { value: 'all', label: 'All Sites' },
        ...LINE_TREND_SITES.map(s => ({ value: s, label: s })),
      ])}`;
    bindCompareButtons();
    bindExportButtons();
    bindLineHeatmapEvents();
    bindByLineControls();
    document.getElementById('kpi-tab-by-dow').innerHTML = metricStripHTML() + aiSummaryHTML() +
      dataCard('Unplanned DT % by Day of Week', '<div class="chart-wrap tall"><canvas id="chart-tab-dow"></canvas></div>');
    document.getElementById('kpi-tab-by-reason').innerHTML = metricStripHTML() + aiSummaryHTML() +
      `<div class="overview-grid-3">
        ${dataCard('Unplanned DT Hours by Reason', '<div class="chart-wrap"><canvas id="chart-tab-reason"></canvas></div>')}
        ${dataCard('Unplanned DT % by Period Trend', '<div class="chart-wrap"><canvas id="chart-tab-trend"></canvas></div>')}
      </div>`;
  }

  function toggleCardView(cardId, view) {
    closeInlinePanel();
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
      if (cardId === 'category') {
        makeGroupedBarChart('chart-category', CATEGORIES, CATEGORY_BASE, 8, (cat, canvas) => {
          const host = canvas.closest('.panel-overlay-host');
          if (host) openCategoryDetailPanel(cat, host);
        });
      }
      if (cardId === 'line') {
        makeGroupedBarChart('chart-line', LINES, LINE_BASE, 14, (line, canvas) => {
          const host = canvas.closest('.panel-overlay-host');
          if (host) openLineDetailPanel(line, host);
        });
      }
    }
  }

  const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 900, easing: 'easeOutQuart' },
    plugins: {
      legend: {
        labels: {
          font: { family: 'Inter', size: 11, weight: '500' },
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 16,
          color: '#475569',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 40, 85, 0.94)',
        titleFont: { family: 'Inter', weight: '600', size: 12 },
        bodyFont: { family: 'Inter', size: 11 },
        padding: 14,
        cornerRadius: 10,
        displayColors: true,
        boxPadding: 6,
      },
    },
  };

  const PRO_AXIS = {
    grid: { color: 'rgba(0, 40, 85, 0.06)', drawTicks: false },
    border: { display: false },
    ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } },
  };

  function proAxisTitle(text) {
    return { display: true, text, color: '#64748b', font: { family: 'Inter', weight: '600', size: 11 } };
  }

  function barValueLabelPlugin(decimals = 1) {
    return {
      id: 'barValueLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const horizontal = chart.options.indexAxis === 'y';
        chart.data.datasets.forEach((dataset, i) => {
          chart.getDatasetMeta(i).data.forEach((bar, idx) => {
            const val = dataset.data[idx];
            if (val == null) return;
            ctx.save();
            ctx.fillStyle = '#1e293b';
            ctx.font = '600 11px Inter, sans-serif';
            if (horizontal) {
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(Number(val).toFixed(decimals) + '%', bar.x + 6, bar.y);
            } else {
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText(Number(val).toFixed(decimals) + '%', bar.x, bar.y - 8);
            }
            ctx.restore();
          });
        });
      },
    };
  }

  const HORIZONTAL_X_TICKS = { maxRotation: 0, minRotation: 0, autoSkip: false, font: { size: 11 } };

  function destroyChart(id) {
    if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
  }

  function makeGroupedBarChart(canvasId, labels, matrix, yMax, onCategoryClick) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const datasets = PERIODS.map((p, i) => ({
      label: p,
      data: labels.map(l => matrix[l]?.[i] ?? 0),
      backgroundColor: PERIOD_COLORS[i],
      borderRadius: { topLeft: 3, topRight: 3 },
      borderSkipped: false,
    }));
    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        ...CHART_DEFAULTS,
        onClick: (evt, elements, chart) => {
          if (!onCategoryClick) return;
          if (elements.length) {
            onCategoryClick(labels[elements[0].index], chart.canvas);
            return;
          }
          const pos = typeof Chart !== 'undefined' && Chart.helpers?.getRelativePosition
            ? Chart.helpers.getRelativePosition(evt, chart)
            : null;
          if (!pos || !chart.scales?.x) return;
          const index = Math.round(chart.scales.x.getValueForPixel(pos.x));
          if (index >= 0 && index < labels.length) onCategoryClick(labels[index], chart.canvas);
        },
        plugins: { ...CHART_DEFAULTS.plugins, legend: { ...CHART_DEFAULTS.plugins.legend, position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, max: yMax, ...PRO_AXIS, title: proAxisTitle('DT %'), ticks: { ...PRO_AXIS.ticks, callback: v => v + '%' } },
          x: { ...PRO_AXIS, ticks: HORIZONTAL_X_TICKS },
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
        datasets: weeks.map((w, i) => ({ label: w, data: DOW_DATA[w], backgroundColor: colors[i], borderRadius: 4 })),
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { ...CHART_DEFAULTS.plugins, legend: { ...CHART_DEFAULTS.plugins.legend, position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, max: 20, grid: { color: 'rgba(0,40,85,0.06)' }, ticks: { callback: v => v + '%' } },
          x: { grid: { display: false }, ticks: HORIZONTAL_X_TICKS },
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
      data: { labels: REASONS, datasets: [{ label: 'Hours', data: REASON_HOURS, backgroundColor: grad, borderRadius: 4 }] },
      options: {
        ...CHART_DEFAULTS,
        indexAxis: 'y',
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(0,40,85,0.06)' } },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } },
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
          tension: 0.42, pointRadius: 5, pointBackgroundColor: '#fff', pointBorderColor: '#0066cc', pointBorderWidth: 2,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
        interaction: { intersect: false, mode: 'index' },
        scales: {
          y: { min: 7, max: 11.5, grid: { color: 'rgba(0,40,85,0.06)' }, ticks: { callback: v => v.toFixed(1) + '%' } },
          x: { title: { display: true, text: 'Period' }, grid: { display: false }, ticks: HORIZONTAL_X_TICKS },
        },
      },
    });
  }

  function chartCardWithSelect(title, subtitle, canvasId, selectId, options, wrapClass = '') {
    const opts = options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    const isDonut = wrapClass.includes('donut-wrap');
    const bodyContent = isDonut
      ? `<div class="donut-chart-layout">
          <div class="donut-canvas-wrap"><canvas id="${canvasId}"></canvas></div>
          <div class="donut-legend" id="${canvasId}-legend" aria-label="Category legend"></div>
        </div>`
      : `<div class="chart-wrap tall chart-wrap-pro${wrapClass ? ' ' + wrapClass : ''}"><canvas id="${canvasId}"></canvas></div>`;
    return `<div class="data-card chart-card-pro">
      <div class="data-card-header chart-card-header-pro">
        <div>
          <span class="data-card-title">${title}</span>
          ${subtitle ? `<div class="chart-card-sub">${subtitle}</div>` : ''}
        </div>
        <select class="chart-select" id="${selectId}" aria-label="${title} filter">${opts}</select>
      </div>
      <div class="data-card-body chart-body-pro">
        ${bodyContent}
      </div>
    </div>`;
  }

  function bindByCategoryControls() {
    document.getElementById('top-sites-select')?.addEventListener('change', e => {
      state.topSitesCount = parseInt(e.target.value, 10);
      makeTopSitesLineChart('chart-top-sites', state.topSitesCount);
    });
    document.getElementById('site-metric-select')?.addEventListener('change', () => makeSiteBarChart('chart-cat-by-site'));
    document.getElementById('cat-metric-select')?.addEventListener('change', () => makeCategoryBarChart('chart-cat-all-sites'));
  }

  function makeTopSitesLineChart(canvasId, count = 5) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const sites = TOP_SITES.slice(0, count);
    const ctx = canvas.getContext('2d');
    state.charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: PERIODS,
        datasets: sites.map((site, i) => {
          const color = TOP_SITE_COLORS[i];
          const grad = ctx.createLinearGradient(0, 0, 0, 320);
          grad.addColorStop(0, color + '35');
          grad.addColorStop(1, color + '00');
          return {
            label: site,
            data: TOP_SITES_TRENDS[site] || PERIODS.map(() => 0),
            borderColor: color,
            backgroundColor: grad,
            fill: true,
            tension: 0.42,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: color,
            pointBorderWidth: 2.5,
            borderWidth: 2.5,
          };
        }),
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { ...CHART_DEFAULTS.plugins, legend: { ...CHART_DEFAULTS.plugins.legend, position: 'bottom' } },
        interaction: { intersect: false, mode: 'index' },
        scales: {
          y: {
            beginAtZero: true,
            ...PRO_AXIS,
            title: proAxisTitle('DT %'),
            ticks: { ...PRO_AXIS.ticks, callback: v => v + '%' },
          },
          x: {
            ...PRO_AXIS,
            title: proAxisTitle('Period'),
            ticks: HORIZONTAL_X_TICKS,
          },
        },
      },
    });
  }

  function makeSiteBarChart(canvasId) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, '#60a5fa');
    grad.addColorStop(1, '#2563eb');
    const entries = Object.entries(SITE_DT_TOTALS).sort((a, b) => b[1] - a[1]).slice(0, 8);
    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: entries.map(e => e[0]),
        datasets: [{
          label: 'Total DT %',
          data: entries.map(e => e[1]),
          backgroundColor: grad,
          hoverBackgroundColor: '#1d4ed8',
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 36,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            max: 30,
            ...PRO_AXIS,
            title: proAxisTitle('DT %'),
            ticks: { ...PRO_AXIS.ticks, callback: v => v + '%' },
          },
          x: {
            ...PRO_AXIS,
            title: proAxisTitle('Site'),
            ticks: { ...HORIZONTAL_X_TICKS, font: { size: 10 } },
          },
        },
      },
      plugins: [barValueLabelPlugin(2)],
    });
  }

  function makeCategoryBarChart(canvasId) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const entries = Object.entries(CATEGORY_DT_TOTALS).sort((a, b) => b[1] - a[1]);
    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: entries.map(e => e[0]),
        datasets: [{
          label: 'Total DT %',
          data: entries.map(e => e[1]),
          backgroundColor: entries.map((_, i) => CATEGORY_BAR_COLORS[i % CATEGORY_BAR_COLORS.length]),
          hoverBackgroundColor: entries.map((_, i) => CATEGORY_BAR_COLORS[i % CATEGORY_BAR_COLORS.length]),
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 36,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            max: 20,
            ...PRO_AXIS,
            title: proAxisTitle('DT %'),
            ticks: { ...PRO_AXIS.ticks, callback: v => v + '%' },
          },
          x: {
            ...PRO_AXIS,
            title: proAxisTitle('Category'),
            ticks: { ...HORIZONTAL_X_TICKS, font: { size: 10 } },
          },
        },
      },
      plugins: [barValueLabelPlugin(1)],
    });
  }

  function initByLineCharts() {
    makeLineTrendChart('chart-line-trend', state.lineTrendFilter);
    makeTopLinesBarChart('chart-top-lines', 10);
    makeCategoryDonutChart('chart-line-donut');
  }

  function lineTrendData(site) {
    if (LINE_TREND_OVERRIDES[site]) return LINE_TREND_OVERRIDES[site];
    return linePeriodTotalsForSite(site);
  }

  function makeLineTrendChart(canvasId, filter = 'all') {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    const sites = filter === 'all' ? LINE_TREND_SITES : [filter];
    state.charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: PERIODS,
        datasets: sites.map((site, i) => {
          const color = LINE_TREND_COLORS[LINE_TREND_SITES.indexOf(site)] || LINE_TREND_COLORS[i];
          const grad = ctx.createLinearGradient(0, 0, 0, 320);
          grad.addColorStop(0, color + '35');
          grad.addColorStop(1, color + '00');
          return {
            label: site.charAt(0) + site.slice(1).toLowerCase(),
            data: lineTrendData(site),
            borderColor: color,
            backgroundColor: grad,
            fill: true,
            tension: 0.42,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: color,
            pointBorderWidth: 2.5,
            borderWidth: 2.5,
          };
        }),
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { ...CHART_DEFAULTS.plugins, legend: { ...CHART_DEFAULTS.plugins.legend, position: 'bottom' } },
        interaction: { intersect: false, mode: 'index' },
        scales: {
          y: {
            beginAtZero: true,
            max: 50,
            ...PRO_AXIS,
            title: proAxisTitle('DT %'),
            ticks: { ...PRO_AXIS.ticks, callback: v => v + '%' },
          },
          x: {
            ...PRO_AXIS,
            title: proAxisTitle('Period'),
            ticks: HORIZONTAL_X_TICKS,
          },
        },
      },
    });
  }

  function makeTopLinesBarChart(canvasId, count = 10) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const entries = Object.entries(TOP_LINE_DT).sort((a, b) => b[1] - a[1]).slice(0, count);
    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: entries.map(e => e[0]),
        datasets: [{
          label: 'DT %',
          data: entries.map(e => e[1]),
          backgroundColor: entries.map((_, i) => PERIOD_COLORS[i % PERIOD_COLORS.length]),
          hoverBackgroundColor: entries.map((_, i) => PERIOD_COLORS[i % PERIOD_COLORS.length]),
          borderRadius: 6,
          barThickness: 18,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        indexAxis: 'y',
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
        scales: {
          x: {
            beginAtZero: true,
            max: 40,
            ...PRO_AXIS,
            title: proAxisTitle('DT %'),
            ticks: { ...PRO_AXIS.ticks, callback: v => v + '%' },
          },
          y: {
            ...PRO_AXIS,
            ticks: { font: { size: 11, weight: '600' }, color: '#1a2b4a' },
          },
        },
      },
      plugins: [barValueLabelPlugin(2)],
    });
  }

  function donutCenterPlugin(total) {
    return {
      id: 'donutCenter',
      beforeDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const x = (chartArea.left + chartArea.right) / 2;
        const y = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#1a2b4a';
        ctx.font = '700 24px Inter, sans-serif';
        ctx.fillText(total.toFixed(2) + '%', x, y - 6);
        ctx.font = '500 12px Inter, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('Total', x, y + 16);
        ctx.restore();
      },
    };
  }

  function renderDonutLegend(canvasId, entries, colors) {
    const legendEl = document.getElementById(`${canvasId}-legend`);
    if (!legendEl) return;
    legendEl.innerHTML = entries.map(([name, value], i) => {
      const color = colors[name] || PERIOD_COLORS[i % PERIOD_COLORS.length];
      return `<div class="donut-legend-item">
        <span class="donut-legend-swatch" style="background:${color}"></span>
        <span class="donut-legend-label">${name}</span>
        <span class="donut-legend-value">${Number(value).toFixed(1)}%</span>
      </div>`;
    }).join('');
  }

  function makeCategoryDonutChart(canvasId) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const entries = Object.entries(CATEGORY_DT_TOTALS).sort((a, b) => b[1] - a[1]);
    const total = 10.61;
    const colors = entries.map(([name], i) => DONUT_CATEGORY_COLORS[name] || PERIOD_COLORS[i % PERIOD_COLORS.length]);
    renderDonutLegend(canvasId, entries, DONUT_CATEGORY_COLORS);
    state.charts[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(e => e[0]),
        datasets: [{
          data: entries.map(e => e[1]),
          backgroundColor: colors,
          borderWidth: 0,
          spacing: 3,
          borderRadius: 4,
          hoverOffset: 8,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        cutout: '68%',
        layout: { padding: 8 },
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { display: false },
          tooltip: {
            ...CHART_DEFAULTS.plugins.tooltip,
            callbacks: {
              label(ctx) {
                return ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%`;
              },
            },
          },
        },
      },
      plugins: [donutCenterPlugin(total)],
    });
  }

  function bindByLineControls() {
    document.getElementById('line-trend-select')?.addEventListener('change', e => {
      state.lineTrendFilter = e.target.value;
      makeLineTrendChart('chart-line-trend', state.lineTrendFilter);
    });
    document.getElementById('top-lines-select')?.addEventListener('change', e => {
      makeTopLinesBarChart('chart-top-lines', parseInt(e.target.value, 10));
    });
  }

  function initByCategoryCharts() {
    makeTopSitesLineChart('chart-top-sites', state.topSitesCount);
    makeSiteBarChart('chart-cat-by-site');
    makeCategoryBarChart('chart-cat-all-sites');
  }

  function initOverviewCharts() {
    makeDowChart('chart-dow');
    makeReasonChart('chart-reason');
    makeTrendChart('chart-trend');
  }

  function initTabCharts(tabId) {
    const map = {
      'by-category': () => initByCategoryCharts(),
      'by-line': () => initByLineCharts(),
      'by-dow': () => makeDowChart('chart-tab-dow'),
      'by-reason': () => { makeReasonChart('chart-tab-reason'); makeTrendChart('chart-tab-trend'); },
    };
    map[tabId]?.();
  }

  window.ManufacturingConsole = { state, switchPage, switchKpiTab };
})();
