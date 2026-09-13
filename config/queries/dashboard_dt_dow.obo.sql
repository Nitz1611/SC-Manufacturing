-- dashboard_dt_dow.obo.sql
SELECT
  DATE_FORMAT(STRT_DT, 'EEEE') AS day_name,
  Week AS week_label,
  ROUND(AVG(Total_Unplanned_Downtime_Pct), 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE 1 = 1
  AND (:year IS NULL OR Year = :year)
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY DATE_FORMAT(STRT_DT, 'EEEE'), Week
ORDER BY week_label, day_name
