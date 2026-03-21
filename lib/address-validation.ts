export type AddressValidationStatus = 'accepted' | 'review' | 'fix' | 'unsupported' | 'error';

export interface AddressValidationSummary {
  supported: boolean;
  source: 'google_address_validation' | 'coverage_check';
  status: AddressValidationStatus;
  title: string;
  message: string;
  regionCode: string;
  responseId?: string;
  formattedAddress?: string;
  possibleNextAction?: string;
  validationGranularity?: string;
  geocodeGranularity?: string;
  addressComplete?: boolean;
  hasUnconfirmedComponents?: boolean;
  hasInferredComponents?: boolean;
  hasReplacedComponents?: boolean;
  hasSpellCorrectedComponents?: boolean;
  missingComponentTypes: string[];
  unconfirmedComponentTypes: string[];
  unresolvedTokens: string[];
  geocode?: {
    lat: number;
    lng: number;
    placeId?: string;
  };
}

export interface GoogleAddressValidationInput {
  regionCode: string;
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  addressLines: string[];
}

interface GoogleAddressValidationResponse {
  result?: {
    verdict?: {
      validationGranularity?: string;
      geocodeGranularity?: string;
      addressComplete?: boolean;
      hasUnconfirmedComponents?: boolean;
      hasInferredComponents?: boolean;
      hasReplacedComponents?: boolean;
      hasSpellCorrectedComponents?: boolean;
      possibleNextAction?: string;
    };
    address?: {
      formattedAddress?: string;
      missingComponentTypes?: string[];
      unconfirmedComponentTypes?: string[];
      unresolvedTokens?: string[];
    };
    geocode?: {
      location?: {
        latitude?: number;
        longitude?: number;
      };
      placeId?: string;
    };
  };
  responseId?: string;
}

export const GOOGLE_ADDRESS_VALIDATION_SUPPORTED_REGIONS = new Set([
  'AR',
  'AT',
  'AU',
  'BE',
  'BG',
  'BR',
  'CA',
  'CH',
  'CL',
  'CO',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GB',
  'HR',
  'HU',
  'IE',
  'IN',
  'IT',
  'JP',
  'LT',
  'LU',
  'LV',
  'MX',
  'MY',
  'NL',
  'NO',
  'NZ',
  'PL',
  'PR',
  'PT',
  'SE',
  'SG',
  'SI',
  'SK',
  'US',
]);

function uniqueText(values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function toStatus(possibleNextAction?: string): AddressValidationStatus {
  switch (possibleNextAction) {
    case 'ACCEPT':
      return 'accepted';
    case 'CONFIRM':
    case 'CONFIRM_ADD_SUBPREMISES':
      return 'review';
    case 'FIX':
      return 'fix';
    default:
      return 'review';
  }
}

function buildSummaryMessage(
  possibleNextAction: string | undefined,
  missingComponentTypes: string[],
  unconfirmedComponentTypes: string[],
) {
  if (possibleNextAction === 'ACCEPT') {
    return 'Google found no major validation issues with the typed address.';
  }

  if (possibleNextAction === 'CONFIRM_ADD_SUBPREMISES') {
    return 'Google suggests confirming the address and checking for a missing unit or subpremise.';
  }

  if (possibleNextAction === 'CONFIRM') {
    return 'Google found a usable address, but some parts should still be reviewed before trusting it fully.';
  }

  if (possibleNextAction === 'FIX') {
    const issues = [...missingComponentTypes, ...unconfirmedComponentTypes];
    return issues.length > 0
      ? `Google flagged address issues: ${issues.join(', ')}.`
      : 'Google found address problems that should be fixed before using this address.';
  }

  return 'Google returned an address response that should be reviewed manually.';
}

export function isAddressValidationSupportedRegion(regionCode: string) {
  return GOOGLE_ADDRESS_VALIDATION_SUPPORTED_REGIONS.has(regionCode.toUpperCase());
}

export function buildUnsupportedAddressValidationSummary(regionCode: string): AddressValidationSummary {
  const normalizedRegion = regionCode.toUpperCase();

  return {
    supported: false,
    source: 'coverage_check',
    status: 'unsupported',
    title: 'Address Validation API not supported for this region',
    message:
      normalizedRegion === 'PH'
        ? 'Google Address Validation API does not currently list Philippines (PH) in its official coverage. For your barangay workflow, keep using autocomplete, geocoding, landmark directions, and manual pin verification.'
        : `Google Address Validation API does not currently list ${normalizedRegion} in its official coverage.`,
    regionCode: normalizedRegion,
    missingComponentTypes: [],
    unconfirmedComponentTypes: [],
    unresolvedTokens: [],
  };
}

export async function validateAddressWithGoogle(
  input: GoogleAddressValidationInput,
  apiKey: string,
): Promise<AddressValidationSummary> {
  const regionCode = input.regionCode.toUpperCase();

  if (!isAddressValidationSupportedRegion(regionCode)) {
    return buildUnsupportedAddressValidationSummary(regionCode);
  }

  const url = new URL('https://addressvalidation.googleapis.com/v1:validateAddress');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address: {
        regionCode,
        locality: input.locality?.trim() || undefined,
        administrativeArea: input.administrativeArea?.trim() || undefined,
        postalCode: input.postalCode?.trim() || undefined,
        addressLines: uniqueText(input.addressLines),
      },
      enableUspsCass: regionCode === 'US' || regionCode === 'PR',
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `Address Validation request failed with status ${response.status}.`);
  }

  const data = (await response.json()) as GoogleAddressValidationResponse;
  const verdict = data.result?.verdict;
  const address = data.result?.address;
  const possibleNextAction = verdict?.possibleNextAction;
  const status = toStatus(possibleNextAction);

  return {
    supported: true,
    source: 'google_address_validation',
    status,
    title:
      status === 'accepted'
        ? 'Address accepted'
        : status === 'review'
          ? 'Address needs review'
          : 'Address needs fixing',
    message: buildSummaryMessage(
      possibleNextAction,
      address?.missingComponentTypes ?? [],
      address?.unconfirmedComponentTypes ?? [],
    ),
    regionCode,
    responseId: data.responseId,
    formattedAddress: address?.formattedAddress,
    possibleNextAction,
    validationGranularity: verdict?.validationGranularity,
    geocodeGranularity: verdict?.geocodeGranularity,
    addressComplete: verdict?.addressComplete,
    hasUnconfirmedComponents: verdict?.hasUnconfirmedComponents,
    hasInferredComponents: verdict?.hasInferredComponents,
    hasReplacedComponents: verdict?.hasReplacedComponents,
    hasSpellCorrectedComponents: verdict?.hasSpellCorrectedComponents,
    missingComponentTypes: address?.missingComponentTypes ?? [],
    unconfirmedComponentTypes: address?.unconfirmedComponentTypes ?? [],
    unresolvedTokens: address?.unresolvedTokens ?? [],
    geocode:
      typeof data.result?.geocode?.location?.latitude === 'number'
      && typeof data.result?.geocode?.location?.longitude === 'number'
        ? {
            lat: data.result.geocode.location.latitude,
            lng: data.result.geocode.location.longitude,
            placeId: data.result.geocode.placeId,
          }
        : undefined,
  };
}
