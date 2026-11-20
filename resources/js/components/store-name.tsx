/**
 * K11 — a store's name for buyers, with the BRANCH first. A branch's store_name is "<main> — <branch>", so a
 * truncated name looked exactly like the main store ("Petron Gasul Cavite Distributio…"). Here the branch name
 * comes first and stays whole; when space is short the main store's name gives way (it only gets leftover space).
 */
export function storeMainName(name: string, branch?: string | null): string {
    if (!branch) return name;
    const suffix = ` — ${branch}`;
    return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

export default function StoreName({ name, branch, className = '' }: { name: string; branch?: string | null; className?: string }) {
    if (!branch) return <span className={`min-w-0 truncate ${className}`}>{name}</span>;
    return (
        <span className={`flex min-w-0 items-center gap-1 ${className}`} title={name}>
            <span className="shrink-0 rounded bg-blue-100 px-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Branch</span>
            <span className="max-w-[75%] shrink-0 truncate whitespace-nowrap font-medium">{branch}</span>
            <span className="min-w-0 flex-[1_1_0%] truncate">· {storeMainName(name, branch)}</span>
        </span>
    );
}
