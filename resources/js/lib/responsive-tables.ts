/**
 * J10 — phone card lists for wide tables. Any <table class="rt-cards"> becomes a list of cards below 640px (CSS in
 * resources/css/app.css). This labels each cell with its column header (data-label) so a card reads
 * "Status   Delivered"; a cell under an empty header — or one holding only buttons / links — is the actions cell
 * (data-rt-actions: full-width, wrapping, 40px touch targets). Runs once for the whole app and follows Inertia page
 * changes and re-renders with a MutationObserver.
 */
function headersOf(table: HTMLTableElement): string[] {
    const row = table.tHead?.rows[table.tHead.rows.length - 1];
    if (!row) return [];
    const out: string[] = [];
    for (const th of Array.from(row.cells)) {
        const label = (th.getAttribute('data-label') ?? th.textContent ?? '').replace(/\s+/g, ' ').trim();
        for (let i = 0; i < (th.colSpan || 1); i++) out.push(label);
    }

    return out;
}

function label(table: HTMLTableElement): void {
    const headers = headersOf(table);
    for (const body of Array.from(table.tBodies)) {
        for (const tr of Array.from(body.rows)) {
            const cells = Array.from(tr.cells);
            if (cells.length === 1 && cells[0].colSpan > 1) {
                tr.setAttribute('data-rt-empty', '');   // "No orders found." row
                continue;
            }
            let col = 0;
            for (const td of cells) {
                const h = headers[col] ?? '';
                if (td.getAttribute('data-label') !== h) td.setAttribute('data-label', h);
                // The actions cell: an empty or "Action(s)" header
                if (/^(actions?|)$/i.test(h)) td.setAttribute('data-rt-actions', '');
                else td.removeAttribute('data-rt-actions');
                col += td.colSpan || 1;
            }
        }
    }
}

let scheduled = false;
function run(): void {
    scheduled = false;
    document.querySelectorAll<HTMLTableElement>('table.rt-cards').forEach(label);
}

export function initResponsiveTables(): void {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
    const schedule = () => {
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(run);
        }
    };
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    schedule();
}
