'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  Award,
  BadgeCheck,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  HeartHandshake,
  Home,
  IdCard,
  MapPin,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getCurrentUser } from '@/lib/auth';
import { getHouseholds } from '@/lib/db/households';
import { getResidentsInHousehold } from '@/lib/db/residents';
import {
  calculateAge,
  getCurrentVulnerabilityFlagsMapForResidents,
} from '@/lib/db/vulnerability';
import { getPurokRiskProfile } from '@/lib/db/purok-risk-profiles';
import { resolveResidentActiveApprovedHousehold } from '@/lib/resident-households';
import type {
  Household,
  PurokRiskProfile,
  Resident,
  VulnerabilityFlags,
} from '@/lib/db/schema';

interface ResidentProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  household?: Household | null;
  resident?: Resident | null;
  flags?: VulnerabilityFlags | null;
  purokRiskProfile?: PurokRiskProfile | null;
}

function formatBirthdate(dateStr?: string) {
  if (!dateStr) return 'Wala gibutang';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('ceb-PH', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

export default function ResidentProfileModal({
  open,
  onOpenChange,
  household: initialHousehold,
  resident: initialResident,
  flags: initialFlags,
  purokRiskProfile: initialPurokProfile,
}: ResidentProfileModalProps) {
  const currentUser = getCurrentUser();
  const [household, setHousehold] = useState<Household | null>(initialHousehold ?? null);
  const [resident, setResident] = useState<Resident | null>(initialResident ?? null);
  const [flags, setFlags] = useState<VulnerabilityFlags | null>(initialFlags ?? null);
  const [purokProfile, setPurokProfile] = useState<PurokRiskProfile | null>(initialPurokProfile ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedId, setCopiedId] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Sync props if provided
  useEffect(() => {
    if (initialHousehold) {
      setHousehold(initialHousehold);
      setIsLoading(false);
    }
    if (initialResident) setResident(initialResident);
    if (initialFlags) setFlags(initialFlags);
    if (initialPurokProfile) setPurokProfile(initialPurokProfile);
  }, [initialHousehold, initialResident, initialFlags, initialPurokProfile]);

  // Load data if missing when modal opens
  useEffect(() => {
    if (!open) return;
    // If household is already available from props or previous fetch, no need to reload
    if (initialHousehold || household) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      try {
        const user = currentUser || getCurrentUser();
        if (!user) {
          if (isMounted) setIsLoading(false);
          return;
        }
        const households = await getHouseholds({
          applicant_user_id: user.id,
          applicant_email: user.email,
        });
        const activeHh = resolveResidentActiveApprovedHousehold(households);
        if (activeHh && isMounted) {
          setHousehold(activeHh);

          const [members, pProfile] = await Promise.all([
            getResidentsInHousehold(activeHh.id).catch(() => []),
            getPurokRiskProfile(activeHh.barangay_id, activeHh.purok_sitio).catch(() => undefined),
          ]);

          if (isMounted) {
            const head = members.find((m) => m.relationship_to_head?.toLowerCase() === 'head') || members[0] || null;
            setResident(head);
            setPurokProfile(pProfile || null);

            if (members.length > 0 && head) {
              const flagsMap = await getCurrentVulnerabilityFlagsMapForResidents(members, [activeHh]).catch(() => new Map());
              if (isMounted) {
                setFlags(flagsMap.get(head.id) || null);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load resident profile data:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [open, initialHousehold]);

  // Generate QR Code
  useEffect(() => {
    if (!open || !household) return;

    let cancelled = false;
    const qrPayload = JSON.stringify({
      type: 'mswdo_resident_id',
      version: '1.0',
      hh_id: household.id,
      head_name: household.head_name,
      barangay: household.barangay_name || 'Cuambog',
      purok: household.purok_sitio,
      email: currentUser?.email || household.applicant_email,
      verified: household.status === 'active' || household.registration_status === 'approved',
    });

    QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      width: 280,
      margin: 2,
      color: {
        dark: '#064e3b', // deep emerald
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => console.error('Failed to generate profile QR:', err));

    return () => {
      cancelled = true;
    };
  }, [open, household, currentUser]);

  const initials = useMemo(() => {
    const name = resident?.full_name || household?.head_name || currentUser?.email || 'R';
    return name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }, [resident, household, currentUser]);

  const age = useMemo(() => {
    if (!resident?.birthdate) return null;
    return calculateAge(resident.birthdate);
  }, [resident]);

  const formattedHouseholdId = useMemo(() => {
    if (!household?.id) return '';
    return household.id.startsWith('HH-') ? household.id : `HH-${household.id.slice(0, 8).toUpperCase()}`;
  }, [household]);

  function handleCopyId() {
    if (!formattedHouseholdId) return;
    void navigator.clipboard.writeText(formattedHouseholdId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  async function handleDownloadIdCard() {
    if (!household) return;
    setIsDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 500;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Card background gradient
      const grad = ctx.createLinearGradient(0, 0, 800, 500);
      grad.addColorStop(0, '#064e3b'); // emerald-900
      grad.addColorStop(0.5, '#042f2e'); // cyan-950
      grad.addColorStop(1, '#0f172a'); // slate-900
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(0, 0, 800, 500, 24);
      ctx.fill();

      // Top decorative stripe
      ctx.fillStyle = '#10b981';
      ctx.fillRect(0, 0, 800, 10);

      // Official Header
      ctx.fillStyle = '#a7f3d0';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('REPUBLIKA SA PILIPINAS · MUNISIPYO SA MABINI · DAVAO DE ORO', 40, 45);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 20px system-ui, sans-serif';
      ctx.fillText('MUNICIPAL SOCIAL WELFARE & DEVELOPMENT OFFICE (MSWDO)', 40, 75);

      ctx.fillStyle = '#6ee7b7';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('OPISYAL NGA DIGITAL RESIDENT ID PASS', 40, 95);

      // Separator
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, 110);
      ctx.lineTo(760, 110);
      ctx.stroke();

      // Resident Details Left
      ctx.fillStyle = '#a7f3d0';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('ULO SA PANIMALAY (HOUSEHOLD HEAD)', 40, 145);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 26px system-ui, sans-serif';
      ctx.fillText(household.head_name, 40, 178);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(`ID: ${formattedHouseholdId}`, 40, 208);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText(`Lugar: Purok ${household.purok_sitio}, Brgy. ${household.barangay_name || 'Cuambog'}, Mabini`, 40, 245);

      if (household.contact_number || resident?.contact_number) {
        ctx.fillText(`Telepono: ${household.contact_number || resident?.contact_number}`, 40, 275);
      }

      if (household.applicant_email) {
        ctx.fillText(`Email: ${household.applicant_email}`, 40, 305);
      }

      // Evacuation Site
      if (household.evacuation_site || purokProfile?.default_evacuation_site) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(
          `Dangpanan: ${household.evacuation_site || purokProfile?.default_evacuation_site}`,
          40,
          345,
        );
      }

      // Security Watermark / Stamp
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.beginPath();
      ctx.roundRect(40, 380, 220, 36, 18);
      ctx.fill();
      ctx.fillStyle = '#6ee7b7';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('✓ OPISYAL NGA REHISTRADO', 55, 403);

      // QR Code Right
      if (qrDataUrl) {
        const img = new Image();
        img.src = qrDataUrl;
        await new Promise((resolve) => {
          img.onload = resolve;
        });
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(560, 140, 200, 200, 16);
        ctx.fill();
        ctx.drawImage(img, 570, 150, 180, 180);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MSWDO Verification QR', 660, 360);
      }

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `MSWDO_Resident_ID_${household.head_name.replace(/\s+/g, '_')}.png`;
      a.click();
    } catch (err) {
      console.error('Failed to download ID card:', err);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[32px] border border-emerald-200/80 bg-white p-0 shadow-[0_30px_90px_-20px_rgba(4,47,46,0.35)]"
      >
        {/* Header Ribbon: DSWD & Republic branding */}
        <div className="relative overflow-hidden rounded-t-[32px] bg-gradient-to-r from-emerald-800 via-teal-800 to-cyan-950 px-6 py-6 text-white sm:px-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/20 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-cyan-400/20 blur-2xl" />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-md">
                <img src="/dswd-logo.png" alt="DSWD Logo" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200 sm:text-xs">
                  Republika sa Pilipinas · Munisipyo sa Mabini
                </p>
                <DialogTitle className="text-base font-black tracking-tight text-white sm:text-lg">
                  Opisyal nga Digital Resident ID & Profile
                </DialogTitle>
                <p className="text-[11px] font-semibold text-emerald-100/90">
                  Municipal Social Welfare and Development Office (MSWDO)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25 active:scale-95"
              aria-label="Close profile"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
              <p className="mt-4 text-sm font-bold">Gikuha ang impormasyon sa residente...</p>
            </div>
          ) : household ? (
            <div className="space-y-6">
              {/* Digital Resident ID Badge Card */}
              <div className="relative overflow-hidden rounded-3xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-cyan-50/50 p-6 shadow-sm">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                  {/* Avatar & Main Info */}
                  <div className="flex items-start gap-4">
                    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-xl font-black text-white shadow-md shadow-emerald-900/20">
                      {initials}
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-emerald-600 shadow">
                        <BadgeCheck className="h-4 w-4" />
                      </span>
                    </div>

                    <div>
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        Ulo sa Panimalay (Household Head)
                      </div>
                      <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                        {household.head_name}
                      </h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopyId}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/80 bg-white px-3 py-1 text-xs font-mono font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-50 active:scale-95"
                          title="I-click aron kopyahon ang ID"
                        >
                          {copiedId ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Na-kopya!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{formattedHouseholdId}</span>
                            </>
                          )}
                        </button>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          Opisyal nga Rehistrado
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* QR Code Container */}
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200/80 bg-white p-3 shadow-sm text-center">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="Resident Evac & Master QR"
                        className="h-28 w-28 rounded-lg object-contain"
                      />
                    ) : (
                      <div className="flex h-28 w-28 items-center justify-center bg-slate-100 rounded-lg">
                        <QrCode className="h-8 w-8 text-slate-400 animate-pulse" />
                      </div>
                    )}
                    <span className="mt-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                      Master Evac Pass
                    </span>
                    <span className="text-[9px] font-semibold text-slate-500">
                      Evac Center & ID
                    </span>
                  </div>
                </div>

                {/* Sectoral Badges Row */}
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-emerald-200/60 pt-4">
                  <span className="text-xs font-bold text-slate-500">Kwalipikasyon & Sektor:</span>
                  {flags?.is_4ps ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white shadow-sm">
                      <Award className="h-3 w-3" />
                      4Ps Beneficiary
                    </span>
                  ) : null}
                  {flags?.is_senior ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-black text-white shadow-sm">
                      Senior Citizen (60+)
                    </span>
                  ) : null}
                  {flags?.is_pwd ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-xs font-black text-white shadow-sm">
                      PWD {flags.pwd_type ? `(${flags.pwd_type})` : ''}
                    </span>
                  ) : null}
                  {flags?.is_pregnant ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1 text-xs font-black text-white shadow-sm">
                      Mabdos (Pregnant)
                    </span>
                  ) : null}
                  {flags?.is_indigent ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-700 px-3 py-1 text-xs font-black text-white shadow-sm">
                      Indigent Resident
                    </span>
                  ) : null}
                  {flags?.is_low_income ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-700 px-3 py-1 text-xs font-black text-white shadow-sm">
                      Low Income Household
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    MSWDO Verified
                  </span>
                </div>
              </div>

              {/* Two-Column Demographics and Household Info */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Column 1: Personal Info */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-black uppercase tracking-wider text-slate-700">
                    <User className="h-4 w-4 text-emerald-600" />
                    Personal nga Impormasyon
                  </div>
                  <dl className="mt-3 space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-slate-500 font-medium">Edad / Birthday:</dt>
                      <dd className="font-bold text-slate-900">
                        {age ? `${age} ka tuig` : ''} {resident?.birthdate ? `(${formatBirthdate(resident.birthdate)})` : 'Wala gibutang'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 font-medium">Kasarian (Gender):</dt>
                      <dd className="font-bold text-slate-900">
                        {resident?.gender === 'F' ? 'Babaye (Female)' : 'Lalaki (Male)'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 font-medium">Kahimtang (Civil Status):</dt>
                      <dd className="font-bold text-slate-900 capitalize">
                        {resident?.civil_status || 'Single / Not specified'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 font-medium">Trabaho / Propesyon:</dt>
                      <dd className="font-bold text-slate-900">
                        {resident?.occupation || 'Wala gibutang'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 font-medium">Numero sa Telepono:</dt>
                      <dd className="font-bold text-slate-900 font-mono">
                        {household.contact_number || resident?.contact_number || 'Walay contact number'}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Column 2: Panimalay & Komunidad */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-black uppercase tracking-wider text-slate-700">
                    <Home className="h-4 w-4 text-cyan-700" />
                    Panimalay & Komunidad
                  </div>
                  <dl className="mt-3 space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-slate-500 font-medium">Purok / Sitio:</dt>
                      <dd className="font-bold text-slate-900">
                        {household.purok_sitio.toLowerCase().startsWith('purok')
                          ? household.purok_sitio
                          : `Purok ${household.purok_sitio}`}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 font-medium">Barangay & Lungsod:</dt>
                      <dd className="font-bold text-slate-900">
                        {household.barangay_name || 'Cuambog'}, Mabini
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 font-medium">Miyembro sa Balay:</dt>
                      <dd className="font-bold text-slate-900">
                        <Link
                          href="/resident/household"
                          onClick={() => onOpenChange(false)}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                        >
                          Tan-awa ang Pamilya <ExternalLink className="h-3 w-3" />
                        </Link>
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 font-medium">Dangpanan sa Kalamidad:</dt>
                      <dd className="font-bold text-emerald-800 text-right">
                        {household.evacuation_site || purokProfile?.default_evacuation_site || 'Barangay Evacuation Center'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 font-medium">Email Account:</dt>
                      <dd className="font-bold text-slate-900 truncate max-w-[180px]">
                        {currentUser?.email || household.applicant_email}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Instructions banner: Dual QR clarity */}
              <div className="rounded-2xl border border-teal-200/80 bg-teal-50/70 p-4 text-xs text-teal-950 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-teal-900">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-teal-700" />
                  <span>Pamaagi sa Pag-gamit sa Imong mga QR Code:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] leading-relaxed">
                  <div className="rounded-xl bg-white/90 p-3 border border-teal-100 shadow-xs">
                    <p className="font-black text-emerald-900">
                      🏠 1. Master Evac & ID Pass (Kini nga QR)
                    </p>
                    <p className="mt-1 text-slate-600">
                      <strong>Permanente.</strong> Gamiton sa <strong>Evacuation Center Check-in</strong> inig baha o kalamidad aron ma-headcount dayon ang inyong pamilya, o sa Barangay Hall alang sa opisyal nga pag-ila.
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/90 p-3 border border-teal-100 shadow-xs">
                    <p className="font-black text-cyan-900">
                      🎟️ 2. Event Ayuda QR (Single-Use Claim)
                    </p>
                    <p className="mt-1 text-slate-600">
                      <strong>Kada distribusyon.</strong> Makita sa imong Portal Home kon naay aktibong food pack release nga apil ka. Ipakita kini sa relief desk aron ma-claim ang bugas ug ayuda.
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
                >
                  Isira / Close
                </button>

                <button
                  type="button"
                  onClick={() => void handleDownloadIdCard()}
                  disabled={isDownloading}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 px-6 text-sm font-black text-white shadow-md transition hover:from-emerald-700 hover:to-teal-800 active:scale-95 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {isDownloading ? 'Gi-download ang ID...' : 'I-download ang Digital ID Card'}
                </button>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-600">
              <p className="text-sm font-bold">Walay nakita nga aktibong rehistro sa panimalay.</p>
              <Link
                href="/households/register"
                onClick={() => onOpenChange(false)}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700"
              >
                Magparehistro sa Panimalay
              </Link>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
