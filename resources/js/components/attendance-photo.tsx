/** Clock-in / clock-out live-camera photo: a small thumbnail that opens the full photo in a new tab (private link). */
export function AttendancePhoto({ url, label }: { url: string | null | undefined; label: string }) {
    if (!url) return null;
    return (
        <a href={url} target="_blank" rel="noopener noreferrer" title={`Open the ${label.toLowerCase()} photo`} className="inline-block">
            <img src={url} alt={`${label} photo`} loading="lazy" className="h-9 w-9 rounded border object-cover hover:opacity-90" />
        </a>
    );
}

/** "Recorded by Ana Reyes" under a manual clock-in / clock-out (no photo). */
export function RecordedBy({ name }: { name: string | null | undefined }) {
    if (!name) return null;
    return <span className="text-xs font-normal text-amber-700 font-sans dark:text-amber-400">Recorded by {name}</span>;
}
