-- dashboard_filter_options.obo.sql
SELECT DISTINCT
  UPPER({{site_col}}) AS site,
  TRIM({{region_col}}) AS region,
  CAST(YEAR({{date_col}}) AS INT) AS year
FROM {{catalog}}.pgt_plnt_prodtn_metric_view
WHERE {{dt_type_filter}}
  AND {{year_filter}}
  AND {{region_filter}}
ORDER BY site
