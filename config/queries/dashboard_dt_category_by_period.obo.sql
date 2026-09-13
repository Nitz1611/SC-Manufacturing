-- dashboard_dt_category_by_period.obo.sql
-- RSN3 category rollup (maps to console category heatmap)
SELECT
  COALESCE(RSN3, 'Unknown') AS category,
  {{period_expr}} AS period_label,
  ROUND(AVG(Total_Unplanned_Downtime_Pct), 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE 1 = 1
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY RSN3, {{period_expr}}
ORDER BY category, period_label
