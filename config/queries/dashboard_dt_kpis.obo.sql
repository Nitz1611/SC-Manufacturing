-- dashboard_dt_kpis.obo.sql
-- All MEASURE() KPIs use no Downtime Type row filter (UC rollup requires full metric view context).
SELECT
  (SELECT ROUND({{dt_pct_m}} * 100, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
  ) AS downtime_pct,
  (SELECT ROUND({{dt_hours_m}}, 0)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_hours_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
  ) AS downtime_hrs,
  (SELECT {{stops_m}}
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_stops_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
  ) AS stops,
  (SELECT ROUND({{scheduled_hours_m}}, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
  ) AS scheduled_hours,
  (SELECT ROUND({{total_dt_pct_m}}, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
  ) AS total_downtime_pct
