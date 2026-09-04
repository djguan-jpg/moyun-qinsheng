import dataclasses
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tools.production_adapter import (
    CloudflareProductionAdapter, CommandResult, CommandRunner, EvidenceRunner, ObjectSpec, QuerySpec,
    MIGRATION_PATH, MIGRATION_PROVENANCE, MIGRATION_SHA256, PINNED_WRANGLER,
    ProductionExecutionConfig, ProductionSafetyError,
    ReceiptLedger, _verify_source_checkout, guard_existing_private, guard_new_private,
    parse_custom_domains_disabled, parse_dev_url_disabled, parse_live_evidence,
    parse_object_metadata, parse_public_access, parse_resource_preflight, verify_object_file,
    verify_sqlite_export,
)
from tools.production_complete import CONFIRMATIONS, execute
from tools.production_state_machine import LIVE_BOOLEAN_GATES, LIVE_COUNT_GATES, ProductionPlan, run


class FakeRunner:
    def __init__(self, outputs=None, fail_at=None):
        self.outputs = outputs or {}
        self.fail_at = fail_at
        self.calls = []

    def _wrangler(self, args, evidence_file=None, mutation=False):
        self.calls.append((list(args), evidence_file, mutation))
        index = len(self.calls) - 1
        raw = self.outputs.get(index, b"")
        if evidence_file is not None:
            evidence_file.parent.mkdir(parents=True, exist_ok=True)
            evidence_file.write_bytes(raw if isinstance(raw, bytes) else str(raw).encode())
        return CommandResult(index != self.fail_at, "COMMAND_NONZERO" if index == self.fail_at else "OK")


class FakeEvidenceRunner:
    def __init__(self, results=None, fail=False):
        self.results = results or {}; self.fail = fail; self.calls = []

    def collect(self, mode, output, nonce, args):
        self.calls.append((mode, output, nonce, list(args)))
        if self.fail: return CommandResult(False, "COMMAND_NONZERO")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({"nonce": nonce, "result": self.results.get(mode, {})}))
        return CommandResult(True, "OK")


def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.base = Path(self.t.name)
        self.repo = self.base / "repo"; self.repo.mkdir()
        self.repo.joinpath(".gitignore").write_bytes(Path(__file__).resolve().parents[1].joinpath(".gitignore").read_bytes())
        self.migration = self.repo / MIGRATION_PATH; self.migration.parent.mkdir()
        self.migration.write_bytes((Path(__file__).resolve().parents[1] / MIGRATION_PATH).read_bytes())
        subprocess.run(["git", "init", "-b", "main"], cwd=self.repo, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.email", "fixture"], cwd=self.repo, check=True)
        subprocess.run(["git", "config", "user.name", "Source Integrity Test"], cwd=self.repo, check=True)
        subprocess.run(["git", "add", "."], cwd=self.repo, check=True)
        subprocess.run(["git", "commit", "-m", "fixture"], cwd=self.repo, check=True, capture_output=True)
        self.source_commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.repo, check=True,
                                            text=True, capture_output=True).stdout.strip()
        self.private = self.base / "private"; self.private.mkdir()
        self.out = self.private / "out"
        self.token = self.private / "token"; self.token.write_text("TOKEN_VALUE")
        self.sql = self.private / "import.sql"; self.sql.write_text("CREATE TABLE t(id INTEGER PRIMARY KEY);")
        self.sources = []
        for i in range(20):
            p = self.private / f"audio-{i}.bin"; p.write_bytes(b"ID3" + bytes([i]))
            self.sources.append(p)
        self.legacy = tuple(self.spec(i, f"legacy-{i}") for i in range(14))
        self.new = tuple(self.spec(i + 14, f"new-{i}") for i in range(6))
        self.config = ProductionExecutionConfig(
            "account", "zone", "worker", "database", "db-id", "bucket", "contest.zoeg.studio", self.source_commit,
            self.legacy, self.new, tuple(f"owner-{i}" for i in range(20)), self.sql, digest(self.sql),
            {"baseline:0004": QuerySpec("SELECT 'baseline-fixture'", {"baseline": True}),
             "migration:0005": QuerySpec("SELECT 'migration-fixture'", {"migration": True}),
             "post_import": QuerySpec("SELECT 'post-import-fixture'", {"imported": True}),
             "post_rollback": QuerySpec("SELECT 'rollback-14-anon-0-owned-0-users-0-registrations'", {"anonymous":14,"owned":0,"users":0,"registrations":0})},
            ("https://developers.cloudflare.com/d1/wrangler-commands/", MIGRATION_PROVENANCE), self.out, self.token,
            self.migration, MIGRATION_SHA256,
        )

    def tearDown(self): self.t.cleanup()

    def spec(self, i, key):
        p = self.sources[i]
        return ObjectSpec(key, p, digest(p), p.stat().st_size, "494433", "audio/mpeg")

    def write_config(self, mutate=None):
        value = {
            "account_id":"account", "zone_id":"zone", "worker_name":"worker", "d1_name":"database", "d1_id":"db-id",
            "r2_bucket":"bucket", "canonical_domain":"contest.zoeg.studio", "source_commit":self.source_commit,
            "legacy":[{"key":x.key,"source":str(x.source),"sha256":x.sha256,"size":x.size,"magic_hex":x.magic_hex,"mime":x.mime} for x in self.legacy],
            "new":[{"key":x.key,"source":str(x.source),"sha256":x.sha256,"size":x.size,"magic_hex":x.magic_hex,"mime":x.mime} for x in self.new],
            "owners":[f"owner-{i}" for i in range(20)], "import_sql":str(self.sql),
            "import_sql_sha256":digest(self.sql), "expected_queries":{
                "baseline:0004":{"sql":"SELECT baseline_fixture","expected":{"baseline":True}},
                "migration:0005":{"sql":"SELECT migration_fixture","expected":{"migration":True}},
                "post_import":{"sql":"SELECT post_import_fixture","expected":{"imported":True}},
                "post_rollback":{"sql":"SELECT rollback_fixture","expected":{"anonymous":14,"owned":0,"users":0,"registrations":0}}},
            "provenance":["https://developers.cloudflare.com/d1/wrangler-commands/",MIGRATION_PROVENANCE],
            "private_output":str(self.out), "token_file":str(self.token),
            "migration_path":MIGRATION_PATH, "migration_sha256":MIGRATION_SHA256}
        if mutate: mutate(value)
        path = self.private / "config.json"; path.write_text(json.dumps(value)); return path

    def test_closed_schema_unknown_missing_and_type_fail(self):
        for mutation in (lambda x:x.update(extra=True), lambda x:x.pop("d1_id"), lambda x:x.update(owners="bad")):
            with self.subTest(mutation=mutation):
                with self.assertRaises(ProductionSafetyError): ProductionExecutionConfig.load(self.write_config(mutation), self.repo)

    def test_query_specs_are_closed_exact_and_redacted(self):
        loaded = ProductionExecutionConfig.load(self.write_config(), self.repo)
        rendered = repr(loaded)
        self.assertNotIn("SELECT baseline_fixture", rendered)
        self.assertNotIn("anonymous", rendered)
        for mutation in (
            lambda x: x["expected_queries"].update(unknown={"sql":"SELECT 1","expected":1}),
            lambda x: x["expected_queries"].pop("post_rollback"),
            lambda x: x["expected_queries"]["post_import"].update(extra=True),
            lambda x: x.update(live_evidence_command=["arbitrary-tool"]),
        ):
            with self.subTest(mutation=mutation), self.assertRaises(ProductionSafetyError):
                ProductionExecutionConfig.load(self.write_config(mutation), self.repo)

    def test_query_uses_fixture_sql_not_label_and_never_exposes_sql(self):
        runner = FakeRunner(outputs={0: json.dumps({"imported":True})})
        adapter = CloudflareProductionAdapter(self.config, self.repo, runner, FakeEvidenceRunner())
        self.assertTrue(adapter.post_import_reconcile(20))
        argv = runner.calls[0][0]
        self.assertIn("SELECT 'post-import-fixture'", argv)
        self.assertNotIn("post_import", argv)
        self.assertNotIn("post-import-fixture", repr(adapter.config))
        self.assertIsNone(adapter._query("unknown"))

    def test_post_rollback_has_independent_semantic_fixture(self):
        expected = {"anonymous":14,"owned":0,"users":0,"registrations":0}
        runner = FakeRunner(outputs={0: json.dumps(expected)})
        adapter = CloudflareProductionAdapter(self.config, self.repo, runner, FakeEvidenceRunner())
        self.assertTrue(adapter.post_rollback_reconcile(20))
        self.assertIn("rollback-14-anon-0-owned-0-users-0-registrations", " ".join(runner.calls[0][0]))

    def test_config_counts_commit_and_provenance_fail_closed(self):
        mutations = [lambda x:x.update(source_commit="0"*40), lambda x:x.update(source_commit="A"*40),
                     lambda x:x.update(source_commit="a"*39), lambda x:x.update(legacy=x["legacy"][:-1]),
                     lambda x:x.update(new=x["new"][:-1]), lambda x:x.update(owners=x["owners"][:-1]),
                     lambda x:x.update(provenance=["http://unofficial.invalid/"])]
        for mutation in mutations:
            with self.subTest(mutation=mutation), self.assertRaises(ProductionSafetyError):
                ProductionExecutionConfig.load(self.write_config(mutation), self.repo)

    def test_source_commit_is_dynamic_head_not_a_static_trust_anchor(self):
        self.assertTrue(_verify_source_checkout(self.repo, self.source_commit))
        self.assertNotIn("SOURCE_COMMIT", Path(__file__).resolve().parents[1].joinpath("tools/production_adapter.py").read_text())
        loaded = ProductionExecutionConfig.load(self.write_config(), self.repo)
        self.assertEqual(loaded.source_commit, self.source_commit)

    def test_source_checkout_rejects_malformed_uppercase_mismatch_and_detached(self):
        for value in ("", "0" * 39, "G" * 40, self.source_commit.upper(), "0" * 40):
            with self.subTest(value=value):
                self.assertFalse(_verify_source_checkout(self.repo, value))
        subprocess.run(["git", "checkout", "--detach"], cwd=self.repo, check=True, capture_output=True)
        self.assertFalse(_verify_source_checkout(self.repo, self.source_commit))

    def test_source_checkout_rejects_tracked_staged_and_untracked_source_or_config(self):
        cases = ("modified", "staged", "untracked.py", "private-config.json")
        for case in cases:
            with self.subTest(case=case):
                if case == "modified":
                    self.migration.write_text("changed")
                elif case == "staged":
                    self.migration.write_text("changed"); subprocess.run(["git", "add", "."], cwd=self.repo, check=True)
                else:
                    (self.repo / case).write_text("unexpected")
                self.assertFalse(_verify_source_checkout(self.repo, self.source_commit))
                subprocess.run(["git", "reset", "--hard", "HEAD"], cwd=self.repo, check=True, capture_output=True)
                for path in self.repo.glob("untracked.py"): path.unlink()
                for path in self.repo.glob("private-config.json"): path.unlink()

    def test_source_checkout_generated_allowlist_is_exact(self):
        for name in ("node_modules", "dist", ".wrangler", "tools/__pycache__"):
            path = self.repo / name; path.mkdir(parents=True); (path / "generated").write_text("x")
        (self.repo / "worker-configuration.d.ts").write_text("generated")
        self.assertTrue(_verify_source_checkout(self.repo, self.source_commit))
        (self.repo / "other-generated.txt").write_text("x")
        self.assertFalse(_verify_source_checkout(self.repo, self.source_commit))

    def test_source_checkout_rejects_nested_repo_top_level_and_every_git_error(self):
        nested = self.repo / "nested"; nested.mkdir()
        self.assertFalse(_verify_source_checkout(nested, self.source_commit))
        with mock.patch("subprocess.run", side_effect=OSError):
            self.assertFalse(_verify_source_checkout(self.repo, self.source_commit))

    def test_config_and_specs_are_immutable_and_repr_redacted(self):
        with self.assertRaises(dataclasses.FrozenInstanceError): self.config.worker_name = "x"
        rendered = repr(self.config)
        for sensitive in ("TOKEN_VALUE", "owner-0", str(self.sql), "account", "db-id", "new-0"):
            self.assertNotIn(sensitive, rendered)

    def test_paths_reject_repo_files_and_nonexistent_parent(self):
        inside = self.repo / "x"; inside.write_text("x")
        with self.assertRaises(ProductionSafetyError): guard_existing_private(inside, self.repo)
        with self.assertRaises(ProductionSafetyError): guard_new_private(self.repo / "out", self.repo)
        with self.assertRaises(ProductionSafetyError): guard_new_private(self.private / "missing" / "out", self.repo)
        with self.assertRaises(ProductionSafetyError): guard_existing_private("relative", self.repo)
        with self.assertRaises(ProductionSafetyError): guard_new_private("relative", self.repo)

    def test_paths_reject_symlink_traversal_when_supported(self):
        target = self.private / "target"; target.mkdir(); (target / "x").write_text("x")
        link = self.private / "link"
        try: link.symlink_to(target, target_is_directory=True)
        except OSError: self.skipTest("symlink privilege unavailable")
        with self.assertRaises(ProductionSafetyError): guard_existing_private(link / "x", self.repo)
        with self.assertRaises(ProductionSafetyError): guard_new_private(link / "new", self.repo)

    def test_runner_pinned_binary_shell_false_and_token_env_only(self):
        bindir = self.repo / "node_modules" / ".bin"; bindir.mkdir(parents=True)
        binary = bindir / ("wrangler.cmd" if os.name == "nt" else "wrangler"); binary.write_text("")
        runner = CommandRunner(self.repo, self.token)
        seen = {}
        def fake(argv, **kwargs):
            seen.update(argv=argv, kwargs=kwargs)
            return subprocess.CompletedProcess(argv, 0, PINNED_WRANGLER.encode(), b"")
        with mock.patch("subprocess.run", side_effect=fake): self.assertTrue(runner._wrangler(["--version"], evidence_file=None, mutation=False).ok)
        self.assertFalse(seen["kwargs"]["shell"])
        self.assertNotIn("TOKEN_VALUE", repr(seen["argv"]))
        self.assertEqual(seen["kwargs"]["env"]["CLOUDFLARE_API_TOKEN"], "TOKEN_VALUE")

    def test_runner_redacts_token_and_nonzero_has_no_raw_result(self):
        bindir = self.repo / "node_modules" / ".bin"; bindir.mkdir(parents=True)
        (bindir / ("wrangler.cmd" if os.name == "nt" else "wrangler")).write_text("")
        runner = CommandRunner(self.repo, self.token); evidence = self.private / "raw"
        completed = subprocess.CompletedProcess([], 7, b"TOKEN_VALUE", b"owner@example.test")
        with mock.patch("subprocess.run", return_value=completed): result = runner._wrangler(["x"], evidence_file=evidence, mutation=False)
        self.assertFalse(result.ok); self.assertNotIn("TOKEN_VALUE", repr(result)); self.assertNotIn(b"TOKEN_VALUE", evidence.read_bytes())

    def test_generic_runner_forbidden_and_evidence_runner_fixed_missing_helper(self):
        bindir = self.repo / "node_modules" / ".bin"; bindir.mkdir(parents=True)
        (bindir / ("wrangler.cmd" if os.name == "nt" else "wrangler")).write_text("")
        runner = CommandRunner(self.repo, self.token)
        with self.assertRaisesRegex(ProductionSafetyError, "COMMAND_FORBIDDEN"):
            runner.run(["arbitrary"], evidence_file=None, mutation=False)
        evidence = EvidenceRunner(self.repo, self.token)
        self.assertFalse(evidence.collect("live-gate", self.private/"x", "a"*64, []).ok)

    def test_exact_argv_shapes(self):
        runner = FakeRunner(); adapter = CloudflareProductionAdapter(self.config, self.repo, runner)
        adapter.upload_new_key("new-0")
        self.assertEqual(runner.calls[0][0], ["r2","object","put","bucket/new-0","--remote","--file",str(self.new[0].source),"--content-type","audio/mpeg","--force"])
        adapter.import_d1_once(); adapter.deploy_once()
        self.assertEqual(runner.calls[2][0], ["d1","execute","database","--remote","--file",str(self.sql),"--yes"])
        self.assertEqual(runner.calls[3][0], ["deploy","--name","worker","--strict"])

    def test_migration_apply_exact_once_and_schema_verification(self):
        runner = FakeRunner(outputs={1: json.dumps({"migration": True})})
        adapter = CloudflareProductionAdapter(self.config, self.repo, runner)
        self.assertTrue(adapter.apply_migration_0005_once())
        self.assertTrue(adapter.apply_migration_0005_once())
        self.assertTrue(adapter.verify_migration_0005())
        self.assertEqual(runner.calls[0][0], ["d1", "migrations", "apply", "database", "--remote"])
        self.assertEqual(runner.calls[1][0], ["d1", "execute", "database", "--remote", "--command",
                                              "SELECT 'migration-fixture'", "--json"])

    def test_migration_nonzero_is_ambiguous_blocks_retry_and_has_private_receipt(self):
        runner = FakeRunner(fail_at=0)
        adapter = CloudflareProductionAdapter(self.config, self.repo, runner)
        self.assertFalse(adapter.apply_migration_0005_once())
        with self.assertRaisesRegex(ProductionSafetyError, "RECONCILE_NEEDED"):
            adapter.apply_migration_0005_once()
        self.assertEqual(len(runner.calls), 1)
        receipt = (self.out / "mutation-receipts.json").read_text()
        self.assertIn('"succeeded":false', receipt)
        for value in (str(self.migration), self.migration.read_text(), str(self.out), "database", "account",
                      self.token.read_text()):
            self.assertNotIn(value, receipt)

    def test_migration_accepted_reentry_requires_exact_receipt_and_schema(self):
        first = CloudflareProductionAdapter(self.config, self.repo, FakeRunner())
        self.assertTrue(first.apply_migration_0005_once())
        runner = FakeRunner(outputs={0: json.dumps({"migration": True})})
        resumed = CloudflareProductionAdapter(self.config, self.repo, runner)
        self.assertTrue(resumed.apply_migration_0005_once())
        self.assertEqual(runner.calls, [])
        self.assertTrue(resumed.verify_migration_0005())
        self.assertEqual(len(runner.calls), 1)

        envelope = json.loads((self.out / "mutation-receipts.json").read_text())
        envelope["payload"]["entries"][1]["fingerprint"] = "0" * 64
        payload = json.dumps(envelope["payload"], sort_keys=True, separators=(",", ":")).encode()
        envelope["sha256"] = hashlib.sha256(payload).hexdigest()
        (self.out / "mutation-receipts.json").write_text(json.dumps(envelope))
        with self.assertRaisesRegex(ProductionSafetyError, "RECONCILE_NEEDED"):
            CloudflareProductionAdapter(self.config, self.repo, FakeRunner()).apply_migration_0005_once()

    def test_migration_schema_mismatch_fails_closed(self):
        runner = FakeRunner(outputs={1: json.dumps({"migration": False})})
        adapter = CloudflareProductionAdapter(self.config, self.repo, runner)
        self.assertTrue(adapter.apply_migration_0005_once())
        self.assertFalse(adapter.verify_migration_0005())

    def test_nonzero_mutation_is_not_retried_and_receipt_blocks_reentry(self):
        runner = FakeRunner(fail_at=0); adapter = CloudflareProductionAdapter(self.config, self.repo, runner)
        self.assertFalse(adapter.import_d1_once()); self.assertEqual(len(runner.calls), 1)
        with self.assertRaises(ProductionSafetyError):
            CloudflareProductionAdapter(self.config, self.repo, FakeRunner()).import_d1_once()

    def test_import_hash_failure_is_pre_mutation_and_rechecked_at_import(self):
        bad = dataclasses.replace(self.config, import_sql_sha256="0"*64)
        runner = FakeRunner(); adapter = CloudflareProductionAdapter(bad, self.repo, runner, FakeEvidenceRunner())
        result = run(ProductionPlan(tuple(x.key for x in bad.new), tuple(x.key for x in bad.legacy)), adapter)
        self.assertEqual(result.mutation_count, 0); self.assertEqual(runner.calls, [])
        adapter = CloudflareProductionAdapter(self.config, self.repo, FakeRunner(), FakeEvidenceRunner())
        self.sql.write_text("changed after preflight")
        self.assertFalse(adapter.import_d1_once()); self.assertEqual(adapter.runner.calls, [])

    def test_receipts_use_six_indexes_no_keys_and_existing_blocks_all_mutation(self):
        runner = FakeRunner(); evidence = FakeEvidenceRunner({"r2-object-metadata":{"content_type":"audio/mpeg","size":4,"sha256":"bad"}})
        adapter = CloudflareProductionAdapter(self.config, self.repo, runner, evidence)
        for spec in self.new:
            adapter.upload_new_key(spec.key)
        receipt = (self.out/"mutation-receipts.json").read_text()
        for i in range(6): self.assertIn(f'"operation":"r2-put-{i}"', receipt)
        for spec in self.legacy + self.new: self.assertNotIn(spec.key, receipt)
        self.assertIn('"created":true', receipt); self.assertIn('"succeeded":true', receipt)
        blocked = CloudflareProductionAdapter(self.config, self.repo, FakeRunner(), FakeEvidenceRunner())
        with self.assertRaisesRegex(ProductionSafetyError, "RECONCILE_NEEDED"): blocked.deploy_once()

    def test_delete_receipt_uses_plan_index_and_legacy_never_deleted(self):
        runner = FakeRunner(); adapter = CloudflareProductionAdapter(self.config, self.repo, runner, FakeEvidenceRunner())
        adapter.created.add("new-3")
        self.assertFalse(adapter.delete_new_key("legacy-0")); self.assertTrue(adapter.delete_new_key("new-3"))
        self.assertIn('"operation":"r2-delete-3"', (self.out/"mutation-receipts.json").read_text())

    def test_delete_only_created_new_never_legacy(self):
        runner = FakeRunner(); adapter = CloudflareProductionAdapter(self.config, self.repo, runner)
        adapter.ledger = mock.Mock(); adapter.created.add("new-0")
        self.assertFalse(adapter.delete_new_key("legacy-0")); self.assertFalse(adapter.delete_new_key("new-1"))
        self.assertTrue(adapter.delete_new_key("new-0")); self.assertIn("bucket/new-0", runner.calls[0][0])

    def test_object_hash_size_magic_and_type_spec(self):
        self.assertTrue(verify_object_file(self.new[0].source, self.new[0]))
        for bad in (dataclasses.replace(self.new[0], size=99), dataclasses.replace(self.new[0], sha256="0"*64), dataclasses.replace(self.new[0], magic_hex="ffff")):
            self.assertFalse(verify_object_file(self.new[0].source, bad))
        self.assertEqual(self.new[0].mime, "audio/mpeg")

    def test_sql_export_restore_integrity_and_foreign_keys(self):
        good = self.private / "good.sql"; good.write_text("PRAGMA foreign_keys=ON; CREATE TABLE p(id PRIMARY KEY); CREATE TABLE c(p REFERENCES p(id)); INSERT INTO p VALUES(1); INSERT INTO c VALUES(1);")
        bad = self.private / "bad.sql"; bad.write_text("PRAGMA foreign_keys=OFF; CREATE TABLE p(id PRIMARY KEY); CREATE TABLE c(p REFERENCES p(id)); INSERT INTO c VALUES(2);")
        malformed = self.private / "malformed.sql"; malformed.write_text("NOT SQL")
        self.assertTrue(verify_sqlite_export(good)); self.assertFalse(verify_sqlite_export(bad)); self.assertFalse(verify_sqlite_export(malformed))

    def test_public_access_parsers_strict(self):
        for text in (
            "disabled", "not enabled", "R2.dev URL: disabled\n",
            "Public access via the r2.dev URL is disabled.",
            "PUBLIC ACCESS VIA THE R2.DEV URL IS DISABLED.",
            "  Public   access via the r2.dev URL is   disabled.  ",
            "Public access via the r2.dev URL is disabled.\n",
        ):
            self.assertTrue(parse_dev_url_disabled(text))
        for text in (
            "Public access via the r2.dev URL is disabled. extra",
            "Public access via the r2.dev URL is enabled.",
            "Public access via r2.dev URL is disabled.",
            '{"message":"Public access via the r2.dev URL is disabled."}',
            "",
        ):
            self.assertFalse(parse_dev_url_disabled(text))
        self.assertTrue(parse_custom_domains_disabled('{"dev_url_disabled":true,"custom_domains_disabled":true}'))
        for text in ('{"dev_url_disabled":true,"custom_domains_disabled":false}', '{"success":true,"result":[]}', '{"dev_url_disabled":true,"custom_domains_disabled":true,"extra":1}', 'no'):
            self.assertFalse(parse_custom_domains_disabled(text))

    def test_all_evidence_parsers_are_closed_and_typed(self):
        preflight = {name:True for name in ("account_match","zone_match","worker_match","d1_match","r2_match","canonical_domain_match","resource_ids_match")}
        self.assertTrue(parse_resource_preflight(preflight))
        for bad in ({**preflight,"extra":True}, {**preflight,"d1_match":False}, {**preflight,"d1_match":1}, {}): self.assertFalse(parse_resource_preflight(bad))
        metadata = {"content_type":"audio/mpeg","size":4,"sha256":"a"*64}
        self.assertEqual(parse_object_metadata(metadata), metadata); self.assertIsNone(parse_object_metadata({**metadata,"extra":1}))
        self.assertTrue(parse_public_access({"dev_url_disabled":True,"custom_domains_disabled":True})); self.assertFalse(parse_public_access({"dev_url_disabled":True,"custom_domains_disabled":False}))
        live = {x:True for x in __import__('tools.production_state_machine', fromlist=['LIVE_BOOLEAN_GATES']).LIVE_BOOLEAN_GATES}
        live.update(public_owner_count=20,audio_owner_count=20,old_link_occurrences=0)
        self.assertEqual(parse_live_evidence(live), live); self.assertIsNone(parse_live_evidence({**live,"extra":1}))
        for name in LIVE_BOOLEAN_GATES:
            self.assertIsNone(parse_live_evidence({**live, name: False}))
        for name, wrong in (("public_owner_count", 19), ("audio_owner_count", 21), ("old_link_occurrences", 1)):
            self.assertIsNone(parse_live_evidence({**live, name: wrong}))

    def test_node_and_python_live_gate_schema_are_identical(self):
        script = "import('./tools/live_evidence.mjs').then(m=>console.log(JSON.stringify([m.LIVE_BOOLEAN_GATES,m.LIVE_COUNT_GATES])))"
        completed = subprocess.run([shutil.which("node"), "-e", script], cwd=Path(__file__).resolve().parents[1], text=True,
                                   capture_output=True, check=True, shell=False)
        node_boolean, node_count = json.loads(completed.stdout)
        self.assertEqual(tuple(node_boolean), LIVE_BOOLEAN_GATES)
        self.assertEqual(tuple(node_count), LIVE_COUNT_GATES)

    def test_cloudflare_preflight_requires_fresh_nonce_envelope_and_all_matches(self):
        results = {"cloudflare-preflight":{name:True for name in ("account_match","zone_match","worker_match","d1_match","r2_match","canonical_domain_match","resource_ids_match")}}
        runner = FakeRunner(outputs={0: PINNED_WRANGLER}); evidence = FakeEvidenceRunner(results)
        adapter = CloudflareProductionAdapter(self.config, self.repo, runner, evidence)
        self.assertTrue(adapter.config_preflight()); self.assertEqual(evidence.calls[0][0], "cloudflare-preflight")
        self.assertNotIn(adapter.run_nonce, repr({"LIVE_ACCEPTED":False}))
        self.out.joinpath("cloudflare-preflight.json").unlink(); results["cloudflare-preflight"]["zone_match"] = False
        adapter = CloudflareProductionAdapter(self.config, self.repo, FakeRunner(outputs={0:PINNED_WRANGLER}), evidence)
        self.assertFalse(adapter.config_preflight())

    def test_helper_mode_argv_match_closed_contracts(self):
        evidence = FakeEvidenceRunner({
            "r2-object-metadata":{"content_type":"audio/mpeg","size":4,"sha256":"a"*64},
            "r2-public-access":{"dev_url_disabled":True,"custom_domains_disabled":True},
        })
        adapter = CloudflareProductionAdapter(self.config, self.repo, FakeRunner(outputs={0:b"ID3\0"}), evidence)
        adapter._verify_object(self.new[0], "proof.bin")
        self.assertEqual(evidence.calls[0][3], ["--account-id","account","--bucket","bucket","--object-key","new-0"])
        adapter = CloudflareProductionAdapter(self.config, self.repo, FakeRunner(outputs={0:"R2.dev URL: disabled",1:"{}"}), evidence)
        self.assertTrue(adapter.prove_r2_private())
        self.assertEqual(evidence.calls[-1][3], ["--account-id","account","--bucket","bucket"])
        self.out.joinpath("r2-custom-domains.json").unlink()
        adapter = CloudflareProductionAdapter(self.config, self.repo, FakeRunner(), evidence)
        adapter.live_gate()
        self.assertEqual(evidence.calls[-1][3], ["--domain","contest.zoeg.studio","--r2-custom-domains-proof"])

    def test_bad_preflight_stops_core_before_mutation(self):
        bad = {name:True for name in ("account_match","zone_match","worker_match","d1_match","r2_match","canonical_domain_match","resource_ids_match")}
        bad["account_match"] = False
        runner = FakeRunner(outputs={0:PINNED_WRANGLER})
        adapter = CloudflareProductionAdapter(self.config, self.repo, runner, FakeEvidenceRunner({"cloudflare-preflight":bad}))
        result = run(ProductionPlan(tuple(x.key for x in self.new), tuple(x.key for x in self.legacy)), adapter)
        self.assertEqual(result.mutation_count, 0)
        self.assertFalse(any(call[2] for call in runner.calls))

    def test_evidence_envelope_nonce_closed_and_every_preexisting_output_is_stale(self):
        class WrongNonce(FakeEvidenceRunner):
            def collect(self, mode, output, nonce, args):
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_text(json.dumps({"nonce":"0"*64,"result":{}}))
                return CommandResult(True, "OK")
        adapter = CloudflareProductionAdapter(self.config, self.repo, FakeRunner(), WrongNonce())
        self.assertIsNone(adapter._collect("live-gate", "fresh.json", [], parse_live_evidence))
        for name in ("live-evidence.json", "x.metadata.json", "r2-custom-domains.json", "cloudflare-preflight.json"):
            (self.out/name).write_text("old")
            with self.subTest(name=name), self.assertRaisesRegex(ProductionSafetyError, "STALE_EVIDENCE"):
                adapter._collect("live-gate", name, [], parse_live_evidence)
        self.out.joinpath("live-evidence.json").unlink()
        self.out.joinpath("live-evidence.json.gate.json").write_text('{"gate":"LIVE_DEFENSE"}')
        with self.assertRaisesRegex(ProductionSafetyError, "STALE_EVIDENCE"):
            adapter._collect("live-gate", "live-evidence.json", [], parse_live_evidence)

    def test_live_evidence_exact_schema_rejects_placeholder(self):
        runner = FakeRunner(); adapter = CloudflareProductionAdapter(self.config, self.repo, runner, FakeEvidenceRunner())
        self.out.mkdir(); (self.out / "live-evidence.json").write_text('{"homepage":true}')
        with self.assertRaisesRegex(ProductionSafetyError, "STALE_EVIDENCE"): adapter.live_gate()


class CliTests(AdapterTests):
    def production_args(self, config):
        values = ["--config",str(config),"--token-file",str(self.token),"--production"]
        for flag, exact in CONFIRMATIONS.items(): values += ["--"+flag.replace("_","-"), exact]
        return values

    def test_validate_only_zero_network_zero_mutation_and_deletes_token(self):
        config = self.write_config(); factory = mock.Mock(side_effect=AssertionError("must not instantiate"))
        code, summary = execute(["--config",str(config),"--token-file",str(self.token)], repo=self.repo, adapter_factory=factory)
        self.assertEqual(code, 0); self.assertTrue(summary["validated"]); self.assertFalse(summary["LIVE_ACCEPTED"])
        factory.assert_not_called(); self.assertFalse(self.token.exists())

    def test_confirmation_required_and_config_exception_still_delete_token(self):
        config = self.write_config()
        for args in (["--config",str(config),"--token-file",str(self.token),"--production"],
                     ["--config",str(self.private/"missing"),"--token-file",str(self.token)]):
            self.token.write_text("TOKEN_VALUE")
            code, summary = execute(args, repo=self.repo)
            self.assertEqual(code, 1); self.assertFalse(self.token.exists()); self.assertFalse(summary["LIVE_ACCEPTED"])

    def test_adapter_and_core_exceptions_still_delete_token(self):
        for where in ("adapter", "core"):
            self.token.write_text("TOKEN_VALUE"); config = self.write_config()
            factory = mock.Mock(side_effect=RuntimeError("TOKEN_VALUE")) if where == "adapter" else mock.Mock(return_value=object())
            core = mock.Mock(side_effect=RuntimeError("owner@example.test"))
            code, summary = execute(self.production_args(config), repo=self.repo, adapter_factory=factory, run_core=core)
            self.assertEqual(code, 1); self.assertFalse(self.token.exists())
            self.assertNotIn("TOKEN_VALUE", repr(summary)); self.assertNotIn("owner@example.test", repr(summary))

    def test_token_delete_failure_fails_closed(self):
        config = self.write_config()
        original = Path.unlink
        def fail(path, *a, **k):
            if path.name == self.token.name: raise PermissionError
            return original(path, *a, **k)
        with mock.patch.object(Path, "unlink", fail): code, summary = execute(["--config",str(config),"--token-file",str(self.token)], repo=self.repo)
        self.assertEqual(code, 1); self.assertFalse(summary["LIVE_ACCEPTED"]); self.assertEqual(summary["error_category"], "TOKEN_DELETE_FAILED")

    def test_unsafe_repo_token_path_is_rejected_without_deleting_repo_file(self):
        unsafe = self.repo / "not-a-token"; unsafe.write_text("repository content")
        code, summary = execute(["--config",str(self.write_config()),"--token-file",str(unsafe)], repo=self.repo)
        self.assertEqual(code, 1); self.assertEqual(summary["error_category"], "UNSAFE_PATH")
        self.assertEqual(unsafe.read_text(), "repository content")

    def test_live_accepted_requires_success_token_absent_and_evidence(self):
        config_path = self.write_config(); self.out.mkdir(); (self.out/"live-evidence.json").write_text("{}")
        result = mock.Mock(success=True, rolled_back=False, mutation_count=9, migration_count=1,
                           upload_count=6, import_count=1, deploy_count=1, error_category=mock.Mock(name="NONE"))
        code, summary = execute(self.production_args(config_path), repo=self.repo, adapter_factory=mock.Mock(return_value=object()), run_core=mock.Mock(return_value=result))
        self.assertEqual(code, 0); self.assertTrue(summary["LIVE_ACCEPTED"]); self.assertTrue(summary["token_absent"])


if __name__ == "__main__": unittest.main()
