-- dashboard_dt_top_lines.obo.sql
SELECT
  UPPER({{line_col}}) AS line,
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
GROUP BY {{line_col}}
ORDER BY dt_hours DESC
LIMIT 15
