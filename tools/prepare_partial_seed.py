"""Offline verifier/SQL-plan generator. It never contacts Cloudflare or uploads."""
import argparse, hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "migration" / "production-partial-manifest.json"

def main():
    p=argparse.ArgumentParser();p.add_argument("--media-root",type=Path,default=ROOT/"media"/"submissions");p.add_argument("--confirm-production-partial",default="");a=p.parse_args()
    m=json.loads(MANIFEST.read_text(encoding="utf-8")); assert m["immutable"] and len(m["works"])==14
    total=0
    for w in m["works"]:
        f=a.media_root/w["filename"]; data=f.read_bytes(); digest=hashlib.sha256(data).hexdigest()
        if len(data)!=w["size"] or digest!=w["sha256"]: raise SystemExit(f"REFUSE mismatch: {w['filename']}")
        total+=len(data)
    mode="CONFIRMED PLAN ONLY (tool has no mutation code)" if a.confirm_production_partial==m["manifestId"] else "DRY RUN"
    print(f"{mode}: verified=14 bytes={total} manifest={m['manifestId']}")

if __name__=="__main__": main()
