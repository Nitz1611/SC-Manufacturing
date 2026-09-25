-- maintenance_total_dt_card.obo.sql
-- Total Downtime % KPI: MEASURE(% Downtime), YTD target slice, downtime hours, last shift.
SELECT
  (SELECT ROUND({{total_dt_pct_m}} * 100, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{total_dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
  ) AS current_total_dt_pct,
  (SELECT ROUND({{total_dt_pct_m}} * 100, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{total_dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{ytd_flag_filter}}
  ) AS ytd_target_total_dt_pct,
  (SELECT ROUND({{scheduled_hours_m}}, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{total_dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
  ) AS current_sched_hours,
  (SELECT ROUND({{total_dt_hours_m}}, 1)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{total_dt_hours_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{timeframe_filter}}
  ) AS current_total_dt_hrs,
  (SELECT ROUND({{total_dt_pct_m}} * 100, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{total_dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{prev_period_flag_filter}}
  ) AS prev_period_total_dt_pct,
  (SELECT ROUND({{total_dt_pct_m}} * 100, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view v
   WHERE {{total_dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND CAST(v.{{period_sort}} AS INT) = (
       SELECT MAX(CAST({{period_sort}} AS INT))
       FROM {{catalog}}.pgt_plnt_prodtn_metric_view
       WHERE {{total_dt_pct_filter}}
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
       WHERE {{total_dt_pct_filter}}
         AND {{year_filter}}
         AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
         AND {{region_filter}}
         AND {{line_filter}}
         AND {{department_filter}}
         AND {{shift_filter}}
         AND CAST(w.{{period_sort}} AS INT) = (
           SELECT MAX(CAST({{period_sort}} AS INT))
           FROM {{catalog}}.pgt_plnt_prodtn_metric_view
           WHERE {{total_dt_pct_filter}}
             AND {{year_filter}}
             AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
             AND {{region_filter}}
             AND {{line_filter}}
             AND {{department_filter}}
             AND {{shift_filter}}
         )
     )
  ) AS latest_week_total_dt_pct,
  (SELECT ROUND({{total_dt_pct_m}} * 100, 2)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{total_dt_pct_filter}}
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
       WHERE {{total_dt_pct_filter}}
         AND {{year_filter}}
         AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
         AND {{region_filter}}
         AND {{line_filter}}
         AND {{department_filter}}
         AND {{shift_filter}}
         AND {{yesterday_slice_filter}}
     )
  ) AS last_shift_total_dt_pct,
  (SELECT ROUND({{total_dt_hours_m}}, 1)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{total_dt_hours_filter}}
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
       WHERE {{total_dt_hours_filter}}
         AND {{year_filter}}
         AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
         AND {{region_filter}}
         AND {{line_filter}}
         AND {{department_filter}}
         AND {{shift_filter}}
         AND {{yesterday_slice_filter}}
     )
  ) AS last_shift_total_dt_hrs,
  (SELECT ROUND({{scheduled_hours_m}}, 1)
   FROM {{catalog}}.pgt_plnt_prodtn_metric_view
   WHERE {{total_dt_pct_filter}}
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
       WHERE {{total_dt_pct_filter}}
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
   WHERE {{total_dt_pct_filter}}
     AND {{year_filter}}
     AND (:site IS NULL OR UPPER({{site_col}}) = UPPER(:site))
     AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
     AND {{yesterday_slice_filter}}
  ) AS last_shift_num
