-- dashboard_dt_reasons.obo.sql
SELECT
  COALESCE({{reason_col}}, 'Unknown') AS reason,
  ROUND({{dt_hours_m}}, 2) AS hours,
  ROUND({{dt_pct_m}} * 100, 2) AS pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_pct_filter}}
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
  AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
GROUP BY {{reason_col}}
ORDER BY hours DESC
LIMIT 25
