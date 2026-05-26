'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, QrCode } from 'lucide-react';

type DistributionQrPayload = {
  deepLink: string;
  householdName: string;
  matchedResidentNames: string[];
};

type DistributionNotificationQrProps = {
  eventId: string;
  householdHeadName: string;
  audienceLabel: string;
  matchedResidentNames: string[];
};

export default function DistributionNotificationQr({
  eventId,
  householdHeadName,
  audienceLabel,
  matchedResidentNames,
}: DistributionNotificationQrProps) {
  const [qrPayload, setQrPayload] = useState<DistributionQrPayload | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadQr() {
      try {
        setError('');
        const response = await fetch('/api/distribution/qr', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({ eventId }),
        });

        const payload = await response.json().catch(() => null) as {
          error?: string;
          deepLink?: string;
          householdName?: string;
          matchedResidentNames?: string[];
        } | null;

        if (!response.ok || !payload?.deepLink) {
          throw new Error(payload?.error || 'Unable to prepare your household QR code.');
        }

        const imageUrl = await QRCode.toDataURL(payload.deepLink, {
          width: 240,
          margin: 1,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });

        if (!cancelled) {
          setQrPayload({
            deepLink: payload.deepLink,
            householdName: payload.householdName || householdHeadName,
            matchedResidentNames: Array.isArray(payload.matchedResidentNames)
              ? payload.matchedResidentNames
              : matchedResidentNames,
          });
          setQrImageUrl(imageUrl);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to prepare your household QR code.',
          );
        }
      }
    }

    void loadQr();

    return () => {
      cancelled = true;
    };
  }, [audienceLabel, eventId, householdHeadName, matchedResidentNames]);

  if (error) {
    return (
      <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {error}
      </div>
    );
  }

  if (!qrPayload || !qrImageUrl) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        Preparing your event QR code...
      </div>
    );
  }

  const matchedNames = qrPayload.matchedResidentNames.length > 0
    ? qrPayload.matchedResidentNames.join(', ')
    : householdHeadName;

  return (
    <div className="mt-4 rounded-[24px] border border-emerald-200 bg-emerald-50/80 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <Image
          src={qrImageUrl}
          alt={`Distribution QR code for ${qrPayload.householdName}`}
          width={160}
          height={160}
          className="h-40 w-40 rounded-2xl border border-emerald-100 bg-white p-2"
          unoptimized
        />

        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
            <QrCode className="h-3.5 w-3.5" />
            Household QR Ready
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            Present this QR during distribution for your {audienceLabel.toLowerCase()} release.
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Household account: {qrPayload.householdName}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            Qualified member{qrPayload.matchedResidentNames.length === 1 ? '' : 's'}: {matchedNames}
          </p>
          <p className="mt-3 text-xs leading-5 text-emerald-800">
            This QR is event-specific and becomes invalid after the package is released.
          </p>
        </div>
      </div>
    </div>
  );
}
