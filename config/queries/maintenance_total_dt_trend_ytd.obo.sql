-- maintenance_total_dt_trend_ytd.obo.sql
-- Sparkline: total downtime % by production period for the selected fiscal year only.
SELECT
  {{period_expr}} AS period_label,
  ROUND({{total_dt_pct_m}} * 100, 2) AS total_dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{total_dt_pct_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
  AND {{region_filter}}
  AND {{line_filter}}
  AND {{department_filter}}
  AND {{shift_filter}}
GROUP BY {{period_expr}}
ORDER BY MIN({{period_sort}})
