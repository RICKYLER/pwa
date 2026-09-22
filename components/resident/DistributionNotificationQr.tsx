'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Download, Loader2, PackageCheck, QrCode, ShieldCheck, Sparkles } from 'lucide-react';
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
const QR_LOGO_BACKING_RATIO = 0.16;
const QR_LOGO_RATIO = 0.10;
const QR_POSTER_WIDTH = 1200;
const QR_POSTER_HEIGHT = 1600;

function formatClaimedAt(value?: Date) {
  if (!value) {
    return 'Karon lang';
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

  return `Food-Pack-Pass-${safeName}.png`;
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

function strokeRoundedRect(
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
  context.stroke();
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
    context.fillText(line, x, y + index * lineHeight);
  });
}

async function createBrandedQrCanvas(value: string) {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, value, {
    errorCorrectionLevel: 'H',
    width: QR_IMAGE_SIZE,
    margin: 3,
    color: {
      dark: '#042f2e', // deep teal
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

  try {
    const logo = await loadQrLogo();
    const backingSize = Math.round(QR_IMAGE_SIZE * QR_LOGO_BACKING_RATIO);
    const backingX = Math.round((QR_IMAGE_SIZE - backingSize) / 2);
    const backingY = backingX;
    const logoSize = Math.round(QR_IMAGE_SIZE * QR_LOGO_RATIO);
    const logoX = Math.round((QR_IMAGE_SIZE - logoSize) / 2);
    const logoY = logoX;

    context.save();
    context.shadowColor = 'rgba(15, 118, 110, 0.2)';
    context.shadowBlur = 16;
    context.shadowOffsetY = 4;
    context.fillStyle = '#ffffff';
    fillRoundedRect(context, backingX, backingY, backingSize, backingSize, Math.round(backingSize * 0.24));
    context.restore();

    context.strokeStyle = '#6ee7b7';
    context.lineWidth = 4;
    strokeRoundedRect(context, backingX, backingY, backingSize, backingSize, Math.round(backingSize * 0.24));
    context.drawImage(logo, logoX, logoY, logoSize, logoSize);
  } catch {
    // Logo loading failed silently, canvas remains valid
  }

  const outputPadding = 24;
  const outputSize = QR_IMAGE_SIZE + outputPadding * 2;
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

  outputContext.fillStyle = '#ffffff';
  outputContext.fillRect(0, 0, outputSize, outputSize);
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
  const poster = document.createElement('canvas');
  poster.width = QR_POSTER_WIDTH;
  poster.height = QR_POSTER_HEIGHT;
  const context = poster.getContext('2d');

  if (!context) {
    return input.qrCanvas.toDataURL('image/png');
  }

  // Soft gradient background
  const bg = context.createLinearGradient(0, 0, 0, QR_POSTER_HEIGHT);
  bg.addColorStop(0, '#f0fdf4');
  bg.addColorStop(1, '#ecfeff');
  context.fillStyle = bg;
  context.fillRect(0, 0, QR_POSTER_WIDTH, QR_POSTER_HEIGHT);

  // Main Card Container
  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(15, 23, 42, 0.14)';
  context.shadowBlur = 36;
  context.shadowOffsetY = 16;
  fillRoundedRect(context, 60, 60, QR_POSTER_WIDTH - 120, QR_POSTER_HEIGHT - 120, 48);
  context.shadowColor = 'transparent';

  context.strokeStyle = '#a7f3d0';
  context.lineWidth = 4;
  strokeRoundedRect(context, 60, 60, QR_POSTER_WIDTH - 120, QR_POSTER_HEIGHT - 120, 48);

  // Header Banner
  context.fillStyle = '#042f2e';
  fillRoundedRect(context, 60, 60, QR_POSTER_WIDTH - 120, 160, 48);
  context.fillRect(60, 160, QR_POSTER_WIDTH - 120, 60);

  try {
    const logo = await loadQrLogo();
    context.drawImage(logo, 100, 85, 90, 90);
  } catch {
    // Ignore if logo fails to load
  }

  context.fillStyle = '#5eead4';
  context.font = 'bold 22px system-ui, sans-serif';
  context.textAlign = 'left';
  context.fillText('REPUBLIKA SA PILIPINAS · MUNISIPYO SA MABINI · MSWDO', 215, 115);

  context.fillStyle = '#ffffff';
  context.font = '900 36px system-ui, sans-serif';
  context.fillText('OPISYAL NGA FOOD PACK RELEASE QR PASS', 215, 160);

  // QR Code Frame
  const qrBoxSize = 920;
  const qrBoxX = (QR_POSTER_WIDTH - qrBoxSize) / 2;
  const qrBoxY = 260;

  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(15, 23, 42, 0.08)';
  context.shadowBlur = 24;
  context.shadowOffsetY = 8;
  fillRoundedRect(context, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 36);
  context.shadowColor = 'transparent';

  context.strokeStyle = '#34d399';
  context.lineWidth = 3;
  strokeRoundedRect(context, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 36);

  // Draw the QR Canvas directly centered inside
  const qrSize = 840;
  const qrX = (QR_POSTER_WIDTH - qrSize) / 2;
  const qrY = qrBoxY + (qrBoxSize - qrSize) / 2;
  context.drawImage(input.qrCanvas, qrX, qrY, qrSize, qrSize);

  // Beneficiary Info Footer
  context.fillStyle = '#f0fdf4';
  fillRoundedRect(context, 100, 1220, QR_POSTER_WIDTH - 200, 260, 32);
  context.strokeStyle = '#bbf7d0';
  context.lineWidth = 3;
  strokeRoundedRect(context, 100, 1220, QR_POSTER_WIDTH - 200, 260, 32);

  context.fillStyle = '#065f46';
  context.font = 'bold 22px system-ui, sans-serif';
  context.fillText('ULO SA PANIMALAY:', 140, 1270);
  context.fillStyle = '#0f172a';
  context.font = '900 36px system-ui, sans-serif';
  drawWrappedText(context, input.householdName, 140, 1315, 900, 42, 1);

  context.fillStyle = '#047857';
  context.font = 'bold 22px system-ui, sans-serif';
  context.fillText(`Target Release: ${input.audienceLabel}`, 140, 1375);

  context.fillStyle = '#475569';
  context.font = '600 20px system-ui, sans-serif';
  drawWrappedText(context, `Mga Kwalipikadong Sakop: ${input.matchedNames}`, 140, 1415, 900, 28, 2);

  context.fillStyle = '#64748b';
  context.font = '500 18px system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText('Ipakita kini nga QR code sa relief distribution desk. Paspas nga ma-scan bisan walay internet.', QR_POSTER_WIDTH / 2, 1530);

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

        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          deepLink?: string;
          householdName?: string;
          matchedResidentNames?: string[];
        } | null;

        if (!response.ok || !payload?.deepLink) {
          throw new Error(payload?.error || 'Dili ma-andam ang inyong event QR code.');
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
            loadError instanceof Error ? loadError.message : 'Dili ma-andam ang inyong event QR code.',
          );
        }
      }
    }

    void loadQr();

    return () => {
      cancelled = true;
    };
  }, [audienceLabel, claimedRelease, eventId, householdHeadName, matchedResidentNames]);

  // Already claimed UI: Premium Official Receipt View
  if (claimedRelease) {
    return (
      <div className="overflow-hidden rounded-[28px] border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-teal-50 to-white p-6 shadow-md text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-600 text-white shadow-lg">
          <PackageCheck className="h-10 w-10 animate-pulse" />
        </div>

        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          Opisyal nga Nakuha Na (Claimed)
        </div>

        <h3 className="mt-2 text-2xl font-black text-slate-950">Food Pack Released</h3>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          Malampusong nadawat na sa inyong panimalay ang package alang sa {audienceLabel.toLowerCase()}.
        </p>

        <div className="mt-5 mx-auto max-w-sm rounded-2xl border border-emerald-200 bg-white p-4 text-left shadow-sm">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Nidawat (Claimant):</span>
              <span className="font-bold text-slate-900">{claimedRelease.receivedByName || householdHeadName}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Petsa sa Pag-claim:</span>
              <span className="font-bold text-slate-900">{formatClaimedAt(claimedRelease.claimedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status sa Pass:</span>
              <span className="font-bold text-emerald-700">Sirado na (Used)</span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs font-medium text-slate-500">
          Kini nga QR code na-rekord na sa MSWDO system ug dili na magamit pag-usab.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-center text-sm font-semibold text-amber-900">
        {error}
      </div>
    );
  }

  if (!qrPayload || !qrImageUrl || !qrDownloadUrl) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-8 text-center text-sm text-emerald-900">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="mt-3 font-bold">Gi-andam ang inyong opisyal nga Event QR Code...</p>
        <p className="mt-1 text-xs text-slate-500">Palihog huwat kadiyot samtang gina-verify ang inyong record.</p>
      </div>
    );
  }

  const matchedNames = qrPayload.matchedResidentNames.length > 0
    ? qrPayload.matchedResidentNames.join(', ')
    : householdHeadName;
  const downloadFileName = toQrDownloadFileName(qrPayload.householdName);

  return (
    <div className="overflow-hidden rounded-[32px] border-2 border-emerald-300 bg-gradient-to-b from-emerald-50/60 via-white to-teal-50/40 p-6 shadow-xl text-center">
      {/* Official Civic Badge */}
      <div className="flex items-center justify-center gap-2">
        <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-emerald-900">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          Aktibo · Andam Na I-scan sa Release Desk
        </span>
      </div>

      <h3 className="mt-3 text-xl font-black text-slate-950 sm:text-2xl">
        Opisyal nga Food Pack Claim Pass
      </h3>
      <p className="mt-1 text-xs font-semibold text-slate-600">
        Ipakita kini nga QR code sa MSWDO volunteer aron makuha ang inyong relief package.
      </p>

      {/* Prominent High-Resolution QR Card */}
      <div className="mt-5 flex justify-center">
        <div className="relative rounded-[28px] border-4 border-emerald-300 bg-white p-4 shadow-[0_18px_40px_-16px_rgba(5,150,105,0.35)] transition-transform hover:scale-[1.02]">
          <Image
            src={qrImageUrl}
            alt={`Food Pack Distribution QR code for ${qrPayload.householdName}`}
            width={280}
            height={280}
            className="h-64 w-64 sm:h-72 sm:w-72 rounded-2xl object-contain"
            unoptimized
          />
        </div>
      </div>

      {/* Household & Beneficiary Details Card */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm">
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap justify-between gap-1 border-b border-slate-100 pb-2">
            <span className="font-semibold text-slate-500">Ulo sa Panimalay:</span>
            <span className="font-black text-slate-950">{qrPayload.householdName}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-1 border-b border-slate-100 pb-2">
            <span className="font-semibold text-slate-500">Target Release:</span>
            <span className="font-bold text-emerald-800">{audienceLabel}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-1">
            <span className="font-semibold text-slate-500">Mga Kwalipikadong Sakop:</span>
            <span className="font-semibold text-slate-800 text-right">{matchedNames}</span>
          </div>
        </div>
      </div>

      {/* Download / Save Button */}
      <div className="mt-5 flex flex-col gap-2.5">
        <a
          href={qrDownloadUrl}
          download={downloadFileName}
          className="inline-flex h-13 items-center justify-center gap-2.5 rounded-2xl bg-emerald-700 px-6 text-sm font-black text-white shadow-lg transition hover:bg-emerald-800 active:scale-98"
          aria-label={`Download QR code for ${qrPayload.householdName}`}
        >
          <Download className="h-5 w-5 text-emerald-200" />
          I-download / I-save sa Litrato (HD Poster)
        </a>
      </div>

      {/* Elder Friendly Reminder */}
      <div className="mt-4 rounded-xl bg-emerald-50/80 border border-emerald-200/80 p-3 text-[11px] font-medium leading-relaxed text-emerald-900">
        💡 <strong>Pahinumdom para sa Pamilya:</strong> Mahimo kining i-screenshot o i-save daan sa inyong telepono aron
        ma-ablihan ug ma-scan bisan walay internet o signal sa distribution center.
      </div>
    </div>
  );
}
