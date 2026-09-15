"""
claude_supervisor.py — Hybrid approach:
  views.py  → fetches all real data using working SQL (exact column names)
  Claude    → reads the data and generates WHY/WHEN/HOW insights

No more Claude guessing column names. views.py already has tested, working SQL.
Claude only sees the results and writes decision-making narrative.
"""
import os, json, re, time, concurrent.futures
import requests
from dotenv import load_dotenv
load_dotenv()

HOSTNAME       = os.getenv("DATABRICKS_SERVER_HOSTNAME","").replace("https://","").rstrip("/")
PAT            = os.getenv("DATABRICKS_PAT_TOKEN","")
CLAUDE_MODEL   = os.getenv("CLAUDE_ENDPOINT_NAME",  "databricks-claude-sonnet-4-5")
CLAUDE_INSIGHT = os.getenv("CLAUDE_INSIGHT_MODEL",   CLAUDE_MODEL)
MAX_WORKERS    = int(os.getenv("SUPERVISOR_MAX_WORKERS","6"))
print(f"[claude] Model        : {CLAUDE_MODEL}")
print(f"[claude] Insight model: {CLAUDE_INSIGHT}")

from views import get_kpis, get_trends, get_sites, get_line_breakdown, get_all_view_data, get_comments, _run_sql, _qualified

# ── Claude API call ───────────────────────────────────────────────
def _call_claude(prompt: str, system: str, model: str = None) -> str:
    endpoint = model or CLAUDE_MODEL
    url = f"https://{HOSTNAME}/serving-endpoints/{endpoint}/invocations"
    resp = requests.post(url,
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
        json={"messages":[{"role":"system","content":system},{"role":"user","content":prompt}],"max_tokens":1024},
        timeout=60)
    if not resp.ok:
        print(f"[claude] HTTP {resp.status_code}: {resp.text[:200]}")
        resp.raise_for_status()
    data = resp.json()
    return (data.get("choices") or [{}])[0].get("message",{}).get("content","") or ""

def _parse_json(text: str) -> dict:
    clean = re.sub(r'```json|```','', text).strip()
    start = clean.find("{"); end = clean.rfind("}")
    if start == -1 or end == -1: return {}
    try: return json.loads(clean[start:end+1])
    except: return {}

SYSTEM = """You are a manufacturing analytics AI. You receive REAL data already fetched from Databricks.
Your ONLY job is to analyse the data and return JSON with WHY/WHEN/HOW TO FIX insights.
Rules:
- Never make up numbers — use only numbers from the data provided
- Every insight must answer: WHY (root cause), WHEN (pattern/trend), HOW TO FIX (specific action + expected recovery)
- Return ONLY valid JSON — no preamble, no markdown fences, no explanation outside JSON
- Use empty string for unavailable fields, never null"""

# ── Insight generators (Claude reads real data, writes narrative) ──
def _gen_dt_kpi_insight(kpis, stats):
    curr_dt   = kpis.get("downtime_pct",{}).get("value","—")
    delta     = kpis.get("downtime_pct",{}).get("delta","—")
    stops     = kpis.get("stops",{}).get("value","—")
    sched     = stats.get("scheduled_hours","—")
    unplanned = stats.get("unplanned_hours","—")
    prompt = f"""Data: DT={curr_dt} (target 5%), change={delta}, stops={stops}, scheduled={sched}h, unplanned={unplanned}h
Return JSON: {{"downtime_pct":{{"value":"{curr_dt}","delta":"{delta}","direction":"bad"}},"stops":{{"value":"{stops}","delta":"","direction":"warn"}},"scheduled_hrs":"{sched}","unplanned_dt_hrs":"{unplanned}","insight":"WHY: [analyse numbers above]. WHEN: [trend from delta]. HOW TO FIX: [specific action + expected recovery pp/hours]."}}"""
    raw = _call_claude(prompt, SYSTEM)
    result = _parse_json(raw)
    return result or {"downtime_pct":kpis.get("downtime_pct",{}),"stops":kpis.get("stops",{}),"scheduled_hrs":sched,"unplanned_dt_hrs":unplanned,"insight":f"WHY: DT at {curr_dt} ({delta}). HOW TO FIX: Review top downtime reasons and assign maintenance."}

def _gen_dt_reasons_insight(line_data):
    bullets  = line_data.get("downtime_bullets",[])
    lines    = line_data.get("line_contributions",[])
    shifts   = line_data.get("shift_comparison",[])
    b_str = "\n".join(f"- {b['text']}" for b in bullets)
    l_str = "\n".join(f"- {l['line']}: {l['pct']}%" for l in lines)
    s_str = "\n".join(f"- {s['shift']}: {s['hours']}h" for s in shifts)
    prompt = f"""DT reasons:\n{b_str}\nLines:\n{l_str}\nShifts:\n{s_str}
Return JSON: {{"downtime_bullets":{json.dumps(bullets)},"line_contributions":{json.dumps(lines)},"insight":"WHY: [top RSN and hours]. WHEN: [shift pattern]. HOW TO FIX: [target top RSN on top line, saves Xh]."}}"""
    raw = _call_claude(prompt, SYSTEM)
    result = _parse_json(raw)
    return result or {"downtime_bullets":bullets,"line_contributions":lines,"insight":bullets[0]["text"] if bullets else "No DT reason data."}

def _gen_dt_comments_insight(filters):
    rows = get_comments(filters)
    if not rows:
        return {"observations":[],"insight":"No operator comments available."}
    sample = "\n".join(f"[{r.get('Shift','')}] {r.get('Comment Text','')}" for r in rows[:100])
    prompt = f"""Operator comments:\n{sample}\nFind top 2 recurring themes. Count occurrences.
Return JSON: {{"observations":["[DIAGNOSTIC] '[theme]' X times — example: '[verbatim 5 words]'","[PREDICTIVE] [shift] pattern suggests [issue]","[PRESCRIPTIVE] [action] before [shift]"],"insight":"WHY: '[theme]' X times = [equipment issue]. WHEN: X% from [Shift]. HOW TO FIX: [action] — reduces incidents by ~X%."}}"""
    raw = _call_claude(prompt, SYSTEM, model=CLAUDE_INSIGHT)
    result = _parse_json(raw)
    return result or {"observations":[f"[DIAGNOSTIC] {rows[0].get('Comment Text','')}"],"insight":"Review operator comments for recurring issues."}

def _gen_waste_kpi_insight(kpis):
    curr = kpis.get("waste_pct",{}).get("value","—")
    delta = kpis.get("waste_pct",{}).get("delta","—")
    prompt = f"""Data: Waste={curr} (target 5%), change={delta}
Return JSON: {{"waste_pct":{{"value":"{curr}","delta":"{delta}","direction":"bad"}},"insight":"WHY: Waste {curr} ({delta}). WHEN: [rising/falling]. HOW TO FIX: [specific action + pp recovery]."}}"""
    raw = _call_claude(prompt, SYSTEM)
    result = _parse_json(raw)
    return result or {"waste_pct":kpis.get("waste_pct",{}),"insight":f"WHY: Waste at {curr} ({delta}). HOW TO FIX: Review top waste types."}

def _gen_waste_breakdown_insight(line_data):
    bullets = line_data.get("waste_bullets",[])
    b_str = "\n".join(f"- {b['text']}" for b in bullets)
    prompt = f"""Waste breakdown:\n{b_str}
Return JSON: {{"waste_bullets":{json.dumps(bullets)},"insight":"WHY: [top type] is primary driver. WHEN: [shift pattern]. HOW TO FIX: Target [top type] — X% reduction recovers X.Xpp.","cost_insight":"","shift_waste":""}}"""
    raw = _call_claude(prompt, SYSTEM)
    result = _parse_json(raw)
    return result or {"waste_bullets":bullets,"insight":bullets[0]["text"] if bullets else "No waste data.","cost_insight":"","shift_waste":""}

def _gen_trends_insight(trends):
    dt  = trends.get("downtime_trend",{})
    wst = trends.get("waste_trend",{})
    dt_str  = ", ".join(f"{l}:{v}h" for l,v in zip(dt.get("labels",[]),dt.get("data",[])))
    wst_str = ", ".join(f"{l}:{v}%" for l,v in zip(wst.get("labels",[]),wst.get("data",[])))
    prompt = f"""Trends: DT({dt_str}), Waste({wst_str})
Return JSON: {{"downtime_trend":{json.dumps(dt)},"waste_trend":{json.dumps(wst)},"dt_insight":"WHY: DT [rising/falling] from [first] to [last]h. WHEN: W6 projected [X]h. HOW TO FIX: [if rising escalate; if falling sustain].","waste_insight":"WHY: Waste [rising/falling]. WHEN: W7 projected [X]%. HOW TO FIX: [action]."}}"""
    raw = _call_claude(prompt, SYSTEM)
    result = _parse_json(raw)
    return result or {"downtime_trend":dt,"waste_trend":wst,"dt_insight":dt.get("anomaly_label",""),"waste_insight":wst.get("anomaly_label","")}

def _gen_shift_insight(line_data):
    shifts = line_data.get("shift_comparison",[])
    s_str = "\n".join(f"- {s['shift']}: {s['hours']}h avg DT" for s in shifts)
    prompt = f"""Shift DT averages:\n{s_str}
Return JSON: {{"shift_comparison":{json.dumps(shifts)},"last_shift":{{"name":"","dt_pct":"","target":"5%","won":false}},"insight":"WHY: [Worst] Xh vs [Best] Xh — Xpp gap = [cause]. WHEN: pattern persisted. HOW TO FIX: [operator rotation/pre-shift check] saves Xh/week."}}"""
    raw = _call_claude(prompt, SYSTEM)
    result = _parse_json(raw)
    return result or {"shift_comparison":shifts,"last_shift":{},"insight":"Review shift-level DT patterns."}

def _gen_alerts(sites, kpis):
    dt_sites = sites.get("sites_at_risk",[])
    wst_sites= sites.get("waste_sites",[])
    nat_dt   = sites.get("national_avg_dt","—")
    nat_wst  = sites.get("national_avg_waste","—")
    dt_str   = "\n".join(f"- {s['site']}: {s['dt_pct']} (gap {s['above_avg']})" for s in dt_sites[:5])
    wst_str  = "\n".join(f"- {s['site']}: {s['waste_pct']} (gap {s['above_avg']})" for s in wst_sites[:5])
    if not dt_str and not wst_str:
        return {"alerts":[],"waste_alerts":[]}
    prompt = f"""Sites above national avg:\nDT (nat={nat_dt}):\n{dt_str or 'None'}\nWaste (nat={nat_wst}):\n{wst_str or 'None'}
Return JSON: {{"alerts":[{{"kpi":"Total Unplanned Downtime %","site":"[site]","current_value":"[val]","national_avg":"{nat_dt}","gap":"[gap]","severity":"Critical|High|Medium","ai_insight":"WHY: [site] DT [X]% because [reason]. WHEN: above avg. HOW TO FIX: [action] recovers [X]pp.","contributors":[]}}],"waste_alerts":[{{"kpi":"Waste % (Yield Loss)","site":"[site]","current_value":"[val]","national_avg":"{nat_wst}","gap":"[gap]","severity":"Critical|High|Medium","ai_insight":"WHY: waste [X]% above avg. HOW TO FIX: [action].","contributors":[]}}]}}"""
    raw = _call_claude(prompt, SYSTEM, model=CLAUDE_INSIGHT)
    result = _parse_json(raw)
    if not result:
        def _sev(g):
            try: v=float(g.replace("+","").replace("pp","")); return "Critical" if v>5 else "High" if v>2 else "Medium"
            except: return "Medium"
        result = {
            "alerts":[{"kpi":"Total Unplanned Downtime %","site":s["site"],"current_value":s["dt_pct"],"national_avg":nat_dt,"gap":s["above_avg"],"severity":_sev(s["above_avg"]),"ai_insight":f"WHY: {s['site']} DT {s['dt_pct']} vs national {nat_dt}. HOW TO FIX: Investigate top DT reasons at this site.","contributors":[]} for s in dt_sites[:3]],
            "waste_alerts":[{"kpi":"Waste % (Yield Loss)","site":s["site"],"current_value":s["waste_pct"],"national_avg":nat_wst,"gap":s["above_avg"],"severity":_sev(s["above_avg"]),"ai_insight":f"WHY: {s['site']} waste {s['waste_pct']} vs national {nat_wst}. HOW TO FIX: Review top waste types at this site.","contributors":[]} for s in wst_sites[:3]],
        }
    return result

def _gen_opportunities(sites, line_data):
    dt_sites = sites.get("sites_at_risk",[])
    bullets  = line_data.get("downtime_bullets",[])
    nat_dt   = sites.get("national_avg_dt","—")
    s_str = "\n".join(f"- {s['site']}: {s['dt_pct']} ({s['above_avg']} above {nat_dt})" for s in dt_sites[:3])
    b_str = "\n".join(f"- {b['text']}" for b in bullets[:3])
    prompt = f"""Sites above avg:\n{s_str or 'None'}\nTop DT reasons:\n{b_str or 'None'}
Return JSON: {{"opportunities":[{{"title":"[site/RSN specific action]","delta":"saves Xh/week","color":"warn"}},{{"title":"[2nd action]","delta":"saves Xh/week","color":"warn"}},{{"title":"[3rd action]","delta":"saves Xh/week","color":"good"}}],"insight":"WHY top sites underperform: [analysis]. HOW TO FIX: [top action] by today — recovers Xh/$X."}}"""
    raw = _call_claude(prompt, SYSTEM, model=CLAUDE_INSIGHT)
    result = _parse_json(raw)
    return result or {"opportunities":[{"title":f"Reduce DT at {s['site']} ({s['above_avg']} above avg)","delta":"saves ~5h/week","color":"warn"} for s in dt_sites[:3]],"insight":f"Top {len(dt_sites)} sites above national avg {nat_dt}."}

# ── Sanitise ──────────────────────────────────────────────────────
def _ss(v,n): return str(v)[:n] if v else ""
def _sanitise(d):
    vd={"bad","good","warn"}
    def kpi(k):
        if not isinstance(k,dict): return {"value":"","delta":"","direction":"warn"}
        return {"value":_ss(k.get("value",""),20),"delta":_ss(k.get("delta",""),60),"direction":k.get("direction","warn") if k.get("direction") in vd else "warn"}
    def bul(b):
        t=_ss(b.get("text",""),200); return {"text":t,"pct":min(max(float(b.get("pct",0) or 0),0),100)} if t else None
    def alrt(a):
        if not isinstance(a,dict): return None
        site=_ss(a.get("site") or a.get("Site") or "",60)
        if not site or site in {"[site]","[site name]","null","None"}: return None
        sv=a.get("severity","Medium")
        return {"kpi":_ss(a.get("kpi",""),60),"site":site,"current_value":_ss(a.get("current_value",""),25),"national_avg":_ss(a.get("national_avg",""),25),"gap":_ss(a.get("gap",""),40),"severity":sv if sv in {"Critical","High","Medium","Low"} else "Medium","ai_insight":_ss(a.get("ai_insight",""),800),"contributors":(a.get("contributors") or [])[:5]}
    def ins(i):
        t=_ss(i.get("text") or i.get("insight",""),600); return {"text":t,"color":i.get("color","blue"),"kpi_area":i.get("kpi_area","general")} if t else None
    def trd(t,n):
        if not isinstance(t,dict): return {"labels":[],"data":[],"anomaly_week":"","anomaly_label":"","severity":"warn"}
        return {"labels":(t.get("labels") or [])[:n],"data":(t.get("data") or [])[:n],"anomaly_week":_ss(t.get("anomaly_week",""),60),"anomaly_label":_ss(t.get("anomaly_label",""),120),"severity":t.get("severity","warn")}
    def lin(l):
        n=_ss(l.get("line") or l.get("name",""),40); return {"line":n,"pct":min(max(float(l.get("pct",0) or 0),0),100),"color":l.get("color","gray")} if n else None
    def shf(s): return {"shift":_ss(s.get("shift",""),20),"hours":float(s.get("hours",0) or 0),"color":_ss(s.get("color","#3B6FD4"),10)}
    def opp(o):
        t=_ss(o.get("title") or o.get("action",""),80); return {"title":t,"delta":_ss(o.get("delta",""),40),"color":o.get("color","warn") if o.get("color") in {"good","warn"} else "warn"} if t else None
    rk=d.get("kpis") or {}
    return {
        "kpis":              {k:kpi(rk.get(k,{})) for k in ["waste_pct","downtime_pct","downtime_hrs","oee","stops"]},
        "key_insights":      [x for x in map(ins,(d.get("key_insights") or [])[:8]) if x],
        "alerts":            [x for x in map(alrt,(d.get("alerts") or [])[:10]) if x],
        "waste_bullets":     [x for x in map(bul,(d.get("waste_bullets") or [])[:3]) if x],
        "downtime_bullets":  [x for x in map(bul,(d.get("downtime_bullets") or [])[:3]) if x],
        "line_contributions":[x for x in map(lin,(d.get("line_contributions") or [])[:5]) if x],
        "shift_comparison":  [shf(s) for s in (d.get("shift_comparison") or [])[:3]],
        "waste_trend":       trd(d.get("waste_trend"),6),
        "downtime_trend":    trd(d.get("downtime_trend"),5),
        "observations":      [_ss(o,300) for o in (d.get("observations") or [])[:3] if isinstance(o,str) and o.strip()],
        "opportunities":     [x for x in map(opp,(d.get("opportunities") or [])[:3]) if x],
        "dt_stats":          {"scheduled_hrs":_ss(d.get("scheduled_hrs",""),20),"unplanned_dt_hrs":_ss(d.get("unplanned_dt_hrs",""),20),"total_dt_pct":"","mttr_hrs":"","mtbf_hrs":""},
        "_extra":            {"cost_insight":_ss(d.get("cost_insight",""),100),"shift_waste":_ss(d.get("shift_waste",""),100),"last_shift":d.get("last_shift",{})},
        "_extra_data":       d.get("_extra_data", {}),
    }

# ── Public API ────────────────────────────────────────────────────
def get_dashboard(filters: dict) -> dict:
    print(f"[claude] Step 1: Fetching data from views...")
    t0 = time.time()
    view_data = get_all_view_data(filters)
    kpis  = view_data.get("kpis",{})
    stats = view_data.get("_extra",{})
    trends = {"downtime_trend":view_data.get("downtime_trend",{}),"waste_trend":view_data.get("waste_trend",{})}
    sites  = {"sites_at_risk":view_data.get("sites_at_risk",[]),"waste_sites":view_data.get("waste_sites",[]),"national_avg_dt":view_data.get("national_avg_dt","—"),"national_avg_waste":view_data.get("national_avg_waste","—")}
    line_data = {"line_contributions":view_data.get("line_contributions",[]),"shift_comparison":view_data.get("shift_comparison",[]),"downtime_bullets":view_data.get("downtime_bullets",[]),"waste_bullets":view_data.get("waste_bullets",[])}
    print(f"[claude] Data fetched in {time.time()-t0:.1f}s. Step 2: Generating insights...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {
            "dt_kpi":    ex.submit(_gen_dt_kpi_insight,       kpis, stats),
            "dt_rsn":    ex.submit(_gen_dt_reasons_insight,   line_data),
            "dt_cmt":    ex.submit(_gen_dt_comments_insight,  filters),
            "waste_kpi": ex.submit(_gen_waste_kpi_insight,    kpis),
            "waste_bkd": ex.submit(_gen_waste_breakdown_insight, line_data),
            "trends":    ex.submit(_gen_trends_insight,       trends),
            "shift":     ex.submit(_gen_shift_insight,        line_data),
            "alerts":    ex.submit(_gen_alerts,               sites, kpis),
            "opps":      ex.submit(_gen_opportunities,        sites, line_data),
        }
        results = {}
        for name, future in futures.items():
            try: results[name] = future.result(timeout=90)
            except Exception as e: print(f"[claude] {name} failed: {e}"); results[name] = {}

    merged = {}
    for k in ["dt_kpi","dt_rsn","waste_kpi","waste_bkd","trends","shift"]:
        merged.update(results.get(k,{}))
    alert_data = results.get("alerts",{})
    alerts = list(alert_data.get("alerts") or [])
    alerts.extend(alert_data.get("waste_alerts") or [])
    sev = {"Critical":0,"High":1,"Medium":2,"Low":3}
    alerts.sort(key=lambda a: sev.get(a.get("severity","Low"),3))
    merged["alerts"] = alerts
    merged.update(results.get("opps",{}))
    merged["observations"] = results.get("dt_cmt",{}).get("observations",[])
    merged["kpis"] = kpis
    merged["scheduled_hrs"]    = stats.get("scheduled_hours","")
    merged["unplanned_dt_hrs"] = stats.get("unplanned_hours","")
    # Pass full stats into _extra so sidebar can display all values
    merged["_extra_data"] = {
        "scheduled_hours": stats.get("scheduled_hours","—"),
        "unplanned_hours": stats.get("unplanned_hours","—"),
        "waste_lbs":       stats.get("waste_lbs","—"),
        "waste_cost":      stats.get("waste_cost","—"),
        "mttr":            stats.get("mttr","—"),
        "mtbf":            stats.get("mtbf","—"),
    }

    KPI_TAGS = {"dt_kpi":("red","downtime"),"dt_rsn":("red","downtime"),"dt_cmt":("red","downtime"),"shift":("red","downtime"),"waste_kpi":("amber","waste"),"waste_bkd":("amber","waste"),"opps":("green","opportunities")}
    all_insights = []
    for key,(color,area) in KPI_TAGS.items():
        src = results.get(key,{})
        for field in ["insight","dt_insight","waste_insight"]:
            txt = src.get(field,"") if isinstance(src,dict) else ""
            if txt and len(txt)>10:
                all_insights.append({"text":txt,"color":color,"kpi_area":area})
    trends_r = results.get("trends",{})
    for field,color,area in [("dt_insight","red","downtime"),("waste_insight","amber","waste")]:
        txt = trends_r.get(field,"")
        if txt and len(txt)>10:
            all_insights.append({"text":txt,"color":color,"kpi_area":area})
    merged["key_insights"] = all_insights

    dashboard = _sanitise(merged)
    print(f"[claude] DONE in {time.time()-t0:.1f}s — {len(dashboard['key_insights'])} insights, {len(dashboard['alerts'])} alerts")
    return dashboard

def get_rca(filters: dict, kpi_focus: str = "auto") -> dict:
    """RCA using views.py data + Claude analysis. Returns schema matching old supervisor RCA format."""
    view_data = get_all_view_data(filters)
    kpis      = view_data.get("kpis",{})
    sites     = view_data.get("sites_at_risk",[])
    dt_bullets= view_data.get("downtime_bullets",[])
    wst_bullets=view_data.get("waste_bullets",[])
    shifts    = view_data.get("shift_comparison",[])
    lines     = view_data.get("line_contributions",[])
    ex        = view_data.get("_extra",{})

    ctx = (f"Site={filters.get('site','All sites')}, KPI focus={kpi_focus}\n"
           f"DT={kpis.get('downtime_pct',{}).get('value','—')} (target 5%), "
           f"Waste={kpis.get('waste_pct',{}).get('value','—')} (target 5%)\n"
           f"Top DT reasons: {json.dumps(dt_bullets)}\n"
           f"Top waste types: {json.dumps(wst_bullets)}\n"
           f"Shifts: {json.dumps(shifts)}\n"
           f"Lines: {json.dumps(lines[:4])}\n"
           f"Sites at risk: {json.dumps(sites[:3])}")

    if kpi_focus == "auto":
        detect = "Determine which KPI is most off-target (DT vs 5% or Waste vs 5%) and focus on that."
    else:
        detect = f"Focus on: {kpi_focus}."

    prompt = f"""{ctx}

{detect}

Perform detailed root cause analysis using the data above.
Return ONLY this exact JSON structure:
{{
  "issue": "[KPI name]",
  "severity": "Critical|High|Medium|Low",
  "confidence": "XX%",
  "detected": "[timeframe from data]",
  "summary": "[2 sentences: sentence 1 = problem + scale with numbers. Sentence 2 = primary root cause from data.]",
  "findings": {{
    "primary_contributor": "[exact RSN or WST_TYP from data]",
    "primary_pct": "XX%",
    "impacted_asset": "[specific line from data]",
    "highest_shift": "[Shift A|B|C from data]",
    "largest_category": "[category from data]",
    "observed_since": "[timeframe]"
  }},
  "ranking": [
    {{"cause": "[from data]", "pct": "XX%"}},
    {{"cause": "[from data]", "pct": "XX%"}},
    {{"cause": "[from data]", "pct": "XX%"}},
    {{"cause": "[from data]", "pct": "XX%"}}
  ],
  "cause_action_map": [
    {{"cause": "[exact cause]", "action": "[specific tomorrow action naming line/shift]"}},
    {{"cause": "[exact cause]", "action": "[specific action]"}},
    {{"cause": "[exact cause]", "action": "[specific action]"}}
  ],
  "impact": {{
    "metric1_label": "[metric name]",
    "metric1_value": "down X.Xpp",
    "metric2_label": "[metric name]",
    "metric2_value": "down X%",
    "metric3_label": "[metric name]",
    "metric3_value": "up X.Xpp",
    "actions_pending": "3 of 3"
  }},
  "actions": [
    {{"recommendation": "[specific action naming line/machine/shift]", "addresses": "[cause]", "impact": "[e.g. Reduce DT 1.5pp]", "status": "High"}},
    {{"recommendation": "[specific action]", "addresses": "[cause]", "impact": "[impact]", "status": "High"}},
    {{"recommendation": "[specific action]", "addresses": "[cause]", "impact": "[impact]", "status": "Medium"}}
  ],
  "detail": {{
    "Observed": "[timeframe]",
    "Affected Asset": "[line from data]",
    "Operational Impact": "[specific impact phrase]",
    "Category": "[WST_TYP or RSN from data]",
    "Contribution": "XX%",
    "Priority": "High|Medium|Low"
  }}
}}"""

    raw = _call_claude(prompt, SYSTEM, model=CLAUDE_INSIGHT)
    result = _parse_json(raw)
    if not result or not result.get("issue"):
        result = {
            "issue": kpi_focus if kpi_focus != "auto" else "Manufacturing KPI",
            "severity": "High",
            "confidence": "—",
            "detected": "—",
            "summary": f"DT at {kpis.get('downtime_pct',{}).get('value','—')} vs 5% target. Top reason: {dt_bullets[0]['text'] if dt_bullets else '—'}",
            "findings": {},
            "ranking": [{"cause": b["text"].split("—")[0].strip(), "pct": str(b["pct"])+"%"} for b in dt_bullets[:4]],
            "cause_action_map": [],
            "impact": {},
            "actions": [],
            "detail": {}
        }
    return result

def ask_question(question: str, filters: dict) -> str:
    view_data = get_all_view_data(filters)
    kpis  = view_data.get("kpis",{})
    sites = view_data.get("sites_at_risk",[])
    ctx = f"DT={kpis.get('downtime_pct',{}).get('value','—')} ({kpis.get('downtime_pct',{}).get('delta','')}), Waste={kpis.get('waste_pct',{}).get('value','—')}, Stops={kpis.get('stops',{}).get('value','—')}, Sites at risk: {', '.join(s['site'] for s in sites[:3])}"
    return _call_claude(f"Data: {ctx}\n\nQuestion: {question}\n\nAnswer with specific numbers. Be direct.", SYSTEM) or "No data available."
