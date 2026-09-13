-- dashboard_dt_line_by_period.obo.sql
SELECT
  UPPER({{site_col}}) AS site,
  UPPER({{line_col}}) AS line,
  {{period_expr}} AS period_label,
  ROUND({{dt_pct_m}} * 100, 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_type_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
  AND {{region_filter}}
GROUP BY {{site_col}}, {{line_col}}, {{period_expr}}
ORDER BY site, line, MIN({{period_sort}})
