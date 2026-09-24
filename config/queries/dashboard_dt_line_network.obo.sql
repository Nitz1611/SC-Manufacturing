-- dashboard_dt_line_network.obo.sql
-- Network rollup: MEASURE() by line × period (no site dimension).
SELECT
  UPPER({{line_col}}) AS line,
  {{period_expr}} AS period_label,
  ROUND({{dt_pct_m}} * 100, 2) AS dt_pct,
  ROUND({{dt_hours_m}}, 2) AS dt_hours
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_pct_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
  AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
GROUP BY {{line_col}}, {{period_expr}}
ORDER BY line, MIN({{period_sort}})
