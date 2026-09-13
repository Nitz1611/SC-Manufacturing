-- dashboard_dt_category_by_period.obo.sql
SELECT
  COALESCE({{category_col}}, 'Unknown') AS category,
  {{period_expr}} AS period_label,
  ROUND(AVG({{dt_pct}}) * 100, 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_type_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY {{category_col}}, {{period_expr}}
ORDER BY category, MIN({{period_sort}})
