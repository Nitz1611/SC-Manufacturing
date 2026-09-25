-- dashboard_dt_dow_by_shift.obo.sql
SELECT
  DATE_FORMAT({{date_col}}, 'EEEE') AS day_name,
  {{week_expr}} AS week_label,
  {{shift_expr}} AS shift_label,
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
     AND {{timeframe_filter}}
GROUP BY DATE_FORMAT({{date_col}}, 'EEEE'), {{week_expr}}, {{shift_expr}}
ORDER BY week_label, day_name, shift_label
