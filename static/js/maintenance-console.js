/**
 * Maintenance console — filter-driven dashboard with My Report, Drill Down, and KPI Overview links.
 * Requires ManufacturingConsole (console-engine.js) and Chart.js.
 */
(function () {
  'use strict';

  var PRIMARY_NAV = [
    { id: 'overview', title: 'Overview' },
    { id: 'execute', title: 'Execute' },
    { id: 'maintenance', title: 'Maintenance' },
    { id: 'quality', title: 'Quality' },
    { id: 'planning', title: 'Planning' },
  ];

  var TIMEFRAME_OPTIONS = [
    { value: 'ptd', label: 'PTD' },
    { value: 'wtd', label: 'WTD' },
    { value: 'ytd', label: 'YTD' },
    { value: 'FY', label: 'FY' },
    { value: 'Quarter', label: 'Quarter' },
    { value: 'Month', label: 'Month' },
    { value: 'Week', label: 'Week' },
    { value: 'shift', label: 'Last Completed Shift' },
    { value: 'custom', label: 'Custom Date Range' },
  ];

  var PERIOD_LABELS = {
    ptd: 'Last Period',
    wtd: 'Prior Week',
    ytd: 'Prior Year',
    FY: 'Last Fiscal Year',
    Quarter: 'Prior Quarter',
    Month: 'Prior Month',
    Week: 'Prior Week',
    shift: 'Prior Shift',
    custom: 'Prior Range',
  };

  var BAR_COLORS = ['#2563eb', '#ec4899', '#38bdf8', '#10b981', '#f59e0b', '#8b5cf6'];
  var SCATTER_COLORS = { outlier: '#dc2626', normal: '#eab308' };

  /** Original console-engine navigators — captured before wrapper patch */
  var engineSwitchPage = null;
  var engineSwitchKpiTab = null;

  var state = {
    page: 'maintenance',
    filters: {
      timeframe: 'ptd',
      year: '2026',
      site: 'All',
      region: 'All',
      department: 'All',
      line: 'All',
      shift: 'All',
      dateFrom: '',
      dateTo: '',
    },
    payload: null,
    loading: false,
    insightTab: 'ai-summary',
    reportTab: 'snapshot',
    charts: {},
    openAlert: null,
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtPct(n) {
    return Number(n).toFixed(2) + ' %';
  }

  function fmtNum(n) {
    return Math.round(Number(n)).toLocaleString('en-US');
  }

  function destroyChart(id) {
    if (state.charts[id]) {
      state.charts[id].destroy();
      delete state.charts[id];
    }
  }

  function syncFromConsoleFilters() {
    var mc = window.ManufacturingConsole;
    if (!mc || !mc.state || !mc.state.filters) return;
    var f = mc.state.filters;
    if (f.timeframe) state.filters.timeframe = String(f.timeframe).toLowerCase() === 'fy' ? 'FY' : f.timeframe;
    if (f.year) state.filters.year = f.year;
    if (f.site) state.filters.site = f.site;
    if (Array.isArray(f.region) && f.region.length) state.filters.region = f.region.join(', ');
    else if (f.region) state.filters.region = f.region;
  }

  function syncToConsoleFilters() {
    var mc = window.ManufacturingConsole;
    if (!mc || !mc.state) return;
    mc.state.filters.timeframe = state.filters.timeframe === 'ptd' ? 'ptd' : state.filters.timeframe;
    mc.state.filters.year = state.filters.year;
    mc.state.filters.site = state.filters.site;
    if (state.filters.region && state.filters.region !== 'All') {
      mc.state.filters.region = state.filters.region.split(',').map(function (r) {
        return r.trim();
      });
    } else {
      mc.state.filters.region = [];
    }
  }

  function buildFilterPayload() {
    var f = state.filters;
    var payload = {
      timeframe: f.timeframe,
      year: f.year === 'All' ? null : f.year,
      site: f.site === 'All' ? null : f.site,
      region: f.region === 'All' ? null : f.region,
      department: f.department === 'All' ? null : f.department,
      line: f.line === 'All' ? null : f.line,
      shift: f.shift === 'All' ? null : f.shift,
    };
    if (f.timeframe === 'custom' && f.dateFrom && f.dateTo) {
      payload.dateFrom = f.dateFrom;
      payload.dateTo = f.dateTo;
    }
    return payload;
  }

  function fetchMaintenanceData() {
    state.loading = true;
    renderLoading();
    return fetch('/api/maintenance/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: buildFilterPayload() }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        state.payload = data;
        applyFilterOptions(data.filter_options || {});
        renderMaintenance();
      })
      .catch(function (err) {
        console.error('[maintenance]', err);
        var el = $('#maint-root');
        if (el) {
          el.innerHTML =
            '<div class="page-hero"><h2>Maintenance</h2><p>Unable to load data: ' +
            esc(err.message) +
            '</p></div>';
        }
      })
      .finally(function () {
        state.loading = false;
      });
  }

  function applyFilterOptions(opts) {
    var siteSel = $('#maint-filter-site');
    var lineSel = $('#maint-filter-line');
    if (siteSel && opts.sites && opts.sites.length) {
      var cur = state.filters.site;
      siteSel.innerHTML =
        '<option value="All">All Plants</option>' +
        opts.sites
          .map(function (s) {
            return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
          })
          .join('');
      siteSel.value = cur;
    }
    if (lineSel && opts.lines && opts.lines.length) {
      var curLine = state.filters.line;
      lineSel.innerHTML =
        '<option value="All">All Lines</option>' +
        opts.lines
          .map(function (l) {
            return '<option value="' + esc(l) + '">' + esc(l) + '</option>';
          })
          .join('');
      lineSel.value = curLine;
    }
    var yearSel = $('#maint-filter-year');
    if (yearSel && opts.years && opts.years.length) {
      yearSel.innerHTML = opts.years
        .map(function (y) {
          return '<option value="' + esc(y) + '">' + esc(y) + '</option>';
        })
        .join('');
      yearSel.value = state.filters.year;
    }
  }

  function renderLoading() {
    var kpi = $('#maint-kpi-row');
    if (kpi && state.loading) {
      kpi.classList.add('maint-loading');
    }
  }

  function statusDotClass(pct, target) {
    if (pct >= target + 3) return 'critical';
    if (pct >= target) return 'warning';
    return 'good';
  }

  function renderPrimaryKpi(kpi) {
    if (!kpi) return '';
    var deltaClass = kpi.delta_vs_target > 0 ? 'bad' : 'good';
    var periodLabel = PERIOD_LABELS[state.filters.timeframe] || 'Last Period';
    var periodText = (kpi.period_delta && kpi.period_delta.text) || '';
    var lastShift = kpi.last_shift
      ? (kpi.last_shift.label || kpi.last_shift.shift || '')
      : '—';
    var schedLost = kpi.scheduled_hours ? kpi.scheduled_hours.display : '—';

    return (
      '<article class="maint-kpi-card primary" data-kpi="primary">' +
      '<div class="maint-kpi-head">' +
      '<span class="maint-kpi-title">Total Unplanned Downtime %</span>' +
      '<span class="maint-status-dot ' +
      statusDotClass(kpi.value, kpi.target) +
      '" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="maint-kpi-body">' +
      '<div class="maint-kpi-main">' +
      '<div class="maint-kpi-value">' +
      esc(kpi.value_display || fmtPct(kpi.value)) +
      '</div>' +
      '<div class="maint-kpi-target-row">Target <strong>' +
      fmtPct(kpi.target) +
      '</strong>' +
      '<span class="maint-kpi-delta ' +
      deltaClass +
      '">' +
      esc(Math.abs(kpi.delta_vs_target).toFixed(2)) +
      ' pts ' +
      (kpi.delta_vs_target > 0 ? '▲' : '▼') +
      '</span></div>' +
      '</div>' +
      '<div class="maint-kpi-trend"><canvas id="maint-spark-primary" aria-label="Unplanned DT trend"></canvas></div>' +
      '</div>' +
      '<div class="maint-period-delta">' +
      periodLabel +
      ' <span>' +
      esc(periodText) +
      '</span></div>' +
      '<div class="maint-kpi-footer-stats">' +
      '<span>Last Shift <span class="bad">' +
      esc(lastShift) +
      '</span></span>' +
      '<span class="bad"><strong>' +
      esc(schedLost.replace(' h', '')) +
      '</strong> Scheduled Hours Lost</span>' +
      '</div>' +
      renderKnowMore() +
      '</article>'
    );
  }

  function renderSecondaryKpis(list) {
    return (list || [])
      .map(function (k, i) {
        var val = k.value || '—';
        var wip = k.wip ? ' <span class="maint-wip-badge">WIP</span>' : '';
        var target = k.target ? 'Target <strong>' + esc(k.target) + '</strong>' : '';
        return (
          '<article class="maint-kpi-card" style="animation-delay:' +
          i * 0.05 +
          's">' +
          '<div class="maint-kpi-head">' +
          '<span class="maint-kpi-title">' +
          esc(k.label) +
          wip +
          '</span>' +
          '<span class="maint-status-dot critical"></span>' +
          '</div>' +
          '<div class="maint-kpi-body">' +
          '<div class="maint-kpi-main">' +
          '<div class="maint-kpi-value">' +
          esc(val) +
          '</div>' +
          '<div class="maint-kpi-target-row">' +
          target +
          '</div>' +
          '</div>' +
          '<div class="maint-kpi-trend"><canvas id="maint-spark-sec-' +
          i +
          '"></canvas></div>' +
          '</div>' +
          '<div class="maint-period-delta">Last Period <span>+1.20%</span></div>' +
          '</article>'
        );
      })
      .join('');
  }

  function renderKnowMore() {
    return (
      '<div class="maint-know-more">' +
      '<span class="maint-know-more-label">Select to know more</span>' +
      '<div class="maint-know-actions">' +
      '<button type="button" class="maint-action-btn" data-action="my-report" aria-label="My Report">' +
      '<span class="maint-tooltip">My Report</span>' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>' +
      ' My Report</button>' +
      '<button type="button" class="maint-action-btn round" data-action="drill-down" aria-label="Drill Down">' +
      '<span class="maint-tooltip">Drill Down</span>' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.9V17h8v-2.1A7 7 0 0 0 12 2z"/></svg>' +
      '</button>' +
      '<button type="button" class="maint-action-btn round" data-action="kpi-overview" aria-label="KPI Overview">' +
      '<span class="maint-tooltip">KPI Overview</span>' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>' +
      '</button>' +
      '</div></div>'
    );
  }

  function renderAiSummaries(summaries) {
    return (summaries || [])
      .map(function (s, i) {
        return (
          '<div class="maint-insight-card" style="animation-delay:' +
          i * 0.06 +
          's">' +
          '<div class="maint-insight-head">' +
          '<span class="maint-severity ' +
          esc(s.severity || 'info') +
          '">' +
          esc((s.category || s.severity || 'Insight').toUpperCase()) +
          '</span>' +
          '<span class="maint-insight-title">' +
          esc(s.title) +
          '</span>' +
          '<span class="maint-insight-time">' +
          esc(s.timestamp || 'Just now') +
          '</span>' +
          '</div>' +
          '<p class="maint-insight-body">' +
          esc(s.body) +
          '</p></div>'
        );
      })
      .join('');
  }

  function renderAlerts(alerts) {
    return (alerts || [])
      .map(function (a, idx) {
        var sev = (a.severity || 'Critical').toLowerCase();
        var cardClass = sev === 'warning' || sev === 'medium' ? ' warning' : '';
        var open = state.openAlert === idx ? ' open' : '';
        var detail = a.detail || {};
        var mini = (detail.mini_kpis || [])
          .map(function (m) {
            return (
              '<div class="maint-mini-kpi"><label>' +
              esc(m.label) +
              '</label><strong>' +
              esc(m.value) +
              '</strong><small>' +
              esc(m.sub || '') +
              '</small></div>'
            );
          })
          .join('');
        var bullets = (detail.executive_bullets || [])
          .map(function (b) {
            return '<li>' + esc(b) + '</li>';
          })
          .join('');

        return (
          '<div class="maint-alert-card' +
          cardClass +
          open +
          '" data-alert-idx="' +
          idx +
          '">' +
          '<div class="maint-alert-header" role="button" tabindex="0" aria-expanded="' +
          (open ? 'true' : 'false') +
          '">' +
          '<span class="maint-severity ' +
          (sev === 'high' ? 'critical' : sev) +
          '">' +
          esc(a.severity || 'Critical') +
          '</span>' +
          '<span class="maint-insight-title">' +
          esc(a.title || 'Unplanned Downtime % ' + a.site) +
          '</span>' +
          '<span class="maint-insight-time">' +
          esc(a.timestamp || '') +
          '</span>' +
          '<span class="maint-alert-chevron" aria-hidden="true">▼</span>' +
          '</div>' +
          '<p class="maint-insight-body" style="padding:0 16px 12px;margin:0">' +
          esc(a.summary || '') +
          '</p>' +
          '<div class="maint-alert-body">' +
          '<div class="maint-alert-detail-grid">' +
          '<div class="maint-mini-kpis">' +
          mini +
          '</div>' +
          '<div><h4 style="font-size:12px;margin:0 0 8px">' +
          esc(detail.chart_title || 'Top Downtime Drivers') +
          '</h4>' +
          '<div class="maint-driver-chart"><canvas id="maint-alert-chart-' +
          idx +
          '"></canvas></div></div>' +
          '<div class="maint-exec-box"><h4>⚡ AI Executive Summary</h4><ul>' +
          bullets +
          '</ul>' +
          '<button type="button" class="maint-exec-btn" data-action="drill-down">Open Full Analysis →</button>' +
          '</div></div></div></div>'
        );
      })
      .join('');
  }

  function renderMaintenance() {
    var root = $('#maint-root');
    if (!root || !state.payload) return;
    root.classList.remove('maint-loading');
    var p = state.payload;
    var kpi = p.kpis && p.kpis.primary;

    root.innerHTML =
      '<div class="maint-kpi-row" id="maint-kpi-row">' +
      renderPrimaryKpi(kpi) +
      renderSecondaryKpis(p.secondary_kpis) +
      '</div>' +
      '<div class="maint-tabs" role="tablist">' +
      '<button type="button" class="maint-tab' +
      (state.insightTab === 'ai-summary' ? ' active' : '') +
      '" data-tab="ai-summary" role="tab">AI Summary</button>' +
      '<button type="button" class="maint-tab' +
      (state.insightTab === 'alerts' ? ' active' : '') +
      '" data-tab="alerts" role="tab">Alerts' +
      (p.alerts && p.alerts.length
        ? ' <span class="badge">' + p.alerts.length + '</span>'
        : '') +
      '</button></div>' +
      '<div id="maint-tab-ai-summary"' +
      (state.insightTab === 'ai-summary' ? '' : ' class="maint-hidden"') +
      '>' +
      renderAiSummaries(p.ai_summaries) +
      '</div>' +
      '<div id="maint-tab-alerts"' +
      (state.insightTab === 'alerts' ? '' : ' class="maint-hidden"') +
      '>' +
      renderAlerts(p.alerts) +
      '</div>';

    bindMaintenanceEvents();
    requestAnimationFrame(function () {
      drawSparkline('maint-spark-primary', kpi && kpi.trend);
      (p.secondary_kpis || []).forEach(function (_, i) {
        drawSparkline('maint-spark-sec-' + i, kpi && kpi.trend);
      });
      if (state.openAlert != null && p.alerts && p.alerts[state.openAlert]) {
        drawAlertChart(state.openAlert, p.alerts[state.openAlert].detail);
      }
    });
  }

  function drawSparkline(canvasId, trend) {
    destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined' || !trend || !trend.data) return;
    var data = trend.data;
    var labels = trend.labels || data.map(function (_, i) {
      return 'P' + (i + 1);
    });
    var ctx = canvas.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, 0, 80);
    grad.addColorStop(0, 'rgba(220,38,38,0.35)');
    grad.addColorStop(1, 'rgba(220,38,38,0)');
    state.charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            data: data,
            borderColor: '#dc2626',
            backgroundColor: grad,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: { x: { display: false }, y: { display: false } },
        animation: { duration: 600 },
      },
    });
  }

  function drawAlertChart(idx, detail) {
    var id = 'maint-alert-chart-' + idx;
    destroyChart(id);
    var canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined' || !detail) return;
    var bars = detail.driver_bars || [];
    state.charts[id] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: bars.map(function (b) {
          return b.reason;
        }),
        datasets: [
          {
            data: bars.map(function (b) {
              return b.pct;
            }),
            backgroundColor: BAR_COLORS,
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: '% Share of Unplanned Downtime Hours' } },
        },
      },
    });
  }

  function bindMaintenanceEvents() {
    $$('.maint-tab[data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        state.insightTab = tab.getAttribute('data-tab');
        renderMaintenance();
      });
    });

    $$('.maint-alert-header').forEach(function (hdr) {
      hdr.addEventListener('click', function () {
        var card = hdr.closest('.maint-alert-card');
        var idx = parseInt(card.getAttribute('data-alert-idx'), 10);
        state.openAlert = state.openAlert === idx ? null : idx;
        renderMaintenance();
      });
    });

    $$('[data-action="drill-down"]').forEach(function (btn) {
      if (btn.closest('.maint-exec-box')) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          openDrillDown();
        });
      }
    });
  }

  function reflowDashboardCharts() {
    requestAnimationFrame(function () {
      window.dispatchEvent(new Event('resize'));
      document.querySelectorAll('canvas').forEach(function (el) {
        el.dispatchEvent(new Event('chart:reflow', { bubbles: true }));
      });
    });
  }

  function enforceKpiOverviewVisible() {
    document.querySelectorAll('.page-panel').forEach(function (panel) {
      panel.classList.remove('active', 'leaving');
    });
    var kpiPage = document.getElementById('page-kpi-overview');
    if (kpiPage) kpiPage.classList.add('active');

    var filterBar = document.getElementById('filter-bar');
    var maintFilter = document.getElementById('maint-filter-bar');
    var banner = document.getElementById('app-banner');
    var subnav = document.getElementById('top-nav-secondary');
    if (filterBar) filterBar.classList.remove('maint-hidden');
    if (maintFilter) maintFilter.classList.add('maint-hidden');
    if (banner) banner.classList.add('has-subnav');
    if (subnav) subnav.classList.add('visible');

    var ctxBar = document.getElementById('filter-context-bar');
    var statusBar = document.getElementById('data-status-bar');
    if (ctxBar) ctxBar.classList.remove('maint-hidden');
    if (statusBar) statusBar.classList.remove('maint-hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToKpiOverview() {
    var mc = window.ManufacturingConsole;
    if (!mc) return;

    syncToConsoleFilters();
    state.page = 'kpi-overview';
    updateShellForPage('kpi-overview');
    enforceKpiOverviewVisible();

    if (engineSwitchPage) {
      engineSwitchPage('kpi-overview', true);
    } else if (mc.switchPage) {
      mc.switchPage('kpi-overview', true);
    }
    if (engineSwitchKpiTab) {
      engineSwitchKpiTab('overview', true);
    } else if (mc.switchKpiTab) {
      mc.switchKpiTab('overview', true);
    }

    reflowDashboardCharts();
  }

  function openMyReport() {
    var overlay = $('#maint-report-modal');
    if (!overlay) return;
    state.reportTab = 'snapshot';
    overlay.classList.add('open');
    renderReportModal();
  }

  function closeMyReport() {
    var overlay = $('#maint-report-modal');
    if (overlay) overlay.classList.remove('open');
    Object.keys(state.charts).forEach(function (k) {
      if (k.indexOf('report-') === 0) destroyChart(k);
    });
  }

  function renderReportModal() {
    var body = $('#maint-report-body');
    if (!body || !state.payload) return;
    var p = state.payload;
    var kpi = p.kpis && p.kpis.primary;

    body.innerHTML =
      '<div class="maint-modal-tabs">' +
      ['snapshot', 'sites', 'drivers']
        .map(function (t) {
          var labels = { snapshot: 'KPI Snapshot', sites: 'Sites at Risk', drivers: 'Top Downtime Drivers' };
          return (
            '<button type="button" class="maint-modal-tab' +
            (state.reportTab === t ? ' active' : '') +
            '" data-report-tab="' +
            t +
            '">' +
            labels[t] +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '<div id="maint-report-content"></div>';

    $$('[data-report-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.reportTab = btn.getAttribute('data-report-tab');
        renderReportModal();
      });
    });

    var content = $('#maint-report-content');
    if (state.reportTab === 'snapshot') content.innerHTML = renderReportSnapshot(kpi, p);
    else if (state.reportTab === 'sites') content.innerHTML = renderReportSites(p);
    else content.innerHTML = renderReportDrivers(p);

    requestAnimationFrame(function () {
      if (state.reportTab === 'snapshot') {
        drawDonut('report-donut', kpi);
        drawSitesBar('report-sites-bar', p.sites_at_risk);
      } else if (state.reportTab === 'sites') {
        drawSitesBar('report-sites-bar2', p.sites_at_risk);
        drawLinesBar('report-lines-bar', p.site_lines);
      } else if (state.reportTab === 'drivers') {
        drawDriversDonut('report-drivers-donut', p.downtime_drivers);
      }
    });
  }

  function renderReportSnapshot(kpi, p) {
    var dtHrs = (kpi && kpi.downtime_hours && kpi.downtime_hours.display) || '—';
    var sched = (kpi && kpi.scheduled_hours && kpi.scheduled_hours.display) || '—';
    var pct =
      kpi && kpi.scheduled_hours && kpi.downtime_hours
        ? ((kpi.downtime_hours.value / Math.max(kpi.scheduled_hours.estimate, 1)) * 100).toFixed(2) + '%'
        : fmtPct(kpi ? kpi.value : 0);

    return (
      '<h4 style="margin:0 0 16px;font-size:14px;color:var(--navy)">Total Unplanned Downtime %</h4>' +
      '<div class="maint-snapshot-grid">' +
      '<div class="maint-bar-section">' +
      '<div class="maint-donut-wrap"><canvas id="report-donut"></canvas></div>' +
      '<div style="text-align:center;font-size:11px;color:var(--text-muted)">Target <strong>' +
      fmtPct(kpi ? kpi.target : 4.5) +
      '</strong></div></div>' +
      '<div class="maint-stat-stack">' +
      '<div class="maint-stat-card"><span>Schedule Hours</span><strong>' +
      esc(sched) +
      '</strong></div>' +
      '<div class="maint-stat-card"><span>Unplanned Downtime Hours</span><strong>' +
      esc(dtHrs) +
      '</strong></div>' +
      '<div class="maint-stat-card"><span>Percentage Downtime</span><strong>' +
      esc(pct) +
      '</strong></div></div></div>' +
      '<div class="maint-bar-section"><h4>Unplanned Downtime Exposure Rate: Top 5 Ranked Sites</h4>' +
      '<div class="maint-hbar-chart"><canvas id="report-sites-bar"></canvas></div></div>'
    );
  }

  function renderReportSites(p) {
    var topSite = (p.sites_at_risk && p.sites_at_risk[0] && p.sites_at_risk[0].site) || 'Top Site';
    return (
      '<div class="maint-bar-section"><h4>Unplanned Downtime Exposure Rate: Top 5 Ranked Sites</h4>' +
      '<div class="maint-hbar-chart"><canvas id="report-sites-bar2"></canvas></div></div>' +
      '<div class="maint-bar-section"><h4>' +
      esc(topSite) +
      ' — Top 5 Lines by Unplanned Downtime Hours <span class="maint-severity critical" style="float:right">HIGH LOSS</span></h4>' +
      '<div class="maint-hbar-chart"><canvas id="report-lines-bar"></canvas></div></div>'
    );
  }

  function renderReportDrivers(p) {
    var bullets = (p.insights_bullets || [])
      .slice(0, 5)
      .map(function (b) {
        return '<li>' + esc(b) + '</li>';
      })
      .join('');
    return (
      '<h4 style="margin:0 0 16px">Total Unplanned Downtime %</h4>' +
      '<div class="maint-bar-section"><div class="maint-snapshot-grid">' +
      '<div class="maint-donut-wrap"><canvas id="report-drivers-donut"></canvas></div>' +
      '<div id="report-drivers-legend" style="font-size:12px;line-height:1.8"></div></div></div>' +
      '<div class="maint-insights-panel"><h4>AI Insight</h4><ul>' +
      bullets +
      '</ul></div>'
    );
  }

  function drawDonut(id, kpi) {
    destroyChart(id);
    var canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined' || !kpi) return;
    var val = kpi.value || 0;
    var rest = Math.max(0, 100 - val);
    state.charts[id] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Unplanned DT', 'Available'],
        datasets: [{ data: [val, rest], backgroundColor: ['#dc2626', '#e5e7eb'], borderWidth: 0 }],
      },
      options: {
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
      plugins: [
        {
          id: 'centerText',
          afterDraw: function (chart) {
            var ctx = chart.ctx;
            var area = chart.chartArea;
            if (!area) return;
            var x = (area.left + area.right) / 2;
            var y = (area.top + area.bottom) / 2;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#1a2b4a';
            ctx.font = '700 22px Inter, sans-serif';
            ctx.fillText(val.toFixed(1) + '%', x, y);
            ctx.restore();
          },
        },
      ],
    });
  }

  function drawSitesBar(id, sites) {
    destroyChart(id);
    var canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined' || !sites || !sites.length) return;
    state.charts[id] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: sites.map(function (s) {
          return s.site;
        }),
        datasets: [
          {
            data: sites.map(function (s) {
              return s.dt_pct;
            }),
            backgroundColor: BAR_COLORS,
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          annotation: false,
        },
        scales: {
          x: {
            max: 40,
            title: { display: true, text: 'Unplanned Downtime Rate (%)' },
          },
        },
      },
    });
  }

  function drawLinesBar(id, lines) {
    destroyChart(id);
    var canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined' || !lines || !lines.length) return;
    state.charts[id] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: lines.map(function (l) {
          return l.line;
        }),
        datasets: [
          {
            data: lines.map(function (l) {
              return l.dt_pct;
            }),
            backgroundColor: ['#991b1b', '#dc2626', '#ea580c', '#f97316', '#fb923c'],
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { max: 70, title: { display: true, text: 'Unplanned Downtime Rate (%)' } } },
      },
    });
  }

  function drawDriversDonut(id, drivers) {
    destroyChart(id);
    var canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined') return;
    var entries = (drivers || []).slice(0, 6);
    if (!entries.length) return;
    state.charts[id] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(function (d) {
          return d.reason;
        }),
        datasets: [
          {
            data: entries.map(function (d) {
              return d.pct;
            }),
            backgroundColor: BAR_COLORS,
            borderWidth: 0,
          },
        ],
      },
      options: { cutout: '55%', plugins: { legend: { display: false } } },
    });
    var leg = $('#report-drivers-legend');
    if (leg) {
      leg.innerHTML = entries
        .map(function (d, i) {
          return (
            '<div><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' +
            BAR_COLORS[i % BAR_COLORS.length] +
            ';margin-right:6px"></span>' +
            esc(d.reason) +
            ': ' +
            d.pct.toFixed(1) +
            '%</div>'
          );
        })
        .join('');
    }
  }

  function openDrillDown() {
    var overlay = $('#maint-drill-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    renderDrillDown();
  }

  function closeDrillDown() {
    var overlay = $('#maint-drill-overlay');
    if (overlay) overlay.classList.remove('open');
    destroyChart('drill-scatter');
  }

  function renderDrillDown() {
    var panel = $('#maint-drill-insights');
    var p = state.payload;
    if (!panel || !p) return;
    var bullets = (p.insights_bullets || []).slice(0, 5);
    panel.innerHTML =
      '<h4>✨ AI Summary</h4><p style="font-weight:700;margin-bottom:10px">' +
      esc(bullets[0] || 'Network performance analysis') +
      '</p><ul>' +
      bullets
        .map(function (b) {
          return '<li>' + esc(b) + '</li>';
        })
        .join('') +
      '</ul>';
    drawScatter('drill-scatter', p.drilldown || [], p.kpis && p.kpis.primary && p.kpis.primary.target);
  }

  function drawScatter(id, points, target) {
    destroyChart(id);
    var canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined' || !points.length) return;
    var avg =
      points.reduce(function (s, p) {
        return s + p.dt_pct;
      }, 0) / points.length;
    state.charts[id] = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Sites',
            data: points.map(function (p) {
              return { x: p.sched_hrs, y: p.dt_pct, site: p.site };
            }),
            backgroundColor: points.map(function (p) {
              return p.dt_pct > avg + 2 ? SCATTER_COLORS.outlier : SCATTER_COLORS.normal;
            }),
            pointRadius: 8,
            pointHoverRadius: 10,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var raw = ctx.raw;
                return raw.site + ': ' + raw.y.toFixed(2) + '% @ ' + fmtNum(raw.x) + ' sched hrs';
              },
            },
          },
        },
        scales: {
          x: { title: { display: true, text: 'Scheduled Hours' } },
          y: { title: { display: true, text: '% Unplanned Downtime' } },
        },
      },
    });
  }

  function buildFilterBar() {
    var bar = $('#maint-filter-bar');
    if (!bar) return;

    var row1 =
      '<div class="maint-filter-group"><span class="maint-filter-label">Timeframe</span>' +
      '<select class="maint-filter-select" id="maint-filter-timeframe">' +
      TIMEFRAME_OPTIONS.map(function (o) {
        return (
          '<option value="' +
          o.value +
          '"' +
          (state.filters.timeframe === o.value ? ' selected' : '') +
          '>' +
          o.label +
          '</option>'
        );
      }).join('') +
      '</select></div>' +
      '<div class="maint-filter-group"><span class="maint-filter-label">Fiscal Year</span>' +
      '<select class="maint-filter-select" id="maint-filter-year"><option>2026</option></select></div>' +
      '<div class="maint-filter-group"><span class="maint-filter-label">Site (Plant)</span>' +
      '<select class="maint-filter-select" id="maint-filter-site"><option value="All">All Plants</option></select></div>' +
      '<div class="maint-filter-group"><span class="maint-filter-label">Region</span>' +
      '<select class="maint-filter-select" id="maint-filter-region">' +
      '<option value="All">All Regions</option>' +
      '<option>North America</option><option>Latin America</option><option>Europe</option>' +
      '<option>Asia Pacific</option><option>Middle East &amp; Africa</option></select></div>';

    var row2 =
      '<div class="maint-filter-row-span">' +
      '<div class="maint-filter-group"><span class="maint-filter-label">Department</span>' +
      '<select class="maint-filter-select" id="maint-filter-dept"><option value="All">All Departments</option></select></div>' +
      '<div class="maint-filter-group"><span class="maint-filter-label">Line</span>' +
      '<select class="maint-filter-select" id="maint-filter-line"><option value="All">All Lines</option></select></div>' +
      '<div class="maint-filter-group"><span class="maint-filter-label">Shift</span>' +
      '<select class="maint-filter-select" id="maint-filter-shift">' +
      '<option value="All">All Shifts</option><option>Shift 1</option><option>Shift 2</option><option>Shift 3</option></select></div>' +
      '<div class="maint-filter-group"><span class="maint-filter-label">From date</span>' +
      '<input type="date" class="maint-filter-input" id="maint-filter-from" /></div>' +
      '<div class="maint-filter-group"><span class="maint-filter-label">To date</span>' +
      '<input type="date" class="maint-filter-input" id="maint-filter-to" /></div></div>';

    bar.innerHTML = row1 + row2;

    bar.addEventListener('change', onFilterChange);
  }

  function onFilterChange() {
    state.filters.timeframe = $('#maint-filter-timeframe').value;
    state.filters.year = $('#maint-filter-year').value;
    state.filters.site = $('#maint-filter-site').value;
    state.filters.region = $('#maint-filter-region').value;
    state.filters.department = $('#maint-filter-dept').value;
    state.filters.line = $('#maint-filter-line').value;
    state.filters.shift = $('#maint-filter-shift').value;
    state.filters.dateFrom = $('#maint-filter-from').value;
    state.filters.dateTo = $('#maint-filter-to').value;
    syncToConsoleFilters();
    fetchMaintenanceData();
  }

  function buildPrimaryNav() {
    var nav = $('#top-nav-primary');
    if (!nav) return;
    nav.innerHTML = '';
    PRIMARY_NAV.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'top-nav-item';
      btn.dataset.page = item.id;
      btn.setAttribute('role', 'tab');
      btn.innerHTML = '<span class="top-nav-label">' + esc(item.title) + '</span>';
      btn.addEventListener('click', function () {
        if (item.id === 'maintenance') switchSectionPage('maintenance');
        else if (item.id === 'overview') switchSectionPage('overview');
        else switchSectionPage(item.id);
      });
      nav.appendChild(btn);
    });

    var kpiLink = document.createElement('button');
    kpiLink.type = 'button';
    kpiLink.className = 'top-nav-item maint-hidden';
    kpiLink.id = 'nav-kpi-overview-hidden';
    kpiLink.dataset.page = 'kpi-overview';
    nav.appendChild(kpiLink);
  }

  function updateNavActive() {
    $$('.top-nav-item').forEach(function (btn) {
      var page = btn.dataset.page;
      var active = page === state.page && state.page !== 'kpi-overview';
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function updateShellForPage(page) {
    state.page = page;
    var filterBar = $('#filter-bar');
    var maintFilter = $('#maint-filter-bar');
    var banner = $('#app-banner');
    var subnav = $('#top-nav-secondary');
    var isMaint = page === 'maintenance';
    var isKpi = page === 'kpi-overview';

    filterBar && filterBar.classList.toggle('maint-hidden', isMaint);
    maintFilter && maintFilter.classList.toggle('maint-hidden', !isMaint);
    banner && banner.classList.toggle('has-subnav', isKpi);
    subnav && subnav.classList.toggle('visible', isKpi);
    $('#filter-context-bar') && $('#filter-context-bar').classList.toggle('maint-hidden', isMaint);
    $('#data-status-bar') && $('#data-status-bar').classList.toggle('maint-hidden', isMaint);
    var fab = $('#maint-fab');
    if (fab) fab.classList.toggle('maint-hidden', page !== 'maintenance');

    $$('.page-panel').forEach(function (panel) {
      panel.classList.remove('active', 'leaving');
    });
    var target = $('#page-' + page);
    if (target) target.classList.add('active');

    var crumb = $('#context-breadcrumb');
    if (crumb) {
      var labels = {
        maintenance: 'Maintenance · Unplanned DT',
        'kpi-overview': 'KPI Overview · Overview',
        overview: 'Overview',
        execute: 'Execute',
        quality: 'Quality',
        planning: 'Planning',
      };
      crumb.textContent = labels[page] || page;
    }
    updateNavActive();
  }

  function switchSectionPage(page) {
    if (page === 'kpi-overview') {
      goToKpiOverview();
      return;
    }
    updateShellForPage(page);
    if (page === 'maintenance') fetchMaintenanceData();
  }

  function initDates() {
    var today = new Date();
    var from = new Date(today);
    from.setDate(from.getDate() - 14);
    state.filters.dateFrom = from.toISOString().slice(0, 10);
    state.filters.dateTo = today.toISOString().slice(0, 10);
    var fromEl = $('#maint-filter-from');
    var toEl = $('#maint-filter-to');
    if (fromEl) fromEl.value = state.filters.dateFrom;
    if (toEl) toEl.value = state.filters.dateTo;
  }

  function bindGlobalEvents() {
    var root = document.getElementById('maint-root');
    if (root && !root.dataset.delegateBound) {
      root.dataset.delegateBound = '1';
      root.addEventListener('click', function (e) {
        var btn = e.target.closest('.maint-know-actions [data-action]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        var action = btn.getAttribute('data-action');
        if (action === 'my-report') openMyReport();
        else if (action === 'drill-down') openDrillDown();
        else if (action === 'kpi-overview') goToKpiOverview();
      });
    }

    $('#maint-report-close') &&
      $('#maint-report-close').addEventListener('click', closeMyReport);
    $('#maint-report-modal') &&
      $('#maint-report-modal').addEventListener('click', function (e) {
        if (e.target.id === 'maint-report-modal') closeMyReport();
      });
    $('#maint-drill-back') &&
      $('#maint-drill-back').addEventListener('click', closeDrillDown);
  }

  function init() {
    if (!window.ManufacturingConsole) {
      setTimeout(init, 50);
      return;
    }
    syncFromConsoleFilters();
    if (!state.filters.timeframe || state.filters.timeframe === 'FY') {
      state.filters.timeframe = 'ptd';
    }
    buildPrimaryNav();
    buildFilterBar();
    initDates();
    bindGlobalEvents();

    var mc = window.ManufacturingConsole;
    engineSwitchPage = mc.switchPage;
    engineSwitchKpiTab = mc.switchKpiTab;

    mc.switchPage = function (page, force) {
      if (PRIMARY_NAV.some(function (item) { return item.id === page; })) {
        updateShellForPage(page);
        if (page === 'maintenance') fetchMaintenanceData();
        return;
      }
      if (page === 'kpi-overview') {
        goToKpiOverview();
        return;
      }
      return engineSwitchPage.call(mc, page, force);
    };
    mc.switchKpiTab = function (tab, force) {
      if (state.page === 'kpi-overview' || mc.state.page === 'kpi-overview') {
        updateShellForPage('kpi-overview');
      }
      return engineSwitchKpiTab.call(mc, tab, force);
    };

    updateShellForPage('maintenance');
    fetchMaintenanceData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MaintenanceConsole = {
    refresh: fetchMaintenanceData,
    state: state,
    switchPage: switchSectionPage,
  };
})();
