import { Loader2, MapPin, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { caviteCities, getBarangays } from '@/data/cavite-locations';

/** One OpenStreetMap search result, as returned by GET /api/geocode. */
export type GeocodeResult = {
    display_name: string;
    lat: number;
    lng: number;
    street: string | null;
    barangay: string | null;
    city: string | null;
};

const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/^city of\s+/, '').replace(/\s+city$/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Map an OSM city/town name onto our dropdown's city name (e.g. "Dasmariñas City" → "Dasmarinas"). */
export function matchCity(name: string | null | undefined): string | null {
    if (!name) return null;
    const n = norm(name);
    return caviteCities.find((c) => norm(c.name) === n)?.name
        ?? caviteCities.find((c) => n.includes(norm(c.name)) || norm(c.name).includes(n))?.name
        ?? null;
}

/** Map an OSM barangay-ish name onto our dropdown's barangay list for that city. */
export function matchBarangay(city: string | null, name: string | null | undefined): string | null {
    if (!city || !name) return null;
    const n = norm(name);
    const list = getBarangays(city);
    return list.find((b) => norm(b) === n)
        ?? list.find((b) => norm(b).startsWith(n + ' ') || n.startsWith(norm(b) + ' '))
        ?? null;
}

/** "Street, Barangay, City, Cavite, 4117, Philippines" → shorter text without country/postcode. */
export const shortPlaceName = (displayName: string) =>
    displayName.split(',').map((p) => p.trim()).filter((p) => p && p !== 'Philippines' && !/^\d{4}$/.test(p)).join(', ');

/**
 * Address search (OpenStreetMap Nominatim through our /api/geocode proxy).
 * Waits 500 ms after typing stops and needs at least 3 characters (Nominatim usage policy).
 */
export default function AddressSearchBox({ onSelect, placeholder = 'Search a street, subdivision, landmark…' }: {
    onSelect: (result: GeocodeResult) => void;
    placeholder?: string;
}) {
    const [query, setQuery]       = useState('');
    const [results, setResults]   = useState<GeocodeResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [open, setOpen]         = useState(false);
    const [searched, setSearched] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inflight = useRef<AbortController | null>(null);

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
        inflight.current?.abort();
    }, []);

    function handleChange(q: string) {
        setQuery(q);
        setSearched(false);
        if (timer.current) clearTimeout(timer.current);
        inflight.current?.abort();
        if (q.trim().length < 3) { setResults([]); setSearching(false); return; }

        setSearching(true);
        timer.current = setTimeout(async () => {
            const ctrl = new AbortController();
            inflight.current = ctrl;
            try {
                const res = await fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}`, {
                    signal: ctrl.signal,
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });
                const data = res.ok ? await res.json() : [];
                setResults(Array.isArray(data) ? data : []);
            } catch (e) {
                if ((e as Error)?.name === 'AbortError') return;
                setResults([]);
            }
            setSearching(false);
            setSearched(true);
            setOpen(true);
        }, 500);
    }

    function choose(r: GeocodeResult) {
        onSelect(r);
        setQuery(shortPlaceName(r.display_name));
        setResults([]);
        setOpen(false);
    }

    return (
        <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                onFocus={() => results.length > 0 && setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}   // let a click on a result land first
                onKeyDown={(e) => {
                    if (e.key === 'Escape') setOpen(false);
                    if (e.key === 'Enter') { e.preventDefault(); if (results[0]) choose(results[0]); }
                }}
                placeholder={placeholder}
                className="h-10 pl-9 pr-9"
                aria-label="Search address"
                autoComplete="off"
            />
            {searching ? (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
            ) : query && (
                <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); setResults([]); setSearched(false); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                </button>
            )}

            {open && (results.length > 0 || searched) && (
                <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-md border bg-white py-1 text-sm shadow-lg dark:bg-gray-900">
                    {results.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-gray-500">No places found in Cavite. Try a street or barangay name, or tap the map.</li>
                    ) : results.map((r, i) => (
                        <li key={i}>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r)}
                                className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-gray-800">
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                                <span className="text-gray-700 dark:text-gray-200">{shortPlaceName(r.display_name)}</span>
                            </button>
                        </li>
                    ))}
                    <li className="border-t px-3 pt-1 text-[10px] text-gray-400">Search by OpenStreetMap</li>
                </ul>
            )}
        </div>
    );
}
