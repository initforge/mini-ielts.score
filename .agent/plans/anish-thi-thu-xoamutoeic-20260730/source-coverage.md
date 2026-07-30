# Source coverage

This file maps owner requirements and discoveries to executable slices. The
ledger carries the same IDs.

| Source ID | Requirement or decision | Allocated slices |
|---|---|---|
| REQ-001 | XoaMu is the complete behavioral/layout blueprint for Anish `/thi-thu`; only color/branding and shared Anish shell differ | S0,S3,S4,S5,S6,S7 |
| REQ-002 | Save literal production source with Chrome Ctrl+S/Webpage Complete; images alone are insufficient | S0 |
| REQ-003 | Build the supplied two-app monorepo: Vite 5173, `/api` proxy, Express 7000, MySQL/Redis/S3/Cloudinary/Gemini | S1,S2,S3,S4,S5,S6,S7 |
| REQ-004 | Implement the full L&R and S&W feature surface, but no production exam data is needed | S2,S3,S4,S5,S6,S7 |
| DEC-001 | Catalog is public; login is required before creating an attempt | S2,S3,S7 |
| DEC-002 | Deployment target is the existing VPS topology; Cloudflare is edge DNS/CDN/TLS, not Workers | S1,S7 |
| DEC-003 | The old root prototype and its backup are unrelated to the target architecture | S1,S7 |
| DEC-004 | Production database starts empty; only synthetic dev/test fixtures may exercise the full flow | S2,S4,S5,S6,S7 |
| DEC-005 | Antigravity starts only after the harness/reference commit exists on remote primary `master`; implementation uses a feature branch | S1,S7 |
| DISC-001 | Existing reference folder contains 44 screenshots plus DOM/a11y evidence but no complete Chrome Webpage Complete corpus | S0 |
| DISC-002 | XoaMu anonymous S&W grading fails late, some media is missing, and public payloads expose review content | S2,S5,S6,S7 |
| DISC-003 | Current repo install/lint/media baseline is not clean and cannot be used as merge contract | S1,S7 |

## Injection handling

Any later owner instruction is recorded with the next free `INJ-NNN` ID via
`workctl add-source`, mapped to affected slices before execution continues.
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
