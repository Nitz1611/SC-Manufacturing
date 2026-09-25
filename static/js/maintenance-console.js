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
    { value: 'ptd', label: 'PTD (Period to Date)', short: 'PTD' },
    { value: 'wtd', label: 'WTD (Week to Date)', short: 'WTD' },
    { value: 'ytd', label: 'YTD (Year to Date)', short: 'YTD' },
    { value: 'prev_week', label: 'Prev Week', short: 'Prev Week' },
    { value: 'prev_period', label: 'Prev Period', short: 'Prev Period' },
    { value: 'today', label: 'Today', short: 'Today' },
    { value: 'custom', label: 'Custom Range', short: 'Custom' },
  ];

  var PERIOD_LABELS = {
    ptd: 'Period to date',
    wtd: 'Week to date',
    ytd: 'Year to date',
    prev_week: 'Previous week',
    prev_period: 'Previous period',
    today: 'Today',
    custom: 'Custom range',
  };

  /* KPI Overview chart palette — keep identical across Maintenance + KPI Overview */
  var PEACOCK_EXPOSURE_COLORS = [
    '#5b2c8f',
    '#1565c0',
    '#b84a7a',
    '#ef6c00',
    '#78909c',
  ];
  var CHART_COLORS = [
    '#002855',
    '#004080',
    '#0066cc',
    '#0088cc',
    '#00a896',
    '#5c6bc0',
    '#9e9e9e',
    '#ffb74d',
    '#ff9800',
    '#e53935',
  ];
  var DONUT_DT_COLOR = '#e53935';
  var DONUT_TRACK_COLOR = '#e8eef5';
  var BAR_COLORS = CHART_COLORS;
  var DT_TARGET = 4.5;
  var SCATTER_COLORS = { outlier: '#dc2626', normal: '#eab308' };
  var SHIFT_OPTIONS = ['All', 'Shift 1', 'Shift 2', 'Shift 3'];
  var SHOW_IN_OPTIONS = ['Thousands', 'Actual', 'Percentage'];
  var SELECT_ALL = { value: 'All', label: 'Select All' };

  /** Live filter dimensions from API — never hardcoded demo regions. */
  var liveFilterOptions = {
    sites: [],
    regions: [],
    years: [],
    lines: [],
    departments: [],
    shifts: [],
    site_regions: {},
  };

  /** Original console-engine navigators — captured before wrapper patch */
  var engineSwitchPage = null;
  var engineSwitchKpiTab = null;
  var engineEnterKpiOverview = null;

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
      showIn: 'Thousands',
      dateFrom: '',
      dateTo: '',
    },
    payload: null,
    loading: false,
    insightsLoading: false,
    insightTab: 'alerts',
    reportTab: 'snapshot',
    reportAnimateIn: false,
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

  function normalizeRegionList(value) {
    if (!value || value === 'All') return [];
    if (Array.isArray(value)) {
      return value.map(function (r) {
        return String(r).trim();
      }).filter(Boolean);
    }
    return String(value)
      .split(',')
      .map(function (r) {
        return r.trim();
      })
      .filter(Boolean);
  }

  function regionFilterLabel(value) {
    var list = normalizeRegionList(value);
    return list.length ? list.join(', ') : 'All';
  }

  function syncFromConsoleFilters() {
    var mc = window.ManufacturingConsole;
    if (!mc || !mc.state || !mc.state.filters) return;
    var f = mc.state.filters;
    if (f.timeframe) {
      var tf = String(f.timeframe).toLowerCase();
      state.filters.timeframe = tf === 'fy' ? 'ytd' : tf;
    }
    if (f.year) state.filters.year = f.year;
    if (f.site) state.filters.site = f.site;
    state.filters.region = regionFilterLabel(f.region);
    if (f.showIn) state.filters.showIn = f.showIn;
  }

  function syncToConsoleFilters() {
    var mc = window.ManufacturingConsole;
    if (!mc || !mc.state) return;
    mc.state.filters.timeframe = String(state.filters.timeframe || 'ptd').toLowerCase();
    mc.state.filters.year = state.filters.year === 'All' ? '2026' : state.filters.year;
    mc.state.filters.site = state.filters.site;
    mc.state.filters.region = normalizeRegionList(state.filters.region);
    mc.state.filters.showIn = state.filters.showIn || 'Thousands';
    syncMaintFilterExtrasToConsole();
  }

  function syncMaintFilterExtrasToConsole() {
    var mc = window.ManufacturingConsole;
    if (!mc || !mc.state) return;
    mc.state.maintFilterExtras = {
      department: state.filters.department === 'All' ? null : state.filters.department,
      line: state.filters.line === 'All' ? null : state.filters.line,
      shift: state.filters.shift === 'All' ? null : state.filters.shift,
      dateFrom: isCustomTimeframe() && state.filters.dateFrom ? state.filters.dateFrom : null,
      dateTo: isCustomTimeframe() && state.filters.dateTo ? state.filters.dateTo : null,
    };
  }

  function patchConsoleDataFetch() {
    if (window.__maintConsoleDataFetchPatch) return;
    window.__maintConsoleDataFetchPatch = true;
    var nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : input && input.url;
      if (url && url.indexOf('/api/console-data') !== -1 && init && init.body) {
        try {
          var body = JSON.parse(init.body);
          var mc = window.ManufacturingConsole;
          var extras = (mc && mc.state && mc.state.maintFilterExtras) || {};
          if (body.filters && extras) {
            body.filters = Object.assign({}, body.filters, extras);
            init = Object.assign({}, init, { body: JSON.stringify(body) });
          }
        } catch (err) {
          /* keep original body */
        }
      }
      return nativeFetch(input, init);
    };
  }

  function applyShowInToEngine() {
    var mc = window.ManufacturingConsole;
    if (!mc) return;
    syncToConsoleFilters();
    if (typeof mc.applyShowIn === 'function') {
      mc.applyShowIn();
    }
  }

  function reloadConsoleMetrics(force) {
    var mc = window.ManufacturingConsole;
    if (mc && typeof mc.reloadMetrics === 'function') {
      mc.reloadMetrics(!!force, { background: state.page !== 'kpi-overview' && !force });
    }
  }

  function buildFilterPayload() {
    var f = state.filters;
    var custom = isCustomTimeframe();
    return {
      timeframe: String(f.timeframe || 'ptd').toLowerCase(),
      year: f.year === 'All' ? '2026' : f.year,
      site: f.site === 'All' ? null : f.site,
      region: normalizeRegionList(f.region).join(',') || null,
      department: f.department === 'All' ? null : f.department,
      line: f.line === 'All' ? null : f.line,
      shift: f.shift === 'All' ? null : f.shift,
      dateFrom: custom && f.dateFrom ? f.dateFrom : null,
      dateTo: custom && f.dateTo ? f.dateTo : null,
    };
  }

  function fetchMaintenanceData(silent, forceRefresh) {
    if (!silent) {
      state.loading = true;
      renderLoading();
    }
    return fetch('/api/maintenance/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filters: buildFilterPayload(),
        forceRefresh: !!forceRefresh,
      }),
    })
      .then(function (r) {
        var ct = (r.headers.get('Content-Type') || '').toLowerCase();
        if (!r.ok || ct.indexOf('application/json') === -1) {
          return r.text().then(function (text) {
            var msg = 'Request failed (' + r.status + ')';
            try {
              var parsed = JSON.parse(text);
              if (parsed && parsed.error) msg = parsed.error;
            } catch (e) {
              if (text && text.length < 200) msg = text;
            }
            throw new Error(msg);
          });
        }
        return r.json();
      })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        state.payload = data;
        applyFilterOptions(data.filter_options || {});
        updateDateFilterVisibility();
        renderMaintenance();
        fetchAiInsights();
        if ($('#maint-report-modal') && $('#maint-report-modal').classList.contains('open')) {
          state.reportAnimateIn = true;
          renderReportModal();
        }
        if (data._partial || data._refreshing) {
          window.setTimeout(function () {
            fetchMaintenanceData(true);
          }, 2500);
        }
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

  function isCustomTimeframe() {
    return String(state.filters.timeframe || '').toLowerCase() === 'custom';
  }

  function updateDateFilterVisibility() {
    var show = isCustomTimeframe();
    $$('.maint-date-filter').forEach(function (el) {
      el.classList.toggle('maint-hidden', !show);
    });
  }

  function withSelectAllOption(options) {
    var opts = (options || []).slice();
    var allIdx = opts.findIndex(function (o) {
      var v = typeof o === 'object' ? o.value : o;
      return v === 'All';
    });
    if (allIdx >= 0) {
      opts[allIdx] = SELECT_ALL;
      return opts;
    }
    return [SELECT_ALL].concat(opts);
  }

  function maintenanceTargetPct(payload) {
    var p = payload || state.payload;
    if (!p) return DT_TARGET;
    if (p.kpis && p.kpis.primary && p.kpis.primary.target != null) {
      return Number(p.kpis.primary.target);
    }
    if (p.insights_meta && p.insights_meta.target_pct != null) {
      return Number(p.insights_meta.target_pct);
    }
    return DT_TARGET;
  }

  function fetchAiInsights() {
    if (state.insightsLoading) return;
    state.insightsLoading = true;
    return fetch('/api/maintenance/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: buildFilterPayload(), allowFallback: true }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error || !data.ai_summaries) return;
        if (state.payload) state.payload.ai_summaries = data.ai_summaries;
        var el = $('#maint-insights-list');
        if (el) el.innerHTML = renderAiSummaries(data.ai_summaries);
      })
      .catch(function (err) {
        console.warn('[maintenance insights]', err);
      })
      .finally(function () {
        state.insightsLoading = false;
      });
  }

  function slicerDisplayValue(id, value) {
    if (value == null || value === '' || value === 'All') return 'Select All';
    if (id === 'region') return regionFilterLabel(value) === 'All' ? 'Select All' : regionFilterLabel(value);
    if (Array.isArray(value)) return value.length ? value.join(', ') : 'Select All';
    if (id === 'timeframe') {
      var tfMatch = TIMEFRAME_OPTIONS.filter(function (o) {
        return o.value === value;
      })[0];
      return tfMatch ? tfMatch.short || tfMatch.label : String(value);
    }
    var match = TIMEFRAME_OPTIONS.filter(function (o) {
      return o.value === value;
    })[0];
    if (match) return match.short || match.label;
    return String(value);
  }

  function updateSlicerDisplay(id, value) {
    var slicer = $('.maint-filter-bar .slicer[data-slicer-id="' + id + '"]');
    if (!slicer) return;
    var el = slicer.querySelector('.slicer-value');
    if (el) el.textContent = slicerDisplayValue(id, value);
  }

  function closeAllSlicers() {
    $$('.maint-filter-bar .slicer.open').forEach(function (s) {
      resetMaintSlicerPanel(s);
      s.classList.remove('open');
    });
    $$('.maint-filter-bar .maint-filter-group-open').forEach(function (g) {
      g.classList.remove('maint-filter-group-open');
    });
    var bar = $('#maint-filter-bar');
    if (bar) bar.classList.remove('maint-slicers-open');
  }

  function positionMaintSlicerPanel(slicer) {
    if (!slicer) return;
    var panel = slicer.querySelector('.slicer-panel');
    if (!panel) return;
    panel.style.position = '';
    panel.style.top = '';
    panel.style.left = '';
    panel.style.minWidth = '';
    panel.style.width = '';
    panel.style.zIndex = '';
  }

  function resetMaintSlicerPanel(slicer) {
    if (!slicer) return;
    var panel = slicer.querySelector('.slicer-panel');
    if (!panel) return;
    panel.style.position = '';
    panel.style.top = '';
    panel.style.left = '';
    panel.style.minWidth = '';
    panel.style.zIndex = '';
  }

  function repositionOpenMaintSlicers() {
    $$('.maint-filter-bar .slicer.open').forEach(positionMaintSlicerPanel);
  }

  function bindMaintSlicerViewport() {
    if (window.__maintSlicerViewportBound) return;
    window.__maintSlicerViewportBound = true;
    window.addEventListener('scroll', repositionOpenMaintSlicers, true);
    window.addEventListener('resize', repositionOpenMaintSlicers);
  }

  function refreshSlicerOptions(id) {
    if (id === 'timeframe') {
      populateSlicerOptions('timeframe', TIMEFRAME_OPTIONS, state.filters.timeframe, false);
    } else if (id === 'region') {
      populateSlicerOptions('region', regionSlicerOptions(), state.filters.region, true);
    } else if (id === 'year') {
      populateSlicerOptions('year', [{ value: state.filters.year, label: state.filters.year }], state.filters.year, false);
    }
  }

  function populateSlicerOptions(id, options, currentValue, multi) {
    var wrap = $('.maint-filter-bar .slicer-options[data-slicer-options="' + id + '"]');
    if (!wrap) return;
    wrap.innerHTML = '';
    var normalized = withSelectAllOption(options);
    var selected = multi ? normalizeRegionList(currentValue) : [currentValue || 'All'];

    normalized.forEach(function (opt) {
      var val = typeof opt === 'object' ? opt.value : opt;
      var lab = typeof opt === 'object' ? opt.label : opt;
      var isSelected = multi
        ? val === 'All'
          ? !selected.length
          : selected.indexOf(val) >= 0
        : String(selected[0]) === String(val);

      var row = document.createElement('div');
      row.className = 'slicer-option' + (isSelected ? ' selected' : '');
      row.dataset.value = val;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (multi) {
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = isSelected;
        cb.tabIndex = -1;
        row.appendChild(cb);
      } else {
        row.appendChild(document.createElement('span')).className = 'radio-dot';
      }
      var labelEl = document.createElement('span');
      labelEl.textContent = lab;
      row.appendChild(labelEl);
      row.addEventListener('click', function (e) {
        e.stopPropagation();
        onSlicerSelect(id, val, multi);
      });
      wrap.appendChild(row);
    });
  }

  function onSlicerSelect(id, value, multi) {
    if (multi) {
      if (value === 'All') {
        state.filters.region = 'All';
      } else {
        var list = normalizeRegionList(state.filters.region);
        var idx = list.indexOf(value);
        if (idx >= 0) list.splice(idx, 1);
        else list.push(value);
        state.filters.region = list.length ? list.join(', ') : 'All';
      }
      populateSlicerOptions('region', regionSlicerOptions(), state.filters.region, true);
      updateSlicerDisplay('region', state.filters.region);
    } else {
      state.filters[id] = value;
      updateSlicerDisplay(id, value);
      if (id === 'showIn') {
        closeAllSlicers();
        syncToConsoleFilters();
        applyShowInToEngine();
        if (state.page === 'kpi-overview') {
          reloadConsoleMetrics(false);
          afterKpiOverviewMetricsUpdated();
        }
        return;
      }
      if (id === 'site') {
        state.filters.line = 'All';
        updateSlicerDisplay('line', 'All');
      }
      if (id === 'timeframe') {
        updateDateFilterVisibility();
      }
    }
    closeAllSlicers();
    onFilterChange();
  }

  function regionSlicerOptions() {
    return (liveFilterOptions.regions || []).map(function (r) {
      return { value: r, label: r };
    });
  }

  function sanitizeRegionSelection() {
    var allowed = liveFilterOptions.regions || [];
    if (!allowed.length) {
      state.filters.region = 'All';
      return;
    }
    var list = normalizeRegionList(state.filters.region).filter(function (r) {
      return allowed.indexOf(r) >= 0;
    });
    state.filters.region = list.length ? list.join(', ') : 'All';
  }

  function createSlicerGroup(id, label, options, currentValue, multi, searchable) {
    var group = document.createElement('div');
    group.className = 'filter-group maint-filter-group';
    group.innerHTML = '<span class="filter-label maint-filter-label">' + esc(label) + '</span>';

    var slicer = document.createElement('div');
    slicer.className = 'slicer' + (multi ? ' slicer--multi' : ' slicer--single');
    slicer.dataset.slicerId = id;
    slicer.dataset.multi = multi ? 'true' : 'false';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'slicer-trigger';
    trigger.innerHTML =
      '<span class="slicer-value">' +
      esc(slicerDisplayValue(id, currentValue)) +
      '</span><span class="slicer-chevron"></span>';

    var panel = document.createElement('div');
    panel.className = 'slicer-panel';

    if (searchable) {
      var searchWrap = document.createElement('div');
      searchWrap.className = 'slicer-search-wrap';
      var searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'slicer-search';
      searchInput.placeholder = 'Search…';
      searchInput.addEventListener('input', function (e) {
        filterSlicerOptions(id, e.target.value);
      });
      searchInput.addEventListener('click', function (e) {
        e.stopPropagation();
      });
      searchWrap.appendChild(searchInput);
      panel.appendChild(searchWrap);
    }

    panel.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    var optsWrap = document.createElement('div');
    optsWrap.className = 'slicer-options';
    optsWrap.dataset.slicerOptions = id;

    panel.appendChild(optsWrap);
    slicer.appendChild(trigger);
    slicer.appendChild(panel);
    group.appendChild(slicer);

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var wasOpen = slicer.classList.contains('open');
      closeAllSlicers();
      if (!wasOpen) {
        refreshSlicerOptions(id);
        slicer.classList.add('open');
        group.classList.add('maint-filter-group-open');
        var bar = $('#maint-filter-bar');
        if (bar) bar.classList.add('maint-slicers-open');
        requestAnimationFrame(function () {
          positionMaintSlicerPanel(slicer);
        });
        if (searchable) {
          var input = panel.querySelector('.slicer-search');
          if (input) {
            input.value = '';
            filterSlicerOptions(id, '');
            setTimeout(function () {
              input.focus();
            }, 50);
          }
        }
      }
    });

    populateSlicerOptions(id, options, currentValue, multi);
    return group;
  }

  function createDateGroup(id, label, value) {
    var group = document.createElement('div');
    group.className = 'filter-group maint-filter-group maint-date-filter';
    group.innerHTML =
      '<span class="filter-label maint-filter-label">' +
      esc(label) +
      '</span>' +
      '<div class="slicer maint-date-slicer">' +
      '<label class="slicer-trigger maint-date-trigger">' +
      '<input type="date" class="maint-date-input" id="maint-filter-' +
      id +
      '" value="' +
      esc(value || '') +
      '" aria-label="' +
      esc(label) +
      '" />' +
      '</label></div>';
    group.querySelector('input').addEventListener('change', onFilterChange);
    return group;
  }

  function applyFilterOptions(opts) {
    opts = opts || {};
    liveFilterOptions = {
      sites: opts.sites || [],
      regions: opts.regions || [],
      years: opts.years || [],
      lines: opts.lines || [],
      departments: opts.departments || [],
      shifts: opts.shifts || [],
      site_regions: opts.site_regions || {},
    };
    if (opts.sites && opts.sites.length) {
      var siteOpts = opts.sites.map(function (s) {
        return { value: s, label: s };
      });
      populateSlicerOptions('site', siteOpts, state.filters.site, false);
      updateSlicerDisplay('site', state.filters.site);
    }
    if (opts.lines && opts.lines.length) {
      updateLineSlicerOptions(opts.lines);
    }
    if (opts.years && opts.years.length) {
      var yearOpts = opts.years.map(function (y) {
        return { value: String(y), label: String(y) };
      });
      populateSlicerOptions('year', yearOpts, state.filters.year, false);
      updateSlicerDisplay('year', state.filters.year);
    }
    if (opts.shifts && opts.shifts.length) {
      var shiftOpts = opts.shifts.map(function (s) {
        return { value: s, label: s };
      });
      populateSlicerOptions('shift', shiftOpts, state.filters.shift, false);
      updateSlicerDisplay('shift', state.filters.shift);
    }
    if (opts.departments && opts.departments.length) {
      var deptOpts = opts.departments.map(function (d) {
        return { value: d, label: d };
      });
      populateSlicerOptions('department', deptOpts, state.filters.department, false);
      updateSlicerDisplay('department', state.filters.department);
    }
    if (opts.regions && opts.regions.length) {
      sanitizeRegionSelection();
      populateSlicerOptions('region', regionSlicerOptions(), state.filters.region, true);
      updateSlicerDisplay('region', state.filters.region);
    } else {
      state.filters.region = 'All';
      populateSlicerOptions('region', [], 'All', true);
      updateSlicerDisplay('region', 'All');
    }
    updateDateFilterVisibility();
  }

  function updateLineSlicerOptions(lines) {
    var lineOpts = lines.map(function (l) {
      return { value: l, label: l };
    });
    populateSlicerOptions('line', lineOpts, state.filters.line, false);
    updateSlicerDisplay('line', state.filters.line);
  }

  function filterSlicerOptions(id, query) {
    var wrap = $('.maint-filter-bar .slicer-options[data-slicer-options="' + id + '"]');
    if (!wrap) return;
    query = String(query || '').toLowerCase();
    wrap.querySelectorAll('.slicer-option').forEach(function (btn) {
      var text = btn.textContent.toLowerCase();
      btn.style.display = !query || text.indexOf(query) >= 0 ? '' : 'none';
    });
  }

  function renderRankedExposureTable(rows, options) {
    options = options || {};
    if (!rows || !rows.length) {
      return '<p class="maint-empty-note">No data for the current filter selection.</p>';
    }
    var valueKey = options.valueKey || 'dt_pct';
    var nameKey = options.nameKey || 'site';
    var maxVal = options.maxValue;
    var targetPct = options.targetPct != null ? Number(options.targetPct) : DT_TARGET;
    if (!maxVal) {
      maxVal = Math.max.apply(
        null,
        rows.map(function (r) {
          return Number(r[valueKey]) || 0;
        }).concat([targetPct, 12])
      );
    }
    var targetTick = Math.min(100, (targetPct / maxVal) * 100);
    var tbody = rows
      .map(function (row, i) {
        var val = Number(row[valueKey]) || 0;
        var width = Math.max(4, (val / maxVal) * 100);
        var color = PEACOCK_EXPOSURE_COLORS[i] || CHART_COLORS[i % CHART_COLORS.length];
        var detail = options.detailFn ? options.detailFn(row) : '';
        return (
          '<tr>' +
          '<td class="reason-rank-col">' +
          (i + 1) +
          '</td>' +
          '<td class="reason-name-col">' +
          esc(row[nameKey]) +
          (detail ? '<div class="maint-ranked-detail">' + esc(detail) + '</div>' : '') +
          '</td>' +
          '<td class="reason-bar-cell">' +
          '<div class="reason-bar-track">' +
          '<span class="maint-target-tick" style="left:' +
          targetTick +
          '%" title="Target ' +
          targetPct.toFixed(2) +
          '%"></span>' +
          '<div class="reason-bar" style="width:' +
          width +
          '%;background-color:' +
          color +
          '"></div></div>' +
          (options.barValueFn
            ? '<span class="reason-hours-val">' + esc(options.barValueFn(row)) + '</span>'
            : '') +
          '</td>' +
          '<td class="reason-pct-col">' +
          val.toFixed(2) +
          ' %</td></tr>'
        );
      })
      .join('');

    return (
      '<div class="maint-ranked-table-wrap">' +
      '<div class="table-scroll reason-table-scroll maint-ranked-scroll">' +
      '<table class="data-table reason-table maint-ranked-table">' +
      '<thead><tr>' +
      '<th class="reason-rank-col">#</th>' +
      '<th class="reason-name-col">' +
      esc(options.nameHeader || 'Site') +
      '</th>' +
      '<th class="reason-bar-col">' +
      esc(options.barHeader || 'Unplanned DT Exposure') +
      '</th>' +
      '<th class="reason-pct-col">' +
      esc(options.pctHeader || 'Unplanned DT %') +
      '</th></tr></thead><tbody>' +
      tbody +
      '</tbody></table></div>' +
      '<div class="maint-target-legend">FLNA Target: ' +
      targetPct.toFixed(2) +
      '% <span class="maint-target-swatch"></span></div></div>'
    );
  }

  function exposureChartScaleMax(rows, targetPct) {
    var peak = Math.max(
      targetPct,
      12,
      Math.max.apply(
        null,
        (rows || []).map(function (r) {
          return Number(r.dt_pct) || 0;
        })
      )
    );
    return Math.max(10, Math.ceil(peak / 5) * 5);
  }

  function renderMaintExposureChart(rows, options) {
    options = options || {};
    if (!rows || !rows.length) {
      return '<p class="maint-empty-note">No data for the current filter selection.</p>';
    }
    var targetPct = options.targetPct != null ? Number(options.targetPct) : DT_TARGET;
    var maxVal = options.maxValue || exposureChartScaleMax(rows, targetPct);
    var targetTick = Math.min(100, (targetPct / maxVal) * 100);
    var nameKey = options.nameKey || 'site';
    var labelClassName = options.labelClass || 'maint-exposure-site';
    var axisTicks = [];
    for (var t = 0; t <= maxVal; t += maxVal <= 15 ? 5 : 10) {
      axisTicks.push(t);
    }
    if (axisTicks[axisTicks.length - 1] !== maxVal) axisTicks.push(maxVal);

    var plotRows = rows
      .map(function (row, i) {
        var val = Number(row.dt_pct) || 0;
        var width = Math.max(val > 0 ? 2 : 0, (val / maxVal) * 100);
        var color = PEACOCK_EXPOSURE_COLORS[i] || CHART_COLORS[i % CHART_COLORS.length];
        var detailFn = options.detailFn;
        var detail = detailFn
          ? detailFn(row)
          : val.toFixed(2) +
            '% (' +
            fmtNum(row.hours) +
            ' Unplanned DT Hrs / ' +
            fmtNum(row.sched_hrs) +
            ' Sched Hrs)';
        var labelClass = width >= 38 ? 'maint-exposure-bar-label maint-exposure-bar-label-in' : 'maint-exposure-bar-label maint-exposure-bar-label-out';
        var rowLabel = row[nameKey] || row.site || row.line || '';
        return (
          '<div class="maint-exposure-row">' +
          '<div class="' +
          labelClassName +
          '">' +
          esc(rowLabel) +
          '</div>' +
          '<div class="maint-exposure-bar-col">' +
          '<div class="maint-exposure-track">' +
          '<span class="maint-exposure-target-tick" style="left:' +
          targetTick +
          '%" title="Target ' +
          targetPct.toFixed(2) +
          '%"></span>' +
          '<div class="maint-exposure-bar" style="width:' +
          width +
          '%;background-color:' +
          color +
          '">' +
          (width >= 22 ? '<span class="' + labelClass + '">' + esc(detail) + '</span>' : '') +
          '</div></div>' +
          (width < 22 ? '<span class="' + labelClass + '">' + esc(detail) + '</span>' : '') +
          '</div></div>'
        );
      })
      .join('');

    return (
      '<div class="maint-exposure-chart">' +
      '<div class="maint-exposure-plot">' +
      '<div class="maint-exposure-bars-panel">' +
      plotRows +
      '</div></div>' +
      '<div class="maint-exposure-xaxis">' +
      axisTicks
        .map(function (n) {
          return '<span>' + n + '</span>';
        })
        .join('') +
      '</div>' +
      '<div class="maint-target-legend">' +
      '<span class="maint-target-swatch maint-target-swatch-dash" aria-hidden="true"></span>' +
      'FLNA Target: ' +
      targetPct.toFixed(2) +
      '%</div></div>'
    );
  }

  function renderLoading() {
    var root = $('#maint-root');
    if (!root || !state.loading) return;
    root.classList.add('maint-loading');
    if (!root.querySelector('.maint-loading-shell')) {
      root.innerHTML =
        '<div class="maint-loading-shell" role="status" aria-live="polite">' +
        '<div class="maint-loading-spinner" aria-hidden="true"></div>' +
        '<p class="maint-loading-text">Loading live maintenance data from Databricks…</p>' +
        '<p class="maint-loading-sub">First load can take 1–3 minutes. Do not refresh — waiting for Databricks SQL.</p>' +
        '</div>';
    }
  }

  function statusDotClass(pct, target) {
    if (pct >= target + 3) return 'critical';
    if (pct >= target) return 'warning';
    return 'good';
  }

  function formatLastShiftPct(kpi) {
    if (!kpi || !kpi.last_shift || kpi.last_shift.pct == null) {
      if (kpi && kpi.last_shift && kpi.last_shift.display) return kpi.last_shift.display;
      return null;
    }
    var n = Number(kpi.last_shift.pct);
    if (!isFinite(n)) return null;
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function renderPrimaryKpi(kpi) {
    if (!kpi) return '';
    var target = Number(kpi.target || DT_TARGET);
    var deltaClass = kpi.delta_vs_target > 0 ? 'bad' : 'good';
    var deltaArrow = kpi.delta_vs_target > 0 ? '▲' : '▼';
    var lastPeriodDelta = Number(kpi.last_period_delta != null ? kpi.last_period_delta : 0);
    var lastPeriodClass = lastPeriodDelta > 0 ? 'bad' : lastPeriodDelta < 0 ? 'good' : 'neutral';
    var lastPeriodValueClass = lastPeriodClass;
    var lastPeriodValue =
      kpi.last_period_delta_display ||
      (lastPeriodDelta > 0 ? '+' : '') + lastPeriodDelta.toFixed(2) + '%';
    var lastPeriodLabel = (kpi && kpi.last_period_label) || 'Last Period';
    var lastShiftVal = formatLastShiftPct(kpi);
    var schedRaw = kpi.scheduled_hours && kpi.scheduled_hours.display;
    var schedLost =
      schedRaw && parseFloat(String(schedRaw).replace(/,/g, '')) > 0 ? schedRaw : null;
    var dotClass = kpi.value > target ? 'critical' : statusDotClass(kpi.value, target);

    return (
      '<article class="maint-kpi-card primary maint-kpi-card-design maint-kpi-card-clickable" data-kpi="primary" data-action="my-report" role="button" tabindex="0" aria-label="Total Unplanned Downtime percent — open My Report">' +
      '<div class="maint-kpi-head">' +
      '<span class="maint-status-dot ' +
      dotClass +
      '" aria-hidden="true"></span>' +
      '<span class="maint-kpi-title">Total Unplanned Downtime %</span>' +
      '</div>' +
      '<div class="maint-kpi-body">' +
      '<div class="maint-kpi-main">' +
      '<div class="maint-kpi-value">' +
      esc(kpi.value_display || fmtPct(kpi.value)) +
      '</div>' +
      '<div class="maint-kpi-target-row">' +
      '<span class="maint-kpi-target-label">Target</span> ' +
      '<strong class="maint-kpi-target-value">' +
      esc(kpi.target_display || fmtPct(target)) +
      '</strong>' +
      '<span class="maint-kpi-delta ' +
      deltaClass +
      '">' +
      esc(kpi.delta_vs_target_display || Math.abs(kpi.delta_vs_target).toFixed(2) + '%') +
      ' ' +
      deltaArrow +
      '</span></div>' +
      '</div>' +
      '<div class="maint-kpi-trend">' +
      '<div class="maint-kpi-trend-chart">' +
      '<div class="maint-kpi-trend-canvas-wrap">' +
      '<canvas id="maint-spark-primary" aria-label="Unplanned DT by period for fiscal year"></canvas>' +
      '</div>' +
      '<div class="maint-trend-period-delta">' +
      '<span class="maint-trend-period-label">' +
      esc(lastPeriodLabel) +
      '</span> ' +
      '<span class="maint-trend-period-value ' +
      lastPeriodValueClass +
      '">' +
      esc(String(lastPeriodValue).replace(/\s+%/g, '%')) +
      '</span></div></div></div>' +
      '</div>' +
      '<div class="maint-kpi-footer-stats maint-kpi-footer-visible">' +
      '<span class="maint-footer-left">' +
      '<span class="maint-footer-label">Last Shift </span>' +
      '<span class="maint-footer-value ' +
      (lastShiftVal ? 'bad' : 'muted') +
      '">' +
      esc(lastShiftVal || '—') +
      '</span></span>' +
      '<span class="maint-footer-right">' +
      '<strong class="maint-footer-value bad">' +
      esc(schedLost || '—') +
      '</strong>' +
      ' <span class="maint-footer-label">Scheduled Hours Lost</span></span>' +
      '</div>' +
      '</article>'
    );
  }

  function renderMtbfKpi(kpi) {
    if (!kpi || kpi.wip) return '';
    var target = Number(kpi.target || 12);
    var deltaVal = Number(kpi.delta_vs_target || 0);
    var deltaClass = deltaVal < 0 ? 'bad' : 'good';
    var deltaArrow = deltaVal < 0 ? '▼' : '▲';
    var lastPeriodClass =
      kpi.last_period_class ||
      (Number(kpi.last_period_delta) < 0
        ? 'bad'
        : Number(kpi.last_period_delta) > 0
          ? 'good'
          : 'neutral');
    var lastPeriodValue =
      kpi.last_period_delta_display ||
      (Number(kpi.last_period_delta) > 0 ? '+' : '') + Number(kpi.last_period_delta || 0).toFixed(2);
    var lastPeriodLabel = kpi.last_period_label || 'Last Period';
    var lastShiftVal = (kpi.last_shift && kpi.last_shift.display) || null;
    var dotClass = kpi.status_dot || (kpi.value < target ? 'critical' : 'good');
    var lastShiftClass =
      lastShiftVal && String(lastShiftVal).indexOf('-') === 0 ? 'bad' : lastShiftVal ? 'warning' : 'muted';

    return (
      '<article class="maint-kpi-card maint-kpi-mtbf maint-kpi-card-design" data-kpi="mtbf">' +
      '<div class="maint-kpi-head">' +
      '<span class="maint-status-dot ' +
      dotClass +
      '" aria-hidden="true"></span>' +
      '<span class="maint-kpi-title">Mean Time Between Failure (MTBF)</span>' +
      '</div>' +
      '<div class="maint-kpi-body">' +
      '<div class="maint-kpi-main">' +
      '<div class="maint-kpi-value">' +
      esc(kpi.value_display || kpi.value + ' hrs') +
      '</div>' +
      '<div class="maint-kpi-target-row">' +
      '<span class="maint-kpi-target-label">Target</span> ' +
      '<strong class="maint-kpi-target-value">' +
      esc(kpi.target_display || target.toFixed(2) + ' hrs') +
      '</strong>' +
      '<span class="maint-kpi-delta ' +
      deltaClass +
      '">' +
      esc(kpi.delta_vs_target_display || Math.abs(deltaVal).toFixed(2)) +
      ' ' +
      deltaArrow +
      '</span></div></div>' +
      '<div class="maint-kpi-trend">' +
      '<div class="maint-kpi-trend-chart">' +
      '<div class="maint-kpi-trend-canvas-wrap">' +
      '<canvas id="maint-spark-mtbf" aria-label="MTBF by period for fiscal year"></canvas>' +
      '</div>' +
      '<div class="maint-trend-period-delta">' +
      '<span class="maint-trend-period-label">' +
      esc(lastPeriodLabel) +
      '</span> ' +
      '<span class="maint-trend-period-value ' +
      lastPeriodClass +
      '">' +
      esc(String(lastPeriodValue)) +
      '</span></div></div></div></div>' +
      '<div class="maint-kpi-footer-stats maint-kpi-footer-visible">' +
      '<span class="maint-footer-left">' +
      '<span class="maint-footer-label">Last Shift </span>' +
      '<span class="maint-footer-value ' +
      lastShiftClass +
      '">' +
      esc(lastShiftVal || '—') +
      '</span></span>' +
      '<span class="maint-footer-right">' +
      '<span class="maint-footer-value bad">' +
      esc(kpi.footer_right || '—') +
      '</span></span></div></article>'
    );
  }

  function renderTotalDtKpi(kpi) {
    if (!kpi) return '';
    var target = Number(kpi.target || 0);
    var deltaClass = kpi.delta_vs_target > 0 ? 'bad' : 'good';
    var deltaArrow = kpi.delta_vs_target > 0 ? '▲' : '▼';
    var lastPeriodDelta = Number(kpi.last_period_delta != null ? kpi.last_period_delta : 0);
    var lastPeriodClass =
      kpi.last_period_class ||
      (lastPeriodDelta > 0 ? 'bad' : lastPeriodDelta < 0 ? 'good' : 'neutral');
    var lastPeriodValue =
      kpi.last_period_delta_display ||
      (lastPeriodDelta > 0 ? '+' : '') + lastPeriodDelta.toFixed(2) + '%';
    var lastPeriodLabel = (kpi && kpi.last_period_label) || 'Last Period';
    var lastShiftVal = (kpi.last_shift && kpi.last_shift.display) || null;
    var footerVal = kpi.footer_right || null;
    var footerLabel = kpi.footer_right_label || 'Total Downtime Hours';
    var dotClass = kpi.status_dot || (kpi.value > target ? 'critical' : statusDotClass(kpi.value, target));

    return (
      '<article class="maint-kpi-card maint-kpi-total-dt maint-kpi-card-design" data-kpi="total-dt">' +
      '<div class="maint-kpi-head">' +
      '<span class="maint-status-dot ' +
      dotClass +
      '" aria-hidden="true"></span>' +
      '<span class="maint-kpi-title">' +
      esc(kpi.label || 'Total Downtime %') +
      (kpi.wip ? ' <span class="maint-wip-badge">WIP</span>' : '') +
      '</span></div>' +
      '<div class="maint-kpi-body">' +
      '<div class="maint-kpi-main">' +
      '<div class="maint-kpi-value">' +
      esc(kpi.value_display || (kpi.wip ? '—' : fmtPct(kpi.value))) +
      '</div>' +
      '<div class="maint-kpi-target-row">' +
      '<span class="maint-kpi-target-label">Target</span> ' +
      '<strong class="maint-kpi-target-value">' +
      esc(kpi.target_display || fmtPct(target)) +
      '</strong>' +
      '<span class="maint-kpi-delta ' +
      deltaClass +
      '">' +
      esc(kpi.delta_vs_target_display || Math.abs(kpi.delta_vs_target).toFixed(2) + '%') +
      ' ' +
      deltaArrow +
      '</span></div></div>' +
      '<div class="maint-kpi-trend">' +
      '<div class="maint-kpi-trend-chart">' +
      '<div class="maint-kpi-trend-canvas-wrap">' +
      '<canvas id="maint-spark-total-dt" aria-label="Total downtime percent by period for fiscal year"></canvas>' +
      '</div>' +
      '<div class="maint-trend-period-delta">' +
      '<span class="maint-trend-period-label">' +
      esc(lastPeriodLabel) +
      '</span> ' +
      '<span class="maint-trend-period-value ' +
      lastPeriodClass +
      '">' +
      esc(String(lastPeriodValue).replace(/\s+%/g, '%')) +
      '</span></div></div></div></div>' +
      '<div class="maint-kpi-footer-stats maint-kpi-footer-visible">' +
      '<span class="maint-footer-left">' +
      '<span class="maint-footer-label">Last Shift </span>' +
      '<span class="maint-footer-value ' +
      (lastShiftVal ? 'bad' : 'muted') +
      '">' +
      esc(lastShiftVal || '—') +
      '</span></span>' +
      '<span class="maint-footer-right">' +
      '<strong class="maint-footer-value bad">' +
      esc(footerVal || '—') +
      '</strong>' +
      ' <span class="maint-footer-label">' +
      esc(footerLabel) +
      '</span></span></div></article>'
    );
  }

  function renderSecondaryKpis(list) {
    return (list || [])
      .map(function (k, i) {
        if (k.wip) {
          return (
            '<article class="maint-kpi-card maint-kpi-card-wip-placeholder" style="animation-delay:' +
            i * 0.05 +
            's" aria-label="' +
            esc(k.label || 'KPI') +
            ' — work in progress">' +
            '<div class="maint-kpi-head">' +
            '<span class="maint-kpi-title">' +
            esc(k.label) +
            '</span>' +
            '<span class="maint-status-dot muted" aria-hidden="true"></span>' +
            '</div>' +
            '<div class="maint-kpi-wip-banner" role="status">' +
            '<span class="maint-kpi-wip-banner-text">WIP</span>' +
            '<span class="maint-kpi-wip-banner-sub">Metric not available yet</span>' +
            '</div></article>'
          );
        }
        var val = k.value || '—';
        var target = k.target ? 'Target <strong>' + esc(k.target) + '</strong>' : '';
        return (
          '<article class="maint-kpi-card" style="animation-delay:' +
          i * 0.05 +
          's">' +
          '<div class="maint-kpi-head">' +
          '<span class="maint-kpi-title">' +
          esc(k.label) +
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
          '</div></article>'
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
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>' +
      '</button>' +
      '<button type="button" class="maint-action-btn round" data-action="kpi-overview" aria-label="KPI Overview" onclick="window.__goKpiOverview && window.__goKpiOverview(event)">' +
      '<span class="maint-tooltip">KPI Overview</span>' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>' +
      '</button>' +
      '</div></div>'
    );
  }

  function severityLabel(sev) {
    var map = { critical: 'Critical', high: 'High', medium: 'Medium', info: 'Insight' };
    return map[String(sev || '').toLowerCase()] || 'Insight';
  }

  function renderAiSummaries(summaries) {
    return (summaries || [])
      .map(function (s, i) {
        return (
          '<article class="maint-ai-card" style="animation-delay:' +
          i * 0.08 +
          's">' +
          '<div class="ai-summary-icon" aria-hidden="true">✦</div>' +
          '<div class="maint-ai-content">' +
          '<div class="maint-ai-head">' +
          '<span class="maint-insight-time">' +
          esc(s.timestamp || 'Period to date') +
          '</span>' +
          '</div>' +
          '<div class="ai-summary-label">' +
          esc(s.title) +
          '</div>' +
          '<p class="ai-summary-text">' +
          esc(s.body) +
          '</p></div></article>'
        );
      })
      .join('');
  }

  function renderInsightsTabs() {
    var tab = state.insightTab || 'alerts';
    return (
      '<div class="maint-insights-tabs" role="tablist">' +
      '<button type="button" class="maint-insights-tab' +
      (tab === 'alerts' ? ' active' : '') +
      '" data-tab="alerts" role="tab" aria-selected="' +
      (tab === 'alerts' ? 'true' : 'false') +
      '">Alerts</button>' +
      '<button type="button" class="maint-insights-tab' +
      (tab === 'insights' ? ' active' : '') +
      '" data-tab="insights" role="tab" aria-selected="' +
      (tab === 'insights' ? 'true' : 'false') +
      '">Key Insights</button></div>'
    );
  }

  function renderInsightsPanel(p) {
    var tab = state.insightTab || 'alerts';
    var scopeNote =
      tab === 'alerts'
        ? 'Previous day · respects site, region, line, department, and shift filters'
        : 'Period to date (PTD) · respects site, region, line, department, and shift filters';
    var body =
      tab === 'alerts'
        ? '<div class="maint-alerts-list" id="maint-alerts-list">' + renderAlerts(p.alerts) + '</div>'
        : '<div class="maint-insights-list" id="maint-insights-list">' +
          renderAiSummaries(p.ai_summaries) +
          '</div>';
    return (
      renderInsightsTabs() +
      '<p class="maint-insights-scope">' +
      esc(scopeNote) +
      '</p>' +
      body
    );
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
    var mtbf = p.kpis && p.kpis.mtbf;
    var totalDt = p.kpis && p.kpis.total_downtime;

    root.innerHTML =
      '<div class="maint-kpi-row" id="maint-kpi-row">' +
      renderPrimaryKpi(kpi) +
      renderMtbfKpi(mtbf) +
      renderTotalDtKpi(totalDt) +
      renderSecondaryKpis(p.secondary_kpis) +
      '</div>' +
      '<div class="maint-insights-panel-wrap">' +
      renderInsightsPanel(p) +
      '</div>';

    bindMaintenanceEvents();
    var primaryCard = document.querySelector('.maint-kpi-card-design[data-action="my-report"]');
    if (primaryCard && !primaryCard.dataset.reportKeyBound) {
      primaryCard.dataset.reportKeyBound = '1';
      primaryCard.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openMyReport();
        }
      });
    }
    requestAnimationFrame(function () {
      drawSparkline('maint-spark-primary', kpi && kpi.trend);
      drawSparkline('maint-spark-mtbf', mtbf && mtbf.trend);
      drawSparkline('maint-spark-total-dt', totalDt && totalDt.trend);
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
    grad.addColorStop(0, 'rgba(229,57,53,0.28)');
    grad.addColorStop(1, 'rgba(229,57,53,0.02)');
    state.charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            data: data,
            borderColor: '#e53935',
            backgroundColor: grad,
            fill: true,
            tension: 0.45,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 4, bottom: 6, left: 0, right: 0 } },
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
    $$('.maint-insights-tab[data-tab], .maint-tab[data-tab]').forEach(function (tab) {
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

  function kpiOverviewShowInMode() {
    return String(state.filters.showIn || 'Thousands').toLowerCase();
  }

  function parseKpiNumeric(raw) {
    if (raw == null) return NaN;
    return parseFloat(String(raw).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  }

  function formatKpiOverviewHoursDisplay(raw) {
    var n = parseKpiNumeric(raw);
    if (!isFinite(n)) return '—';
    var mode = kpiOverviewShowInMode();
    if (mode === 'thousands') return (n / 1e6).toFixed(2) + ' M';
    if (mode === 'percentage') return n.toFixed(2) + ' %';
    return Math.round(n).toLocaleString('en-US');
  }

  function formatKpiOverviewHoursTrend(values) {
    var mode = kpiOverviewShowInMode();
    return (values || []).map(function (v) {
      var n = Number(v);
      if (!isFinite(n)) return 0;
      if (mode === 'thousands') return n / 1e6;
      return n;
    });
  }

  function deltaClassName(direction) {
    if (direction === 'good') return 'good';
    if (direction === 'bad') return 'bad';
    return 'neutral';
  }

  function destroyKpiStripCharts() {
    ['kpi-strip-dt-pct', 'kpi-strip-dt-hrs', 'kpi-strip-stops'].forEach(function (id) {
      destroyChart(id);
      var mc = window.ManufacturingConsole;
      if (mc && mc.state && mc.state.charts && mc.state.charts[id]) {
        try {
          mc.state.charts[id].destroy();
        } catch (e) {
          /* ignore */
        }
        delete mc.state.charts[id];
      }
    });
  }

  function drawKpiStripSparkline(canvasId, labels, data, lineColor, fillTop, fillBottom) {
    destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined' || !data || !data.length) return;
    var ctx = canvas.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, 0, 88);
    grad.addColorStop(0, fillTop || 'rgba(229,57,53,0.28)');
    grad.addColorStop(1, fillBottom || 'rgba(229,57,53,0.02)');
    var chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            data: data,
            borderColor: lineColor,
            backgroundColor: grad,
            fill: true,
            tension: 0.42,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 4, bottom: 2, left: 0, right: 0 } },
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: { x: { display: false }, y: { display: false } },
        animation: { duration: 500 },
      },
    });
    state.charts[canvasId] = chart;
    var mc = window.ManufacturingConsole;
    if (mc && mc.state && mc.state.charts) {
      mc.state.charts[canvasId] = chart;
    }
  }

  function renderKpiOverviewMetricStrip() {
    if (state.page !== 'kpi-overview') return;
    var mc = window.ManufacturingConsole;
    if (!mc || !mc.state) return;
    var metrics = mc.state.liveMetrics;
    if (!metrics || !metrics.kpis) return;

    var kpis = metrics.kpis;
    var dt = kpis.downtime_pct || {};
    var hrs = kpis.downtime_hrs || {};
    var stops = kpis.stops || {};
    var labels = metrics.ytd_periods || metrics.periods || [];
    var trendPct = metrics.ytd_period_trend || [];
    var trendHrs = formatKpiOverviewHoursTrend(metrics.ytd_period_trend_hrs || []);
    var trendStops = metrics.ytd_stops_period_trend || [];

    if (!labels.length && trendPct.length) {
      labels = trendPct.map(function (_, i) {
        return 'P' + (i + 1);
      });
    }

    var hoursLabel =
      kpiOverviewShowInMode() === 'thousands'
        ? 'Unplanned DT Hours (M)'
        : kpiOverviewShowInMode() === 'percentage'
          ? 'Unplanned DT Hours'
          : 'Unplanned Downtime Hours';

    var html =
      '<div class="metric-card metric-card-with-trend">' +
      '<div class="metric-card-main">' +
      '<div class="metric-label">Unplanned DT %</div>' +
      '<div class="metric-value">' +
      esc(dt.value || '—') +
      '</div>' +
      '<div class="metric-delta ' +
      deltaClassName(dt.direction) +
      '">' +
      esc(dt.delta || '') +
      '</div>' +
      '<div class="metric-trend-caption">YTD by period</div></div>' +
      '<div class="metric-card-trend"><canvas id="kpi-strip-dt-pct" aria-label="Unplanned downtime percent YTD trend"></canvas></div></div>' +
      '<div class="metric-card metric-card-with-trend">' +
      '<div class="metric-card-main">' +
      '<div class="metric-label">' +
      esc(hoursLabel) +
      '</div>' +
      '<div class="metric-value">' +
      esc(formatKpiOverviewHoursDisplay(hrs.value)) +
      '</div>' +
      '<div class="metric-delta ' +
      deltaClassName(hrs.direction) +
      '">' +
      esc(hrs.delta || '') +
      '</div>' +
      '<div class="metric-trend-caption">YTD by period</div></div>' +
      '<div class="metric-card-trend"><canvas id="kpi-strip-dt-hrs" aria-label="Unplanned downtime hours YTD trend"></canvas></div></div>' +
      '<div class="metric-card metric-card-with-trend">' +
      '<div class="metric-card-main">' +
      '<div class="metric-label">STOPS</div>' +
      '<div class="metric-value">' +
      esc(stops.value || '—') +
      '</div>' +
      '<div class="metric-delta ' +
      deltaClassName(stops.direction) +
      '">' +
      esc(stops.delta || '') +
      '</div>' +
      '<div class="metric-trend-caption">YTD by period</div></div>' +
      '<div class="metric-card-trend"><canvas id="kpi-strip-stops" aria-label="Stops YTD trend"></canvas></div></div>';

    document.querySelectorAll('.metric-strip-root').forEach(function (strip) {
      strip.classList.add('metric-strip-ytd-trends');
      strip.innerHTML = html;
    });

    requestAnimationFrame(function () {
      var lbl = labels.slice(0, Math.max(trendPct.length, trendHrs.length, trendStops.length));
      drawKpiStripSparkline(
        'kpi-strip-dt-pct',
        lbl,
        trendPct,
        '#e53935',
        'rgba(229,57,53,0.28)',
        'rgba(229,57,53,0.02)'
      );
      drawKpiStripSparkline(
        'kpi-strip-dt-hrs',
        lbl,
        trendHrs,
        '#1565c0',
        'rgba(21,101,192,0.24)',
        'rgba(21,101,192,0.02)'
      );
      drawKpiStripSparkline(
        'kpi-strip-stops',
        lbl,
        trendStops,
        '#002855',
        'rgba(0,40,85,0.22)',
        'rgba(0,40,85,0.02)'
      );
    });
  }

  function afterKpiOverviewMetricsUpdated() {
    if (state.page !== 'kpi-overview') return;
    renderKpiOverviewMetricStrip();
  }

  function patchKpiOverviewMetricStripHooks() {
    var mc = window.ManufacturingConsole;
    if (!mc || mc.__kpiStripHooksPatched) return;
    mc.__kpiStripHooksPatched = true;
    if (typeof mc.applyShowIn === 'function') {
      var origApply = mc.applyShowIn.bind(mc);
      mc.applyShowIn = function () {
        origApply();
        afterKpiOverviewMetricsUpdated();
      };
    }
  }

  function handleKnowMoreAction(e) {
    var actionable = e.target.closest('[data-action]');
    if (!actionable) return false;
    var action = actionable.getAttribute('data-action');
    if (actionable.classList.contains('maint-kpi-card-design')) {
      e.preventDefault();
      if (action === 'my-report') openMyReport();
      return true;
    }
    if (!actionable.closest('.maint-know-actions')) return false;
    e.preventDefault();
    e.stopPropagation();
    if (action === 'my-report') openMyReport();
    else if (action === 'drill-down') openDrillDown();
    else if (action === 'kpi-overview') goToKpiOverview();
    return true;
  }

  function goToKpiOverview() {
    var mc = window.ManufacturingConsole;
    if (!mc) return;

    try {
      syncToConsoleFilters();
    } catch (err) {
      console.warn('[maintenance] filter sync skipped:', err);
    }

    state.page = 'kpi-overview';
    document.body.classList.remove('mode-maintenance');
    document.body.classList.add('mode-kpi-overview');
    updateShellForPage('kpi-overview');
    updateSlicerDisplay('showIn', state.filters.showIn || 'Thousands');

    if (typeof engineEnterKpiOverview === 'function') {
      engineEnterKpiOverview(true);
    } else if (engineSwitchPage && engineSwitchKpiTab) {
      engineSwitchPage('kpi-overview', true);
      engineSwitchKpiTab('overview', true);
    }

    applyShowInToEngine();
    reflowDashboardCharts();
    reloadConsoleMetrics(true);
    afterKpiOverviewMetricsUpdated();
  }

  function openKpiOverviewFromReport() {
    closeMyReport();
    goToKpiOverview();
  }

  function openMyReport() {
    var overlay = $('#maint-report-modal');
    if (!overlay) return;
    state.reportTab = 'snapshot';
    state.reportAnimateIn = true;
    overlay.classList.add('open');
    document.body.classList.add('maint-report-open');
    renderReportModal();
  }

  function reportModalTabsHtml() {
    return (
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
      '</div>'
    );
  }

  function bindReportTabHandlers() {
    $$('[data-report-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.reportTab = btn.getAttribute('data-report-tab');
        state.reportAnimateIn = true;
        renderReportModal();
      });
    });
  }

  function renderReportSnapshotLoading() {
    var barSkel = [92, 74, 48, 32, 26]
      .map(function (w) {
        return (
          '<div class="maint-exposure-row maint-skeleton-row">' +
          '<div class="maint-skeleton-line maint-skeleton-site"></div>' +
          '<div class="maint-exposure-bar-col">' +
          '<div class="maint-exposure-track maint-skeleton-track">' +
          '<div class="maint-skeleton-bar" style="width:' +
          w +
          '%"></div></div></div></div>'
        );
      })
      .join('');
    return (
      '<div class="maint-report-section-head">' +
      '<h4>Total Unplanned Downtime %</h4>' +
      '<div class="maint-skeleton-pill" style="width:108px;height:32px"></div></div>' +
      '<div class="maint-snapshot-grid">' +
      '<div class="maint-snapshot-col-left">' +
      '<div class="maint-report-donut-card maint-donut-card-plain">' +
      '<div class="maint-donut-visual-panel maint-skeleton-donut-panel">' +
      '<div class="maint-donut-wrap maint-skeleton-donut-wrap maint-donut-wrap-report">' +
      '<div class="maint-skeleton-donut" aria-hidden="true"></div></div>' +
      '<div class="maint-donut-meta-stack">' +
      '<div class="maint-skeleton-pill maint-donut-pill-skeleton"></div>' +
      '<div class="maint-skeleton-pill maint-donut-pill-skeleton"></div></div></div></div>' +
      '<div class="maint-stat-stack maint-stat-stack-report">' +
      [1, 2, 3]
        .map(function () {
          return '<div class="maint-stat-card maint-skeleton-stat"><div class="maint-skeleton-line"></div></div>';
        })
        .join('') +
      '</div></div>' +
      '<div class="maint-bar-section maint-bar-section-compact">' +
      '<h4>Unplanned Downtime Exposure Rate: Top 5 Ranked Sites</h4>' +
      '<div class="maint-exposure-chart maint-skeleton-chart">' +
      '<div class="maint-exposure-bars-panel">' +
      barSkel +
      '</div></div></div>'
    );
  }

  function bindReportDonutNavigation() {
    var card = $('.maint-report-donut-clickable');
    if (!card || card.dataset.kpiNavBound) return;
    card.dataset.kpiNavBound = '1';
    card.addEventListener('click', function (e) {
      e.preventDefault();
      openKpiOverviewFromReport();
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openKpiOverviewFromReport();
      }
    });
  }

  function closeMyReport() {
    var overlay = $('#maint-report-modal');
    if (overlay) overlay.classList.remove('open');
    document.body.classList.remove('maint-report-open');
    Object.keys(state.charts).forEach(function (k) {
      if (k.indexOf('report-') === 0) destroyChart(k);
    });
  }

  function reportStatCard(label, value, iconSvg) {
    return (
      '<div class="maint-stat-card maint-stat-card-report">' +
      '<div class="maint-stat-card-content">' +
      '<label>' +
      esc(label) +
      '</label>' +
      '<strong>' +
      esc(value) +
      '</strong></div>' +
      '<div class="maint-stat-icon maint-stat-icon-report" aria-hidden="true">' +
      iconSvg +
      '</div></div>'
    );
  }

  var REPORT_ICONS = {
    schedule:
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    downtime:
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 18h16M6 14l3-6 3 4 3-7 3 9"/><circle cx="18" cy="6" r="2"/></svg>',
    percent:
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="M9 15l6-6"/></svg>',
  };

  function modernChartBase() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 750, easing: 'easeOutQuart' },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a2b4a', padding: 10, cornerRadius: 8 } },
    };
  }

  function barGradient(ctx, area, colors) {
    var g = ctx.createLinearGradient(area.left, 0, area.right, 0);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    return g;
  }

  function targetLinePlugin(target, label) {
    return {
      id: 'targetLine-' + target,
      afterDraw: function (chart) {
        var xScale = chart.scales.x;
        var yScale = chart.scales.y;
        if (!xScale || !yScale) return;
        var x = xScale.getPixelForValue(target);
        var ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = '#16a34a';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, yScale.top + 4);
        ctx.lineTo(x, yScale.bottom - 4);
        ctx.stroke();
        ctx.fillStyle = '#16a34a';
        ctx.font = '600 10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label || 'FLNA Target: ' + target.toFixed(2) + '%', x + 6, yScale.top + 16);
        ctx.restore();
      },
    };
  }

  function hbarValueLabelsPlugin(rows, formatter) {
    return {
      id: 'hbarValueLabels',
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx;
        var meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;
        meta.data.forEach(function (bar, index) {
          var row = rows[index];
          if (!row) return;
          var text = formatter(row);
          var x = Math.min(bar.x - 8, chart.chartArea.right - 8);
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.font = '600 11px Inter, sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.25)';
          ctx.shadowBlur = 4;
          ctx.fillText(text, x, bar.y);
          ctx.restore();
        });
      },
    };
  }

  function donutCenterPlugin(mainText, subText, mainColor, sizes) {
    sizes = sizes || {};
    var mainSize = sizes.main || 26;
    var subSize = sizes.sub || 11;
    return {
      id: 'donutCenterText',
      afterDraw: function (chart) {
        var area = chart.chartArea;
        if (!area) return;
        var ctx = chart.ctx;
        var x = (area.left + area.right) / 2;
        var y = (area.top + area.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = mainColor || '#1a2b4a';
        ctx.font = '800 ' + mainSize + 'px Inter, system-ui, sans-serif';
        ctx.fillText(mainText, x, y - 8);
        if (subText) {
          ctx.fillStyle = '#64748b';
          ctx.font = '600 ' + subSize + 'px Inter, system-ui, sans-serif';
          ctx.fillText(subText, x, y + 18);
        }
        ctx.restore();
      },
    };
  }

  function renderReportModal() {
    var body = $('#maint-report-body');
    if (!body) return;

    if (!state.payload) {
      body.innerHTML =
        reportModalTabsHtml() +
        '<div id="maint-report-content" class="maint-report-content maint-report-loading" role="status" aria-live="polite">' +
        renderReportSnapshotLoading() +
        '</div>';
      bindReportTabHandlers();
      return;
    }

    var p = state.payload;
    var kpi = p.kpis && p.kpis.primary;
    var animate = !!state.reportAnimateIn;
    state.reportAnimateIn = false;

    body.innerHTML = reportModalTabsHtml() + '<div id="maint-report-content"></div>';
    bindReportTabHandlers();

    var content = $('#maint-report-content');
    content.className = 'maint-report-content' + (animate ? ' maint-report-animate-in' : '');
    if (state.reportTab === 'snapshot') content.innerHTML = renderReportSnapshot(kpi, p);
    else if (state.reportTab === 'sites') content.innerHTML = renderReportSites(p);
    else content.innerHTML = renderReportDrivers(p);

    if (animate) {
      window.setTimeout(function () {
        var el = $('#maint-report-content');
        if (el) el.classList.remove('maint-report-animate-in');
      }, 1200);
    }

    requestAnimationFrame(function () {
      if (state.reportTab === 'snapshot') {
        drawReportDonut('report-donut', kpi, animate);
        bindReportDonutNavigation();
      } else if (state.reportTab === 'drivers') {
        drawDriversDonut('report-drivers-donut', p.downtime_drivers);
      }
    });
  }

  function siteTableDetail(row) {
    return (
      fmtNum(row.hours) +
      ' Unplanned DT Hrs / ' +
      fmtNum(row.sched_hrs) +
      ' Sched Hrs'
    );
  }

  function siteExposureTable(sites, targetPct) {
    return renderMaintExposureChart((sites || []).slice(0, 5), { targetPct: targetPct });
  }

  function lineExposureTable(lines, targetPct) {
    return renderMaintExposureChart((lines || []).slice(0, 5), {
      nameKey: 'line',
      labelClass: 'maint-exposure-site maint-exposure-line-label',
      targetPct: targetPct,
    });
  }

  function renderReportSnapshot(kpi, p) {
    var dtHrs = (kpi && kpi.downtime_hours && kpi.downtime_hours.display) || '—';
    var sched =
      (kpi && kpi.timeframe_scheduled_hours && kpi.timeframe_scheduled_hours.display) ||
      (kpi && kpi.scheduled_hours && kpi.scheduled_hours.display) ||
      '—';
    var pctDowntime =
      (kpi && kpi.total_downtime_pct && kpi.total_downtime_pct.display) || '—';
    var target = kpi ? kpi.target : DT_TARGET;
    var delta = kpi ? Math.abs(kpi.delta_vs_target).toFixed(2) : '0.00';
    var deltaArrow = kpi && kpi.delta_vs_target > 0 ? '▲' : '▼';
    var stops = (kpi && kpi.stops && kpi.stops.display) || '—';

    return (
      '<div class="maint-report-section-head">' +
      '<h4>Total Unplanned Downtime %</h4>' +
      '<select class="maint-report-metric-select" aria-label="Metric selector">' +
      '<option>Total DT %</option></select></div>' +
      '<div class="maint-snapshot-grid">' +
      '<div class="maint-snapshot-col-left">' +
      '<div class="maint-report-donut-card maint-donut-card-plain maint-report-donut-clickable" data-action="kpi-overview-from-report" role="button" tabindex="0" aria-label="Open KPI Overview with current filters">' +
      '<div class="maint-donut-visual-panel">' +
      '<div class="maint-donut-wrap maint-donut-wrap-report"><canvas id="report-donut"></canvas></div></div>' +
      '<div class="maint-donut-meta-stack">' +
      '<div class="maint-donut-pill maint-donut-pill-target">' +
      '<span class="maint-donut-pill-label">Target</span>' +
      '<span class="maint-donut-pill-value">' +
      fmtPct(target) +
      '</span>' +
      '<span class="maint-donut-pill-delta bad">' +
      delta +
      'pp ' +
      deltaArrow +
      '</span></div>' +
      '<div class="maint-donut-pill maint-donut-pill-stops">' +
      '<span class="maint-donut-pill-label">Total Stops</span>' +
      '<span class="maint-donut-pill-value bad">' +
      esc(stops) +
      '</span></div></div></div></div>' +
      '<div class="maint-stat-stack maint-stat-stack-report">' +
      reportStatCard('Schedule Hours', sched.replace(' h', ''), REPORT_ICONS.schedule) +
      reportStatCard('Unplanned Downtime Hours', dtHrs.replace(' h', ''), REPORT_ICONS.downtime) +
      reportStatCard('Percentage Downtime', pctDowntime.replace(' h', ''), REPORT_ICONS.percent) +
      '</div></div>' +
      '<div class="maint-bar-section maint-bar-section-compact">' +
      '<h4>Unplanned Downtime Exposure Rate: Top 5 Ranked Sites</h4>' +
      siteExposureTable(p.sites_at_risk, target) +
      '</div>'
    );
  }

  function renderReportSites(p) {
    var topSite = (p.sites_at_risk && p.sites_at_risk[0] && p.sites_at_risk[0].site) || 'Top Site';
    var target = (p.kpis && p.kpis.primary && p.kpis.primary.target) || DT_TARGET;
    var badge = p.site_lines_badge || { label: 'HIGH LOSS', class: 'critical' };
    return (
      '<div class="maint-bar-section maint-bar-section-compact">' +
      '<h4>Unplanned Downtime Exposure Rate: Top 5 Ranked Sites</h4>' +
      siteExposureTable(p.sites_at_risk, target) +
      '</div>' +
      '<div class="maint-bar-section maint-bar-section-compact">' +
      '<div class="maint-report-section-head" style="margin-bottom:10px">' +
      '<h4 style="margin:0">' +
      esc(topSite) +
      ' — Top 5 Lines by Unplanned Downtime Hours</h4>' +
      '<span class="maint-severity ' +
      esc(badge.class || 'critical') +
      '">' +
      esc(badge.label || 'HIGH LOSS') +
      '</span></div>' +
      lineExposureTable(p.site_lines, target) +
      '</div>'
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
      '<div class="maint-report-section-head"><h4>Total Unplanned Downtime %</h4></div>' +
      '<div class="maint-bar-section maint-bar-section-compact">' +
      '<div class="donut-chart-layout maint-drivers-donut-layout">' +
      '<div class="donut-canvas-wrap maint-donut-wrap"><canvas id="report-drivers-donut"></canvas></div>' +
      '<div class="donut-legend maint-drivers-legend" id="report-drivers-legend"></div></div></div>' +
      '<div class="maint-insights-panel maint-insights-panel-compact"><h4>AI Insight</h4><ul>' +
      bullets +
      '</ul></div>'
    );
  }

  function drawDonut(id, kpi) {
    drawReportDonut(id, kpi, false);
  }

  function drawReportDonut(id, kpi, immersive) {
    destroyChart(id);
    var canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined' || !kpi) return;
    var val = kpi.value || 0;
    var rest = Math.max(0, 100 - val);
    var centerColor = val > (kpi.target || DT_TARGET) ? '#e53935' : '#002855';
    var animMs = immersive ? 1100 : 750;
    state.charts[id] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Unplanned DT', 'Available'],
        datasets: [
          {
            data: [val, rest],
            backgroundColor: [DONUT_DT_COLOR, '#e8eaed'],
            borderWidth: 0,
            spacing: 3,
            borderRadius: 4,
            hoverOffset: 8,
          },
        ],
      },
      options: Object.assign({}, modernChartBase(), {
        cutout: '68%',
        layout: { padding: 8 },
        animation: {
          duration: animMs,
          easing: immersive ? 'easeOutCubic' : 'easeOutQuart',
          animateRotate: true,
          animateScale: immersive,
        },
        plugins: Object.assign({}, modernChartBase().plugins, { tooltip: { enabled: false } }),
      }),
      plugins: [
        donutCenterPlugin(val.toFixed(1) + '%', 'Unplanned DT', centerColor, {
          main: id === 'report-donut' ? 34 : 26,
          sub: id === 'report-donut' ? 12 : 11,
        }),
      ],
    });
  }

  function drawDriversDonut(id, drivers) {
    destroyChart(id);
    var canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined') return;
    var entries = (drivers || []).slice(0, 6);
    if (!entries.length) return;
    var colors = entries.map(function (_, i) {
      return CHART_COLORS[i % CHART_COLORS.length];
    });
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
            backgroundColor: colors,
            borderWidth: 0,
            spacing: 3,
            borderRadius: 5,
            hoverOffset: 8,
          },
        ],
      },
      options: Object.assign({}, modernChartBase(), {
        cutout: '68%',
        layout: { padding: 8 },
        plugins: Object.assign({}, modernChartBase().plugins, {
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ' ' + ctx.label + ': ' + ctx.parsed.toFixed(1) + '%';
              },
            },
          },
        }),
      }),
    });
    var leg = $('#report-drivers-legend');
    if (leg) {
      leg.innerHTML = entries
        .map(function (d, i) {
          return (
            '<div class="donut-legend-item">' +
            '<span class="donut-legend-swatch" style="background:' +
            colors[i] +
            '"></span>' +
            '<span class="donut-legend-label">' +
            esc(d.reason) +
            '</span>' +
            '<span class="donut-legend-value">' +
            d.pct.toFixed(1) +
            '%</span></div>'
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
    if (!bar || bar.dataset.built) return;
    bar.dataset.built = '1';
    bar.className = 'maint-filter-bar filter-bar';
    bar.replaceChildren();

    bar.appendChild(
      createSlicerGroup('timeframe', 'Timeframe', TIMEFRAME_OPTIONS, state.filters.timeframe, false)
    );
    bar.appendChild(
      createSlicerGroup('year', 'Fiscal Year', [{ value: '2026', label: '2026' }], state.filters.year, false)
    );
    bar.appendChild(createSlicerGroup('site', 'Site (Plant)', [], state.filters.site, false, true));
    bar.appendChild(
      createSlicerGroup('region', 'Region', regionSlicerOptions(), state.filters.region, true)
    );
    bar.appendChild(createSlicerGroup('department', 'Department', [], state.filters.department, false, true));
    bar.appendChild(createSlicerGroup('line', 'Line', [], state.filters.line, false, true));
    bar.appendChild(createSlicerGroup('shift', 'Shift', [], state.filters.shift, false, false));
    bar.appendChild(createDateGroup('from', 'From date', state.filters.dateFrom));
    bar.appendChild(createDateGroup('to', 'To date', state.filters.dateTo));

    var showInGroup = createSlicerGroup(
      'showIn',
      'Show in',
      SHOW_IN_OPTIONS.map(function (v) {
        return { value: v, label: v };
      }),
      state.filters.showIn,
      false
    );
    showInGroup.classList.add('maint-showin-group', 'maint-hidden');
    bar.appendChild(showInGroup);

    updateDateFilterVisibility();

    if (!document.body.dataset.maintSlicerCloseBound) {
      document.body.dataset.maintSlicerCloseBound = '1';
      document.addEventListener('click', function (e) {
        if (e.target.closest('.maint-filter-bar')) return;
        closeAllSlicers();
      });
      bindMaintSlicerViewport();
    }
  }

  function onFilterChange() {
    var fromEl = $('#maint-filter-from');
    var toEl = $('#maint-filter-to');
    if (fromEl) state.filters.dateFrom = fromEl.value;
    if (toEl) state.filters.dateTo = toEl.value;
    syncToConsoleFilters();
    reloadConsoleMetrics(false);
    fetchMaintenanceData(false, false);
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
    var maintFilter = $('#maint-filter-bar');
    var banner = $('#app-banner');
    var subnav = $('#top-nav-secondary');
    var isMaint = page === 'maintenance';
    var isKpi = page === 'kpi-overview';

    document.body.classList.toggle('mode-maintenance', isMaint);
    document.body.classList.toggle('mode-kpi-overview', isKpi);

    var showInGroup = $('.maint-showin-group');
    if (showInGroup) showInGroup.classList.toggle('maint-hidden', !isKpi);

    maintFilter && maintFilter.classList.remove('maint-hidden');
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
    var mc = window.ManufacturingConsole;
    if (mc && mc.state) {
      mc.state.page = page;
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
    updateDateFilterVisibility();
  }

  function bindGlobalEvents() {
    if (!document.body.dataset.maintEventsBound) {
      document.body.dataset.maintEventsBound = '1';
      document.addEventListener('click', handleKnowMoreAction, true);
    }

    var root = document.getElementById('maint-root');
    if (root && !root.dataset.delegateBound) {
      root.dataset.delegateBound = '1';
      root.addEventListener('click', handleKnowMoreAction);
    }

    $('#maint-report-close') &&
      $('#maint-report-close').addEventListener('click', closeMyReport);
    $('#maint-report-backdrop') &&
      $('#maint-report-backdrop').addEventListener('click', closeMyReport);
    $('#maint-report-modal') &&
      $('#maint-report-modal').addEventListener('click', function (e) {
        if (e.target.id === 'maint-report-backdrop') closeMyReport();
      });
    $('#maint-drill-back') &&
      $('#maint-drill-back').addEventListener('click', closeDrillDown);
  }

  function init() {
    if (window.__maintenanceConsoleInitDone) return;
    if (!window.ManufacturingConsole) {
      setTimeout(init, 50);
      return;
    }
    window.__maintenanceConsoleInitDone = true;
    patchConsoleDataFetch();
    patchKpiOverviewMetricStripHooks();
    syncFromConsoleFilters();
    state.filters.year = state.filters.year || '2026';
    state.filters.timeframe = state.filters.timeframe || 'ptd';
    buildPrimaryNav();
    buildFilterBar();
    initDates();
    bindGlobalEvents();

    var mc = window.ManufacturingConsole;
    engineSwitchPage = mc.switchPage;
    engineSwitchKpiTab = mc.switchKpiTab;
    engineEnterKpiOverview = mc.enterKpiOverview || null;

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

    if (typeof mc.reloadMetrics === 'function') {
      var engineReloadMetrics = mc.reloadMetrics.bind(mc);
      mc.reloadMetrics = function (force, opts) {
        syncToConsoleFilters();
        var out = engineReloadMetrics(force, opts);
        var done = function () {
          afterKpiOverviewMetricsUpdated();
          if (state.page === 'maintenance') {
            updateShellForPage('maintenance');
          }
        };
        if (out && typeof out.then === 'function') {
          out.then(done).catch(done);
        } else {
          setTimeout(done, 150);
        }
        return out;
      };
    }

    updateShellForPage('maintenance');
    fetchMaintenanceData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__goKpiOverview = function (e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    goToKpiOverview();
  };

  window.MaintenanceConsole = {
    refresh: fetchMaintenanceData,
    state: state,
    switchPage: switchSectionPage,
    goToKpiOverview: goToKpiOverview,
  };
})();
