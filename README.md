# omp Model Profiles

Named model-role profiles for omp. A profile sets different models for the built-in roles (`default`, `smol`, `slow`, `vision`, `plan`, `designer`, `commit`, `task`) and switches them all at once with `/model-profile`.

## Install

Once published to npm, anyone can install it with one command:

```sh
omp plugin install omp-model-profile
```

This downloads the package into `~/.omp/plugins/`, where omp discovers its
`/model-profile` command, `session_start` hook, and bundled skills. Verify with
`omp plugin list` / `omp plugin doctor`, then reload a running session with
`/reload-plugins`.

### Direct from GitHub (no npm publish required)

Because the package lives at the repo root, omp can install it straight from git:

```sh
omp plugin install github:tlarevo/omp-model-profile
```

### Via an omp marketplace (in-app discovery)

Host a catalog from any git repo that contains a `.claude-plugin/marketplace.json`,
with an entry pointing at this repo:

```json
{
  "name": "my-omp-plugins",
  "owner": { "name": "tlarevo" },
  "plugins": [
    {
      "name": "model-profile",
      "description": "Named model-role profiles for omp",
      "source": { "source": "github", "repo": "tlarevo/omp-model-profile" }
    }
  ]
}
```

Users then run:

```sh
omp plugin marketplace add <your-catalog-repo>
omp plugin install model-profile@my-omp-plugins
```

> npm sources in a marketplace catalog are not yet supported — use the npm
> command above (`omp plugin install omp-model-profile`) for the npm channel.

### Local development

Clone this repo, then symlink it so edits go live with `/reload-plugins`:

```sh
omp plugin link path/to/omp-model-profile
```

Or load it ad-hoc for a single session without installing:

```sh
omp -e path/to/omp-model-profile/src/index.ts
```

## Commands

```text
/model-profile                 Open the menu (interactive)
/model-profile use <name|none> Activate or clear a profile
/model-profile show <name>     Inspect a profile
/model-profile create <name>   Build a profile with model pickers
/model-profile save <name>     Snapshot current role settings
/model-profile edit <name>     Change one role's model
/model-profile delete <name>   Remove a profile
/model-profile list            List all profiles
```

Writes default to the project file. Add `--scope user`, `--user`, or `--project` to target a scope.

## Storage

Project profiles live at:

```text
<cwd>/.omp/model-profiles.json
```

User profiles live at:

```text
~/.omp/agent/model-profiles.json
```

Effective profiles are merged as `{ ...user.profiles, ...project.profiles }`, so project profiles win by name. The active pointer prefers the project file, then the user file.

## JSON format

```json
{
  "active": "deep-review",
  "profiles": {
    "deep-review": {
      "description": "High-quality planning/review",
      "modelRoles": {
        "default": "anthropic/claude-sonnet-4-5:high",
        "plan": "anthropic/claude-opus-4-5:high",
        "task": "openai-codex/gpt-5-codex:medium",
        "commit": "anthropic/claude-haiku-4-5:minimal"
      },
      "cycleOrder": ["smol", "default", "slow"],
      "taskAgentModelOverrides": {
        "reviewer": "pi/slow"
      }
    }
  }
}
```

Thinking suffixes (`:minimal`, `:low`, `:medium`, `:high`, `:xhigh`, `:off`, `:auto`) are preserved in role settings. On activation, the **`default`** role's suffix is applied to the live session — including `:auto`, which keeps per-prompt adaptive thinking (low–xhigh). A `default` with no suffix leaves the current thinking selector untouched. Other roles keep their concrete suffixes for subagents/pickers via omp's resolver; `auto` is offered only for the `default` role since it is a session-level selector.
