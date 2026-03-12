#!/usr/bin/env python3
"""Post-deploy sanity check.

Hits critical API endpoints on the live deployment and reports pass/fail.

Usage:
    python scripts/post_deploy_check.py                          # defaults
    python scripts/post_deploy_check.py --api https://my-api.fly.dev --frontend https://my-app.vercel.app
"""
from __future__ import annotations

import argparse
import sys
import time

import httpx

DEFAULT_API = "https://interview-with-giri-api.fly.dev"
DEFAULT_FRONTEND = "https://hire-with-giri.vercel.app"

CHECKS: list[dict] = []


def check(name: str, *, critical: bool = True):
    def decorator(fn):
        CHECKS.append({"name": name, "fn": fn, "critical": critical})
        return fn
    return decorator


@check("API health")
def api_health(ctx: dict) -> None:
    r = httpx.get(f"{ctx['api']}/api/v1/health", timeout=15)
    assert r.status_code == 200, f"status {r.status_code}"
    body = r.json()
    assert body["status"] == "healthy", f"unhealthy: {body}"


@check("API DB health")
def api_db_health(ctx: dict) -> None:
    r = httpx.get(f"{ctx['api']}/api/v1/health/db", timeout=15)
    assert r.status_code == 200, f"status {r.status_code}"
    body = r.json()
    assert body["database"] == "connected", f"db: {body}"


@check("API auth rejects unauthenticated")
def api_auth_guard(ctx: dict) -> None:
    r = httpx.get(f"{ctx['api']}/api/v1/job-postings", timeout=15)
    assert r.status_code == 401, f"expected 401, got {r.status_code}"


@check("Frontend loads", critical=False)
def frontend_loads(ctx: dict) -> None:
    r = httpx.get(ctx["frontend"], timeout=15, follow_redirects=True)
    assert r.status_code == 200, f"status {r.status_code}"
    assert "html" in r.headers.get("content-type", "").lower(), "not HTML"


def main() -> None:
    parser = argparse.ArgumentParser(description="Post-deploy sanity checks")
    parser.add_argument("--api", default=DEFAULT_API, help="Backend API base URL")
    parser.add_argument("--frontend", default=DEFAULT_FRONTEND, help="Frontend base URL")
    args = parser.parse_args()

    ctx = {"api": args.api.rstrip("/"), "frontend": args.frontend.rstrip("/")}
    passed = 0
    failed = 0
    results: list[str] = []

    print(f"\n  Post-deploy checks  |  API: {ctx['api']}  |  Frontend: {ctx['frontend']}\n")

    for entry in CHECKS:
        name = entry["name"]
        critical = entry["critical"]
        t0 = time.monotonic()
        try:
            entry["fn"](ctx)
            elapsed = (time.monotonic() - t0) * 1000
            results.append(f"  PASS  {name} ({elapsed:.0f}ms)")
            passed += 1
        except Exception as exc:  # noqa: BLE001
            elapsed = (time.monotonic() - t0) * 1000
            tag = "FAIL" if critical else "WARN"
            results.append(f"  {tag}  {name} ({elapsed:.0f}ms) -- {exc}")
            if critical:
                failed += 1

    for line in results:
        print(line)

    print(f"\n  {passed} passed, {failed} failed\n")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
