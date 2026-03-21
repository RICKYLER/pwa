import { NextResponse } from 'next/server';
import {
  buildUnsupportedAddressValidationSummary,
  validateAddressWithGoogle,
} from '@/lib/address-validation';

export const runtime = 'nodejs';

interface RequestBody {
  address?: {
    regionCode?: string;
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    addressLines?: string[];
  };
}

const API_KEY = (
  process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY?.trim()
  || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim()
  || ''
);

export async function POST(request: Request) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: 'Google Address Validation API key is not configured.' },
      { status: 500 },
    );
  }

  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request body.' },
      { status: 400 },
    );
  }

  const regionCode = body.address?.regionCode?.trim()?.toUpperCase() || 'PH';
  const addressLines = (body.address?.addressLines ?? [])
    .map((line) => line.trim())
    .filter(Boolean);

  if (addressLines.length === 0) {
    return NextResponse.json(
      { error: 'At least one address line is required.' },
      { status: 400 },
    );
  }

  try {
    if (regionCode === 'PH') {
      return NextResponse.json(buildUnsupportedAddressValidationSummary(regionCode));
    }

    const result = await validateAddressWithGoogle(
      {
        regionCode,
        locality: body.address?.locality,
        administrativeArea: body.address?.administrativeArea,
        postalCode: body.address?.postalCode,
        addressLines,
      },
      API_KEY,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to validate address:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to validate address.' },
      { status: 500 },
    );
  }
}
