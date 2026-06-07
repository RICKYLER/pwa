'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Download, Loader2, PackageCheck, QrCode } from 'lucide-react';

type DistributionQrPayload = {
  deepLink: string;
  householdName: string;
  matchedResidentNames: string[];
};

type ClaimedRelease = {
  receivedByName?: string;
  claimedAt?: Date;
};

type DistributionNotificationQrProps = {
  eventId: string;
  householdHeadName: string;
  audienceLabel: string;
  matchedResidentNames: string[];
  claimedRelease?: ClaimedRelease | null;
};

function formatClaimedAt(value?: Date) {
  if (!value) {
    return 'Just now';
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function toQrDownloadFileName(householdName: string) {
  const safeName = householdName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'household';

  return `${safeName}-distribution-qr.png`;
}

export default function DistributionNotificationQr({
  eventId,
  householdHeadName,
  audienceLabel,
  matchedResidentNames,
  claimedRelease,
}: DistributionNotificationQrProps) {
  const [qrPayload, setQrPayload] = useState<DistributionQrPayload | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (claimedRelease) {
      setQrPayload(null);
      setQrImageUrl('');
      setError('');
      return;
    }

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
  }, [audienceLabel, claimedRelease, eventId, householdHeadName, matchedResidentNames]);

  if (claimedRelease) {
    return (
      <div className="mt-4 rounded-[24px] border border-emerald-200 bg-emerald-50/90 p-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-emerald-200 bg-white text-emerald-700">
            <PackageCheck className="h-9 w-9" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Relief Claimed
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-900">
              Your {audienceLabel.toLowerCase()} package has been released.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Received by: {claimedRelease.receivedByName || householdHeadName}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              Claimed on: {formatClaimedAt(claimedRelease.claimedAt)}
            </p>
            <p className="mt-3 text-xs leading-5 text-emerald-800">
              This event QR is now closed and cannot be used again.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
  const downloadFileName = toQrDownloadFileName(qrPayload.householdName);

  return (
    <div className="mt-4 overflow-hidden rounded-[24px] border border-emerald-200 bg-emerald-50/80 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex justify-center sm:block">
          <Image
            src={qrImageUrl}
            alt={`Distribution QR code for ${qrPayload.householdName}`}
            width={192}
            height={192}
            className="h-48 w-48 rounded-2xl border border-emerald-100 bg-white p-2 shadow-sm sm:h-40 sm:w-40"
            unoptimized
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <div className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-white px-3 py-1 text-center text-xs font-semibold text-emerald-700 shadow-sm sm:justify-start">
              <QrCode className="h-3.5 w-3.5 flex-shrink-0" />
              Household QR Ready
            </div>
            <a
              href={qrImageUrl}
              download={downloadFileName}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-center text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50 sm:justify-start"
              aria-label={`Download QR code for ${qrPayload.householdName}`}
            >
              <Download className="h-3.5 w-3.5 flex-shrink-0" />
              Download QR
            </a>
          </div>

          <div className="mt-4 space-y-2 text-left">
            <p className="text-sm font-semibold leading-6 text-slate-900">
              Present this QR during distribution for your {audienceLabel.toLowerCase()} release.
            </p>
            <p className="break-words text-sm leading-6 text-slate-700">
              <span className="font-medium text-slate-900">Household account:</span>{' '}
              {qrPayload.householdName}
            </p>
            <p className="break-words text-sm leading-6 text-slate-700">
              <span className="font-medium text-slate-900">
                Qualified member{qrPayload.matchedResidentNames.length === 1 ? '' : 's'}:
              </span>{' '}
              {matchedNames}
            </p>
            <p className="text-xs leading-5 text-emerald-800">
              This QR is event-specific and becomes invalid after the package is released.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
