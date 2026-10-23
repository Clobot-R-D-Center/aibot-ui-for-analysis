// The built dashboard (apps/web/dist), served on the gateway's own port so one
// process is the whole app (the Docker image): the page finds the gateway on
// the host:port it came from.
import { statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

/** What the dashboard build holds (vite output + public/). */
export const MIME: Record<string, string> = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".txt": "text/plain",
	".woff2": "font/woff2",
};

/**
 * The file in `dir` for a request path. A path without an extension is one of
 * the app's own routes (/, /ko/…), so the app shell; a missing file, or one
 * outside `dir`, is null (404).
 */
export function webFile(dir: string, path: string): string | null {
	const root = resolve(dir);
	const file = resolve(root, `.${path}`);
	if (file !== root && !file.startsWith(root + sep)) return null;
	// Any error (gone in a rebuild, a name too long, …) is "no such file": a
	// throw here would kill the process, and the request path is the client's.
	try {
		if (statSync(file).isFile()) return file;
	} catch {
		// no such file
	}
	return extname(path) ? null : join(root, "index.html");
}
