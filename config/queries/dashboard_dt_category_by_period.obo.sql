-- dashboard_dt_category_by_period.obo.sql
SELECT
  UPPER({{site_col}}) AS site,
  COALESCE({{category_col}}, 'Unknown') AS category,
  {{period_expr}} AS period_label,
  ROUND({{dt_pct_m}} * 100, 2) AS dt_pct,
  ROUND({{dt_hours_m}}, 2) AS dt_hours
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_type_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
  AND {{region_filter}}
GROUP BY {{site_col}}, {{category_col}}, {{period_expr}}
ORDER BY site, category, MIN({{period_sort}})
