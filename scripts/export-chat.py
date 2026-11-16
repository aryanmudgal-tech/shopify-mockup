#!/usr/bin/env python3
"""Converts a Claude Code transcript (JSONL) into a readable Markdown chat export.

    python3 scripts/export-chat.py <transcript.jsonl> <out.md>

Transcripts live in ~/.claude/projects/<folder>/<session id>.jsonl. Your messages
and Claude's replies are kept in full; each tool call is folded with its result
cut at 1,500 characters. System reminders, hidden reasoning and skill bodies are
left out, and the git author's email is masked.
"""
import html
import subprocess
import json
import re
import sys
from datetime import datetime, timezone

SRC, OUT = sys.argv[1], sys.argv[2]
LIMIT = 1500
REMINDER = re.compile(r"<system-reminder>.*?</system-reminder>", re.S)
PASTE = re.compile(r'<pasted_content id="[^"]*">\n?(.*?)\n?</pasted_content id="[^"]*">', re.S)


def cut(text, limit=LIMIT):
    text = text.rstrip()
    return text if len(text) <= limit else text[:limit] + f"\n… [{len(text) - limit:,} more characters]"


def fence(text, lang=""):
    return f"````{lang}\n{text}\n````"


def when(ts):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M UTC")
    except Exception:
        return ""


def user_text(raw):
    text = REMINDER.sub("", raw).strip()
    if not text or text.startswith("<command-") or text.startswith("<local-command") or text == "Tool loaded.":
        return None
    if text.startswith("The user sent a new message while you were working"):
        return None  # the queued_command attachment carries it
    def pasted(m):
        body = m.group(1).strip()
        return f"\n<details><summary>Pasted text ({body.count(chr(10)) + 1} lines)</summary>\n\n{body}\n\n</details>\n"
    return PASTE.sub(pasted, text)


def result_text(content):
    if isinstance(content, str):
        return content
    parts = []
    for b in content or []:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "text":
            parts.append(b.get("text", ""))
        elif b.get("type") == "image":
            parts.append("[image]")
    return "\n".join(parts)


def tool_block(name, inp, result):
    short = name.replace("mcp__", "").replace("__", ": ")
    if name == "Bash":
        title, body = f"Bash: {inp.get('description') or inp.get('command', '')[:80]}", fence(cut(inp.get("command", "")), "bash")
    elif name in ("Read", "Write", "Edit"):
        title = f"{name}: {inp.get('file_path', '')}"
        if name == "Write":
            body = fence(cut(inp.get("content", "")))
        elif name == "Edit":
            body = "Replace:\n" + fence(cut(inp.get("old_string", ""), 600)) + "\nWith:\n" + fence(cut(inp.get("new_string", ""), 600))
        else:
            body = ""
    elif name == "mcp__ccd_turn__update_plan" and "items" in inp:
        return "**Plan:** " + "; ".join(f"{i['content']} ({i['status']})" for i in inp["items"]) + "\n"
    elif name == "mcp__ccd_turn__update_plan":
        return ""
    elif name == "mcp__ccd_turn__wrap_up":
        ask = f" **Asked:** {inp['ask']}" if inp.get("ask") else ""
        return f"**Recap:** {inp.get('recap', '')}{ask}\n"
    elif name == "Skill":
        title, body = f"Skill: {inp.get('skill', '')}", ""
    else:
        title, body = short, fence(cut(json.dumps(inp, indent=1, ensure_ascii=False), 1200), "json")
    out = f"<details><summary>{html.escape(title[:140])}</summary>\n\n{body}\n"
    if result is not None and result.strip():
        out += "\nResult:\n" + fence(cut(result)) + "\n"
    return out + "\n</details>\n"


entries, seen = [], set()
with open(SRC) as fh:
    for line in fh:
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if e.get("isSidechain"):
            continue
        uid = e.get("uuid")
        if uid and uid in seen:
            continue
        if uid:
            seen.add(uid)
        entries.append(e)

# Tool results, by tool_use id.
results = {}
for e in entries:
    if e.get("type") == "user" and isinstance(e.get("message", {}).get("content"), list):
        for b in e["message"]["content"]:
            if isinstance(b, dict) and b.get("type") == "tool_result":
                results[b.get("tool_use_id")] = result_text(b.get("content"))

events = []  # (kind, payload)
for e in entries:
    t = e.get("type")
    if t == "system" and e.get("subtype") == "compact_boundary":
        continue
    if t == "attachment":
        a = e.get("attachment") or {}
        if a.get("type") == "queued_command" and (a.get("origin") or {}).get("kind") == "human" and a.get("prompt"):
            text = user_text(a["prompt"])
            if text:
                events.append(("user", (e.get("timestamp", ""), text, True)))
        continue
    if t == "user":
        msg = e.get("message", {})
        content = msg.get("content")
        if e.get("isCompactSummary"):
            events.append(("compact", REMINDER.sub("", content if isinstance(content, str) else result_text(content)).strip()))
            continue
        if e.get("isMeta"):
            raw = content if isinstance(content, str) else result_text(content)
            m = re.search(r"Base directory for this skill: (\S+)", raw or "")
            if m:
                events.append(("skill", m.group(1).rstrip("/").split("/")[-1]))
            continue
        texts = [content] if isinstance(content, str) else [b.get("text", "") for b in content or [] if isinstance(b, dict) and b.get("type") == "text"]
        for raw in texts:
            text = user_text(raw)
            if text:
                events.append(("user", (e.get("timestamp", ""), text, False)))
        continue
    if t == "assistant":
        for b in e.get("message", {}).get("content", []):
            if not isinstance(b, dict):
                continue
            if b.get("type") == "text" and b.get("text", "").strip():
                events.append(("text", b["text"].strip()))
            elif b.get("type") == "tool_use":
                events.append(("tool", (b.get("name", ""), b.get("input", {}), results.get(b.get("id")))))

users = sum(1 for k, _ in events if k == "user")
tools = sum(1 for k, _ in events if k == "tool")
first = next((p[0] for k, p in events if k == "user"), "")
last = next((p[0] for k, p in reversed(events) if k == "user"), "")

out = [
    "# Before You Buy - chat with Claude Code",
    "",
    f"- From {when(first)} to {when(last)}, exported {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}.",
    "- One conversation in two Claude Code sessions: `5ea717ac` in `~/Desktop/shopify-mockup`, then forked as `e56c289d` into `~/Code/shopify-mockup` on 2026-11-15. The fork carries the whole first session, so this file starts at the very first message.",
    f"- {users} messages from me, {tools} tool calls by Claude.",
    "- Each tool call is folded under its own line, with its result cut at 1,500 characters. Left out: system reminders, Claude's hidden reasoning, and the full text of loaded skills.",
    "",
]
speaker = None
for kind, p in events:
    if kind == "user":
        ts, text, queued = p
        out += ["---", "", f"## Me ({when(ts)}{', sent while Claude was working' if queued else ''})", "", text, ""]
        speaker = "user"
        continue
    if speaker != "claude":
        out += ["## Claude", ""]
        speaker = "claude"
    if kind == "text":
        out += [p, ""]
    elif kind == "tool":
        block = tool_block(*p)
        if block:
            out += [block]
    elif kind == "skill":
        out += [f"*Loaded the `{p}` skill.*", ""]
    elif kind == "compact":
        out += ["*The conversation ran out of context here and was compacted. The summary Claude continued from:*", "", "<details><summary>Compaction summary</summary>", "", p, "", "</details>", ""]

text = "\n".join(out) + "\n"
# Keep the git author's email (and its user name part) out of the export.
email = subprocess.run(["git", "config", "user.email"], capture_output=True, text=True).stdout.strip()
if email:
    local = email.split("@")[0]
    text = re.sub(re.escape(email), "[email removed]", text, flags=re.I)
    if len(local) >= 6:
        text = re.sub(re.escape(local), "[email removed]", text, flags=re.I)
with open(OUT, "w") as fh:
    fh.write(text)
print(f"{OUT}: {users} user messages, {tools} tool calls, {sum(len(x) for x in out):,} characters")
