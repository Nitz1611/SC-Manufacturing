-- maintenance_unplanned_card.obo.sql
-- Primary Maintenance KPI: current timeframe, YTD target, prev period, last completed shift (yesterday max shift).
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
  ) AS current_dt_pct,
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
  (SELECT ROUND({{total_dt_pct_m}} * 100, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
  ) AS total_downtime_pct,
  (SELECT ROUND({{dt_pct_m}} * 100, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{ytd_flag_filter}}
  ) AS ytd_target_dt_pct,
  (SELECT ROUND({{dt_pct_m}} * 100, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{prev_period_flag_filter}}
  ) AS prev_period_dt_pct,
  (SELECT ROUND({{dt_pct_m}} * 100, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_pct_filter}}
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
       WHERE {{dt_pct_filter}}
         AND {{year_filter}}
         AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
         AND {{region_filter}}
         AND {{line_filter}}
         AND {{department_filter}}
         AND {{shift_filter}}
         AND {{yesterday_slice_filter}}
     )
  ) AS last_shift_dt_pct,
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
  (SELECT ROUND({{scheduled_hours_m}}, 1)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_pct_filter}}
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
       WHERE {{dt_pct_filter}}
         AND {{year_filter}}
         AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
         AND {{region_filter}}
         AND {{line_filter}}
         AND {{department_filter}}
         AND {{shift_filter}}
         AND {{yesterday_slice_filter}}
     )
  ) AS last_shift_sched_hours,
  (SELECT MAX(CAST(Shift AS INT))
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{yesterday_slice_filter}}
  ) AS last_shift_num
