/**
 * J10 / K10 — phone card lists for wide tables. Any <table class="rt-cards"> becomes a list of cards below 640px (CSS in
 * resources/css/app.css). This labels each cell with its column header (data-label) so a card reads
 * "Status   Delivered", and marks:
 *   - the TITLE cell (data-rt-title): the column whose <th> has data-rt-title, else the first column that isn't an
 *     image — shown as a full-width heading at the top of the card (product name + brand, order number…);
 *   - the ACTIONS cell (data-rt-actions): an empty or "Action(s)" header — full-width, wrapping, 40px touch targets;
 *   - LONG cells (data-rt-stack): more than ~48 characters (a reorder explanation, an address) — the label goes above
 *     the value instead of squeezing both onto one line.
 * Runs once for the whole app and follows Inertia page changes and re-renders with a MutationObserver.
 */
type Header = { label: string; title: boolean; image: boolean };

function headersOf(table: HTMLTableElement): Header[] {
    const row = table.tHead?.rows[table.tHead.rows.length - 1];
    if (!row) return [];
    const out: Header[] = [];
    for (const th of Array.from(row.cells)) {
        const label = (th.getAttribute('data-label') ?? th.textContent ?? '').replace(/\s+/g, ' ').trim();
        const h = { label, title: th.hasAttribute('data-rt-title'), image: /^(image|photo|logo)$/i.test(label) };
        for (let i = 0; i < (th.colSpan || 1); i++) out.push(h);
    }

    return out;
}

function setFlag(el: Element, name: string, on: boolean): void {
    if (on && !el.hasAttribute(name)) el.setAttribute(name, '');
    if (!on && el.hasAttribute(name)) el.removeAttribute(name);
}

function label(table: HTMLTableElement): void {
    const headers = headersOf(table);
    // The title column: explicitly marked, else the first non-image, non-actions column
    let titleCol = headers.findIndex((h) => h.title);
    if (titleCol < 0) titleCol = headers.findIndex((h) => !h.image && !/^(actions?|)$/i.test(h.label));
    for (const body of Array.from(table.tBodies)) {
        for (const tr of Array.from(body.rows)) {
            const cells = Array.from(tr.cells);
            if (cells.length === 1 && cells[0].colSpan > 1) {
                setFlag(tr, 'data-rt-empty', true);   // "No orders found." row
                continue;
            }
            let col = 0;
            for (const td of cells) {
                const h = headers[col] ?? { label: '', title: false, image: false };
                if (td.getAttribute('data-label') !== h.label) td.setAttribute('data-label', h.label);
                const isTitle = col === titleCol;
                const isActions = !isTitle && /^(actions?|)$/i.test(h.label);
                setFlag(td, 'data-rt-title', isTitle);
                setFlag(td, 'data-rt-actions', isActions);
                setFlag(td, 'data-rt-stack', !isTitle && !isActions && (td.textContent ?? '').replace(/\s+/g, ' ').trim().length > 48);
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
