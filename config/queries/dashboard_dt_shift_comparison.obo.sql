-- dashboard_dt_shift_comparison.obo.sql
SELECT
  CONCAT('Shift ', {{shift_expr}}) AS shift,
  ROUND(SUM(Total_Unplanned_Downtime_Hours), 0) AS hours
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE 1 = 1
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY {{shift_expr}}
ORDER BY hours DESC
