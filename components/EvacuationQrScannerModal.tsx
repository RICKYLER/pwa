'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  Scan,
  Sparkles,
  SwitchCamera,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface EvacuationQrScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanSuccess: (decodedText: string) => void;
}

export default function EvacuationQrScannerModal({
  open,
  onOpenChange,
  onScanSuccess,
}: EvacuationQrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [detectedSuccess, setDetectedSuccess] = useState(false);

  // Start / Stop Camera Stream
  useEffect(() => {
    if (!open) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
      setCameraError('');
      setDetectedSuccess(false);
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
        console.warn('Camera access issue:', err);
        if (active) {
          setCameraError(
            'Dili ma-access ang camera (kinahanglan ang camera permission o SSL). Pwede nimong gamiton ang Image Upload o Demo buttons sa ubos.',
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
  }, [open, facingMode]);

  // Real-time Video Scanning Loop with jsQR
  useEffect(() => {
    if (!open || !stream || detectedSuccess) return;

    let animationFrameId: number;
    const canvas = canvasRef.current || document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function tick() {
      if (!open || detectedSuccess) return;

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
          setDetectedSuccess(true);
          // Play quick audio beep if allowed
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
          } catch {
            // audio context may be blocked by browser policy
          }

          setTimeout(() => {
            onScanSuccess(code.data);
            onOpenChange(false);
          }, 400);
          return;
        }
      }

      animationFrameId = requestAnimationFrame(tick);
    }

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [open, stream, detectedSuccess, onScanSuccess, onOpenChange]);

  function handleSwitchCamera() {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-md overflow-hidden rounded-[32px] border-slate-200 bg-slate-950 p-0 text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <Scan className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-sm font-black text-white">
                Live Master QR Scanner
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-400">
                I-tumbok ang camera sa Master Evac QR sa residente
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

        {/* Viewfinder Area */}
        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-black">
          {/* Hidden Canvas for QR Extraction */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Video Stream */}
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            autoPlay
            playsInline
            muted
          />

          {/* Scanning Overlay Box & Laser Beam */}
          {!cameraError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {/* Darkened Border Vignette */}
              <div className="absolute inset-0 bg-black/40" />

              {/* Clear Target Viewport */}
              <div className="relative h-64 w-64 rounded-3xl border-2 border-emerald-400/80 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                {/* Corner Targets */}
                <div className="absolute -left-1 -top-1 h-6 w-6 rounded-tl-xl border-l-4 border-t-4 border-emerald-400" />
                <div className="absolute -right-1 -top-1 h-6 w-6 rounded-tr-xl border-r-4 border-t-4 border-emerald-400" />
                <div className="absolute -bottom-1 -left-1 h-6 w-6 rounded-bl-xl border-b-4 border-l-4 border-emerald-400" />
                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-br-xl border-b-4 border-r-4 border-emerald-400" />

                {/* Animated Scanning Laser */}
                {!detectedSuccess && (
                  <div className="absolute left-2 right-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-pulse" />
                )}

                {/* Success Indicator */}
                {detectedSuccess && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-emerald-600/80 text-white animate-in zoom-in-95">
                    <CheckCircle2 className="h-12 w-12 text-white animate-bounce" />
                    <p className="mt-2 text-xs font-black uppercase tracking-wider">
                      QR Code Na-detect!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Loading Camera State */}
          {isInitializing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
              <p className="mt-3 text-xs font-bold text-slate-300">
                Gipaandar ang Camera...
              </p>
            </div>
          )}

          {/* Camera Error Fallback View */}
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/95">
              <AlertTriangle className="h-10 w-10 text-amber-400" />
              <p className="mt-3 text-xs font-bold text-white max-w-xs leading-relaxed">
                {cameraError}
              </p>
            </div>
          )}

          {/* Switch Camera Button Overlay */}
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
              Live Camera Scanner Mode
            </span>
          </div>
          <span className="text-[10px] font-semibold text-slate-500">
            Itumbok sa Master Evac QR Pass
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
