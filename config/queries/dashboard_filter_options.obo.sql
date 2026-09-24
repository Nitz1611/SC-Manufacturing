-- dashboard_filter_options.obo.sql
SELECT DISTINCT
  UPPER({{site_col}}) AS site,
  TRIM({{region_col}}) AS region,
  CAST(YEAR({{date_col}}) AS INT) AS year
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{year_filter}}
  AND {{region_filter}}
     AND {{line_filter}}
     AND {{department_filter}}
     AND {{shift_filter}}
ORDER BY site
