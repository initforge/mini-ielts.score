# Anish TOEIC `/thi-thu` Integration Contract

## 1. Monorepo Structure
The repository is split into two independent npm workspaces:
- `anish-toeic-web-app`: Vite + React frontend (Port 5173).
- `anish-toeic-web-services`: Express + TypeScript backend (Port 7000).

## 2. Shared Shell Principles
- The frontend will utilize shared Anish navbar and footer components as adapters.
- No XoaMu global shell components or minified bundles are imported.
- Routing relies on `react-router-dom` v6 with the feature path mounted at `/thi-thu`.
- The `/api` requests from port 5173 are proxied to port 7000.

## 3. Deployment and Infrastructure
- Database: MySQL (empty initial seed, test fixtures only).
- Background Worker: Redis backing for idempotent S&W grading; the worker calls a Cloudflare AI Worker over HTTP through a provider-neutral adapter, with `AI_GRADING_TEST_MODE=true` substituting a deterministic test double (no network, no randomness) for dev/test.
- Media: AWS S3 or Cloudinary with presigned bounded upload URLs.
- App Runtime: PM2 for Express, Nginx for static frontend and `/api` proxy.

## 4. Component Boundaries
- **Frontend shell**: `src/modules/mock-exam` containing routes under `src/pages/user`.
- **Backend shell**: Express 4 app following route -> controller -> service -> validation pattern.
- State management strictly separates server state (TanStack Query) from transient runner state (Zustand).
