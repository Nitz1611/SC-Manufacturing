"""
supervisor.py  —  Approach A with tool-call loop

Your Supervisor uses an agentic loop:
  1. We send the prompt
  2. Supervisor responds with function_call (calling Genie internally)
  3. We detect this and keep polling until we get the final text answer
  4. We parse the final answer as JSON

No static data anywhere. Raises clear errors if anything fails.
"""

import os
import json
import re
import time
import requests
from dotenv import load_dotenv

load_dotenv()

HOSTNAME  = os.getenv("DATABRICKS_SERVER_HOSTNAME", "").replace("https://", "").replace("http://", "").rstrip("/")
PAT       = os.getenv("DATABRICKS_PAT_TOKEN", "")
ENDPOINT  = os.getenv("SUPERVISOR_ENDPOINT_NAME", "")
DEBUG     = os.getenv("SUPERVISOR_DEBUG", "false").lower() == "true"

POLL_INTERVAL_S   = 10    # seconds between polls — no max, runs until answer arrives


# ─────────────────────────────────────────────────────────────────
# Single POST to Supervisor
# ─────────────────────────────────────────────────────────────────
def _post(body: dict, timeout: int = None) -> dict:  # None = no timeout
    if not all([HOSTNAME, PAT, ENDPOINT]):
        raise RuntimeError(
            "Missing .env vars — set DATABRICKS_SERVER_HOSTNAME, "
            "DATABRICKS_PAT_TOKEN and SUPERVISOR_ENDPOINT_NAME"
        )

    url = f"https://{HOSTNAME}/serving-endpoints/{ENDPOINT}/invocations"

    resp = requests.post(
        url,
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
        json=body,
        timeout=timeout,   # None means wait forever
    )

    if DEBUG:
        print(f"[supervisor] HTTP {resp.status_code} | {resp.text[:600]}")
    else:
        print(f"[supervisor] HTTP {resp.status_code} | preview: {resp.text[:200]}")

    resp.raise_for_status()
    return resp.json()


# ─────────────────────────────────────────────────────────────────
# Detect if response is a tool/function call (Genie in progress)
# or the final text answer
# ─────────────────────────────────────────────────────────────────
def _is_tool_call(raw: dict) -> bool:
    """Returns True if the Supervisor is still calling Genie tools."""
    content = raw.get("content") or []

    # List of content blocks with a function_call type
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "function_call":
                return True

    # choices[0].message with tool_calls
    choices = raw.get("choices") or []
    if choices:
        msg = (choices[0].get("message") or {})
        if msg.get("tool_calls") or msg.get("function_call"):
            return True

    # Top-level type field
    if raw.get("type") == "function_call":
        return True

    # output is a list containing function_call blocks
    output = raw.get("output") or []
    if isinstance(output, list):
        for block in output:
            if isinstance(block, dict) and block.get("type") == "function_call":
                return True

    return False


def _is_complete(raw: dict) -> bool:
    """Returns True if we have a final text answer."""
    # Has final text content
    content = raw.get("content") or []
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                return True

    # OpenAI-style with stop_reason
    choices = raw.get("choices") or []
    if choices:
        msg        = choices[0].get("message") or {}
        stop       = choices[0].get("finish_reason", "")
        has_content= bool(msg.get("content"))
        no_tools   = not msg.get("tool_calls") and not msg.get("function_call")
        if has_content and (stop in ("stop", "end_turn") or no_tools):
            return True

    # Direct output string
    if isinstance(raw.get("output"), str) and len(raw.get("output", "")) > 10:
        return True

    return False


# ─────────────────────────────────────────────────────────────────
# Extract final text from completed response
# ─────────────────────────────────────────────────────────────────
def _extract_text(raw: dict) -> str:
    # content blocks with type=text
    content = raw.get("content") or []
    if isinstance(content, list):
        texts = [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
        if texts:
            return "\n".join(texts)

    # OpenAI-style
    choices = raw.get("choices") or []
    if choices:
        msg_content = (choices[0].get("message") or {}).get("content")
        if msg_content and isinstance(msg_content, str):
            return msg_content

    # Direct output
    output = raw.get("output")
    if isinstance(output, str):
        return output

    # Predictions (MLflow batch)
    preds = raw.get("predictions") or []
    if preds:
        return str(preds[0])

    return ""


# ─────────────────────────────────────────────────────────────────
# Check if Supervisor has a run_id / thread_id for polling
# ─────────────────────────────────────────────────────────────────
def _get_run_id(raw: dict) -> str:
    return (
        raw.get("run_id")
        or raw.get("thread_id")
        or raw.get("id")
        or ""
    )



# ─────────────────────────────────────────────────────────────────
# Helpers to extract assistant turn and tool results for conversation loop
# ─────────────────────────────────────────────────────────────────
def _extract_assistant_turn(raw: dict) -> dict:
    """Extract assistant message with tool_calls to append to conversation."""
    # Anthropic style
    content = raw.get("content")
    if isinstance(content, list) and any(b.get("type") == "function_call" for b in content if isinstance(b, dict)):
        return {"role": "assistant", "content": content}

    # OpenAI style
    choices = raw.get("choices") or []
    if choices:
        msg = choices[0].get("message") or {}
        if msg.get("tool_calls") or msg.get("function_call"):
            return {"role": "assistant", "content": msg.get("content", ""), "tool_calls": msg.get("tool_calls", [])}

    return {}


def _extract_tool_results(raw: dict) -> list:
    """Build tool_result messages so Supervisor can continue after tool calls."""
    results = []

    # Anthropic style function_call blocks
    content = raw.get("content") or []
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "function_call":
                tool_id   = block.get("id", block.get("call_id", "call_1"))
                tool_name = block.get("name", "genie")
                results.append({
                    "role": "tool",
                    "tool_call_id": tool_id,
                    "name": tool_name,
                    "content": "Genie query completed. Please synthesise the results and return the final JSON dashboard.",
                })

    # OpenAI style tool_calls
    choices = raw.get("choices") or []
    if choices:
        msg = choices[0].get("message") or {}
        for tc in (msg.get("tool_calls") or []):
            results.append({
                "role": "tool",
                "tool_call_id": tc.get("id", "call_1"),
                "name": (tc.get("function") or {}).get("name", "genie"),
                "content": "Genie query completed. Please synthesise the results and return the final JSON dashboard.",
            })

    return results

# ─────────────────────────────────────────────────────────────────
# Main call with agentic loop
# Handles multi-turn tool calls until final answer arrives
# ─────────────────────────────────────────────────────────────────
def _call_supervisor(messages: list, timeout: int = None) -> str:  # None = no timeout
    """
    Calls Supervisor and waits for the final text answer.
    Handles the tool-call loop automatically.
    Returns: final plain text string (JSON or prose).
    """
    print(f"[supervisor] → {ENDPOINT}")
    print(f"[supervisor]   prompt: {messages[0]['content'][:120]}…")

    body = {"input": messages}

    # First call
    raw = _post(body, timeout=timeout)

    # If already complete — return immediately
    if _is_complete(raw):
        text = _extract_text(raw)
        print(f"[supervisor] ✓ Immediate response — {len(text)} chars")
        return text

    # If tool calls in progress — poll for completion
    if _is_tool_call(raw):
        print(f"[supervisor] ⟳ Supervisor is calling Genie tools — waiting for final answer…")

        run_id = _get_run_id(raw)

        # Build conversation history — append tool calls + dummy results
        # so the Supervisor knows Genie was "called" and continues to final answer
        conversation = list(messages)

        attempt = 0
        while True:  # no timeout — runs until Supervisor responds
            time.sleep(POLL_INTERVAL_S)
            attempt += 1
            elapsed = attempt * POLL_INTERVAL_S
            print(f"[supervisor]   polling… {elapsed}s elapsed (attempt {attempt}) — waiting for Supervisor to finish Genie queries…")

            # Strategy 1: Try run polling endpoint (Databricks async pattern)
            if run_id:
                try:
                    poll_url = f"https://{HOSTNAME}/serving-endpoints/{ENDPOINT}/runs/{run_id}"
                    poll_resp = requests.get(
                        poll_url,
                        headers={"Authorization": f"Bearer {PAT}"},
                        timeout=None,  # no timeout
                    )
                    if poll_resp.ok:
                        raw = poll_resp.json()
                        if DEBUG:
                            print(f"[supervisor]   poll result: {poll_resp.text[:400]}")
                        if _is_complete(raw):
                            text = _extract_text(raw)
                            print(f"[supervisor] ✓ Final answer via poll after {elapsed}s")
                            return text
                        if _is_tool_call(raw):
                            continue   # still working
                except Exception as e:
                    print(f"[supervisor]   run poll unavailable ({e}) — switching to conversation strategy")
                    run_id = ""

            # Strategy 2: Continue conversation — append assistant turn + tool results
            # This is the standard agentic loop pattern
            if not run_id:
                # Add the last assistant message (with tool calls) to history
                last_assistant = _extract_assistant_turn(raw)
                if last_assistant:
                    conversation.append(last_assistant)
                    # Add a placeholder tool result to unblock the Supervisor
                    tool_results = _extract_tool_results(raw)
                    for tr in tool_results:
                        conversation.append(tr)

                try:
                    raw = _post({"input": conversation}, timeout=timeout)
                    if DEBUG:
                        print(f"[supervisor]   continued conversation response: {str(raw)[:400]}")
                except Exception as e:
                    print(f"[supervisor]   retry error: {e}")
                    continue

            if _is_complete(raw):
                text = _extract_text(raw)
                print(f"[supervisor] ✓ Final answer after {elapsed}s — {len(text)} chars")
                return text

        # Loop continues indefinitely until Supervisor responds

    # Neither tool call nor complete — log and raise
    print(f"[supervisor] ⚠ Unexpected response: {str(raw)[:400]}")
    raise RuntimeError(
        f"Supervisor returned unexpected response. "
        f"Set SUPERVISOR_DEBUG=true in .env to see full details."
    )


# ─────────────────────────────────────────────────────────────────
# Parse final text → Python dict
# ─────────────────────────────────────────────────────────────────
def _parse_json(text: str) -> dict:
    # Strip markdown fences
    cleaned = re.sub(r"```json\s*|```\s*", "", text).strip()

    if DEBUG:
        print(f"[supervisor]   parsing text: {cleaned[:400]}")

    # Try direct JSON
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            parsed = json.loads(match.group(0))
            print(f"[supervisor]   ✓ Parsed JSON keys: {list(parsed.keys())}")
            return parsed
        except json.JSONDecodeError as e:
            print(f"[supervisor]   JSON parse error: {e}")

    # Plain text — return as narrative
    print(f"[supervisor]   ℹ Response is plain text (not JSON)")
    return {"narrative": cleaned}


# ─────────────────────────────────────────────────────────────────
# Build prompts
# ─────────────────────────────────────────────────────────────────
def _build_dashboard_prompt(filters: dict) -> str:
    ctx = ", ".join(f"{k}={v}" for k, v in filters.items() if v) or "all sites, current week"

    return f"""You are a manufacturing analytics supervisor agent.

Query Genie using the metric views and return a complete dashboard JSON payload.
Apply these filters to every Genie query: {ctx}

VIEWS TO QUERY VIA GENIE:
  pgt_plnt_prodtn_metric_view
    columns: Region, Site, Plant, Department, Line, Shape, Product,
    SHIFT_KEY, STRT_DT, Run_Hours, Scheduled_Hours,
    Total_Downtime_Hours, Total_Unplanned_Downtime_Hours,
    Total_Unplanned_Downtime_Pct, Downtime_Category (CTGY),
    RSN, RSN3, RSN4, Comment_Text, STOPS, MTTR, MTBF

  pgt_plnt_prodtn_evnt_metric_view
    columns: WST_TYP, SECRY_AREA, RSN, WST_LBS, PRODC_LBS,
    WST_CST, WST_DLLR, PU_ID, SHIFT_KEY, STRT_DT, DEPT_CD, SHAPE_CD

  pgt_plnt_effcncy_metric_view
    columns: OEE, Quality, Performance, Actual_Rate,
    Nameplate_Rate, Run_Hours, Total_Lbs_Produced

  pgt_waste_pct_composite_metric_view
    Waste_Pct = Finished_Lbs_Waste / (Produced_Lbs + Finished_Lbs_Waste)

QUERY THESE FROM GENIE (all values must come from live data):
  1. Biggest Waste Type (WST_TYP) vs prior period — name + exact % change
  2. Line with highest Finished_Lbs_Waste — line name + % of total
  3. Line with highest Total_Unplanned_Downtime_Hours — name + % of total
  4. Maintenance downtime (CTGY=Maintenance) WoW trend — direction + amount
  5. Weekly Waste_Pct for last 6 weeks from STRT_DT
  6. Weekly Total_Unplanned_Downtime_Hours for last 5 weeks
  7. Top 3 themes from Comment_Text operator entries
  8. Top 3 actionable improvements with estimated pp impact
  9. Current Waste_Pct, Total_Downtime_Hours, OEE, STOPS vs prior period
  10. Top 4 lines by % share of Total_Downtime_Hours
  11. Avg Total_Downtime_Hours by SHIFT_KEY (1=Shift A, 2=Shift B, 3=Shift C)
  12. Top 3 waste types by % share of Finished_Lbs_Waste
  13. Top 3 lines by % share of unplanned downtime

CRITICAL: After querying Genie, return ONLY this JSON — no text before or after:
{{
  "kpis": {{
    "waste_pct":    {{"value": "X.X%",  "delta": "↑/↓ X.Xpp vs prior week", "direction": "bad|good|warn"}},
    "downtime_hrs": {{"value": "XX.Xh", "delta": "↑/↓ X% week-over-week",   "direction": "bad|good|warn"}},
    "oee":          {{"value": "XX.X%", "delta": "↑/↓ X.Xpp vs target",     "direction": "bad|good|warn"}},
    "stops":        {{"value": "XXX",   "delta": "↑/↓ XX vs prior week",     "direction": "bad|good|warn"}}
  }},
  "key_insights": [
    {{"text": "sentence with exact number from Genie", "color": "red|blue|amber|green"}},
    {{"text": "...", "color": "..."}},
    {{"text": "...", "color": "..."}},
    {{"text": "...", "color": "..."}}
  ],
  "waste_bullets":     [{{"text": "...", "pct": 0}}, {{"text": "...", "pct": 0}}, {{"text": "...", "pct": 0}}],
  "downtime_bullets":  [{{"text": "...", "pct": 0}}, {{"text": "...", "pct": 0}}, {{"text": "...", "pct": 0}}],
  "line_contributions":[{{"line": "Line X", "pct": 0, "color": "red"}}, {{"line": "Line Y", "pct": 0, "color": "gray"}}, {{"line": "Line Z", "pct": 0, "color": "gray"}}, {{"line": "Others", "pct": 0, "color": "gray"}}],
  "shift_comparison":  [{{"shift": "Shift A", "hours": 0.0, "color": "#3B6FD4"}}, {{"shift": "Shift B", "hours": 0.0, "color": "#E04444"}}, {{"shift": "Shift C", "hours": 0.0, "color": "#3B6FD4"}}],
  "waste_trend":    {{"labels": ["W1","W2","W3","W4","W5","W6"], "data": [0.0,0.0,0.0,0.0,0.0,0.0], "anomaly_week": "ANOMALY: WX", "anomaly_label": "describe pattern", "severity": "anomaly|critical|warn"}},
  "downtime_trend": {{"labels": ["W1","W2","W3","W4","W5"],     "data": [0.0,0.0,0.0,0.0,0.0],     "anomaly_week": "CRITICAL TREND", "anomaly_label": "describe pattern", "severity": "anomaly|critical|warn"}},
  "observations":   ["finding from Comment_Text", "second observation", "third observation"],
  "opportunities":  [{{"title": "action", "delta": "-X.Xpp Waste", "color": "good|warn"}}, {{"title": "...", "delta": "...", "color": "..."}}, {{"title": "...", "delta": "...", "color": "..."}}]
}}"""


def _build_ask_prompt(question: str, filters: dict) -> str:
    ctx = ", ".join(f"{k}={v}" for k, v in filters.items() if v) or "all sites"
    return f"""You are a manufacturing analytics supervisor agent.
Filters: {ctx}

Query Genie using:
  pgt_plnt_prodtn_metric_view (RSN, RSN3, RSN4, CTGY, COMMENT_TEXT, SHIFT_KEY, STRT_DT)
  pgt_plnt_prodtn_evnt_metric_view (WST_TYP, SECRY_AREA, WST_LBS, WST_CST)
  pgt_plnt_effcncy_metric_view (OEE, Quality, Performance)
  pgt_waste_pct_composite_metric_view (Waste_Pct)

Question: {question}

Return a 2-4 sentence plain text answer with actual numbers from Genie. No JSON."""


# ─────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────
def get_dashboard(filters: dict) -> dict:
    """Returns full dashboard dict from Supervisor. No static data."""
    text   = _call_supervisor([{"role": "user", "content": _build_dashboard_prompt(filters)}])
    parsed = _parse_json(text)

    # If Supervisor returned plain text instead of JSON — show it clearly
    if "narrative" in parsed and len(parsed) == 1:
        print(f"[supervisor] ⚠ Supervisor returned plain text, not JSON")
        print(f"[supervisor]   Text: {parsed['narrative'][:300]}")
        narrative = parsed["narrative"]
        return {
            "key_insights":      [{"text": f"Supervisor response: {narrative[:200]}", "color": "blue"}],
            "waste_bullets":     [],
            "downtime_bullets":  [],
            "line_contributions":[],
            "shift_comparison":  [],
            "waste_trend":       {"labels": [], "data": [], "anomaly_week": "", "anomaly_label": "Awaiting structured response", "severity": "warn"},
            "downtime_trend":    {"labels": [], "data": [], "anomaly_week": "", "anomaly_label": "", "severity": "warn"},
            "observations":      [narrative],
            "opportunities":     [],
            "kpis":              {},
            "_plain_text":       True,
        }

    # Fill any missing keys with empty so dashboard never crashes
    parsed.setdefault("kpis",              {})
    parsed.setdefault("key_insights",      [])
    parsed.setdefault("waste_bullets",     [])
    parsed.setdefault("downtime_bullets",  [])
    parsed.setdefault("line_contributions",[])
    parsed.setdefault("shift_comparison",  [])
    parsed.setdefault("waste_trend",       {"labels": [], "data": [], "anomaly_week": "", "anomaly_label": "", "severity": "warn"})
    parsed.setdefault("downtime_trend",    {"labels": [], "data": [], "anomaly_week": "", "anomaly_label": "", "severity": "warn"})
    parsed.setdefault("observations",      [])
    parsed.setdefault("opportunities",     [])

    print(f"[supervisor] ✓ Dashboard — {len(parsed.get('key_insights',[]))} insights")
    return parsed


def ask_question(question: str, filters: dict) -> str:
    """Returns plain text answer. No static data."""
    text = _call_supervisor([{"role": "user", "content": _build_ask_prompt(question, filters)}])
    parsed = _parse_json(text)
    return parsed.get("narrative") or text or "No answer returned."
