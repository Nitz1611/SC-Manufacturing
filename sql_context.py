"""
SQL context for Claude Opus prompts — replaces Genie queries from Supervisor Agent.
Uses the same metric views referenced in supervisor.py QUESTIONS.
"""
import os
import json
from dotenv import load_dotenv
import databricks_client as db

load_dotenv()

PRODTN = os.getenv("PRODTN_VIEW", "pgt_plnt_prodtn_metric_view")
WASTE = os.getenv("WASTE_VIEW", "pgt_waste_pct_composite_metric_view")
EVENT = os.getenv("EVENT_VIEW", "pgt_plnt_prodtn_evnt_metric_view")
EFF = os.getenv("EFFICIENCY_VIEW", "pgt_plnt_effcncy_metric_view")


def _safe_sql(sql: str) -> list[dict]:
    if not db.sql_configured():
        return []
    try:
        return db.execute_sql(sql)
    except Exception as e:
        print(f"[sql_context] query failed: {e}")
        return []


def fetch_question_context(q_key: str, ctx: str) -> str:
    """Return JSON text block injected into Claude prompts."""
    queries = {
        "waste_kpi": f"""
            SELECT * FROM {WASTE}
            ORDER BY STRT_DT DESC NULLS LAST
            LIMIT 8
        """,
        "downtime_kpi": f"""
            SELECT
              AVG(Total_Unplanned_Downtime_Pct) AS dt_pct,
              SUM(Total_Unplanned_Downtime_Hours) AS dt_hours,
              SUM(STOPS) AS stops
            FROM {PRODTN}
        """,
        "downtime_reasons": f"""
            SELECT RSN, RSN3, RSN4, Line, Department,
                   SUM(Total_Unplanned_Downtime_Hours) AS hours,
                   AVG(Total_Unplanned_Downtime_Pct) AS pct
            FROM {PRODTN}
            GROUP BY RSN, RSN3, RSN4, Line, Department
            ORDER BY hours DESC NULLS LAST
            LIMIT 12
        """,
        "waste_breakdown": f"""
            SELECT WST_TYP, SECRY_AREA, DEPT_CD, SHIFT_KEY, SHAPE_CD,
                   SUM(WST_LBS) AS wst_lbs, SUM(WST_CST) AS wst_cst
            FROM {EVENT}
            GROUP BY WST_TYP, SECRY_AREA, DEPT_CD, SHIFT_KEY, SHAPE_CD
            ORDER BY wst_lbs DESC NULLS LAST
            LIMIT 12
        """,
        "shift_analysis": f"""
            SELECT SHIFT_KEY,
                   AVG(Total_Unplanned_Downtime_Hours) AS avg_hours,
                   AVG(Total_Unplanned_Downtime_Pct) AS avg_pct,
                   MAX(STRT_DT) AS latest_dt
            FROM {PRODTN}
            GROUP BY SHIFT_KEY
            ORDER BY SHIFT_KEY
        """,
        "waste_trend": f"""
            SELECT STRT_DT, Waste_Pct
            FROM {WASTE}
            ORDER BY STRT_DT DESC NULLS LAST
            LIMIT 8
        """,
        "downtime_trend": f"""
            SELECT STRT_DT,
                   SUM(Total_Unplanned_Downtime_Hours) AS hours
            FROM {PRODTN}
            GROUP BY STRT_DT
            ORDER BY STRT_DT DESC NULLS LAST
            LIMIT 8
        """,
        "opportunities": f"""
            SELECT RSN, Line, SHIFT_KEY,
                   SUM(Total_Unplanned_Downtime_Hours) AS dt_hours
            FROM {PRODTN}
            GROUP BY RSN, Line, SHIFT_KEY
            ORDER BY dt_hours DESC NULLS LAST
            LIMIT 8
        """,
        "rca_detection": f"""
            SELECT 'downtime' AS metric, AVG(Total_Unplanned_Downtime_Pct) AS val FROM {PRODTN}
            UNION ALL
            SELECT 'waste', AVG(Waste_Pct) FROM {WASTE}
            UNION ALL
            SELECT 'oee', AVG(OEE) FROM {EFF}
        """,
        "rca_root_causes": f"""
            SELECT RSN, RSN3, Line, SHIFT_KEY,
                   SUM(Total_Unplanned_Downtime_Hours) AS hours
            FROM {PRODTN}
            GROUP BY RSN, RSN3, Line, SHIFT_KEY
            ORDER BY hours DESC NULLS LAST
            LIMIT 10
        """,
        "rca_actions": f"""
            SELECT WST_TYP, RSN, Line, SHIFT_KEY,
                   SUM(Total_Unplanned_Downtime_Hours) AS dt_hours,
                   SUM(WST_LBS) AS wst_lbs
            FROM {PRODTN}
            GROUP BY WST_TYP, RSN, Line, SHIFT_KEY
            ORDER BY dt_hours DESC NULLS LAST
            LIMIT 10
        """,
        "rca_detail": f"""
            SELECT RSN, RSN3, Comment_Text, Line, STRT_DT,
                   Total_Unplanned_Downtime_Hours AS hours
            FROM {PRODTN}
            ORDER BY hours DESC NULLS LAST
            LIMIT 10
        """,
        "ask": f"""
            SELECT RSN, Line, SHIFT_KEY,
                   Total_Unplanned_Downtime_Hours, Total_Unplanned_Downtime_Pct
            FROM {PRODTN}
            ORDER BY Total_Unplanned_Downtime_Hours DESC NULLS LAST
            LIMIT 15
        """,
    }

    sql = queries.get(q_key, queries["ask"])
    rows = _safe_sql(sql)
    if not rows:
        return f"(No SQL rows returned for {q_key}. Filters: {ctx}. Configure PRODTN_VIEW/WASTE_VIEW etc. in .env)"
    return db.rows_to_json(rows)


def fetch_dashboard_snapshot(ctx: str) -> str:
    parts = {}
    for key in ("waste_kpi", "downtime_kpi", "downtime_reasons", "waste_breakdown", "shift_analysis"):
        blob = fetch_question_context(key, ctx)
        try:
            parts[key] = json.loads(blob) if blob.strip().startswith("[") else blob
        except Exception:
            parts[key] = blob
    return json.dumps(parts, default=str, indent=2)
