# 古韻新生 Worker threat model

## Overview and effective resources

The implemented system is one Cloudflare Worker with Worker-first owned routes and static fallback, a D1 `DB`, private R2 `AUDIO`, Discord OAuth, Turnstile, and Cloudflare Access for administration (`wrangler.jsonc:5-14`). D1 holds identity, private contact data, registrations, votes, hashed sessions, one-use OAuth transactions, grants, settings, rate state, import ledger, and audit events (`migrations/0001_initial.sql:2-17`). R2 holds audio under random non-identity keys; public access is mediated by D1 publication state and an HMAC capability (`src/worker.js:24-27`).

Assets are contest integrity and availability; private Discord/contact data; OAuth client secret; session and CSRF material; unpublished/quarantined audio; votes; admin settings/exports; audit and import provenance. Trust boundaries are browser→Worker, Access→Worker JWT verification, Worker→Discord/Turnstile, Worker→D1/R2, and offline verified backup→staging import planner.

## Attacker capabilities and objectives

Assume anonymous clients can automate requests, vary IPs, guess public IDs, alter headers/ranges/forms, replay OAuth callbacks and idempotency keys, upload polyglots, and exhaust paid resources. Authenticated members may lose roles or attack other registrations/votes. Viewers and compromised Access identities are not trusted to mutate. Discord, Cloudflare bindings, deployment configuration, and the verified backup are assumed authentic; absence of mandatory configuration fails closed (`src/worker.js:6`).

Enforceable objectives: no private fields in public queries; no R2 access without publication plus capability checks; bounded reads/downloads; exact-origin CSRF; short hashed/revocable sessions; one-use OAuth state; current-enough role authorization; Access plus Discord grant for admin; viewer mutation denial; upload type/size/signature validation; database uniqueness as concurrency authority; staging-only verified imports.

Open questions/external gates: authoritative legacy counts/files remain unavailable; Discord confidential PKCE acceptance must be confirmed in staging; Access issuer/audience/JWKS, role IDs, Turnstile keys, budgets/alarms, and real resource identifiers require deployment-owner confirmation.

## Prioritized attacker stories and mitigations

1. **Critical — admin takeover.** Forged/missing Access JWT or ordinary Discord membership reaches exports/settings. Mitigation: RS256 issuer/audience/key validation (`src/security.js:13-18`) followed by session and D1 admin/viewer grant, with explicit viewer mutation rejection (`src/worker.js:30-31`). Residual: JWKS rotation is an external operational gate.
2. **High — account/session forgery or OAuth replay.** Mitigation: random state and S256 PKCE, hashed one-use transaction with expiry, confidential server exchange, session rotation, hashed cookie token, Secure/HttpOnly/Lax cookie, expiry/revocation (`src/worker.js:19-21`; `migrations/0001_initial.sql:6-7`).
3. **High — role drift.** Sensitive operations reject stale role snapshots and revoke the session, requiring a fresh Discord authorization (`src/worker.js:12-15`).
4. **High — private audio/data disclosure.** Public SQL selects only opaque IDs and published non-test active rows; audio repeats that predicate before private R2 read (`src/worker.js:22-24`). Public capabilities are signed and short-lived (`src/security.js:7-9`).
5. **High — malicious upload/partial replacement.** Extension, MIME, magic and 25 MiB checks precede random staged storage; active copy precedes D1 swap; staged/new objects roll back on failure; old object deletion follows the D1 update (`src/worker.js:25-27`). Residual: antivirus/content moderation is an external gate.
6. **High — vote/registration race.** D1 uniqueness constrains one registration and one vote per voter/work/stage (`migrations/0001_initial.sql:3-5`); active time windows and idempotency keys are server checked (`src/worker.js:29`).
7. **Medium — CSRF/automated writes.** Exact Origin, session CSRF header, Turnstile and account/IP buckets are composed on writes (`src/worker.js:16`).
8. **Medium — enumeration/cost exhaustion.** Pagination is capped at 100, capabilities expire, IP bursts and per-IP daily distinct-ID/byte budgets block with Retry-After and audit; verified bots bypass only bot-specific burst/scan policy, not publication/capability/budget (`src/worker.js:10-11,22-24`). Global usage thresholds remain an external alarm gate.
9. **Medium — range abuse/cache leakage.** Only one valid byte range is accepted, 416 is explicit, HEAD/ETag/304 are supported, and capability-bearing audio is not cached publicly (`src/worker.js:23-24`).
10. **Medium — corrupt import.** Explicit paths, read-only SQLite integrity, counts, filename/size/SHA-256, bidirectional orphan checks, dry-run default, and staging guard reject unsafe plans (`tools/plan_backup_import.py:11-39`).

Severity calibration: Critical permits durable admin/data compromise; High compromises identity, private content, voting integrity, or material paid resources; Medium is bounded disclosure/abuse or defense degradation; Low is limited nuisance without sensitive impact.

This sequential architecture review was not independent because delegation was unavailable. It must receive independent security review before production acceptance.
