"""
supervisor.py — single blocking call, stream=True, no polling loop.
"""
import os, json, re, requests
from dotenv import load_dotenv

load_dotenv()

HOSTNAME   = os.getenv("DATABRICKS_SERVER_HOSTNAME","").replace("https://","").replace("http://","").rstrip("/")
PAT        = os.getenv("DATABRICKS_PAT_TOKEN","")
ENDPOINT   = os.getenv("SUPERVISOR_ENDPOINT_NAME","")
DEBUG      = os.getenv("SUPERVISOR_DEBUG","false").lower() == "true"
QUERY_MODE = os.getenv("SUPERVISOR_QUERY_MODE","minimal")


def _is_timeout_response(text: str) -> bool:
    """Detect if Supervisor hit its internal time limit and is asking to continue."""
    lower = text.lower()
    return (
        "time out" in lower or "time limit" in lower or "timed out" in lower
    ) and (
        "continue" in lower or "would you like" in lower or "shall i" in lower
    )


def _post_once(messages: list) -> str:
    """Single POST to Supervisor, returns raw text."""
    url = f"https://{HOSTNAME}/serving-endpoints/{ENDPOINT}/invocations"
    resp = requests.post(
        url,
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
        json={"input": messages},
        timeout=None,
        stream=True,
    )
    print(f"[supervisor] <- HTTP {resp.status_code}")
    resp.raise_for_status()

    chunks = []
    for chunk in resp.iter_content(chunk_size=None, decode_unicode=True):
        if chunk:
            chunks.append(chunk)
            if DEBUG:
                print(f"[supervisor]    chunk: {chunk[:150]}")
    return "".join(chunks)


def _call_supervisor(messages):
    if not all([HOSTNAME, PAT, ENDPOINT]):
        raise RuntimeError("Missing .env: DATABRICKS_SERVER_HOSTNAME, DATABRICKS_PAT_TOKEN, SUPERVISOR_ENDPOINT_NAME")

    print(f"[supervisor] -> {ENDPOINT} | mode={QUERY_MODE}")
    print(f"[supervisor]    waiting (no timeout, stream=True, auto-continue enabled)...")

    # Keep a running conversation so Supervisor has full context on Continue
    conversation = list(messages)
    collected_texts = []
    attempt = 0

    try:
        while True:
            attempt += 1
            print(f"[supervisor]    attempt {attempt}...")

            raw = _post_once(conversation)
            print(f"[supervisor]    response {len(raw)} chars: {raw[:300]}")

            # Parse to extract text
            parsed = _parse(raw)
            text   = parsed.get("narrative", "") or raw

            # Check if Supervisor timed out internally and wants to continue
            if _is_timeout_response(text):
                print(f"[supervisor]    ⚠ Supervisor hit internal time limit — sending Continue...")
                collected_texts.append(text)

                # Append assistant response + user continue to conversation
                conversation.append({"role": "assistant", "content": text})
                conversation.append({"role": "user",      "content": "Continue"})
                continue   # loop back and call again

            # Check if we have a real JSON result
            if any(k in parsed for k in ["key_insights", "kpis", "waste_bullets"]):
                print(f"[supervisor]    ✓ Got complete JSON dashboard")
                # If we collected partial texts, prepend them as context
                return raw

            # Got plain text (intro/narration) — append and continue
            if text and len(text) > 20 and "{" not in text:
                print(f"[supervisor]    ℹ narrative text — appending and continuing...")
                collected_texts.append(text)
                conversation.append({"role": "assistant", "content": text})
                conversation.append({"role": "user",      "content": "Continue and return the JSON dashboard now."})
                if attempt >= 5:
                    # Too many continuations — return what we have
                    print(f"[supervisor]    ⚠ Max continuations reached — returning last response")
                    return raw
                continue

            # We have JSON or something usable — return it
            return raw

    except requests.exceptions.HTTPError:
        raise RuntimeError(f"HTTP error: {resp.text[:300]}")
    except Exception as e:
        raise RuntimeError(f"Call failed: {e}")


def _unwrap(d):
    """
    Extract final answer from Supervisor response.

    Your Supervisor returns:
    {"output": [
      {"type":"message","content":[{"type":"output_text","text":"I will query Genie..."}]},
      {"type":"function_call","name":"genie-xxx"},   <- Genie call (done internally)
      {"type":"message","content":[{"type":"output_text","text":"...JSON answer here..."}]}
    ]}

    Key insight: the FIRST output_text is the intro ("I will query...").
    The LAST output_text is the actual JSON answer.
    We must collect ALL text blocks and find the JSON among them.
    """

    if "output" in d and isinstance(d["output"], list):
        # Collect all text blocks in order
        all_texts = []
        for block in d["output"]:
            if not isinstance(block, dict):
                continue
            # message block with content array
            if block.get("type") == "message":
                for cb in (block.get("content") or []):
                    if isinstance(cb, dict) and cb.get("type") in ("output_text", "text"):
                        t = cb.get("text", "").strip()
                        if t:
                            all_texts.append(t)
            # direct text/output_text block
            elif block.get("type") in ("output_text", "text"):
                t = block.get("text", "").strip()
                if t:
                    all_texts.append(t)

        print(f"[supervisor]    found {len(all_texts)} text block(s) in output")

        if all_texts:
            # Strategy 1: Look for JSON in EACH text block, starting from the last
            # (the last block is usually the final synthesised answer)
            _json_keys = {"key_insights","alerts","waste_alerts","waste_bullets",
                          "downtime_bullets","observations","opportunities","kpis",
                          "downtime_pct","waste_pct","stops","shift_comparison",
                          "waste_trend","downtime_trend","line_contributions"}
            for text in reversed(all_texts):
                if "{" in text and any(k in text for k in _json_keys):
                    print(f"[supervisor]    JSON found in text block ({len(text)} chars)")
                    return _parse(text)

            # Strategy 2: JSON might be spread across blocks — combine all and search
            combined = " ".join(all_texts)
            if "{" in combined:
                print(f"[supervisor]    trying combined text ({len(combined)} chars)")
                result = _parse(combined)
                if "narrative" not in result or len(result) > 1:
                    return result

            # Strategy 3: Last text block as-is (might be plain answer)
            last = all_texts[-1]
            print(f"[supervisor]    using last text block: {last[:200]}")
            return _parse(last)

        # No text blocks — only function_calls returned (Supervisor still mid-run)
        raw_str = json.dumps(d)
        print(f"[supervisor]    WARNING: only function_calls in output, no text yet")
        print(f"[supervisor]    full response: {raw_str[:500]}")
        return {"narrative": "Supervisor is still querying Genie — please retry in a moment."}

    # OpenAI choices format
    if "choices" in d:
        c = ((d["choices"][0].get("message") or {}).get("content") or "")
        return _parse(c) if isinstance(c, str) else (c if isinstance(c, dict) else d)

    # Anthropic content list
    if "content" in d and isinstance(d["content"], list):
        texts = [b.get("text","") for b in d["content"]
                 if isinstance(b,dict) and b.get("type") in ("text","output_text")]
        if texts:
            # Try last block first for same reason
            for t in reversed(texts):
                if "{" in t and "key_insights" in t:
                    return _parse(t)
            return _parse(texts[-1])

    # MLflow output string
    if "output" in d and isinstance(d["output"], str):
        return _parse(d["output"])

    # MLflow predictions
    if "predictions" in d:
        p = d["predictions"]
        if p: return _parse(p[0]) if isinstance(p[0], str) else p[0]

    # Already our schema — include ALL known keys so nothing is dropped
    _our = {"key_insights","observations","kpis","narrative","alerts","waste_alerts",
            "waste_bullets","downtime_bullets","opportunities","shift_comparison",
            "waste_trend","downtime_trend","downtime_pct","waste_pct","stops",
            "line_contributions","last_shift","cost_insight","shift_waste",
            "insight","insight2","scheduled_hrs","unplanned_dt_hrs","total_dt_pct",
            "mttr_hrs","mtbf_hrs"}
    if any(k in d for k in _our):
        return d

    print(f"[supervisor]    unknown keys: {list(d.keys())}")
    return d


def _parse(raw):
    try:
        d = json.loads(raw.strip() if isinstance(raw, str) else raw)
        if isinstance(d, dict): return _unwrap(d)
    except Exception:
        pass
    cleaned = re.sub(r"```json\s*|```\s*", "", str(raw)).strip()
    m = re.search(r"\{[\s\S]*\}", cleaned)
    if m:
        try:
            d = json.loads(m.group(0))
            print(f"[supervisor]    parsed keys: {list(d.keys())}")
            return _unwrap(d)
        except Exception as e:
            print(f"[supervisor]    JSON error: {e}")
    print("[supervisor]    plain text response")
    return {"narrative": cleaned}


def _build_dashboard_prompt(filters):
    ctx = ", ".join(f"{k}={v}" for k,v in filters.items() if v) or "all sites, current week"

    if QUERY_MODE == "minimal":
        print("[supervisor] MINIMAL mode - 2 questions")
        return (
            "You are a manufacturing analytics supervisor agent.\n"
            f"Filters: {ctx}\n\n"
            "Ask Genie only these 2 questions:\n"
            "  Q1: From pgt_waste_pct_composite_metric_view - what is current week Waste_Pct?\n"
            "  Q2: From pgt_plnt_prodtn_metric_view - which line has highest Total_Downtime_Hours?\n\n"
            "After Genie answers, return ONLY valid JSON (no other text):\n"
            '{"key_insights":[{"text":"Waste this week: [Q1 answer]","color":"red"},{"text":"Top downtime line: [Q2 answer]","color":"blue"}],'
            '"observations":["Minimal test - 2 live Genie queries completed"],'
            '"waste_bullets":[],"downtime_bullets":[],"line_contributions":[],"shift_comparison":[],'
            '"waste_trend":{"labels":[],"data":[],"anomaly_week":"","anomaly_label":"Use FULL mode for trends","severity":"warn"},'
            '"downtime_trend":{"labels":[],"data":[],"anomaly_week":"","anomaly_label":"","severity":"warn"},'
            '"opportunities":[],"kpis":{}}'
        )

    print("[supervisor] FULL mode - all questionnaire questions")
    return (
        "You are a manufacturing analytics supervisor agent for a PGT/Frito-Lay plant.\n"
        f"Filters: {ctx}\n\n"

        "=== VIEWS AVAILABLE IN GENIE ===\n"
        "VIEW 1: pgt_plnt_prodtn_metric_view (DOWNTIME)\n"
        "  Columns: Region, Site, Plant, Department, Department_Type, Line, Shape, Product,\n"
        "  Shift (SHIFT_KEY), Period_Week, Timeframe, Production_Date (STRT_DT),\n"
        "  Run_Hours, Planned_Changeover_Downtime_Hours, Scheduled_Hours,\n"
        "  Total_Downtime_Hours, Total_Downtime_Pct,\n"
        "  Total_Unplanned_Downtime_Hours, Total_Unplanned_Downtime_Pct,\n"
        "  RSN (downtime reason), RSN3, RSN4, Comment_Text, STOPS, MTTR, MTBF\n\n"

        "VIEW 2: pgt_plnt_prodtn_evnt_metric_view (WASTE EVENTS)\n"
        "  Columns: PU_ID, STRT_DT, SHIFT_KEY, DEPT_CD, SHAPE_CD,\n"
        "  PRODC_LBS, WST_CST, WST_DLLR, WST_LBS, WST_TYP, SECRY_AREA, RSN,\n"
        "  FRYR_OIL_ACTL_PCTG, SPRAY_OIL_ACTL_PCTG, SSNG_ACTL_PCTG,\n"
        "  Material_ID, Plant_ID, Production_Line_ID,\n"
        "  Actual_Usage, Theoretical_Usage, Production_Order_ID, LOC_CD\n\n"

        "VIEW 3: pgt_plnt_effcncy_metric_view (EFFICIENCY)\n"
        "  Columns: OEE, Quality, Performance, Actual_Rate, Nameplate_Rate,\n"
        "  Run_Hours, Total_Lbs_Produced\n\n"

        "VIEW 4: pgt_waste_pct_composite_metric_view (WASTE %)\n"
        "  Waste_Pct = WST_LBS / (PRODC_LBS + WST_LBS)\n\n"

        "=== QUESTIONS TO ANSWER (all from live Genie data) ===\n\n"

        "--- DOWNTIME KPI QUESTIONS ---\n"
        "DT1. [RTIME 102+103] Current Total_Unplanned_Downtime_Pct this period vs prior period WoW delta.\n"
        "     Use: Region, Site, Plant, Department, Line, Shift, Period_Week, Scheduled_Hours,\n"
        "     Total_Downtime_Hours, Total_Unplanned_Downtime_Hours, Total_Unplanned_Downtime_Pct\n\n"

        "DT2. [Why downtime?] Top 3 downtime reasons by hours.\n"
        "     Use RSN, RSN3, RSN4 columns. Group by reason, sum Total_Unplanned_Downtime_Hours.\n"
        "     Return: reason name, hours, % of total unplanned downtime.\n\n"

        "DT3. [Top drivers] Top downtime categories by Total_Unplanned_Downtime_Hours.\n"
        "     Break down by Department_Type, Line, Shape — identify top 4 contributors.\n\n"

        "DT4. [Comment_Text insights] Top 3 recurring themes from Comment_Text this period.\n"
        "     Summarise what operators are writing about most frequently.\n\n"

        "DT5. [3-year trend] Weekly Total_Unplanned_Downtime_Pct for last 5 weeks using STRT_DT.\n"
        "     Return 5 weekly data points labelled W1-W5 (oldest to newest).\n\n"

        "DT6. [Last shift - did I win?] Most recent shift performance.\n"
        "     Use SHIFT_KEY (1=Shift A, 2=Shift B, 3=Shift C).\n"
        "     Return: shift name, Total_Downtime_Pct, Total_Unplanned_Downtime_Pct,\n"
        "     vs target (use 5% as target), and whether the shift was won (below target).\n\n"

        "DT7. [Downtime trend] Avg Total_Unplanned_Downtime_Hours per shift (SHIFT_KEY 1,2,3).\n"
        "     Return hours per shift for bar chart comparison.\n\n"

        "--- WASTE KPI QUESTIONS ---\n"
        "WS1. [Within target?] Current Waste_Pct vs target (use 5% as target).\n"
        "     If within target, identify top 2 WST_TYP driving waste.\n"
        "     Use: WST_LBS, PRODC_LBS, WST_TYP, SECRY_AREA.\n\n"

        "WS2. [Shift comparison] Highest-waste shift vs lowest-waste shift.\n"
        "     Use SHIFT_KEY, WST_LBS, PRODC_LBS. Return waste % per shift with delta.\n\n"

        "WS3. [Cost impact] Total WST_CST and WST_DLLR this period by SHAPE_CD (product class).\n"
        "     Identify which product class has highest waste cost.\n\n"

        "WS4. [Processing vs Packaging] Waste % split by DEPT_CD or SECRY_AREA.\n"
        "     Separate Processing waste from Packaging waste — % of total each.\n\n"

        "WS5. [Line efficiency] Waste % by Production_Line_ID — top 3 lines by waste.\n"
        "     Include Actual_Usage vs Theoretical_Usage gap where available.\n\n"

        "WS6. [Weekly trend] Waste_Pct for last 6 weeks using STRT_DT grouped by week.\n"
        "     Return 6 data points labelled W1-W6 (oldest to newest).\n\n"

        "=== OUTPUT FORMAT ===\n"
        "Return ONLY valid JSON — no text before or after the JSON object.\n\n"

        "{"
        "\"kpis\": {"
        "  \"waste_pct\":    {\"value\": \"X.X%\",  \"delta\": \"↑/↓ X.Xpp vs prior week\", \"direction\": \"bad|good|warn\"},"
        "  \"downtime_pct\": {\"value\": \"X.X%\",  \"delta\": \"↑/↓ X.Xpp WoW\",          \"direction\": \"bad|good|warn\"},"
        "  \"oee\":          {\"value\": \"XX.X%\", \"delta\": \"↑/↓ X.Xpp vs target\",    \"direction\": \"bad|good|warn\"},"
        "  \"stops\":        {\"value\": \"XXX\",   \"delta\": \"↑/↓ XX vs prior week\",   \"direction\": \"bad|good|warn\"}"
        "},"
        "\"key_insights\": ["
        "  {\"text\": \"[DT1 answer — unplanned DT% with WoW delta]\", \"color\": \"red\"},"
        "  {\"text\": \"[DT2 answer — top downtime reason with hours]\", \"color\": \"blue\"},"
        "  {\"text\": \"[WS1 answer — waste% vs target with top driver]\", \"color\": \"amber\"},"
        "  {\"text\": \"[DT6 answer — last shift win/loss]\", \"color\": \"green\"}"
        "],"
        "\"waste_bullets\": ["
        "  {\"text\": \"[WS4 Processing vs Packaging split]\", \"pct\": 0},"
        "  {\"text\": \"[WS2 highest waste shift vs lowest]\", \"pct\": 0},"
        "  {\"text\": \"[WS3 top product class by waste cost]\", \"pct\": 0}"
        "],"
        "\"downtime_bullets\": ["
        "  {\"text\": \"[DT2 top reason name and % share]\", \"pct\": 0},"
        "  {\"text\": \"[DT3 top department/line contributor]\", \"pct\": 0},"
        "  {\"text\": \"[DT4 top Comment_Text theme]\", \"pct\": 0}"
        "],"
        "\"line_contributions\": ["
        "  {\"line\": \"[top line from WS5]\",    \"pct\": 0, \"color\": \"red\"},"
        "  {\"line\": \"[2nd line]\",              \"pct\": 0, \"color\": \"gray\"},"
        "  {\"line\": \"[3rd line]\",              \"pct\": 0, \"color\": \"gray\"},"
        "  {\"line\": \"Others\",                  \"pct\": 0, \"color\": \"gray\"}"
        "],"
        "\"shift_comparison\": ["
        "  {\"shift\": \"Shift A\", \"hours\": 0.0, \"color\": \"#3B6FD4\"},"
        "  {\"shift\": \"Shift B\", \"hours\": 0.0, \"color\": \"#E04444\"},"
        "  {\"shift\": \"Shift C\", \"hours\": 0.0, \"color\": \"#3B6FD4\"}"
        "],"
        "\"waste_trend\": {"
        "  \"labels\": [\"W1\",\"W2\",\"W3\",\"W4\",\"W5\",\"W6\"],"
        "  \"data\":   [0.0,0.0,0.0,0.0,0.0,0.0],"
        "  \"anomaly_week\": \"ANOMALY: WX or CRITICAL TREND\","
        "  \"anomaly_label\": \"pattern description\","
        "  \"severity\": \"anomaly|critical|warn\""
        "},"
        "\"downtime_trend\": {"
        "  \"labels\": [\"W1\",\"W2\",\"W3\",\"W4\",\"W5\"],"
        "  \"data\":   [0.0,0.0,0.0,0.0,0.0],"
        "  \"anomaly_week\": \"CRITICAL TREND\","
        "  \"anomaly_label\": \"pattern description\","
        "  \"severity\": \"anomaly|critical|warn\""
        "},"
        "\"observations\": ["
        "  \"[DT4 — top Comment_Text theme with specific operator language]\","
        "  \"[DT5 — 3-year trend observation, e.g. Monday pattern]\","
        "  \"[WS5 — line efficiency gap, Actual vs Theoretical usage]\""
        "],"
        "\"opportunities\": ["
        "  {\"title\": \"[top action from waste analysis]\",    \"delta\": \"-X.Xpp Waste\",    \"color\": \"good\"},"
        "  {\"title\": \"[top action from downtime analysis]\", \"delta\": \"-X.Xpp Downtime\", \"color\": \"warn\"},"
        "  {\"title\": \"[cost saving opportunity from WS3]\",  \"delta\": \"-$XXK cost\",      \"color\": \"good\"}"
        "]}"
    )


def _build_ask_prompt(question, filters):
    ctx = ", ".join(f"{k}={v}" for k,v in filters.items() if v) or "all sites"
    return (
        f"Manufacturing analytics supervisor. Filters: {ctx}\n"
        "Views: pgt_plnt_prodtn_metric_view, pgt_plnt_prodtn_evnt_metric_view, "
        "pgt_plnt_effcncy_metric_view, pgt_waste_pct_composite_metric_view\n"
        f"Question: {question}\n"
        "Answer in 2-4 plain text sentences with real numbers. No JSON."
    )


def _ss(v,n):
    if v is None: return ""
    s=str(v).strip(); return s[:n-1]+"..." if len(s)>n else s

def _sp(v):
    try: return max(0,min(100,int(float(str(v).replace("%","")))))
    except: return 0

def _sf(v):
    try: return max(0.0,float(v))
    except: return 0.0

def _sanitise(d):
    vc={"red","blue","amber","green"}; vd={"bad","good","warn"}; vs={"anomaly","critical","warn"}

    def ins(i):
        if not isinstance(i,dict): return None
        t=_ss(i.get("text") or i.get("insight",""),120)
        c=i.get("color","blue") if i.get("color") in vc else "blue"
        return {"text":t,"color":c} if t else None

    def bul(b):
        if not isinstance(b,dict): return None
        t=_ss(b.get("text") or b.get("label",""),100)
        return {"text":t,"pct":_sp(b.get("pct",0))} if t else None

    def lin(l):
        if not isinstance(l,dict): return None
        n=_ss(l.get("line") or l.get("name",""),30)
        return {"line":n,"pct":_sp(l.get("pct",0)),"color":l.get("color","gray")} if n else None

    def shf(s):
        if not isinstance(s,dict): return None
        n=_ss(s.get("shift") or s.get("name",""),15)
        dc={"Shift A":"#3B6FD4","Shift B":"#E04444","Shift C":"#3B6FD4"}
        return {"shift":n,"hours":_sf(s.get("hours",0)),"color":s.get("color") or dc.get(n,"#9CA3AF")} if n else None

    def trd(t,mx):
        e={"labels":[],"data":[],"anomaly_week":"","anomaly_label":"","severity":"warn"}
        if not isinstance(t,dict): return e
        lb=[str(x) for x in (t.get("labels") or [])[:mx]]
        da=[_sf(x) for x in (t.get("data") or [])[:mx]]
        n=min(len(lb),len(da))
        return {"labels":lb[:n],"data":da[:n],"anomaly_week":_ss(t.get("anomaly_week",""),30),
                "anomaly_label":_ss(t.get("anomaly_label",""),50),
                "severity":t.get("severity","warn") if t.get("severity") in vs else "warn"}

    def opp(o):
        if not isinstance(o,dict): return None
        t=_ss(o.get("title") or o.get("action",""),40)
        return {"title":t,"delta":_ss(o.get("delta",""),30),
                "color":o.get("color","warn") if o.get("color") in {"good","warn"} else "warn"} if t else None

    def alrt(a):
        if not isinstance(a,dict): return None
        site=_ss(a.get("site",""),40)
        if not site: return None
        sv=a.get("severity","Medium")
        return {
            "kpi":           _ss(a.get("kpi",""),50),
            "site":          site,
            "current_value": _ss(a.get("current_value",""),20),
            "national_avg":  _ss(a.get("national_avg",""),20),
            "gap":           _ss(a.get("gap",""),30),
            "severity":      sv if sv in {"Critical","High","Medium","Low"} else "Medium",
            "ai_insight":    _ss(a.get("ai_insight",""),200),
            "contributors":  [c for c in (a.get("contributors") or []) if isinstance(c,dict)][:5],
        }

    def kpi(k):
        if not isinstance(k,dict): return {"value":"","delta":"","direction":"warn"}
        return {"value":_ss(k.get("value",""),20),"delta":_ss(k.get("delta",""),50),
                "direction":k.get("direction","warn") if k.get("direction") in vd else "warn"}

    rk=d.get("kpis") or {}
    return {
        "kpis":{k:kpi(rk.get(k,{})) for k in ["waste_pct","downtime_pct","downtime_hrs","oee","stops"]},
        "key_insights":     [x for x in map(ins,(d.get("key_insights") or [])[:4]) if x],
        "alerts":           [x for x in map(alrt,(d.get("alerts") or [])[:10]) if x],
        "waste_bullets":    [x for x in map(bul,(d.get("waste_bullets") or [])[:3]) if x],
        "downtime_bullets": [x for x in map(bul,(d.get("downtime_bullets") or [])[:3]) if x],
        "line_contributions":[x for x in map(lin,(d.get("line_contributions") or [])[:4]) if x],
        "shift_comparison": [x for x in map(shf,(d.get("shift_comparison") or [])[:3]) if x],
        "waste_trend":    trd(d.get("waste_trend"),6),
        "downtime_trend": trd(d.get("downtime_trend"),5),
        "observations":   [_ss(o,200) for o in (d.get("observations") or [])[:3] if isinstance(o,str) and o.strip()],
        "opportunities":  [x for x in map(opp,(d.get("opportunities") or [])[:3]) if x],
        # Absolute DT metrics from dt_kpi question — shown in sidebar stat grid
        "dt_stats": {
            "scheduled_hrs":    _ss(d.get("scheduled_hrs",""),20),
            "unplanned_dt_hrs": _ss(d.get("unplanned_dt_hrs",""),20),
            "total_dt_pct":     _ss(d.get("total_dt_pct",""),20),
            "mttr_hrs":         _ss(d.get("mttr_hrs",""),20),
            "mtbf_hrs":         _ss(d.get("mtbf_hrs",""),20),
        },
    }


def get_dashboard(filters):
    raw  = _call_supervisor([{"role":"user","content":_build_dashboard_prompt(filters)}])
    d    = _parse(raw)
    if "narrative" in d and len(d)==1:
        n=d["narrative"]
        print(f"[supervisor] plain text: {n[:200]}")
        return {"kpis":{},"key_insights":[{"text":n[:120],"color":"blue"}],
                "waste_bullets":[],"downtime_bullets":[],"line_contributions":[],"shift_comparison":[],
                "waste_trend":{"labels":[],"data":[],"anomaly_week":"","anomaly_label":"Plain text response","severity":"warn"},
                "downtime_trend":{"labels":[],"data":[],"anomaly_week":"","anomaly_label":"","severity":"warn"},
                "observations":[n[:200]],"opportunities":[]}
    r=_sanitise(d)
    print(f"[supervisor] insights={len(r['key_insights'])} waste={len(r['waste_bullets'])} dt={len(r['downtime_bullets'])}")
    return r


def ask_question(question, filters):
    raw=_call_supervisor([{"role":"user","content":_build_ask_prompt(question,filters)}])
    d=_parse(raw)
    return d.get("narrative") or raw or "No answer returned."

import concurrent.futures, time

MAX_WORKERS = int(os.getenv("SUPERVISOR_MAX_WORKERS", "8"))

QUESTIONS = {

  "dt_kpi": (
    "pgt_plnt_prodtn_metric_view",
    "ONE QUERY ONLY from pgt_plnt_prodtn_metric_view. "
    "Group by Timeframe or Period_Week. "
    "For most recent period get: AVG(Total_Unplanned_Downtime_Pct), SUM(STOPS), "
    "SUM(Scheduled_Hours), SUM(Total_Unplanned_Downtime_Hours), AVG(Total_Downtime_Pct), "
    "AVG(MTTR) as mttr_hrs, AVG(MTBF) as mtbf_hrs. Also get prior period for deltas. "
    "Compare to 5 percent unplanned DT target. "
    "Return JSON only: "
    '{"downtime_pct":{"value":"X.X%","delta":"\u2191/\u2193 X.Xpp vs prior period","direction":"bad|good|warn"},'
    '"stops":{"value":"XXX","delta":"\u2191/\u2193 XX vs prior period","direction":"bad|good|warn"},'
    '"scheduled_hrs":"X,XXX,XXX",'
    '"unplanned_dt_hrs":"X,XXX",'
    '"total_dt_pct":"XX.X%",'
    '"mttr_hrs":"X.Xh",'
    '"mtbf_hrs":"X.Xh",'
    '"insight":"[DT level + vs 5% target + direction]"}'
  ),

  "dt_reasons": (
    "pgt_plnt_prodtn_metric_view",
    "ONE QUERY ONLY from pgt_plnt_prodtn_metric_view. "
    "Use most recent available data. Do not filter by date. "
    "Group Total_Unplanned_Downtime_Hours by RSN column. Top 3 RSN by hours. "
    "For each: exact RSN value, total hours, percent of total unplanned DT. "
    "Also top 4 lines by percent share of Total_Unplanned_Downtime_Hours. "
    "Return JSON only: "
    '{"downtime_bullets":['
    '{"text":"[exact RSN value] [X.X]h ([X]% of unplanned DT)","pct":0},'
    '{"text":"[2nd RSN] [X.X]h ([X]%)","pct":0},'
    '{"text":"[3rd RSN] [X.X]h ([X]%)","pct":0}],'
    '"line_contributions":['
    '{"line":"[line name]","pct":0,"color":"red"},'
    '{"line":"[line name]","pct":0,"color":"gray"},'
    '{"line":"[line name]","pct":0,"color":"gray"},'
    '{"line":"Others","pct":0,"color":"gray"}],'
    '"insight":"[DIAGNOSTIC: top RSN + hours + percent + line + what manager must do]"}'
  ),

  "dt_comments": (
    "pgt_plnt_prodtn_metric_view",
    "ONE QUERY ONLY from pgt_plnt_prodtn_metric_view. "
    "Use most recent available data. Do not filter by date. "
    "Read Comment_Text column. Find top 2 most frequent issues operators write about. "
    "For each: theme name, count of entries, verbatim 4-6 word phrase from actual Comment_Text. "
    "Also check SHIFT_KEY and STRT_DT for shift or day patterns. "
    "Return JSON only: "
    '{"observations":['
    '"[DIAGNOSTIC] Operators flagged [theme] [X] times - example from data: [verbatim phrase]",'
    '"[PREDICTIVE] [shift or day pattern with specific numbers from data]",'
    '"[PRESCRIPTIVE] [specific action based on operator comments]"],'
    '"insight":"[top Comment_Text theme + count + one action to address it]"}'
  ),

  "dt_shift": (
    "pgt_plnt_prodtn_metric_view",
    "ONE QUERY ONLY from pgt_plnt_prodtn_metric_view. "
    "Use most recent available data. Do not filter by date. "
    "Group Total_Unplanned_Downtime_Hours by SHIFT_KEY (1=Shift A, 2=Shift B, 3=Shift C). "
    "Get average hours per shift. "
    "Find most recent STRT_DT - which shift, DT percent, won or lost vs 5 percent target. "
    "Return JSON only: "
    '{"shift_comparison":['
    '{"shift":"Shift A","hours":0.0,"color":"#3B6FD4"},'
    '{"shift":"Shift B","hours":0.0,"color":"#E04444"},'
    '{"shift":"Shift C","hours":0.0,"color":"#3B6FD4"}],'
    '"last_shift":{"name":"Shift A|B|C","dt_pct":"X.X%","target":"5%","won":true},'
    '"insight":"Last [shift] DT [X.X%] - [WON/LOST] vs 5% target. [Worst shift] averages [X]h vs [best] [X]h."}'
  ),

  "dt_trend": (
    "pgt_plnt_prodtn_metric_view",
    "ONE QUERY ONLY from pgt_plnt_prodtn_metric_view. "
    "Group Total_Unplanned_Downtime_Hours by week using STRT_DT. "
    "Get last 5 weeks ordered ascending. Label W1 oldest to W5 newest. "
    "Is trend rising, falling, or spiked? Project W6 if trend continues. "
    "Return JSON only: "
    '{"downtime_trend":{"labels":["W1","W2","W3","W4","W5"],"data":[0.0,0.0,0.0,0.0,0.0],'
    '"anomaly_week":"CRITICAL TREND or ANOMALY: WX",'
    '"anomaly_label":"[PREDICTIVE: W6 projected at X.Xh - will or will not miss target]",'
    '"severity":"anomaly|critical|warn"},'
    '"insight":"[trend direction + W6 projection + urgency]"}'
  ),

  "waste_kpi": (
    "pgt_waste_pct_composite_metric_view",
    "ONE QUERY ONLY from pgt_waste_pct_composite_metric_view. "
    "Calculate Waste_Pct = SUM(WST_LBS) / (SUM(PRODC_LBS) + SUM(WST_LBS)) across all available data. "
    "Group by Timeframe or Period_Week to get most recent vs prior period values. "
    "Compare most recent Waste_Pct to 5 percent target. "
    "Return JSON only: "
    '{"waste_pct":{"value":"X.X%","delta":"\u2191/\u2193 X.Xpp vs prior period","direction":"bad|good|warn"},'
    '"insight":"[waste level + vs 5% target + is it improving or worsening]"}'
  ),

  "waste_breakdown": (
    "pgt_plnt_prodtn_evnt_metric_view",
    "ONE QUERY ONLY from pgt_plnt_prodtn_evnt_metric_view. "
    "Use most recent available data. Do not filter by date. "
    "Group WST_LBS by WST_TYP. Top 3 waste types by lbs. "
    "For each: exact WST_TYP value, total lbs, percent of total, SECRY_AREA it comes from. "
    "Also group by DEPT_CD for Processing vs Packaging percent split. "
    "Also group by SHIFT_KEY for highest vs lowest waste shift. "
    "Return JSON only: "
    '{"waste_bullets":['
    '{"text":"[exact WST_TYP] [X]% ([X,XXX]lbs) from [SECRY_AREA] - [diagnostic meaning]","pct":0},'
    '{"text":"[2nd WST_TYP] [X]% ([X,XXX]lbs) - [context]","pct":0},'
    '{"text":"Processing [X]% vs Packaging [X]% - [which area needs focus]","pct":0}],'
    '"insight":"[top WST_TYP] [X]% of waste from [SECRY_AREA] - [prescriptive action]",'
    '"cost_insight":"Top waste cost: [SHAPE_CD] $[X,XXX]",'
    '"shift_waste":"Shift [X] [X.X%] vs Shift [Y] [X.X%] - [Xpp] gap"}'
  ),

  "waste_trend": (
    "pgt_waste_pct_composite_metric_view",
    "ONE QUERY ONLY from pgt_waste_pct_composite_metric_view. "
    "Group by week using STRT_DT. Calculate Waste_Pct = WST_LBS divided by sum of PRODC_LBS and WST_LBS per week. "
    "Get last 6 weeks ordered ascending. Label W1 oldest to W6 newest. "
    "Project W7 if trend continues. Will it breach 5 percent? "
    "Return JSON only: "
    '{"waste_trend":{"labels":["W1","W2","W3","W4","W5","W6"],"data":[0.0,0.0,0.0,0.0,0.0,0.0],'
    '"anomaly_week":"ANOMALY: WX or CRITICAL TREND",'
    '"anomaly_label":"[PREDICTIVE: W7 projected at X.X% - will or will not breach 5%]",'
    '"severity":"anomaly|critical|warn"},'
    '"insight":"[waste trend direction + W7 projection]"}'
  ),

  "opportunities": (
    "pgt_plnt_prodtn_metric_view",
    "ONE QUERY ONLY from pgt_plnt_prodtn_metric_view. "
    "Use most recent available data. Do not filter by date. "
    "Based on RSN breakdown: identify top 3 specific actions a manager can assign today. "
    "Each action title must name the actual RSN value or Line from the data. Not generic. "
    "Estimate pp improvement based on actual hours lost. "
    "Return JSON only: "
    '{"opportunities":['
    '{"title":"[specific action + actual RSN or Line from data]","delta":"-X.Xpp Downtime","color":"warn"},'
    '{"title":"[specific action for 2nd RSN]","delta":"-X.Xpp Downtime","color":"warn"},'
    '{"title":"[specific action for shift or line gap]","delta":"-X.Xpp","color":"good"}],'
    '"insight":"Priority: [top action] - assign to [team] today to save [Xh] downtime"}'
  ),

  "alerts_dt": (
    "pgt_plnt_prodtn_metric_view",
    "ONE QUERY ONLY from pgt_plnt_prodtn_metric_view. "
    "Use most recent available data. Do not filter by date. "
    "Step 1: Calculate AVG(Total_Unplanned_Downtime_Pct) across ALL sites — this is the national average. "
    "Step 2: Group by Site. Get AVG(Total_Unplanned_Downtime_Pct) per site. "
    "Step 3: Find all sites where site_avg is above the national average. "
    "For each site above average: calculate gap above national average, assign severity. "
    "Severity rules: "
    "  Critical = site_avg more than 2x national_avg "
    "  High     = site_avg more than 1.5x national_avg "
    "  Medium   = site_avg above national_avg but below 1.5x "
    "For top 3 sites: also get top RSN causing their downtime. "
    "Return JSON only: "
    '{"alerts":['
    '{"kpi":"Total Unplanned Downtime %",'
    '"site":"[site name from data]",'
    '"current_value":"X.X%",'
    '"national_avg":"X.X%",'
    '"gap":"+X.Xpp above national avg",'
    '"severity":"Critical|High|Medium",'
    '"ai_insight":"[Site] DT is [X.X%] vs national avg [X.X%] — driven by [top RSN from data]",'
    '"contributors":[{"name":"[RSN from data]","pct":0},{"name":"[2nd RSN]","pct":0}]},'
    '{"kpi":"Total Unplanned Downtime %","site":"[2nd site]","current_value":"X.X%","national_avg":"X.X%","gap":"+X.Xpp","severity":"High","ai_insight":"[diagnostic]","contributors":[]},'
    '{"kpi":"Total Unplanned Downtime %","site":"[3rd site]","current_value":"X.X%","national_avg":"X.X%","gap":"+X.Xpp","severity":"Medium","ai_insight":"[diagnostic]","contributors":[]}]}'
  ),

  "alerts_waste": (
    "pgt_waste_pct_composite_metric_view",
    "ONE QUERY ONLY from pgt_waste_pct_composite_metric_view. "
    "Use most recent available data. Do not filter by date. "
    "Step 1: Calculate national average Waste_Pct = SUM(WST_LBS)/(SUM(PRODC_LBS)+SUM(WST_LBS)) across all sites. "
    "Step 2: Group by Site. Get Waste_Pct per site. "
    "Step 3: Find sites where site_waste_pct is above national average. "
    "Severity: Critical = above 2x avg, High = above 1.5x avg, Medium = above avg. "
    "Return JSON only: "
    '{"waste_alerts":['
    '{"kpi":"Waste % (Yield Loss)",'
    '"site":"[site name]",'
    '"current_value":"X.X%",'
    '"national_avg":"X.X%",'
    '"gap":"+X.Xpp above national avg",'
    '"severity":"Critical|High|Medium",'
    '"ai_insight":"[Site] waste [X.X%] vs national avg [X.X%] — top driver: [WST_TYP from data]",'
    '"contributors":[{"name":"[WST_TYP from data]","pct":0}]}]}'
  ),

}


def _call_with_retry(key, view, question, ctx):
    for attempt in range(2):
        try:
            result = _call_one_question(key, view, question, ctx)
            if result:
                return result
            if attempt == 0:
                time.sleep(2)
        except Exception as e:
            err = str(e)
            if attempt == 0 and any(x in err for x in ["SSL","EOF","ConnectionPool","Max retries"]):
                print(f"[supervisor]   {key} SSL error, retrying in 5s")
                time.sleep(5)
            else:
                print(f"[supervisor]   {key} failed: {err[:80]}")
                return {}
    return {}


def _call_one_question(q_key, view, question, ctx):
    prompt = (
        f"You are a manufacturing analytics supervisor agent.\n"
        f"Filters: {ctx}\n"
        f"View: {view}\n\n"
        f"{question}\n\n"
        f"Return ONLY valid JSON. No text before or after."
    )
    t0 = time.time()
    print(f"[supervisor] START question={q_key}")
    try:
        raw    = _call_supervisor([{"role": "user", "content": prompt}])
        parsed = _parse(raw)
        elapsed = round(time.time()-t0, 1)
        if "narrative" in parsed and len(parsed) == 1:
            print(f"[supervisor]   {q_key} plain text in {elapsed}s, skipping")
            return {}
        parsed = _map_supervisor_schema(parsed)
        print(f"[supervisor]   {q_key} DONE in {elapsed}s keys: {list(parsed.keys())}")
        return parsed
    except Exception as e:
        elapsed = round(time.time()-t0, 1)
        print(f"[supervisor]   {q_key} FAILED in {elapsed}s: {e}")
        return {}


def get_dashboard_parallel(filters):
    # Build meaningful context from filters for Genie
    ctx_parts = []
    if filters.get("year")       and filters["year"]     != "All": ctx_parts.append(f"Year={filters['year']}")
    if filters.get("timeframe")  and filters["timeframe"]!= "All": ctx_parts.append(f"Timeframe={filters['timeframe']}")
    if filters.get("site")       and filters["site"]     != "All": ctx_parts.append(f"Site={filters['site']}")
    if filters.get("region")     and filters["region"]   != "All": ctx_parts.append(f"Region={filters['region']}")
    if filters.get("market")     and filters["market"]   != "All": ctx_parts.append(f"Market={filters['market']}")
    ctx = ", ".join(ctx_parts) if ctx_parts else "all sites, most recent available period"
    QUESTION_TIMEOUT = int(os.getenv("SUPERVISOR_QUESTION_TIMEOUT","300"))
    print(f"[supervisor] PARALLEL mode - {len(QUESTIONS)} questions, max {MAX_WORKERS} concurrent")

    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(_call_with_retry, key, view, question, ctx): key
            for key, (view, question) in QUESTIONS.items()
        }
        for future in concurrent.futures.as_completed(futures, timeout=QUESTION_TIMEOUT):
            key = futures[future]
            try:
                results[key] = future.result()
            except concurrent.futures.TimeoutError:
                print(f"[supervisor]   {key} TIMED OUT after {QUESTION_TIMEOUT}s")
                results[key] = {}
            except Exception as e:
                print(f"[supervisor]   {key} future failed: {e}")
                results[key] = {}

    merged = {}
    for r in results.values():
        merged.update(r)

    # Collect insight fields as key_insights — color and kpi_area by question type
    KPI_META = {
        "dt_kpi":         ("red",   "downtime"),
        "dt_reasons":     ("red",   "downtime"),
        "dt_comments":    ("red",   "downtime"),
        "dt_shift":       ("red",   "downtime"),
        "dt_trend":       ("red",   "downtime"),
        "waste_kpi":      ("amber", "waste"),
        "waste_breakdown":("amber", "waste"),
        "waste_trend":    ("amber", "waste"),
        "opportunities":  ("green", "opportunities"),
        "alerts_dt":      ("red",   "downtime"),
        "alerts_waste":   ("amber", "waste"),
    }
    all_insights = []
    for key in QUESTIONS.keys():
        color, kpi_area = KPI_META.get(key, ("blue", "general"))
        for field in ["insight", "insight2"]:
            txt = results.get(key, {}).get(field, "")
            if txt and len(txt) > 10:
                all_insights.append({"text": txt, "color": color, "kpi_area": kpi_area})

    merged["key_insights"] = all_insights

    # Merge DT site alerts + waste site alerts into one alerts array
    alerts = list(merged.get("alerts", []))
    waste_alerts = merged.get("waste_alerts", [])
    if isinstance(waste_alerts, list):
        alerts.extend(waste_alerts)
    # Sort by severity
    sev_order = {"Critical":0,"High":1,"Medium":2,"Low":3}
    alerts.sort(key=lambda a: sev_order.get(a.get("severity","Low"),3))
    merged["alerts"] = alerts

    dashboard = {
        "kpis": {
            "waste_pct":    merged.get("waste_pct",    {"value":"","delta":"","direction":"warn"}),
            "downtime_pct": merged.get("downtime_pct", {"value":"","delta":"","direction":"warn"}),
            "oee":          merged.get("oee",           {"value":"","delta":"","direction":"warn"}),
            "stops":        merged.get("stops",         {"value":"","delta":"","direction":"warn"}),
        },
        "key_insights":      merged.get("key_insights",      []),
        "alerts":            merged.get("alerts",            []),
        "waste_bullets":     merged.get("waste_bullets",     []),
        "downtime_bullets":  merged.get("downtime_bullets",  []),
        "line_contributions":merged.get("line_contributions",[]),
        "shift_comparison":  merged.get("shift_comparison",  []),
        "waste_trend":       merged.get("waste_trend",       {"labels":[],"data":[],"anomaly_week":"","anomaly_label":"","severity":"warn"}),
        "downtime_trend":    merged.get("downtime_trend",    {"labels":[],"data":[],"anomaly_week":"","anomaly_label":"","severity":"warn"}),
        "observations":      merged.get("observations",      []),
        "opportunities":     merged.get("opportunities",     []),
        "_extra": {
            "cost_insight": merged.get("cost_insight",""),
            "shift_waste":  merged.get("shift_waste",""),
            "last_shift":   merged.get("last_shift",{}),
        }
    }
    print(f"[supervisor] PARALLEL done - {len(dashboard['key_insights'])} insights, {len(dashboard['alerts'])} alerts")
    return _sanitise(dashboard)


def get_dashboard(filters):
    return get_dashboard_parallel(filters)


def ask_question(question, filters):
    ctx = ", ".join(f"{k}={v}" for k,v in filters.items() if v) or "all sites"
    prompt = (
        f"Manufacturing analytics supervisor. Filters: {ctx}\n"
        "Views: pgt_plnt_prodtn_metric_view, pgt_plnt_prodtn_evnt_metric_view, "
        "pgt_plnt_effcncy_metric_view, pgt_waste_pct_composite_metric_view.\n"
        f"Question: {question}\n"
        "Give a DIAGNOSTIC + PREDICTIVE + PRESCRIPTIVE answer in 3-5 sentences with real numbers. No JSON."
    )
    raw = _call_supervisor([{"role":"user","content":prompt}])
    d = _parse(raw)
    return d.get("narrative") or raw or "No answer returned."


def _build_rca_questions(filters, kpi_focus="auto"):
    ctx = ", ".join(f"{k}={v}" for k,v in filters.items() if v) or "all sites, current period"
    if kpi_focus == "auto":
        detect = (
            "First check which KPI is most off-target using most recent available data: "
            "Total_Unplanned_Downtime_Pct vs 5% target, Waste_Pct vs 5% target, OEE vs 80% target. "
            "Use the worst one. Set issue = its exact name. "
        )
    else:
        detect = f"Focus on: {kpi_focus}. Set issue = {kpi_focus}. "
    return {
        "rca_analysis": (
            "pgt_plnt_prodtn_metric_view,pgt_plnt_prodtn_evnt_metric_view,pgt_waste_pct_composite_metric_view",
            f"Filters: {ctx}. {detect}"
            "Use most recent available data. Do not filter by date. "
            "1. KPI current value vs target, severity, when first detected (STRT_DT), confidence percent. "
            "2. Top 4 root causes - exact RSN or WST_TYP name, percent contribution, which line affected. "
            "3. Most impacted line. Worst shift (SHIFT_KEY). Largest category. "
            "4. Two sentence summary: problem + scale, then primary root cause. "
            "5. Rank top 4 causes by percent contribution. "
            "Return JSON only: "
            '{"issue":"[KPI name]","severity":"Critical|High|Medium|Low","confidence":"XX%",'
            '"detected":"[STRT_DT date]",'
            '"summary":"[Sentence 1: problem + scale. Sentence 2: root cause from data.]",'
            '"findings":{"primary_contributor":"[exact RSN or WST_TYP]","primary_pct":"XX%",'
            '"impacted_asset":"[specific line]","highest_shift":"[Shift A|B|C]",'
            '"largest_category":"[actual value]","observed_since":"[date]"},'
            '"ranking":[{"cause":"[from data]","pct":"XX%"},{"cause":"[from data]","pct":"XX%"},'
            '{"cause":"[from data]","pct":"XX%"},{"cause":"[from data]","pct":"XX%"}]}'
        ),
        "rca_actions": (
            "pgt_plnt_prodtn_metric_view,pgt_plnt_prodtn_evnt_metric_view",
            f"Filters: {ctx}. "
            "Use most recent available data. Do not filter by date. "
            "1. Top 4 cause-action pairs: cause = exact RSN/WST_TYP, action = specific tomorrow action naming line/shift. "
            "2. Top 4 recommended actions with root cause, expected pp impact, priority. "
            "3. Estimated total improvement: waste reduction pp, DT reduction percent, OEE gain pp. "
            "4. Operational impact phrase from Comment_Text. Timeframe. Priority level. "
            "Return JSON only: "
            '{"cause_action_map":[{"cause":"[exact]","action":"[specific tomorrow action]"},'
            '{"cause":"[exact]","action":"[specific]"},{"cause":"[exact]","action":"[specific]"},{"cause":"[exact]","action":"[specific]"}],'
            '"impact":{"metric1_label":"[metric]","metric1_value":"down X.Xpp",'
            '"metric2_label":"[metric]","metric2_value":"down X%",'
            '"metric3_label":"[metric]","metric3_value":"up X.Xpp","actions_pending":"4 of 4"},'
            '"detail":{"Observed":"[timeframe]","Affected Asset":"[line]",'
            '"Operational Impact":"[phrase from Comment_Text]","Category":"[WST_TYP or RSN]",'
            '"Contribution":"XX%","Priority":"High|Medium|Low"},'
            '"actions":[{"recommendation":"[specific action naming line/machine/shift]","addresses":"[cause]","impact":"[e.g. Reduce Waste 1.1pp]","status":"High"},'
            '{"recommendation":"[specific]","addresses":"[cause]","impact":"[impact]","status":"High"},'
            '{"recommendation":"[specific]","addresses":"[cause]","impact":"[impact]","status":"Medium"},'
            '{"recommendation":"[specific]","addresses":"[cause]","impact":"[impact]","status":"Low"}]}'
        ),
    }


def get_rca(filters, kpi_focus="auto"):
    questions = _build_rca_questions(filters, kpi_focus)
    ctx = ", ".join(f"{k}={v}" for k,v in filters.items() if v) or "all sites, current period"
    print(f"[supervisor] RCA PARALLEL - {len(questions)} questions")
    results = {}

    def _rca_retry(key, view, question, ctx):
        for attempt in range(2):
            try:
                result = _call_one_question(key, view, question, ctx)
                if result: return result
                if attempt == 0: time.sleep(3)
            except Exception as e:
                err = str(e)
                if attempt == 0 and any(x in err for x in ["SSL","EOF","ConnectionPool"]):
                    time.sleep(5)
                else:
                    return {}
        return {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(_rca_retry, key, view, question, ctx): key
            for key, (view, question) in questions.items()
        }
        for future in concurrent.futures.as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as e:
                print(f"[supervisor]   RCA {key} failed: {e}")
                results[key] = {}

    merged = {}
    for r in results.values():
        merged.update(r)
    if not merged.get("issue"):
        merged["issue"] = kpi_focus if kpi_focus != "auto" else "Manufacturing KPI"
    print(f"[supervisor] RCA done - keys: {list(merged.keys())}")
    return merged


def _map_supervisor_schema(d):
    our_keys = {"key_insights","waste_bullets","downtime_bullets","kpis",
                "downtime_pct","waste_pct","stops","oee","insight","insight2",
                "shift_comparison","line_contributions","observations","opportunities",
                "waste_trend","downtime_trend","last_shift","cost_insight","shift_waste",
                "findings","ranking","actions","summary","detail","cause_action_map",
                "impact","issue","severity","confidence","detected",
                "alerts","waste_alert","waste_alerts","alerts_dt","alerts_waste"}
    if any(k in d for k in our_keys):
        if not any(k in d for k in our_keys): print(f"[supervisor]   NOT our schema: {list(d.keys())[:5]}")
        return d
    for wrapper in ["dashboard","result","data","response","output","insights","content"]:
        if wrapper in d and isinstance(d[wrapper], dict):
            return _map_supervisor_schema(d[wrapper])
    return d
