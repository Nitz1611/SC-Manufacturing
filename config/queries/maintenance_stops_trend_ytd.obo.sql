-- maintenance_stops_trend_ytd.obo.sql
-- YTD sparkline: STOPS by production period (no timeframe slicer).
SELECT
  {{period_expr}} AS period_label,
  ROUND({{stops_m}}, 0) AS stops
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
