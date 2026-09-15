-- dashboard_dt_kpis.obo.sql
-- Pct MEASURE must not filter Downtime Type rows (breaks UC rollup). Hours/stops keep dt_type filter.
SELECT
  (SELECT ROUND({{dt_pct_m}} * 100, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
  ) AS downtime_pct,
  (SELECT ROUND({{dt_hours_m}}, 0)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_type_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
  ) AS downtime_hrs,
  (SELECT {{stops_m}}
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_type_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
  ) AS stops
