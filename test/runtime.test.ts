import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { ProfileModel } from "../src/apply";
import { applyProfile } from "../src/runtime";
import type { ModelProfile } from "../src/types";

function testModel(provider: string, id: string): ProfileModel {
	return {
		id,
		name: `${provider}/${id}`,
		api: "openai-completions",
		provider,
		baseUrl: "https://example.invalid",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 8_192,
	};
}

const opus = testModel("anthropic", "claude-opus-4-5");

interface Harness {
	pi: ExtensionAPI;
	ctx: ExtensionContext;
	thinkingCalls: string[];
	modelCalls: ProfileModel[];
}

/** Minimal fakes exercising the override + model + thinking path of applyProfile. */
function makeHarness(available: readonly ProfileModel[] = [opus]): Harness {
	const overrides: Record<string, string> = {};
	const thinkingCalls: string[] = [];
	const modelCalls: ProfileModel[] = [];

	const settings = {
		clearOverride: () => {},
		override: () => {},
		overrideModelRoles: (roles: Record<string, string>) => {
			for (const [role, value] of Object.entries(roles)) overrides[role] = value;
		},
		getModelRole: (role: string): string | undefined => overrides[role],
	};

	const pi = {
		pi: { settings },
		setModel: async (model: ProfileModel) => {
			modelCalls.push(model);
			return true;
		},
		setThinkingLevel: (level: string) => {
			thinkingCalls.push(level);
		},
	} as unknown as ExtensionAPI;

	const ctx = {
		hasUI: false,
		ui: { notify: () => {}, setStatus: () => {} },
		modelRegistry: {
			getAvailable: () => available,
			resolveCanonicalModel: () => undefined,
		},
	} as unknown as ExtensionContext;

	return { pi, ctx, thinkingCalls, modelCalls };
}

function profile(defaultPattern: string): ModelProfile {
	return { modelRoles: { default: defaultPattern } };
}

describe("applyProfile thinking application", () => {
	test("applies the auto selector to the live session", async () => {
		const h = makeHarness();
		await applyProfile(h.pi, h.ctx, "p", profile("anthropic/claude-opus-4-5:auto"));
		expect(h.thinkingCalls).toEqual(["auto"]);
		expect(h.modelCalls).toEqual([opus]);
	});

	test("applies a concrete effort suffix", async () => {
		const h = makeHarness();
		await applyProfile(h.pi, h.ctx, "p", profile("anthropic/claude-opus-4-5:high"));
		expect(h.thinkingCalls).toEqual(["high"]);
	});

	test("leaves thinking untouched when the default has no recognised suffix", async () => {
		const h = makeHarness();
		await applyProfile(h.pi, h.ctx, "p", profile("anthropic/claude-opus-4-5"));
		expect(h.thinkingCalls).toEqual([]);
		expect(h.modelCalls).toEqual([opus]);
	});
});
