#!/usr/bin/env python3
"""Build standalone manufacturing-console-design-approval.html from source assets."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / 'static/css/console.css').read_text(encoding='utf-8')
JS = (ROOT / 'static/js/console.js').read_text(encoding='utf-8')

LOGO_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44" aria-hidden="true"><circle cx="22" cy="22" r="22" fill="#004B93"/><path d="M22 8c-2.2 0-4 3.6-4 8s1.8 8 4 8 4-3.6 4-8-1.8-8-4-8zm-10 14c0 5.5 4.5 10 10 10s10-4.5 10-10" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>'''

EXTRA_CSS = '''
.header-logo { display: flex; align-items: center; justify-content: center; overflow: hidden; }
.header-logo svg { width: 100%; height: 100%; display: block; }
.design-approval-banner {
  background: linear-gradient(90deg, #002855 0%, #0066cc 100%);
  color: #fff; text-align: center; padding: 8px 16px;
  font-size: 12px; font-weight: 600; letter-spacing: 0.2px;
}
.design-approval-banner span { opacity: 0.85; font-weight: 500; }
'''

HTML = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Manufacturing Console — Design Approval</title>
  <meta name="description" content="Standalone Manufacturing Console prototype for design approval." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
  <style>
{CSS}
{EXTRA_CSS}
  </style>
</head>
<body>
  <div class="design-approval-banner" role="status">
    Design Approval Prototype <span>· Mock data · Open in any modern browser · No server required</span>
  </div>
  <div class="app-bg-glow" aria-hidden="true"></div>
  <div class="app-banner" id="app-banner">
    <header class="app-header">
      <div class="header-brand">
        <div class="header-logo" role="img" aria-label="PepsiCo">{LOGO_SVG}</div>
        <h1 class="header-title">
          <span class="word word-manufacturing">Manufacturing</span>
          <span class="word word-console">Console</span>
        </h1>
      </div>
      <nav class="top-nav-primary" id="top-nav-primary" role="tablist" aria-label="Main sections"></nav>
      <div class="header-context" id="header-context">
        <span class="context-value" id="context-breadcrumb">KPI Overview · Overview</span>
      </div>
      <div class="header-actions"><div class="profile-avatar" title="Plant Manager">PM</div></div>
    </header>
    <div class="banner-nav" aria-label="KPI navigation">
      <nav class="top-nav-secondary" id="top-nav-secondary" role="tablist" aria-label="KPI views"></nav>
    </div>
  </div>
  <div class="app-shell">
    <div class="workspace">
      <div class="filter-bar" id="filter-bar" role="toolbar" aria-label="Filters"></div>
      <main class="main-content">
        <section id="page-intel-brief" class="page-panel" aria-label="Intel Brief">
          <div class="page-hero"><h2>Intel Brief</h2><p>Executive intelligence summary — content coming in a future requirement.</p></div>
        </section>
        <section id="page-kpi-overview" class="page-panel active" aria-label="KPI Overview">
          <div id="kpi-tab-overview" class="kpi-tab-panel active" data-tab="overview" role="tabpanel"></div>
          <div id="kpi-tab-by-category" class="kpi-tab-panel" data-tab="by-category" role="tabpanel"></div>
          <div id="kpi-tab-by-line" class="kpi-tab-panel" data-tab="by-line" role="tabpanel"></div>
          <div id="kpi-tab-by-dow" class="kpi-tab-panel" data-tab="by-dow" role="tabpanel"></div>
          <div id="kpi-tab-by-reason" class="kpi-tab-panel" data-tab="by-reason" role="tabpanel"></div>
        </section>
        <section id="page-insights" class="page-panel" aria-label="Insights">
          <div class="page-hero"><h2>Insights</h2><p>AI-driven manufacturing insights — content coming in a future requirement.</p></div>
        </section>
        <section id="page-rca" class="page-panel" aria-label="Root Cause Analysis">
          <div class="page-hero"><h2>Root Cause Analysis</h2><p>Deep-dive RCA workspace — content coming in a future requirement.</p></div>
        </section>
      </main>
    </div>
  </div>
  <script>
{JS}
  </script>
</body>
</html>
'''

def main():
    out = ROOT / 'manufacturing-console-design-approval.html'
    out.write_text(HTML, encoding='utf-8')
    print(f'Wrote {out} ({out.stat().st_size:,} bytes)')

if __name__ == '__main__':
    main()
