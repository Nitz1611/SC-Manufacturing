-- dashboard_dt_top_lines.obo.sql
SELECT
  UPPER({{site_col}}) AS site,
  UPPER({{line_col}}) AS line,
  ROUND({{dt_pct_m}} * 100, 2) AS dt_pct,
  ROUND({{dt_hours_m}}, 2) AS dt_hours
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_type_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
  AND {{region_filter}}
GROUP BY UPPER({{site_col}}), {{line_col}}
ORDER BY site, dt_hours DESC
