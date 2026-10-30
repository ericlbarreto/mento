#!/usr/bin/env python3
"""Build prompts-verbatim.md from exported Claude Code session transcripts.

Usage:
  python3 tools/build_prompt_log.py --main <main/transcript.jsonl> [--fork <fork/transcript.jsonl> ...] --out prompts-verbatim.md

How to get a transcript: in the Claude desktop app use the session menu > Export (a zip is written to
Downloads); unzip it and pass `transcript.jsonl`. Only the founder's messages are read; assistant text and
tool output are ignored. Optional notes per prompt (by UTC minute) come from tools/notes.json.
"""
import argparse, json, os, re

def clean(t):
    t = re.sub(r"<system-reminder>.*?</system-reminder>", "", t, flags=re.S)
    t = re.sub(r'<pasted_content id="[^"]*">', "[pasted content begins]", t)
    t = re.sub(r"</pasted_content[^>]*>", "[pasted content ends]", t)
    return t.strip()

def read_prompts(path):
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except ValueError:
                continue
            t = o.get("type")
            if t == "user" and (o.get("origin") or {}).get("kind") == "human":
                c = o["message"].get("content")
                if isinstance(c, str):
                    txt, imgs = c, 0
                else:
                    txt = "\n".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
                    imgs = sum(1 for b in c if isinstance(b, dict) and b.get("type") == "image")
                out.append({"ts": o["timestamp"], "text": clean(txt), "images": imgs, "mid": False})
            elif t == "queue-operation" and o.get("operation") == "enqueue":
                # messages sent while the assistant was working
                out.append({"ts": o["timestamp"], "text": clean(o.get("content", "")), "images": 0, "mid": True})
    return [p for p in out if p["text"]]

def key(p):
    return re.sub(r"\s+", " ", p["text"])[:80]

def merge(prompts):
    """Drop duplicates (a queued message later reappears as a human turn); keep the richest record."""
    seen = {}
    for p in sorted(prompts, key=lambda x: x["ts"]):
        k = key(p)
        if k in seen:
            if p["images"] and not seen[k]["images"]:
                seen[k]["images"] = p["images"]
            # a queued message that later appears as a normal human turn was not truly "mid-turn"
            seen[k]["mid"] = seen[k]["mid"] and p["mid"]
            continue
        seen[k] = p
    return sorted(seen.values(), key=lambda x: x["ts"])

def fence(t):
    n = 3
    while "`" * n in t:
        n += 1
    return "`" * n

def entry(code, p, notes):
    tags = []
    if p["mid"]:
        tags.append("sent mid-turn")
    if p["images"]:
        tags.append(f'{p["images"]} image(s)')
    tg = (" · " + ", ".join(tags)) if tags else ""
    fc = fence(p["text"])
    s = f'### {code} — {p["ts"][:10]} {p["ts"][11:16]} UTC{tg}\n\n{fc}text\n{p["text"]}\n{fc}\n'
    note = notes.get(p["ts"][:16])
    if note:
        s += f"\n*{note}*\n"
    return s + "\n"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--main", required=True)
    ap.add_argument("--fork", action="append", default=[])
    ap.add_argument("--out", required=True)
    ap.add_argument("--notes", default=os.path.join(os.path.dirname(__file__), "notes.json"))
    a = ap.parse_args()
    notes = json.load(open(a.notes, encoding="utf-8")) if os.path.exists(a.notes) else {}
    main_p = merge(read_prompts(a.main))
    mk = {key(p) for p in main_p}
    fork_p = []
    for fp in a.fork:
        fork_p += [p for p in merge(read_prompts(fp)) if key(p) not in mk]
    fork_p = merge(fork_p)
    head = open(os.path.join(os.path.dirname(__file__), "header.md"), encoding="utf-8").read() if os.path.exists(os.path.join(os.path.dirname(__file__), "header.md")) else "# Founder prompts — verbatim log\n"
    lines = [head, "## Main session\n"]
    for i, p in enumerate(main_p, 1):
        lines.append(entry(f"P{i:02d}", p, notes))
    if fork_p:
        lines.append('## Forked session\n')
        for i, p in enumerate(fork_p, 1):
            lines.append(entry(f"F{i:02d}", p, notes))
    open(a.out, "w", encoding="utf-8").write("\n".join(lines))
    print(f"{len(main_p)} main prompts, {len(fork_p)} fork prompts -> {a.out}")

if __name__ == "__main__":
    main()
