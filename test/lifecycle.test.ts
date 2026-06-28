/**
 * Full-lifecycle integration test: command dispatch → real on-disk store →
 * runtime override application.
 *
 * Drives the real `handleProfileCommand` dispatcher against a real
 * `ProfileStore` writing to a temp dir, using only headless verb forms (no
 * scripted `ctx.ui.select` pickers — that path is covered by `ui.test.ts`).
 *
 * Deliberately NOT covered here: a real-omp-process E2E of `/model-profile`.
 * Print mode (`packages/coding-agent/src/modes/print-mode.ts`) initializes
 * extensions but dispatches prompts to the model, not slash commands, and
 * interactive mode needs a TTY — so the command path cannot be driven
 * headlessly through the CLI. This test is the closest deterministic,
 * auth-free coverage of the wired flow.
 */
import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { ProfileStore, STORE_FILENAME } from "../src/store";
import { handleProfileCommand } from "../src/ui";
import { testModel } from "./fixtures";

const available = [testModel("anthropic", "claude-opus-4-5")];

/** Record-backed settings fake covering the role-override + read-back surface
 * `verbSave`/`applyProfile`/`clearProfile` exercise. */
function makeSettings(initial: Record<string, string> = {}) {
	const base = { ...initial };
	const overrides: Record<string, string> = {};
	return {
		state: () => ({ base, overrides }),
		getModelRoles: () => ({ ...base, ...overrides }),
		getModelRole: (role: string) => ({ ...base, ...overrides })[role],
		get: (key: string) => (key === "cycleOrder" ? [] : undefined),
		overrideModelRoles: (roles: Record<string, string>) => {
			for (const [role, value] of Object.entries(roles)) if (value) overrides[role] = value;
		},
		override: () => {},
		clearOverride: (key: string) => {
			if (key === "modelRoles") for (const role of Object.keys(overrides)) delete overrides[role];
		},
	};
}

let root: string | undefined;

afterEach(async () => {
	if (root) await fs.rm(root, { recursive: true, force: true });
	root = undefined;
});

describe("model-profile command lifecycle", () => {
	test("save --project → use → use none → delete --project, with real on-disk JSON", async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), "mp-life-"));
		const userDir = path.join(root, "user");
		const projectCwd = path.join(root, "project");
		const projectOmpDir = path.join(projectCwd, ".omp");
		await fs.mkdir(userDir, { recursive: true });
		await fs.mkdir(projectOmpDir, { recursive: true });

		const store = new ProfileStore(path.join(userDir, STORE_FILENAME), path.join(projectOmpDir, STORE_FILENAME));
		const projectFile = path.join(projectOmpDir, STORE_FILENAME);

		const settings = makeSettings({ default: "anthropic/claude-opus-4-5:high", task: "anthropic/claude-opus-4-5" });
		const pi = {
			pi: { settings, getAgentDir: () => userDir },
			setModel: async () => true,
			setThinkingLevel: () => {},
		} as unknown as ExtensionAPI;
		const ctx = {
			cwd: projectCwd,
			hasUI: false,
			ui: { notify: () => {} },
			modelRegistry: {
				getAvailable: () => available,
				resolveCanonicalModel: () => available[0],
			},
		} as unknown as ExtensionCommandContext;

		// 1. save — snapshots the seeded role map into a new project-scoped profile.
		await handleProfileCommand(pi, ctx, "save deep --project", store);
		const afterSave = JSON.parse(await fs.readFile(projectFile, "utf8"));
		expect(afterSave.profiles.deep.modelRoles.default).toBe("anthropic/claude-opus-4-5:high");

		// 2. use — activates the saved profile: overrides applied, active pointer written.
		await handleProfileCommand(pi, ctx, "use deep", store);
		expect(settings.getModelRole("default")).toBe("anthropic/claude-opus-4-5:high");
		const afterUse = JSON.parse(await fs.readFile(projectFile, "utf8"));
		expect(afterUse.active).toBe("deep");

		// 3. use none — clears overrides and the active pointer.
		await handleProfileCommand(pi, ctx, "use none", store);
		expect(settings.state().overrides).toEqual({});
		const afterClear = JSON.parse(await fs.readFile(projectFile, "utf8"));
		expect(afterClear.active).toBeUndefined();

		// 4. delete --project — removes the profile from disk.
		await handleProfileCommand(pi, ctx, "delete deep --project", store);
		const afterDelete = JSON.parse(await fs.readFile(projectFile, "utf8"));
		expect(afterDelete.profiles.deep).toBeUndefined();
	});
});
