-- maintenance_mtbf_card.obo.sql
-- MTBF KPI: MEASURE(MTBF (Hours)), YTD target slice, MEASURE(STOPS), MEASURE(MTTR (Hours)).
SELECT
  (SELECT ROUND({{mtbf_m}}, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{mtbf_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
  ) AS current_mtbf_hrs,
  (SELECT ROUND({{mtbf_m}}, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{mtbf_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{ytd_flag_filter}}
  ) AS ytd_target_mtbf_hrs,
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
  ) AS current_sched_hours,
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
  ) AS current_stops,
  (SELECT ROUND({{mttr_m}}, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{mttr_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
  ) AS current_mttr_hrs,
  (SELECT ROUND({{dt_hours_m}}, 1)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_hours_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
  ) AS current_unplanned_hrs,
  (SELECT ROUND({{mtbf_m}}, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{mtbf_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{prev_period_flag_filter}}
  ) AS prev_period_mtbf_hrs,
  (SELECT ROUND({{mtbf_m}}, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view v
   WHERE {{mtbf_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND CAST(v.{{period_sort}} AS INT) = (
       SELECT MAX(CAST({{period_sort}} AS INT))
       FROM {{catalog}}.pgt_plnt_prodtn_metric_view
       WHERE {{mtbf_filter}}
         AND {{year_filter}}
         AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
         AND {{region_filter}}
         AND {{line_filter}}
         AND {{department_filter}}
         AND {{shift_filter}}
     )
     AND CAST(v.{{week_sort}} AS INT) = (
       SELECT MAX(CAST({{week_sort}} AS INT))
       FROM {{catalog}}.pgt_plnt_prodtn_metric_view w
       WHERE {{mtbf_filter}}
         AND {{year_filter}}
         AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
         AND {{region_filter}}
         AND {{line_filter}}
         AND {{department_filter}}
         AND {{shift_filter}}
         AND CAST(w.{{period_sort}} AS INT) = (
           SELECT MAX(CAST({{period_sort}} AS INT))
           FROM {{catalog}}.pgt_plnt_prodtn_metric_view
           WHERE {{mtbf_filter}}
             AND {{year_filter}}
             AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
             AND {{region_filter}}
             AND {{line_filter}}
             AND {{department_filter}}
             AND {{shift_filter}}
         )
     )
  ) AS latest_week_mtbf_hrs,
  (SELECT ROUND({{mtbf_m}}, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{mtbf_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{yesterday_slice_filter}}
     AND CAST(Shift AS INT) = (
       SELECT MAX(CAST(Shift AS INT))
       FROM {{catalog}}.pgt_plnt_prodtn_metric_view
       WHERE {{mtbf_filter}}
         AND {{year_filter}}
         AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
         AND {{region_filter}}
         AND {{line_filter}}
         AND {{department_filter}}
         AND {{shift_filter}}
         AND {{yesterday_slice_filter}}
     )
  ) AS last_shift_mtbf_hrs,
  (SELECT ROUND({{dt_hours_m}}, 1)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_hours_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{yesterday_slice_filter}}
     AND CAST(Shift AS INT) = (
       SELECT MAX(CAST(Shift AS INT))
       FROM {{catalog}}.pgt_plnt_prodtn_metric_view
       WHERE {{dt_hours_filter}}
         AND {{year_filter}}
         AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
         AND {{region_filter}}
         AND {{line_filter}}
         AND {{department_filter}}
         AND {{shift_filter}}
         AND {{yesterday_slice_filter}}
     )
  ) AS last_shift_unplanned_hrs,
  (SELECT {{stops_m}}
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_stops_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{yesterday_slice_filter}}
     AND CAST(Shift AS INT) = (
       SELECT MAX(CAST(Shift AS INT))
       FROM {{catalog}}.pgt_plnt_prodtn_metric_view
       WHERE {{dt_stops_filter}}
         AND {{year_filter}}
         AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
         AND {{region_filter}}
         AND {{line_filter}}
         AND {{department_filter}}
         AND {{shift_filter}}
         AND {{yesterday_slice_filter}}
     )
  ) AS last_shift_stops,
  (SELECT MAX(CAST(Shift AS INT))
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{mtbf_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{yesterday_slice_filter}}
  ) AS last_shift_num
