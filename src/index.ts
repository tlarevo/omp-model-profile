/** Standalone omp extension entrypoint for named model profiles. */
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { applyProfile } from "./runtime";
import { ProfileStore, STORE_FILENAME } from "./store";
import type { EffectiveProfiles } from "./types";
import { handleProfileCommand } from "./ui";

const VERBS = ["use", "show", "create", "save", "edit", "delete", "list", "help"] as const;

function createStore(pi: ExtensionAPI, ctx: Pick<ExtensionContext, "cwd">): ProfileStore {
	return new ProfileStore(path.join(pi.pi.getAgentDir(), STORE_FILENAME), path.join(ctx.cwd, ".omp", STORE_FILENAME));
}

function profileCompletions(argumentPrefix: string, effective: EffectiveProfiles | undefined) {
	const trimmed = argumentPrefix.trimStart();
	const tokens = trimmed.split(/\s+/).filter(Boolean);
	if (tokens.length <= 1 && !trimmed.endsWith(" ")) {
		const query = (tokens[0] ?? "").toLowerCase();
		return VERBS.filter(verb => verb.startsWith(query)).map(verb => ({ label: verb, value: verb }));
	}

	const verb = tokens[0] ?? "";
	if (verb !== "use" && verb !== "show" && verb !== "edit" && verb !== "delete") return null;
	const query = (tokens[1] ?? "").toLowerCase();
	const names = Object.keys(effective?.profiles ?? {}).sort();
	const items = names
		.filter(name => name.toLowerCase().startsWith(query))
		.map(name => ({
			label: name,
			value: `${verb} ${name}`,
			description: effective?.active === name ? "active" : effective?.sources[name],
		}));
	if (verb === "use" && "none".startsWith(query))
		items.unshift({ label: "none", value: "use none", description: "clear" });
	return items.length ? items : null;
}

export default function modelProfilesExtension(pi: ExtensionAPI): void {
	pi.setLabel("Model Profiles");

	let cachedEffective: EffectiveProfiles | undefined;

	pi.on("session_start", async (_event, ctx) => {
		const store = createStore(pi, ctx);
		cachedEffective = await store.loadEffective();
		const active = cachedEffective.active;
		if (!active) return;
		const profile = cachedEffective.profiles[active];
		if (!profile) return;
		await applyProfile(pi, ctx, active, profile);
	});

	pi.registerCommand("model-profile", {
		description: "Switch named model-role profiles",
		getArgumentCompletions: argumentPrefix => profileCompletions(argumentPrefix, cachedEffective),
		handler: async (args, ctx) => {
			const store = createStore(pi, ctx);
			cachedEffective = await handleProfileCommand(pi, ctx, args, store);
		},
	});
}
