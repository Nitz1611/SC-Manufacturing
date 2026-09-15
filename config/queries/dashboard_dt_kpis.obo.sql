-- dashboard_dt_kpis.obo.sql
SELECT
  ROUND({{dt_pct_m}} * 100, 2) AS downtime_pct,
  ROUND({{dt_hours_m}}, 0) AS downtime_hrs,
  {{stops_m}} AS stops
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_type_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
  AND {{region_filter}}
