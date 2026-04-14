import type { Household } from '@/lib/db/schema';
import { DEFAULT_BARANGAY_CENTER } from '@/lib/map-pins';

export interface GeocodedLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export interface ResolvedLocation extends GeocodedLocation {
  placeId?: string;
  displayName?: string;
  streetAddress?: string;
  purokSitio?: string;
  barangayName?: string;
  municipality?: string;
}

export interface LocationSearchContext {
  municipality?: string;
  barangayName?: string;
  purokSitio?: string;
}

const PLUS_CODE_PATTERN = /\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/gi;

const DEFAULT_MUNICIPALITY = process.env.NEXT_PUBLIC_DEFAULT_MUNICIPALITY?.trim() || '';

function humanizeBarangayId(barangayId?: string): string | undefined {
  if (!barangayId) return undefined;

  const normalized = barangayId
    .replace(/[_-]+/g, ' ')
    .replace(/\bbrgy\b/gi, 'Barangay')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return undefined;

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function stripPlusCode(value: string): string {
  return value
    .replace(PLUS_CODE_PATTERN, '')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^,\s*|\s*,\s*$/g, '')
    .trim();
}

function cleanAddressText(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = stripPlusCode(value);
  return cleaned || undefined;
}

function normalizeComparisonText(value?: string): string {
  return stripPlusCode(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isSpecificLocationText(
  value?: string,
  context?: Pick<ResolvedLocation, 'purokSitio' | 'barangayName' | 'municipality'>,
): boolean {
  const normalized = normalizeComparisonText(value);
  if (!normalized) return false;

  const blockedValues = [
    normalizeComparisonText(context?.purokSitio),
    normalizeComparisonText(context?.barangayName),
    normalizeComparisonText(context?.municipality),
    'philippines',
  ].filter(Boolean);

  return !blockedValues.includes(normalized);
}

function includesTerm(source: string, term: string): boolean {
  return stripPlusCode(source).toLowerCase().includes(stripPlusCode(term).toLowerCase());
}

export function normalizePurokSitio(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const purokMatch = cleaned.match(/^(?:purok|prk|pk)\s*([a-z0-9-]+)$/i);
  if (purokMatch?.[1]) {
    return `Purok ${purokMatch[1].toUpperCase()}`;
  }

  const sitioMatch = cleaned.match(/^(?:sitio|stio)\s+(.+)$/i);
  if (sitioMatch?.[1]) {
    return `Sitio ${toTitleCase(sitioMatch[1])}`;
  }

  const onlyNumber = cleaned.match(/^([0-9]+[a-z]?)$/i);
  if (onlyNumber?.[1]) {
    return `Purok ${onlyNumber[1].toUpperCase()}`;
  }

  return toTitleCase(cleaned);
}

export function normalizeBarangayName(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const barangayMatch = cleaned.match(/^(?:barangay|brgy|brg|brgy\.)\s*(.+)$/i);
  if (barangayMatch?.[1]) {
    return `Barangay ${toTitleCase(barangayMatch[1])}`;
  }

  const onlyNumber = cleaned.match(/^([0-9]+[a-z]?)$/i);
  if (onlyNumber?.[1]) {
    return `Barangay ${onlyNumber[1].toUpperCase()}`;
  }

  return toTitleCase(cleaned);
}

export function formatBarangayName(barangayId?: string): string {
  return normalizeBarangayName(humanizeBarangayId(barangayId) ?? '');
}

export function normalizeMunicipalityName(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
    ? toTitleCase(value.replace(/\s+/g, ' ').trim())
    : '';
}

function findAddressComponent(
  components: readonly google.maps.GeocoderAddressComponent[] | undefined,
  typeSets: string[][],
): string | undefined {
  if (!components?.length) return undefined;

  for (const typeSet of typeSets) {
    const match = components.find((component) =>
      typeSet.every((type) => component.types.includes(type)),
    );
    if (match?.long_name) {
      return match.long_name;
    }
  }

  return undefined;
}

function buildResolvedLocation(
  lat: number,
  lng: number,
  formattedAddress: string,
  components?: readonly google.maps.GeocoderAddressComponent[],
  placeId?: string,
  preferredName?: string,
): ResolvedLocation {
  const streetNumber = findAddressComponent(components, [['street_number']]);
  const route = findAddressComponent(components, [['route']]);
  const premise = findAddressComponent(components, [['premise']]);
  const neighborhood = findAddressComponent(components, [['neighborhood']]);
  const sublocalityLevel1 = findAddressComponent(components, [['sublocality_level_1'], ['sublocality']]);
  const sublocalityLevel2 = findAddressComponent(components, [['sublocality_level_2']]);
  const sublocalityLevel3 = findAddressComponent(components, [['sublocality_level_3']]);
  const locality = findAddressComponent(components, [['locality']]);
  const administrativeLevel3 = findAddressComponent(components, [['administrative_area_level_3']]);
  const administrativeLevel2 = findAddressComponent(components, [['administrative_area_level_2']]);
  const administrativeLevel4 = findAddressComponent(components, [['administrative_area_level_4']]);
  const country = findAddressComponent(components, [['country']]);
  
  let cleanedFormattedAddress = cleanAddressText(formattedAddress) || formattedAddress.trim();

  // Check if formatted_address contains only Plus Code + country/region
  const addressParts = formattedAddress.split(',').map(p => p.trim());
  const isPlusCodeOnly = addressParts.length <= 3 && 
    addressParts.some(part => PLUS_CODE_PATTERN.test(part));

  // If Plus Code only, try to build better address from components
  if (isPlusCodeOnly && components) {
    const betterAddressParts = [
      streetNumber && route ? `${streetNumber} ${route}` : route,
      locality || administrativeLevel2,
    ].filter(Boolean);
    
    if (betterAddressParts.length > 0) {
      cleanedFormattedAddress = betterAddressParts.join(', ');
    }
  }

  const streetAddress = [streetNumber, route].filter(Boolean).join(' ')
    || cleanAddressText(premise)
    || cleanAddressText(neighborhood)
    || cleanAddressText(formattedAddress.split(',')[0]?.trim())
    || cleanAddressText(sublocalityLevel2)
    || cleanAddressText(sublocalityLevel1)
    || undefined;

  const barangayName = normalizeBarangayName(
    sublocalityLevel1 || administrativeLevel4 || '',
  ) || undefined;

  const purokSitio = normalizePurokSitio(
    sublocalityLevel2 || sublocalityLevel3 || '',
  ) || undefined;

  const municipality = normalizeMunicipalityName(
    locality || administrativeLevel3 || administrativeLevel2 || '',
  ) || undefined;

  const displayName = cleanAddressText(preferredName)
    || streetAddress
    || cleanAddressText(premise)
    || cleanAddressText(neighborhood)
    || purokSitio
    || barangayName
    || cleanAddressText(formattedAddress.split(',')[0]?.trim())
    || cleanedFormattedAddress;

  return {
    lat,
    lng,
    formattedAddress: cleanedFormattedAddress,
    placeId,
    displayName,
    streetAddress,
    purokSitio,
    barangayName,
    municipality,
  };
}

export function mergePurokOptions(values: string[]): string[] {
  const merged = new Set<string>();

  values
    .map((value) => normalizePurokSitio(value))
    .filter(Boolean)
    .forEach((value) => merged.add(value));

  return Array.from(merged).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function buildHouseholdAddressParts(
  household: Pick<Household, 'street_address' | 'purok_sitio' | 'barangay_id'> &
    Partial<Pick<Household, 'barangay_name' | 'municipality'>>,
): string[] {
  const barangayName = normalizeBarangayName(
    household.barangay_name || formatBarangayName(household.barangay_id),
  );
  const municipality = normalizeMunicipalityName(household.municipality || DEFAULT_MUNICIPALITY);

  const parts = [
    cleanAddressText(household.street_address?.trim()),
    normalizePurokSitio(household.purok_sitio ?? ''),
    barangayName,
    municipality,
  ].filter(Boolean) as string[];

  return parts.filter((part, index) => {
    return parts.findIndex(
      (candidate) => candidate.localeCompare(part, undefined, { sensitivity: 'accent' }) === 0,
    ) === index;
  });
}

export function buildHouseholdAddressPreview(
  household: Pick<Household, 'street_address' | 'purok_sitio' | 'barangay_id'> &
    Partial<Pick<Household, 'barangay_name' | 'municipality'>>,
): string {
  return buildHouseholdAddressParts(household).join(', ');
}

export function buildHouseholdGeocodingAddress(
  household: Pick<Household, 'street_address' | 'purok_sitio' | 'barangay_id'> &
    Partial<Pick<Household, 'barangay_name' | 'municipality'>>,
): string {
  return [
    ...buildHouseholdAddressParts(household),
    'Philippines',
  ]
    .filter(Boolean)
    .join(', ');
}

export function buildSearchQuery(
  query: string,
  context?: LocationSearchContext,
): string {
  const base = cleanAddressText(query) || query.trim();
  const parts = [base];

  const contextParts = [
    normalizePurokSitio(context?.purokSitio ?? ''),
    normalizeBarangayName(context?.barangayName ?? ''),
    normalizeMunicipalityName(context?.municipality ?? ''),
    'Philippines',
  ].filter(Boolean);

  contextParts.forEach((part) => {
    if (!includesTerm(parts.join(', '), part)) {
      parts.push(part);
    }
  });

  return parts.filter(Boolean).join(', ');
}

export function buildResponderLocationText(location: {
  streetAddress?: string;
  purokSitio?: string;
  barangayName?: string;
  municipality?: string;
  formattedAddress?: string;
}): string {
  const streetAddress = cleanAddressText(location.streetAddress);
  const purokSitio = normalizePurokSitio(location.purokSitio ?? '');
  const barangayName = normalizeBarangayName(location.barangayName ?? '');
  const municipality = normalizeMunicipalityName(location.municipality ?? '');

  const lines = [
    streetAddress ? `Street / Landmark: ${streetAddress}` : '',
    purokSitio ? `Purok / Sitio: ${purokSitio}` : '',
    barangayName ? `Barangay: ${barangayName}` : '',
    municipality ? `Municipality: ${municipality}` : '',
  ].filter(Boolean);

  if (lines.length > 0) {
    return lines.join(' • ');
  }

  return cleanAddressText(location.formattedAddress) || '';
}

export function buildDefaultSearchBounds(): google.maps.LatLngBoundsLiteral {
  return {
    north: DEFAULT_BARANGAY_CENTER.lat + 0.08,
    south: DEFAULT_BARANGAY_CENTER.lat - 0.08,
    east: DEFAULT_BARANGAY_CENTER.lng + 0.08,
    west: DEFAULT_BARANGAY_CENTER.lng - 0.08,
  };
}

export function buildSearchBoundsFromCenter(
  center?: google.maps.LatLngLiteral,
  span = 0.08,
): google.maps.LatLngBoundsLiteral {
  if (!center) {
    return buildDefaultSearchBounds();
  }

  return {
    north: center.lat + span,
    south: center.lat - span,
    east: center.lng + span,
    west: center.lng - span,
  };
}

export function getPlacePinDetails(
  place: google.maps.places.PlaceResult,
): ResolvedLocation | null {
  const location = place.geometry?.location;
  if (!location) return null;

  return buildResolvedLocation(
    location.lat(),
    location.lng(),
    place.formatted_address || place.name || '',
    place.address_components,
    place.place_id,
    place.name,
  );
}

export function getGeocoderPinDetails(
  result: google.maps.GeocoderResult,
): ResolvedLocation {
  const location = result.geometry.location;
  return buildResolvedLocation(
    location.lat(),
    location.lng(),
    result.formatted_address,
    result.address_components,
    result.place_id,
  );
}

function scoreReverseGeocodeResult(result: google.maps.GeocoderResult): number {
  const types = result.types ?? [];
  let score = 0;

  if (types.includes('street_address')) score += 100;
  if (types.includes('premise')) score += 90;
  if (types.includes('subpremise')) score += 80;
  if (types.includes('route')) score += 70;
  if (types.includes('intersection')) score += 65;
  if (types.includes('establishment')) score += 55;
  if (types.includes('point_of_interest')) score += 45;
  if (types.includes('neighborhood')) score += 35;
  if (types.includes('sublocality')) score += 25;
  if (types.includes('locality')) score += 15;
  if (types.includes('plus_code')) score -= 500;
  if (types.includes('political') && types.length === 1) score -= 40;

  if (cleanAddressText(result.formatted_address.split(',')[0]?.trim())) {
    score += 5;
  }

  const addressComponents = result.address_components ?? [];
  const hasStreetNumber = addressComponents.some(c => c.types.includes('street_number'));
  if (hasStreetNumber) {
    score += 50;
  }

  return score;
}

function pickBestReverseGeocodeResult(
  results: readonly google.maps.GeocoderResult[] | undefined,
): google.maps.GeocoderResult | undefined {
  if (!results?.length) return undefined;

  return [...results].sort(
    (left, right) => scoreReverseGeocodeResult(right) - scoreReverseGeocodeResult(left),
  )[0];
}

function scoreNearbyPlace(result: google.maps.places.PlaceResult): number {
  const types = result.types ?? [];
  let score = 0;

  if (types.includes('street_address')) score += 90;
  if (types.includes('route')) score += 80;
  if (types.includes('premise')) score += 70;
  if (types.includes('point_of_interest')) score += 60;
  if (types.includes('establishment')) score += 50;
  if (types.includes('neighborhood')) score += 30;
  if (types.includes('plus_code')) score -= 500;
  if (result.name) score += 5;

  return score;
}

function pickBestNearbyPlace(
  results: readonly google.maps.places.PlaceResult[] | undefined,
): google.maps.places.PlaceResult | undefined {
  if (!results?.length) return undefined;

  return [...results].sort(
    (left, right) => scoreNearbyPlace(right) - scoreNearbyPlace(left),
  )[0];
}

function mergeResolvedLocations(
  base: ResolvedLocation,
  nearby?: ResolvedLocation | null,
): ResolvedLocation {
  if (!nearby) return base;

  const preferredDisplayName = isSpecificLocationText(nearby.displayName, base)
    ? nearby.displayName
    : base.displayName;

  const preferredStreetAddress = isSpecificLocationText(base.streetAddress, base)
    ? base.streetAddress
    : nearby.streetAddress || nearby.displayName || base.streetAddress;

  return {
    ...base,
    placeId: nearby.placeId || base.placeId,
    displayName: preferredDisplayName
      || base.displayName
      || nearby.displayName
      || base.streetAddress
      || base.formattedAddress,
    streetAddress: preferredStreetAddress,
    purokSitio: base.purokSitio || nearby.purokSitio,
    barangayName: base.barangayName || nearby.barangayName,
    municipality: base.municipality || nearby.municipality,
  };
}

export async function geocodeAddress(
  address: string,
  options?: {
    bounds?: google.maps.LatLngBoundsLiteral;
    region?: string;
  },
): Promise<ResolvedLocation | null> {
  if (typeof window === 'undefined' || !window.google?.maps || !address.trim()) {
    return null;
  }

  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      {
        address,
        bounds: options?.bounds ?? buildDefaultSearchBounds(),
        region: options?.region ?? 'ph',
      },
      (results, status) => {
        if (status !== 'OK' || !results?.[0]) {
          resolve(null);
          return;
        }

        resolve(getGeocoderPinDetails(results[0]));
      },
    );
  });
}

export async function searchLocation(
  query: string,
  options?: {
    context?: LocationSearchContext;
    bounds?: google.maps.LatLngBoundsLiteral;
    locationBias?: google.maps.LatLngLiteral;
    radiusMeters?: number;
    region?: string;
  },
): Promise<ResolvedLocation | null> {
  if (typeof window === 'undefined' || !window.google?.maps) {
    return null;
  }

  const locationBias = options?.locationBias ?? DEFAULT_BARANGAY_CENTER;
  const municipality = options?.context?.municipality;

  // Helper to score search results
  function scoreSearchResult(result: google.maps.places.PlaceResult): number {
    const types = result.types ?? [];
    let score = 0;

    if (types.includes('street_address')) score += 100;
    if (types.includes('premise')) score += 90;
    if (types.includes('route')) score += 80;
    if (types.includes('intersection')) score += 70;
    if (types.includes('establishment')) score += 60;
    if (types.includes('point_of_interest')) score += 50;
    if (types.includes('neighborhood')) score += 30;
    if (types.includes('sublocality')) score += 20;
    if (types.includes('locality')) score += 10;
    if (types.includes('plus_code')) score -= 500;

    // Bonus for street number component
    const hasStreetNumber = result.address_components?.some(
      c => c.types.includes('street_number')
    );
    if (hasStreetNumber) score += 50;

    return score;
  }

  // Helper to search with Places API
  async function searchWithPlaces(
    searchQuery: string,
    radius: number
  ): Promise<google.maps.places.PlaceResult | null> {
    if (!window.google.maps.places) return null;

    const placesService = new window.google.maps.places.PlacesService(document.createElement('div'));

    return new Promise<google.maps.places.PlaceResult | null>((resolve) => {
      placesService.textSearch(
        {
          query: searchQuery,
          location: locationBias,
          radius,
        },
        (results, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && results?.length) {
            // Sort by score and pick best
            const sorted = [...results].sort(
              (a, b) => scoreSearchResult(b) - scoreSearchResult(a)
            );
            resolve(sorted[0]);
            return;
          }

          resolve(null);
        },
      );
    });
  }

  // Helper to get detailed place
  async function getDetailedPlace(
    placeId: string,
    fallback: google.maps.places.PlaceResult
  ): Promise<google.maps.places.PlaceResult> {
    if (!window.google.maps.places) return fallback;

    const placesService = new window.google.maps.places.PlacesService(document.createElement('div'));

    return new Promise<google.maps.places.PlaceResult>((resolve) => {
      placesService.getDetails(
        {
          placeId,
          fields: ['address_components', 'formatted_address', 'geometry', 'name', 'place_id', 'types'],
        },
        (place, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
            resolve(place);
            return;
          }

          resolve(fallback);
        },
      );
    });
  }

  // Strategy 1: Original query with Places textSearch
  const searchQuery1 = buildSearchQuery(query, options?.context);
  let topResult = await searchWithPlaces(searchQuery1, options?.radiusMeters ?? 15000);

  // Strategy 2: If no street_address found, append municipality context
  if (!topResult || !topResult.types?.includes('street_address')) {
    if (municipality && !searchQuery1.toLowerCase().includes(municipality.toLowerCase())) {
      const searchQuery2 = buildSearchQuery(query, {
        ...options?.context,
        municipality,
      });
      const result2 = await searchWithPlaces(searchQuery2, options?.radiusMeters ?? 15000);
      
      if (result2 && scoreSearchResult(result2) > scoreSearchResult(topResult || {} as any)) {
        topResult = result2;
      }
    }
  }

  // Get detailed place info if we have a result
  if (topResult?.place_id) {
    const detailedPlace = await getDetailedPlace(topResult.place_id, topResult);
    const resolvedPlace = getPlacePinDetails(detailedPlace);
    if (resolvedPlace) {
      return resolvedPlace;
    }
  }

  // Strategy 3: Fallback to Geocoder with full address components
  const geocoderResult = await geocodeAddress(searchQuery1, {
    bounds: options?.bounds ?? buildSearchBoundsFromCenter(locationBias, 0.05),
    region: options?.region ?? 'ph',
  });

  return geocoderResult;
}

export async function resolveLocationFromCoordinates(
  lat: number,
  lng: number,
): Promise<ResolvedLocation | null> {
  if (typeof window === 'undefined' || !window.google?.maps) {
    return null;
  }

  const geocoderResults = await new Promise<google.maps.GeocoderResult[] | null>((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results?.length) {
        resolve(results);
        return;
      }

      resolve(null);
    });
  });

  if (!geocoderResults?.length) {
    return null;
  }

  // First, try to find a street-level result by filtering the results array
  const streetLevelTypes = ['street_address', 'premise', 'route', 'intersection'];
  const streetLevelResult = geocoderResults.find(result =>
    result.types?.some(type => streetLevelTypes.includes(type))
  );

  // Use street-level result if found, otherwise pick best result
  const bestResult = streetLevelResult 
    ? streetLevelResult 
    : (pickBestReverseGeocodeResult(geocoderResults) ?? geocoderResults[0]);
  
  const baseDetails = getGeocoderPinDetails(bestResult);

  if (
    isSpecificLocationText(baseDetails.displayName, baseDetails)
    || isSpecificLocationText(baseDetails.streetAddress, baseDetails)
    || !window.google.maps.places
  ) {
    return baseDetails;
  }

  const placesService = new window.google.maps.places.PlacesService(document.createElement('div'));
  const nearbyResult = await new Promise<google.maps.places.PlaceResult | null>((resolve) => {
    placesService.nearbySearch(
      {
        location: { lat, lng },
        radius: 120,
      },
      (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results?.length) {
          resolve(pickBestNearbyPlace(results) ?? results[0]);
          return;
        }

        resolve(null);
      },
    );
  });

  if (!nearbyResult?.place_id) {
    return baseDetails;
  }

  const detailedPlace = await new Promise<google.maps.places.PlaceResult | null>((resolve) => {
    placesService.getDetails(
      {
        placeId: nearbyResult.place_id!,
        fields: ['address_components', 'formatted_address', 'geometry', 'name', 'place_id'],
      },
      (place, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
          resolve(place);
          return;
        }

        resolve(nearbyResult);
      },
    );
  });

  return mergeResolvedLocations(
    baseDetails,
    detailedPlace ? getPlacePinDetails(detailedPlace) : null,
  );
}
