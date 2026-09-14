import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { initManufacturingConsole } from '../../lib/console/engine';

const PAGE_ROUTES: Record<string, string> = {
  'intel-brief': '/intel-brief',
  'kpi-overview': '/kpi/overview',
  insights: '/insights',
  rca: '/rca',
};

const KPI_TAB_ROUTES: Record<string, string> = {
  overview: '/kpi/overview',
  'by-category': '/kpi/by-category',
  'by-line': '/kpi/by-line',
  'by-dow': '/kpi/by-dow',
  'by-reason': '/kpi/by-reason',
};

/** Manufacturing Console shell — DOM targets required by the dashboard engine. */
export function AppLayout() {
  const navigate = useNavigate();
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const teardown = initManufacturingConsole();
    const mc = window.ManufacturingConsole;
    if (mc) {
      const origPage = mc.switchPage.bind(mc);
      const origTab = mc.switchKpiTab.bind(mc);
      mc.switchPage = (pageId: string, instant?: boolean) => {
        origPage(pageId, instant);
        const path = PAGE_ROUTES[pageId];
        if (path) navigate(path, { replace: instant });
      };
      mc.switchKpiTab = (tabId: string, instant?: boolean) => {
        origTab(tabId, instant);
        const path = KPI_TAB_ROUTES[tabId];
        if (path) navigate(path, { replace: instant });
      };
    }

    return () => {
      teardown();
      initRef.current = false;
    };
  }, [navigate]);

  return (
    <>
      <div id="boot-splash" role="status" aria-live="polite" aria-label="Loading Manufacturing Console">
        <div className="boot-grid" aria-hidden="true" />
        <div className="boot-scan" aria-hidden="true" />
        <div className="boot-panel">
          <div className="boot-logo" aria-hidden="true">
            <div className="boot-logo-inner" />
          </div>
          <h1 className="boot-title">
            <span className="boot-title-manufacturing">Manufacturing</span>
            <span className="boot-title-console">Console</span>
          </h1>
          <p className="boot-tagline">Unplanned Downtime Intelligence</p>
          <p className="boot-status" id="boot-status-text">
            Initializing analytics workspace
            <span className="boot-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </p>
          <div className="boot-progress" aria-hidden="true">
            <div className="boot-progress-bar" />
          </div>
        </div>
      </div>

      <div className="app-bg-glow" aria-hidden="true" />

      <div className="app-banner" id="app-banner">
        <header className="app-header">
          <div className="header-brand">
            <img
              src="/img/pepsico-logo.gif"
              alt="PepsiCo"
              className="header-logo"
              onError={e => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <h1 className="header-title">
              <span className="word word-manufacturing">Manufacturing</span>
              <span className="word word-console">Console</span>
            </h1>
          </div>
          <nav className="top-nav-primary" id="top-nav-primary" role="tablist" aria-label="Main sections" />
          <div className="header-context" id="header-context">
            <span className="context-value" id="context-breadcrumb">
              KPI Overview · Overview
            </span>
          </div>
          <div className="header-actions">
            <div className="profile-avatar" title="Plant Manager">
              PM
            </div>
          </div>
        </header>
        <div className="banner-nav" aria-label="KPI navigation">
          <nav className="top-nav-secondary" id="top-nav-secondary" role="tablist" aria-label="KPI views" />
        </div>
      </div>

      <div className="app-shell">
        <div className="workspace">
          <div className="filter-bar" id="filter-bar" role="toolbar" aria-label="Filters" />
          <main className="main-content">
            <section id="page-intel-brief" className="page-panel" aria-label="Intel Brief">
              <div className="page-hero">
                <h2>Intel Brief</h2>
                <p>Executive intelligence summary — content coming in a future requirement.</p>
              </div>
            </section>
            <section id="page-kpi-overview" className="page-panel active" aria-label="KPI Overview">
              <div id="kpi-tab-overview" className="kpi-tab-panel active" data-tab="overview" role="tabpanel" />
              <div id="kpi-tab-by-category" className="kpi-tab-panel" data-tab="by-category" role="tabpanel" />
              <div id="kpi-tab-by-line" className="kpi-tab-panel" data-tab="by-line" role="tabpanel" />
              <div id="kpi-tab-by-dow" className="kpi-tab-panel" data-tab="by-dow" role="tabpanel" />
              <div id="kpi-tab-by-reason" className="kpi-tab-panel" data-tab="by-reason" role="tabpanel" />
            </section>
            <section id="page-insights" className="page-panel" aria-label="Insights">
              <div className="page-hero">
                <h2>Insights</h2>
                <p>AI-driven manufacturing insights — content coming in a future requirement.</p>
              </div>
            </section>
            <section id="page-rca" className="page-panel" aria-label="Root Cause Analysis">
              <div className="page-hero">
                <h2>Root Cause Analysis</h2>
                <p>Deep-dive RCA workspace — content coming in a future requirement.</p>
              </div>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
