-- dashboard_dt_reasons.obo.sql
SELECT
  COALESCE(RSN, RSN3, 'Unknown') AS reason,
  ROUND(SUM(Total_Unplanned_Downtime_Hours), 2) AS hours,
  ROUND(AVG(Total_Unplanned_Downtime_Pct), 2) AS pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE 1 = 1
  AND (:year IS NULL OR Year = :year)
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY COALESCE(RSN, RSN3, 'Unknown')
ORDER BY hours DESC
LIMIT 25
