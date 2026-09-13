-- dashboard_dt_top_lines.obo.sql
SELECT
  UPPER({{line_col}}) AS line,
  ROUND(AVG({{dt_pct}}) * 100, 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_type_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY {{line_col}}
ORDER BY dt_pct DESC
LIMIT 15
