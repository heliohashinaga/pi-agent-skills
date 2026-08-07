---
name: security
description: |
  Security review skill — run a security pass on code, diffs and infra: OWASP
  code-review checklist, secret scanning, dependency/SCA audit, SAST, SSRF and
  authz checks, and gates for AI-generated code. Use when reviewing changes for
  vulnerabilities, auditing a repo, or enforcing security before merge.
---

# Security Review Skill

Treat **all AI-generated diffs as untrusted**. Review strategy first, then
checks, then automated gates.

## Strategy (do this before the checklist)
1. **Map the threat surface**: who is the actor, what data do they touch, what
   assumptions does the code make?
2. **Automate mechanical checks** (SAST/secret/SCA scans below), keep **human
   review for authz + business logic** (scans can't validate authorization).

## Code-review checklist (verify in every security-relevant diff)

### Authorization & identity
- Enforce **server-side authz on every state-changing endpoint** — not just login.
- **Per-resource permission**: user can access *that specific* resource (IDOR/BOLA),
  not merely "is authenticated".
- Never trust client-provided roles/IDs; validate identity server-side.
- Trace inputs → authorization check to prove no bypass before the sink.

### Injection & SSRF
- **Parameterize all DB queries** (SQLi incl. PostGIS/raw); contextually encode output.
- Treat **all external/untrusted data** as unsafe.
- **SSRF**: allowlist user-supplied URLs; block internal/private ranges + cloud
  metadata endpoints (this API hits external providers — check the URLs).
- Template injection: validate and encode template inputs.

### Secrets & exposure
- Block **hardcoded credentials** (keys, tokens, private keys) in code, tests,
  comments, config — and in client-exposed vars (`NEXT_PUBLIC_*`/`VITE_*`).
- Use env vars / secret managers only; `.env` is never committed.

### API hygiene
- **Rate limiting** per IP and per user on all endpoints (auth + high-value ops);
  cover frequency, payload size, query complexity.
- CORS tightened; security headers set; auth headers (`X-Api-Key`) validated.
- No sensitive data in logs/structured output; correlation IDs only.

### Dependencies & supply chain
- Lockfiles present and audited; **verify added packages are real** (typosquatting/hallucinated).
- Scan for known CVEs (SCA); pin actions to full commit SHAs in CI.

## Automated gates (phased, priority order)
1. **Secret scanning** — Gitleaks (pre-commit); block ALL new detections.
2. **SCA** — Trivy/Snyk; block Critical/High CVEs only when a fix exists.
3. **SAST** — Semgrep/CodeQL: injection, path traversal, template flaws;
   report-only first (2 weeks), then block High-confidence Critical/High.
4. **Container scan** — after build, before push; fail on Critical OS/library CVEs.
- Run gates in parallel, feedback <5 min; centralize in reusable workflows.

## Reporting
Render findings by severity (Critical/High/Medium/Low) with file:line + fix
suggestion and the OWASP category. When the caller's structured schema uses
`blocker | high | medium | low`, map Critical to `blocker` and emit only that
schema's values. In a broader code-review report, retain its overall verdict and
add `Security: SECURE | SECURITY_CHANGES_REQUESTED`.
Never approve with unresolved Critical/High findings.

## Gitmoji
Security fixes and hardening: `:lock:` — e.g.
`:lock: fix(security): parameterize sql`.
