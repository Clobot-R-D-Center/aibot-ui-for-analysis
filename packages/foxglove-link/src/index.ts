// Adapter utility: one Foxglove WebSocket client per robot (e.g. to a ROS 2
// robot running foxglove_bridge), subscribed to just the given topics and
// decoding their CDR messages with the ros2msg schemas the bridge advertises.
import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg2-serialization";
import { FoxgloveClient } from "@foxglove/ws-protocol";
import WebSocket from "ws";

// A bridge may advertise "foo/bar" or "/foo/bar"; topics are matched as "/foo/bar".
const norm = (topic: string) => (topic.startsWith("/") ? topic : `/${topic}`);
const RETRY_MS = 5000;

interface Link {
	host: string;
	ws: WebSocket;
	retry?: ReturnType<typeof setTimeout>;
	up: boolean;
}

export function foxgloveLinks(opts: {
	port: number;
	/** Only these are subscribed (leading "/"); nothing else is pulled off the robot. */
	topics: string[];
	onMessage: (robot: string, topic: string, msg: unknown) => void;
	onLink: (robot: string, up: boolean) => void;
}) {
	const wanted = new Set(opts.topics.map(norm));
	const links = new Map<string, Link>();

	function open(robot: string, host: string) {
		const ws = new WebSocket(`ws://${host}:${opts.port}`, [
			FoxgloveClient.SUPPORTED_SUBPROTOCOL,
		]);
		const link: Link = { host, ws, up: false };
		links.set(robot, link);
		// ws throws on an unhandled 'error'; the close handler below retries.
		ws.on("error", () => {});
		const client = new FoxgloveClient({ ws });
		const readers = new Map<number, { topic: string; reader: MessageReader }>();

		client.on("open", () => {
			link.up = true;
			opts.onLink(robot, true);
		});
		client.on("advertise", (channels) => {
			for (const ch of channels) {
				const topic = norm(ch.topic);
				if (!wanted.has(topic) || ch.encoding !== "cdr") continue;
				if (ch.schemaEncoding && ch.schemaEncoding !== "ros2msg") {
					console.warn(
						`[gateway] ${robot} ${topic}: ${ch.schemaEncoding} schema unsupported`,
					);
					continue;
				}
				try {
					const reader = new MessageReader(parse(ch.schema, { ros2: true }));
					readers.set(client.subscribe(ch.id), { topic, reader });
				} catch (e) {
					console.warn(`[gateway] ${robot} ${topic}: ${(e as Error).message}`);
				}
			}
		});
		client.on("message", ({ subscriptionId, data }) => {
			const r = readers.get(subscriptionId);
			if (!r) return;
			try {
				opts.onMessage(robot, r.topic, r.reader.readMessage(data));
			} catch (e) {
				console.warn(`[gateway] ${robot} ${r.topic}: ${(e as Error).message}`);
			}
		});
		client.on("close", () => {
			if (link.up) opts.onLink(robot, false);
			link.up = false;
			// Still the wanted link (robot online, same IP)? Keep trying.
			if (links.get(robot) === link)
				link.retry = setTimeout(() => {
					if (links.get(robot) === link) open(robot, host);
				}, RETRY_MS);
		});
	}

	function drop(robot: string) {
		const link = links.get(robot);
		if (!link) return;
		links.delete(robot);
		clearTimeout(link.retry);
		link.ws.close();
	}

	/** Call whenever a robot's reachability is known: links online robots, follows host changes, drops offline ones. */
	function update(robot: string, host: string, online: boolean) {
		const cur = links.get(robot);
		if (!online || !host) return drop(robot);
		if (cur?.host === host) return;
		drop(robot);
		open(robot, host);
	}

	return {
		update,
		closeAll: () => {
			for (const robot of [...links.keys()]) drop(robot);
		},
	};
}
