-- dashboard_dt_shift_comparison.obo.sql
SELECT
  CONCAT('Shift ', {{shift_expr}}) AS shift,
  ROUND({{dt_hours_m}}, 0) AS hours
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_type_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY {{shift_expr}}
ORDER BY hours DESC
