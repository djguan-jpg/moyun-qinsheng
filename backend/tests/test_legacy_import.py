import hashlib, importlib.util, json, os, sqlite3
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
    db_hash=hashlib.sha256(b"synthetic legacy database").hexdigest()
    plan_hash=hashlib.sha256(b"synthetic deterministic plan").hexdigest()
    sql=MOD.render_sql({"rows":rows,"dbHash":db_hash,"planHash":plan_hash})
    assert "u''" in sql and sql.index("INSERT INTO registrations") < sql.index("UPDATE published_works") < sql.index("INSERT INTO legacy_import_runs")
    assert sql.startswith("PRAGMA foreign_keys=ON;\n")
    assert not MOD.TRANSACTION_TOKEN.search(sql)
    MOD.validate_import_sql(sql)

def test_generated_batch_validation_rejects_missing_duplicate_and_count_mismatch():
    rows=[]
    for i in range(1,21):
        rows.append({"owner":f"owner-{i}","username":"u", "display":"d", "title":"t", "category":"c", "description":"", "contact":"", "key":f"key-{i}", "name":f"audio-{i}", "contentType":"audio/mpeg", "size":i, "sha256":hashlib.sha256(str(i).encode()).hexdigest(), "created":"2026-01-01T00:00:00Z", "updated":"2026-01-01T00:00:00Z", "displayOrder":i, "publicId":f"legacy-{i:03d}", "isNew":i>14})
    sql=MOD.render_sql({"rows":rows,"dbHash":hashlib.sha256(b"synthetic db").hexdigest(),"planHash":hashlib.sha256(b"synthetic plan").hexdigest()})
    bad=["BEGIN;\n"+sql, sql.replace("INSERT INTO users(","INSERT INTO userz(",1),
         sql.replace("'legacy-002'","'legacy-001'",1), sql.replace("UPDATE published_works SET published=0","UPDATE published_works SET published=1"),
         sql.replace("INSERT INTO legacy_import_runs(","INSERT INTO damaged_audit(",1),
         sql.replace(",20,14,6,'applied',",",20,13,7,'prepared',",1),
         sql.replace("legacy_import_runs.expected_state_sha256=excluded.expected_state_sha256", "legacy_import_runs.expected_state_sha256<>excluded.expected_state_sha256",1),
         sql+next(line for line in sql.splitlines() if line.startswith("INSERT INTO legacy_import_runs("))+"\n"]
    for value in bad:
        try: MOD.validate_import_sql(value)
        except SystemExit: pass
        else: raise AssertionError("malformed generated batch unexpectedly accepted")

def test_wrangler_4_file_argv_preserves_windows_spaces_without_shell_quoting(tmp_path):
    sql=tmp_path/"private output"/"import file.sql"
    sql.parent.mkdir()
    sql.write_text("SELECT 1;",encoding="utf-8")
    argv=MOD.wrangler_import_argv("exact-production-name",sql)
    assert argv[:4]==["npx","wrangler","d1","execute"]
    assert argv[4:6]==["exact-production-name","--remote"]
    assert argv[6].startswith("--file=") and "private output" in argv[6]
    assert '"' not in argv[6] and "wrangler" in argv

def test_transaction_gate_covers_all_control_tokens_and_argv_parameters(tmp_path):
    for token in ("BEGIN;", "COMMIT;", "END;", "ROLLBACK;", "SAVEPOINT x;", "RELEASE x;"):
        try: MOD.validate_import_sql(token)
        except SystemExit: pass
        else: raise AssertionError(f"transaction token accepted: {token}")
    sql=tmp_path/"file.sql"
    for database,path in (("--help",sql),("bad name",sql),("valid-db",tmp_path/"file.txt")):
        try: MOD.wrangler_import_argv(database,path)
        except SystemExit: pass
        else: raise AssertionError("invalid Wrangler argv parameters accepted")

def _rows():
    return [{"owner":f"owner-{i}","username":"u", "display":"d", "title":"t", "category":"c", "description":"", "contact":"", "key":f"key-{i}", "name":f"audio-{i}", "contentType":"audio/mpeg", "size":i, "sha256":hashlib.sha256(str(i).encode()).hexdigest(), "created":"2026-01-01T00:00:00Z", "updated":"2026-01-01T00:00:00Z", "displayOrder":i, "publicId":f"legacy-{i:03d}", "isNew":i>14} for i in range(1,21)]

def _plan():
    return {"rows":_rows(),"dbHash":hashlib.sha256(b"synthetic legacy sqlite").hexdigest(),"planHash":hashlib.sha256(b"synthetic 20-item plan").hexdigest()}

def _apply_batch(db, sql, fail_at=None):
    statements=[x.strip() for x in sql.split(";") if x.strip()]
    with db:
        for index, statement in enumerate(statements):
            if index == fail_at: statement="INSERT INTO definitely_missing_table VALUES(1)"
            db.execute(statement)

def test_documented_batch_model_rolls_back_middle_failure_and_reruns_idempotently(tmp_path):
    db=sqlite3.connect(tmp_path/"atomic.db")
    for migration in sorted((ROOT/"migrations").glob("*.sql")):
        db.executescript(migration.read_text(encoding="utf-8"))
    plan=_plan(); rows=plan["rows"]
    for x in rows[:14]:
        db.execute("INSERT INTO published_works(public_id,display_order,audio_object_key,audio_content_type,audio_size,audio_sha256,source_manifest_id,created_at) VALUES(?,?,?,?,?,?,?,?)",
                   (x["publicId"],x["displayOrder"],x["key"],x["contentType"],x["size"],x["sha256"],"synthetic-manifest",x["created"]))
    db.commit()
    before={table:db.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()
            for table in ("users","registrations","published_works","legacy_import_runs")}
    sql=MOD.render_sql(plan)
    try: _apply_batch(db,sql,fail_at=20)
    except sqlite3.OperationalError: pass
    else: raise AssertionError("injected middle-statement failure was accepted")
    assert db.execute("SELECT count(*) FROM users").fetchone()==(0,)
    assert db.execute("SELECT count(*) FROM registrations").fetchone()==(0,)
    assert {table:db.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()
            for table in before}==before
    _apply_batch(db,sql)
    audit_after_first=db.execute("SELECT * FROM legacy_import_runs").fetchall()
    _apply_batch(db,sql); _apply_batch(db,sql)
    assert db.execute("SELECT count(*),count(DISTINCT discord_user_id) FROM users").fetchone()==(20,20)
    assert db.execute("SELECT count(*),count(DISTINCT discord_user_id),count(DISTINCT public_id) FROM registrations WHERE audio_state='active'").fetchone()==(20,20,20)
    assert db.execute("SELECT count(*) FROM published_works WHERE published=0").fetchone()==(14,)
    assert db.execute("SELECT count(*) FROM published_works WHERE published=1").fetchone()==(0,)
    assert db.execute("SELECT count(*) FROM legacy_import_runs").fetchone()==(1,)
    assert db.execute("SELECT import_id,source_sha256,expected_state_sha256,registration_count,reused_object_count,new_object_count,state,rolled_back_at FROM legacy_import_runs").fetchone()==(
        MOD.audit_import_id(plan["dbHash"],plan["planHash"]),plan["dbHash"],plan["planHash"],20,14,6,"applied",None)
    assert db.execute("SELECT * FROM legacy_import_runs").fetchall()==audit_after_first
    assert db.execute("PRAGMA foreign_key_check").fetchall()==[]

def test_same_source_with_different_plan_aborts_without_changes(tmp_path):
    db=sqlite3.connect(tmp_path/"conflict.db")
    for migration in sorted((ROOT/"migrations").glob("*.sql")):
        db.executescript(migration.read_text(encoding="utf-8"))
    plan=_plan(); _apply_batch(db,MOD.render_sql(plan))
    before={table:db.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()
            for table in ("users","registrations","published_works","legacy_import_runs")}
    conflict={**plan,"planHash":hashlib.sha256(b"different synthetic plan").hexdigest()}
    try: _apply_batch(db,MOD.render_sql(conflict))
    except sqlite3.IntegrityError: pass
    else: raise AssertionError("same-source different-plan conflict was accepted")
    assert {table:db.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()
            for table in before}==before

def test_private_ledger_is_create_only_and_count_only_summary(tmp_path):
    target=tmp_path/"ledger"
    MOD.atomic_private(target,"secret")
    assert target.read_text()=="secret"
    try: MOD.atomic_private(target,"replacement")
    except SystemExit: pass
    else: raise AssertionError("ledger overwrite was allowed")

def _manifest(root, entries):
    (root / "checksums.sha256").write_text("".join(f"{digest}  {rel}\n" for digest, rel in entries), encoding="utf-8")

def test_checksum_gate_accepts_thin_root_and_adjacent_part(tmp_path):
    root=tmp_path/"verified"; root.mkdir(); nested=root/"extracted"; nested.mkdir()
    payload=nested/"renamed.bin"; payload.write_bytes(b"payload")
    part=tmp_path/"backup.part-001"; part.write_bytes(b"part")
    _manifest(root,[(hashlib.sha256(b"payload").hexdigest(),"original.bin"),
                    (hashlib.sha256(b"part").hexdigest(),part.name)])
    MOD.verify_checksums(root)

def test_checksum_gate_is_crlf_and_mtime_independent_but_rejects_bom(tmp_path):
    root=tmp_path/"verified"; root.mkdir(); payload=root/"payload.bin"; payload.write_bytes(b"payload")
    value=hashlib.sha256(b"payload").hexdigest()
    (root/"checksums.sha256").write_bytes(f"{value}  payload.bin\r\n".encode())
    os.utime(payload,(1,1)); MOD.verify_checksums(root)
    (root/"checksums.sha256").write_bytes(b"\xef\xbb\xbf"+f"{value}  payload.bin\n".encode())
    try: MOD.verify_checksums(root)
    except SystemExit: pass
    else: raise AssertionError("BOM manifest unexpectedly accepted")

def test_checksum_gate_fail_closed_fixtures(tmp_path):
    def fixture(name):
        root=tmp_path/name/"verified"; root.mkdir(parents=True)
        (root/"payload.bin").write_bytes(b"payload")
        value=hashlib.sha256(b"payload").hexdigest()
        _manifest(root,[(value,"payload.bin")]); return root,value
    missing,value=fixture("missing"); (missing/"payload.bin").unlink()
    changed,_=fixture("changed"); (changed/"payload.bin").write_bytes(b"payloae")
    duplicate,value=fixture("duplicate"); _manifest(duplicate,[(value,"payload.bin"),(value,"copy.bin")])
    escape,value=fixture("escape"); _manifest(escape,[(value,"../payload.bin")])
    extra,value=fixture("extra"); (extra/"copy.tar.gz").write_bytes(b"payload")
    for root in (missing,changed,duplicate,escape,extra):
        try: MOD.verify_checksums(root)
        except SystemExit: pass
        else: raise AssertionError(f"checksum fixture unexpectedly accepted: {root.parent.name}")
