import { RotateCcw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { m } from "#/paraglide/messages.js";
import type { AsyncState } from "./demo-data";

interface Props<T> {
	state: AsyncState<T>;
	/** panel-shaped placeholder shown while loading */
	skeleton: ReactNode;
	onRetry?: () => void;
	children: (data: T) => ReactNode;
}

/** Per-panel loading skeleton / error+retry / ready content for an AsyncState. */
export function AsyncContent<T>({
	state,
	skeleton,
	onRetry,
	children,
}: Props<T>) {
	if (state.status === "loading") return <>{skeleton}</>;
	if (state.status === "error")
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-center">
				<TriangleAlert className="size-5 text-error" aria-hidden />
				<p className="text-muted text-sm">{m.data_error()}</p>
				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						className="btn btn-ghost btn-xs gap-1.5"
					>
						<RotateCcw className="size-3.5" />
						{m.action_retry()}
					</button>
				)}
			</div>
		);
	return <>{children(state.data)}</>;
}
