-- dashboard_dt_dow.obo.sql
SELECT
  DATE_FORMAT({{date_col}}, 'EEEE') AS day_name,
  {{week_expr}} AS week_label,
  ROUND(AVG(Total_Unplanned_Downtime_Pct), 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE 1 = 1
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY DATE_FORMAT({{date_col}}, 'EEEE'), {{week_expr}}
ORDER BY week_label, day_name
