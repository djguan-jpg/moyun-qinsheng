import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "plan_backup_import", ROOT / "tools" / "plan_backup_import.py"
)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


def test_wrangler_ingest_artifact_accepts_ordered_non_transactional_sql():
    sql = "PRAGMA foreign_keys=ON;\nINSERT INTO users VALUES(1);\n"
    MOD.validate_wrangler_ingest_sql(sql)


@pytest.mark.parametrize(
    "statement",
    [
        "BEGIN;",
        "BEGIN TRANSACTION;",
        "COMMIT;",
        "SAVEPOINT import_rows;",
        "RELEASE import_rows;",
        "ROLLBACK;",
        "ROLLBACK TO import_rows;",
    ],
)
def test_wrangler_ingest_artifact_rejects_transaction_control(statement):
    with pytest.raises(SystemExit, match="transaction control"):
        MOD.validate_wrangler_ingest_sql(
            "PRAGMA foreign_keys=ON;\n  " + statement + "\nINSERT INTO users VALUES(1);\n"
        )
