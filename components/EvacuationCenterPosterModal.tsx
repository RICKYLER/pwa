'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Printer, QrCode, ShieldCheck, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getBarangayLabel } from '@/lib/barangays';
import type { EvacuationCenter } from '@/lib/db/schema';

interface EvacuationCenterPosterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  center: EvacuationCenter | null;
}

export default function EvacuationCenterPosterModal({
  open,
  onOpenChange,
  center,
}: EvacuationCenterPosterModalProps) {
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    if (!open || !center) return;

    let active = true;
    const payload = JSON.stringify({
      type: 'mswdo_evacuation_center',
      center_id: center.id,
      name: center.name,
      barangay_id: center.barangay_id,
      municipality: 'Mabini, Davao de Oro',
    });

    QRCode.toDataURL(payload, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#042f2e',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrUrl(url);
      })
      .catch((err) => console.error('Failed to generate center poster QR:', err));

    return () => {
      active = false;
    };
  }, [open, center]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-md rounded-[32px] border-slate-200 bg-white p-0 shadow-2xl overflow-hidden">
        {/* Top Ribbon */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-cyan-950 p-6 text-white text-center relative">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-1 shadow-md">
            <img src="/dswd-logo.png" alt="DSWD Logo" className="h-full w-full object-contain" />
          </div>

          <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">
            Republic of the Philippines · Municipality of Mabini
          </p>
          <DialogTitle className="text-lg font-black text-white mt-0.5">
            Official Evacuation Center QR Pass
          </DialogTitle>
          <DialogDescription className="text-xs text-emerald-100 mt-1">
            Print and post this at the entrance or registration desk of the facility.
          </DialogDescription>
        </div>

        {/* Poster Body */}
        {center ? (
          <div className="p-6 text-center">
            <div className="rounded-3xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50/60 to-cyan-50/40 p-6 shadow-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-white shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                Designated Evacuation Facility
              </span>

              <h2 className="mt-3 text-2xl font-black text-slate-950">
                {center.name}
              </h2>
              <p className="text-xs font-bold text-slate-600 mt-0.5">
                Barangay {getBarangayLabel(center.barangay_id)}, Mabini
              </p>

              {/* Large QR Display */}
              <div className="mt-4 mx-auto flex h-52 w-52 items-center justify-center rounded-2xl border border-emerald-200 bg-white p-3 shadow-md">
                {qrUrl ? (
                  <img src={qrUrl} alt="Center QR Code" className="h-full w-full object-contain" />
                ) : (
                  <QrCode className="h-12 w-12 text-slate-400 animate-pulse" />
                )}
              </div>

              <div className="mt-4 text-xs text-slate-600 space-y-1">
                <p className="font-bold text-slate-900">
                  Estimated Capacity: {center.capacity || 50} Households
                </p>
                <p className="text-[11px] text-slate-500">
                  Status: <strong className="uppercase text-emerald-700">{center.status}</strong>
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white shadow hover:bg-slate-800 active:scale-95"
              >
                <Printer className="h-4 w-4" />
                <span>Print Poster</span>
              </button>

              {qrUrl && (
                <a
                  href={qrUrl}
                  download={`Evac_Center_${center.name.replace(/\s+/g, '_')}_QR.png`}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 active:scale-95"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Image</span>
                </a>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
