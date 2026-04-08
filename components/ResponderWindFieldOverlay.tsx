'use client';

import { useEffect, useMemo, useRef } from 'react';

interface WindSurfaceSample {
  windSpeed: number | null;
  windDirection: number | null;
}

interface ResponderWindFieldOverlayProps {
  visible: boolean;
  width: number;
  height: number;
  rows: number;
  cols: number;
  samples: WindSurfaceSample[];
}

interface VectorPoint {
  vx: number;
  vy: number;
  speed: number;
}

interface Particle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  speed: number;
  color: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toFlowVector(speedKph: number | null, directionDeg: number | null): VectorPoint {
  const safeSpeed = speedKph ?? 0;
  const toDirection = directionDeg === null ? 180 : (directionDeg + 180) % 360;
  const radians = ((toDirection - 90) * Math.PI) / 180;
  const magnitude = clamp(safeSpeed / 28, 0, 2.6);

  return {
    vx: Math.cos(radians) * magnitude,
    vy: Math.sin(radians) * magnitude,
    speed: safeSpeed,
  };
}

function mixNumber(from: number, to: number, amount: number) {
  return from + ((to - from) * amount);
}

function interpolateVectors(
  topLeft: VectorPoint,
  topRight: VectorPoint,
  bottomLeft: VectorPoint,
  bottomRight: VectorPoint,
  tx: number,
  ty: number,
): VectorPoint {
  const top = {
    vx: mixNumber(topLeft.vx, topRight.vx, tx),
    vy: mixNumber(topLeft.vy, topRight.vy, tx),
    speed: mixNumber(topLeft.speed, topRight.speed, tx),
  };
  const bottom = {
    vx: mixNumber(bottomLeft.vx, bottomRight.vx, tx),
    vy: mixNumber(bottomLeft.vy, bottomRight.vy, tx),
    speed: mixNumber(bottomLeft.speed, bottomRight.speed, tx),
  };

  return {
    vx: mixNumber(top.vx, bottom.vx, ty),
    vy: mixNumber(top.vy, bottom.vy, ty),
    speed: mixNumber(top.speed, bottom.speed, ty),
  };
}

function resolveStrokeColor(speed: number) {
  if (speed < 4) return '#4fc3f7';
  if (speed < 11) return '#26c6da';
  if (speed < 18) return '#66bb6a';
  if (speed < 29) return '#d4e157';
  if (speed < 40) return '#ffca28';
  if (speed < 50) return '#ffa726';
  if (speed < 65) return '#ef5350';
  return '#b71c1c';
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const safe = normalized.length === 3
    ? normalized.split('').map((value) => `${value}${value}`).join('')
    : normalized;
  const opacity = Math.round(clamp(alpha, 0, 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${safe}${opacity}`;
}

export default function ResponderWindFieldOverlay({
  visible,
  width,
  height,
  rows,
  cols,
  samples,
}: ResponderWindFieldOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vectors = useMemo(() => samples.map((sample) => (
    toFlowVector(sample.windSpeed, sample.windDirection)
  )), [samples]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible || width <= 0 || height <= 0 || rows < 2 || cols < 2) {
      return undefined;
    }

    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const particleCount = clamp(Math.round((width * height) / 5600), 180, 560);
    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: 0,
      y: 0,
      age: 0,
      maxAge: 0,
      speed: 0,
      color: resolveStrokeColor(0),
    }));

    function resetParticle(index: number) {
      const seedX = Math.random() * width;
      const seedY = Math.random() * height;
      const field = sampleField(seedX, seedY);
      particles[index] = {
        x: seedX,
        y: seedY,
        age: Math.random() * 24,
        maxAge: 56 + Math.random() * 92,
        speed: 1.1 + (field.speed / 16) + (Math.random() * 1.4),
        color: resolveStrokeColor(field.speed),
      };
    }

    function sampleField(x: number, y: number) {
      const safeX = clamp(x, 0, width);
      const safeY = clamp(y, 0, height);
      const sourceX = (safeX / Math.max(width, 1)) * (cols - 1);
      const sourceY = (safeY / Math.max(height, 1)) * (rows - 1);
      const col0 = Math.floor(sourceX);
      const row0 = Math.floor(sourceY);
      const col1 = Math.min(cols - 1, col0 + 1);
      const row1 = Math.min(rows - 1, row0 + 1);
      const tx = sourceX - col0;
      const ty = sourceY - row0;
      const topLeft = vectors[(row0 * cols) + col0] ?? toFlowVector(0, 0);
      const topRight = vectors[(row0 * cols) + col1] ?? topLeft;
      const bottomLeft = vectors[(row1 * cols) + col0] ?? topLeft;
      const bottomRight = vectors[(row1 * cols) + col1] ?? topLeft;
      return interpolateVectors(topLeft, topRight, bottomLeft, bottomRight, tx, ty);
    }

    particles.forEach((_, index) => resetParticle(index));

    let animationFrame = 0;
    let lastTime = performance.now();

    const animate = (time: number) => {
      const delta = Math.min(32, time - lastTime || 16);
      lastTime = time;

      context.clearRect(0, 0, width, height);
      context.lineWidth = 2.1;
      context.lineCap = 'round';

      particles.forEach((particle, index) => {
        if (particle.age >= particle.maxAge) {
          resetParticle(index);
        }

        const field = sampleField(particle.x, particle.y);
        const previousX = particle.x;
        const previousY = particle.y;
        const turbulence = clamp(field.speed / 500, 0.006, 0.08);
        const noiseX = (Math.random() - 0.5) * turbulence;
        const noiseY = (Math.random() - 0.5) * turbulence;
        const drift = (delta / 16) * particle.speed * 3.1;
        particle.x += (field.vx * drift) + noiseX;
        particle.y += (field.vy * drift) + noiseY;
        particle.age += delta / 16;
        particle.color = resolveStrokeColor(field.speed);

        if (
          particle.x < -24
          || particle.x > width + 24
          || particle.y < -24
          || particle.y > height + 24
        ) {
          resetParticle(index);
          return;
        }

        const life = particle.age / particle.maxAge;
        const alpha = life < 0.2
          ? life / 0.2
          : life > 0.82
            ? 1 - ((life - 0.82) / 0.18)
            : 1;
        const tailLength = 14 + (particle.speed * 10);
        const tailX = previousX - (field.vx * tailLength);
        const tailY = previousY - (field.vy * tailLength);
        const strokeAlpha = Math.max(0.28, alpha * 0.95);

        context.shadowBlur = 0;
        context.strokeStyle = withAlpha('#0f172a', Math.max(0.16, strokeAlpha * 0.32));
        context.lineWidth = 3.4;
        context.beginPath();
        context.moveTo(tailX, tailY);
        context.lineTo(particle.x, particle.y);
        context.stroke();

        context.shadowBlur = 8;
        context.shadowColor = withAlpha(particle.color, Math.max(0.2, strokeAlpha * 0.36));
        context.strokeStyle = withAlpha(particle.color, strokeAlpha);
        context.lineWidth = 2.1;
        context.beginPath();
        context.moveTo(tailX, tailY);
        context.lineTo(particle.x, particle.y);
        context.stroke();

        context.fillStyle = withAlpha(particle.color, Math.max(0.35, strokeAlpha));
        context.beginPath();
        context.arc(particle.x, particle.y, 1.25, 0, Math.PI * 2);
        context.fill();
      });

      context.shadowBlur = 0;
      context.shadowColor = 'transparent';

      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [cols, height, rows, vectors, visible, width]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 z-[410] ${visible ? 'block' : 'hidden'}`}
      aria-hidden="true"
    />
  );
}
