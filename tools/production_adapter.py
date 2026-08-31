"""Fail-closed Cloudflare production adapter."""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import sqlite3
import stat
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Protocol, Sequence

from tools.production_state_machine import LIVE_BOOLEAN_GATES, LIVE_COUNT_GATES, UploadOutcome

PINNED_WRANGLER = "4.127.1"
CANONICAL_DOMAIN = "contest.zoeg.studio"
MIGRATION_PATH = "migrations/0005_owned_legacy_import.sql"
MIGRATION_SHA256 = "533524c6b292f89329f501e25df0a869ef85f8e22c1d348dfcac11b9a5da8948"
MIGRATION_PROVENANCE = "https://developers.cloudflare.com/d1/reference/migrations/"
QUERY_LABELS = frozenset({"baseline:0004", "migration:0005", "post_import", "post_rollback"})
PREFLIGHT_FIELDS = frozenset({"account_match", "zone_match", "worker_match", "d1_match", "r2_match", "canonical_domain_match", "resource_ids_match"})
SENSITIVE_WORDS = re.compile(r"(?i)(token|owner|discord|e-?mail|secret|api[_-]?key|sql|private|manifest|path)")
GENERATED_GIT_DIRECTORIES = ("node_modules/", "dist/", ".wrangler/")
GENERATED_GIT_FILES = frozenset({"worker-configuration.d.ts"})


class ProductionSafetyError(RuntimeError):
    """A public, category-only error; raw provider output is never attached."""


def _verify_source_checkout(repo: os.PathLike[str] | str, expected_commit: str) -> bool:
    if type(expected_commit) is not str or re.fullmatch(r"[0-9a-f]{40}", expected_commit) is None:
        return False
    try:
        root = Path(repo).resolve(strict=True)
        def git(*args: str) -> str:
            completed = subprocess.run(
                ["git", "-C", str(root), *args], shell=False, text=True,
                encoding="utf-8", errors="strict", capture_output=True, check=False,
            )
            if completed.returncode != 0:
                raise RuntimeError
            return completed.stdout.strip()

        if Path(git("rev-parse", "--show-toplevel")).resolve(strict=True) != root:
            return False
        if git("rev-parse", "--verify", "HEAD") != expected_commit:
            return False
        if not git("symbolic-ref", "-q", "HEAD").startswith("refs/heads/"):
            return False
        status = git("status", "--porcelain=v1", "--untracked-files=all", "--ignored=matching")
        for line in status.splitlines():
            if not line:
                continue
            if line[:3] in {"!! ", "?? "}:
                path = line[3:].replace("\\", "/")
                parts = tuple(part for part in path.rstrip("/").split("/") if part)
                if (path in GENERATED_GIT_FILES or any(path.startswith(directory) for directory in GENERATED_GIT_DIRECTORIES)
                        or "__pycache__" in parts):
                    continue
            return False
        return True
    except Exception:
        return False


def _str(value: Any, _name: str) -> str:
    if type(value) is not str or not value:
        raise ProductionSafetyError("CONFIG_INVALID")
    return value


def _integer(value: Any, _name: str) -> int:
    if type(value) is not int or value < 0:
        raise ProductionSafetyError("CONFIG_INVALID")
    return value


def _closed(obj: Any, keys: set[str] | frozenset[str]) -> dict[str, Any]:
    if type(obj) is not dict or set(obj) != set(keys):
        raise ProductionSafetyError("CONFIG_INVALID")
    return obj


@dataclass(frozen=True)
class QuerySpec:
    sql: str = field(repr=False)
    expected: Any = field(repr=False)


@dataclass(frozen=True)
class ObjectSpec:
    key: str = field(repr=False)
    source: Path = field(repr=False)
    sha256: str = field(repr=False)
    size: int
    magic_hex: str = field(repr=False)
    mime: str = field(repr=False)


@dataclass(frozen=True)
class ProductionExecutionConfig:
    account_id: str = field(repr=False)
    zone_id: str = field(repr=False)
    worker_name: str
    d1_name: str
    d1_id: str = field(repr=False)
    r2_bucket: str
    canonical_domain: str
    source_commit: str
    legacy: tuple[ObjectSpec, ...] = field(repr=False)
    new: tuple[ObjectSpec, ...] = field(repr=False)
    owners: tuple[str, ...] = field(repr=False)
    import_sql: Path = field(repr=False)
    import_sql_sha256: str = field(repr=False)
    expected_queries: Mapping[str, QuerySpec] = field(repr=False)
    provenance: tuple[str, ...]
    private_output: Path = field(repr=False)
    token_file: Path = field(repr=False)
    migration_sql: Path = field(repr=False)
    migration_sql_sha256: str = field(repr=False)

    @classmethod
    def load(cls, filename: os.PathLike[str] | str, repo: os.PathLike[str] | str) -> "ProductionExecutionConfig":
        config_path = guard_existing_private(filename, repo)
        try:
            raw = json.loads(config_path.read_text(encoding="utf-8"))
        except Exception:
            raise ProductionSafetyError("CONFIG_INVALID") from None
        keys = {"account_id", "zone_id", "worker_name", "d1_name", "d1_id", "r2_bucket", "canonical_domain",
                "source_commit", "legacy", "new", "owners", "import_sql", "import_sql_sha256",
                "expected_queries", "provenance", "private_output", "token_file",
                "migration_path", "migration_sha256"}
        data = _closed(raw, keys)

        source_commit = _str(data["source_commit"], "source_commit")
        if re.fullmatch(r"[0-9a-f]{40}", source_commit) is None:
            raise ProductionSafetyError("CONFIG_INVALID")
        if not _verify_source_checkout(repo, source_commit):
            raise ProductionSafetyError("SOURCE_MISMATCH")

        def objects(value: Any) -> tuple[ObjectSpec, ...]:
            if type(value) is not list:
                raise ProductionSafetyError("CONFIG_INVALID")
            result = []
            for item in value:
                x = _closed(item, {"key", "source", "sha256", "size", "magic_hex", "mime"})
                source = guard_existing_private(_str(x["source"], "source"), repo)
                digest = _str(x["sha256"], "sha256").lower()
                magic = _str(x["magic_hex"], "magic_hex").lower()
                if not re.fullmatch(r"[0-9a-f]{64}", digest) or not re.fullmatch(r"[0-9a-f]+", magic) or len(magic) % 2:
                    raise ProductionSafetyError("CONFIG_INVALID")
                result.append(ObjectSpec(_str(x["key"], "key"), source, digest, _integer(x["size"], "size"), magic, _str(x["mime"], "mime")))
            return tuple(result)

        legacy, new = objects(data["legacy"]), objects(data["new"])
        owners, provenance, raw_queries = data["owners"], data["provenance"], data["expected_queries"]
        if (type(owners) is not list or len(owners) != 20 or any(type(x) is not str or not x for x in owners)
                or len(set(owners)) != 20 or len(legacy) != 14 or len(new) != 6
                or len({x.key for x in legacy + new}) != 20
                or type(provenance) is not list or not provenance
                or any(type(x) is not str or not x.startswith("https://developers.cloudflare.com/") for x in provenance)
                or MIGRATION_PROVENANCE not in provenance
                or type(raw_queries) is not dict or set(raw_queries) != QUERY_LABELS):
            raise ProductionSafetyError("CONFIG_INVALID")
        queries: dict[str, QuerySpec] = {}
        for label in QUERY_LABELS:
            item = _closed(raw_queries[label], {"sql", "expected"})
            queries[label] = QuerySpec(_str(item["sql"], "sql"), item["expected"])
        import_sql = guard_existing_private(_str(data["import_sql"], "import_sql"), repo)
        token_file = guard_existing_private(_str(data["token_file"], "token_file"), repo)
        private_output = guard_new_private(_str(data["private_output"], "private_output"), repo)
        sql_hash = _str(data["import_sql_sha256"], "import_sql_sha256").lower()
        if not re.fullmatch(r"[0-9a-f]{64}", sql_hash):
            raise ProductionSafetyError("CONFIG_INVALID")
        canonical_domain = _str(data["canonical_domain"], "canonical_domain")
        if canonical_domain != CANONICAL_DOMAIN:
            raise ProductionSafetyError("CONFIG_INVALID")
        if data["migration_path"] != MIGRATION_PATH or data["migration_sha256"] != MIGRATION_SHA256:
            raise ProductionSafetyError("MIGRATION_MISMATCH")
        migration_sql = (Path(repo).resolve(strict=True) / MIGRATION_PATH).resolve(strict=True)
        if migration_sql != Path(repo).resolve(strict=True) / Path(MIGRATION_PATH) or not migration_sql.is_file():
            raise ProductionSafetyError("MIGRATION_MISMATCH")
        return cls(_str(data["account_id"], "account_id"), _str(data["zone_id"], "zone_id"),
                   _str(data["worker_name"], "worker_name"), _str(data["d1_name"], "d1_name"),
                   _str(data["d1_id"], "d1_id"), _str(data["r2_bucket"], "r2_bucket"),
                   canonical_domain, source_commit, legacy, new,
                   tuple(owners), import_sql, sql_hash, queries, tuple(provenance), private_output, token_file,
                   migration_sql, MIGRATION_SHA256)


def _is_repo_outside(path: Path, repo: os.PathLike[str] | str) -> bool:
    root = Path(repo).resolve(strict=True)
    try:
        path.relative_to(root); return False
    except ValueError:
        return True


def _reject_links(path: Path) -> None:
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current /= part
        if current.exists():
            info = current.lstat()
            if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400):
                raise ProductionSafetyError("UNSAFE_PATH")


def guard_existing_private(path: os.PathLike[str] | str, repo: os.PathLike[str] | str) -> Path:
    supplied = Path(path).expanduser()
    if not supplied.is_absolute(): raise ProductionSafetyError("UNSAFE_PATH")
    p = supplied.absolute()
    if not p.exists(): raise ProductionSafetyError("UNSAFE_PATH")
    _reject_links(p); resolved = p.resolve(strict=True)
    if not _is_repo_outside(resolved, repo) or not resolved.is_file(): raise ProductionSafetyError("UNSAFE_PATH")
    return resolved


def guard_new_private(path: os.PathLike[str] | str, repo: os.PathLike[str] | str) -> Path:
    supplied = Path(path).expanduser()
    if not supplied.is_absolute(): raise ProductionSafetyError("UNSAFE_PATH")
    p = supplied.absolute()
    if p.exists():
        _reject_links(p)
        if not p.is_dir(): raise ProductionSafetyError("UNSAFE_PATH")
        resolved = p.resolve(strict=True)
    else:
        if not p.parent.exists(): raise ProductionSafetyError("UNSAFE_PATH")
        _reject_links(p.parent); resolved = p.parent.resolve(strict=True) / p.name
    if not _is_repo_outside(resolved, repo): raise ProductionSafetyError("UNSAFE_PATH")
    return resolved


@dataclass(frozen=True)
class CommandResult:
    ok: bool
    category: str


def _token_env(token_file: Path) -> tuple[dict[str, str], bytes]:
    token = token_file.read_text(encoding="utf-8").strip()
    if not token or "\n" in token or "\r" in token: raise ValueError
    env = {k: v for k, v in os.environ.items() if k != "CLOUDFLARE_API_TOKEN"}
    env.update(CLOUDFLARE_API_TOKEN=token, WRANGLER_SEND_METRICS="false", WRANGLER_DISABLE_UPDATE_CHECK="true")
    return env, token.encode()


class CommandRunner:
    """Wrangler-only runner; public generic execution is deliberately denied."""
    def __init__(self, repo: os.PathLike[str] | str, token_file: os.PathLike[str] | str):
        self.repo = Path(repo).resolve(strict=True); self.token_file = guard_existing_private(token_file, self.repo)
        candidate = self.repo / "node_modules" / ".bin" / ("wrangler.cmd" if os.name == "nt" else "wrangler")
        if not candidate.is_file(): raise ProductionSafetyError("WRANGLER_MISSING")
        self.binary = candidate.resolve(strict=True)

    def run(self, args: Sequence[str], *, evidence_file: Path | None, mutation: bool) -> CommandResult:
        raise ProductionSafetyError("COMMAND_FORBIDDEN")

    def _wrangler(self, args: Sequence[str], *, evidence_file: Path | None, mutation: bool) -> CommandResult:
        if type(args) not in (list, tuple) or any(type(x) is not str for x in args): raise ProductionSafetyError("COMMAND_INVALID")
        try:
            env, token = _token_env(self.token_file)
            completed = subprocess.run([str(self.binary), *args], cwd=str(self.repo), env=env, shell=False, text=False, capture_output=True, check=False)
            raw = (completed.stdout + b"\n" + completed.stderr).replace(token, b"[REDACTED]")
            if evidence_file is not None:
                evidence_file.parent.mkdir(mode=0o700, parents=True, exist_ok=True); evidence_file.write_bytes(raw)
            return CommandResult(completed.returncode == 0, "OK" if completed.returncode == 0 else "COMMAND_NONZERO")
        except Exception:
            return CommandResult(False, "COMMAND_FAILED")


class EvidenceRunnerProtocol(Protocol):
    def collect(self, mode: str, output: Path, nonce: str, args: Sequence[str]) -> CommandResult: ...


class EvidenceRunner:
    """Fixed repo helper runner. The helper intentionally arrives in a later package."""
    def __init__(self, repo: os.PathLike[str] | str, token_file: os.PathLike[str] | str):
        self.repo = Path(repo).resolve(strict=True); self.token_file = guard_existing_private(token_file, self.repo)
        self.script = self.repo / "tools" / "live_evidence.mjs"
        node = shutil.which("node")
        self.node = Path(node).resolve(strict=True) if node else None

    def collect(self, mode: str, output: Path, nonce: str, args: Sequence[str]) -> CommandResult:
        if mode not in {"cloudflare-preflight", "r2-object-metadata", "r2-public-access", "live-gate"} or self.node is None or not self.script.is_file():
            return CommandResult(False, "EVIDENCE_RUNNER_MISSING")
        try:
            env, token = _token_env(self.token_file)
            argv = [str(self.node), str(self.script), "--mode", mode, "--output", str(output), "--nonce", nonce, *args]
            completed = subprocess.run(argv, cwd=str(self.repo), env=env, shell=False, text=False, capture_output=True, check=False)
            # Output is private only; token never enters argv and captured output is discarded.
            _ = (completed.stdout + completed.stderr).replace(token, b"[REDACTED]")
            return CommandResult(completed.returncode == 0, "OK" if completed.returncode == 0 else "COMMAND_NONZERO")
        except Exception:
            return CommandResult(False, "COMMAND_FAILED")


class ReceiptLedger:
    def __init__(self, directory: Path):
        self.directory = directory; self.path = directory / "mutation-receipts.json"; self.entries: list[dict[str, Any]] = []
        if self.path.exists():
            try:
                envelope = _closed(json.loads(self.path.read_bytes()), {"sha256", "payload"})
                payload = _closed(envelope["payload"], {"entries"})
                encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
                if envelope["sha256"] != hashlib.sha256(encoded).hexdigest() or type(payload["entries"]) is not list:
                    raise ValueError
                for entry in payload["entries"]:
                    self.entries.append(_closed(entry, {"phase", "operation", "created", "succeeded", "fingerprint"}))
            except Exception:
                raise ProductionSafetyError("RECONCILE_NEEDED") from None

    def flush(self, phase: str, operation: str, created: bool, succeeded: bool, fingerprint: str = "") -> None:
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.entries.append({"phase": phase, "operation": operation, "created": created, "succeeded": succeeded,
                             "fingerprint": fingerprint})
        payload = json.dumps({"entries": self.entries}, sort_keys=True, separators=(",", ":")).encode()
        envelope = json.dumps({"sha256": hashlib.sha256(payload).hexdigest(), "payload": json.loads(payload)}, sort_keys=True, separators=(",", ":")).encode()
        fd, tmp = tempfile.mkstemp(prefix=".receipt-", dir=self.directory)
        try:
            with os.fdopen(fd, "wb") as stream: stream.write(envelope); stream.flush(); os.fsync(stream.fileno())
            os.replace(tmp, self.path)
        finally:
            if os.path.exists(tmp): os.unlink(tmp)

    def migration_accepted(self, fingerprint: str) -> bool:
        if not self.entries:
            return False
        expected = [
            {"phase": "before", "operation": "d1-migration-0005", "created": False,
             "succeeded": False, "fingerprint": fingerprint},
            {"phase": "after", "operation": "d1-migration-0005", "created": False,
             "succeeded": True, "fingerprint": fingerprint},
        ]
        if self.entries != expected:
            raise ProductionSafetyError("RECONCILE_NEEDED")
        return True


class CloudflareProductionAdapter:
    def __init__(self, config: ProductionExecutionConfig, repo: os.PathLike[str] | str,
                 runner: Any | None = None, evidence_runner: EvidenceRunnerProtocol | None = None):
        self.config = config; self.repo = Path(repo).resolve(strict=True)
        self.runner = runner or CommandRunner(self.repo, config.token_file)
        self.evidence_runner = evidence_runner or EvidenceRunner(self.repo, config.token_file)
        self.ledger: ReceiptLedger | None = None; self.worker_version: str | None = None; self.bookmark: str | None = None
        self.created: set[str] = set(); self.attempted: set[str] = set(); self.run_nonce = secrets.token_hex(32)

    def _evidence(self, name: str) -> Path: return self.config.private_output / name

    def _run(self, args: list[str], name: str, *, mutation: bool = False) -> bool:
        return self.runner._wrangler(args, evidence_file=self._evidence(name), mutation=mutation).ok

    def _mutate(self, operation: str, args: list[str], *, creates: bool = False) -> bool:
        if operation in self.attempted: return False
        self.attempted.add(operation)
        if self.ledger is None:
            self.ledger = ReceiptLedger(self.config.private_output)
            if self.ledger.entries: raise ProductionSafetyError("RECONCILE_NEEDED")
        self.ledger.flush("before", operation, False, False)
        ok = self._run(args, operation + ".raw", mutation=True)
        self.ledger.flush("after", operation, bool(creates and ok), ok)
        return ok

    def _collect(self, mode: str, filename: str, args: Sequence[str], schema: Any) -> Any:
        target = self._evidence(filename)
        if target.exists(): raise ProductionSafetyError("STALE_EVIDENCE")
        started = __import__("time").time_ns()
        result = self.evidence_runner.collect(mode, target, self.run_nonce, args)
        if not result.ok or not target.is_file(): return None
        try:
            raw = target.read_bytes(); stat_result = target.stat()
            if not raw or stat_result.st_size != len(raw) or stat_result.st_mtime_ns < started: return None
            digest = hashlib.sha256(raw).hexdigest()
            envelope = _closed(json.loads(raw), {"nonce", "result"})
            if envelope["nonce"] != self.run_nonce or not re.fullmatch(r"[0-9a-f]{64}", digest): return None
            return schema(envelope["result"])
        except ProductionSafetyError:
            return None
        except Exception:
            return None

    def source_preflight(self) -> bool:
        return (_verify_source_checkout(self.repo, self.config.source_commit)
                and _sha256(self.config.import_sql) == self.config.import_sql_sha256
                and self.config.migration_sql == self.repo / MIGRATION_PATH
                and self.config.migration_sql_sha256 == MIGRATION_SHA256
                and _sha256(self.config.migration_sql) == MIGRATION_SHA256
                and all(_sha256(x.source) == x.sha256 and x.source.stat().st_size == x.size
                        and x.source.read_bytes().startswith(bytes.fromhex(x.magic_hex)) for x in self.config.legacy + self.config.new))

    def config_preflight(self) -> bool:
        if not self._run(["--version"], "wrangler-version.raw"): return False
        if self._evidence("wrangler-version.raw").read_text(errors="replace").strip() != PINNED_WRANGLER: return False
        args = ["--account-id", self.config.account_id, "--zone-id", self.config.zone_id, "--worker", self.config.worker_name,
                "--d1-name", self.config.d1_name, "--d1-id", self.config.d1_id, "--r2-bucket", self.config.r2_bucket,
                "--domain", self.config.canonical_domain]
        value = self._collect("cloudflare-preflight", "cloudflare-preflight.json", args, parse_resource_preflight)
        return value is True

    def capture_worker_rollback_point(self) -> bool:
        if not self._run(["deployments", "list", "--name", self.config.worker_name, "--json"], "deployments.raw"): return False
        try:
            data = json.loads(self._evidence("deployments.raw").read_text()); item = data[0]
            version = item.get("version_id") or item.get("versions", [{}])[0].get("version_id")
            if type(version) is not str or not version: return False
            self.worker_version = version; return True
        except Exception: return False

    def verify_d1_time_travel_export_restore(self) -> bool:
        if not self._run(["d1", "time-travel", "info", self.config.d1_name, "--json"], "d1-bookmark.raw"): return False
        try:
            info = json.loads(self._evidence("d1-bookmark.raw").read_text()); bookmark = info.get("bookmark") if type(info) is dict else None
            if type(bookmark) is not str or not bookmark: return False
            self.bookmark = bookmark
        except Exception: return False
        export = self._evidence("d1-export.sql")
        if export.exists(): raise ProductionSafetyError("STALE_EVIDENCE")
        if not self._run(["d1", "export", self.config.d1_name, "--remote", "--output", str(export), "--skip-confirmation"], "d1-export-command.raw"): return False
        return verify_sqlite_export(export)

    def _verify_object(self, spec: ObjectSpec, suffix: str) -> bool:
        output = self._evidence(suffix); metadata = self._evidence(suffix + ".metadata.json")
        if output.exists() or metadata.exists(): raise ProductionSafetyError("STALE_EVIDENCE")
        if not self._run(["r2", "object", "get", f"{self.config.r2_bucket}/{spec.key}", "--remote", "--file", str(output)], suffix + ".command.raw"): return False
        value = self._collect("r2-object-metadata", suffix + ".metadata.json", ["--account-id", self.config.account_id, "--bucket", self.config.r2_bucket, "--object-key", spec.key], parse_object_metadata)
        return value == {"content_type": spec.mime, "size": spec.size, "sha256": spec.sha256} and verify_object_file(output, spec)

    def verify_legacy_r2_backup(self, keys: tuple[str, ...]) -> bool:
        specs = {x.key: x for x in self.config.legacy}
        return tuple(specs) == keys and all(self._verify_object(specs[k], f"legacy-{i}.bin") for i, k in enumerate(keys))

    def prove_r2_private(self) -> bool:
        if not self._run(["r2", "bucket", "dev-url", "get", self.config.r2_bucket], "r2-dev-url.raw"): return False
        if not self._run(["r2", "bucket", "info", self.config.r2_bucket, "--json"], "r2-info-advisory.raw"): return False
        custom = self._collect("r2-public-access", "r2-custom-domains.json", ["--account-id", self.config.account_id, "--bucket", self.config.r2_bucket], parse_public_access)
        return parse_dev_url_disabled(self._evidence("r2-dev-url.raw").read_text()) and custom is True

    def _query(self, label: str) -> Any:
        if label not in QUERY_LABELS or label not in self.config.expected_queries: return None
        spec = self.config.expected_queries[label]
        safe = label.replace(":", "-")
        if not self._run(["d1", "execute", self.config.d1_name, "--remote", "--command", spec.sql, "--json"], f"query-{safe}.raw"): return None
        try: return json.loads(self._evidence(f"query-{safe}.raw").read_text())
        except Exception: return None

    def prove_d1_baseline_0004(self) -> bool:
        spec = self.config.expected_queries["baseline:0004"]
        return self._query("baseline:0004") == spec.expected

    def dry_run_owner_reconcile(self, count: int) -> bool: return count == 20 and len(self.config.owners) == count

    def apply_migration_0005_once(self) -> bool:
        fingerprint = self.config.migration_sql_sha256
        if self.ledger is None:
            self.ledger = ReceiptLedger(self.config.private_output)
        if self.ledger.migration_accepted(fingerprint):
            return True
        operation = "d1-migration-0005"
        if operation in self.attempted or self.ledger.entries:
            return False
        self.attempted.add(operation)
        self.ledger.flush("before", operation, False, False, fingerprint)
        ok = self._run(["d1", "migrations", "apply", self.config.d1_name, "--remote"],
                       operation + ".raw", mutation=True)
        self.ledger.flush("after", operation, False, ok, fingerprint)
        return ok

    def verify_migration_0005(self) -> bool:
        if self.ledger is None or not self.ledger.migration_accepted(self.config.migration_sql_sha256):
            return False
        spec = self.config.expected_queries["migration:0005"]
        return self._query("migration:0005") == spec.expected

    def upload_new_key(self, key: str) -> UploadOutcome:
        index = next((i for i, x in enumerate(self.config.new) if x.key == key), None)
        if index is None: return UploadOutcome(False, False)
        spec = self.config.new[index]; operation = f"r2-put-{index}"
        ok = self._mutate(operation, ["r2", "object", "put", f"{self.config.r2_bucket}/{key}", "--remote", "--file", str(spec.source), "--content-type", spec.mime, "--force"], creates=True)
        if ok: self.created.add(key)
        return UploadOutcome(ok, ok and self._verify_object(spec, f"new-readback-{index}.bin"))

    def verify_new_keys(self, keys: tuple[str, ...]) -> bool:
        specs = {x.key: x for x in self.config.new}
        return set(keys) == set(specs) and all(self._verify_object(specs[k], f"verify-new-{i}.bin") for i, k in enumerate(keys))

    def import_d1_once(self) -> bool:
        if _sha256(self.config.import_sql) != self.config.import_sql_sha256: return False
        return self._mutate("d1-import", ["d1", "execute", self.config.d1_name, "--remote", "--file", str(self.config.import_sql), "--yes"])

    def post_import_reconcile(self, count: int) -> bool:
        spec = self.config.expected_queries["post_import"]
        return count == 20 and self._query("post_import") == spec.expected

    def deploy_once(self) -> bool: return self._mutate("worker-deploy", ["deploy", "--name", self.config.worker_name, "--strict"])

    def live_gate(self) -> Mapping[str, object]:
        value = self._collect("live-gate", "live-evidence.json", ["--domain", self.config.canonical_domain, "--r2-custom-domains-proof"], parse_live_evidence)
        return value if type(value) is dict else {}

    def restore_worker(self) -> bool:
        return bool(self.worker_version) and self._mutate("worker-rollback", ["rollback", self.worker_version, "--name", self.config.worker_name, "--yes", "--message", "automated safety rollback"])

    def restore_d1(self) -> bool:
        return bool(self.bookmark) and self._mutate("d1-restore", ["d1", "time-travel", "restore", self.config.d1_name, "--bookmark", self.bookmark, "--json"])

    def delete_new_key(self, key: str) -> bool:
        index = next((i for i, x in enumerate(self.config.new) if x.key == key), None)
        if index is None or key not in self.created or key in {x.key for x in self.config.legacy}: return False
        return self._mutate(f"r2-delete-{index}", ["r2", "object", "delete", f"{self.config.r2_bucket}/{key}", "--remote", "--force"])

    def post_rollback_reconcile(self, count: int) -> bool:
        spec = self.config.expected_queries["post_rollback"]
        return count == 20 and self._query("post_rollback") == spec.expected


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""): digest.update(chunk)
    return digest.hexdigest()


def verify_object_file(path: Path, spec: ObjectSpec) -> bool:
    try:
        prefix = path.read_bytes()[:len(bytes.fromhex(spec.magic_hex))]
        return path.stat().st_size == spec.size and _sha256(path) == spec.sha256 and prefix == bytes.fromhex(spec.magic_hex)
    except Exception: return False


def verify_sqlite_export(sql_path: Path) -> bool:
    try:
        sql = sql_path.read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory() as directory:
            connection = sqlite3.connect(str(Path(directory) / "restore.sqlite"))
            try:
                connection.executescript(sql)
                return (connection.execute("PRAGMA quick_check").fetchall() == [("ok",)]
                        and connection.execute("PRAGMA integrity_check").fetchall() == [("ok",)]
                        and connection.execute("PRAGMA foreign_key_check").fetchall() == [])
            finally: connection.close()
    except Exception: return False


def parse_dev_url_disabled(text: str) -> bool:
    normalized = " ".join(text.lower().split())
    return normalized in {
        "disabled",
        "not enabled",
        "r2.dev url: disabled",
        "public access via the r2.dev url is disabled.",
    }


def parse_custom_domains_disabled(payload: str) -> bool:
    try: return parse_public_access(json.loads(payload))
    except Exception: return False


def parse_public_access(value: Any) -> bool:
    return (type(value) is dict and set(value) == {"dev_url_disabled", "custom_domains_disabled"}
            and value["dev_url_disabled"] is True and value["custom_domains_disabled"] is True)


def parse_object_metadata(value: Any) -> Any:
    if type(value) is not dict or set(value) != {"content_type", "size", "sha256"}: return None
    if type(value["content_type"]) is not str or type(value["size"]) is not int or type(value["sha256"]) is not str: return None
    return value


def parse_resource_preflight(value: Any) -> bool:
    return type(value) is dict and set(value) == PREFLIGHT_FIELDS and all(value[x] is True for x in PREFLIGHT_FIELDS)


def parse_live_evidence(value: Any) -> Any:
    required = set(LIVE_BOOLEAN_GATES + LIVE_COUNT_GATES)
    if type(value) is not dict or set(value) != required: return None
    if any(value[x] is not True for x in LIVE_BOOLEAN_GATES): return None
    if (value["public_owner_count"] != 20 or type(value["public_owner_count"]) is not int
            or value["audio_owner_count"] != 20 or type(value["audio_owner_count"]) is not int
            or value["old_link_occurrences"] != 0 or type(value["old_link_occurrences"]) is not int): return None
    return value
