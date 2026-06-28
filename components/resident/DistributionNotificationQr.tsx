'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Download, Loader2, PackageCheck, QrCode } from 'lucide-react';
import { extractDistributionQrToken } from '@/lib/distribution-qr';

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

const QR_LOGO_SRC = '/dswd-logo.png';
const QR_IMAGE_SIZE = 1024;
const QR_LOGO_BACKING_RATIO = 0.155;
const QR_LOGO_RATIO = 0.095;
const QR_POSTER_WIDTH = 1200;
const QR_POSTER_HEIGHT = 1600;

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

function loadQrLogo() {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load the QR logo.'));
    image.src = QR_LOGO_SRC;
  });
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fill();
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }
    currentLine = word;

    if (lines.length === maxLines) {
      break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  lines.forEach((line, index) => {
    context.fillText(line, x, y + (index * lineHeight));
  });
}

async function createBrandedQrCanvas(value: string) {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, value, {
    errorCorrectionLevel: 'H',
    width: QR_IMAGE_SIZE,
    margin: 4,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  const context = canvas.getContext('2d');
  if (!context) {
    return {
      qrCanvas: canvas,
      displayUrl: canvas.toDataURL('image/png'),
    };
  }

  const logo = await loadQrLogo();
  const backingSize = Math.round(QR_IMAGE_SIZE * QR_LOGO_BACKING_RATIO);
  const backingX = Math.round((QR_IMAGE_SIZE - backingSize) / 2);
  const backingY = backingX;
  const logoSize = Math.round(QR_IMAGE_SIZE * QR_LOGO_RATIO);
  const logoX = Math.round((QR_IMAGE_SIZE - logoSize) / 2);
  const logoY = logoX;

  context.save();
  context.shadowColor = 'rgba(15, 118, 110, 0.14)';
  context.shadowBlur = 18;
  context.shadowOffsetY = 6;
  context.fillStyle = '#ffffff';
  fillRoundedRect(
    context,
    backingX,
    backingY,
    backingSize,
    backingSize,
    Math.round(backingSize * 0.22),
  );
  context.restore();

  context.strokeStyle = '#bbf7d0';
  context.lineWidth = 4;
  fillRoundedRect(
    context,
    backingX,
    backingY,
    backingSize,
    backingSize,
    Math.round(backingSize * 0.22),
  );
  context.stroke();
  context.drawImage(logo, logoX, logoY, logoSize, logoSize);

  const outputPadding = 24;
  const outputSize = QR_IMAGE_SIZE + (outputPadding * 2);
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outputSize;
  outputCanvas.height = outputSize;
  const outputContext = outputCanvas.getContext('2d');

  if (!outputContext) {
    return {
      qrCanvas: canvas,
      displayUrl: canvas.toDataURL('image/png'),
    };
  }

  outputContext.drawImage(canvas, outputPadding, outputPadding);

  return {
    qrCanvas: canvas,
    displayUrl: outputCanvas.toDataURL('image/png'),
  };
}

async function createQrDownloadPosterDataUrl(input: {
  qrCanvas: HTMLCanvasElement;
  householdName: string;
  audienceLabel: string;
  matchedNames: string;
}) {
  const logo = await loadQrLogo();
  const poster = document.createElement('canvas');
  poster.width = QR_POSTER_WIDTH;
  poster.height = QR_POSTER_HEIGHT;
  const context = poster.getContext('2d');

  if (!context) {
    return input.qrCanvas.toDataURL('image/png');
  }

  context.fillStyle = '#ecfdf5';
  context.fillRect(0, 0, QR_POSTER_WIDTH, QR_POSTER_HEIGHT);

  context.fillStyle = '#ffffff';
  fillRoundedRect(context, 56, 56, QR_POSTER_WIDTH - 112, QR_POSTER_HEIGHT - 112, 44);
  context.strokeStyle = '#a7f3d0';
  context.lineWidth = 4;
  context.stroke();

  context.drawImage(logo, 96, 88, 88, 88);
  context.fillStyle = '#064e3b';
  context.font = '700 44px Arial, sans-serif';
  context.fillText('MSWDO Relief Distribution QR', 218, 114);
  context.fillStyle = '#0f766e';
  context.font = '600 24px Arial, sans-serif';
  context.fillText(`Present this code for ${input.audienceLabel.toLowerCase()} release`, 220, 154);

  context.save();
  context.shadowColor = 'rgba(15, 118, 110, 0.16)';
  context.shadowBlur = 30;
  context.shadowOffsetY = 12;
  context.fillStyle = '#ffffff';
  fillRoundedRect(context, 80, 230, QR_POSTER_WIDTH - 160, 1040, 36);
  context.restore();
  context.strokeStyle = '#bbf7d0';
  context.lineWidth = 4;
  fillRoundedRect(context, 80, 230, QR_POSTER_WIDTH - 160, 1040, 36);
  context.stroke();
  context.drawImage(input.qrCanvas, 120, 270, 960, 960);

  context.fillStyle = '#f0fdfa';
  fillRoundedRect(context, 80, 1320, QR_POSTER_WIDTH - 160, 220, 30);
  context.strokeStyle = '#99f6e4';
  context.lineWidth = 3;
  context.stroke();

  context.fillStyle = '#064e3b';
  context.font = '700 28px Arial, sans-serif';
  context.fillText('Household Account', 120, 1376);
  context.font = '600 30px Arial, sans-serif';
  drawWrappedText(context, input.householdName, 120, 1418, 960, 38, 2);

  context.fillStyle = '#115e59';
  context.font = '600 22px Arial, sans-serif';
  drawWrappedText(
    context,
    `Qualified members: ${input.matchedNames}`,
    120,
    1496,
    960,
    30,
    2,
  );

  return poster.toDataURL('image/png');
}

async function createQrImageUrls(input: {
  value: string;
  householdName: string;
  audienceLabel: string;
  matchedNames: string;
}) {
  const { qrCanvas, displayUrl } = await createBrandedQrCanvas(input.value);
  const downloadUrl = await createQrDownloadPosterDataUrl({
    qrCanvas,
    householdName: input.householdName,
    audienceLabel: input.audienceLabel,
    matchedNames: input.matchedNames,
  });

  return { displayUrl, downloadUrl };
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
  const [qrDownloadUrl, setQrDownloadUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (claimedRelease) {
      setQrPayload(null);
      setQrImageUrl('');
      setQrDownloadUrl('');
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

        const qrCodeValue = extractDistributionQrToken(payload.deepLink)?.token || payload.deepLink;
        const nextHouseholdName = payload.householdName || householdHeadName;
        const nextMatchedResidentNames = Array.isArray(payload.matchedResidentNames)
          ? payload.matchedResidentNames
          : matchedResidentNames;
        const nextMatchedNames = nextMatchedResidentNames.length > 0
          ? nextMatchedResidentNames.join(', ')
          : householdHeadName;
        const qrUrls = await createQrImageUrls({
          value: qrCodeValue,
          householdName: nextHouseholdName,
          audienceLabel,
          matchedNames: nextMatchedNames,
        });

        if (!cancelled) {
          setQrPayload({
            deepLink: payload.deepLink,
            householdName: nextHouseholdName,
            matchedResidentNames: nextMatchedResidentNames,
          });
          setQrImageUrl(qrUrls.displayUrl);
          setQrDownloadUrl(qrUrls.downloadUrl);
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

  if (!qrPayload || !qrImageUrl || !qrDownloadUrl) {
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
              href={qrDownloadUrl}
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
