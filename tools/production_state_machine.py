"""Fail-closed orchestration core for the production migration.

This module performs no I/O itself.  An injected adapter owns every external
operation; the state machine only enforces ordering, cardinality and rollback.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Callable, Mapping, Protocol, runtime_checkable


class Step(Enum):
    NOT_STARTED = auto()
    SOURCE_PREFLIGHT = auto()
    CONFIG_PREFLIGHT = auto()
    CAPTURE_WORKER = auto()
    D1_BACKUP = auto()
    LEGACY_R2_BACKUP = auto()
    R2_PRIVATE_PROOF = auto()
    D1_BASELINE_PROOF = auto()
    OWNER_PLAN = auto()
    APPLY_MIGRATION_0005 = auto()
    VERIFY_MIGRATION_0005 = auto()
    UPLOAD_NEW_KEYS = auto()
    VERIFY_NEW_KEYS = auto()
    D1_IMPORT = auto()
    POST_IMPORT_RECONCILE = auto()
    DEPLOY = auto()
    LIVE_GATE = auto()
    ROLLBACK = auto()
    COMPLETE = auto()


class ErrorCategory(Enum):
    NONE = auto()
    INVALID_PLAN = auto()
    PREFLIGHT = auto()
    BACKUP = auto()
    PROOF = auto()
    MIGRATION = auto()
    PLAN = auto()
    UPLOAD = auto()
    IMPORT = auto()
    RECONCILE = auto()
    DEPLOY = auto()
    LIVE_GATE = auto()
    ADAPTER = auto()


LIVE_BOOLEAN_GATES = (
    "homepage",
    "works",
    "public_owners",
    "audio_get",
    "audio_head",
    "audio_range",
    "audio_etag",
    "audio_304",
    "audio_416",
    "tamper_denied",
    "expiry_denied",
    "legacy_static_denied",
    "robots",
    "not_found_404",
    "rate_limit",
    "csp",
    "security_headers",
    "owner_model",
    "protected_routes_fail_closed",
    "browser_dom_inventory",
    "browser_network_inventory",
)
LIVE_COUNT_GATES = ("public_owner_count", "audio_owner_count", "old_link_occurrences")


@dataclass(frozen=True)
class ProductionConfig:
    expected_legacy_keys: int = 14
    expected_new_keys: int = 6
    expected_owners: int = 20


@dataclass(frozen=True)
class ProductionPlan:
    new_keys: tuple[str, ...] = field(repr=False)
    legacy_keys: tuple[str, ...] = field(repr=False)
    config: ProductionConfig = ProductionConfig()

    def is_valid(self) -> bool:
        return (
            len(self.new_keys) == self.config.expected_new_keys
            and len(set(self.new_keys)) == len(self.new_keys)
            and len(self.legacy_keys) == self.config.expected_legacy_keys
            and len(set(self.legacy_keys)) == len(self.legacy_keys)
            and set(self.new_keys).isdisjoint(self.legacy_keys)
            and all(isinstance(value, str) and bool(value) for value in self.new_keys + self.legacy_keys)
            and self.config.expected_new_keys == 6
            and self.config.expected_legacy_keys == 14
            and self.config.expected_owners == 20
        )


@dataclass(frozen=True)
class RunResult:
    success: bool
    rolled_back: bool
    mutation_count: int
    migration_count: int
    upload_count: int
    import_count: int
    deploy_count: int
    completed_step: Step
    error_category: ErrorCategory
    live_gate_passed: bool


@dataclass(frozen=True)
class UploadOutcome:
    """Adapter-confirmed upload state, including a create followed by failure."""
    created: bool
    succeeded: bool


@runtime_checkable
class ProductionAdapter(Protocol):
    source_preflight: Callable[[], bool]
    config_preflight: Callable[[], bool]
    capture_worker_rollback_point: Callable[[], bool]
    verify_d1_time_travel_export_restore: Callable[[], bool]
    verify_legacy_r2_backup: Callable[[tuple[str, ...]], bool]
    prove_r2_private: Callable[[], bool]
    prove_d1_baseline_0004: Callable[[], bool]
    dry_run_owner_reconcile: Callable[[int], bool]
    apply_migration_0005_once: Callable[[], bool]
    verify_migration_0005: Callable[[], bool]
    upload_new_key: Callable[[str], UploadOutcome]
    verify_new_keys: Callable[[tuple[str, ...]], bool]
    import_d1_once: Callable[[], bool]
    post_import_reconcile: Callable[[int], bool]
    deploy_once: Callable[[], bool]
    live_gate: Callable[[], Mapping[str, object]]
    restore_worker: Callable[[], bool]
    restore_d1: Callable[[], bool]
    delete_new_key: Callable[[str], bool]
    post_rollback_reconcile: Callable[[int], bool]


def _live_gate_passes(evidence: object, expected_owners: int) -> bool:
    if not isinstance(evidence, Mapping):
        return False
    required = set(LIVE_BOOLEAN_GATES + LIVE_COUNT_GATES)
    if set(evidence.keys()) != required:
        return False
    if any(evidence[name] is not True for name in LIVE_BOOLEAN_GATES):
        return False
    return (
        type(evidence["public_owner_count"]) is int
        and evidence["public_owner_count"] == expected_owners
        and type(evidence["audio_owner_count"]) is int
        and evidence["audio_owner_count"] == expected_owners
        and type(evidence["old_link_occurrences"]) is int
        and evidence["old_link_occurrences"] == 0
    )


def run(plan: ProductionPlan, adapter: ProductionAdapter) -> RunResult:
    """Execute the fixed production sequence without retrying mutations."""
    mutation_count = migration_count = upload_count = import_count = deploy_count = 0
    completed = Step.NOT_STARTED
    created: list[str] = []
    migration_called = import_called = deploy_called = False

    def result(success: bool, category: ErrorCategory, rolled_back: bool = False,
               live_passed: bool = False) -> RunResult:
        return RunResult(success, rolled_back, mutation_count, migration_count, upload_count,
                         import_count, deploy_count, completed, category, live_passed)

    def rollback() -> bool:
        nonlocal completed
        completed = Step.ROLLBACK
        outcomes: list[bool] = []
        if deploy_called:
            try:
                outcomes.append(adapter.restore_worker() is True)
            except Exception:
                outcomes.append(False)
        if migration_called or import_called:
            try:
                outcomes.append(adapter.restore_d1() is True)
            except Exception:
                outcomes.append(False)
        legacy = set(plan.legacy_keys)
        for key in created:
            if key in legacy:
                outcomes.append(False)
                continue
            try:
                outcomes.append(adapter.delete_new_key(key) is True)
            except Exception:
                outcomes.append(False)
        try:
            outcomes.append(adapter.post_rollback_reconcile(plan.config.expected_owners) is True)
        except Exception:
            outcomes.append(False)
        return all(outcomes)

    if not plan.is_valid():
        return result(False, ErrorCategory.INVALID_PLAN)

    pre_mutation = (
        (Step.SOURCE_PREFLIGHT, ErrorCategory.PREFLIGHT, adapter.source_preflight),
        (Step.CONFIG_PREFLIGHT, ErrorCategory.PREFLIGHT, adapter.config_preflight),
        (Step.CAPTURE_WORKER, ErrorCategory.BACKUP, adapter.capture_worker_rollback_point),
        (Step.D1_BACKUP, ErrorCategory.BACKUP, adapter.verify_d1_time_travel_export_restore),
        (Step.LEGACY_R2_BACKUP, ErrorCategory.BACKUP,
         lambda: adapter.verify_legacy_r2_backup(plan.legacy_keys)),
        (Step.R2_PRIVATE_PROOF, ErrorCategory.PROOF, adapter.prove_r2_private),
        (Step.D1_BASELINE_PROOF, ErrorCategory.PROOF,
         adapter.prove_d1_baseline_0004),
        (Step.OWNER_PLAN, ErrorCategory.PLAN,
         lambda: adapter.dry_run_owner_reconcile(plan.config.expected_owners)),
    )
    for step, category, operation in pre_mutation:
        try:
            ok = operation() is True
        except Exception:
            return result(False, category)
        if not ok:
            return result(False, category)
        completed = step

    mutation_count += 1
    migration_count = 1
    migration_called = True
    try:
        migration_applied = adapter.apply_migration_0005_once() is True
    except Exception:
        migration_applied = False
    if not migration_applied:
        return result(False, ErrorCategory.MIGRATION, rollback())
    completed = Step.APPLY_MIGRATION_0005

    try:
        migration_verified = adapter.verify_migration_0005() is True
    except Exception:
        migration_verified = False
    if not migration_verified:
        return result(False, ErrorCategory.MIGRATION, rollback())
    completed = Step.VERIFY_MIGRATION_0005

    for key in plan.new_keys:
        mutation_count += 1
        upload_count += 1
        try:
            outcome = adapter.upload_new_key(key)
        except Exception:
            outcome = UploadOutcome(False, False)
        if type(outcome) is not UploadOutcome:
            outcome = UploadOutcome(False, False)
        if outcome.created is True:
            created.append(key)
        if outcome.succeeded is True and outcome.created is True:
            completed = Step.UPLOAD_NEW_KEYS
            continue
        return result(False, ErrorCategory.UPLOAD, rollback())

    try:
        verified = adapter.verify_new_keys(plan.new_keys) is True
    except Exception:
        verified = False
    if not verified:
        return result(False, ErrorCategory.UPLOAD, rollback())
    completed = Step.VERIFY_NEW_KEYS

    mutation_count += 1
    import_count = 1
    import_called = True
    try:
        imported = adapter.import_d1_once() is True
    except Exception:
        imported = False
    if not imported:
        return result(False, ErrorCategory.IMPORT, rollback())
    completed = Step.D1_IMPORT

    try:
        reconciled = adapter.post_import_reconcile(plan.config.expected_owners) is True
    except Exception:
        reconciled = False
    if not reconciled:
        return result(False, ErrorCategory.RECONCILE, rollback())
    completed = Step.POST_IMPORT_RECONCILE

    mutation_count += 1
    deploy_count = 1
    deploy_called = True
    try:
        deployed = adapter.deploy_once() is True
    except Exception:
        deployed = False
    if not deployed:
        return result(False, ErrorCategory.DEPLOY, rollback())
    completed = Step.DEPLOY

    try:
        live_passed = _live_gate_passes(adapter.live_gate(), plan.config.expected_owners)
    except Exception:
        live_passed = False
    if not live_passed:
        return result(False, ErrorCategory.LIVE_GATE, rollback())
    completed = Step.LIVE_GATE
    completed = Step.COMPLETE
    return result(True, ErrorCategory.NONE, live_passed=True)
