-- maintenance_dt_hours_trend_ytd.obo.sql
-- YTD sparkline: unplanned downtime hours by production period (no timeframe slicer).
SELECT
  {{period_expr}} AS period_label,
  ROUND({{dt_hours_m}}, 2) AS dt_hours
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_hours_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
  AND {{region_filter}}
  AND {{line_filter}}
  AND {{department_filter}}
  AND {{shift_filter}}
GROUP BY {{period_expr}}
ORDER BY MIN({{period_sort}})
