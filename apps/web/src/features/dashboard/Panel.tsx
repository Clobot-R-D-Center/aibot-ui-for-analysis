import type { ReactNode } from "react";

interface Props {
	title?: string;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	bodyClassName?: string;
}

/** The one card level in the shell. Swappable content slot; never nest Panels. */
export function Panel({
	title,
	action,
	children,
	className,
	bodyClassName,
}: Props) {
	return (
		<section
			className={`flex flex-col rounded-xl border border-border bg-surface shadow-sm ${className ?? ""}`}
		>
			{(title || action) && (
				<header className="flex items-center justify-between gap-3 border-border border-b px-4 py-3">
					{title && <h2 className="font-medium text-ink text-sm">{title}</h2>}
					{action}
				</header>
			)}
			<div className={`min-h-0 flex-1 ${bodyClassName ?? "p-4"}`}>
				{children}
			</div>
		</section>
	);
}
