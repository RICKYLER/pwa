import fs from 'node:fs';
import path from 'node:path';

const outputDir = path.join(process.cwd(), 'public', 'diagrams');
const outputFile = path.join(outputDir, 'register-process-flow.svg');

const canvas = {
  width: 2200,
  height: 1600,
  marginX: 70,
  phaseWidth: 240,
  phaseGap: 20,
  phaseTop: 340,
  phaseHeight: 108,
  stepsTop: 490,
};

const phases = [
  {
    title: ['Phase 1', 'Receive', 'Request'],
    color: '#fde68a',
    steps: [
      ['1.1', 'Accept POST', 'request'],
      ['1.2', 'Read JSON', 'body'],
      ['1.3', 'Start resident', 'registration', 'flow'],
    ],
  },
  {
    title: ['Phase 2', 'Validate', 'Input'],
    color: '#bfdbfe',
    steps: [
      ['2.1', 'Parse body with', 'registerSchema'],
      ['2.2', 'Check name,', 'email, and', 'password'],
      ['2.3', 'Validate', 'barangay', 'selection'],
    ],
  },
  {
    title: ['Phase 3', 'Handle Invalid', 'Input'],
    color: '#fecaca',
    steps: [
      ['3.1', 'Catch', 'ZodError'],
      ['3.2', 'Return first', 'validation', 'message'],
      ['3.3', 'Send 400', 'Bad Request'],
    ],
  },
  {
    title: ['Phase 4', 'Create', 'Account'],
    color: '#ddd6fe',
    steps: [
      ['4.1', 'Create resident', 'self-service', 'account'],
      ['4.2', 'Store returned', 'user record'],
      ['4.3', 'If creation', 'fails, return', '400 error'],
    ],
  },
  {
    title: ['Phase 5', 'Write Audit', 'Log'],
    color: '#fbcfe8',
    steps: [
      ['5.1', 'Log CREATE', 'action for', 'new user'],
      ['5.2', 'Mark source as', 'resident_', 'register'],
      ['5.3', 'Continue if', 'audit sync', 'fails'],
    ],
  },
  {
    title: ['Phase 6', 'Prepare', 'Verification'],
    color: '#a7f3d0',
    steps: [
      ['6.1', 'Create email', 'verification', 'token'],
      ['6.2', 'Resolve app', 'base URL'],
      ['6.3', 'Build verify', 'link with', 'token and', 'email'],
    ],
  },
  {
    title: ['Phase 7', 'Send', 'Email'],
    color: '#bae6fd',
    steps: [
      ['7.1', 'Send resident', 'verification', 'email'],
      ['7.2', 'Set sent flag', 'on success'],
      ['7.3', 'Capture error', 'message on', 'failure'],
    ],
  },
  {
    title: ['Phase 8', 'Return', 'Response'],
    color: '#d9f99d',
    steps: [
      ['8.1', 'Return user and', 'remoteUserId'],
      ['8.2', 'verification', 'Required =', 'true'],
      ['8.3', 'Include email', 'status and', 'error'],
      ['8.4', 'Send 201', 'Created'],
    ],
  },
];

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function shadowFilter() {
  return [
    '<defs>',
    '  <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">',
    '    <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#0f172a" flood-opacity="0.12" />',
    '  </filter>',
    '</defs>',
  ].join('\n');
}

function rect({ x, y, width, height, fill, stroke = '#334155', rx = 16, strokeWidth = 2, filter = '' }) {
  const filterAttr = filter ? ` filter="url(#${filter})"` : '';
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${filterAttr} />`;
}

function textBlock({ x, y, width, lines, fontSize = 26, lineHeight = 32, weight = 600, color = '#0f172a', align = 'middle' }) {
  const anchor = align === 'middle' ? 'middle' : 'start';
  const textX = align === 'middle' ? x + width / 2 : x;
  const startY = y + fontSize;
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<tspan x="${textX}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  return `<text x="${textX}" y="${startY}" text-anchor="${anchor}" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${color}">${tspans}</text>`;
}

function drawStep({ x, y, width, lines, accent }) {
  const lineCount = lines.length;
  const height = 34 + lineCount * 26 + 18;
  const box = rect({
    x,
    y,
    width,
    height,
    fill: '#ffffff',
    stroke: '#cbd5e1',
    strokeWidth: 2,
    filter: 'softShadow',
  });
  const accentBar = `<rect x="${x}" y="${y}" width="8" height="${height}" rx="8" fill="${accent}" />`;
  const label = textBlock({
    x: x + 24,
    y: y + 14,
    width: width - 48,
    lines,
    fontSize: 22,
    lineHeight: 26,
    weight: 600,
    color: '#1e293b',
    align: 'start',
  });

  return {
    height,
    svg: `${box}\n${accentBar}\n${label}`,
  };
}

function connector({ x1, y1, x2, y2 }) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="3" stroke-linecap="round" />`;
}

function buildDiagram() {
  const titleWidth = 1260;
  const titleHeight = 180;
  const titleX = (canvas.width - titleWidth) / 2;
  const titleY = 42;
  const phaseCenters = [];
  const content = [];

  content.push('<?xml version="1.0" encoding="UTF-8"?>');
  content.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">`,
  );
  content.push(shadowFilter());
  content.push(`<rect width="${canvas.width}" height="${canvas.height}" fill="#f8fafc" />`);
  content.push(`<rect x="24" y="24" width="${canvas.width - 48}" height="${canvas.height - 48}" rx="28" fill="none" stroke="#e2e8f0" stroke-width="2" />`);

  content.push(
    rect({
      x: titleX,
      y: titleY,
      width: titleWidth,
      height: titleHeight,
      fill: '#ffffff',
      stroke: '#1e293b',
      strokeWidth: 3,
      rx: 22,
      filter: 'softShadow',
    }),
  );
  content.push(
    textBlock({
      x: titleX,
      y: titleY + 36,
      width: titleWidth,
      lines: [
        'Resident Registration API Process Flow',
        'app/api/auth/register/route.ts',
      ],
      fontSize: 40,
      lineHeight: 48,
      weight: 700,
      color: '#111827',
      align: 'middle',
    }),
  );
  content.push(
    textBlock({
      x: titleX,
      y: titleY + 120,
      width: titleWidth,
      lines: [
        'Validation, account creation, audit logging, email verification, and response handling',
      ],
      fontSize: 22,
      lineHeight: 28,
      weight: 500,
      color: '#475569',
      align: 'middle',
    }),
  );

  phases.forEach((phase, index) => {
    const x = canvas.marginX + index * (canvas.phaseWidth + canvas.phaseGap);
    const y = canvas.phaseTop;
    const centerX = x + canvas.phaseWidth / 2;
    let stepY = canvas.stepsTop;
    const stepSvgs = [];

    phaseCenters.push(centerX);

    phase.steps.forEach((stepLines) => {
      const step = drawStep({
        x,
        y: stepY,
        width: canvas.phaseWidth,
        lines: stepLines,
        accent: phase.color,
      });

      stepSvgs.push(step.svg);
      stepY += step.height + 18;
    });

    content.push(
      rect({
        x,
        y,
        width: canvas.phaseWidth,
        height: canvas.phaseHeight,
        fill: '#ffffff',
        stroke: '#334155',
        strokeWidth: 2.5,
        rx: 18,
        filter: 'softShadow',
      }),
    );
    content.push(`<rect x="${x}" y="${y}" width="${canvas.phaseWidth}" height="18" rx="18" fill="${phase.color}" />`);
    content.push(
      textBlock({
        x,
        y: y + 16,
        width: canvas.phaseWidth,
        lines: phase.title,
        fontSize: 24,
        lineHeight: 28,
        weight: 700,
        color: '#0f172a',
        align: 'middle',
      }),
    );

    content.push(connector({ x1: centerX, y1: y + canvas.phaseHeight, x2: centerX, y2: canvas.stepsTop - 16 }));
    content.push(...stepSvgs);
  });

  const trunkY = 308;
  const titleBottomY = titleY + titleHeight;
  const firstCenter = phaseCenters[0];
  const lastCenter = phaseCenters[phaseCenters.length - 1];

  content.push(connector({ x1: canvas.width / 2, y1: titleBottomY, x2: canvas.width / 2, y2: trunkY }));
  content.push(connector({ x1: firstCenter, y1: trunkY, x2: lastCenter, y2: trunkY }));

  phaseCenters.forEach((centerX) => {
    content.push(connector({ x1: centerX, y1: trunkY, x2: centerX, y2: canvas.phaseTop }));
  });

  content.push(
    textBlock({
      x: 60,
      y: canvas.height - 86,
      width: canvas.width - 120,
      lines: [
        'Generated locally from the current registration route so the labels stay readable and presentation-ready.',
      ],
      fontSize: 20,
      lineHeight: 24,
      weight: 500,
      color: '#64748b',
      align: 'middle',
    }),
  );

  content.push('</svg>');

  return content.join('\n');
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, buildDiagram(), 'utf8');

console.log(`Wrote ${path.relative(process.cwd(), outputFile)}`);
