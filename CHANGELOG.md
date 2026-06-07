# Changelog

## [Unreleased]

### Added

- Added the standalone model-profiles extension with `/model-profile` commands, project/user profile stores, session-start reapplication, bundled skill instructions, and focused tests.
- Added `auto` as a thinking option for the `default` role in `/model-profile create` and `/model-profile edit`, so a profile can keep per-prompt adaptive thinking (low–xhigh).
- Added npm publish metadata (`repository`, `bugs`, `author`, `publishConfig`, `main`/`exports`, `prepublishOnly`) so the plugin is installable by anyone via `omp plugin install omp-model-profiles`, plus README install paths for npm, omp marketplaces, and local development.
- Added `/model-profile generate [name] <prompt>` (and a "Generate (AI)" menu entry): describe a profile in natural language and an LLM assigns models to roles with thinking selectors. The name is optional — skip it and the model proposes one (slugified) along with the profile. The call is a chat-safe one-shot via `@oh-my-pi/pi-ai` (no conversation pollution); every suggestion is validated against the available catalog and host role ids before saving, then previewed with an optional refine/activate step.
- Added provider "tabs" (`←/→`) plus type-to-filter to the model picker so roles can be assigned per provider (the same model id is often served by multiple providers).

### Changed

- Activating a profile now applies the `default` role's thinking suffix (`:high`, `:off`, `:auto`, …) to the live session instead of only switching the model. A `default` with no suffix leaves the current selector untouched.
