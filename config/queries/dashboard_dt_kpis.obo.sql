-- dashboard_dt_kpis.obo.sql
SELECT
  ROUND(AVG({{dt_pct}}) * 100, 2) AS downtime_pct,
  ROUND(SUM({{dt_hours}}), 0) AS downtime_hrs,
  SUM({{stops_col}}) AS stops
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_type_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
