# Customer merge contract — Anish TOEIC

Last updated: 2026-08-01. This is durable project context, not proof that a
feature passed.

## Owner decisions

- Survey the public customer shell at `https://anishtoeic.vn/`, including the
  header, footer, login, registration and auth-return behavior that frames the
  mock-exam module. Adapt only the relevant shared-shell/auth seams; do not
  recreate unrelated public modules.
- Build only mock-exam administration: `Đề thi ONLINE`, `Đề hỗn hợp`, and
  `Kết quả thi ONLINE`.
- Do not implement dashboard KPIs, XP/GEM, exercises, vocabulary, theory,
  classes, bulk account creation, payment, or unrelated user administration.
- Match the customer Admin shell proportions and the observed `Quản lý ĐỀ THI`
  submenu. Unobserved routes/states are not parity evidence.
- One administrator may draft, validate, preview, and publish in v1. Use
  capability-based RBAC and append-only audit so Author/Reviewer can be added.
- Authoring must support bulk editing and Word import. Do not force users to
  create one question or paste one image at a time.
- Word media choices: embedded images, optional media ZIP, multi-file/folder
  mapping, and existing media library. Reject macro/OLE and unsafe hotlinks.
- Customer stack and folder conventions have merge priority.
- No commit, push, or deployment without owner authorization.

## Customer platform baseline

```text
anish-toeic-web-app       Vite :5173
anish-toeic-web-services  Express :7000
/api                      proxied to 127.0.0.1:7000
```

Frontend target: React 18, TypeScript, Vite/SWC, React Router v6, TanStack
Query, Zustand, React Hook Form, Yup/Zod, Tailwind CSS 4, Ant Design, Lucide,
Framer Motion, Recharts, TinyMCE/Monaco/Quill adapters, Axios, Google OAuth,
DOMPurify, and DnD Kit.

Backend target: Node >=18, Express 4, MySQL/mysql2, Redis/ioredis, JWT/bcrypt/
cookie auth, Multer/Cloudinary/S3 media adapters, Nodemailer/SendGrid, VNPay,
Helmet/CORS/rate-limit/Zod/Jest. This module must not duplicate unrelated host
services.

Preferred folder compatibility:

```text
anish-toeic-web-app/src/{pages,components,routes,query,shared,services,hooks,lib,utils,types,constants,config,styles,modules}
anish-toeic-web-services/src/{routes,controllers,services,middlewares,validations,config,utils,types,constants,data,scripts}
```

## Compatibility decisions

- Author new routing against `react-router-dom` v6-compatible public APIs. The
  exact customer lockfile wins at merge time.
- Preserve existing security improvements through ports/adapters: cookie+jti
  session revocation, S3/MinIO direct upload, fail-closed environment schemas,
  idempotent grading and audit logs.
- Host authentication owns production identity and password hashing. Standalone
  development auth must not force a second production account system.
- Production S&W grading remains Cloudflare AI Worker over HTTP through the
  provider-neutral adapter and deterministic test double. Existing Google AI
  use elsewhere in the customer platform is out of scope; do not call Google
  directly from this Express module.

## Observed Admin reference

- Source screenshot: `codex-clipboard-3bea80de-be80-46f6-af05-503c0d9db1e3.png`,
  1628x958, URL `/admin/dashboard`.
- Source crop: `codex-clipboard-57613280-c76b-41fc-9953-e25a3f73488a.png`.
- Desktop sidebar is approximately 240px, dark royal/navy blue, with white/light
  content cards and blue primary actions.
- Observed submenu order: `Đề thi ONLINE`, `Đề hỗn hợp`,
  `Kết quả thi ONLINE`; the first item is active in the crop.
- No mobile Admin reference, exact font token, authenticated route inventory,
  form state, or hover/error behavior has been observed. Keep these
  `UNVERIFIED` until client evidence or browser access is supplied.

Public-site header/footer/login/registration behavior must be captured fresh
with Playwright plus real Chrome CDP before making parity claims. Public access
does not authorize bypassing client Admin authentication or collecting private
data.

## Scope still requiring external proof

- Authenticated client Admin/SSO and exact host route mapping.
- Human visual approval for learner states and Admin shell.
- Live Cloudflare AI, production S3, VPS Nginx/PM2, Cloudflare edge and TLS.
- Licensed production question/media content.
