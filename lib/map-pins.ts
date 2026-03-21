import type { Household } from './db/schema';

export const DEFAULT_BARANGAY_CENTER = { lat: 7.843, lng: 125.621 };
export const HOUSEHOLD_PIN_COLOR = '#6366f1';

const INCIDENT_SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#94a3b8',
};

export function hasHouseholdPin<T extends Pick<Household, 'gps_lat' | 'gps_long'>>(
  household: T,
): household is T & { gps_lat: number; gps_long: number } {
  return typeof household.gps_lat === 'number' && typeof household.gps_long === 'number';
}

export function createHouseholdMarkerIcon(options?: {
  selected?: boolean;
  scale?: number;
}): google.maps.Symbol {
  const selected = options?.selected ?? false;
  const scale = options?.scale ?? (selected ? 11 : 10);

  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: HOUSEHOLD_PIN_COLOR,
    fillOpacity: 1,
    strokeWeight: selected ? 3 : 2.5,
    strokeColor: '#ffffff',
  };
}

export function createIncidentMarkerIcon(
  severity: string,
  scale = 9,
): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
    scale,
    fillColor: INCIDENT_SEVERITY_COLORS[severity] ?? INCIDENT_SEVERITY_COLORS.low,
    fillOpacity: 1,
    strokeWeight: 2,
    strokeColor: '#ffffff',
  };
}

export function focusMapOnPinnedHouseholds(
  map: google.maps.Map,
  households: Household[],
  fallbackCenter = DEFAULT_BARANGAY_CENTER,
) {
  const pinnedHouseholds = households.filter(hasHouseholdPin);

  if (pinnedHouseholds.length === 0) {
    map.setCenter(fallbackCenter);
    map.setZoom(14);
    return;
  }

  if (pinnedHouseholds.length === 1) {
    map.panTo({
      lat: pinnedHouseholds[0].gps_lat,
      lng: pinnedHouseholds[0].gps_long,
    });
    map.setZoom(17);
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  pinnedHouseholds.forEach((household) => {
    bounds.extend({
      lat: household.gps_lat,
      lng: household.gps_long,
    });
  });
  map.fitBounds(bounds);
}
