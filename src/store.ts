/**
 * Profile persistence: tolerant JSON parsing, user/project merge, and
 * scope-aware read-modify-write. Zero runtime deps — `Bun.file`/`Bun.write`.
 *
 * Pure helpers (`parseProfileFile`, `mergeProfiles`) are exported separately so
 * the merge precedence and tolerant-parse contracts can be unit-tested without
 * touching the filesystem.
 */
import type { EffectiveProfiles, ModelProfile, ProfileFile, ProfileScope } from "./types";

/** Filename used in both scopes. */
export const STORE_FILENAME = "model-profiles.json";

function parseStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const out: string[] = [];
	for (const entry of value) {
		if (typeof entry === "string" && entry.trim()) out.push(entry.trim());
	}
	return out;
}

function parseStringRecord(value: unknown): Record<string, string> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const out: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		if (typeof entry === "string" && entry.trim()) out[key] = entry.trim();
	}
	return Object.keys(out).length ? out : undefined;
}

/** Coerce an arbitrary value into a {@link ModelProfile}, or drop it. */
function parseProfile(value: unknown): ModelProfile | undefined {
	if (!value || typeof value !== "object") return undefined;
	const obj = value as Record<string, unknown>;

	const modelRoles: Record<string, string> = {};
	if (obj.modelRoles && typeof obj.modelRoles === "object" && !Array.isArray(obj.modelRoles)) {
		for (const [role, model] of Object.entries(obj.modelRoles as Record<string, unknown>)) {
			if (typeof model === "string" && model.trim()) modelRoles[role] = model.trim();
		}
	}

	const profile: ModelProfile = { modelRoles };
	if (typeof obj.description === "string" && obj.description.trim()) profile.description = obj.description.trim();

	const cycleOrder = parseStringArray(obj.cycleOrder);
	if (cycleOrder.length) profile.cycleOrder = cycleOrder;

	const overrides = parseStringRecord(obj.taskAgentModelOverrides);
	if (overrides) profile.taskAgentModelOverrides = overrides;

	return profile;
}

/**
 * Parse raw file contents into a valid {@link ProfileFile}, tolerating missing
 * fields, wrong types, and malformed entries (each is dropped, never thrown).
 */
export function parseProfileFile(raw: unknown): ProfileFile {
	if (!raw || typeof raw !== "object") return { profiles: {} };
	const obj = raw as Record<string, unknown>;

	const profiles: Record<string, ModelProfile> = {};
	if (obj.profiles && typeof obj.profiles === "object" && !Array.isArray(obj.profiles)) {
		for (const [name, value] of Object.entries(obj.profiles as Record<string, unknown>)) {
			const profile = parseProfile(value);
			if (profile) profiles[name] = profile;
		}
	}

	const active = typeof obj.active === "string" && obj.active.trim() ? obj.active.trim() : undefined;
	return active ? { active, profiles } : { profiles };
}

/**
 * Merge user and project scopes. Project profiles override user profiles by
 * name; the active pointer prefers project, then user, and must resolve to a
 * surviving profile.
 */
export function mergeProfiles(user: ProfileFile, project: ProfileFile): EffectiveProfiles {
	const profiles: Record<string, ModelProfile> = {};
	const sources: Record<string, ProfileScope> = {};

	for (const [name, profile] of Object.entries(user.profiles)) {
		profiles[name] = profile;
		sources[name] = "user";
	}
	for (const [name, profile] of Object.entries(project.profiles)) {
		profiles[name] = profile;
		sources[name] = "project";
	}

	const candidate = project.active ?? user.active;
	const active = candidate && candidate in profiles ? candidate : undefined;
	return { profiles, active, sources };
}

/** Scope-aware profile storage backed by two JSON files. */
export class ProfileStore {
	readonly #userPath: string;
	readonly #projectPath: string;

	constructor(userPath: string, projectPath: string) {
		this.#userPath = userPath;
		this.#projectPath = projectPath;
	}

	pathFor(scope: ProfileScope): string {
		return scope === "user" ? this.#userPath : this.#projectPath;
	}

	/** Read one scope's file. Missing → empty; malformed JSON → thrown. */
	async readScope(scope: ProfileScope): Promise<ProfileFile> {
		const filePath = this.pathFor(scope);
		try {
			const raw = await Bun.file(filePath).json();
			return parseProfileFile(raw);
		} catch (err) {
			if (err instanceof Error && (err as { code?: string }).code === "ENOENT") return { profiles: {} };
			throw new Error(
				`model-profiles: cannot parse ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async writeScope(scope: ProfileScope, file: ProfileFile): Promise<void> {
		await Bun.write(this.pathFor(scope), `${JSON.stringify(file, null, 2)}\n`);
	}

	/** Merged user + project view. */
	async loadEffective(): Promise<EffectiveProfiles> {
		const [user, project] = await Promise.all([this.readScope("user"), this.readScope("project")]);
		return mergeProfiles(user, project);
	}

	/** Set (or clear, when `name` is undefined) the active pointer in a scope. */
	async setActive(scope: ProfileScope, name: string | undefined): Promise<void> {
		const file = await this.readScope(scope);
		if (name) {
			file.active = name;
		} else {
			delete file.active;
		}
		await this.writeScope(scope, file);
	}

	/** Create or overwrite a named profile in a scope. */
	async saveProfile(scope: ProfileScope, name: string, profile: ModelProfile): Promise<void> {
		const file = await this.readScope(scope);
		file.profiles[name] = profile;
		await this.writeScope(scope, file);
	}

	/**
	 * Remove a named profile from a scope. Also clears the active pointer when it
	 * referenced the removed profile. Returns whether anything was removed.
	 */
	async deleteProfile(scope: ProfileScope, name: string): Promise<boolean> {
		const file = await this.readScope(scope);
		if (!(name in file.profiles)) return false;
		delete file.profiles[name];
		if (file.active === name) delete file.active;
		await this.writeScope(scope, file);
		return true;
	}
}
