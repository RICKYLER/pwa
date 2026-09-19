/**
 * OpenStreetMap Nominatim Geocoding and Reverse Geocoding Services
 * Provides free, keyless geocoding for StreetMaps (Leaflet) integration.
 */

export interface OsmResolvedLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
  streetAddress?: string;
  purokSitio?: string;
  barangayName?: string;
  municipality?: string;
  quality: 'street' | 'neighborhood' | 'city';
}

interface NominatimAddress {
  road?: string;
  house_number?: string;
  pedestrian?: string;
  residential?: string;
  neighbourhood?: string;
  suburb?: string;
  village?: string;
  quarter?: string;
  hamlet?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
}

interface NominatimResponse {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

export function parseNominatimQuality(address?: NominatimAddress): 'street' | 'neighborhood' | 'city' {
  if (!address) return 'city';

  if (address.road || address.house_number || address.pedestrian || address.residential) {
    return 'street';
  }

  if (address.neighbourhood || address.suburb || address.village || address.quarter || address.hamlet) {
    return 'neighborhood';
  }

  return 'city';
}

export function formatOsmAddress(item: NominatimResponse): string {
  const addr = item.address;
  if (!addr) {
    return item.display_name;
  }

  const parts: string[] = [];

  const street = [addr.house_number, addr.road || addr.pedestrian || addr.residential]
    .filter(Boolean)
    .join(' ');
  if (street) parts.push(street);

  const localArea = addr.neighbourhood || addr.suburb || addr.village || addr.quarter || addr.hamlet;
  if (localArea && !parts.includes(localArea)) parts.push(localArea);

  const municipalityOrCity = addr.town || addr.city || addr.municipality;
  if (municipalityOrCity && !parts.includes(municipalityOrCity)) parts.push(municipalityOrCity);

  const province = addr.state || addr.county;
  if (province && !parts.includes(province)) parts.push(province);

  return parts.length > 0 ? parts.join(', ') : item.display_name;
}

export async function osmReverseGeocode(lat: number, lng: number): Promise<OsmResolvedLocation | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
      lat,
    )}&lon=${encodeURIComponent(lng)}&addressdetails=1`;

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) return null;

    const data: NominatimResponse = await res.json();
    if (!data || !data.lat || !data.lon) return null;

    const parsedLat = parseFloat(data.lat);
    const parsedLng = parseFloat(data.lon);
    const quality = parseNominatimQuality(data.address);
    const formattedAddress = formatOsmAddress(data);

    return {
      lat: isNaN(parsedLat) ? lat : parsedLat,
      lng: isNaN(parsedLng) ? lng : parsedLng,
      formattedAddress,
      streetAddress: data.address?.road,
      purokSitio: data.address?.neighbourhood || data.address?.suburb,
      barangayName: data.address?.village,
      municipality: data.address?.town || data.address?.city || data.address?.municipality,
      quality,
    };
  } catch {
    return null;
  }
}

export async function osmSearchLocation(
  query: string,
  context?: { municipality?: string; barangayName?: string },
): Promise<OsmResolvedLocation | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    let searchQuery = trimmed;
    if (context?.municipality && !trimmed.toLowerCase().includes(context.municipality.toLowerCase())) {
      searchQuery += `, ${context.municipality}`;
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      searchQuery,
    )}&countrycodes=ph&limit=5&addressdetails=1`;

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) return null;

    const data: NominatimResponse[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      // If scoped search returned nothing, try the original query without context
      if (searchQuery !== trimmed) {
        return osmSearchLocation(trimmed);
      }
      return null;
    }

    const best = data[0];
    const parsedLat = parseFloat(best.lat);
    const parsedLng = parseFloat(best.lon);
    const quality = parseNominatimQuality(best.address);
    const formattedAddress = formatOsmAddress(best);

    return {
      lat: parsedLat,
      lng: parsedLng,
      formattedAddress,
      streetAddress: best.address?.road,
      purokSitio: best.address?.neighbourhood || best.address?.suburb,
      barangayName: best.address?.village,
      municipality: best.address?.town || best.address?.city || best.address?.municipality,
      quality,
    };
  } catch {
    return null;
  }
}
