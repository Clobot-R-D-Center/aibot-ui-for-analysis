import type { ReactNode } from "react";

interface Props {
	title?: string;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	bodyClassName?: string;
}

/** daisyUI card with an optional divided header. Never nest cards. */
export function Panel({
	title,
	action,
	children,
	className,
	bodyClassName,
}: Props) {
	return (
		<section
			className={`card card-border border-base-300 bg-base-100 shadow-sm ${className ?? ""}`}
		>
			{(title || action) && (
				<header className="flex items-center justify-between gap-3 border-base-300 border-b px-4 py-3">
					{title && (
						<h2 className="card-title font-medium text-base-content text-sm">
							{title}
						</h2>
					)}
					{action}
				</header>
			)}
			<div className={bodyClassName ?? "p-4"}>{children}</div>
		</section>
	);
}
