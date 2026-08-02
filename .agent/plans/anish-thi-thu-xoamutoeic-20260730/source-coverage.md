# Source coverage

This file maps owner requirements and discoveries to executable slices. The
ledger carries the same IDs.

| Source ID | Requirement or decision | Allocated slices |
|---|---|---|
| REQ-001 | XoaMu is the complete behavioral/layout blueprint for Anish `/thi-thu`; only color/branding and shared Anish shell differ | S0,S3,S4-FE,S5-FE,S6-FE,S7 |
| REQ-002 | Save literal production source with Chrome Ctrl+S/Webpage Complete; images alone are insufficient | S0 |
| REQ-003 | Build the supplied two-app monorepo: Vite 5173, `/api` proxy, Express 7000, MySQL/Redis/S3/Cloudinary/Gemini | S1,S2,S3,S4-BE,S4-FE,S5-BE,S5-FE,S6-BE,S6-FE,S7 |
| REQ-004 | Implement the full L&R and S&W feature surface, but no production exam data is needed | S2,S3,S4-BE,S4-FE,S5-BE,S5-FE,S6-BE,S6-FE,S7 |
| DEC-001 | Catalog is public; login is required before creating an attempt | S2,S3,S7 |
| DEC-002 | Deployment target is the existing VPS topology; Cloudflare is edge DNS/CDN/TLS, not Workers | S1,S7 |
| DEC-003 | The old root prototype and its backup are unrelated to the target architecture | S1,S7 |
| DEC-004 | Production database starts empty; only synthetic dev/test fixtures may exercise the full flow | S2,S4-BE,S4-FE,S5-BE,S5-FE,S6-BE,S6-FE,S7 |
| DEC-005 | Antigravity starts only after the harness/reference commit exists on remote primary `master`; implementation uses a feature branch | S1,S7 |
| DISC-001 | Existing reference folder contains 44 screenshots plus DOM/a11y evidence but no complete Chrome Webpage Complete corpus | S0 |
| DISC-002 | XoaMu anonymous S&W grading fails late, some media is missing, and public payloads expose review content | S2,S5-BE,S5-FE,S6-BE,S6-FE,S7 |
| DISC-003 | Current repo install/lint/media baseline is not clean and cannot be used as merge contract | S1,S7 |
| INJ-001 | Owner accepts real-Chrome CDP `Page.captureSnapshot({ format: "mhtml" })` as equivalent to Ctrl+S Webpage Complete, conditional on complete per-state artifacts, SHA-256 manifest, and successful offline reopen | S0 |
| INJ-002 | Production S&W grading calls a provider-neutral Cloudflare AI Worker adapter over HTTP; deterministic tests remain local; no direct Google Generative AI call or `Math.random` in Express | S6-BE,S7 |
| INJ-003 | Resume required fresh runner-backed proof for all prior claims, 35-state visual mapping, full failure/security/release matrices, real media fixtures and clean-snapshot verification; expected dirty deliverables are not a blocker | S2,S3,S4-FE,S5-FE,S6-FE,S7 |
| INJ-004 | Survey and adapt the customer public shell/auth return around `/thi-thu`; add only the mock-exam Admin surfaces (`Đề thi ONLINE`, `Đề hỗn hợp`, `Kết quả thi ONLINE`), bulk Word/media authoring and unresolved learner media/grading fixes; use up to ten logical roles with host-cap-aware waves and independent browser/security/release review | R4-CONTRACT,R4-SURVEY,R4-ADMIN-BE,R4-ADMIN-FE,R4-IMPORT,R4-LEARNER,R4-QA,R4-RELEASE |

## Injection handling

Any later owner instruction is recorded with the next free `INJ-NNN` ID in the
existing runtime ledger through the governing workctl harness, then mapped here
before execution continues. Never create another work ID, plan or ledger.
Changing an acceptance claim invalidates its old receipt and requires fresh
proof.

## Scope conflict precedence

1. Latest explicit owner instruction.
2. Locked owner decisions above.
3. Human-readable plan.
4. Machine ledger state.
5. Existing prototype behavior.

Prototype behavior never overrides the target architecture or XoaMu parity
contract.
