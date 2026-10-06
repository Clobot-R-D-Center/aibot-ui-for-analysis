import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { parse } from "@foxglove/rosmsg";
import { MessageWriter } from "@foxglove/rosmsg2-serialization";
import { FoxgloveServer } from "@foxglove/ws-protocol";
import { WebSocketServer } from "ws";
import { foxgloveLinks } from "./index.ts";

// Schemas as foxglove_bridge sends them: the .msg text, dependencies appended
// after "====" separators.
const RESULT = "bool ok\nstring detail";
const ITEMS = `example_msgs/Item[] items
================================================================================
MSG: example_msgs/Item
int64 code
string text`;

/** A fake robot: a foxglove_bridge-like server sending one message per channel on subscribe. */
async function fakeBridge() {
	const server = new FoxgloveServer({ name: "fake-bridge" });
	const wss = new WebSocketServer({
		port: 0,
		handleProtocols: (p) => server.handleProtocols(p),
	});
	wss.on("connection", (conn, req) =>
		server.handleConnection(conn, `${req.socket.remotePort}`),
	);
	await once(wss, "listening");
	const payloads = new Map<number, Uint8Array>();
	const add = (topic: string, schema: string, msg: unknown) => {
		const id = server.addChannel({
			topic,
			encoding: "cdr",
			schemaName: "x",
			schema,
			schemaEncoding: "ros2msg",
		});
		payloads.set(
			id,
			new MessageWriter(parse(schema, { ros2: true })).writeMessage(msg),
		);
	};
	add("/demo/result", RESULT, { ok: false, detail: "blocked" });
	add("demo/items", ITEMS, { items: [{ code: 7n, text: "hot" }] }); // no leading "/"
	add("/demo/lidar", RESULT, { ok: true, detail: "not wanted" });
	server.on("subscribe", (id) => {
		const data = payloads.get(id);
		if (data) server.sendMessage(id, 0n, data);
	});
	return {
		port: (wss.address() as AddressInfo).port,
		close: () => wss.close(),
	};
}

test("links a robot's bridge and decodes only the wanted topics", async () => {
	const bridge = await fakeBridge();
	const got = new Map<string, unknown>();
	const links: boolean[] = [];
	let done = () => {};
	const both = new Promise<void>((r) => {
		done = r;
	});
	const fox = foxgloveLinks({
		port: bridge.port,
		topics: ["/demo/result", "/demo/items"],
		onLink: (_, up) => links.push(up),
		onMessage: (robot, topic, msg) => {
			assert.equal(robot, "robot-a");
			got.set(topic, msg);
			if (got.size === 2) done();
		},
	});
	fox.update("robot-a", "127.0.0.1", true);
	await both;

	assert.deepEqual(got.get("/demo/result"), { ok: false, detail: "blocked" });
	// normalized topic; int64 decodes as BigInt
	assert.deepEqual(got.get("/demo/items"), {
		items: [{ code: 7n, text: "hot" }],
	});
	assert.ok(!got.has("/demo/lidar"));

	// Offline robot: the link is dropped, not retried.
	fox.update("robot-a", "127.0.0.1", false);
	await new Promise((r) => setTimeout(r, 100));
	assert.deepEqual(links, [true, false]);
	fox.closeAll();
	bridge.close();
});
