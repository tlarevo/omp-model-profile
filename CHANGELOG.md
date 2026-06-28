# Changelog

## [Unreleased]

### Added

- Added `bun run check:omp-head` (`scripts/check-against-omp-head.ts`) plus a weekly `.github/workflows/omp-drift.yml` — clones the current omp host source, emits and repoints its published type declarations, swaps them into `node_modules` in place of the installed `@oh-my-pi/pi-coding-agent`/`@oh-my-pi/pi-ai`, and typechecks this plugin against them, to catch host API drift before it ships in a release.
- Added `test/lifecycle.test.ts`, a full-lifecycle integration test driving the real `/model-profile` command dispatcher (`handleProfileCommand`) against a real `ProfileStore` writing to a temp dir — `save --project` → `use` → `use none` → `delete --project` — asserting the on-disk JSON and runtime settings overrides at each step.
- Added a `## Compatibility` section to the README documenting the host peer floor (`@oh-my-pi/pi-coding-agent >= 15.10.11`, `@oh-my-pi/pi-ai >= 15`) and the omp version this plugin was last verified against, with a release-checklist step to refresh it.

### Changed

- Raised the `@oh-my-pi/pi-coding-agent` / `@oh-my-pi/pi-ai` devDependency floor from `^15` to `>=15.10.11` to match the documented peer minimum, so local `check`/`test` run against a host that actually ships the `config/model-roles` subpath instead of relying on the local shim to mask the gap.

### Fixed

- Migrated `src/ui.ts` off the ad-hoc `pi.pi.getRoleInfo`/`pi.pi.MODEL_ROLE_IDS` namespace access — removed from the host's `ExtensionAPI` ahead of v16 — to importing `getRoleInfo`/`MODEL_ROLE_IDS` directly from `@oh-my-pi/pi-coding-agent/config/model-roles`, the host's supported subpath export (`>= 15.10.11`). Backed locally by `src/shims/model-roles.ts` via a tsconfig `paths` mapping so the plugin typechecks and tests without the host installed.
- Replaced the four per-file `as unknown as ProfileModel` test fixture casts (`apply.test.ts`, `generate.test.ts`, `runtime.test.ts`, `ui.test.ts`) with a single shared `test/fixtures.ts` `testModel()` helper typed as a `Pick<ProfileModel, …>` subset (`ModelFixture`). The fixtures stay structurally checked against the fields the plugin actually reads, while remaining immune to new required fields the host adds to `Model` — no `as unknown` needed.
- Corrected the `src/shims/model-roles.*` header comments: the shim backs `@oh-my-pi/pi-coding-agent/config/model-roles` for both the plugin's own `tsgo` typecheck *and* its `bun test` runtime (Bun honors tsconfig `paths` too), and is bypassed entirely when the plugin runs inside a real omp host (`>= 15.10.11`), which provides the real module.

## [0.2.0] - 2026-06-07

### Added

- Added the standalone model-profiles extension with `/model-profile` commands, project/user profile stores, session-start reapplication, bundled skill instructions, and focused tests.
- Added `auto` as a thinking option for the `default` role in `/model-profile create` and `/model-profile edit`, so a profile can keep per-prompt adaptive thinking (low–xhigh).
- Added npm publish metadata (`repository`, `bugs`, `author`, `publishConfig`, `main`/`exports`, `prepublishOnly`) so the plugin is installable by anyone via `omp plugin install omp-model-profiles`, plus README install paths for npm, omp marketplaces, and local development.
- Added `/model-profile generate [name] <prompt>` (and a "Generate (AI)" menu entry): describe a profile in natural language and an LLM assigns models to roles with thinking selectors. The name is optional — skip it and the model proposes one (slugified) along with the profile. The call is a chat-safe one-shot via `@oh-my-pi/pi-ai` (no conversation pollution); every suggestion is validated against the available catalog and host role ids before saving, then previewed with an optional refine/activate step.
- Added provider "tabs" (`←/→`) plus type-to-filter to the model picker so roles can be assigned per provider (the same model id is often served by multiple providers).

### Changed

- Activating a profile now applies the `default` role's thinking suffix (`:high`, `:off`, `:auto`, …) to the live session instead of only switching the model. A `default` with no suffix leaves the current selector untouched.