# Repository agent guidance

This is the web client for **FamSub**, a shared-subscription cost splitter for a
private friend group. It is a React 19 + Vite + TypeScript SPA and it is useless
on its own — every screen is a view onto the backend API.

## Workspace layout

Sibling repositories under `/media/ok/Space/Code/mine`:

- `../fam-sub-be` — the **Kotlin / Spring Boot API and the source of truth for
  the domain model, DTO shapes, and authorization**. Read its `AGENTS.md`
  before changing anything about auth, roles, or the data a screen shows. A new
  field on a screen almost always means a change there first; do not invent
  client-side derivations of money or debt that the backend already computes.
- `../fam-sub-cli` — the retired Java CSV prototype. Historical reference only.
- `../../almonium/almonium-infra` — owns deployment. The nginx SPA config that
  makes client-side routing work in production is `nginx-configs/spa.conf`
  there, not in this repository's `Dockerfile`.
- `../../almonium/almonium-fe` and `almonium-mobile` — a separate product that
  shares the host, domain, and Google OAuth client. No shared code.

## How it fits together

The API lives at `VITE_API_BASE_URL` (`http://localhost:8888/v1` in dev,
`https://api.famsub.almonium.com/v1` in prod). Because the client and API are on
different subdomains, **every fetch must pass `credentials: 'include'`** — auth
is a server-side session cookie, not a token, and there is nothing in
`localStorage` to attach. Sign-in is a full-page redirect to
`API_CONFIG.GOOGLE_OAUTH_URL`; the backend redirects back to `app.web-domain`
on success.

`App.tsx` calls `/public/auth/me` once on mount and routes on the roles it
returns: `ADMIN` → `/admin`, `SUBSCRIBER` → `/subscriber/cabinet`, both →
`/choose-role`, neither → `/no-access`. Roles are compared case-insensitively
with the `ROLE_` prefix stripped; keep using the existing `hasRole` helper
rather than comparing strings inline.

`AdminDashboard` does its own switching on `location.pathname` in
`renderSectionContent()` and renders no `<Outlet/>`, so `App.tsx` routes the
whole admin area through a single `/admin/*` splat. Add a new admin section by
extending `SECTION_CONFIGS` and `renderSectionContent` — a nested `<Route>`
would render nothing.

## Conventions

- One component per feature area in `src/components/`, each with a sibling
  plain-CSS file imported by `AdminDashboard`. There is no CSS framework, no
  CSS modules, and no design-token file — colors and spacing are literal values
  repeated per file. Match the neighbouring file rather than introducing a new
  styling approach in a single component.
- API endpoint URLs are centralised in `src/config/api.ts`. Add new ones there;
  do not build URLs inline.
- Response types mirror backend DTOs one-to-one in `src/types/*.ts`. Keep field
  names identical to the JSON — no camel/snake remapping layer exists.
- Errors from the API arrive as `ApiErrorResponse` (`message`, `status`,
  `path`); surface them through `src/utils/errors.ts` and the toast context
  rather than `alert` or bare console logging.
- There is no data-fetching library and no global store: components own their
  own `useState` + `fetch` + loading/error flags. Follow that pattern unless
  the owner decides to adopt a query library across the app.

## Building and testing

`npm run dev` (port 9000), `npm run build` (`tsc -b` then Vite), `npm run
lint`. There are **no tests and no test runner configured**; verify changes by
running the app against a local backend.

Production images are built by `.github/workflows/build-and-deploy-prod.yml`,
which injects `VITE_API_BASE_URL` and `VITE_GOOGLE_CLIENT_ID` as build args from
repository variables — these are baked into the bundle at build time, so they
are public by construction. Never put a secret in a `VITE_*` variable.

## Finishing work

After completing a requested implementation and its verification, stage only the
files that belong to that task and create a focused commit. Split unrelated
concerns into separate commits rather than one sweep. Do not include unrelated
working-tree changes, and do not amend an existing commit unless asked. Report
the commit hashes in the handoff.

Never end a task with the work sitting uncommitted. The only exceptions are when
the user explicitly asks for that, or when the work is blocked or waiting on a
material decision from them — and in those cases say plainly that the changes
are uncommitted and why.

A change to a backend DTO field name must land here too; coordinate the two
commits so the deployed pair are never far apart. Committing is not deploying —
this repository deploys on push to `main`, which is a separate explicit step.
