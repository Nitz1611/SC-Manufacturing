-- dashboard_dt_shift_comparison.obo.sql
SELECT
  CONCAT('Shift ', SHIFT_KEY) AS shift,
  ROUND(SUM(Total_Unplanned_Downtime_Hours), 0) AS hours
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE 1 = 1
  AND (:year IS NULL OR Year = :year)
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY SHIFT_KEY
ORDER BY hours DESC
