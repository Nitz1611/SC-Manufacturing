-- dashboard_filter_dimensions.obo.sql
SELECT DISTINCT
  TRIM(CAST({{department_col}} AS STRING)) AS department,
  TRIM(CAST({{line_col}} AS STRING)) AS line,
  TRIM(CAST({{shift_expr}} AS STRING)) AS shift
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{year_filter}}
  AND {{region_filter}}
  AND {{line_filter}}
  AND {{department_filter}}
  AND {{shift_filter}}
  AND {{timeframe_filter}}
  AND TRIM(CAST({{department_col}} AS STRING)) <> ''
  AND TRIM(CAST({{line_col}} AS STRING)) <> ''
