/**
 * AI-assisted profile generation.
 *
 * Turns a natural-language prompt ("a profile based on openai models") into a
 * {@link ModelProfile} by asking an LLM to assign models to roles. The call is
 * a one-shot, chat-safe completion via `@oh-my-pi/pi-ai`'s `completeSimple`
 * (it hits the provider directly, never `sendMessage`, so the conversation is
 * not polluted). Structured output is obtained with a forced tool-call.
 *
 * The model only ever *suggests*; every suggestion is hard-validated against the
 * real available catalog and the host's role ids here, so a hallucinated model
 * id or unknown role is dropped rather than written to disk.
 */
import type { AssistantMessage, Context, Model, SimpleStreamOptions } from "@oh-my-pi/pi-ai";
import { completeSimple } from "@oh-my-pi/pi-ai";
import type { ProfileModel } from "./apply";
import { resolveModelString } from "./apply";
import type { ModelProfile } from "./types";

/** The tool the model is forced to call; its arguments are the draft profile. */
const TOOL_NAME = "emit_profile";

/** What the model is allowed to choose from, plus how to validate its choices. */
export interface GenerateSpec {
	/** Allowed role ids (e.g. `default`, `plan`, `task`). */
	roleIds: readonly string[];
	/** Role id → human label/description, shown to the model. */
	roleDescriptions: Record<string, string>;
	/** Currently available models (the only legal picks). */
	available: readonly ProfileModel[];
	/** Canonical-id resolver, mirroring the picker's availability check. */
	resolveCanonical: (id: string) => ProfileModel | undefined;
	/** Allowed thinking selectors; `default` means "no suffix". */
	thinkingLevels: readonly string[];
}

/** A one-shot completion call, narrowed for injection in tests. */
export type CompleteFn = (model: Model, context: Context, options?: SimpleStreamOptions) => Promise<AssistantMessage>;

function modelLabel(model: ProfileModel): string {
	return `${model.provider}/${model.id}`;
}

/** A compact, provider-grouped catalog the model reads to pick real ids. */
function buildCatalog(available: readonly ProfileModel[]): string {
	const byProvider = new Map<string, string[]>();
	for (const model of available) {
		const ids = byProvider.get(model.provider) ?? [];
		ids.push(modelLabel(model));
		byProvider.set(model.provider, ids);
	}
	const lines: string[] = [];
	for (const provider of [...byProvider.keys()].sort()) {
		lines.push(`${provider}:`);
		for (const id of (byProvider.get(provider) ?? []).sort()) lines.push(`  ${id}`);
	}
	return lines.join("\n");
}

/**
 * Build the pi-ai request: a system prompt, the user's intent plus the legal
 * catalog/roles, and a forced tool whose JSON-schema constrains the model to
 * real role ids, real `provider/id` values, and known thinking selectors.
 */
export function buildRequest(prompt: string, spec: GenerateSpec): { context: Context; toolName: string } {
	const modelIds = spec.available.map(modelLabel).sort();
	const roleHelp = spec.roleIds.map(role => `  ${role} — ${spec.roleDescriptions[role] ?? role}`).join("\n");

	const parameters: Record<string, unknown> = {
		type: "object",
		additionalProperties: false,
		required: ["roles"],
		properties: {
			description: { type: "string", description: "One short sentence describing the profile." },
			roles: {
				type: "array",
				description: "Role-to-model assignments. Always assign the `default` role.",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["role", "model"],
					properties: {
						role: { type: "string", enum: [...spec.roleIds] },
						model: { type: "string", enum: modelIds, description: "Exactly one `provider/id` from the catalog." },
						thinking: { type: "string", enum: [...spec.thinkingLevels] },
					},
				},
			},
		},
	};

	const context: Context = {
		systemPrompt: [
			"You configure model profiles for a coding agent.",
			"Assign a model to each relevant role by calling the emit_profile tool.",
			"Choose models ONLY from the provided catalog (exact `provider/id` strings).",
			"Honor the user's intent (e.g. a provider preference). Always assign the `default` role.",
			"Use a thinking selector only when it improves the role; omit it otherwise.",
		],
		messages: [
			{
				role: "user",
				content: `${prompt}\n\nAvailable models:\n${buildCatalog(spec.available)}\n\nRoles:\n${roleHelp}\n\nThinking selectors: ${spec.thinkingLevels.join(", ")} (default = none).`,
				timestamp: Date.now(),
			},
		],
		tools: [
			{
				name: TOOL_NAME,
				description: "Emit the model profile: a description and role→model assignments.",
				parameters,
				strict: true,
			},
		],
	};

	return { context, toolName: TOOL_NAME };
}

/** Pull the forced tool-call arguments off an assistant message, if present. */
export function extractToolArguments(message: AssistantMessage, toolName: string): Record<string, unknown> | undefined {
	for (const part of message.content) {
		if (part.type === "toolCall" && part.name === toolName) return part.arguments;
	}
	return undefined;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Validate raw tool-call arguments into a {@link ModelProfile}, dropping any
 * unknown role, unavailable model, or invalid thinking selector and recording a
 * warning for each. Models are normalized to their resolved canonical
 * `provider/id` so stored values match the catalog exactly.
 */
export function validateDraft(
	raw: Record<string, unknown> | undefined,
	spec: GenerateSpec,
): { profile: ModelProfile; warnings: string[] } {
	const warnings: string[] = [];
	const modelRoles: Record<string, string> = {};
	const roleSet = new Set(spec.roleIds);
	const thinkingSet = new Set(spec.thinkingLevels);

	const rawRoles = raw?.roles;
	if (!Array.isArray(rawRoles)) {
		warnings.push("Model returned no role assignments.");
		return { profile: { modelRoles }, warnings };
	}

	for (const entry of rawRoles) {
		if (!entry || typeof entry !== "object") continue;
		const record = entry as Record<string, unknown>;
		const role = asString(record.role);
		const modelPattern = asString(record.model);
		if (!role || !roleSet.has(role)) {
			warnings.push(`Skipped unknown role "${role ?? "?"}".`);
			continue;
		}
		if (role in modelRoles) {
			warnings.push(`Duplicate role "${role}" ignored.`);
			continue;
		}
		const resolved = modelPattern
			? resolveModelString(modelPattern, spec.available, spec.resolveCanonical)
			: undefined;
		if (!resolved) {
			warnings.push(`Skipped role "${role}": model "${modelPattern ?? "?"}" is not available.`);
			continue;
		}

		let value = modelLabel(resolved);
		const thinking = asString(record.thinking);
		if (thinking && thinking !== "default") {
			if (!thinkingSet.has(thinking)) {
				warnings.push(`Ignored unknown thinking "${thinking}" for role "${role}".`);
			} else if (thinking === "auto" && role !== "default") {
				warnings.push(`Ignored "auto" thinking for role "${role}" (only valid for default).`);
			} else {
				value += `:${thinking}`;
			}
		}
		modelRoles[role] = value;
	}

	const profile: ModelProfile = { modelRoles };
	const description = asString(raw?.description);
	if (description) profile.description = description;
	return { profile, warnings };
}

/**
 * Run the one-shot generation: build the request, call the provider directly,
 * and validate the result. `complete` is injectable so the path is testable
 * without a network call.
 */
export async function generateProfile(
	model: ProfileModel,
	apiKey: string,
	prompt: string,
	spec: GenerateSpec,
	options?: { signal?: AbortSignal; complete?: CompleteFn },
): Promise<{ profile: ModelProfile; warnings: string[] }> {
	const complete = options?.complete ?? completeSimple;
	const { context, toolName } = buildRequest(prompt, spec);
	const message = await complete(model, context, {
		apiKey,
		toolChoice: { type: "function", name: toolName },
		maxTokens: 2048,
		signal: options?.signal,
	});
	if (message.errorMessage) {
		throw new Error(message.errorMessage);
	}
	return validateDraft(extractToolArguments(message, toolName), spec);
}
