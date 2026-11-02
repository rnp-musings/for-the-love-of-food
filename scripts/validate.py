#!/usr/bin/env python3
"""Validate content against schemas and check cross-references and diet tags.

Usage: python3 scripts/validate.py
Exit code is 1 if any error is found.
Requires: pip install jsonschema
"""
import glob
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
SCHEMAS = ROOT / "schemas"

errors = []


def err(msg):
    errors.append(msg)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def schema(name):
    return Draft202012Validator(load(SCHEMAS / f"{name}.schema.json"))


def records(pattern):
    out = []
    for p in sorted(glob.glob(str(CONTENT / pattern))):
        data = load(p)
        rel = str(Path(p).relative_to(ROOT))
        if not isinstance(data, list):
            err(f"{rel}: top level must be a list")
            continue
        out.extend((rel, r) for r in data)
    return out


def check(kind, items, validator):
    ids = {}
    for rel, rec in items:
        for e in validator.iter_errors(rec):
            path = ".".join(str(x) for x in e.absolute_path) or "(root)"
            err(f"{rel} [{rec.get('id', '?')}] {path}: {e.message}")
        rid = rec.get("id")
        if rid:
            if rid in ids:
                err(f"{rel}: duplicate {kind} id '{rid}'")
            ids[rid] = rec
    return ids


countries = check("country", records("countries.json"), schema("country"))
regions = check("region", records("regions.json"), schema("region"))
ingredients = check("ingredient", records("ingredients.json"), schema("ingredient"))
sources = check("source", records("sources.json"), schema("source"))
festivals = check("festival", records("festivals.json"), schema("festival"))
dishes = check("dish", records("dishes/*.json"), schema("dish"))
recipes = check("recipe", records("recipes/*.json"), schema("recipe"))
fest_dishes = records("festival-dishes.json")
fd_validator = schema("festival-dish")
for rel, rec in fest_dishes:
    for e in fd_validator.iter_errors(rec):
        err(f"{rel} festival-dish: {e.message}")


def need(ref, table, where):
    if ref not in table:
        err(f"{where}: unknown reference '{ref}'")


for c in countries.values():
    for s in c.get("sources", []):
        need(s, sources, f"country {c['id']}")

for r in regions.values():
    need(r["country"], countries, f"region {r['id']}")
    for i in r["signature_ingredients"]:
        need(i, ingredients, f"region {r['id']} signature_ingredients")
    for s in r.get("sources", []):
        need(s, sources, f"region {r['id']}")

for f in festivals.values():
    for c in f["countries"]:
        need(c, countries, f"festival {f['id']}")
    for r in f.get("regions", []):
        need(r, regions, f"festival {f['id']}")
    for s in f.get("sources", []):
        need(s, sources, f"festival {f['id']}")

for d in dishes.values():
    need(d["country"], countries, f"dish {d['id']}")
    if "region" in d:
        need(d["region"], regions, f"dish {d['id']}")
        if d["region"] in regions and regions[d["region"]]["country"] != d["country"]:
            err(f"dish {d['id']}: region {d['region']} is not in country {d['country']}")
    for s in d["sources"]:
        need(s, sources, f"dish {d['id']}")
    for oc in d["origin_claims"]:
        if "source" in oc:
            need(oc["source"], sources, f"dish {d['id']} origin_claims")

dish_recipes = {}
for r in recipes.values():
    need(r["dish"], dishes, f"recipe {r['id']}")
    dish_recipes.setdefault(r["dish"], []).append(r)
    for line in r["ingredients"]:
        need(line["ingredient"], ingredients, f"recipe {r['id']}")
        if line["unit"] == "to-taste" and line["amount"] is not None:
            err(f"recipe {r['id']}: '{line['ingredient']}' is to-taste so amount must be null")
        if line["unit"] != "to-taste" and line["amount"] is None:
            err(f"recipe {r['id']}: '{line['ingredient']}' needs an amount")
    for s in r.get("sources", []):
        need(s, sources, f"recipe {r['id']}")

for did in dishes:
    if did not in dish_recipes:
        err(f"dish {did}: has no recipe")

for rel, fd in fest_dishes:
    need(fd["festival"], festivals, f"festival-dish {fd['festival']}/{fd['dish']}")
    need(fd["dish"], dishes, f"festival-dish {fd['festival']}/{fd['dish']}")

# Diet tags are checked against the ingredients of every recipe of the dish.
MEAT = {"meat", "poultry", "fish-seafood"}
for did, recs in dish_recipes.items():
    if did not in dishes:
        continue
    tags = set(dishes[did]["diet"])
    for r in recs:
        cats, allergens = set(), set()
        for line in r["ingredients"]:
            ing = ingredients.get(line["ingredient"])
            if not ing or line.get("optional"):
                continue
            cats.add(ing["category"])
            allergens.update(ing.get("allergens", []))
        if "vegetarian" in tags and cats & MEAT:
            err(f"dish {did}: tagged vegetarian but recipe {r['id']} has meat or fish")
        if "vegan" in tags and (cats & MEAT or cats & {"dairy", "egg"}):
            err(f"dish {did}: tagged vegan but recipe {r['id']} has animal products")
        if "gluten-free" in tags and "gluten" in allergens:
            err(f"dish {did}: tagged gluten-free but recipe {r['id']} contains gluten")
        if "dairy-free" in tags and ("dairy" in allergens or "dairy" in cats):
            err(f"dish {did}: tagged dairy-free but recipe {r['id']} contains dairy")
        if "egg-free" in tags and ("egg" in allergens or "egg" in cats):
            err(f"dish {did}: tagged egg-free but recipe {r['id']} contains egg")
        if "nut-free" in tags and allergens & {"peanut", "tree-nut"}:
            err(f"dish {did}: tagged nut-free but recipe {r['id']} contains nuts")

n = lambda x: len(x)
print(f"countries={n(countries)} regions={n(regions)} dishes={n(dishes)} recipes={n(recipes)} "
      f"ingredients={n(ingredients)} festivals={n(festivals)} festival_dishes={n(fest_dishes)} sources={n(sources)}")
if errors:
    print(f"\n{len(errors)} error(s):")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("OK")
