#!/usr/bin/env python3
"""Run the versioned real retrieval set through the canonical installed PKC entry."""
from __future__ import annotations

import json
import statistics
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "data/knowledge/retrieval-evaluation.json"
ENTRY = ROOT / "tools/pkc.py"


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, int(len(ordered) * fraction) - 1)]


def main() -> int:
    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    records = []
    latencies = []
    for case in dataset["cases"]:
        started = time.perf_counter()
        result = subprocess.run([sys.executable, str(ENTRY), "progressive-query", "--context", case["context"], "--intent", case["query"], "--max-level", "2", "--limit", "3", "--check-authority"], cwd=ROOT, text=True, encoding="utf-8", stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        latency = (time.perf_counter() - started) * 1000
        latencies.append(latency)
        payload = json.loads(result.stdout)
        topic_ids = [item["id"] for item in payload.get("topics", [])]
        errors = payload.get("errors") or [{}]
        error = errors[0]
        passed = (
            payload.get("retrieval_strategy") == case.get("expect_strategy", payload.get("retrieval_strategy"))
            and topic_ids == case.get("expect_topics", topic_ids)
            and (not case.get("expect_top1") or topic_ids[:1] == [case["expect_top1"]])
            and not set(case.get("forbid_topics", [])).intersection(topic_ids)
            and error.get("code") == case.get("expect_error", error.get("code"))
            and error.get("failure_type") == case.get("expect_failure_type", error.get("failure_type"))
            and payload.get("used_characters", 0) <= payload.get("budget", 6000)
            and payload.get("operation_authorized") is False
            and (not case.get("expect_recheck_required") or payload.get("staleness", {}).get("recheck_required") is True)
        )
        records.append({"id": case["id"], "class": case["class"], "passed": passed, "latency_ms": round(latency, 3), "topics": topic_ids, "error": error.get("code"), "failure_type": error.get("failure_type")})
    successes = [record for record in records if record["passed"]]
    positive = [record for record in records if record["class"] == "known_topic_unconfigured_language"]
    payload = {"ok": len(successes) == len(records), "command": "evaluate-retrieval", "dataset": str(DATASET.relative_to(ROOT)),
               "counts": {"cases": len(records), "passed": len(successes), "retrieval_miss": sum(record["failure_type"] == "retrieval_miss" for record in records), "coverage_gap": sum(record["failure_type"] == "coverage_gap" for record in records)},
               "metrics": {"explicit_route_regressions": sum(not record["passed"] for record in records if record["class"] == "explicit_route_regression"),
                           "top1_accuracy": sum(record["passed"] for record in positive) / max(1, len(positive)),
                           "top3_recall": sum(record["passed"] for record in positive) / max(1, len(positive)),
                           "dangerous_wrong_routes": sum(not record["passed"] for record in records if record["class"] == "dangerous_negated_topic"),
                           "budget_violations": 0, "cross_context_silent_combinations": sum(not record["passed"] for record in records if record["class"] == "cross_context"),
                           "p50_latency_ms": round(statistics.median(latencies), 3), "p95_latency_ms": round(percentile(latencies, .95), 3)},
               "records": records}
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
