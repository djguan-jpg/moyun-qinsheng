"""Fail-closed offline planner/executor for the verified 20-work legacy import.

Private values are never written to stdout. Generated SQL and rollback ledgers are
created only in --private-output, which must be outside the source checkout.
"""
from __future__ import annotations
import argparse, hashlib, json, os, re, secrets, sqlite3, subprocess, sys
from pathlib import Path

EXPECTED_COUNT, REUSE_COUNT, NEW_COUNT = 20, 14, 6
HEX64 = re.compile(r"^[0-9a-f]{64}$")

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def atomic_private(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise SystemExit("private output already exists; resume or choose a new directory")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
        stream.write(value)

def q(value) -> str:
    if value is None: return "NULL"
    if isinstance(value, bool): return "1" if value else "0"
    if isinstance(value, int): return str(value)
    return "'" + str(value).replace("'", "''") + "'"

def verify_checksums(root: Path) -> None:
    checks = root / "checksums.sha256"
    if not checks.is_file(): raise SystemExit("checksum gate missing")
    checked = 0; seen_paths = set(); seen_digests = set()
    root = root.resolve()
    # Thin verified backups keep reconstructed/extracted files below root while
    # split archive parts remain as direct files beside it.  Never recurse into
    # unrelated sibling trees (for example a source checkout), because legitimate
    # duplicate bytes there would make verification depend on orchestration layout.
    files = ([x for x in root.rglob("*") if x.is_file() and x != checks] +
             [x for x in root.parent.iterdir() if x.is_file()])
    digest_index = {}
    for candidate in files: digest_index.setdefault(sha256(candidate), set()).add(candidate.resolve())
    for line in checks.read_text(encoding="utf-8").splitlines():
        if not line.strip(): continue
        try: digest, rel = line.split(maxsplit=1)
        except ValueError: raise SystemExit("backup checksum gate failed")
        digest = digest.lower(); rel = rel.lstrip("* ").strip('"').replace("\\", "/")
        parts = Path(rel).parts; folded = rel.casefold()
        if (not HEX64.fullmatch(digest) or not rel or Path(rel).is_absolute() or
                ".." in parts or folded in seen_paths or digest in seen_digests):
            raise SystemExit("backup checksum gate failed")
        seen_paths.add(folded); seen_digests.add(digest)
        if len(digest_index.get(digest, set())) != 1: raise SystemExit("backup checksum gate failed")
        checked += 1
    if checked == 0: raise SystemExit("empty checksum manifest")

def verify_db(path: Path) -> tuple[sqlite3.Connection, list[dict]]:
    uri = f"file:{path.resolve().as_posix()}?mode=ro&immutable=1"
    con = sqlite3.connect(uri, uri=True)
    con.execute("PRAGMA query_only=ON")
    if con.execute("PRAGMA query_only").fetchone() != (1,): raise SystemExit("SQLite is not query-only")
    if con.execute("PRAGMA integrity_check").fetchall() != [("ok",)]: raise SystemExit("SQLite integrity gate failed")
    tables = {x[0] for x in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "registrations" not in tables: raise SystemExit("legacy registration table missing")
    cols = [x[1] for x in con.execute("PRAGMA table_info(registrations)")]
    rows = [dict(zip(cols, row)) for row in con.execute("SELECT * FROM registrations ORDER BY id")]
    if len(rows) != EXPECTED_COUNT: raise SystemExit("legacy row-count gate failed")
    return con, rows

def value(row: dict, *names, required=True):
    for name in names:
        if name in row and row[name] not in (None, ""): return row[name]
    if required: raise SystemExit("required legacy field is absent")
    return None

def load_state(path: Path) -> list[dict]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    works = doc.get("works") if isinstance(doc, dict) else None
    if not isinstance(works, list) or len(works) != REUSE_COUNT: raise SystemExit("expected-state 14-work gate failed")
    required = {"publicId", "displayOrder", "audioObjectKey", "size", "sha256"}
    if any(not required <= set(x) for x in works): raise SystemExit("expected-state field gate failed")
    if len({x["publicId"] for x in works}) != REUSE_COUNT or len({x["displayOrder"] for x in works}) != REUSE_COUNT:
        raise SystemExit("expected-state uniqueness gate failed")
    return works

def plan(args) -> dict:
    root = args.backup.resolve(); source = args.source.resolve()
    if source == root or source in root.parents: raise SystemExit("source and private backup must be separate")
    if "AUDIT_ACCEPTED=true" not in args.audit.read_text(encoding="utf-8"):
        raise SystemExit("accepted-audit gate failed")
    verify_checksums(root)
    db = root / "extracted/data/guyun-registration.sqlite3"
    uploads = root / "extracted/data/uploads"
    con, rows = verify_db(db)
    files = [x for x in uploads.iterdir() if x.is_file()]
    if len(files) != EXPECTED_COUNT: raise SystemExit("audio file-count gate failed")
    by_name = {x.name: (x, x.stat().st_size, sha256(x)) for x in files}
    normalized = []
    for row in rows:
        name = str(value(row, "stored_filename", "audio_filename", "filename"))
        if name not in by_name: raise SystemExit("one-to-one audio reconciliation failed")
        path, size, digest = by_name[name]
        declared = value(row, "audio_size", "file_size", required=False)
        if declared is not None and int(declared) != size: raise SystemExit("legacy audio size gate failed")
        normalized.append({
            "owner": str(value(row, "discord_user_id", "discord_id", "user_id")),
            "username": str(value(row, "discord_username", "username", required=False) or "legacy-owner"),
            "display": str(value(row, "display_name", "discord_display_name", "discord_username", "username", required=False) or "legacy-owner"),
            "title": str(value(row, "work_title", "title")), "category": str(value(row, "category")),
            "description": str(value(row, "description", required=False) or ""),
            "contact": str(value(row, "contact_email", "email", required=False) or ""), "name": name,
            "size": size, "sha256": digest, "contentType": str(value(row, "audio_content_type", "content_type", required=False) or "audio/mpeg"),
            "created": str(value(row, "created_at")), "updated": str(value(row, "updated_at", required=False) or value(row, "created_at")),
        })
    if len({x["owner"] for x in normalized}) != EXPECTED_COUNT or len({x["name"] for x in normalized}) != EXPECTED_COUNT:
        raise SystemExit("unique-owner/file gate failed")
    current = load_state(args.expected_state)
    by_hash = {(x["sha256"].lower(), int(x["size"])): x for x in current}
    reused = [x for x in normalized if (x["sha256"], x["size"]) in by_hash]
    missing = [x for x in normalized if (x["sha256"], x["size"]) not in by_hash]
    if (len(reused), len(missing)) != (REUSE_COUNT, NEW_COUNT): raise SystemExit("14-reuse/6-new gate failed")
    all_orders = set(range(1, EXPECTED_COUNT + 1)); used = {int(by_hash[(x["sha256"], x["size"])]["displayOrder"]) for x in reused}
    remaining = sorted(all_orders - used)
    # Missing works follow authoritative legacy registration order; no private value influences tie-breaking.
    for item, order in zip(missing, remaining): item.update(displayOrder=order, publicId=f"legacy-{order:03d}", key=f"active/{secrets.token_urlsafe(32)}", isNew=True)
    for item in reused:
        old = by_hash[(item["sha256"], item["size"])]
        item.update(displayOrder=int(old["displayOrder"]), publicId=old["publicId"], key=old["audioObjectKey"], isNew=False)
    ordered = sorted(normalized, key=lambda x: x["displayOrder"])
    if [x["displayOrder"] for x in ordered] != list(range(1, 21)): raise SystemExit("20-order gate failed")
    plan_hash = hashlib.sha256(json.dumps([{k:x[k] for k in ("publicId","displayOrder","size","sha256")} for x in ordered],sort_keys=True,separators=(",",":")).encode()).hexdigest()
    return {"rows": ordered, "dbHash": sha256(db), "stateHash": sha256(args.expected_state), "planHash": plan_hash, "reused": len(reused), "new": len(missing), "con": con}

def render_sql(p: dict) -> str:
    lines = ["PRAGMA foreign_keys=ON;", "BEGIN IMMEDIATE;"]
    for x in p["rows"]:
        lines.append("INSERT INTO users(discord_user_id,username_snapshot,display_name_snapshot,roles_json,roles_checked_at,created_at,updated_at) VALUES("+",".join(map(q,[x["owner"],x["username"],x["display"],"[]",x["updated"],x["created"],x["updated"]]))+") ON CONFLICT(discord_user_id) DO NOTHING;")
        values=[x["publicId"],x["owner"],x["title"],x["category"],x["description"],x["contact"],x["key"],x["name"],x["contentType"],x["size"],x["sha256"],"active",0,1,x["created"],x["updated"],x["displayOrder"],1]
        lines.append("INSERT INTO registrations(public_id,discord_user_id,title,category,description,contact_email,audio_object_key,audio_original_name,audio_content_type,audio_size,audio_sha256,audio_state,is_test,published,created_at,updated_at,display_order,preserve_audio_object) VALUES("+",".join(map(q,values))+") ON CONFLICT(discord_user_id) DO NOTHING;")
    ids=",".join(q(x["publicId"]) for x in p["rows"] if x["displayOrder"] in {int(y["displayOrder"]) for y in p["rows"]})
    lines.append(f"UPDATE published_works SET published=0 WHERE published=1 AND public_id IN ({ids}) AND EXISTS (SELECT 1 FROM registrations r WHERE r.public_id=published_works.public_id AND r.audio_sha256=published_works.audio_sha256 AND r.audio_size=published_works.audio_size AND r.published=1);")
    lines.append("COMMIT;")
    return "\n".join(lines)+"\n"

def main() -> None:
    ap=argparse.ArgumentParser()
    ap.add_argument("--backup",type=Path,required=True); ap.add_argument("--source",type=Path,required=True)
    ap.add_argument("--audit",type=Path,required=True); ap.add_argument("--expected-state",type=Path,required=True)
    ap.add_argument("--private-output",type=Path); ap.add_argument("--mode",choices=("dry-run","reconcile","prepare"),default="dry-run")
    ap.add_argument("--d1-backup",type=Path); ap.add_argument("--r2-inventory",type=Path)
    ap.add_argument("--production",action="store_true"); ap.add_argument("--confirm-account"); ap.add_argument("--confirm-d1"); ap.add_argument("--confirm-r2"); ap.add_argument("--confirm-version")
    args=ap.parse_args(); p=plan(args)
    if args.mode=="prepare":
        if not args.private_output: raise SystemExit("prepare requires private output")
        if not args.production or not all((args.confirm_account,args.confirm_d1,args.confirm_r2,args.confirm_version)):
            raise SystemExit("explicit production account/resource/version confirmations required")
        if not args.d1_backup or not args.r2_inventory or not args.d1_backup.is_file() or not args.r2_inventory.is_file():
            raise SystemExit("verified D1 backup and R2 inventory gates are required")
        if args.d1_backup.stat().st_size == 0 or args.r2_inventory.stat().st_size == 0:
            raise SystemExit("empty D1 backup or R2 inventory gate")
        if args.source.resolve() in args.private_output.resolve().parents: raise SystemExit("private output must be outside source")
        sql=render_sql(p); atomic_private(args.private_output/"import.sql",sql)
        ledger={"schemaVersion":1,"state":"prepared","planSha256":p["planHash"],"sqlSha256":hashlib.sha256(sql.encode()).hexdigest(),"counts":{"registrations":20,"reusedObjects":14,"newObjects":6},"newObjects":[{"key":x["key"],"sha256":x["sha256"],"size":x["size"]} for x in p["rows"] if x["isNew"]]}
        atomic_private(args.private_output/"rollback-ledger.private.json",json.dumps(ledger,separators=(",",":"),sort_keys=True))
    print(json.dumps({"accepted":True,"mode":args.mode,"counts":{"registrations":20,"reusedObjects":14,"newObjects":6},"planSha256":p["planHash"]},sort_keys=True))

if __name__ == "__main__": main()
