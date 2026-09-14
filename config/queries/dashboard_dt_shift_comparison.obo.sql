-- dashboard_dt_shift_comparison.obo.sql
SELECT
  UPPER({{site_col}}) AS site,
  CONCAT('Shift ', {{shift_expr}}) AS shift,
  ROUND({{dt_hours_m}}, 0) AS hours
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_type_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
  AND {{region_filter}}
GROUP BY UPPER({{site_col}}), {{shift_expr}}
ORDER BY site, hours DESC
