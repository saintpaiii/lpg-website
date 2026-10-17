import { ExternalLink } from 'lucide-react';

/** Admin: "View on map" (OpenStreetMap, new tab) for a pinned store, or "Not pinned" in red. */
export default function StoreLocationLink({ lat, lng }: { lat: number | null | undefined; lng: number | null | undefined }) {
    if (lat == null || lng == null) {
        return <span className="text-sm font-medium text-red-600">Not pinned</span>;
    }
    return (
        <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            View on map <ExternalLink className="h-3.5 w-3.5" />
        </a>
    );
}
