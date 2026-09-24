-- dashboard_dt_shift_comparison.obo.sql
SELECT
  CONCAT('Shift ', {{shift_expr}}) AS shift,
  ROUND({{dt_hours_m}}, 0) AS hours
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_hours_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
  AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
GROUP BY {{shift_expr}}
ORDER BY hours DESC
