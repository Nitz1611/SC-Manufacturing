-- dashboard_dt_reasons.obo.sql
SELECT
  COALESCE({{reason_col}}, 'Unknown') AS reason,
  ROUND(SUM({{dt_hours}}), 2) AS hours,
  ROUND(AVG({{dt_pct}}) * 100, 2) AS pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_type_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY {{reason_col}}
ORDER BY hours DESC
LIMIT 25
