-- dashboard_dt_line_by_period.obo.sql
SELECT
  UPPER(Line) AS line,
  {{period_expr}} AS period_label,
  ROUND(AVG(Total_Unplanned_Downtime_Pct), 2) AS dt_pct
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE 1 = 1
  AND {{year_filter}}
  AND (:site IS NULL OR UPPER(Site) = UPPER(:site))
GROUP BY Line, {{period_expr}}
ORDER BY line, period_label
