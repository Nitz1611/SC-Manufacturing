-- dashboard_filter_options.obo.sql
SELECT DISTINCT UPPER(Site) AS site FROM {{catalog}}.pgt_plnt_prodtn_metric_view ORDER BY site
