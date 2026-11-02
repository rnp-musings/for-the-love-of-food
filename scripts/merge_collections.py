#!/usr/bin/env python3
"""Fold per-group collection files (content/<name>/*.json) into content/<name>.json.

Ingredients and sources are unioned by id (aliases and allergens combined).
Other collections must not contain duplicate ids.
Run, then run validate.py.
"""
import glob, json, sys
from pathlib import Path

CONTENT = Path(__file__).resolve().parent.parent / "content"
problems = []


def load(p):
    return json.load(open(p, encoding="utf-8"))


def merge(name, key):
    base = CONTENT / f"{name}.json"
    parts = [base] if base.exists() else []
    parts += [Path(p) for p in sorted(glob.glob(str(CONTENT / name / "*.json")))]
    out, index = [], {}
    for p in parts:
        for rec in load(p):
            k = key(rec)
            if k in index:
                old = index[k]
                if old == rec:
                    continue
                if name in ("ingredients", "sources"):
                    for f in ("aliases", "allergens"):
                        if f in rec:
                            old[f] = sorted(set(old.get(f, [])) | set(rec[f]))
                    for f in rec:
                        if f not in ("aliases", "allergens") and old.get(f) != rec[f]:
                            problems.append(f"{name} '{k}': field '{f}' differs: {old.get(f)!r} vs {rec[f]!r} ({p.name})")
                else:
                    problems.append(f"{name}: duplicate '{k}' ({p.name})")
                continue
            index[k] = rec
            out.append(rec)
    with open(base, "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in out) + "\n]\n")
    for p in parts[1:]:
        p.unlink()
    d = CONTENT / name
    if d.is_dir() and not any(d.iterdir()):
        d.rmdir()
    print(f"{name}: {len(out)}")


merge("countries", lambda r: r["id"])
merge("regions", lambda r: r["id"])
merge("ingredients", lambda r: r["id"])
merge("sources", lambda r: r["id"])
merge("festivals", lambda r: r["id"])
merge("festival-dishes", lambda r: (r["festival"], r["dish"]))
if problems:
    print("\nConflicts to resolve:")
    for p in problems:
        print(" -", p)
    sys.exit(1)
