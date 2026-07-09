import { expect, test } from "vitest";
import { m } from "#/paraglide/messages.js";

test("example_message localizes by locale", () => {
	expect(m.example_message({ username: "World" }, { locale: "en" })).toBe(
		"Hello world World",
	);
	expect(m.example_message({ username: "World" }, { locale: "ko" })).toBe(
		"안녕하세요 World",
	);
});
