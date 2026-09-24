-- maintenance_dt_trend_ytd.obo.sql
-- YTD unplanned downtime % by production period (sparkline on Maintenance primary KPI).
SELECT
  {{period_expr}} AS period_label,
  ROUND({{dt_pct_m}} * 100, 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_pct_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
  AND {{region_filter}}
  AND {{line_filter}}
  AND {{department_filter}}
  AND {{shift_filter}}
  AND {{ytd_flag_filter}}
GROUP BY {{period_expr}}
ORDER BY MIN({{period_sort}})
