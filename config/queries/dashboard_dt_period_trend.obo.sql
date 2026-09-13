-- dashboard_dt_period_trend.obo.sql
-- Network unplanned DT % by fiscal period
SELECT
  {{period_expr}} AS period_label,
  ROUND(AVG(Total_Unplanned_Downtime_Pct), 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE 1 = 1
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY {{period_expr}}
ORDER BY period_label
