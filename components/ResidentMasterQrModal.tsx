'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, IdCard, Printer, QrCode, ShieldCheck, Sparkles, UserCheck, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getBarangayLabel } from '@/lib/barangays';
import type { Household } from '@/lib/db/schema';

interface ResidentMasterQrModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  household: Household | null;
  familyMembersCount?: number;
  vulnerabilities?: {
    seniors?: number;
    infants?: number;
    pwds?: number;
    pregnant?: number;
  };
  onSimulateScan?: (household: Household) => void;
}

export default function ResidentMasterQrModal({
  open,
  onOpenChange,
  household,
  familyMembersCount = 1,
  vulnerabilities,
  onSimulateScan,
}: ResidentMasterQrModalProps) {
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    if (!open || !household) return;

    let active = true;
    const qrPayload = JSON.stringify({
      type: 'mswdo_resident_id',
      version: '1.0',
      hh_id: household.id,
      head_name: household.head_name,
      barangay: household.barangay_name || getBarangayLabel(household.barangay_id) || 'Cuambog',
      purok: household.purok_sitio,
      email: household.applicant_email,
      verified: true,
    });

    QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
      color: {
        dark: '#064e3b', // Deep emerald
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrUrl(url);
      })
      .catch((err) => console.error('Failed to generate resident Master Evac QR:', err));

    return () => {
      active = false;
    };
  }, [open, household]);

  if (!household) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-md rounded-[32px] border-slate-200 bg-white p-0 shadow-2xl overflow-hidden">
        {/* Top Official Banner */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 p-6 text-white text-center relative">
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
            Master Evacuation Pass (Resident QR)
          </DialogTitle>
          <DialogDescription className="text-xs text-emerald-100 mt-0.5">
            Permanent, offline-ready QR pass for household evacuation registration.
          </DialogDescription>
        </div>

        {/* Card Content */}
        <div className="p-6 text-center">
          <div className="rounded-3xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 p-6 shadow-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-xs">
              <ShieldCheck className="h-3 w-3" />
              Official Registered Household
            </span>

            <h3 className="mt-3 text-xl font-black text-slate-950">
              {household.head_name}
            </h3>
            <p className="text-xs font-semibold text-slate-600">
              Purok {household.purok_sitio}, Brgy. {household.barangay_name || getBarangayLabel(household.barangay_id) || 'Cuambog'}
            </p>

            <div className="mt-2 flex items-center justify-center gap-2 text-[11px] font-bold text-slate-500">
              <span>ID: <code className="rounded bg-slate-200/80 px-1.5 py-0.5 text-slate-900">{household.id.slice(0, 16)}</code></span>
              <span>·</span>
              <span className="text-emerald-800">{familyMembersCount} Members</span>
            </div>

            {/* QR Code Container */}
            <div className="mt-4 mx-auto flex h-52 w-52 items-center justify-center rounded-2xl border-2 border-emerald-200 bg-white p-3 shadow-md">
              {qrUrl ? (
                <img src={qrUrl} alt="Master Evac QR Code" className="h-full w-full object-contain" />
              ) : (
                <QrCode className="h-12 w-12 text-slate-400 animate-pulse" />
              )}
            </div>

            {/* Vulnerability sector badges */}
            {vulnerabilities && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {vulnerabilities.seniors ? (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    👴 {vulnerabilities.seniors} Senior
                  </span>
                ) : null}
                {vulnerabilities.infants ? (
                  <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                    👶 {vulnerabilities.infants} Infant
                  </span>
                ) : null}
                {vulnerabilities.pwds ? (
                  <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                    ♿ {vulnerabilities.pwds} PWD
                  </span>
                ) : null}
                {vulnerabilities.pregnant ? (
                  <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                    🤰 {vulnerabilities.pregnant} Pregnant
                  </span>
                ) : null}
              </div>
            )}

            <p className="mt-3 text-[11px] text-slate-500 italic">
              "Present this QR pass at any designated evacuation center registration desk for rapid check-in."
            </p>
          </div>

          {/* Action Buttons */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {onSimulateScan && (
              <button
                type="button"
                onClick={() => {
                  onSimulateScan(household);
                  onOpenChange(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow hover:bg-emerald-700 active:scale-95"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Check In Using This QR</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 active:scale-95"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Pass</span>
            </button>

            {qrUrl && (
              <a
                href={qrUrl}
                download={`Master_Evac_QR_${household.head_name.replace(/\s+/g, '_')}.png`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 active:scale-95"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download QR</span>
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
