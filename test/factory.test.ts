import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import modelProfilesExtension from "../src/index";

describe("model profiles extension factory", () => {
	test("registers the profile command and session_start hook", () => {
		const registeredEvents: string[] = [];
		let label: string | undefined;
		let commandName: string | undefined;
		let commandDescription: string | undefined;
		let completions: ((argumentPrefix: string) => unknown) | undefined;
		let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;

		const fakePi = {
			setLabel(next: string) {
				label = next;
			},
			on(event: string) {
				registeredEvents.push(event);
			},
			registerCommand(
				name: string,
				options: {
					description?: string;
					getArgumentCompletions?: (argumentPrefix: string) => unknown;
					handler: (args: string, ctx: unknown) => Promise<void>;
				},
			) {
				commandName = name;
				commandDescription = options.description;
				completions = options.getArgumentCompletions;
				handler = options.handler;
			},
		} as unknown as ExtensionAPI;

		modelProfilesExtension(fakePi);

		expect(label).toBe("Model Profiles");
		expect(registeredEvents).toContain("session_start");
		expect(commandName).toBe("model-profile");
		expect(commandDescription).toBe("Switch named model-role profiles");
		expect(completions?.("")).toEqual([
			{ label: "use", value: "use" },
			{ label: "show", value: "show" },
			{ label: "create", value: "create" },
			{ label: "save", value: "save" },
			{ label: "edit", value: "edit" },
			{ label: "delete", value: "delete" },
			{ label: "list", value: "list" },
			{ label: "help", value: "help" },
		]);
		expect(handler).toBeDefined();
	});
});
