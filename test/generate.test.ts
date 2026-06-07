import { describe, expect, test } from "bun:test";
import type { AssistantMessage } from "@oh-my-pi/pi-ai";
import type { ProfileModel } from "../src/apply";
import { buildRequest, extractToolArguments, type GenerateSpec, generateProfile, validateDraft } from "../src/generate";

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

const gpt = testModel("openai", "gpt");
const opus = testModel("anthropic", "opus");

function spec(): GenerateSpec {
	return {
		roleIds: ["default", "plan", "task"],
		roleDescriptions: { default: "Default", plan: "Architect", task: "Subtask" },
		available: [gpt, opus],
		resolveCanonical: () => undefined,
		thinkingLevels: ["default", "auto", "minimal", "low", "medium", "high", "xhigh"],
	};
}

/** Minimal AssistantMessage carrying a single forced tool-call (test seam). */
function assistantWithToolCall(name: string, args: Record<string, unknown>): AssistantMessage {
	return { content: [{ type: "toolCall", id: "c1", name, arguments: args }] } as unknown as AssistantMessage;
}

describe("validateDraft", () => {
	test("keeps valid roles and normalizes thinking suffixes", () => {
		const { profile, warnings } = validateDraft(
			{
				description: "OpenAI-first",
				roles: [
					{ role: "default", model: "openai/gpt" },
					{ role: "plan", model: "anthropic/opus", thinking: "high" },
				],
			},
			spec(),
		);
		expect(profile.modelRoles).toEqual({ default: "openai/gpt", plan: "anthropic/opus:high" });
		expect(profile.description).toBe("OpenAI-first");
		expect(warnings).toEqual([]);
	});

	test("drops unknown roles", () => {
		const { profile, warnings } = validateDraft({ roles: [{ role: "bogus", model: "openai/gpt" }] }, spec());
		expect(profile.modelRoles).toEqual({});
		expect(warnings.some(w => w.includes("bogus"))).toBe(true);
	});

	test("drops unavailable models", () => {
		const { profile, warnings } = validateDraft({ roles: [{ role: "default", model: "ghost/model" }] }, spec());
		expect(profile.modelRoles).toEqual({});
		expect(warnings.some(w => w.includes("not available"))).toBe(true);
	});

	test("ignores a duplicate role, keeping the first", () => {
		const { profile, warnings } = validateDraft(
			{
				roles: [
					{ role: "default", model: "openai/gpt" },
					{ role: "default", model: "anthropic/opus" },
				],
			},
			spec(),
		);
		expect(profile.modelRoles).toEqual({ default: "openai/gpt" });
		expect(warnings.some(w => w.includes("Duplicate"))).toBe(true);
	});

	test("ignores an unknown thinking selector but keeps the model", () => {
		const { profile, warnings } = validateDraft(
			{ roles: [{ role: "default", model: "openai/gpt", thinking: "ultra" }] },
			spec(),
		);
		expect(profile.modelRoles).toEqual({ default: "openai/gpt" });
		expect(warnings.some(w => w.includes("ultra"))).toBe(true);
	});

	test("rejects auto thinking for non-default roles only", () => {
		const onPlan = validateDraft({ roles: [{ role: "plan", model: "anthropic/opus", thinking: "auto" }] }, spec());
		expect(onPlan.profile.modelRoles).toEqual({ plan: "anthropic/opus" });
		expect(onPlan.warnings.some(w => w.includes("auto"))).toBe(true);

		const onDefault = validateDraft({ roles: [{ role: "default", model: "openai/gpt", thinking: "auto" }] }, spec());
		expect(onDefault.profile.modelRoles).toEqual({ default: "openai/gpt:auto" });
	});

	test("treats missing roles array as an empty draft with a warning", () => {
		const { profile, warnings } = validateDraft({}, spec());
		expect(profile.modelRoles).toEqual({});
		expect(warnings).toHaveLength(1);
	});
});

describe("buildRequest", () => {
	test("constrains the schema to the catalog and roles, and forces a tool", () => {
		const { context, toolName } = buildRequest("based on openai models", spec());
		expect(toolName).toBe("emit_profile");
		expect(context.tools?.[0]?.name).toBe("emit_profile");

		const params = context.tools?.[0]?.parameters as {
			properties: { roles: { items: { properties: { role: { enum: string[] }; model: { enum: string[] } } } } };
		};
		expect(params.properties.roles.items.properties.role.enum).toEqual(["default", "plan", "task"]);
		expect(params.properties.roles.items.properties.model.enum).toEqual(["anthropic/opus", "openai/gpt"]);

		const userContent = context.messages[0]?.content;
		expect(typeof userContent === "string" && userContent.includes("based on openai models")).toBe(true);
		expect((context.systemPrompt ?? []).length).toBeGreaterThan(0);
	});
});

describe("extractToolArguments", () => {
	test("returns the matching tool-call arguments", () => {
		const msg = assistantWithToolCall("emit_profile", { roles: [] });
		expect(extractToolArguments(msg, "emit_profile")).toEqual({ roles: [] });
	});

	test("returns undefined when no matching tool-call is present", () => {
		const msg = assistantWithToolCall("other_tool", { roles: [] });
		expect(extractToolArguments(msg, "emit_profile")).toBeUndefined();
	});
});

describe("generateProfile", () => {
	test("calls the provider with a forced tool and validates the result", async () => {
		let seenToolChoice: unknown;
		let seenTools: unknown;
		const { profile } = await generateProfile(gpt, "key", "openai please", spec(), {
			complete: async (_model, context, options) => {
				seenToolChoice = options?.toolChoice;
				seenTools = context.tools;
				return assistantWithToolCall("emit_profile", { roles: [{ role: "default", model: "openai/gpt" }] });
			},
		});
		expect(profile.modelRoles).toEqual({ default: "openai/gpt" });
		expect(seenToolChoice).toEqual({ type: "function", name: "emit_profile" });
		expect(Array.isArray(seenTools)).toBe(true);
	});

	test("throws when the provider returns an error message", async () => {
		await expect(
			generateProfile(gpt, "key", "x", spec(), {
				complete: async () => ({ content: [], errorMessage: "rate limited" }) as unknown as AssistantMessage,
			}),
		).rejects.toThrow("rate limited");
	});
});
