import dataclasses
import unittest

from tools.production_state_machine import (
    ErrorCategory,
    LIVE_BOOLEAN_GATES,
    LIVE_COUNT_GATES,
    ProductionPlan,
    Step,
    UploadOutcome,
    run,
)


NEW = tuple(f"private-new-key-{i}" for i in range(6))
LEGACY = tuple(f"legacy-secret-key-{i}" for i in range(14))
SENSITIVE = NEW + LEGACY + ("owner@example.invalid", "discord-secret-id", "token-secret")


def good_live():
    value = {name: True for name in LIVE_BOOLEAN_GATES}
    value.update(public_owner_count=20, audio_owner_count=20, old_link_occurrences=0)
    return value


class FakeAdapter:
    operations = (
        "source_preflight", "config_preflight", "capture_worker_rollback_point",
        "verify_d1_time_travel_export_restore", "verify_legacy_r2_backup",
        "prove_r2_private", "prove_d1_baseline_0005_compatible",
        "dry_run_owner_reconcile", "verify_new_keys", "import_d1_once",
        "post_import_reconcile", "deploy_once", "live_gate", "restore_worker",
        "restore_d1", "post_rollback_reconcile",
    )

    def __init__(self, fail=None, live=None, rollback_fail=None):
        self.fail = fail
        self.live = good_live() if live is None else live
        self.rollback_fail = rollback_fail
        self.calls = []
        self.upload_index = 0
        self.deleted = []

    def _call(self, name):
        self.calls.append(name)
        if self.fail == name or self.rollback_fail == name:
            return False
        return True

    def source_preflight(self): return self._call("source_preflight")
    def config_preflight(self): return self._call("config_preflight")
    def capture_worker_rollback_point(self): return self._call("capture_worker_rollback_point")
    def verify_d1_time_travel_export_restore(self): return self._call("verify_d1_time_travel_export_restore")
    def verify_legacy_r2_backup(self, keys):
        self.seen_legacy = keys
        return self._call("verify_legacy_r2_backup")
    def prove_r2_private(self): return self._call("prove_r2_private")
    def prove_d1_baseline_0005_compatible(self): return self._call("prove_d1_baseline_0005_compatible")
    def dry_run_owner_reconcile(self, count):
        self.dry_count = count
        return self._call("dry_run_owner_reconcile")
    def upload_new_key(self, key):
        index = self.upload_index
        self.upload_index += 1
        self.calls.append("upload_new_key")
        if self.fail == f"upload_{index}":
            return UploadOutcome(False, False)
        return UploadOutcome(True, True)
    def verify_new_keys(self, keys):
        self.seen_new = keys
        return self._call("verify_new_keys")
    def import_d1_once(self): return self._call("import_d1_once")
    def post_import_reconcile(self, count): return self._call("post_import_reconcile")
    def deploy_once(self): return self._call("deploy_once")
    def live_gate(self):
        self.calls.append("live_gate")
        return self.live
    def restore_worker(self): return self._call("restore_worker")
    def restore_d1(self): return self._call("restore_d1")
    def delete_new_key(self, key):
        self.calls.append("delete_new_key")
        self.deleted.append(key)
        return self.rollback_fail != "delete_new_key"
    def post_rollback_reconcile(self, count): return self._call("post_rollback_reconcile")


class ProductionStateMachineTests(unittest.TestCase):
    def setUp(self):
        self.plan = ProductionPlan(NEW, LEGACY)

    def assert_once(self, adapter, name, expected=1):
        self.assertEqual(adapter.calls.count(name), expected)

    def test_success_fixed_sequence_and_at_most_once(self):
        adapter = FakeAdapter()
        result = run(self.plan, adapter)
        self.assertTrue(result.success)
        self.assertFalse(result.rolled_back)
        self.assertEqual((result.upload_count, result.import_count, result.deploy_count), (6, 1, 1))
        self.assertEqual(result.completed_step, Step.COMPLETE)
        self.assertTrue(result.live_gate_passed)
        self.assertEqual(adapter.upload_index, 6)
        self.assert_once(adapter, "import_d1_once")
        self.assert_once(adapter, "deploy_once")
        self.assertEqual(adapter.dry_count, 20)
        self.assertEqual(adapter.calls, [
            "source_preflight", "config_preflight", "capture_worker_rollback_point",
            "verify_d1_time_travel_export_restore", "verify_legacy_r2_backup",
            "prove_r2_private", "prove_d1_baseline_0005_compatible",
            "dry_run_owner_reconcile", *("upload_new_key" for _ in range(6)),
            "verify_new_keys", "import_d1_once", "post_import_reconcile",
            "deploy_once", "live_gate",
        ])

    def test_invalid_plan_stops_without_adapter_or_mutation(self):
        adapter = FakeAdapter()
        result = run(ProductionPlan(NEW[:-1], LEGACY), adapter)
        self.assertEqual(result.error_category, ErrorCategory.INVALID_PLAN)
        self.assertEqual(result.mutation_count, 0)
        self.assertEqual(adapter.calls, [])

    def test_new_and_legacy_must_be_disjoint(self):
        adapter = FakeAdapter()
        result = run(ProductionPlan(NEW, LEGACY[:-1] + (NEW[0],)), adapter)
        self.assertEqual(result.error_category, ErrorCategory.INVALID_PLAN)
        self.assertEqual(result.mutation_count, 0)

    def test_every_pre_mutation_failure_has_zero_mutations(self):
        failures = FakeAdapter.operations[:8]
        for failure in failures:
            with self.subTest(failure=failure):
                adapter = FakeAdapter(fail=failure)
                result = run(self.plan, adapter)
                self.assertFalse(result.success)
                self.assertEqual(result.mutation_count, 0)
                self.assertEqual(adapter.upload_index, 0)
                self.assertNotIn("post_rollback_reconcile", adapter.calls)

    def test_each_new_upload_failure_is_not_retried_and_deletes_only_created(self):
        for index in range(6):
            with self.subTest(index=index):
                adapter = FakeAdapter(fail=f"upload_{index}")
                result = run(self.plan, adapter)
                self.assertFalse(result.success)
                self.assertEqual(adapter.upload_index, index + 1)
                self.assertEqual(adapter.deleted, list(NEW[:index]))
                self.assertTrue(set(adapter.deleted).isdisjoint(LEGACY))
                self.assertEqual(result.upload_count, index + 1)

    def test_verify_import_reconcile_deploy_failures_rollback(self):
        cases = {
            "verify_new_keys": (0, 0),
            "import_d1_once": (1, 0),
            "post_import_reconcile": (1, 0),
            "deploy_once": (1, 1),
        }
        for failure, (restore_d1, restore_worker) in cases.items():
            with self.subTest(failure=failure):
                adapter = FakeAdapter(fail=failure)
                result = run(self.plan, adapter)
                self.assertFalse(result.success)
                self.assertTrue(result.rolled_back)
                self.assert_once(adapter, "restore_d1", restore_d1)
                self.assert_once(adapter, "restore_worker", restore_worker)
                self.assertEqual(adapter.deleted, list(NEW))

    def test_failed_upload_that_created_an_object_is_deleted(self):
        class CreatedThenFailedAdapter(FakeAdapter):
            def upload_new_key(self, key):
                index = self.upload_index
                self.upload_index += 1
                self.calls.append("upload_new_key")
                if index == 2:
                    return UploadOutcome(True, False)
                return UploadOutcome(True, True)
        adapter = CreatedThenFailedAdapter()
        result = run(self.plan, adapter)
        self.assertFalse(result.success)
        self.assertEqual(adapter.deleted, list(NEW[:3]))

    def test_every_live_boolean_gate_missing_or_false_fails_closed(self):
        for gate in LIVE_BOOLEAN_GATES:
            for mode in ("missing", "false"):
                with self.subTest(gate=gate, mode=mode):
                    live = good_live()
                    if mode == "missing":
                        del live[gate]
                    else:
                        live[gate] = False
                    result = run(self.plan, FakeAdapter(live=live))
                    self.assertFalse(result.success)
                    self.assertFalse(result.live_gate_passed)
                    self.assertEqual(result.error_category, ErrorCategory.LIVE_GATE)

    def test_every_live_count_gate_missing_or_wrong_fails_closed(self):
        wrong = {"public_owner_count": 19, "audio_owner_count": 19, "old_link_occurrences": 1}
        for gate in LIVE_COUNT_GATES:
            for mode in ("missing", "false", "wrong"):
                with self.subTest(gate=gate, mode=mode):
                    live = good_live()
                    if mode == "missing":
                        del live[gate]
                    elif mode == "false":
                        live[gate] = False
                    else:
                        live[gate] = wrong[gate]
                    self.assertFalse(run(self.plan, FakeAdapter(live=live)).success)

    def test_unknown_live_field_and_bool_as_count_fail_closed(self):
        live = good_live()
        live["unexpected"] = True
        self.assertFalse(run(self.plan, FakeAdapter(live=live)).success)
        live = good_live()
        live["public_owner_count"] = True
        self.assertFalse(run(self.plan, FakeAdapter(live=live)).success)

    def test_each_rollback_substep_failure_continues_and_marks_not_rolled_back(self):
        for rollback_failure in ("restore_worker", "restore_d1", "delete_new_key", "post_rollback_reconcile"):
            with self.subTest(rollback_failure=rollback_failure):
                adapter = FakeAdapter(live={name: False for name in LIVE_BOOLEAN_GATES},
                                      rollback_fail=rollback_failure)
                result = run(self.plan, adapter)
                self.assertFalse(result.rolled_back)
                self.assert_once(adapter, "restore_worker")
                self.assert_once(adapter, "restore_d1")
                self.assertEqual(len(adapter.deleted), 6)
                self.assert_once(adapter, "post_rollback_reconcile")

    def test_legacy_keys_are_never_deleted(self):
        adapter = FakeAdapter(fail="deploy_once")
        run(self.plan, adapter)
        self.assertTrue(set(adapter.deleted).isdisjoint(LEGACY))
        self.assertEqual(set(adapter.deleted), set(NEW))

    def test_result_repr_asdict_and_error_do_not_leak_fixture_values(self):
        result = run(self.plan, FakeAdapter(fail="deploy_once"))
        rendered = repr(result) + repr(dataclasses.asdict(result)) + result.error_category.name
        plan_repr = repr(self.plan)
        for secret in SENSITIVE:
            self.assertNotIn(secret, rendered)
            self.assertNotIn(secret, plan_repr)

    def test_unexecuted_live_gate_is_never_marked_passed(self):
        result = run(self.plan, FakeAdapter(fail="import_d1_once"))
        self.assertFalse(result.live_gate_passed)
        self.assertNotEqual(result.completed_step, Step.LIVE_GATE)

    def test_plan_and_config_are_immutable(self):
        with self.assertRaises(dataclasses.FrozenInstanceError):
            self.plan.new_keys = ()
        with self.assertRaises(dataclasses.FrozenInstanceError):
            self.plan.config.expected_owners = 21

    def test_adapter_exception_is_redacted_and_mutation_not_retried(self):
        class RaisingAdapter(FakeAdapter):
            def import_d1_once(self):
                self.calls.append("import_d1_once")
                raise RuntimeError(SENSITIVE[-1])
        adapter = RaisingAdapter()
        result = run(self.plan, adapter)
        self.assertEqual(result.error_category, ErrorCategory.IMPORT)
        self.assert_once(adapter, "import_d1_once")
        self.assertNotIn(SENSITIVE[-1], repr(result))


if __name__ == "__main__":
    unittest.main()
