-- dashboard_dt_top_lines.obo.sql
SELECT
  UPPER(Line) AS line,
  ROUND(AVG(Total_Unplanned_Downtime_Pct), 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE 1 = 1
  AND (:year IS NULL OR Year = :year)
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY Line
ORDER BY dt_pct DESC
LIMIT 15
