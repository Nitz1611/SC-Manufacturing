-- dashboard_dt_site_kpis.obo.sql
-- Per-site KPI rollups via MEASURE() — used when UI filters by site without a full SQL refresh.
SELECT
  UPPER({{site_col}}) AS site,
  ROUND({{dt_pct_m}} * 100, 2) AS downtime_pct,
  ROUND({{dt_hours_m}}, 0) AS downtime_hrs,
  {{stops_m}} AS stops
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_pct_filter}}
  AND {{year_filter}}
  AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
GROUP BY {{site_col}}
ORDER BY site
