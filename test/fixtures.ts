import type { ProfileModel } from "../src/apply";

/** The exact fields the plugin's tests set on a model. Picking from
 * ProfileModel keeps these field types checked while staying immune to new
 * REQUIRED fields the host adds to Model that the plugin never reads. */
export type ModelFixture = Pick<
	ProfileModel,
	"id" | "name" | "api" | "provider" | "baseUrl" | "reasoning" | "input" | "cost" | "contextWindow" | "maxTokens"
>;

export function testModel(provider: string, id: string): ProfileModel {
	const model: ModelFixture = {
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
	return model as ProfileModel;
}
