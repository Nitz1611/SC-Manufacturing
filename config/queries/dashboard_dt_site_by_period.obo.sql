-- dashboard_dt_site_by_period.obo.sql
SELECT
  UPPER(Site) AS site,
  {{period_expr}} AS period_label,
  ROUND(AVG(Total_Unplanned_Downtime_Pct), 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE 1 = 1
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY Site, {{period_expr}}
ORDER BY site, period_label
