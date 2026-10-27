// Re-shoots docs/demo.gif: the simulator with two weeks of made-up history
// (history.mts), served as the Docker image serves it (gateway + WEB_DIR),
// filmed in headless Chrome over CDP. Needs google-chrome and ffmpeg. Stop
// `pnpm dev` first: the web build regenerates Paraglide's messages under it.
// usage: node scripts/demo/make-gif.mts
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const GATEWAY = 8790; // ports for this run only
const CDP = 9333;
// tmpfs if there is one: the history is ~2M single-row writes (see history.mts)
const work = mkdtempSync(
	join(existsSync("/dev/shm") ? "/dev/shm" : tmpdir(), "demo-"),
);
const db = join(work, "history.db");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function run(cmd: string, args: string[]) {
	if (spawnSync(cmd, args, { cwd: root, stdio: "inherit" }).status !== 0)
		throw new Error(`${cmd} ${args.join(" ")} failed`);
}
async function up(url: string) {
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// not yet
		}
		await sleep(200);
	}
	throw new Error(`${url} never answered`);
}

const children: ChildProcess[] = [];
try {
	run("node", ["scripts/demo/history.mts", db, "14"]);
	run("pnpm", ["--filter", "web", "build"]);
	children.push(
		spawn("node", ["src/main.ts"], {
			cwd: join(root, "apps/gateway"),
			stdio: "inherit",
			// Over any apps/gateway/.env (an empty MAP_DIR is unset: the sim's map).
			env: {
				...process.env,
				FLEET_ADAPTER: "sim",
				MAP_DIR: "",
				WS_PORT: String(GATEWAY),
				HISTORY_DB: db,
				WEB_DIR: join(root, "apps/web/dist"),
			},
		}),
		spawn(
			"google-chrome",
			[
				"--headless=new",
				`--remote-debugging-port=${CDP}`,
				`--user-data-dir=${join(work, "chrome")}`,
				"--no-first-run",
				"--enable-unsafe-swiftshader", // WebGL (the map) without a GPU
				"--hide-scrollbars",
				"about:blank",
			],
			{ stdio: "ignore" },
		),
	);
	await up(`http://localhost:${GATEWAY}/`);
	await up(`http://127.0.0.1:${CDP}/json/version`);
	encode(await film());
	console.log("[demo] docs/demo.gif");
} finally {
	const running = children.filter((c) => c.exitCode === null);
	for (const c of running) c.kill();
	await Promise.all(running.map((c) => once(c, "exit")));
	rmSync(work, { recursive: true, force: true, maxRetries: 5 });
}

type Frame = { t: number; png: Buffer };
// biome-ignore lint/suspicious/noExplicitAny: CDP messages, read field by field
type Cdp = any;

/**
 * The storyboard: the live fleet over the last 7 days, another robot,
 * yesterday's shift selected, a moment of it on the map, back to live.
 */
async function film(): Promise<Frame[]> {
	const tab = await (
		await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, {
			method: "PUT",
		})
	).json();
	const ws = new WebSocket(tab.webSocketDebuggerUrl);
	await once(ws, "open");
	let id = 0;
	const pending = new Map<number, (m: Cdp) => void>();
	const frames: Frame[] = [];
	const send = (method: string, params = {}): Promise<Cdp> =>
		new Promise((ok, fail) => {
			const i = ++id;
			pending.set(i, (m) =>
				m.error
					? fail(new Error(`${method}: ${m.error.message}`))
					: ok(m.result),
			);
			ws.send(JSON.stringify({ id: i, method, params }));
		});
	ws.onmessage = (e) => {
		const m = JSON.parse(e.data);
		pending.get(m.id)?.(m);
		pending.delete(m.id);
		if (m.method === "Page.screencastFrame") {
			const { data, metadata, sessionId } = m.params;
			frames.push({ t: metadata.timestamp, png: Buffer.from(data, "base64") });
			send("Page.screencastFrameAck", { sessionId });
		}
	};
	const page = async (js: string) =>
		(await send("Runtime.evaluate", { expression: js, returnByValue: true }))
			.result.value;
	// Where time t is on the timeline (Timeline.tsx: LABEL_W, the robot names).
	const timelineAt = (t: number): Promise<[number, number]> =>
		page(`(() => {
			const el = document.querySelector("[role=slider]");
			const r = el.getBoundingClientRect();
			const from = Number(el.ariaValueMin), to = Number(el.ariaValueMax);
			return [r.left + 76 + ((${t} - from) / (to - from)) * (r.width - 76), r.top + r.height / 2];
		})()`);
	const mouse = (type: string, [x, y]: [number, number], more = {}) =>
		send("Input.dispatchMouseEvent", {
			type,
			x,
			y,
			button: "left",
			clickCount: 1,
			...more,
		});
	const click = async (at: [number, number]) => {
		await mouse("mouseMoved", at, { button: "none" });
		await mouse("mousePressed", at);
		await mouse("mouseReleased", at);
	};
	// Shift+drag on the timeline selects a stretch (CDP modifiers: 8 = Shift).
	const select = async (a: [number, number], b: [number, number]) => {
		const shift = { modifiers: 8 };
		await mouse("mousePressed", a, shift);
		for (let i = 1; i <= 15; i++) {
			const x = a[0] + ((b[0] - a[0]) * i) / 15;
			await mouse("mouseMoved", [x, a[1]], { ...shift, buttons: 1 });
			await sleep(30);
		}
		await mouse("mouseReleased", b, shift);
	};
	const robot = (name: string) =>
		page(`document.querySelector('button[title="${name}"]').click()`);
	/** `hour` o'clock `daysAgo` days ago; the sim only runs 08–20 h. */
	const hourAgo = (daysAgo: number, hour: number) => {
		const d = new Date();
		d.setDate(d.getDate() - daysAgo);
		return d.setHours(hour, 0, 0, 0);
	};

	await send("Emulation.setDeviceMetricsOverride", {
		width: 1280,
		height: 1000,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await send("Page.navigate", { url: `http://localhost:${GATEWAY}/ko/` });
	await sleep(5000);
	// The last 7 days (zooming at now keeps it live), the coverage heatmap on.
	const [x, y] = await timelineAt(Date.now());
	await send("Input.dispatchMouseEvent", {
		type: "mouseWheel",
		x: x - 2,
		y,
		deltaX: 0,
		deltaY: Math.log(7) / 0.0015, // Timeline.tsx: zoom factor e^(deltaY·0.0015)
	});
	await page(
		`[...document.querySelectorAll("button[aria-pressed=false]")].find((b) => b.textContent.includes("히트맵"))?.click()`,
	);
	await sleep(5000); // 7 days of history, twice (the window and the one before)
	// sim-2 seen once already: switching shows the days the gateway keeps, not
	// the first look after a restart.
	await robot("sim-2");
	await sleep(5000);
	await robot("sim-1");
	await sleep(3000);

	await send("Page.startScreencast", { format: "png" });
	await sleep(3500);
	await robot("sim-2"); // its KPIs and coverage
	await sleep(3500);
	// Yesterday's shift: the panels follow the selection.
	await select(
		await timelineAt(hourAgo(1, 8)),
		await timelineAt(hourAgo(1, 20)),
	);
	await sleep(3500);
	await click(await timelineAt(hourAgo(1, 14))); // the map at that moment
	await sleep(3500);
	// Esc on the focused timeline: back to live.
	for (const type of ["keyDown", "keyUp"])
		await send("Input.dispatchKeyEvent", {
			type,
			key: "Escape",
			code: "Escape",
			windowsVirtualKeyCode: 27,
		});
	await sleep(3000);
	await send("Page.stopScreencast");
	ws.close();
	return frames;
}

/** Frames to docs/demo.gif at their real pace (a frame only comes on a change). */
function encode(frames: Frame[]) {
	const dir = join(work, "frames");
	mkdirSync(dir);
	let list = "";
	frames.forEach((f, i) => {
		writeFileSync(join(dir, `${i}.png`), f.png);
		const next = frames[i + 1]?.t ?? f.t + 0.1;
		list += `file '${i}.png'\nduration ${(next - f.t).toFixed(3)}\n`;
	});
	// concat ignores the last duration unless the file is listed once more
	list += `file '${frames.length - 1}.png'\n`;
	writeFileSync(join(dir, "list.txt"), list);
	run("ffmpeg", [
		...[
			"-loglevel",
			"error",
			"-y",
			"-f",
			"concat",
			"-i",
			join(dir, "list.txt"),
		],
		...[
			"-vf",
			"fps=10,split[a][b];[a]palettegen=stats_mode=diff:max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
		],
		...["-loop", "0", join(root, "docs/demo.gif")],
	]);
}
