-- dashboard_dt_kpis.obo.sql
-- Unplanned DT KPI strip: downtime %, hours, stops (OEE when available)
SELECT
  ROUND(AVG(Total_Unplanned_Downtime_Pct), 2) AS downtime_pct,
  ROUND(SUM(Total_Unplanned_Downtime_Hours), 0) AS downtime_hrs,
  SUM(STOPS) AS stops
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE 1 = 1
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
