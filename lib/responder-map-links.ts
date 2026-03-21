export function buildResponderMapLocationUrl(
  lat?: number,
  lng?: number,
  address?: string,
) {
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
  }

  if (address?.trim()) {
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address.trim())}`;
  }

  return null;
}

export function openResponderMapLocation(
  lat?: number,
  lng?: number,
  address?: string,
) {
  const url = buildResponderMapLocationUrl(lat, lng, address);
  if (!url || typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
