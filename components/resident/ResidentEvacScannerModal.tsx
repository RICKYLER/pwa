'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  Loader2,
  Scan,
  ShieldCheck,
  Sparkles,
  SwitchCamera,
  TentTree,
  Users,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getBarangayLabel } from '@/lib/barangays';
import { getEvacuationCenters } from '@/lib/db/evacuation-centers';
import { checkInHouseholdToEvacuationCenter } from '@/lib/db/evacuees';
import { getResidentsInHousehold } from '@/lib/db/residents';
import { getCurrentVulnerabilityFlagsMapForResidents } from '@/lib/db/vulnerability';
import type { EvacuationCenter, Household, Resident, VulnerabilityFlags } from '@/lib/db/schema';

interface ResidentEvacScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  household: Household | null;
  onCheckInSuccess?: (record: any) => void;
}

export default function ResidentEvacScannerModal({
  open,
  onOpenChange,
  household,
  onCheckInSuccess,
}: ResidentEvacScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [detectedCenter, setDetectedCenter] = useState<EvacuationCenter | null>(null);
  const [centers, setCenters] = useState<EvacuationCenter[]>([]);
  const [members, setMembers] = useState<Resident[]>([]);
  const [flagsMap, setFlagsMap] = useState<Map<string, VulnerabilityFlags>>(new Map());
  const [checkInNotes, setCheckInNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Load evacuation centers and household members
  useEffect(() => {
    if (!open) {
      setDetectedCenter(null);
      setSuccessMessage('');
      setCheckInNotes('');
      return;
    }

    void getEvacuationCenters().then(setCenters);

    if (household?.id) {
      void getResidentsInHousehold(household.id)
        .then(async (loadedMembers) => {
          setMembers(loadedMembers);
          if (loadedMembers.length > 0) {
            const flags = await getCurrentVulnerabilityFlagsMapForResidents(loadedMembers, [household]).catch(
              () => new Map(),
            );
            setFlagsMap(flags);
          }
        })
        .catch((err) => console.error('Failed to load household members:', err));
    }
  }, [open, household]);

  // Start / Stop Camera Stream
  useEffect(() => {
    if (!open || detectedCenter) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
      return;
    }

    let active = true;
    let localStream: MediaStream | null = null;

    async function startCamera() {
      setIsInitializing(true);
      setCameraError('');
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Walay camera support kini nga browser.');
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (!active) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
        }
      } catch (err: any) {
        console.warn('Resident camera access issue:', err);
        if (active) {
          setCameraError(
            'Dili ma-access ang camera (kinahanglan ang camera permission o HTTPS). Pwede usab nimong gamiton ang mga Demo Centers sa ubos.',
          );
        }
      } finally {
        if (active) setIsInitializing(false);
      }
    }

    void startCamera();

    return () => {
      active = false;
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [open, facingMode, detectedCenter]);

  // Real-time Video Scanning Loop with jsQR
  useEffect(() => {
    if (!open || !stream || detectedCenter) return;

    let animationFrameId: number;
    const canvas = canvasRef.current || document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function tick() {
      if (!open || detectedCenter) return;

      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data.trim()) {
          handleDecodedPayload(code.data);
          return;
        }
      }

      animationFrameId = requestAnimationFrame(tick);
    }

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [open, stream, detectedCenter, centers]);

  // Process decoded QR from poster
  function handleDecodedPayload(raw: string) {
    let matched: EvacuationCenter | undefined;

    // 1. Try parsing JSON payload from Evacuation Center QR poster
    if (raw.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.center_id) {
          matched = centers.find(
            (c) => c.id === parsed.center_id || c.id.toLowerCase() === parsed.center_id.toLowerCase(),
          );
        }
        if (!matched && parsed.name) {
          matched = centers.find((c) => c.name.toLowerCase() === parsed.name.toLowerCase());
        }
      } catch {
        // Continue to string match
      }
    }

    // 2. Direct string or ID match
    if (!matched) {
      const q = raw.trim().toLowerCase();
      matched = centers.find(
        (c) => c.id.toLowerCase() === q || c.name.toLowerCase().includes(q),
      );
    }

    if (matched) {
      // Audio beep
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } catch {
        // audio context may be blocked by browser policy
      }

      setDetectedCenter(matched);
    } else {
      alert(`Dili kini opisyal nga Evacuation Center QR Code: "${raw}"`);
    }
  }

  // Calculate vulnerabilities
  function computeVulnerabilities() {
    let infants = 0;
    let children = 0;
    let seniors = 0;
    let pwds = 0;
    let pregnant = 0;

    members.forEach((m) => {
      const flags = flagsMap.get(m.id);
      if (flags?.is_infant) infants++;
      if (flags?.is_child) children++;
      if (flags?.is_senior) seniors++;
      if (flags?.is_pwd) pwds++;
      if (flags?.is_pregnant) pregnant++;
    });

    return { infants, children, seniors, pwds, pregnant };
  }

  // Submit Self Check-in
  async function handleConfirmCheckIn() {
    if (!household || !detectedCenter) return;

    setIsSubmitting(true);
    try {
      const vulns = computeVulnerabilities();
      const rec = await checkInHouseholdToEvacuationCenter({
        household_id: household.id,
        head_name: household.head_name,
        evacuation_center_id: detectedCenter.id,
        evacuation_center_name: detectedCenter.name,
        barangay_id: household.barangay_id,
        barangay_name: household.barangay_name || getBarangayLabel(household.barangay_id) || 'Cuambog',
        purok_sitio: household.purok_sitio,
        family_members_count: Math.max(1, members.length || 1),
        contact_number: household.contact_number,
        vulnerabilities: vulns,
        checked_in_by: 'Resident Self Check-in',
        notes: checkInNotes,
      });

      setSuccessMessage(`Malampusong naka-check-in sa ${detectedCenter.name}!`);
      if (onCheckInSuccess) onCheckInSuccess(rec);

      setTimeout(() => {
        onOpenChange(false);
      }, 2500);
    } catch (err) {
      console.error('Failed to submit resident self check-in:', err);
      alert('Adunay problema sa pag-check-in. Palihog sulayi pag-usab.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSwitchCamera() {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }

  const vulns = computeVulnerabilities();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-md overflow-hidden rounded-[32px] border-slate-200 bg-slate-950 p-0 text-white shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-sm font-black text-white">
                I-scan ang Evac Center QR Poster
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-400">
                Itumbok ang camera sa QR Poster sa entrance sa Gym / Center
              </DialogDescription>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Viewfinder OR Confirmation Screen */}
        {!detectedCenter ? (
          <div>
            <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-black">
              {/* Hidden Canvas */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Camera Video */}
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                autoPlay
                playsInline
                muted
              />

              {/* Scanning Target Viewport */}
              {!cameraError && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="absolute inset-0 bg-black/35" />
                  <div className="relative h-64 w-64 rounded-3xl border-2 border-emerald-400/80 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                    <div className="absolute -left-1 -top-1 h-6 w-6 rounded-tl-xl border-l-4 border-t-4 border-emerald-400" />
                    <div className="absolute -right-1 -top-1 h-6 w-6 rounded-tr-xl border-r-4 border-t-4 border-emerald-400" />
                    <div className="absolute -bottom-1 -left-1 h-6 w-6 rounded-bl-xl border-b-4 border-l-4 border-emerald-400" />
                    <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-br-xl border-b-4 border-r-4 border-emerald-400" />
                    <div className="absolute left-2 right-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-pulse" />
                  </div>
                </div>
              )}

              {/* Loading State */}
              {isInitializing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                  <p className="mt-3 text-xs font-bold text-slate-300">Gipaandar ang Camera...</p>
                </div>
              )}

              {/* Camera Error Fallback */}
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/95">
                  <AlertTriangle className="h-10 w-10 text-amber-400" />
                  <p className="mt-3 text-xs font-bold text-white max-w-xs leading-relaxed">
                    {cameraError}
                  </p>
                </div>
              )}

              {/* Switch Camera Button */}
              {!cameraError && stream && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition hover:bg-black/80 active:scale-95"
                  title="I-balhin ang camera (Front / Back)"
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Live Camera Scanner Status Footer */}
            <div className="bg-slate-900 px-5 py-3 text-xs flex items-center justify-between border-t border-white/10">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-bold text-slate-300">
                  Aktibo ang Live Camera Scanner
                </span>
              </div>
              <span className="text-[10px] font-semibold text-slate-500">
                Itumbok sa Opisyal nga QR Poster
              </span>
            </div>
          </div>
        ) : (
          /* Confirmation Screen when Center QR is Detected */
          <div className="p-6 bg-slate-950 text-white space-y-4">
            {successMessage ? (
              <div className="rounded-2xl bg-emerald-500/20 border-2 border-emerald-500 p-6 text-center space-y-2 animate-in zoom-in-95">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400 animate-bounce" />
                <h3 className="text-lg font-black text-white">{successMessage}</h3>
                <p className="text-xs text-emerald-200 font-medium">
                  Nakatala na kamo isip luwas ug nagpasilong sa opisyal nga roster sa Munisipyo.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-950/40 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-wider">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Na-detect ang Evacuation Center:</span>
                  </div>

                  <div>
                    <h3 className="text-xl font-black text-white">{detectedCenter.name}</h3>
                    <p className="text-xs text-slate-300">
                      Barangay {getBarangayLabel(detectedCenter.barangay_id)}, Mabini
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-emerald-300 font-bold">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Status: Open · Kapasidad: {detectedCenter.capacity || 50} ka Pamilya</span>
                  </div>
                </div>

                {/* Household Info */}
                {household && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2 text-xs">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Panimalay nga I-check-in:
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-base font-black text-white">{household.head_name}</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-black text-white">
                        <Users className="h-3 w-3" />
                        {members.length || 1} katawo
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Purok {household.purok_sitio}, Brgy. {household.barangay_name || 'Cuambog'}
                    </p>

                    {/* Sectoral Badges */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {vulns.seniors > 0 ? (
                        <span className="rounded bg-amber-400/20 text-amber-300 px-2 py-0.5 text-[10px] font-bold">
                          👴 {vulns.seniors} Senior
                        </span>
                      ) : null}
                      {vulns.infants > 0 ? (
                        <span className="rounded bg-rose-400/20 text-rose-300 px-2 py-0.5 text-[10px] font-bold">
                          👶 {vulns.infants} Infant
                        </span>
                      ) : null}
                      {vulns.pwds > 0 ? (
                        <span className="rounded bg-indigo-400/20 text-indigo-300 px-2 py-0.5 text-[10px] font-bold">
                          ♿ {vulns.pwds} PWD
                        </span>
                      ) : null}
                      {vulns.pregnant > 0 ? (
                        <span className="rounded bg-rose-400/20 text-rose-300 px-2 py-0.5 text-[10px] font-bold">
                          🤰 {vulns.pregnant} Mabdos
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* Optional Notes */}
                <div>
                  <label className="text-xs font-bold text-slate-300">
                    Espesyal nga Panginahanglan / Medikal nga Pahibalo (Optional):
                  </label>
                  <input
                    type="text"
                    value={checkInNotes}
                    onChange={(e) => setCheckInNotes(e.target.value)}
                    placeholder="e.g. Adunay maintenance medicine si lolo, infant milk..."
                    className="mt-1 w-full rounded-xl border border-white/20 bg-white/10 p-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>

                {/* Confirm Action Buttons */}
                <div className="pt-2 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setDetectedCenter(null)}
                    className="w-full sm:w-1/3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-xs font-bold text-slate-300 hover:bg-white/20"
                  >
                    I-scan Pag-usab
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmCheckIn()}
                    disabled={isSubmitting}
                    className="w-full sm:w-2/3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-xs font-black text-white shadow-lg transition hover:from-emerald-500 hover:to-teal-500 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Gisave ang Check-in...' : 'Kumpirmaha ang Pag-Check-in'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
