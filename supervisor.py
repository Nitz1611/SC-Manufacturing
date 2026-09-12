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
            for text in reversed(all_texts):
                if "{" in text and "key_insights" in text:
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

    # Already our schema
    if any(k in d for k in ["key_insights","observations","kpis","narrative"]):
        return d

    print(f"[supervisor]    unknown keys: {list(d.keys())}")
    return d


def _parse(raw):
    text = raw.strip() if isinstance(raw, str) else str(raw)

    # Try direct JSON parse first
    try:
        d = json.loads(text)
        if isinstance(d, dict):
            print(f"[supervisor]    direct parse keys: {list(d.keys())}")
            return _unwrap(d)
    except Exception:
        pass

    # Strip markdown fences
    cleaned = re.sub(r"```json\s*|```\s*", "", text).strip()

    # Find ALL JSON objects in the text — pick the largest valid one
    # (handles cases where Genie returns table data + JSON mixed)
    best = None
    best_len = 0
    # Find all { } blocks
    depth = 0
    start = None
    for i, ch in enumerate(cleaned):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                candidate = cleaned[start:i+1]
                if len(candidate) > best_len:
                    try:
                        d = json.loads(candidate)
                        if isinstance(d, dict) and len(d) > 0:
                            best = d
                            best_len = len(candidate)
                    except Exception:
                        pass

    if best:
        print(f"[supervisor]    parsed keys: {list(best.keys())}")
        return _unwrap(best)

    print("[supervisor]    plain text response")
    return {"narrative": cleaned[:500]}


import concurrent.futures

# ─────────────────────────────────────────────────────────────────
# INDIVIDUAL QUESTIONS — one per Supervisor call, run in parallel
# Each question is small enough to finish well under 290s
# ─────────────────────────────────────────────────────────────────
QUESTIONS = {
    "waste_kpi": (
        "pgt_waste_pct_composite_metric_view",
        "What is current week Waste_Pct (WST_LBS/(PRODC_LBS+WST_LBS))? "
        "What was prior week Waste_Pct? What is the WoW delta? Is it above 5% target? "
        "Also get current OEE from pgt_plnt_effcncy_metric_view. "
        'Return JSON: {"waste_pct":{"value":"X.X%","delta":"↑/↓ X.Xpp vs prior week","direction":"bad|good|warn"},'
        '"oee":{"value":"XX.X%","delta":"↑/↓ X.Xpp vs 80% target","direction":"bad|good|warn"},'
        '"insight":"[one decision sentence: waste level + vs target + trend + what manager should know]"}'
    ),
    "downtime_kpi": (
        "pgt_plnt_prodtn_metric_view",
        "What is current week Total_Unplanned_Downtime_Pct? Prior week value? WoW delta? "
        "Is it above 5% target? What is current STOPS count vs prior week? "
        'Return JSON: {"downtime_pct":{"value":"X.X%","delta":"↑/↓ X.Xpp vs prior week","direction":"bad|good|warn"},'
        '"stops":{"value":"XXX","delta":"↑/↓ XX vs prior week","direction":"bad|good|warn"},'
        '"insight":"[one decision sentence: DT level + vs target + urgency for manager]"}'
    ),
    "downtime_reasons": (
        "pgt_plnt_prodtn_metric_view",
        "Using columns RSN, RSN3, RSN4, Total_Unplanned_Downtime_Hours, Line: "
        "What are the top 3 downtime reasons by hours? For each: exact RSN name, hours, % of total unplanned DT, which line it hit hardest. "
        "Also get top 4 lines by % share of Total_Unplanned_Downtime_Hours. "
        'Return JSON: {"downtime_bullets":['
        '{"text":"[RSN cause] caused [X]h ([X]% of unplanned DT) on [Line] — [what manager should check]","pct":0},'
        '{"text":"[RSN3 cause] [X]h ([X]%) — [specific implication]","pct":0},'
        '{"text":"[RSN4/dept] [X]h ([X]%) — [context]","pct":0}],'
        '"line_contributions":[{"line":"[name]","pct":0,"color":"red"},{"line":"[name]","pct":0,"color":"gray"},{"line":"[name]","pct":0,"color":"gray"},{"line":"Others","pct":0,"color":"gray"}],'
        '"insight":"[one sentence: fix RSN X on Line Y first — it drives X% of all unplanned DT]"}'
    ),
    "waste_breakdown": (
        "pgt_plnt_prodtn_evnt_metric_view",
        "Using columns WST_TYP, SECRY_AREA, WST_LBS, WST_CST, SHIFT_KEY, DEPT_CD, SHAPE_CD: "
        "Top 3 waste types (WST_TYP) by WST_LBS — name, lbs, % of total. "
        "Processing vs Packaging split by DEPT_CD/SECRY_AREA. "
        "Highest vs lowest waste shift (SHIFT_KEY). "
        "Top product class (SHAPE_CD) by WST_CST cost. "
        'Return JSON: {"waste_bullets":['
        '{"text":"[WST_TYP name] is [X]% of waste ([X]lbs) on [area/line] — [what it means]","pct":0},'
        '{"text":"[2nd WST_TYP] [X]% ([X]lbs) — [implication]","pct":0},'
        '{"text":"Processing [X]% vs Packaging [X]% — [which to focus on and why]","pct":0}],'
        '"insight":"[one sentence: top WST_TYP + where + what to fix]",'
        '"cost_insight":"[SHAPE_CD] $[X,XXX] waste cost — [X]% of total.",'
        '"shift_waste":"[Shift X] [X.X%] vs [Shift Y] [X.X%] — [Xpp] gap."}'
    ),
    "shift_analysis": (
        "pgt_plnt_prodtn_metric_view",
        "Using columns SHIFT_KEY (1=Shift A, 2=Shift B, 3=Shift C), STRT_DT, "
        "Total_Unplanned_Downtime_Hours, Total_Downtime_Pct, Comment_Text: "
        "Avg Total_Unplanned_Downtime_Hours per shift. "
        "Most recent shift: name, DT%, vs 5% target, won or lost. "
        "Top 2 themes from Comment_Text — what operators are flagging. "
        'Return JSON: {"shift_comparison":[{"shift":"Shift A","hours":0.0,"color":"#3B6FD4"},{"shift":"Shift B","hours":0.0,"color":"#E04444"},{"shift":"Shift C","hours":0.0,"color":"#3B6FD4"}],'
        '"last_shift":{"name":"Shift A|B|C","dt_pct":"X.X%","target":"5%","won":true},'
        '"observations":["[PREDICTIVE: shift/day pattern with numbers]","[DIAGNOSTIC: operator Comment_Text theme with specific language]","[PRESCRIPTIVE: one action to fix the pattern]"],'
        '"insight":"[one sentence: last shift result — won/lost + by how much]"}'
    ),
    "waste_trend": (
        "pgt_waste_pct_composite_metric_view",
        "Weekly Waste_Pct for last 6 weeks grouped by STRT_DT week. Label W1 to W6 oldest to newest. "
        "Is trend rising, falling, or spiked? Project W7 if trend continues. "
        'Return JSON: {"waste_trend":{"labels":["W1","W2","W3","W4","W5","W6"],"data":[0.0,0.0,0.0,0.0,0.0,0.0],'
        '"anomaly_week":"ANOMALY: WX or CRITICAL TREND",'
        '"anomaly_label":"[PREDICTIVE: W7 projected at X.X% — will/will not breach 5% target]",'
        '"severity":"anomaly|critical|warn"}}'
    ),
    "downtime_trend": (
        "pgt_plnt_prodtn_metric_view",
        "Weekly Total_Unplanned_Downtime_Hours for last 5 weeks grouped by STRT_DT week. Label W1 to W5. "
        "Is trend rising, falling, or spiked? Project W6 if trend continues. "
        'Return JSON: {"downtime_trend":{"labels":["W1","W2","W3","W4","W5"],"data":[0.0,0.0,0.0,0.0,0.0],'
        '"anomaly_week":"CRITICAL TREND or ANOMALY: WX",'
        '"anomaly_label":"[PREDICTIVE: W6 projected at X.Xh — will/will not miss monthly target]",'
        '"severity":"anomaly|critical|warn"}}'
    ),
    "opportunities": (
        "pgt_plnt_prodtn_metric_view,pgt_plnt_prodtn_evnt_metric_view",
        "Based on waste and downtime data: top 3 specific improvement actions a manager can assign TODAY. "
        "Each action must name the actual line, machine, or shift from the data. "
        "Not generic — e.g. Recalibrate Line 3 Portioner, not Reduce Waste. "
        'Return JSON: {"opportunities":['
        '{"title":"[specific verb + actual asset from data]","delta":"-X.Xpp Waste","color":"good"},'
        '{"title":"[specific action for top RSN]","delta":"-X.Xpp Downtime","color":"warn"},'
        '{"title":"[specific action for shift gap]","delta":"-X.Xpp","color":"good"}]}'
    ),
}


def _call_one_question(q_key: str, view: str, question: str, ctx: str) -> dict:
    """Call Supervisor with one focused question. Returns partial dict."""
    prompt = (
        f"You are a manufacturing analytics supervisor agent.\n"
        f"Filters: {ctx}\n"
        f"View: {view}\n\n"
        f"{question}\n\n"
        f"Return ONLY valid JSON — no text before or after."
    )
    print(f"[supervisor] question={q_key}")
    try:
        raw    = _call_supervisor([{"role": "user", "content": prompt}])
        parsed = _parse(raw)
        if "narrative" in parsed and len(parsed) == 1:
            print(f"[supervisor]   {q_key} → plain text, skipping")
            return {}
        mapped = _map_supervisor_schema(parsed)
        print(f"[supervisor]   {q_key} → keys: {list(mapped.keys())}")
        return mapped
    except Exception as e:
        print(f"[supervisor]   {q_key} → failed: {e}")
        return {}


def get_dashboard_parallel(filters: dict) -> dict:
    """
    Run all questions in parallel — each is one small Supervisor call.
    Each call finishes in ~30-60s (well under 290s limit).
    All run simultaneously so total time = slowest single question.
    """
    ctx = ", ".join(f"{k}={v}" for k,v in filters.items() if v) or "all sites, current week"
    print(f"[supervisor] PARALLEL mode — {len(QUESTIONS)} questions running simultaneously")

    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(QUESTIONS)) as executor:
        futures = {
            executor.submit(_call_one_question, key, view, question, ctx): key
            for key, (view, question) in QUESTIONS.items()
        }
        for future in concurrent.futures.as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as e:
                print(f"[supervisor]   {key} future failed: {e}")
                results[key] = {}

    # Merge all results
    merged = {}
    for r in results.values():
        merged.update(r)

    # Collect all insights from every question
    all_insights = []
    colors = ["red","blue","amber","green","red","blue","amber","green"]
    for i, key in enumerate(QUESTIONS.keys()):
        insight_text = results.get(key, {}).get("insight", "")
        if insight_text:
            all_insights.append({
                "text":  insight_text[:120],
                "color": colors[i % len(colors)]
            })

    # Also include any key_insights the Supervisor put in merged
    for ki in (merged.get("key_insights") or []):
        if isinstance(ki, dict) and ki.get("text"):
            if not any(a["text"] == ki["text"] for a in all_insights):
                all_insights.append(ki)

    merged["key_insights"] = all_insights

    # Build final dashboard
    dashboard = {
        "kpis": {
            "waste_pct":    merged.get("waste_pct",    {"value":"","delta":"","direction":"warn"}),
            "downtime_pct": merged.get("downtime_pct", {"value":"","delta":"","direction":"warn"}),
            "oee":          merged.get("oee",           {"value":"","delta":"","direction":"warn"}),
            "stops":        merged.get("stops",         {"value":"","delta":"","direction":"warn"}),
        },
        "key_insights":      merged.get("key_insights",      []),
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

    print(f"[supervisor] PARALLEL done — {len(dashboard['key_insights'])} insights from {len(QUESTIONS)} questions")
    return _sanitise(dashboard)


def _build_dashboard_prompt(filters):
    ctx = ", ".join(f"{k}={v}" for k,v in filters.items() if v) or "all sites, current week"

    if QUERY_MODE == "minimal":
        print("[supervisor] MINIMAL mode - focused insights")
        return (
            "You are a manufacturing analytics supervisor agent for a PGT/Frito-Lay plant.\n"
            f"Filters: {ctx}\n\n"
            "Query Genie using these views:\n"
            "  pgt_plnt_prodtn_metric_view (RSN, RSN3, RSN4, Comment_Text, SHIFT_KEY, STRT_DT,\n"
            "    Total_Unplanned_Downtime_Hours, Total_Unplanned_Downtime_Pct, Line, Department)\n"
            "  pgt_plnt_prodtn_evnt_metric_view (WST_TYP, SECRY_AREA, WST_LBS, WST_CST, SHIFT_KEY)\n"
            "  pgt_waste_pct_composite_metric_view (Waste_Pct)\n\n"
            "Answer these questions from live Genie data:\n"
            "  1. Current Waste_Pct vs prior week and vs 5% target\n"
            "  2. Top downtime reason (RSN) — hours and % of total unplanned DT\n"
            "  3. Which line has highest unplanned DT — hours and % share\n"
            "  4. Top waste type (WST_TYP) — lbs and % of total waste\n"
            "  5. Top 2 themes from Comment_Text — what operators are flagging\n"
            "  6. Most recent shift result vs 5% target — won or lost\n\n"
            "INSIGHT WRITING RULES:\n"
            "Return as many key_insights as you have answers — do NOT limit to 4.\n"
            "Each insight must be a SHORT decision-making sentence (max 120 chars).\n"
            "Tell the manager: what is the problem + where + what to do.\n"
            "Not just numbers — include the WHY and the SO WHAT.\n"
            "Example good insight: Line 3 lost 12.4h to Mechanical failure (RSN:MECH) — check portioner before Shift B.\n"
            "Example bad insight: Waste this week is 8.4%.\n\n"
            "Return ONLY valid JSON:\n"
            '{"kpis":{"waste_pct":{"value":"X.X%","delta":"↑/↓ X.Xpp vs prior week","direction":"bad|good|warn"},"downtime_pct":{"value":"X.X%","delta":"↑/↓ X.Xpp","direction":"bad|good|warn"},"oee":{"value":"XX.X%","delta":"↑/↓ X.Xpp","direction":"bad|good|warn"},"stops":{"value":"XXX","delta":"↑/↓ XX","direction":"bad|good|warn"}},'
            '"key_insights":['
            '{"text":"[decision sentence: what + where + action needed — max 120 chars]","color":"red|blue|amber|green"},'
            '{"text":"[decision sentence]","color":"..."},'
            '{"text":"[decision sentence]","color":"..."},'
            '{"text":"[decision sentence]","color":"..."},'
            '{"text":"[add more if you have more answers — do not stop at 4]","color":"..."}'
            '],'
            '"waste_bullets":[{"text":"[DIAGNOSTIC: WST_TYP + lbs + % + what it means]","pct":0},{"text":"[2nd type]","pct":0},{"text":"[Processing vs Packaging split]","pct":0}],'
            '"downtime_bullets":[{"text":"[DIAGNOSTIC: RSN cause + hours + % + line]","pct":0},{"text":"[2nd reason]","pct":0},{"text":"[3rd reason or Comment_Text theme]","pct":0}],'
            '"line_contributions":[{"line":"[top line]","pct":0,"color":"red"},{"line":"[2nd]","pct":0,"color":"gray"},{"line":"[3rd]","pct":0,"color":"gray"},{"line":"Others","pct":0,"color":"gray"}],'
            '"shift_comparison":[{"shift":"Shift A","hours":0.0,"color":"#3B6FD4"},{"shift":"Shift B","hours":0.0,"color":"#E04444"},{"shift":"Shift C","hours":0.0,"color":"#3B6FD4"}],'
            '"waste_trend":{"labels":[],"data":[],"anomaly_week":"","anomaly_label":"","severity":"warn"},'
            '"downtime_trend":{"labels":[],"data":[],"anomaly_week":"","anomaly_label":"","severity":"warn"},'
            '"observations":["[PREDICTIVE pattern]","[DIAGNOSTIC from Comment_Text with operator language]","[PRESCRIPTIVE action]"],'
            '"opportunities":[{"title":"[specific action + asset]","delta":"-X.Xpp","color":"good"},{"title":"[specific action]","delta":"-X.Xpp","color":"warn"},{"title":"[specific action]","delta":"-X.Xpp","color":"good"}]}'
        )

    print("[supervisor] FULL mode - decision-making insights")
    return (
        "You are a manufacturing analytics supervisor agent for a PGT/Frito-Lay plant.\n"
        "Your output will be read by a plant manager making operational decisions today.\n"
        f"Filters: {ctx}\n\n"

        "VIEWS IN GENIE:\n"
        "  pgt_plnt_prodtn_metric_view: Region,Site,Plant,Department,Department_Type,Line,Shape,Product,\n"
        "    SHIFT_KEY,STRT_DT,Run_Hours,Scheduled_Hours,Total_Downtime_Hours,Total_Downtime_Pct,\n"
        "    Total_Unplanned_Downtime_Hours,Total_Unplanned_Downtime_Pct,RSN,RSN3,RSN4,Comment_Text,STOPS,MTTR,MTBF\n"
        "  pgt_plnt_prodtn_evnt_metric_view: PU_ID,STRT_DT,SHIFT_KEY,DEPT_CD,SHAPE_CD,\n"
        "    PRODC_LBS,WST_CST,WST_DLLR,WST_LBS,WST_TYP,SECRY_AREA,RSN,\n"
        "    FRYR_OIL_ACTL_PCTG,SPRAY_OIL_ACTL_PCTG,SSNG_ACTL_PCTG,Actual_Usage,Theoretical_Usage\n"
        "  pgt_plnt_effcncy_metric_view: OEE,Quality,Performance,Actual_Rate,Nameplate_Rate\n"
        "  pgt_waste_pct_composite_metric_view: Waste_Pct=WST_LBS/(PRODC_LBS+WST_LBS)\n\n"

        "QUERY GENIE AND ANSWER ALL OF THESE:\n\n"

        "DOWNTIME QUESTIONS:\n"
        "DT1. Current Total_Unplanned_Downtime_Pct vs prior week. WoW delta. Is it above 5% target? By how much?\n"
        "DT2. Top 3 downtime reasons (RSN,RSN3,RSN4) by Total_Unplanned_Downtime_Hours.\n"
        "     For each: exact RSN name, hours, % of total unplanned DT, which line it hit hardest.\n"
        "DT3. Top 4 lines by Total_Unplanned_Downtime_Hours % share.\n"
        "DT4. Top 3 themes from Comment_Text — what operators are flagging most this period.\n"
        "DT5. Weekly Total_Unplanned_Downtime_Hours for last 5 weeks (W1 oldest, W5 newest).\n"
        "     Is the trend rising, falling, or spiked? Project W6 if trend continues.\n"
        "DT6. Most recent shift (SHIFT_KEY): name, DT%, vs 5% target, won or lost?\n"
        "DT7. Avg Total_Unplanned_Downtime_Hours per shift (SHIFT_KEY 1=A, 2=B, 3=C).\n\n"

        "WASTE QUESTIONS:\n"
        "WS1. Current Waste_Pct vs 5% target and prior week WoW delta.\n"
        "WS2. Top 3 waste types (WST_TYP) by WST_LBS — name, lbs, % of total waste.\n"
        "WS3. Processing vs Packaging waste split by DEPT_CD/SECRY_AREA — % each.\n"
        "WS4. Highest vs lowest waste shift (SHIFT_KEY) — waste% each, gap between them.\n"
        "WS5. Top product class (SHAPE_CD) by WST_CST — name and $ amount.\n"
        "WS6. Weekly Waste_Pct for last 6 weeks (W1 oldest, W6 newest). Project W7.\n"
        "WS7. Current OEE vs 80% target. Is Quality or Performance the bigger drag?\n\n"

        "INSIGHT WRITING RULES — follow exactly:\n"
        "key_insights: 4 short sentences a manager reads in 3 seconds each. Max 110 chars each.\n"
        "  Each must answer: what is happening + is it a problem + what to do.\n"
        "  Insight 1 (red):   DT level + vs target + urgency. E.g. Line 3 DT hit 7.2% — 44% above target, needs action before Shift B.\n"
        "  Insight 2 (blue):  Top RSN cause + hours + line. E.g. Mechanical failure (RSN:MECH) caused 12.4h on Line 3 — check portioner.\n"
        "  Insight 3 (amber): Waste level + top WST_TYP driver. E.g. Waste 8.4% — PKG film (42% of waste) on Line 3 sealing station.\n"
        "  Insight 4 (green): Last shift result. E.g. Shift B DT 7.8% — lost vs 5% target, 3rd consecutive loss.\n"
        "downtime_bullets: 3 DIAGNOSTIC sentences. Each answers WHERE + WHAT RSN + HOW MANY HOURS. Max 130 chars.\n"
        "  E.g. Line 3 lost 12.4h to Mechanical failure (RSN:MECH) — 38% of all unplanned DT this week.\n"
        "waste_bullets: 3 DIAGNOSTIC sentences. Each answers WHICH WST_TYP + WHERE + WHAT IT MEANS. Max 130 chars.\n"
        "  E.g. Packaging Film (WST_TYP:PKG) is 42% of waste (8,240lbs) on Line 3 sealing — check film tension spec.\n"
        "observations: 3 sentences — one PREDICTIVE, one DIAGNOSTIC (operator language), one PRESCRIPTIVE. Max 130 chars each.\n"
        "  obs[0] PREDICTIVE: pattern that will repeat. E.g. Shift B Monday DT averages 8.3% vs 5.1% rest of week — repeating 4 weeks.\n"
        "  obs[1] DIAGNOSTIC: what operators say in Comment_Text. Quote specific language. E.g. Operators flagged portioner vibration 14x this week.\n"
        "  obs[2] PRESCRIPTIVE: one specific action. E.g. Standardise Shift B Monday handover — closes 1.2pp DT gap based on data.\n"
        "opportunities: 3 PRESCRIPTIVE actions. Title must name the actual line/machine/shift from data. Max 50 chars title.\n"
        "  E.g. Recalibrate Line 3 Portioner Unit — not generic like Reduce Waste.\n"
        "anomaly_label for trends: PREDICTIVE — what will happen next week. E.g. W6 projected at 14.2h — misses monthly target.\n\n"

        "Return ONLY valid JSON — no text before or after:\n"
        '{"kpis":{' 
        '"waste_pct":{"value":"X.X%","delta":"↑/↓ X.Xpp vs prior week","direction":"bad|good|warn"},'
        '"downtime_pct":{"value":"X.X%","delta":"↑/↓ X.Xpp vs prior week","direction":"bad|good|warn"},'
        '"oee":{"value":"XX.X%","delta":"↑/↓ X.Xpp vs 80% target","direction":"bad|good|warn"},'
        '"stops":{"value":"XXX","delta":"↑/↓ XX vs prior week","direction":"bad|good|warn"}},'
        '"key_insights":['
        '{"text":"[DESCRIPTIVE: DT level + vs target + urgency — max 110 chars]","color":"red"},'
        '{"text":"[DIAGNOSTIC: top RSN cause + hours + line — max 110 chars]","color":"blue"},'
        '{"text":"[DESCRIPTIVE: waste level + top WST_TYP driver — max 110 chars]","color":"amber"},'
        '{"text":"[DESCRIPTIVE: last shift result — max 110 chars]","color":"green"}'
        '],'
        '"waste_bullets":['
        '{"text":"[DIAGNOSTIC: WST_TYP name + lbs + % + what it means for operations]","pct":0},'
        '{"text":"[DIAGNOSTIC: 2nd WST_TYP + context]","pct":0},'
        '{"text":"[DIAGNOSTIC: Processing X% vs Packaging Y% — which area to focus]","pct":0}'
        '],'
        '"downtime_bullets":['
        '{"text":"[DIAGNOSTIC: Line X lost Xh to RSN cause — X% of all unplanned DT]","pct":0},'
        '{"text":"[DIAGNOSTIC: RSN3 cause + hours + % + where concentrated]","pct":0},'
        '{"text":"[DIAGNOSTIC: 3rd reason + hours + % + operational context]","pct":0}'
        '],'
        '"line_contributions":['
        '{"line":"[top line name]","pct":0,"color":"red"},'
        '{"line":"[2nd line]","pct":0,"color":"gray"},'
        '{"line":"[3rd line]","pct":0,"color":"gray"},'
        '{"line":"Others","pct":0,"color":"gray"}'
        '],'
        '"shift_comparison":['
        '{"shift":"Shift A","hours":0.0,"color":"#3B6FD4"},'
        '{"shift":"Shift B","hours":0.0,"color":"#E04444"},'
        '{"shift":"Shift C","hours":0.0,"color":"#3B6FD4"}'
        '],'
        '"waste_trend":{"labels":["W1","W2","W3","W4","W5","W6"],"data":[0.0,0.0,0.0,0.0,0.0,0.0],'
        '"anomaly_week":"ANOMALY: WX or CRITICAL TREND","anomaly_label":"[PREDICTIVE: W7 projection — will/will not breach target]","severity":"anomaly|critical|warn"},'
        '"downtime_trend":{"labels":["W1","W2","W3","W4","W5"],"data":[0.0,0.0,0.0,0.0,0.0],'
        '"anomaly_week":"CRITICAL TREND or ANOMALY: WX","anomaly_label":"[PREDICTIVE: W6 projection — what happens if no action]","severity":"anomaly|critical|warn"},'
        '"observations":['
        '"[PREDICTIVE: shift/day pattern that will repeat — with specific numbers]",'
        '"[DIAGNOSTIC: what operators say in Comment_Text — specific language and count]",'
        '"[PRESCRIPTIVE: one specific action naming actual line/machine/shift from data]"'
        '],'
        '"opportunities":['
        '{"title":"[specific verb + actual line/machine from data]","delta":"-X.Xpp Waste","color":"good"},'
        '{"title":"[specific action for top RSN driver]","delta":"-X.Xpp Downtime","color":"warn"},'
        '{"title":"[specific action for shift or line gap]","delta":"-X.Xpp Waste or Downtime","color":"good"}'
        ']}' 
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

    def kpi(k):
        if not isinstance(k,dict): return {"value":"","delta":"","direction":"warn"}
        return {"value":_ss(k.get("value",""),20),"delta":_ss(k.get("delta",""),50),
                "direction":k.get("direction","warn") if k.get("direction") in vd else "warn"}

    rk=d.get("kpis") or {}
    return {
        "kpis":{k:kpi(rk.get(k,{})) for k in ["waste_pct","downtime_pct","downtime_hrs","oee","stops"]},
        "key_insights":     [x for x in map(ins,(d.get("key_insights") or [])) if x],  # no limit
        "waste_bullets":    [x for x in map(bul,(d.get("waste_bullets") or [])[:3]) if x],
        "downtime_bullets": [x for x in map(bul,(d.get("downtime_bullets") or [])[:3]) if x],
        "line_contributions":[x for x in map(lin,(d.get("line_contributions") or [])[:4]) if x],
        "shift_comparison": [x for x in map(shf,(d.get("shift_comparison") or [])[:3]) if x],
        "waste_trend":    trd(d.get("waste_trend"),6),
        "downtime_trend": trd(d.get("downtime_trend"),5),
        "observations":   [_ss(o,200) for o in (d.get("observations") or [])[:3] if isinstance(o,str) and o.strip()],
        "opportunities":  [x for x in map(opp,(d.get("opportunities") or [])[:3]) if x],
    }


def get_dashboard(filters):
    if QUERY_MODE in ("parallel", "split"):
        return get_dashboard_parallel(filters)
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
    # Map Supervisor's own schema to ours if needed
    d = _map_supervisor_schema(d)
    r = _sanitise(d)
    print(f"[supervisor] insights={len(r['key_insights'])} waste={len(r['waste_bullets'])} dt={len(r['downtime_bullets'])}")
    return r


def ask_question(question, filters):
    raw=_call_supervisor([{"role":"user","content":_build_ask_prompt(question,filters)}])
    d=_parse(raw)
    return d.get("narrative") or raw or "No answer returned."


# ─────────────────────────────────────────────────────────────────
# MAP — handles cases where Supervisor returns its own schema
# Maps any unknown keys to our dashboard fields
# ─────────────────────────────────────────────────────────────────
def _map_supervisor_schema(d: dict) -> dict:
    """Convert Supervisor's own key names to our dashboard schema."""
    # Already our schema — return as-is
    our_keys = {"key_insights","waste_bullets","downtime_bullets","kpis",
                "downtime_pct","waste_pct","stops","oee",
                "shift_comparison","line_contributions","observations","opportunities",
                "waste_trend","downtime_trend","insight",
                "last_shift","cost_insight","shift_waste",
                "findings","ranking","actions","summary","detail",
                "cause_action_map","impact","line_contributions"}
    if any(k in d for k in our_keys):
        print(f"[supervisor]   recognised our schema — returning as-is: {list(d.keys())}")
        return d  # already our schema — never remap

    # Wrapper key — unwrap first
    for wrapper in ["dashboard","result","data","response","output","insights","content"]:
        if wrapper in d and isinstance(d[wrapper], dict):
            print(f"[supervisor]   unwrapping wrapper: {wrapper!r}")
            return _map_supervisor_schema(d[wrapper])

    print(f"[supervisor]   mapping unknown schema: {list(d.keys())}")
    mapped = {}

    # headline_insight / headline → key_insights
    hi = d.get("headline_insight") or d.get("headline") or ""
    if isinstance(hi, str) and hi:
        mapped["key_insights"] = [{"text": hi[:120], "color": "red"}]
    elif isinstance(hi, list):
        mapped["key_insights"] = [{"text": str(i.get("text") or i.get("insight") or i)[:120], "color": i.get("color","blue") if isinstance(i,dict) else "blue"} for i in hi[:4]]

    # key_metrics → kpis
    km = d.get("key_metrics") or d.get("metrics") or {}
    if km:
        mapped["kpis"] = {}
        for src, dst in [("waste_pct","waste_pct"),("waste","waste_pct"),("downtime_pct","downtime_pct"),
                          ("downtime","downtime_pct"),("oee","oee"),("stops","stops")]:
            if src in km:
                v = km[src]
                mapped["kpis"][dst] = {"value": str(v.get("value") or v.get("current") or v or ""),
                                        "delta": str(v.get("delta") or v.get("change") or ""),
                                        "direction": v.get("direction","warn") if isinstance(v,dict) else "warn"}

    # top_drivers → bullets
    td = d.get("top_drivers") or d.get("drivers") or []
    if isinstance(td, list):
        dt_b, ws_b = [], []
        for item in td:
            if not isinstance(item, dict): continue
            text = str(item.get("description") or item.get("text") or item.get("driver") or "")
            pct  = 0
            try: pct = int(float(str(item.get("pct") or item.get("contribution") or 0).replace("%","")))
            except: pass
            cat = str(item.get("category") or item.get("type") or "").lower()
            (ws_b if any(w in cat for w in ["waste","yield","wst"]) else dt_b).append({"text":text,"pct":pct})
        if not dt_b and not ws_b:
            mid = len(td)//2
            dt_b = [{"text": str(i.get("description") or i.get("text") or ""), "pct":0} for i in td[:mid]]
            ws_b = [{"text": str(i.get("description") or i.get("text") or ""), "pct":0} for i in td[mid:]]
        mapped["downtime_bullets"] = dt_b[:3]
        mapped["waste_bullets"]    = ws_b[:3]

    # recommended_actions → opportunities
    ra = d.get("recommended_actions") or d.get("recommendations") or d.get("actions") or []
    if isinstance(ra, list):
        mapped["opportunities"] = []
        for item in ra[:3]:
            if not isinstance(item, dict): continue
            title = str(item.get("action") or item.get("title") or item.get("recommendation") or "")
            delta = str(item.get("impact") or item.get("delta") or "")
            if title:
                mapped["opportunities"].append({"title":title[:50],"delta":delta[:30],"color":"good" if "waste" in delta.lower() else "warn"})

    # site_details / observations
    sd = d.get("site_details") or d.get("observations") or d.get("insights") or []
    if isinstance(sd, list):
        mapped["observations"] = [str(i.get("observation") or i.get("insight") or i.get("text") or i)[:200] for i in sd[:3] if i]
    elif isinstance(sd, dict):
        mapped["observations"] = [str(v)[:200] for v in list(sd.values())[:3] if v]

    # summary / narrative → observations fallback
    for key in ["summary","analysis","narrative"]:
        val = d.get(key)
        if val and isinstance(val, str) and val.strip():
            if "observations" not in mapped: mapped["observations"] = []
            mapped["observations"].insert(0, val.strip()[:200])

    # metadata → key_insights fallback
    if not mapped.get("key_insights"):
        meta = d.get("metadata") or {}
        if isinstance(meta, dict):
            s = meta.get("summary") or meta.get("description") or ""
            if s: mapped["key_insights"] = [{"text": str(s)[:120], "color":"blue"}]

    print(f"[supervisor]   mapped to: {list(mapped.keys())}")
    return mapped


# ─────────────────────────────────────────────────────────────────
# Root Cause Analysis
# ─────────────────────────────────────────────────────────────────
def _build_rca_prompt(filters: dict, kpi_focus: str = "auto") -> str:
    ctx = ", ".join(f"{k}={v}" for k,v in filters.items() if v) or "all sites, current week"
    if kpi_focus == "auto":
        detect = (
            "Step 1: Query Genie to find the KPI most off-target right now. "
            "Check Total_Unplanned_Downtime_Pct vs 5% target, "
            "Waste_Pct vs 5% target, OEE vs 80% target. "
            "Pick the worst one. Set issue = its name. "
        )
    else:
        detect = f"Analyse root cause for: {kpi_focus}. Set issue = {kpi_focus}. "

    return (
        "You are a manufacturing analytics supervisor. "
        "Output will be read by a plant manager who needs to make decisions, not read reports. "
        f"Filters: {ctx}\n\n"
        f"{detect}\n"
        "Step 2: Query all relevant views. "
        "pgt_plnt_prodtn_metric_view (RSN,RSN3,RSN4,Comment_Text,SHIFT_KEY,STRT_DT,Line,"
        "Total_Unplanned_Downtime_Hours,Total_Unplanned_Downtime_Pct,Total_Downtime_Pct,STOPS,MTTR). "
        "pgt_plnt_prodtn_evnt_metric_view (WST_TYP,SECRY_AREA,RSN,WST_LBS,WST_CST,SHIFT_KEY,DEPT_CD,SHAPE_CD). "
        "pgt_plnt_effcncy_metric_view (OEE,Quality,Performance). "
        "pgt_waste_pct_composite_metric_view (Waste_Pct). "
        "Step 3: Return ONLY valid JSON. Every value from Genie data — no placeholders. "
        "Writing rules: summary = 2 sentences (what is the problem + what is causing it). "
        "cause_action_map: cause = exact RSN/WST_TYP from data, action = specific thing to do tomorrow. "
        "actions: name the specific line, machine, or shift in each recommendation. "
        '{"issue":"[KPI name]",'
        '"severity":"Critical|High|Medium|Low",'
        '"confidence":"XX%",'
        '"detected":"[STRT_DT date]",'
        '"summary":"[Sentence 1: problem + scale. Sentence 2: root cause.]",'
        '"findings":{"primary_contributor":"[exact RSN or WST_TYP]","primary_pct":"XX%","impacted_asset":"[specific line/machine]","highest_shift":"[Shift A|B|C]","largest_category":"[actual value]","observed_since":"[date]"},'
        '"cause_action_map":[{"cause":"[exact cause]","action":"[specific action tomorrow]"},{"cause":"[exact cause]","action":"[specific action]"},{"cause":"[exact cause]","action":"[specific action]"},{"cause":"[exact cause]","action":"[specific action]"}],'
        '"impact":{"metric1_label":"[metric]","metric1_value":"↓ X.Xpp","metric2_label":"[metric]","metric2_value":"↓ X%","metric3_label":"[metric]","metric3_value":"↓ X%","actions_pending":"X of X"},'
        '"detail":{"Observed":"[timeframe]","Affected Asset":"[line/machine]","Operational Impact":"[phrase from Comment_Text]","Category":"[WST_TYP or RSN]","Contribution":"XX%","Priority":"High|Medium|Low"},'
        '"ranking":[{"cause":"[from data]","pct":"XX%"},{"cause":"[from data]","pct":"XX%"},{"cause":"[from data]","pct":"XX%"},{"cause":"[from data]","pct":"XX%"}],'
        '"actions":[{"recommendation":"[specific action naming line/machine/shift]","addresses":"[root cause]","impact":"[e.g. Reduce Waste 1.1pp]","status":"High"},{"recommendation":"[specific action]","addresses":"[root cause]","impact":"[impact]","status":"High"},{"recommendation":"[specific action]","addresses":"[root cause]","impact":"[impact]","status":"Medium"},{"recommendation":"[specific action]","addresses":"[root cause]","impact":"[impact]","status":"Low"}]}'
    )


# ─────────────────────────────────────────────────────────────────
# RCA QUESTIONS — parallel calls, each finishes under 290s
# ─────────────────────────────────────────────────────────────────
def _build_rca_questions(filters: dict, kpi_focus: str) -> dict:
    ctx = ", ".join(f"{k}={v}" for k,v in filters.items() if v) or "all sites, current week"

    if kpi_focus == "auto":
        detect = (
            "First query Genie to find which KPI is most off-target: "
            "Total_Unplanned_Downtime_Pct vs 5% target, Waste_Pct vs 5% target, OEE vs 80% target. "
            "Use the worst one as the focus. "
        )
        issue_default = "Auto-detected"
    else:
        detect = f"Focus on: {kpi_focus}. "
        issue_default = kpi_focus

    return {
        "rca_detection": (
            "pgt_plnt_prodtn_metric_view,pgt_waste_pct_composite_metric_view,pgt_plnt_effcncy_metric_view",
            f"Filters: {ctx}. {detect}"
            "What is the current value of the selected KPI vs its target? By how much is it off? "
            "When was it first detected above target (use STRT_DT)? "
            "What is confidence level (%) in this analysis based on data completeness? "
            f'Return JSON: {{"issue":"{issue_default if kpi_focus != "auto" else "[KPI name you selected]"}",'
            '"severity":"Critical|High|Medium|Low",'
            '"confidence":"XX%",'
            '"detected":"[STRT_DT date]",'
            '"summary":"[Sentence 1: what is the problem and scale. Sentence 2: primary root cause from data.]"}}'
        ),
        "rca_root_causes": (
            "pgt_plnt_prodtn_metric_view,pgt_plnt_prodtn_evnt_metric_view",
            f"Filters: {ctx}. "
            "Find the top 4 root causes of the current KPI gap. "
            "Use RSN, RSN3, RSN4 for downtime causes. Use WST_TYP, SECRY_AREA for waste causes. "
            "For each cause: exact name from data, % contribution, which line/asset it affects most. "
            "Which line or machine is most impacted? Which shift (SHIFT_KEY) has highest impact? "
            "What is the largest contributing category (WST_TYP or RSN value)? "
            'Return JSON: {"findings":{"primary_contributor":"[exact RSN or WST_TYP]","primary_pct":"XX%",'
            '"impacted_asset":"[specific line/machine]","highest_shift":"[Shift A|B|C]",'
            '"largest_category":"[actual value]","observed_since":"[date]"},'
            '"ranking":[{"cause":"[exact from data]","pct":"XX%"},{"cause":"[exact]","pct":"XX%"},'
            '{"cause":"[exact]","pct":"XX%"},{"cause":"[exact]","pct":"XX%"}]}'
        ),
        "rca_actions": (
            "pgt_plnt_prodtn_metric_view,pgt_plnt_prodtn_evnt_metric_view",
            f"Filters: {ctx}. "
            "Based on the root causes in the data, define: "
            "1. Top 4 cause→action pairs: cause = exact RSN/WST_TYP from data, "
            "   action = specific thing to do tomorrow (name the line, machine, or shift). "
            "2. Top 4 recommended actions with: what they address, expected pp impact, priority. "
            "3. If all actions taken: estimated waste reduction, downtime reduction, OEE gain. "
            'Return JSON: {"cause_action_map":[{"cause":"[exact RSN/WST_TYP]","action":"[specific tomorrow action]"},'
            '{"cause":"[exact]","action":"[specific]"},{"cause":"[exact]","action":"[specific]"},{"cause":"[exact]","action":"[specific]"}],'
            '"impact":{"metric1_label":"[e.g. Waste Reduction]","metric1_value":"↓ X.Xpp",'
            '"metric2_label":"[e.g. DT Reduction]","metric2_value":"↓ X%",'
            '"metric3_label":"[e.g. OEE Gain]","metric3_value":"↑ X.Xpp","actions_pending":"4 of 4"},'
            '"actions":[{"recommendation":"[specific action naming line/machine/shift]","addresses":"[root cause]","impact":"[e.g. Reduce Waste 1.1pp]","status":"High"},'
            '{"recommendation":"[specific]","addresses":"[cause]","impact":"[impact]","status":"High"},'
            '{"recommendation":"[specific]","addresses":"[cause]","impact":"[impact]","status":"Medium"},'
            '{"recommendation":"[specific]","addresses":"[cause]","impact":"[impact]","status":"Low"}]}'
        ),
        "rca_detail": (
            "pgt_plnt_prodtn_metric_view,pgt_plnt_prodtn_evnt_metric_view",
            f"Filters: {ctx}. "
            "For the primary root cause found in the data: "
            "How long has it been observed (timeframe from STRT_DT)? "
            "What is the operational impact — use language from Comment_Text if available. "
            "What is the exact WST_TYP or RSN category? What % contribution? Priority level? "
            'Return JSON: {"detail":{"Observed":"[timeframe e.g. Last 8 Weeks]",'
            '"Affected Asset":"[specific line/machine from data]",'
            '"Operational Impact":"[phrase from Comment_Text or RSN analysis]",'
            '"Category":"[WST_TYP or RSN value]",'
            '"Contribution":"XX%","Priority":"High|Medium|Low"}}'
        ),
    }


def get_rca(filters: dict, kpi_focus: str = "auto") -> dict:
    """
    Root Cause Analysis — parallel calls, one per RCA section.
    Each call finishes in ~30-60s. All run simultaneously.
    Total time ~60s instead of 300s+.
    """
    questions = _build_rca_questions(filters, kpi_focus)
    ctx = ", ".join(f"{k}={v}" for k,v in filters.items() if v) or "all sites, current week"

    print(f"[supervisor] RCA PARALLEL — {len(questions)} questions")

    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(questions)) as executor:
        futures = {
            executor.submit(_call_one_question, key, view, question, ctx): key
            for key, (view, question) in questions.items()
        }
        for future in concurrent.futures.as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as e:
                print(f"[supervisor]   RCA {key} failed: {e}")
                results[key] = {}

    # Merge all RCA results
    merged = {}
    for r in results.values():
        merged.update(r)

    # Ensure issue field is set
    if not merged.get("issue"):
        merged["issue"] = kpi_focus if kpi_focus != "auto" else "Manufacturing KPI"

    print(f"[supervisor] RCA done — keys: {list(merged.keys())}")
    return merged
