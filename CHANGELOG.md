# Changelog

## [Unreleased]

### Added

- Added the standalone model-profiles extension with `/model-profile` commands, project/user profile stores, session-start reapplication, bundled skill instructions, and focused tests.
- Added `auto` as a thinking option for the `default` role in `/model-profile create` and `/model-profile edit`, so a profile can keep per-prompt adaptive thinking (low–xhigh).
- Added npm publish metadata (`repository`, `bugs`, `author`, `publishConfig`, `main`/`exports`, `prepublishOnly`) so the plugin is installable by anyone via `omp plugin install omp-model-profiles`, plus README install paths for npm, omp marketplaces, and local development.

### Changed

- Activating a profile now applies the `default` role's thinking suffix (`:high`, `:off`, `:auto`, …) to the live session instead of only switching the model. A `default` with no suffix leaves the current selector untouched.
