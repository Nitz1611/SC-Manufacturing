/**
 * Manufacturing Console — Production-grade UI
 */
(function () {
  'use strict';

  const SLICERS = {
    showIn: { id: 'showIn', label: 'Show in', multi: false, options: ['Millions', 'Thousands', 'Percentage'], default: 'Millions' },
    timeframe: { id: 'timeframe', label: 'Timeframe', multi: false, options: ['FY', 'Quarter', 'Month', 'Week'], default: 'FY' },
    year: { id: 'year', label: 'Year', multi: false, options: ['2026', '2025', '2024', '2023'], default: '2026' },
    site: { id: 'site', label: 'Site', multi: false, options: ['All', 'ABERDEEN', 'ARLINGTON', 'FRISCO', 'MODESTO', 'PLANO'], default: 'All' },
    region: { id: 'region', label: 'Region', multi: true, options: ['North America', 'Latin America', 'Europe', 'Asia Pacific', 'Middle East & Africa'], default: [] },
  };

  const SITES = ['ABERDEEN', 'ARLINGTON', 'FRISCO', 'MODESTO', 'PLANO'];
  const HEATMAP_SITES = ['ABERDEEN', 'ARLINGTON', 'BELOIT', 'BRIDGEVIEW', 'BROOKHOLLOW', 'CAMBRIDGE', 'CANTON', 'CHARLOTTE', 'DENVER', 'FRISCO', 'HOUSTON', 'MODESTO', 'PLANO'];
  const SITE_MULTIPLIERS = {
    ABERDEEN: 1.0, ARLINGTON: 0.92, FRISCO: 1.08, MODESTO: 0.85, PLANO: 1.12,
    BELOIT: 1.1, BRIDGEVIEW: 4.5, BROOKHOLLOW: 1.05, CAMBRIDGE: 0.72, CANTON: 0.52,
    CHARLOTTE: 0.04, DENVER: 0.88, HOUSTON: 0.95,
  };
  const SITE_REGION_MAP = {
    ABERDEEN: 'North America', ARLINGTON: 'North America', BELOIT: 'North America',
    BRIDGEVIEW: 'North America', BROOKHOLLOW: 'North America', CAMBRIDGE: 'North America',
    CANTON: 'North America', CHARLOTTE: 'North America', DENVER: 'North America',
    FRISCO: 'North America', HOUSTON: 'North America', MODESTO: 'North America', PLANO: 'North America',
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
  const REASONS_DATA = [
    { reason: 'No Event', hours: 6255.30, pct: 0.48 },
    { reason: 'Unplanned Sanitation', hours: 5850.12, pct: 0.45 },
    { reason: 'Insufficient Qualified St', hours: 5420.88, pct: 0.42 },
    { reason: 'Equipment Failure', hours: 4890.50, pct: 0.38 },
    { reason: 'Infeed System', hours: 4320.75, pct: 0.33 },
    { reason: 'Material Shortage', hours: 3980.20, pct: 0.31 },
    { reason: 'Changeover Delay', hours: 3650.40, pct: 0.28 },
    { reason: 'Operator Error', hours: 3210.15, pct: 0.25 },
    { reason: 'Utility Outage', hours: 2890.60, pct: 0.22 },
    { reason: 'Mechanical Jam', hours: 2540.30, pct: 0.20 },
    { reason: 'Packaging Failure', hours: 2180.45, pct: 0.17 },
    { reason: 'Labeling Issue', hours: 1920.80, pct: 0.15 },
    { reason: 'Quality Hold', hours: 1650.25, pct: 0.13 },
    { reason: 'Sensor Fault', hours: 1420.90, pct: 0.11 },
    { reason: 'Conveyor Stop', hours: 1180.55, pct: 0.09 },
    { reason: 'Scheduled Maint Overrun', hours: 980.40, pct: 0.08 },
    { reason: 'Forklift Delay', hours: 820.15, pct: 0.06 },
    { reason: 'Training Gap', hours: 650.70, pct: 0.05 },
    { reason: 'Power Fluctuation', hours: 480.30, pct: 0.04 },
    { reason: 'Other', hours: 320.10, pct: 0.02 },
  ];
  const TREND_DATA = [8.63, 8.15, 7.49, 8.85, 8.20, 7.95, 8.40, 7.80, 8.10, 7.65];

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

  const DOW_WEEKS = [
    '2026P01W01', '2026P01W02', '2026P01W03', '2026P01W04',
    '2026P02W01', '2026P02W02', '2026P02W03', '2026P02W04',
    '2026P03W01', '2026P03W02', '2026P03W03',
  ];
  const DOW_SHIFTS = [1, 2, 3];
  const DOW_DAY_COLORS = ['#002855', '#0066cc', '#0ea5e9', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444'];
  const DOW_SHIFT_COLORS = ['#2563eb', '#10b981', '#f59e0b'];
  const DOW_DAY_TRENDS = {
    Sunday:    [11.2, 10.8, 12.1, 11.5, 10.2, 11.8, 12.5, 11.0, 10.5, 11.3, 10.9],
    Monday:    [13.5, 12.8, 14.2, 13.1, 12.5, 13.8, 14.5, 13.2, 12.9, 13.6, 13.0],
    Tuesday:   [15.2, 14.6, 16.1, 15.0, 14.2, 15.5, 16.2, 14.8, 14.5, 15.3, 14.7],
    Wednesday: [14.0, 13.4, 14.8, 13.9, 13.1, 14.2, 15.0, 13.6, 13.3, 14.1, 13.5],
    Thursday:  [16.0, 15.2, 16.8, 15.6, 14.8, 16.2, 17.0, 15.4, 15.0, 16.1, 15.3],
    Friday:    [13.8, 13.0, 14.5, 13.6, 12.8, 14.0, 14.8, 13.4, 13.1, 13.9, 13.2],
    Saturday:  [11.0, 10.4, 11.8, 10.9, 10.0, 11.2, 12.0, 10.6, 10.2, 11.0, 10.5],
  };
  const DOW_SHIFT_BASE = {
    Sunday:    { 1: [12.92, 11.80, 13.10, 12.40, 10.85, 12.10, 13.36, 11.50, 10.95, 11.80, 11.20], 2: [10.80, 10.20, 11.50, 10.90, 9.80, 11.20, 11.90, 10.60, 10.10, 10.90, 10.40], 3: [9.88, 9.40, 10.80, 10.20, 9.10, 10.10, 11.04, 9.90, 9.45, 10.20, 9.80] },
    Monday:    { 1: [14.20, 13.50, 15.10, 14.00, 13.20, 14.50, 15.20, 13.80, 13.50, 14.20, 13.60], 2: [13.40, 12.70, 14.00, 13.10, 12.40, 13.60, 14.30, 12.90, 12.60, 13.30, 12.80], 3: [12.90, 12.20, 13.50, 12.60, 11.90, 13.10, 13.80, 12.50, 12.20, 12.90, 12.30] },
    Tuesday:   { 1: [16.10, 15.40, 16.80, 15.80, 14.90, 16.20, 17.00, 15.50, 15.20, 16.00, 15.30], 2: [15.20, 14.50, 15.90, 14.80, 14.00, 15.30, 16.00, 14.60, 14.30, 15.10, 14.40], 3: [14.30, 13.60, 15.00, 14.00, 13.20, 14.50, 15.20, 13.80, 13.50, 14.20, 13.60] },
    Wednesday: { 1: [14.80, 14.00, 15.40, 14.30, 13.50, 14.80, 15.50, 14.10, 13.80, 14.50, 13.90], 2: [13.90, 13.20, 14.50, 13.60, 12.80, 14.00, 14.70, 13.30, 13.00, 13.70, 13.10], 3: [13.10, 12.40, 13.80, 12.90, 12.10, 13.30, 14.00, 12.60, 12.30, 13.00, 12.40] },
    Thursday:  { 1: [16.80, 16.00, 17.50, 16.40, 15.50, 16.90, 17.80, 16.20, 15.90, 16.70, 16.00], 2: [15.90, 15.10, 16.60, 15.50, 14.70, 16.00, 16.80, 15.20, 14.90, 15.70, 15.00], 3: [15.10, 14.30, 15.80, 14.70, 13.90, 15.20, 16.00, 14.40, 14.10, 14.90, 14.20] },
    Friday:    { 1: [14.50, 13.80, 15.20, 14.20, 13.40, 14.70, 15.40, 14.00, 13.70, 14.40, 13.80], 2: [13.70, 13.00, 14.40, 13.40, 12.60, 13.90, 14.60, 13.20, 12.90, 13.60, 13.00], 3: [12.90, 12.20, 13.60, 12.60, 11.80, 13.10, 13.80, 12.40, 12.10, 12.80, 12.20] },
    Saturday:  { 1: [11.60, 10.90, 12.20, 11.30, 10.50, 11.80, 12.50, 11.10, 10.80, 11.50, 10.90], 2: [10.80, 10.10, 11.40, 10.50, 9.80, 11.00, 11.70, 10.30, 10.00, 10.70, 10.10], 3: [10.00, 9.40, 10.60, 9.80, 9.10, 10.20, 10.90, 9.60, 9.30, 10.00, 9.50] },
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
    compareMode: false,
    compareContext: null,
    detailMode: false,
    detailContext: null,
    compareCategory: null,
    compareLine: null,
    detailCategory: null,
    expandedHeatmapSites: { ABERDEEN: true },
    expandedLineSites: { ABERDEEN: true },
    expandedDowDays: { Sunday: true },
    topSitesCount: 5,
    lineTrendFilter: 'all',
    reasonCount: 20,
    reasonTrendFilter: 'all',
    cardViews: { category: 'table', line: 'table' },
    compareDay: null,
    compareShift: null,
    focusSourceChartId: null,
    bootDismissed: false,
    bootStartedAt: Date.now(),
    liveMetrics: null,
    dashboard: null,
    metricsBase: null,
    dataLoading: false,
    dataPollTimer: null,
    dataReloadTimer: null,
    lastDataFilterKey: null,
    summaryFilterKey: null,
    summariesLoaded: false,
    summaryReloadTimer: null,
  };

  let REASONS_DATA_MUTABLE = null;
  let TREND_DATA_MUTABLE = null;
  let PERIODS_MUTABLE = null;
  let DOW_WEEKS_MUTABLE = null;
  let DOW_DAY_TRENDS_MUTABLE = null;

  function activePeriods() {
    return PERIODS_MUTABLE?.length ? PERIODS_MUTABLE : PERIODS;
  }

  function activeWeeks() {
    const weeks = DOW_WEEKS_MUTABLE?.length ? DOW_WEEKS_MUTABLE : DOW_WEEKS;
    return weeks.slice(-6);
  }

  function activeDayTrendSeries(day) {
    const full = (DOW_DAY_TRENDS_MUTABLE || DOW_DAY_TRENDS)[day] || [];
    return full.slice(-activeWeeks().length);
  }

  function regionsSelected() {
    const regions = state.filters.region || [];
    return regions.length && regions.length < SLICERS.region.options.length ? regions : null;
  }

  function sitesForRegions(regions) {
    if (!regions?.length) return [...HEATMAP_SITES];
    return HEATMAP_SITES.filter(s => regions.includes(SITE_REGION_MAP[s]));
  }

  function siteSlicerOptions() {
    const active = regionsSelected();
    if (!active) return ['All', ...HEATMAP_SITES];
    return ['All', ...sitesForRegions(active)];
  }

  function activeHeatmapSites() {
    let sites = [...HEATMAP_SITES];
    const site = state.filters.site;
    if (site && site !== 'All') {
      sites = sites.filter(s => s === String(site).toUpperCase());
    }
    const active = regionsSelected();
    if (active) {
      const allowed = new Set(sitesForRegions(active));
      sites = sites.filter(s => allowed.has(s));
    }
    return sites.length ? sites : [...HEATMAP_SITES];
  }

  function syncSiteRegionFilters(changedId) {
    if (changedId === 'site') {
      const site = state.filters.site;
      if (site && site !== 'All') {
        const region = SITE_REGION_MAP[String(site).toUpperCase()];
        if (region) state.filters.region = [region];
      }
    } else if (changedId === 'region') {
      const site = state.filters.site;
      if (site && site !== 'All') {
        const allowed = sitesForRegions(state.filters.region);
        if (!allowed.includes(String(site).toUpperCase())) {
          state.filters.site = 'All';
        }
      }
    }
  }

  function refreshAllSlicers() {
    document.querySelectorAll('.slicer[data-slicer-id]').forEach(wrap => {
      const cfg = SLICERS[wrap.dataset.slicerId];
      if (cfg) refreshSlicer(wrap, cfg);
    });
  }

  function childPeriodTotals(site, children, getValues) {
    return activePeriods().map((_, i) => {
      let sum = 0;
      let has = false;
      children.forEach(child => {
        const v = getValues(site, child)[i];
        if (v != null && Number.isFinite(Number(v))) {
          sum += Number(v);
          has = true;
        }
      });
      return has ? +sum.toFixed(2) : null;
    });
  }

  function networkWeekTrend() {
    const weeks = activeWeeks();
    const dow = state.liveMetrics?.dow_by_day_week;
    if (dow && Object.keys(dow).length) {
      return weeks.map(week => {
        const vals = [];
        Object.values(dow).forEach(weekMap => {
          if (weekMap?.[week] != null) vals.push(Number(weekMap[week]));
        });
        return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
      });
    }
    const allWeeks = DOW_WEEKS_MUTABLE?.length ? DOW_WEEKS_MUTABLE : DOW_WEEKS;
    return weeks.map(week => {
      const idx = allWeeks.indexOf(week);
      if (idx < 0) return null;
      const dayVals = DAY_LABELS.map(d => (DOW_DAY_TRENDS_MUTABLE || DOW_DAY_TRENDS)[d]?.[idx]).filter(v => v != null);
      return dayVals.length ? +(avgOf(dayVals).toFixed(2)) : null;
    });
  }

  function templateSummaries() {
    if (!state.liveMetrics) return {};
    return state.liveMetrics.tab_insights || buildTabInsightsClient(state.liveMetrics);
  }

  function showInMode() {
    const v = String(state.filters.showIn || 'Millions');
    if (v.includes('Percent')) return 'percentage';
    if (v.includes('Thousand')) return 'thousands';
    return 'millions';
  }

  function isHoursDisplayMode() {
    return showInMode() !== 'percentage';
  }

  function parseHoursValue(str) {
    return parseFloat(String(str || '').replace(/[^0-9.]/g, '')) || 0;
  }

  function totalDtHours() {
    const v = parseHoursValue(state.liveMetrics?.kpis?.downtime_hrs?.value);
    return v || 112474;
  }

  function yearAvgDtPct() {
    const trend = state.liveMetrics?.period_trend || activeTrendData();
    const valid = (trend || []).filter(v => v != null && Number.isFinite(Number(v)));
    if (valid.length) return valid.reduce((a, b) => a + Number(b), 0) / valid.length;
    return parsePct(state.liveMetrics?.kpis?.downtime_pct?.value) || 0;
  }

  function pctToHours(pct) {
    const avg = yearAvgDtPct();
    const total = totalDtHours();
    const n = activePeriods().length || 1;
    if (!avg || pct == null || Number.isNaN(Number(pct))) return 0;
    return (Number(pct) / avg) * (total / n);
  }

  function cellDisplayValue(value, fromPct = true) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    if (showInMode() === 'percentage') {
      return Number(value).toFixed(2) + '%';
    }
    const hours = fromPct ? pctToHours(value) : Number(value);
    if (showInMode() === 'millions') return (hours / 1e6).toFixed(3) + ' MM';
    return (hours / 1e3).toFixed(2) + ' M';
  }

  function tableSummaryHeader() {
    return isHoursDisplayMode() ? 'Total' : 'Avg DT%';
  }

  function tableSummaryValue(vals) {
    const numeric = vals.filter(v => v != null && Number.isFinite(Number(v)));
    if (!numeric.length) return null;
    if (isHoursDisplayMode()) {
      return numeric.reduce((a, v) => a + pctToHours(v), 0);
    }
    return avgOf(numeric);
  }

  function formatTableSummary(val, fromPct = true) {
    if (val == null) return '—';
    return cellDisplayValue(val, fromPct);
  }

  function tableMetricLabel() {
    return isHoursDisplayMode() ? 'Unplanned Downtime in Hours' : 'Unplanned DT %';
  }

  function formatKpiHoursDisplay(raw) {
    if (!raw || raw === '—') return '—';
    const hours = parseHoursValue(raw);
    if (showInMode() === 'millions') return (hours / 1e6).toFixed(3) + ' MM';
    if (showInMode() === 'thousands') return (hours / 1e3).toFixed(2) + ' M';
    return raw;
  }

  function refreshDtAvgBadges() {
    const avg = yearAvgDtPct().toFixed(2) + '%';
    document.querySelectorAll('.status-badge.accent strong').forEach(el => {
      if (el.closest('.status-badges')) el.textContent = avg;
    });
  }

  function activeReasonsData() {
    return REASONS_DATA_MUTABLE?.length ? REASONS_DATA_MUTABLE : REASONS_DATA;
  }

  function activeTrendData() {
    return TREND_DATA_MUTABLE?.length ? TREND_DATA_MUTABLE : TREND_DATA;
  }

  function activeDayTrends() {
    return DOW_DAY_TRENDS_MUTABLE || DOW_DAY_TRENDS;
  }

  /* ── Live data API ── */
  function apiFiltersFromState() {
    return {
      showIn: state.filters.showIn,
      timeframe: state.filters.timeframe,
      year: state.filters.year,
      site: state.filters.site,
      region: state.filters.region,
      period: (state.filters.timeframe || 'Week').toLowerCase() === 'week' ? 'week' : (state.filters.timeframe || 'Week').toLowerCase(),
    };
  }

  function setAiSummaryLoading() {
    ['overview', 'category', 'line', 'dow', 'reason'].forEach(tab => {
      document.querySelectorAll(`[data-ai-summary="${tab}"]`).forEach(el => {
        el.textContent = '✦ AI Summary Loading…';
      });
    });
  }

  function initDataStatusBar() {
    if (document.getElementById('data-status-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'data-status-bar';
    bar.className = 'data-status-bar loading';
    bar.innerHTML = '<span class="data-status-dot"></span><span class="data-status-text">Loading metric view data…</span>';
    document.querySelector('.filter-bar')?.after(bar);
  }

  function setDataStatus(mode, text) {
    const bar = document.getElementById('data-status-bar');
    if (!bar) return;
    bar.className = `data-status-bar ${mode}`;
    bar.querySelector('.data-status-text').textContent = text;
  }

  function dataFilterKey() {
    const f = state.filters;
    return JSON.stringify({
      timeframe: f.timeframe,
      year: f.year,
      site: f.site,
      region: f.region,
    });
  }

  function parsePct(value) {
    const n = parseFloat(String(value || '').replace('%', '').trim());
    return Number.isFinite(n) ? n : 6.2;
  }

  function buildTabInsightsClient(m) {
    const kpis = m.kpis || {};
    const dt = kpis.downtime_pct || {};
    const dtHrs = kpis.downtime_hrs || {};
    const stops = kpis.stops || {};
    const trend = m.period_trend || [];
    const periods = m.periods || [];
    const anchor = parsePct(dt.value);

    let peakLabel = '';
    let peakVal = anchor;
    let lowLabel = '';
    let lowVal = anchor;
    if (trend.length) {
      const peakI = trend.indexOf(Math.max(...trend));
      const lowI = trend.indexOf(Math.min(...trend));
      peakLabel = periods[peakI] || `P${peakI + 1}`;
      peakVal = trend[peakI];
      lowLabel = periods[lowI] || `P${lowI + 1}`;
      lowVal = trend[lowI];
    }

    const overview = `Unplanned DT % is ${dt.value || '—'} (${dt.delta || 'vs prior period'}). Peak at ${peakLabel || 'latest period'} (${Number(peakVal).toFixed(2)}%), low at ${lowLabel || '—'} (${Number(lowVal).toFixed(2)}%). STOPS: ${stops.value || '—'}.`;

    const cats = m.category_by_period || {};
    let category;
    if (Object.keys(cats).length) {
      const topCat = Object.entries(cats).sort((a, b) => {
        const sa = (a[1] || []).reduce((x, y) => x + Number(y || 0), 0);
        const sb = (b[1] || []).reduce((x, y) => x + Number(y || 0), 0);
        return sb - sa;
      })[0];
      const catAvg = topCat[1].length ? topCat[1].reduce((a, b) => a + Number(b || 0), 0) / topCat[1].length : 0;
      category = `${topCat[0]} leads unplanned DT at ${catAvg.toFixed(2)}% avg across ${periods.length} periods. Network unplanned DT is ${anchor.toFixed(2)}% — focus reduction on ${topCat[0]} root causes and cross-site benchmarks.`;
    } else {
      category = `Category-level unplanned DT averages ${anchor.toFixed(2)}%. Expand site rows to compare RSN categories by period.`;
    }

    const lines = m.top_lines || {};
    let line;
    if (Object.keys(lines).length) {
      const ranked = Object.entries(lines).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const lineNames = ranked.map(([n, p]) => `${n} (${Number(p).toFixed(1)}%)`).join(', ');
      line = `Top unplanned DT lines: ${lineNames}. Prioritize mechanical and changeover losses on the highest-share lines.`;
    } else {
      const lineBy = m.line_by_period || {};
      const entries = Object.entries(lineBy);
      if (entries.length) {
        const topLine = entries.sort((a, b) => {
          const sa = (a[1] || []).reduce((x, y) => x + Number(y || 0), 0);
          const sb = (b[1] || []).reduce((x, y) => x + Number(y || 0), 0);
          return sb - sa;
        })[0];
        line = `${topLine[0]} shows the highest unplanned DT across periods — review line-level RSN breakdown and shift handovers.`;
      } else {
        line = 'Line-level unplanned DT is concentrated in a few assets — use the heatmap to identify top site/line combinations.';
      }
    }

    const shifts = m.shift_comparison || [];
    const dow = m.dow_by_day_week || {};
    let dowInsight;
    if (shifts.length) {
      const topShift = shifts.reduce((a, b) => (Number(a.hours || 0) > Number(b.hours || 0) ? a : b));
      let dowTxt = '';
      const dayAvgs = Object.entries(dow).map(([d, v]) => {
        const vals = Object.values(v || {});
        return [d, vals.length ? vals.reduce((a, b) => a + Number(b || 0), 0) / vals.length : 0];
      });
      if (dayAvgs.length) {
        const hi = dayAvgs.reduce((a, b) => (a[1] > b[1] ? a : b));
        const lo = dayAvgs.reduce((a, b) => (a[1] < b[1] ? a : b));
        dowTxt = ` ${hi[0]} averages ${hi[1].toFixed(1)}% vs ${lo[0]} at ${lo[1].toFixed(1)}%.`;
      }
      dowInsight = `${topShift.shift || 'Shift'} drives ${Number(topShift.hours || 0).toLocaleString()} unplanned DT hours.${dowTxt} Compare shifts across days to target handover and staffing gaps.`;
    } else if (Object.keys(dow).length) {
      const dayAvgs = Object.entries(dow).map(([d, v]) => {
        const vals = Object.values(v || {});
        return [d, vals.length ? vals.reduce((a, b) => a + Number(b || 0), 0) / vals.length : 0];
      });
      const hi = dayAvgs.reduce((a, b) => (a[1] > b[1] ? a : b));
      dowInsight = `${hi[0]} shows the highest unplanned DT % (${hi[1].toFixed(1)}%) across recent weeks — expand day rows to compare shifts.`;
    } else {
      dowInsight = 'Day-of-week unplanned DT varies by shift — use the heatmap to compare Shift 1/2/3 patterns across weeks.';
    }

    const reasons = m.reasons || [];
    let reason;
    if (reasons.length) {
      const top3 = reasons.slice(0, 3);
      const rTxt = top3.map(r => `${r.reason} (${Number(r.hours || 0).toLocaleString()}h, ${Number(r.pct || 0).toFixed(2)}%)`).join('; ');
      const tMin = trend.length ? Math.min(...trend).toFixed(2) : anchor.toFixed(2);
      const tMax = trend.length ? Math.max(...trend).toFixed(2) : anchor.toFixed(2);
      reason = `Top unplanned DT reasons: ${rTxt}. Period trend ranges ${tMin}%–${tMax}% with total hours ${dtHrs.value || '—'}.`;
    } else {
      const tMin = trend.length ? Math.min(...trend).toFixed(2) : anchor.toFixed(2);
      const tMax = trend.length ? Math.max(...trend).toFixed(2) : anchor.toFixed(2);
      reason = `Unplanned DT % trend spans ${tMin}%–${tMax}% across periods. Review RSN-level hours to prioritize the largest contributors.`;
    }

    return { overview, category, line, dow: dowInsight, reason };
  }

  function filterMetricsClient(base) {
    if (!base) return base;
    const m = JSON.parse(JSON.stringify(base));
    const site = state.filters.site;
    const activeRegions = regionsSelected();
    const allowedSites = new Set(activeHeatmapSites());

    if (m.site_by_period) {
      m.site_by_period = Object.fromEntries(
        Object.entries(m.site_by_period).filter(([s]) => allowedSites.has(s)),
      );
    }
    if (m.top_sites_trend) {
      m.top_sites_trend = Object.fromEntries(
        Object.entries(m.top_sites_trend).filter(([s]) => allowedSites.has(s)),
      );
    }

    if (site && site !== 'All') {
      const siteKey = String(site).toUpperCase();
      if (m.site_by_period?.[siteKey]) m.site_by_period = { [siteKey]: m.site_by_period[siteKey] };
      if (m.top_sites_trend?.[siteKey]) m.top_sites_trend = { [siteKey]: m.top_sites_trend[siteKey] };
      const mult = SITE_MULTIPLIERS[siteKey] || 1;
      if (m.period_trend?.length) {
        m.period_trend = m.period_trend.map(v => +(Number(v) * mult * 0.95).toFixed(2));
      }
      m.meta = { ...(m.meta || {}), filtered_site: siteKey };
    } else if (activeRegions) {
      const siteEntries = Object.entries(m.site_by_period || {});
      if (siteEntries.length && m.period_trend?.length) {
        const n = m.period_trend.length;
        const averaged = Array.from({ length: n }, (_, i) => {
          const vals = siteEntries.map(([, arr]) => arr[i]).filter(v => v != null && Number.isFinite(Number(v)));
          return vals.length ? +(vals.reduce((a, b) => a + Number(b), 0) / vals.length).toFixed(2) : m.period_trend[i];
        });
        m.period_trend = averaged;
      }
      m.meta = { ...(m.meta || {}), filtered_regions: activeRegions.join(', ') };
    }

    m.tab_insights = buildTabInsightsClient(m);
    return m;
  }

  function scheduleDataReload(fromFilterId) {
    clearTimeout(state.dataReloadTimer);
    state.dataReloadTimer = setTimeout(() => {
      if (fromFilterId === 'showIn') {
        refreshAllTables();
        refreshChartsForTab(state.kpiTab);
        if (state.liveMetrics?.kpis) updateMetricStripDOM(state.liveMetrics.kpis);
        refreshDtAvgBadges();
        return;
      }
      state.summariesLoaded = false;
      state.summaryFilterKey = null;
      setAiSummaryLoading();
      loadConsoleData(false);
    }, 80);
  }

  function applySummaryTexts(summaries) {
    const fallback = templateSummaries();
    ['overview', 'category', 'line', 'dow', 'reason'].forEach(tab => {
      const text = summaries?.[tab] || fallback[tab];
      if (!text) return;
      document.querySelectorAll(`[data-ai-summary="${tab}"]`).forEach(el => {
        el.textContent = text;
      });
    });
  }

  async function pollSummaryJob(jobId, tabs) {
    return new Promise((resolve, reject) => {
      const timer = setInterval(async () => {
        try {
          const res = await fetch(`/api/job/${jobId}`);
          const job = await res.json();

          if (job.status === 'running') {
            tabs.forEach(tab => {
              document.querySelectorAll(`[data-ai-summary="${tab}"]`).forEach(el => {
                el.textContent = `✦ Supervisor querying Genie… ${job.elapsed || 0}s`;
              });
            });
            return;
          }

          clearInterval(timer);

          if (job.status === 'error') {
            reject(new Error(job.error || 'Supervisor returned an error'));
            return;
          }

          if (job.status === 'done') {
            const summaries = job.result?.summaries || {};
            const merged = {};
            ['overview', 'category', 'line', 'dow', 'reason'].forEach(tab => {
              merged[tab] = summaries[tab] || templateSummaries()[tab] || '';
            });
            applySummaryTexts(merged);
            resolve(job.result);
          }
        } catch (e) {
          clearInterval(timer);
          reject(e);
        }
      }, 3000);
    });
  }

  async function loadAiSummaries(force = false) {
    const filters = apiFiltersFromState();
    const key = JSON.stringify(filters);
    if (!force && state.summaryFilterKey === key && state.summariesLoaded) return;

    clearTimeout(state.summaryReloadTimer);
    state.summaryReloadTimer = setTimeout(async () => {
      setAiSummaryLoading();

      try {
        const res = await fetch('/api/summaries/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params: filters, forceRefresh: force }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Summaries ${res.status}`);
        }
        const data = await res.json();

        if (data.summaries && (data.cached || !data._job_id)) {
          applySummaryTexts(data.summaries);
          state.summaryFilterKey = key;
          state.summariesLoaded = true;
          return;
        }

        const jobId = data._job_id;
        if (!jobId) throw new Error('No job_id from server');

        const tabs = ['overview', 'category', 'line', 'dow', 'reason'];
        await pollSummaryJob(jobId, tabs);
        state.summaryFilterKey = key;
        state.summariesLoaded = true;
      } catch (err) {
        console.warn('[summaries]', err.message);
        const fallback = templateSummaries();
        if (Object.keys(fallback).length) {
          applySummaryTexts(fallback);
          state.summaryFilterKey = key;
          state.summariesLoaded = true;
        } else {
          ['overview', 'category', 'line', 'dow', 'reason'].forEach(tab => {
            document.querySelectorAll(`[data-ai-summary="${tab}"]`).forEach(el => {
              if (String(el.textContent).includes('Loading') || String(el.textContent).includes('Supervisor')) {
                el.textContent = `AI summary unavailable — ${err.message}`;
              }
            });
          });
        }
      }
    }, 200);
  }

  async function loadConsoleData(force = false) {
    if (state.dataPollTimer) {
      clearInterval(state.dataPollTimer);
      state.dataPollTimer = null;
    }

    const showLoading = !state.metricsBase || force;
    if (showLoading) {
      setDataStatus('loading', 'Loading unplanned DT metrics…');
      setAiSummaryLoading();
      setBootStatus('Loading unplanned DT metrics');
    }

    try {
      const res = await fetch('/api/console-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: apiFiltersFromState(), force }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server ${res.status}`);
      }
      const data = await res.json();

      if (data.error && !data.metrics) {
        setDataStatus('error', data.error.slice(0, 120));
        setBootStatus('Unable to load metrics — showing cached layout');
        dismissBootSplash();
        state.dataLoading = false;
        return;
      }

      if (data.metrics) {
        state.metricsBase = data.metrics;
        state.lastDataFilterKey = dataFilterKey();
        applyConsoleData({ metrics: filterMetricsClient(data.metrics), dashboard: data.dashboard || {} });
      }

      if (data._source === 'sql' || data.metrics?.meta?.source === 'sql') {
        setDataStatus('live', 'Live unplanned DT data from metric view');
      } else if (data._cached) {
        setDataStatus('cached', 'Cached/demo data · check .env SQL settings');
      }
      loadAiSummaries(false);
      state.dataLoading = false;
    } catch (err) {
      state.dataLoading = false;
      setDataStatus('error', `Data load failed: ${err.message}`);
      setBootStatus('Connection issue — loading interface');
      dismissBootSplash();
      console.warn('[console-data]', err);
    }
  }

  async function pollConsoleJob(jobId, background = false) {
    try {
      const res = await fetch(`/api/job/${jobId}`);
      const job = await res.json();

      if (job.status === 'running') {
        if (!background) setDataStatus('loading', job.message || `Refreshing… ${job.elapsed || 0}s`);
        return;
      }

      clearInterval(state.dataPollTimer);
      state.dataPollTimer = null;
      state.dataLoading = false;

      if (job.status === 'error') {
        if (!state.metricsBase) setDataStatus('error', job.error || 'Refresh failed');
        else setDataStatus('cached', 'Showing cached unplanned DT data · refresh failed');
        return;
      }

      if (job.status === 'done' && job.result?.metrics) {
        state.metricsBase = job.result.metrics;
        state.lastDataFilterKey = dataFilterKey();
        applyConsoleData({ metrics: filterMetricsClient(job.result.metrics), dashboard: {} });
      }
    } catch (err) {
      console.warn('[poll]', err.message);
    }
  }

  function setBootStatus(text) {
    const el = document.getElementById('boot-status-text');
    if (!el) return;
    el.innerHTML = `${text}<span class="boot-dots" aria-hidden="true"><span></span><span></span><span></span></span>`;
  }

  function dismissBootSplash() {
    if (state.bootDismissed) return;
    const elapsed = Date.now() - state.bootStartedAt;
    const minMs = 900;
    if (elapsed < minMs) {
      setTimeout(dismissBootSplash, minMs - elapsed);
      return;
    }
    state.bootDismissed = true;
    document.body.classList.add('app-ready');
    const splash = document.getElementById('boot-splash');
    if (splash) {
      splash.classList.add('boot-splash-out');
      setTimeout(() => splash.remove(), 700);
    }
  }

  function applyConsoleData(payload) {
    const metrics = payload.metrics || payload;
    state.liveMetrics = metrics;
    state.dashboard = payload.dashboard || {};
    applyMetricsToState(metrics);
    updateMetricStripDOM(metrics.kpis);
    updateAiSummariesDOM(metrics);
    refreshDtAvgBadges();
    refreshAllTables();
    refreshChartsForTab(state.kpiTab);
    const reasonBody = document.querySelector('.reason-table-body');
    if (reasonBody) reasonBody.innerHTML = buildReasonTable(state.reasonCount);
    const meta = metrics.meta || {};
    const src = meta.source || 'live';
    const yr = meta.year ? ` · Year ${meta.year}` : '';
    const pr = meta.period ? ` · ${meta.period}` : '';
    const wk = meta.week ? ` · Week ${meta.week}` : '';
    const site = meta.filtered_site ? ` · Site ${meta.filtered_site}` : (state.filters.site !== 'All' ? ` · Site ${state.filters.site}` : '');
    if (!state.dataPollTimer) {
      setDataStatus(src === 'cache' || src === 'demo' ? 'cached' : 'live', `Unplanned DT data${yr}${pr}${wk}${site}`);
    }
    state.dataLoading = false;
    dismissBootSplash();
  }

  function applyMetricsToState(m) {
    if (m.periods?.length) PERIODS_MUTABLE = m.periods.map(String);
    if (m.weeks?.length) DOW_WEEKS_MUTABLE = m.weeks.map(String);
    if (m.period_trend?.length) TREND_DATA_MUTABLE = m.period_trend.map(v => +Number(v).toFixed(2));
    if (m.reasons?.length) {
      REASONS_DATA_MUTABLE = m.reasons.map(r => ({
        reason: r.reason || r.RSN || 'Unknown',
        hours: +Number(r.hours || 0).toFixed(2),
        pct: +Number(r.pct || 0).toFixed(2),
      }));
    }

    if (m.dow_by_day_week && Object.keys(m.dow_by_day_week).length) {
      DOW_DAY_TRENDS_MUTABLE = {};
      DAY_LABELS.forEach(day => {
        const weekMap = m.dow_by_day_week[day] || {};
        DOW_DAY_TRENDS_MUTABLE[day] = activeWeeks().map(w => +(weekMap[w] ?? 0).toFixed(2));
      });
    }

    if (m.site_by_period && Object.keys(m.site_by_period).length) {
      Object.entries(m.site_by_period).forEach(([site, vals]) => {
        SITE_PERIOD_OVERRIDES[site] = vals.map(v => v == null ? null : +Number(v).toFixed(2));
      });
    }

    if (m.category_by_period && Object.keys(m.category_by_period).length) {
      Object.entries(m.category_by_period).forEach(([cat, vals]) => {
        if (CATEGORIES.includes(cat)) {
          CATEGORY_BASE[cat] = vals.map(v => +Number(v).toFixed(2));
        }
      });
    }

    if (m.line_by_period && Object.keys(m.line_by_period).length) {
      Object.entries(m.line_by_period).forEach(([line, vals]) => {
        if (LINE_BASE[line] !== undefined) {
          LINE_BASE[line] = vals.map(v => +Number(v).toFixed(2));
        }
      });
    }

    if (m.top_lines && Object.keys(m.top_lines).length) {
      Object.keys(TOP_LINE_DT).forEach(k => delete TOP_LINE_DT[k]);
      Object.entries(m.top_lines).forEach(([line, pct]) => {
        TOP_LINE_DT[line] = +Number(pct).toFixed(2);
      });
    }

    if (m.top_sites_trend && Object.keys(m.top_sites_trend).length) {
      Object.entries(m.top_sites_trend).forEach(([site, vals]) => {
        TOP_SITES_TRENDS[site] = vals.map(v => +Number(v).toFixed(2));
      });
    }

    if (m.shift_comparison?.length) {
      state.liveShiftComparison = m.shift_comparison;
    }
  }

  function kpiDirectionClass(direction) {
    if (direction === 'good') return 'down';
    if (direction === 'bad') return 'up';
    return 'neutral';
  }

  function updateMetricStripDOM(kpis) {
    if (!kpis) return;
    const dt = kpis.downtime_pct || {};
    const dtHrs = kpis.downtime_hrs || {};
    const stops = kpis.stops || {};
    const oee = kpis.oee || {};
    const html = `
      <div class="metric-card"><div class="metric-label">Unplanned DT %</div><div class="metric-value">${dt.value || '—'}</div><div class="metric-delta ${kpiDirectionClass(dt.direction)}">${dt.delta || ''}</div></div>
      <div class="metric-card"><div class="metric-label">Unplanned DT Hours</div><div class="metric-value">${formatKpiHoursDisplay(dtHrs.value)}</div><div class="metric-delta ${kpiDirectionClass(dtHrs.direction)}">${dtHrs.delta || ''}</div></div>
      <div class="metric-card"><div class="metric-label">STOPS</div><div class="metric-value">${stops.value || '—'}</div><div class="metric-delta ${kpiDirectionClass(stops.direction)}">${stops.delta || ''}</div></div>
      <div class="metric-card"><div class="metric-label">OEE</div><div class="metric-value">${oee.value || '—'}</div><div class="metric-delta ${kpiDirectionClass(oee.direction)}">${oee.delta || ''}</div></div>`;
    document.querySelectorAll('.metric-strip-root').forEach(root => {
      root.innerHTML = html;
    });
  }

  function updateAiSummariesDOM(metrics) {
    const tabs = metrics.tab_insights || {};
    Object.entries(tabs).forEach(([tab, text]) => {
      if (!text) return;
      document.querySelectorAll(`[data-ai-summary="${tab}"]`).forEach(el => {
        el.textContent = text;
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setBootStatus('Preparing Manufacturing Console');
    buildTopNav();
    initFilters();
    initCompare();
    initFocusMode();
    initDataStatusBar();
    renderKpiContent();
    switchPage('kpi-overview', true);
    switchKpiTab('overview', true);
    loadConsoleData(false);
    setTimeout(dismissBootSplash, 4000);
    document.addEventListener('click', closeSlicersOnOutsideClick);
  });

  const FOCUS_CANVAS_ID = 'focus-mode-canvas';

  /* ── Site/category data helpers ── */
  function activeSite() {
    return state.filters.site === 'All' ? 'ABERDEEN' : state.filters.site;
  }

  function categoryValuesForSite(site, category) {
    const mult = SITE_MULTIPLIERS[site] || 1;
    return (CATEGORY_BASE[category] || []).map(v => +(v * mult).toFixed(2));
  }

  function periodBaseTotals() {
    return activePeriods().map((_, i) => CATEGORIES.reduce((a, c) => a + (CATEGORY_BASE[c][i] || 0), 0));
  }

  function sitePeriodTotals(site) {
    const live = state.liveMetrics?.site_by_period?.[site];
    if (live?.length) return live.map(v => v == null ? null : +Number(v).toFixed(2));
    if (SITE_PERIOD_OVERRIDES[site]) return [...SITE_PERIOD_OVERRIDES[site]];
    const total = SITE_DT_TOTALS[site] || 5;
    const weights = [1.08, 1.02, 0.98, 0.94, 1.05, 1.1, 1.12, 0.92, 0.96, 1.0];
    const wSum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => +(total * w / wSum * 0.42).toFixed(2));
  }

  function categoryValuesForSiteHeatmap(site, category) {
    const liveCat = state.liveMetrics?.category_by_period?.[category];
    if (liveCat?.length) {
      const mult = SITE_MULTIPLIERS[site] || 1;
      return liveCat.map(v => v == null ? null : +(Number(v) * mult * 0.92).toFixed(2));
    }
    const sitePeriods = sitePeriodTotals(site);
    const base = CATEGORY_BASE[category] || [];
    const baseSum = periodBaseTotals();
    return activePeriods().map((_, i) => {
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
    activeHeatmapSites().forEach(site => {
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
    activeHeatmapSites().forEach(site => {
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

  function dayWeekTotals(day) {
    return activeDayTrendSeries(day).map(v => +Number(v).toFixed(2));
  }

  function shiftValuesForDay(day, shift) {
    const base = DOW_SHIFT_BASE[day]?.[shift];
    const weeks = activeWeeks();
    if (base) return base.slice(-weeks.length).map(v => +v.toFixed(2));
    const dayTrend = activeDayTrendSeries(day);
    const mult = shift === 1 ? 1.05 : shift === 2 ? 0.95 : 0.88;
    return dayTrend.map(v => +(v * mult).toFixed(2));
  }

  function exportDowHeatmapCSV(filename = 'unplanned-dt-by-day-of-week.csv') {
    const headers = ['Day of Week', 'Shift', ...DOW_WEEKS, 'Total', 'Total'];
    const rows = [headers];
    DAY_LABELS.forEach(day => {
      const dayPeriods = dayWeekTotals(day);
      const dayTotal = +avgOf(dayPeriods).toFixed(2);
      rows.push([day, '', ...dayPeriods, dayTotal, +(dayTotal * 1.05).toFixed(2)]);
      DOW_SHIFTS.forEach(shift => {
        const vals = shiftValuesForDay(day, shift);
        const total = +avgOf(vals).toFixed(2);
        rows.push([day, shift, ...vals, total, +(total * 1.05).toFixed(2)]);
      });
      rows.push([day, 'Total', ...dayPeriods, dayTotal, +(dayTotal * 1.05).toFixed(2)]);
    });
    downloadCSV(filename, rows);
  }

  function bindExportButtons() {
    const exports = {
      'export-overview-category': () => exportHeatmapCategoryCSV('overview-unplanned-dt-by-category.csv'),
      'export-heatmap-category': () => exportHeatmapCategoryCSV('unplanned-dt-by-category.csv'),
      'export-overview-line': () => exportLineHeatmapCSV('overview-unplanned-dt-by-line.csv'),
      'line-export-btn': () => exportLineHeatmapCSV('unplanned-dt-by-line.csv'),
      'dow-export-btn': () => exportDowHeatmapCSV('unplanned-dt-by-day-of-week.csv'),
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
    return `<td class="heat-cell ${extraClass}" style="background:${style.bg};color:${style.color}">${cellDisplayValue(value, true)}</td>`;
  }

  function summaryTd(vals, max = 8) {
    const summary = tableSummaryValue(vals);
    if (summary == null) return `<td class="heat-cell heat-empty col-total">-</td>`;
    if (isHoursDisplayMode()) {
      const style = heatStyle(Math.min(summary / totalDtHours() * yearAvgDtPct() * activePeriods().length, max), max, true);
      return `<td class="heat-cell col-total" style="background:${style.bg};color:${style.color}">${formatTableSummary(summary, false)}</td>`;
    }
    return heatTd(summary, max, 'col-total');
  }

  function heatmapLegendHTML(compact = false) {
    return `<div class="heatmap-legend${compact ? ' compact' : ''}">
      <span class="legend-label">Lower DT %</span>
      <div class="legend-bar"></div>
      <span class="legend-label">Higher DT %</span>
    </div>`;
  }

  function valClass(v) {
    const avg = yearAvgDtPct();
    if (v >= avg * 1.15) return 'val-high';
    if (v >= avg * 0.85) return 'val-mid';
    return 'val-low';
  }

  /* ── Top navigation ── */
  function buildTopNav() {
    const primary = document.getElementById('top-nav-primary');
    const secondary = document.getElementById('top-nav-secondary');
    if (!primary || !secondary) return;
    primary.innerHTML = '';
    secondary.innerHTML = '';

    PAGES.forEach(page => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'top-nav-item';
      btn.dataset.page = page.id;
      btn.setAttribute('role', 'tab');
      btn.innerHTML = `
        <span class="top-nav-icon">${ICONS[page.icon] || ICONS.kpi}</span>
        <span class="top-nav-label">${page.title}</span>`;
      btn.addEventListener('click', () => {
        if (page.children) {
          const wasOnPage = state.page === page.id;
          switchPage(page.id);
          if (!wasOnPage) switchKpiTab(page.children[0].id, true);
        } else {
          switchPage(page.id);
        }
      });
      primary.appendChild(btn);
    });

    const kpiPage = PAGES.find(p => p.id === 'kpi-overview');
    kpiPage?.children?.forEach(child => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'top-nav-subitem';
      btn.dataset.tab = child.id;
      btn.setAttribute('role', 'tab');
      btn.textContent = child.title;
      btn.title = child.desc;
      btn.addEventListener('click', () => {
        switchPage('kpi-overview', true);
        switchKpiTab(child.id);
      });
      secondary.appendChild(btn);
    });

    updateTopNavUI();
  }

  function updateTopNavUI() {
    document.querySelectorAll('.top-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === state.page);
      btn.setAttribute('aria-selected', btn.dataset.page === state.page ? 'true' : 'false');
    });

    const banner = document.getElementById('app-banner');
    const secondary = document.getElementById('top-nav-secondary');
    const showSubnav = state.page === 'kpi-overview';
    banner?.classList.toggle('has-subnav', showSubnav);
    secondary?.classList.toggle('visible', showSubnav);

    document.querySelectorAll('.top-nav-subitem').forEach(btn => {
      const active = showSubnav && btn.dataset.tab === state.kpiTab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
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
    const cardToggleId = btn.dataset.cardId;
    const view = cardToggleId ? (state.cardViews[cardToggleId] || 'table') : 'table';

    if (view === 'chart') {
      toggleDetailMode(btn, cardToggleId, cardId);
      return;
    }

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

  function toggleDetailMode(btn, cardToggleId, cardId) {
    const wasActive = btn.classList.contains('active');
    const detailContext = cardId === 'line' ? 'line' : 'category';

    document.querySelectorAll('.compare-btn-card').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.compare-hint').forEach(h => h.remove());
    closeInlinePanel();

    if (wasActive) {
      state.detailMode = false;
      state.detailContext = null;
    } else {
      state.detailMode = true;
      state.detailContext = detailContext;
      btn.classList.add('active');
      addDetailHint(btn, cardToggleId, detailContext);
    }
  }

  function addDetailHint(btn, cardToggleId, detailContext) {
    const cardBody = btn.closest('.data-card')?.querySelector('.data-card-body');
    if (!cardBody) return;
    const hint = document.createElement('div');
    hint.className = 'compare-hint';
    hint.textContent = detailContext === 'line'
      ? 'Click a line on the chart for detailed view.'
      : 'Click a category on the chart for detailed view.';
    const chartView = cardBody.querySelector(`#view-${cardToggleId}-chart`);
    if (chartView) cardBody.insertBefore(hint, chartView);
    else cardBody.prepend(hint);
  }

  function addCompareHint(btn, cardId) {
    const cardBody = btn.closest('.data-card')?.querySelector('.data-card-body');
    if (!cardBody) return;
    const hint = document.createElement('div');
    hint.className = 'compare-hint';
    hint.textContent = cardId === 'dow'
      ? 'Select a shift to compare across days of the week.'
      : cardId === 'line' || cardId === 'line-tab'
      ? 'Select a line to compare across sites.'
      : 'Select a category to compare across sites.';
    const tableView = cardBody.querySelector('.category-table-view, .panel-overlay-host');
    if (tableView) cardBody.insertBefore(hint, tableView);
    else cardBody.prepend(hint);
  }

  function refreshAllTables() {
    const metricLabel = tableMetricLabel();
    document.querySelectorAll('.data-card-title').forEach(el => {
      const t = el.textContent || '';
      if (t.includes('Unplanned DT % by Category') || t.includes('Unplanned Downtime in Hours by Category')) {
        el.textContent = `${metricLabel} by Category`;
      }
      if (t.includes('Unplanned DT % by Line') || t.includes('Unplanned Downtime in Hours by Line')) {
        el.textContent = `${metricLabel} by Line/Category`;
      }
      if (t.includes('Unplanned DT % by Day of Week') || t.includes('Unplanned Downtime in Hours by Day of Week')) {
        el.textContent = `${metricLabel} by Day of Week`;
      }
    });
    const catOverview = document.getElementById('view-category-table');
    if (catOverview) catOverview.innerHTML = buildHeatmapTable(true);
    const heatmapTab = document.getElementById('view-heatmap-table');
    if (heatmapTab) heatmapTab.innerHTML = buildHeatmapTable(false);
    const lineEl = document.getElementById('view-line-table');
    if (lineEl) lineEl.innerHTML = buildLineHeatmapTable(true);
    const lineTabEl = document.getElementById('view-line-tab-table');
    if (lineTabEl) lineTabEl.innerHTML = buildLineHeatmapTable(false);
    const dowEl = document.getElementById('view-dow-table');
    if (dowEl) dowEl.innerHTML = buildDowHeatmapTable(false);
    bindHeatmapTableEvents();
    bindLineHeatmapEvents();
    bindDowHeatmapEvents();
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
    state.compareDay = null;
    state.compareShift = null;
    state.detailCategory = null;
    document.querySelectorAll('#inline-panel').forEach(p => p.remove());
    destroyChart('compare-chart');
    destroyChart('detail-chart');
    document.querySelectorAll('.cat-row, .heat-cat-row, .line-detail-row, .dow-shift-row').forEach(r => {
      r.classList.remove('compare-active', 'detail-active');
    });
  }

  const FOCUS_CHARTS = {
    'chart-dow': { render: id => makeDowTrendLineChart(id, 'all') },
    'chart-reason': { render: id => makeReasonChart(id) },
    'chart-trend': { render: id => makeReasonTrendLineChart(id, 'all') },
    'chart-category': {
      chartViewOnly: true,
      render: id => makeGroupedBarChart(id, CATEGORIES, CATEGORY_BASE, 8, null),
    },
    'chart-line': {
      chartViewOnly: true,
      render: id => makeGroupedBarChart(id, LINES, LINE_BASE, 14, null),
    },
    'chart-top-sites': {
      selectId: 'top-sites-select',
      render: id => makeTopSitesLineChart(id, state.topSitesCount),
    },
    'chart-cat-by-site': {
      selectId: 'site-metric-select',
      render: id => makeSiteBarChart(id),
    },
    'chart-cat-all-sites': {
      selectId: 'cat-metric-select',
      render: id => makeCategoryBarChart(id),
    },
    'chart-top-lines': {
      selectId: 'top-lines-select',
      render: id => makeTopLinesBarChart(id, parseInt(document.getElementById('top-lines-select')?.value || '10', 10)),
    },
    'chart-line-donut': {
      selectId: 'line-donut-select',
      isDonut: true,
      render: id => makeCategoryDonutChart(id),
    },
    'chart-line-trend': {
      selectId: 'line-trend-select',
      render: id => makeLineTrendChart(id, state.lineTrendFilter),
    },
    'chart-tab-dow': {
      selectId: 'dow-chart-select',
      render: id => makeDowTrendLineChart(id, document.getElementById('dow-chart-select')?.value || 'all'),
    },
    'chart-tab-reason-trend': {
      selectId: 'reason-trend-select',
      render: id => makeReasonTrendLineChart(id, state.reasonTrendFilter),
    },
  };

  function focusModeBtnHTML(chartId, chartViewOnly = false) {
    const extraClass = chartViewOnly ? ' chart-view-only' : '';
    return `<button type="button" class="focus-mode-btn${extraClass}" data-focus-chart="${chartId}" title="Focus Mode" aria-label="Open expanded focus view">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
      Focus
    </button>`;
  }

  function ensureFocusOverlay() {
    if (document.getElementById('focus-mode-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div id="focus-mode-overlay" class="focus-mode-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="focus-mode-title">
        <div class="focus-mode-backdrop" aria-hidden="true"></div>
        <div class="focus-mode-panel">
          <div class="focus-mode-header">
            <div class="focus-mode-header-text">
              <h2 class="focus-mode-title" id="focus-mode-title"></h2>
              <p class="focus-mode-sub"></p>
            </div>
            <div class="focus-mode-header-actions">
              <select class="chart-select focus-mode-select hidden" aria-label="Focus view filter"></select>
              <button type="button" class="focus-mode-close" aria-label="Close focus mode">&times;</button>
            </div>
          </div>
          <div class="focus-mode-body">
            <div id="focus-mode-visual-host"></div>
          </div>
        </div>
      </div>`);
  }

  function closeFocusMode() {
    destroyChart(FOCUS_CANVAS_ID);
    const overlay = document.getElementById('focus-mode-overlay');
    overlay?.classList.add('hidden');
    document.body.classList.remove('focus-mode-open');
    state.focusSourceChartId = null;
  }

  function openFocusMode(sourceChartId) {
    const config = FOCUS_CHARTS[sourceChartId];
    if (!config) return;

    ensureFocusOverlay();
    closeInlinePanel();

    const btn = document.querySelector(`.focus-mode-btn[data-focus-chart="${sourceChartId}"]`);
    const card = btn?.closest('.data-card');
    const title = card?.querySelector('.data-card-title')?.textContent?.trim() || 'Visual';
    const sub = card?.querySelector('.chart-card-sub')?.textContent?.trim() || '';

    const overlay = document.getElementById('focus-mode-overlay');
    const host = document.getElementById('focus-mode-visual-host');
    const focusSelect = overlay.querySelector('.focus-mode-select');

    if (config.isDonut) {
      host.innerHTML = `<div class="donut-chart-layout focus-donut-layout">
        <div class="donut-canvas-wrap focus-donut-canvas-wrap"><canvas id="${FOCUS_CANVAS_ID}"></canvas></div>
        <div class="donut-legend" id="${FOCUS_CANVAS_ID}-legend" aria-label="Category legend"></div>
      </div>`;
    } else {
      host.innerHTML = `<div class="focus-mode-chart-wrap"><canvas id="${FOCUS_CANVAS_ID}"></canvas></div>`;
    }

    overlay.querySelector('.focus-mode-title').textContent = title;
    const subEl = overlay.querySelector('.focus-mode-sub');
    subEl.textContent = sub;
    subEl.style.display = sub ? '' : 'none';

    focusSelect.replaceWith(focusSelect.cloneNode(true));
    const freshSelect = overlay.querySelector('.focus-mode-select');
    if (config.selectId) {
      const srcSelect = document.getElementById(config.selectId);
      if (srcSelect) {
        freshSelect.innerHTML = srcSelect.innerHTML;
        freshSelect.value = srcSelect.value;
        freshSelect.classList.remove('hidden');
        freshSelect.addEventListener('change', e => {
          srcSelect.value = e.target.value;
          srcSelect.dispatchEvent(new Event('change', { bubbles: true }));
          config.render(FOCUS_CANVAS_ID);
        });
      } else {
        freshSelect.classList.add('hidden');
      }
    } else {
      freshSelect.classList.add('hidden');
    }

    overlay.classList.remove('hidden');
    document.body.classList.add('focus-mode-open');
    state.focusSourceChartId = sourceChartId;

    requestAnimationFrame(() => {
      config.render(FOCUS_CANVAS_ID);
      overlay.querySelector('.focus-mode-close')?.focus();
    });
  }

  function initFocusMode() {
    ensureFocusOverlay();
    document.addEventListener('click', e => {
      const btn = e.target.closest('.focus-mode-btn');
      if (btn?.dataset.focusChart) {
        e.preventDefault();
        openFocusMode(btn.dataset.focusChart);
        return;
      }
      if (e.target.closest('.focus-mode-close') || e.target.classList.contains('focus-mode-backdrop')) {
        closeFocusMode();
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.focusSourceChartId) closeFocusMode();
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

  function openShiftComparePanel(shift, anchorEl, cardBody) {
    closeInlinePanel();
    state.compareShift = shift;

    const rows = DAY_LABELS.map(day => {
      const vals = shiftValuesForDay(day, shift);
      const total = avgOf(vals);
      return { day, vals, total };
    });
    const best = rows.reduce((a, b) => (a.total < b.total ? a : b));
    const worst = rows.reduce((a, b) => (a.total > b.total ? a : b));

    const panel = document.createElement('div');
    panel.id = 'inline-panel';
    panel.className = 'inline-panel';
    panel.innerHTML = `
      <div class="inline-panel-header">
        <div>
          <div class="inline-panel-title">Shift ${shift} — Day of Week Comparison</div>
          <div class="inline-panel-sub">Unplanned DT % by week · ${activeSite()}</div>
        </div>
        <button type="button" class="inline-panel-close" aria-label="Close">&times;</button>
      </div>
      <div class="inline-panel-body overlay-panel-body">
        <div class="compare-chart-wrap"><canvas id="compare-chart"></canvas></div>
        <div class="table-scroll">
          <table class="data-table compare-table">
            <thead><tr>
              <th>Day of Week</th>
              ${DOW_WEEKS.map(w => `<th>${w}</th>`).join('')}
              <th>Avg</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => {
                const cls = r.day === best.day ? 'site-best' : r.day === worst.day ? 'site-worst' : '';
                return `<tr class="${cls}">
                  <td>${r.day}</td>
                  ${r.vals.map(v => heatTd(v, 16).replace('class="heat-cell"', 'class="heat-cell compare-cell"')).join('')}
                  ${heatTd(r.total, 16, 'col-total compare-cell')}
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
          labels: DOW_WEEKS,
          datasets: rows.map((r, i) => ({
            label: r.day,
            data: r.vals,
            backgroundColor: DOW_DAY_COLORS[i] || DOW_SHIFT_COLORS[i % DOW_SHIFT_COLORS.length],
            borderRadius: { topLeft: 3, topRight: 3 },
            borderSkipped: false,
          })),
        },
        options: {
          ...CHART_DEFAULTS,
          plugins: { ...CHART_DEFAULTS.plugins, legend: { ...CHART_DEFAULTS.plugins.legend, position: 'bottom' } },
          scales: {
            y: { beginAtZero: true, max: 20, grid: { color: 'rgba(0,40,85,0.06)' }, ticks: { callback: v => v + '%' } },
            x: { grid: { display: false }, ticks: { ...HORIZONTAL_X_TICKS, autoSkip: true, maxTicksLimit: 11, font: { size: 9 } } },
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
            <div class="detail-stat"><div class="detail-stat-label">vs ${yearAvgDtPct().toFixed(2)}% Avg</div><div class="detail-stat-value ${avg >= yearAvgDtPct() ? 'val-high' : 'val-low'}">${avg >= yearAvgDtPct() ? 'Above avg' : 'Below avg'}</div></div>
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
            <div class="detail-stat"><div class="detail-stat-label">vs ${yearAvgDtPct().toFixed(2)}% Avg</div><div class="detail-stat-value ${avg >= yearAvgDtPct() ? 'val-high' : 'val-low'}">${avg >= yearAvgDtPct() ? 'Above avg' : 'Below avg'}</div></div>
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
    wrap.dataset.slicerId = cfg.id;
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
      selectAll.addEventListener('click', e => { e.stopPropagation(); state.filters[cfg.id] = [...cfg.options]; refreshSlicer(wrap, cfg); scheduleDataReload(cfg.id); });
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
    const options = cfg.id === 'site' ? siteSlicerOptions() : cfg.options;
    options.filter(opt => !term || opt.toLowerCase().includes(term)).forEach(opt => {
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
        syncSiteRegionFilters(cfg.id);
        if (cfg.id === 'site' || cfg.id === 'region') refreshAllSlicers();
        scheduleDataReload(cfg.id);
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

    const run = () => {
      document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active', 'leaving'));
      next?.classList.add('active');
      state.page = pageId;
      updateTopNavUI();
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
    updateTopNavUI();
    if (state.liveMetrics?.kpis) updateMetricStripDOM(state.liveMetrics.kpis);
    requestAnimationFrame(() => refreshChartsForTab(tabId));
  }

  function refreshChartsForTab(tabId) {
    if (tabId === 'overview') initOverviewCharts();
    else initTabCharts(tabId);
  }

  /* ── Content builders ── */
  function metricStripHTML() {
    return `<div class="metric-strip metric-strip-root">
      <div class="metric-card"><div class="metric-label">Unplanned DT %</div><div class="metric-value">—</div><div class="metric-delta neutral">Loading…</div></div>
      <div class="metric-card"><div class="metric-label">Unplanned DT Hours</div><div class="metric-value">—</div><div class="metric-delta neutral"></div></div>
      <div class="metric-card"><div class="metric-label">STOPS</div><div class="metric-value">—</div><div class="metric-delta neutral"></div></div>
      <div class="metric-card"><div class="metric-label">OEE</div><div class="metric-value">—</div><div class="metric-delta neutral"></div></div>
    </div>`;
  }

  function aiSummaryHTML() {
    return `<div class="ai-summary"><div class="ai-summary-icon">✦</div><div>
      <div class="ai-summary-label">AI Summary</div>
      <p class="ai-summary-text" data-ai-summary="overview">Overall unplanned downtime shows variation across sites, lines, categories, days, and periods. Equipment and Changeover categories drive the largest share at Aberdeen, with BCP1 and SUN1 lines contributing disproportionately. Latest periods (P8–P10) show an upward trend — prioritize Mechanical failure root causes and Shift B handover gaps.</p>
    </div></div>`;
  }

  function categoryTabSummaryHTML() {
    return `<div class="ai-summary"><div class="ai-summary-icon">✦</div><div>
      <div class="ai-summary-label">AI Summary</div>
      <p class="ai-summary-text" data-ai-summary="category">Unplanned downtime is primarily driven by a few key categories and sites. Equipment and Operation categories contribute the largest share across the network, while Bridgeview and Brookhollow lead site-level totals. Periods P8–P10 show elevated Equipment downtime — prioritize mechanical failure root causes and cross-site benchmarking for Changeover and Sanitation categories.</p>
    </div></div>`;
  }

  function lineTabSummaryHTML() {
    return `<div class="ai-summary"><div class="ai-summary-icon">✦</div><div>
      <div class="ai-summary-label">AI Summary</div>
      <p class="ai-summary-text" data-ai-summary="line">Line-level downtime is concentrated in a few high-impact line/category combinations. TCS1 and SUN1 at Aberdeen drive disproportionate share, while Bridgeview site totals remain elevated across periods. Prioritize mechanical failures on top lines and standardize changeover procedures across HP17T1 and FLK17T1 performers.</p>
    </div></div>`;
  }

  function lineValuesForSite(site, line) {
    const live = state.liveMetrics?.line_by_period?.[line];
    if (live?.length) {
      const mult = SITE_MULTIPLIERS[site] || 1;
      return live.map(v => v == null ? null : +(Number(v) * mult * 0.92).toFixed(2));
    }
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
    const periods = activePeriods();
    const year = state.filters.year || state.liveMetrics?.meta?.year || '2026';
    const summaryHdr = tableSummaryHeader();
    let rows = '';

    activeHeatmapSites().forEach(site => {
      const expanded = !!state.expandedLineSites[site];
      const sitePeriods = linePeriodTotalsForSite(site);
      const chevron = expanded ? '▼' : '▶';

      rows += `<tr class="site-row${expanded ? ' expanded' : ''}" data-site="${site}">
        <td class="site-name-cell">
          <button type="button" class="line-site-toggle" data-site="${site}" aria-label="Toggle ${site}">${chevron}</button>
          <span>${site}</span>
        </td>
        <td class="cat-label-cell"></td>
        ${sitePeriods.map(v => heatTd(v, 35)).join('')}
        ${summaryTd(sitePeriods, 35)}
      </tr>`;

      if (expanded) {
        LINES.forEach(line => {
          const vals = lineValuesForSite(site, line);
          const activeCompare = state.compareLine === line ? ' compare-active' : '';
          rows += `<tr class="line-detail-row${compareReady}${activeCompare}" data-line="${line}">
            <td class="site-name-cell indent"></td>
            <td class="cat-label-cell">${line}</td>
            ${vals.map(v => heatTd(v, 14)).join('')}
            ${summaryTd(vals, 14)}
          </tr>`;
        });

        const childTotals = childPeriodTotals(site, LINES, lineValuesForSite);
        rows += `<tr class="row-total heat-site-total">
          <td class="site-name-cell indent"></td>
          <td class="cat-label-cell">Site Total</td>
          ${childTotals.map(v => heatTd(v, 35)).join('')}
          ${summaryTd(childTotals, 35)}
        </tr>`;
      }
    });

    return `<div class="table-scroll heatmap-scroll">${showLegend ? heatmapLegendHTML(true) : ''}<table class="data-table heatmap-table"><thead>
      <tr class="header-group"><th rowspan="2">Site</th><th rowspan="2">Line</th>
        <th colspan="${periods.length}">${year}</th><th rowspan="2">${summaryHdr}</th></tr>
      <tr>${periods.map(p => `<th>${p}</th>`).join('')}</tr>
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
            <span class="status-badge accent">OVERALL DT AVG <strong>—</strong></span>
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
            ${compareButtonHTML('line-tab', 'line', 'table')}
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

  function dowTabSummaryHTML() {
    return `<div class="ai-summary"><div class="ai-summary-icon">✦</div><div>
      <div class="ai-summary-label">AI Summary</div>
      <p class="ai-summary-text" data-ai-summary="dow">Unplanned downtime varies meaningfully by day of week and shift. Thursday and Tuesday show the highest DT % across recent weeks, while Saturday remains the lowest. Shift 1 consistently drives elevated downtime on Sundays and Thursdays — prioritize handover gaps and mechanical failures on those combinations for targeted improvement.</p>
    </div></div>`;
  }

  function reasonTabSummaryHTML() {
    return `<div class="ai-summary"><div class="ai-summary-icon">✦</div><div>
      <div class="ai-summary-label">AI Summary</div>
      <p class="ai-summary-text" data-ai-summary="reason">Unplanned DT % fluctuates across periods with a recent peak in P4 (8.85%) and a low in P3 (7.49%). "No Event" remains the top contributor at 6,255 hours (0.48%), followed by Unplanned Sanitation and Insufficient Qualified Staff. Focus root-cause reduction on the top three reasons to drive the largest period-over-period improvement.</p>
    </div></div>`;
  }

  function buildReasonTable(count = 20) {
    const rows = activeReasonsData().slice(0, count);
    const maxHours = rows[0]?.hours || 1;
    return `<div class="table-scroll reason-table-scroll">
      <table class="data-table reason-table">
        <thead><tr>
          <th class="reason-rank-col">#</th>
          <th class="reason-name-col">Reason</th>
          <th class="reason-bar-col">Unplanned DT Hours</th>
          <th class="reason-pct-col">Unplanned DT %</th>
        </tr></thead>
        <tbody>${rows.map((r, i) => {
          const barWidth = (r.hours / maxHours) * 100;
          const color = PERIOD_COLORS[i % PERIOD_COLORS.length];
          const hoursStr = r.hours.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return `<tr>
            <td class="reason-rank-col">${i + 1}</td>
            <td class="reason-name-col">${r.reason}</td>
            <td class="reason-bar-cell">
              <div class="reason-bar-track"><div class="reason-bar" style="width:${barWidth}%;background-color:${color}"></div></div>
              <span class="reason-hours-val">${hoursStr}</span>
            </td>
            <td class="reason-pct-col">${r.pct.toFixed(2)} %</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  }

  function reasonTableCardHTML() {
    return `<div class="data-card chart-card-pro reason-table-card">
      <div class="data-card-header chart-card-header-pro">
        <span class="data-card-title">Unplanned DT Hours by Reason</span>
        <select class="chart-select" id="reason-count-select" aria-label="Top reasons count">
          <option value="20"${state.reasonCount === 20 ? ' selected' : ''}>Top 20</option>
          <option value="10"${state.reasonCount === 10 ? ' selected' : ''}>Top 10</option>
          <option value="5"${state.reasonCount === 5 ? ' selected' : ''}>Top 5</option>
        </select>
      </div>
      <div class="data-card-body reason-table-body">${buildReasonTable(state.reasonCount)}</div>
    </div>`;
  }

  function buildDowHeatmapTable(showLegend = true) {
    const compareReady = state.compareMode && state.compareContext === 'dow' ? ' compare-ready' : '';
    const weeks = activeWeeks();
    const year = state.filters.year || state.liveMetrics?.meta?.year || '2026';
    const summaryHdr = tableSummaryHeader();
    let rows = '';

    DAY_LABELS.forEach(day => {
      const expanded = !!state.expandedDowDays[day];
      const dayPeriods = dayWeekTotals(day);
      const chevron = expanded ? '▼' : '▶';

      rows += `<tr class="site-row dow-day-row${expanded ? ' expanded' : ''}" data-day="${day}">
        <td class="site-name-cell">
          <button type="button" class="dow-day-toggle" data-day="${day}" aria-label="Toggle ${day}">${chevron}</button>
          <span>${day}</span>
        </td>
        <td class="cat-label-cell"></td>
        ${dayPeriods.map(v => heatTd(v, 16)).join('')}
        ${summaryTd(dayPeriods, 16)}
      </tr>`;

      if (expanded) {
        DOW_SHIFTS.forEach(shift => {
          const vals = shiftValuesForDay(day, shift);
          const activeCompare = state.compareShift === shift ? ' compare-active' : '';
          rows += `<tr class="line-detail-row dow-shift-row${compareReady}${activeCompare}" data-shift="${shift}">
            <td class="site-name-cell indent"></td>
            <td class="cat-label-cell">${shift}</td>
            ${vals.map(v => heatTd(v, 16)).join('')}
            ${summaryTd(vals, 16)}
          </tr>`;
        });

        rows += `<tr class="row-total heat-site-total">
          <td class="site-name-cell indent"></td>
          <td class="cat-label-cell">Total</td>
          ${dayPeriods.map(v => heatTd(v, 16)).join('')}
          ${summaryTd(dayPeriods, 16)}
        </tr>`;
      }
    });

    return `<div class="table-scroll heatmap-scroll">${showLegend ? heatmapLegendHTML(true) : ''}<table class="data-table heatmap-table"><thead>
      <tr class="header-group"><th rowspan="2">Day of Week</th><th rowspan="2">Shift</th>
        <th colspan="${weeks.length}">${year}</th><th rowspan="2">${summaryHdr}</th></tr>
      <tr>${weeks.map(w => `<th>${w.replace(String(year), '')}</th>`).join('')}</tr>
      </thead><tbody>${rows}</tbody></table></div>`;
  }

  function dowHeatmapCardHTML() {
    return `<div class="data-card heatmap-card">
      <div class="data-card-header heatmap-header">
        <div class="heatmap-header-left">
          <span class="data-card-title">Unplanned DT % by Day of Week</span>
          <span class="chart-card-sub">Percentage of unplanned downtime by shift across weeks (YTD)</span>
        </div>
        <div class="heatmap-header-right">
          <select class="chart-select" id="dow-view-select" aria-label="View mode">
            <option value="percentage">Percentage</option>
            <option value="hours">Hours</option>
          </select>
          <div class="heatmap-legend">
            <span class="legend-label">Lower DT %</span>
            <div class="legend-bar"></div>
            <span class="legend-label">Higher DT %</span>
          </div>
          <div class="card-header-actions">
            ${exportBtnHTML('dow-export-btn')}
            ${compareButtonHTML('dow', 'shift', 'table')}
          </div>
        </div>
      </div>
      <div class="data-card-body">
        <div id="view-dow-table" class="panel-overlay-host">${buildDowHeatmapTable(false)}</div>
      </div>
    </div>`;
  }

  function bindDowHeatmapEvents() {
    document.querySelectorAll('.dow-day-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const day = btn.dataset.day;
        state.expandedDowDays[day] = !state.expandedDowDays[day];
        refreshAllTables();
      });
    });
    document.querySelectorAll('.dow-shift-row').forEach(row => {
      row.addEventListener('click', () => {
        if (!state.compareMode || state.compareContext !== 'dow') return;
        const shift = parseInt(row.dataset.shift, 10);
        if (!shift) return;
        const cardBody = row.closest('.data-card-body');
        if (cardBody) openShiftComparePanel(shift, row, cardBody);
      });
    });
  }

  function buildHeatmapTable(showLegend = true) {
    const compareReady = state.compareMode && (state.compareContext === 'category' || state.compareContext === 'heatmap') ? ' compare-ready' : '';
    const periods = activePeriods();
    const year = state.filters.year || state.liveMetrics?.meta?.year || '2026';
    const summaryHdr = tableSummaryHeader();
    let rows = '';

    activeHeatmapSites().forEach(site => {
      const expanded = !!state.expandedHeatmapSites[site];
      const sitePeriods = sitePeriodTotals(site);
      const chevron = expanded ? '▼' : '▶';

      rows += `<tr class="site-row${expanded ? ' expanded' : ''}" data-site="${site}">
        <td class="site-name-cell">
          <button type="button" class="site-toggle" data-site="${site}" aria-label="Toggle ${site}">${chevron}</button>
          <span>${site}</span>
        </td>
        <td class="cat-label-cell"></td>
        ${sitePeriods.map(v => heatTd(v, 35)).join('')}
        ${summaryTd(sitePeriods, 35)}
      </tr>`;

      if (expanded) {
        CATEGORIES.forEach(cat => {
          const vals = categoryValuesForSiteHeatmap(site, cat);
          const activeCompare = state.compareCategory === cat ? ' compare-active' : '';
          const activeDetail = state.detailCategory === cat ? ' detail-active' : '';
          rows += `<tr class="cat-row heat-cat-row${compareReady}${activeCompare}${activeDetail}" data-category="${cat}" data-site="${site}">
            <td class="site-name-cell indent"></td>
            <td class="cat-label-cell">${cat}</td>
            ${vals.map(v => heatTd(v, 8)).join('')}
            ${summaryTd(vals, 12)}
          </tr>`;
        });

        const childTotals = childPeriodTotals(site, CATEGORIES, categoryValuesForSiteHeatmap);
        rows += `<tr class="row-total heat-site-total">
          <td class="site-name-cell indent"></td>
          <td class="cat-label-cell">Total</td>
          ${childTotals.map(v => heatTd(v, 35)).join('')}
          ${summaryTd(childTotals, 35)}
        </tr>`;
      }
    });

    return `<div class="table-scroll heatmap-scroll">${showLegend ? heatmapLegendHTML(true) : ''}<table class="data-table heatmap-table"><thead>
      <tr class="header-group"><th rowspan="2">Site</th><th rowspan="2">Year / Category</th>
        <th colspan="${periods.length}">${year}</th><th rowspan="2">${summaryHdr}</th></tr>
      <tr>${periods.map(p => `<th>${p}</th>`).join('')}</tr>
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
        if (!state.compareMode || state.compareContext === 'line' || state.compareContext === 'dow') return;
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
            <span class="status-badge accent">OVERALL DT AVG <strong>—</strong></span>
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
        if (!state.compareMode || state.compareContext === 'line' || state.compareContext === 'dow') return;
        const category = row.dataset.category;
        const cardBody = row.closest('.data-card-body');
        if (cardBody) openComparePanel(category, row, cardBody);
      });
    });
  }

  function refreshCategoryTable() {
    refreshAllTables();
  }

  function getCompareLabel(compareType, view = 'table') {
    if (view === 'chart') return 'Detailed view';
    if (compareType === 'line') return 'Compare Line';
    if (compareType === 'shift') return 'Compare Shift';
    return 'Compare Category';
  }

  function compareButtonId(cardId) {
    if (cardId === 'heatmap') return 'compare-btn-heatmap';
    if (cardId === 'line-tab') return 'compare-btn-line-tab';
    if (cardId === 'dow') return 'compare-btn-dow';
    return `compare-btn-${cardId}`;
  }

  function compareButtonHTML(cardId, compareType = 'category', view = 'table') {
    const label = getCompareLabel(compareType, view);
    const btnId = compareButtonId(cardId);
    const cardAttr = compareType === 'line' ? 'line' : compareType === 'shift' ? 'dow' : cardId === 'heatmap' ? 'heatmap' : 'category';
    const title = view === 'chart'
      ? 'Click chart bars for a detailed view'
      : compareType === 'line'
        ? 'Compare line across sites'
        : compareType === 'shift'
          ? 'Compare shifts for a selected day'
          : 'Compare category across sites';
    return `<button type="button" class="compare-btn-card" id="${btnId}" data-compare-card="${cardAttr}" data-compare-type="${compareType}" data-card-id="${cardId}" title="${title}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
        <span class="compare-btn-label">${label}</span>
      </button>`;
  }

  function updateCompareButtonLabel(cardId) {
    const btn = document.getElementById(compareButtonId(cardId));
    if (!btn) return;
    const compareType = btn.dataset.compareType || 'category';
    const view = state.cardViews[cardId] || 'table';
    const label = getCompareLabel(compareType, view);
    const labelEl = btn.querySelector('.compare-btn-label');
    if (labelEl) labelEl.textContent = label;
    btn.title = view === 'chart'
      ? 'Click chart bars for a detailed view'
      : compareType === 'line'
        ? 'Compare line across sites'
        : compareType === 'shift'
          ? 'Compare shifts for a selected day'
          : 'Compare category across sites';
  }

  function categoryCardActions(cardId, includeToggle, exportId = null, compareType = 'category') {
    const exportBtn = exportId ? exportBtnHTML(exportId) : '';
    const view = includeToggle ? (state.cardViews[cardId] || 'table') : 'table';
    const compareBtn = compareButtonHTML(cardId, compareType, view);
    const focusBtn = includeToggle ? focusModeBtnHTML(`chart-${cardId}`, true) : '';
    const toggle = includeToggle ? `<div class="view-toggle">
        <button type="button" class="view-toggle-btn active" data-view="table" data-card="${cardId}" title="Table"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></button>
        <button type="button" class="view-toggle-btn" data-view="chart" data-card="${cardId}" title="Chart"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 16l4-8 4 5 5-9"/></svg></button>
      </div>` : '';
    return `<div class="card-header-actions">${exportBtn}${compareBtn}${focusBtn}${toggle}</div>`;
  }

  function dataCard(title, body, toggleId, compareCard = false, exportId = null, compareType = 'category') {
    const canvasMatch = body.match(/<canvas id="([^"]+)"/);
    const chartFocusBtn = canvasMatch && !toggleId ? focusModeBtnHTML(canvasMatch[1]) : '';
    const actions = (compareCard || toggleId)
      ? (compareCard ? categoryCardActions(toggleId, !!toggleId, exportId, compareType) : `<div class="card-header-actions">${exportId ? exportBtnHTML(exportId) : ''}<div class="view-toggle">
          <button type="button" class="view-toggle-btn active" data-view="table" data-card="${toggleId}" title="Table"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></button>
          <button type="button" class="view-toggle-btn" data-view="chart" data-card="${toggleId}" title="Chart"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 16l4-8 4 5 5-9"/></svg></button>
        </div></div>`)
      : (chartFocusBtn ? `<div class="card-header-actions">${chartFocusBtn}</div>` : '');
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
        ${dataCard('Unplanned DT % by Week Trend (Latest 6 Weeks)', '<div class="chart-wrap short"><canvas id="chart-trend"></canvas></div>')}
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
    document.getElementById('kpi-tab-by-dow').innerHTML = `
      ${metricStripHTML()}
      ${dowTabSummaryHTML()}
      ${chartCardWithSelect('Unplanned DT % Trend by Day of Week (YTD)', 'Trend of unplanned downtime percentage by day across recent weeks.', 'chart-tab-dow', 'dow-chart-select', [
        { value: 'all', label: 'All Days' },
        ...DAY_LABELS.map(d => ({ value: d, label: d })),
      ])}
      ${dowHeatmapCardHTML()}`;
    bindCompareButtons();
    bindExportButtons();
    bindDowHeatmapEvents();
    bindByDowControls();
    document.getElementById('kpi-tab-by-reason').innerHTML = `
      ${metricStripHTML()}
      ${reasonTabSummaryHTML()}
      <div class="overview-grid-2">
        ${reasonTableCardHTML()}
        ${chartCardWithSelect('Unplanned DT % by Period Trend', '', 'chart-tab-reason-trend', 'reason-trend-select', [
          { value: 'all', label: 'All Periods' },
          { value: '5', label: 'Last 5 Periods' },
          { value: '3', label: 'Last 3 Periods' },
        ])}
      </div>`;
    bindByReasonControls();
  }

  function toggleCardView(cardId, view) {
    closeInlinePanel();
    state.cardViews[cardId] = view;
    updateCompareButtonLabel(cardId);
    state.detailMode = false;
    state.detailContext = null;
    if (view === 'chart') {
      state.compareMode = false;
      state.compareContext = null;
      document.querySelectorAll('.compare-btn-card.active').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.compare-hint').forEach(h => h.remove());
    }
    document.querySelectorAll(`.view-toggle-btn[data-card="${cardId}"]`).forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    const card = document.querySelector(`.view-toggle-btn[data-card="${cardId}"]`)?.closest('.data-card');
    if (card) card.classList.toggle('chart-view-active', view === 'chart');
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
          if (!state.detailMode || state.detailContext !== 'category') return;
          const host = canvas.closest('.panel-overlay-host');
          if (host) openCategoryDetailPanel(cat, host);
        });
      }
      if (cardId === 'line') {
        makeGroupedBarChart('chart-line', LINES, LINE_BASE, 14, (line, canvas) => {
          if (!state.detailMode || state.detailContext !== 'line') return;
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

  function linePointLabelPlugin(formatFn) {
    return {
      id: 'linePointLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((dataset, i) => {
          chart.getDatasetMeta(i).data.forEach((point, idx) => {
            const val = dataset.data[idx];
            if (val == null) return;
            ctx.save();
            ctx.fillStyle = '#1e293b';
            ctx.font = '600 10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(formatFn(val), point.x, point.y - 10);
            ctx.restore();
          });
        });
      },
    };
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

  function makeGroupedBarChart(canvasId, labels, matrix, yMaxHint, onCategoryClick) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const allVals = labels.flatMap(l => matrix[l] || []);
    const peak = Math.max(...allVals, 0);
    const yMax = Math.max(yMaxHint || 8, Math.ceil(peak * 1.2 / 5) * 5 || 10);
    const datasets = activePeriods().map((p, i) => ({
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

  function makeDowTrendLineChart(canvasId, filter = 'all') {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    const days = filter === 'all' ? DAY_LABELS : [filter];
    const weeks = activeWeeks();
    const series = days.flatMap(day => activeDayTrendSeries(day));
    const peak = Math.max(...series, 0);
    const yMax = Math.max(8, Math.ceil((peak + 2) / 2) * 2);
    const yMin = 0;
    state.charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: weeks,
        datasets: days.map((day, i) => {
          const color = DOW_DAY_COLORS[DAY_LABELS.indexOf(day)] || DOW_DAY_COLORS[i];
          const grad = ctx.createLinearGradient(0, 0, 0, 320);
          grad.addColorStop(0, color + '35');
          grad.addColorStop(1, color + '00');
          return {
            label: day,
            data: activeDayTrendSeries(day),
            borderColor: color,
            backgroundColor: grad,
            fill: true,
            tension: 0.42,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: color,
            pointBorderWidth: 2,
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
            min: yMin,
            max: yMax,
            ...PRO_AXIS,
            title: proAxisTitle('Unplanned DT %'),
            ticks: { ...PRO_AXIS.ticks, callback: v => v + '%', stepSize: yMax <= 20 ? 2 : undefined },
          },
          x: {
            ...PRO_AXIS,
            title: proAxisTitle('Week'),
            ticks: { ...HORIZONTAL_X_TICKS, autoSkip: false, maxTicksLimit: 6, font: { size: 10 } },
          },
        },
      },
    });
  }

  function makeDowChart(canvasId) {
    makeDowTrendLineChart(canvasId, 'all');
  }

  function makeReasonChart(canvasId) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const items = REASONS_DATA.slice(0, 8);
    state.charts[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: items.map(r => r.reason),
        datasets: [{
          label: 'Hours',
          data: items.map(r => r.hours),
          backgroundColor: items.map((_, i) => PERIOD_COLORS[i % PERIOD_COLORS.length]),
          hoverBackgroundColor: items.map((_, i) => PERIOD_COLORS[i % PERIOD_COLORS.length]),
          borderRadius: 6,
          barThickness: 16,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        indexAxis: 'y',
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
        scales: {
          x: {
            beginAtZero: true,
            ...PRO_AXIS,
            title: proAxisTitle('Hours'),
            ticks: { ...PRO_AXIS.ticks, callback: v => (v / 1000).toFixed(1) + 'k' },
          },
          y: {
            ...PRO_AXIS,
            ticks: { font: { size: 10, weight: '600' }, color: '#1a2b4a' },
          },
        },
      },
    });
  }

  function reasonTrendSlice(filter = 'all') {
    const periods = activePeriods();
    const trend = activeTrendData();
    if (filter === 'all') return { labels: periods, data: trend };
    const n = parseInt(filter, 10);
    if (!Number.isNaN(n) && n > 0 && n < trend.length) {
      return { labels: periods.slice(-n), data: trend.slice(-n) };
    }
    return { labels: periods, data: trend };
  }

  function makeReasonTrendLineChart(canvasId, filter = 'all') {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    const { labels, data } = reasonTrendSlice(filter);
    const lineColor = PERIOD_COLORS[2];
    const grad = ctx.createLinearGradient(0, 0, 0, 320);
    grad.addColorStop(0, lineColor + '35');
    grad.addColorStop(1, lineColor + '00');
    const minY = Math.floor(Math.min(...data) * 10) / 10 - 0.5;
    const maxY = Math.ceil(Math.max(...data) * 10) / 10 + 0.5;
    state.charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Unplanned DT %',
          data,
          borderColor: lineColor,
          backgroundColor: grad,
          fill: true,
          tension: 0.42,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: lineColor,
          pointBorderWidth: 2.5,
          borderWidth: 2.5,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
        interaction: { intersect: false, mode: 'index' },
        scales: {
          y: {
            min: minY,
            max: maxY,
            ...PRO_AXIS,
            title: proAxisTitle('Unplanned DT %'),
            ticks: { ...PRO_AXIS.ticks, callback: v => v.toFixed(1) + '%' },
          },
          x: {
            ...PRO_AXIS,
            title: proAxisTitle('Period'),
            ticks: { ...HORIZONTAL_X_TICKS, autoSkip: false, maxTicksLimit: 12, font: { size: 11, weight: '500' } },
          },
        },
      },
      plugins: [linePointLabelPlugin(v => Number(v).toFixed(2) + '%')],
    });
  }

  function makeTrendChart(canvasId) {
    makeOverviewWeekTrendChart(canvasId);
  }

  function makeOverviewWeekTrendChart(canvasId) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    const weeks = activeWeeks();
    const year = String(state.filters.year || state.liveMetrics?.meta?.year || '2026');
    const labels = weeks.map(w => w.replace(year, ''));
    const data = networkWeekTrend().map(v => (v == null ? 0 : v));
    const lineColor = PERIOD_COLORS[2];
    const grad = ctx.createLinearGradient(0, 0, 0, 320);
    grad.addColorStop(0, lineColor + '35');
    grad.addColorStop(1, lineColor + '00');
    const peak = Math.max(...data, 0);
    const minY = Math.max(0, Math.floor((Math.min(...data.filter(v => v > 0), peak) || peak) * 10) / 10 - 0.5);
    const maxY = Math.ceil((peak + 0.5) * 10) / 10;
    state.charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Unplanned DT %',
          data,
          borderColor: lineColor,
          backgroundColor: grad,
          fill: true,
          tension: 0.42,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: lineColor,
          pointBorderWidth: 2.5,
          borderWidth: 2.5,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
        interaction: { intersect: false, mode: 'index' },
        scales: {
          y: {
            min: minY,
            max: maxY,
            ...PRO_AXIS,
            title: proAxisTitle('Unplanned DT %'),
            ticks: { ...PRO_AXIS.ticks, callback: v => v.toFixed(1) + '%' },
          },
          x: {
            ...PRO_AXIS,
            title: proAxisTitle('Week'),
            ticks: { ...HORIZONTAL_X_TICKS, autoSkip: false, maxTicksLimit: 6, font: { size: 10 } },
          },
        },
      },
      plugins: [linePointLabelPlugin(v => Number(v).toFixed(2) + '%')],
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
        <div class="chart-card-header-actions">
          ${focusModeBtnHTML(canvasId)}
          <select class="chart-select" id="${selectId}" aria-label="${title} filter">${opts}</select>
        </div>
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
    const peak = Math.max(...entries.map(e => e[1]), 0);
    const yMax = Math.max(10, Math.ceil(peak * 1.2 / 5) * 5);
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
            max: yMax,
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
    const peak = Math.max(...entries.map(e => e[1]), 0);
    const yMax = Math.max(8, Math.ceil(peak * 1.2 / 2) * 2);
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
            max: yMax,
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

  function bindByDowControls() {
    document.getElementById('dow-chart-select')?.addEventListener('change', e => {
      makeDowTrendLineChart('chart-tab-dow', e.target.value);
    });
  }

  function bindByReasonControls() {
    document.getElementById('reason-count-select')?.addEventListener('change', e => {
      state.reasonCount = parseInt(e.target.value, 10);
      const body = document.querySelector('.reason-table-body');
      if (body) body.innerHTML = buildReasonTable(state.reasonCount);
    });
    document.getElementById('reason-trend-select')?.addEventListener('change', e => {
      state.reasonTrendFilter = e.target.value;
      makeReasonTrendLineChart('chart-tab-reason-trend', state.reasonTrendFilter);
    });
  }

  function initByReasonCharts() {
    makeReasonTrendLineChart('chart-tab-reason-trend', state.reasonTrendFilter);
  }

  function initByDowCharts() {
    makeDowTrendLineChart('chart-tab-dow', 'all');
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
      'by-dow': () => initByDowCharts(),
      'by-reason': () => initByReasonCharts(),
    };
    map[tabId]?.();
  }

  window.ManufacturingConsole = { state, switchPage, switchKpiTab };
})();
