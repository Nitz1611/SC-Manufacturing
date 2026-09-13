-- dashboard_dt_line_by_period.obo.sql
SELECT
  UPPER({{line_col}}) AS line,
  {{period_expr}} AS period_label,
  ROUND(AVG({{dt_pct}}) * 100, 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_type_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY {{line_col}}, {{period_expr}}
ORDER BY line, MIN(`Production Period`)
