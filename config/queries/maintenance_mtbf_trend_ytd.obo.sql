-- maintenance_mtbf_trend_ytd.obo.sql
-- Sparkline: MTBF (scheduled hours / stops) by production period for the fiscal year.
SELECT
  {{period_expr}} AS period_label,
  ROUND({{scheduled_hours_m}} / NULLIF({{stops_m}}, 0), 2) AS mtbf_hrs
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_stops_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
  AND {{region_filter}}
  AND {{line_filter}}
  AND {{department_filter}}
  AND {{shift_filter}}
GROUP BY {{period_expr}}
ORDER BY MIN({{period_sort}})
