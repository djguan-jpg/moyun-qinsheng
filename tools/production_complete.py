"""Safety CLI for the production adapter. Default mode is offline validation."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Callable

from tools.production_adapter import (CloudflareProductionAdapter, ProductionExecutionConfig,
                                      ProductionSafetyError, guard_existing_private)
from tools.production_state_machine import ProductionPlan, run

CONFIRMATIONS = {
    "confirm_account": "CONFIRM_EXACT_ACCOUNT",
    "confirm_resources": "CONFIRM_EXACT_RESOURCES",
    "confirm_backup": "CONFIRM_BACKUP_AND_ROLLBACK",
    "confirm_mutation": "CONFIRM_PRODUCTION_MUTATION",
}


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser()
    value.add_argument("--config", required=True)
    value.add_argument("--token-file", required=True)
    value.add_argument("--production", action="store_true")
    value.add_argument("--validate-only", action="store_true")
    for flag in CONFIRMATIONS:
        value.add_argument("--" + flag.replace("_", "-"))
    return value


def execute(argv: list[str] | None = None, *, repo: Path | None = None,
            adapter_factory: Callable[..., Any] = CloudflareProductionAdapter,
            run_core: Callable[..., Any] = run) -> tuple[int, dict[str, object]]:
    root = (repo or Path(__file__).resolve().parents[1]).resolve(strict=True)
    args = None
    token_path: Path | None = None
    result = None
    category = "VALIDATION_FAILED"
    evidence_written = False
    token_absent = False
    production_requested = False
    try:
        args = parser().parse_args(argv)
        production_requested = args.production
        supplied_token = Path(args.token_file).expanduser()
        if not supplied_token.is_absolute():
            raise ProductionSafetyError("UNSAFE_PATH")
        # Validate the independently supplied token path before reading config so
        # the outer finally always knows the exact deletion target.
        guarded_token = guard_existing_private(supplied_token, root)
        token_path = guarded_token
        config = ProductionExecutionConfig.load(args.config, root)
        if config.token_file != guarded_token:
            raise ProductionSafetyError("TOKEN_PATH_MISMATCH")
        plan = ProductionPlan(tuple(x.key for x in config.new), tuple(x.key for x in config.legacy))
        if not plan.is_valid():
            raise ProductionSafetyError("PLAN_INVALID")
        if not production_requested:
            category = "VALIDATED_OFFLINE"
        else:
            if args.validate_only or any(getattr(args, key) != exact for key, exact in CONFIRMATIONS.items()):
                raise ProductionSafetyError("CONFIRMATION_REQUIRED")
            adapter = adapter_factory(config, root)
            result = run_core(plan, adapter)
            category = result.error_category.name
            evidence_written = (config.private_output / "live-evidence.json").is_file()
    except ProductionSafetyError as exc:
        category = str(exc) if str(exc) and len(str(exc)) < 64 else "SAFETY_ERROR"
    except SystemExit:
        category = "CLI_INVALID"
    except Exception:
        category = "INTERNAL_ERROR"
    finally:
        try:
            if token_path is not None and token_path.exists():
                token_path.unlink()
            token_absent = token_path is not None and not token_path.exists()
        except Exception:
            token_absent = False
            category = "TOKEN_DELETE_FAILED"
    live = bool(production_requested and result is not None and result.success
                and token_absent and evidence_written)
    summary = {
        "LIVE_ACCEPTED": live,
        "validated": category == "VALIDATED_OFFLINE",
        "success": bool(result is not None and result.success and token_absent),
        "rolled_back": bool(result is not None and result.rolled_back),
        "mutation_count": result.mutation_count if result is not None else 0,
        "upload_count": result.upload_count if result is not None else 0,
        "import_count": result.import_count if result is not None else 0,
        "deploy_count": result.deploy_count if result is not None else 0,
        "token_absent": token_absent,
        "evidence_written": evidence_written,
        "error_category": category,
    }
    return (0 if (category == "VALIDATED_OFFLINE" or live) else 1), summary


def main(argv: list[str] | None = None) -> int:
    code, summary = execute(argv)
    print(json.dumps(summary, sort_keys=True, separators=(",", ":")))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
