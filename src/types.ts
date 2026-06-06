/**
 * Shared types for the model-profiles extension.
 *
 * A *profile* is a named preset that assigns a model to each built-in role
 * (Architect/`plan`, Default, Subtask/`task`, …) plus optional cycle order and
 * per-subagent overrides. Switching profiles re-points every role consumer at
 * once via runtime settings overrides.
 */

/** Where a profile is stored. Project files win over user files by name. */
export type ProfileScope = "user" | "project";

/** A single named profile. */
export interface ModelProfile {
	/** Free-text description shown in pickers and `show`. */
	description?: string;
	/**
	 * Role id → model pattern. Keys are role ids (`default`, `plan`, `task`, …);
	 * values are model patterns understood by the host resolver
	 * (e.g. `anthropic/claude-sonnet-4-5:high` or `pi/slow`).
	 */
	modelRoles: Record<string, string>;
	/** Optional Ctrl+P cycle order (role ids / model patterns). */
	cycleOrder?: string[];
	/** Optional per-subagent model overrides (`task.agentModelOverrides`). */
	taskAgentModelOverrides?: Record<string, string>;
}

/** On-disk shape of a single scope's profile file. */
export interface ProfileFile {
	/** Name of the active profile in this scope, if any. */
	active?: string;
	/** Named profiles keyed by profile name. */
	profiles: Record<string, ModelProfile>;
}

/** Merged view across user + project scopes (project wins by name). */
export interface EffectiveProfiles {
	/** Profile name → profile (project entries override user entries). */
	profiles: Record<string, ModelProfile>;
	/** Active profile name (project active wins; falls back to user). */
	active: string | undefined;
	/** Scope each surviving profile name came from (for edit/delete targeting). */
	sources: Record<string, ProfileScope>;
}
