import json
from pathlib import Path

path = Path("P:/mini-toeic.score/.agent/work/anish-thi-thu-xoamutoeic-20260730/ledger.json")
with open(path, "r", encoding="utf-8") as f:
    ledger = json.load(f)

for slice_item in ledger.get("slices", []):
    if slice_item["id"] == "S2":
        slice_item["status"] = "passed"
        break

with open(path, "w", encoding="utf-8") as f:
    json.dump(ledger, f, indent=2, ensure_ascii=False)
    f.write("\n")

print("S2 marked as passed.")
