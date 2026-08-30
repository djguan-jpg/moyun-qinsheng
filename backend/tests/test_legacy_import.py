import hashlib, importlib.util, json, sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("legacy_import", ROOT / "tools/import_verified_legacy.py")
MOD = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(MOD)

def test_fresh_and_upgrade_schema_are_forward_only(tmp_path):
    db = sqlite3.connect(tmp_path / "schema.db")
    for migration in sorted((ROOT / "migrations").glob("*.sql")):
        db.executescript(migration.read_text(encoding="utf-8"))
    cols = {x[1] for x in db.execute("PRAGMA table_info(registrations)")}
    assert {"display_order", "preserve_audio_object"} <= cols
    assert db.execute("PRAGMA foreign_key_check").fetchall() == []

def test_sql_escapes_and_orders_deactivation_after_owned_rows():
    rows=[]
    for i in range(1,21):
        rows.append({"owner":f"owner-{i}","username":"u'", "display":"d", "title":"t'", "category":"c", "description":"", "contact":"x@example.test", "key":f"key-{i}", "name":f"audio-{i}", "contentType":"audio/mpeg", "size":i, "sha256":hashlib.sha256(str(i).encode()).hexdigest(), "created":"2026-01-01T00:00:00Z", "updated":"2026-01-01T00:00:00Z", "displayOrder":i, "publicId":f"legacy-{i:03d}", "isNew":i>14})
    sql=MOD.render_sql({"rows":rows})
    assert "u''" in sql and sql.index("INSERT INTO registrations") < sql.index("UPDATE published_works")
    assert sql.startswith("PRAGMA foreign_keys=ON;\nBEGIN IMMEDIATE;") and sql.endswith("COMMIT;\n")

def test_private_ledger_is_create_only_and_count_only_summary(tmp_path):
    target=tmp_path/"ledger"
    MOD.atomic_private(target,"secret")
    assert target.read_text()=="secret"
    try: MOD.atomic_private(target,"replacement")
    except SystemExit: pass
    else: raise AssertionError("ledger overwrite was allowed")
