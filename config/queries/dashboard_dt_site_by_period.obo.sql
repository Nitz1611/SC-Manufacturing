-- dashboard_dt_site_by_period.obo.sql
SELECT
  UPPER(Site) AS site,
  Period AS period_label,
  ROUND(AVG(Total_Unplanned_Downtime_Pct), 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE 1 = 1
  AND (:year IS NULL OR Year = :year)
GROUP BY Site, Period
ORDER BY Site, Period
