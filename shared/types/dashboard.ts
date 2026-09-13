/**
 * Shared types — mirrors VR Dashboard shared/appkit-types pattern.
 */
export interface KpiValue {
  value: string;
  delta: string;
  direction: 'good' | 'bad' | 'warn';
}

export interface MetricsPayload {
  meta: {
    year: number;
    period: string;
    week: string;
    source: 'live' | 'cache' | 'demo' | 'sql';
    filters: Record<string, string>;
    filtered_site?: string;
  };
  periods: string[];
  weeks: string[];
  kpis: {
    downtime_pct: KpiValue;
    downtime_hrs: KpiValue;
    stops: KpiValue;
    oee: KpiValue;
  };
  tab_insights: Record<string, string>;
  site_by_period: Record<string, number[]>;
  category_by_period: Record<string, number[]>;
  line_by_period: Record<string, number[]>;
  period_trend: number[];
  reasons: Array<{ reason: string; hours: number; pct: number }>;
  dow_by_day_week: Record<string, Record<string, number>>;
  top_lines: Record<string, number>;
  top_sites_trend: Record<string, number[]>;
  shift_comparison: Array<{ shift: string; hours: number; color?: string }>;
  key_insights?: Array<{ text: string; color: string }>;
}

export interface AnalyticsParams {
  year?: string | number;
  timeframe?: string;
  timeframe_mode?: string;
  period?: string;
  site?: string;
  region?: string;
  market?: string;
}

export type QueryKey =
  | 'dashboard_dt_kpis'
  | 'dashboard_dt_period_trend'
  | 'dashboard_dt_site_by_period'
  | 'dashboard_dt_category_by_period'
  | 'dashboard_dt_line_by_period'
  | 'dashboard_dt_reasons'
  | 'dashboard_dt_dow'
  | 'dashboard_dt_top_lines'
  | 'dashboard_dt_shift_comparison'
  | 'dashboard_filter_options';

export interface SummaryRequest {
  entityType: 'overview' | 'category' | 'line' | 'dow' | 'reason';
  params: AnalyticsParams;
  forceRefresh?: boolean;
}
