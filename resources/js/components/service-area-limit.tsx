import { useEffect } from 'react';
import { Polygon, useMap } from 'react-leaflet';
import { applyServiceArea, CAVITE_BOUNDARY } from '@/lib/map';

/**
 * Drop inside any <MapContainer>: keeps the view within the Cavite service area.
 * `outline` draws the province boundary (thin dashed line) on maps where a location is picked.
 */
export default function ServiceAreaLimit({ outline = false }: { outline?: boolean }) {
    const map = useMap();
    useEffect(() => applyServiceArea(map), [map]);

    if (!outline) return null;

    return (
        <Polygon
            positions={CAVITE_BOUNDARY}
            interactive={false}
            pathOptions={{ color: '#2563eb', weight: 1.5, opacity: 0.7, dashArray: '6 6', fill: false }}
        />
    );
}
