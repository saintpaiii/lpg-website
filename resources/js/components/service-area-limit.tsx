import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { applyServiceArea } from '@/lib/map';

/** Drop inside any <MapContainer>: keeps the view within the Cavite service area. */
export default function ServiceAreaLimit() {
    const map = useMap();
    useEffect(() => applyServiceArea(map), [map]);
    return null;
}
