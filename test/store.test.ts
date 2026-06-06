import { describe, expect, test } from "bun:test";
import { mergeProfiles, parseProfileFile } from "../src/store";

describe("profile store parsing", () => {
	test("coerces malformed profile files instead of throwing", () => {
		const parsed = parseProfileFile({
			active: 42,
			profiles: {
				valid: {
					description: "  useful  ",
					modelRoles: {
						default: " anthropic/sonnet:high ",
						empty: "   ",
					},
					cycleOrder: [" smol ", 1, "default"],
					taskAgentModelOverrides: {
						reviewer: " pi/slow ",
						empty: "",
					},
				},
				dropped: null,
			},
		});

		expect(parsed).toEqual({
			profiles: {
				valid: {
					description: "useful",
					modelRoles: { default: "anthropic/sonnet:high" },
					cycleOrder: ["smol", "default"],
					taskAgentModelOverrides: { reviewer: "pi/slow" },
				},
			},
		});
	});
});

describe("profile store merging", () => {
	test("project profiles override user profiles and active pointer", () => {
		const effective = mergeProfiles(
			{
				active: "shared",
				profiles: {
					shared: { modelRoles: { default: "user/default" } },
					userOnly: { modelRoles: { default: "user/only" } },
				},
			},
			{
				active: "shared",
				profiles: {
					shared: { modelRoles: { default: "project/default" } },
					projectOnly: { modelRoles: { default: "project/only" } },
				},
			},
		);

		expect(effective.active).toBe("shared");
		expect(effective.profiles.shared.modelRoles.default).toBe("project/default");
		expect(effective.sources).toEqual({ shared: "project", userOnly: "user", projectOnly: "project" });
	});

	test("drops active pointer when it does not resolve to a surviving profile", () => {
		const effective = mergeProfiles(
			{ active: "missing", profiles: { userOnly: { modelRoles: {} } } },
			{ profiles: {} },
		);

		expect(effective.active).toBeUndefined();
	});
});
