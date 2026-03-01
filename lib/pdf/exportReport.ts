// lib/pdf/exportReport.ts
// Dynamically-imported so jsPDF never runs on the server

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Brand colours ─────────────────────────────────────────────────────────────
const PRIMARY = [79, 70, 229] as [number, number, number];  // indigo-600
const PRIMARY_D = [55, 48, 163] as [number, number, number];  // indigo-800
const ACCENT = [16, 185, 129] as [number, number, number];  // emerald-500
const ROSE = [239, 68, 68] as [number, number, number];  // red-500
const AMBER = [245, 158, 11] as [number, number, number];  // amber-500
const SLATE_900 = [15, 23, 42] as [number, number, number];
const SLATE_600 = [71, 85, 105] as [number, number, number];
const SLATE_400 = [148, 163, 184] as [number, number, number];
const WHITE = [255, 255, 255] as [number, number, number];

function hex(rgb: [number, number, number]) { return { r: rgb[0], g: rgb[1], b: rgb[2] }; }

// ─── Helpers ────────────────────────────────────────────────────────────────────
function pct(value: number, total: number) {
    if (!total) return '0.0%';
    return ((value / total) * 100).toFixed(1) + '%';
}

// ─── Main export function ───────────────────────────────────────────────────────
export function exportMonthlyReportPDF(stats: any, barangayId: string) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const today = new Date();
    const monthYear = today.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    const generated = today.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const adultsCount = Math.max(0, stats.total_population - stats.children_count - stats.seniors_count);
    const avgSize = stats.total_households > 0
        ? (stats.total_population / stats.total_households).toFixed(1) : '0';

    // ── Header band ──────────────────────────────────────────────────────────────
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, W, 50, 'F');

    // Subtle dot pattern overlay
    doc.setFillColor(255, 255, 255);
    doc.setGState(new (doc as any).GState({ opacity: 0.05 }));
    for (let x = 8; x < W; x += 12) {
        for (let y = 4; y < 50; y += 12) {
            doc.circle(x, y, 0.8, 'F');
        }
    }
    doc.setGState(new (doc as any).GState({ opacity: 1 }));

    // Organization tag
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    doc.text('MSWDO · HOUSEHOLD CENSUS MANAGEMENT SYSTEM', W / 2, 13, { align: 'center' });

    // Title
    doc.setFontSize(22);
    doc.text('Monthly Demographic Report', W / 2, 26, { align: 'center' });

    // Sub-tag
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(199, 210, 254); // indigo-200
    doc.text(monthYear, W / 2, 34, { align: 'center' });
    if (barangayId) {
        doc.setFontSize(8.5);
        doc.text(barangayId, W / 2, 40, { align: 'center' });
    }

    // Thin accent stripe under header
    doc.setFillColor(...ACCENT);
    doc.rect(0, 50, W, 2.5, 'F');

    // ── Section: Population Summary ───────────────────────────────────────────────
    let y = 62;
    sectionTitle(doc, 'POPULATION SUMMARY', y);
    y += 7;

    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [['Metric', 'Value']],
        body: [
            ['Total Registered Households', stats.total_households.toLocaleString()],
            ['Total Population', stats.total_population.toLocaleString()],
            ['Average Household Size', avgSize + ' members'],
        ],
        theme: 'grid',
        headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 9, textColor: SLATE_900 },
        columnStyles: {
            0: { cellWidth: 110, halign: 'left', fontStyle: 'normal' },
            1: { cellWidth: 60, halign: 'center', fontStyle: 'bold' },
        },
        alternateRowStyles: { fillColor: [241, 245, 249] },
    });

    // ── Section: Age Distribution ─────────────────────────────────────────────────
    y = (doc as any).lastAutoTable.finalY + 10;
    sectionTitle(doc, 'AGE DISTRIBUTION', y);
    y += 7;

    const total = stats.total_population;
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [['Age Group', 'Count', '% of Population', 'Visual']],
        body: [
            ['Children (0–17)', stats.children_count, pct(stats.children_count, total), ''],
            ['Adults (18–59)', adultsCount, pct(adultsCount, total), ''],
            ['Seniors (60+)', stats.seniors_count, pct(stats.seniors_count, total), ''],
            ['TOTAL', total, '100.0%', ''],
        ],
        theme: 'grid',
        headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 9, textColor: SLATE_900 },
        columnStyles: {
            0: { cellWidth: 68 },
            1: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
            2: { cellWidth: 40, halign: 'center' },
            3: { cellWidth: 32, halign: 'center' },
        },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        didDrawCell: (data: any) => {
            // Draw mini progress bar in the Visual column
            if (data.column.index === 3 && data.section === 'body' && data.row.index < 3) {
                const rowData = [stats.children_count, adultsCount, stats.seniors_count];
                const colors: [number, number, number][] = [
                    [99, 102, 241],  // indigo
                    [16, 185, 129],  // emerald
                    [245, 158, 11],  // amber
                ];
                const val = rowData[data.row.index];
                const ratio = total > 0 ? val / total : 0;
                const bx = data.cell.x + 2;
                const bw = (data.cell.width - 4) * ratio;
                const bh = 3.5;
                const by = data.cell.y + (data.cell.height - bh) / 2;
                doc.setFillColor(...colors[data.row.index]);
                doc.roundedRect(bx, by, Math.max(bw, 0.5), bh, 1, 1, 'F');
            }
        },
        willDrawCell: (data: any) => {
            // Bold + coloured last row (TOTAL)
            if (data.row.index === 3) {
                doc.setFillColor(...PRIMARY_D);
                doc.setTextColor(...WHITE);
            }
        },
    });

    // ── Section: Vulnerable Groups ────────────────────────────────────────────────
    y = (doc as any).lastAutoTable.finalY + 10;
    sectionTitle(doc, 'VULNERABLE GROUPS', y);
    y += 7;

    const vulnGroups = [
        ['Persons with Disabilities (PWD)', stats.pwd_count, pct(stats.pwd_count, total)],
        ['Pregnant Women', stats.pregnant_count, pct(stats.pregnant_count, total)],
        ['Chronic Illness', stats.chronic_count, pct(stats.chronic_count, total)],
        ['Low-Income Families', stats.low_income_count ?? 0, pct(stats.low_income_count ?? 0, stats.total_households)],
    ];

    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [['Vulnerable Group', 'Count', '% of Population']],
        body: vulnGroups,
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38], textColor: WHITE, fontStyle: 'bold', fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 9, textColor: SLATE_900 },
        columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
            2: { cellWidth: 40, halign: 'center' },
        },
        alternateRowStyles: { fillColor: [255, 241, 242] },
    });

    // ── Footer ───────────────────────────────────────────────────────────────────
    const footerY = H - 14;
    doc.setFillColor(...PRIMARY);
    doc.rect(0, footerY - 2, W, 16, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    doc.text('MSWDO Household Census Management System  ·  CONFIDENTIAL', 14, footerY + 4);
    doc.text(`Generated: ${generated}`, W - 14, footerY + 4, { align: 'right' });

    // Page number
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    doc.text('Page 1 of 1', W / 2, footerY + 4, { align: 'center' });

    // ── Save ──────────────────────────────────────────────────────────────────────
    const filename = `MSWDO_Monthly_Report_${today.getFullYear()}_${String(today.getMonth() + 1).padStart(2, '0')}.pdf`;
    doc.save(filename);
}

// ─── Section title helper ────────────────────────────────────────────────────────
function sectionTitle(doc: jsPDF, text: string, y: number, color: [number, number, number] = PRIMARY) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y - 4, W - 28, 9, 'F');
    doc.setFillColor(...color);
    doc.rect(14, y - 4, 3, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...color);
    doc.text(text, 21, y + 1.5);
}

// ─── Reusable footer painter ─────────────────────────────────────────────────────
function drawFooter(doc: jsPDF, generated: string, color: [number, number, number]) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const footerY = H - 14;
    doc.setFillColor(...color);
    doc.rect(0, footerY - 2, W, 16, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    doc.text('MSWDO Household Census Management System  ·  CONFIDENTIAL', 14, footerY + 4);
    doc.text(`Generated: ${generated}`, W - 14, footerY + 4, { align: 'right' });
    doc.text(`Page ${(doc as any).internal.getCurrentPageInfo().pageNumber}`, W / 2, footerY + 4, { align: 'center' });
}

// ─── Reusable header painter ────────────────────────────────────────────────────
function drawHeader(doc: jsPDF, title: string, subtitle: string, barangayId: string, color: [number, number, number], accent: [number, number, number]) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(...color);
    doc.rect(0, 0, W, 50, 'F');
    doc.setFillColor(255, 255, 255);
    doc.setGState(new (doc as any).GState({ opacity: 0.05 }));
    for (let x = 8; x < W; x += 12) for (let y = 4; y < 50; y += 12) doc.circle(x, y, 0.8, 'F');
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    doc.text('MSWDO · HOUSEHOLD CENSUS MANAGEMENT SYSTEM', W / 2, 13, { align: 'center' });
    doc.setFontSize(22);
    doc.text(title, W / 2, 26, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(253, 164, 175); // rose-300ish
    doc.text(subtitle, W / 2, 34, { align: 'center' });
    if (barangayId) { doc.setFontSize(8.5); doc.text(barangayId, W / 2, 40, { align: 'center' }); }
    doc.setFillColor(...accent);
    doc.rect(0, 50, W, 2.5, 'F');
}

// ─── Vulnerable Groups PDF ───────────────────────────────────────────────────────
export function exportVulnerableReportPDF(stats: any, topPuroks: { purok: string; vulnerable_count: number }[], barangayId: string) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const today = new Date();
    const monthYear = today.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    const generated = today.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const ROSE_H: [number, number, number] = [225, 29, 72];
    const ROSE_A: [number, number, number] = [251, 113, 133];
    const total = stats.total_population || 0;

    drawHeader(doc, 'Vulnerable Groups Summary', monthYear, barangayId, ROSE_H, ROSE_A);

    let y = 62;
    sectionTitle(doc, 'OVERVIEW', y, ROSE_H);
    y += 7;

    autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 },
        head: [['Metric', 'Value']],
        body: [
            ['Total Population', total.toLocaleString()],
            ['Total Vulnerable Persons', (stats.children_count + stats.seniors_count + stats.pwd_count + stats.pregnant_count + stats.chronic_count).toLocaleString()],
            ['% Vulnerable', total > 0 ? (((stats.children_count + stats.seniors_count + stats.pwd_count + stats.pregnant_count + stats.chronic_count) / total) * 100).toFixed(1) + '%' : '0%'],
        ],
        theme: 'grid',
        headStyles: { fillColor: ROSE_H, textColor: WHITE, fontStyle: 'bold', fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 9, textColor: SLATE_900 },
        columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 60, halign: 'center', fontStyle: 'bold' } },
        alternateRowStyles: { fillColor: [255, 241, 242] },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
    sectionTitle(doc, 'BREAKDOWN BY CATEGORY', y, ROSE_H);
    y += 7;

    const vulnRows = [
        ['Children (0–17)', stats.children_count, pct(stats.children_count, total), ''],
        ['Senior Citizens (60+)', stats.seniors_count, pct(stats.seniors_count, total), ''],
        ['Persons with Disabilities', stats.pwd_count, pct(stats.pwd_count, total), ''],
        ['Pregnant Women', stats.pregnant_count, pct(stats.pregnant_count, total), ''],
        ['Chronic Illness', stats.chronic_count, pct(stats.chronic_count, total), ''],
        ['Low-Income Families', stats.low_income_count ?? 0, pct(stats.low_income_count ?? 0, stats.total_households), ''],
    ];

    const barColors: [number, number, number][] = [
        [99, 102, 241], [245, 158, 11], [239, 68, 68],
        [236, 72, 153], [168, 85, 247], [245, 158, 11],
    ];

    autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 },
        head: [['Vulnerable Group', 'Count', '% of Population', 'Visual']],
        body: vulnRows,
        theme: 'grid',
        headStyles: { fillColor: ROSE_H, textColor: WHITE, fontStyle: 'bold', fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 9, textColor: SLATE_900 },
        columnStyles: { 0: { cellWidth: 74 }, 1: { cellWidth: 26, halign: 'center', fontStyle: 'bold' }, 2: { cellWidth: 36, halign: 'center' }, 3: { cellWidth: 34 } },
        alternateRowStyles: { fillColor: [255, 241, 242] },
        didDrawCell: (data: any) => {
            if (data.column.index === 3 && data.section === 'body') {
                const counts = [stats.children_count, stats.seniors_count, stats.pwd_count, stats.pregnant_count, stats.chronic_count, stats.low_income_count ?? 0];
                const val = counts[data.row.index] ?? 0;
                const ref = total > 0 ? total : 1;
                const ratio = val / ref;
                const bx = data.cell.x + 2; const bh = 3.5;
                const bw = Math.max((data.cell.width - 4) * ratio, 0.5);
                const by = data.cell.y + (data.cell.height - bh) / 2;
                if (data.row.index < barColors.length) {
                    doc.setFillColor(...barColors[data.row.index]);
                    doc.roundedRect(bx, by, bw, bh, 1, 1, 'F');
                }
            }
        },
    });

    if (topPuroks.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10;
        sectionTitle(doc, 'TOP PUROKS BY VULNERABILITY', y, ROSE_H);
        y += 7;
        autoTable(doc, {
            startY: y, margin: { left: 14, right: 14 },
            head: [['Rank', 'Purok / Sitio', 'Vulnerable Count']],
            body: topPuroks.map((p, i) => [`#${i + 1}`, p.purok, p.vulnerable_count]),
            theme: 'grid',
            headStyles: { fillColor: ROSE_H, textColor: WHITE, fontStyle: 'bold', fontSize: 9, halign: 'center' },
            bodyStyles: { fontSize: 9, textColor: SLATE_900 },
            columnStyles: { 0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 110 }, 2: { cellWidth: 40, halign: 'center', fontStyle: 'bold' } },
            alternateRowStyles: { fillColor: [255, 241, 242] },
        });
    }

    drawFooter(doc, generated, ROSE_H);
    const filename = `MSWDO_Vulnerable_Report_${today.getFullYear()}_${String(today.getMonth() + 1).padStart(2, '0')}.pdf`;
    doc.save(filename);
}

// ─── Household Census PDF ────────────────────────────────────────────────────────
export function exportCensusReportPDF(rows: { household: any; members: any[] }[], barangayId: string) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const today = new Date();
    const monthYear = today.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    const generated = today.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const GREEN_H: [number, number, number] = [5, 150, 105];   // emerald-600
    const GREEN_A: [number, number, number] = [52, 211, 153];  // emerald-400

    drawHeader(doc, 'Household Census Masterlist', monthYear, barangayId, GREEN_H, GREEN_A);

    let y = 62;

    // Totals overview
    sectionTitle(doc, 'SUMMARY', y, GREEN_H);
    y += 7;
    const totalMembers = rows.reduce((s, r) => s + r.members.length, 0);
    const grouped = rows.reduce<Record<string, typeof rows>>((acc, r) => {
        const p = r.household.purok_sitio || 'Unknown';
        if (!acc[p]) acc[p] = [];
        acc[p].push(r);
        return acc;
    }, {});

    autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 },
        head: [['Metric', 'Value']],
        body: [
            ['Total Registered Households', rows.length.toLocaleString()],
            ['Total Residents (Active)', totalMembers.toLocaleString()],
            ['Puroks / Sitios Covered', Object.keys(grouped).length.toLocaleString()],
            ['Average Household Size', rows.length > 0 ? (totalMembers / rows.length).toFixed(1) + ' members' : '0'],
        ],
        theme: 'grid',
        headStyles: { fillColor: GREEN_H, textColor: WHITE, fontStyle: 'bold', fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 9, textColor: SLATE_900 },
        columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 60, halign: 'center', fontStyle: 'bold' } },
        alternateRowStyles: { fillColor: [236, 253, 245] },
    });

    // Per-purok tables
    let isFirstPurok = true;
    for (const [purok, items] of Object.entries(grouped)) {
        if (isFirstPurok) {
            y = (doc as any).lastAutoTable.finalY + 10;
            isFirstPurok = false;
        } else {
            y = (doc as any).lastAutoTable.finalY + 8;
        }

        sectionTitle(doc, `PUROK: ${purok.toUpperCase()}  (${items.length} household${items.length !== 1 ? 's' : ''})`, y, GREEN_H);
        y += 7;

        autoTable(doc, {
            startY: y, margin: { left: 14, right: 14 },
            head: [['#', 'Household Head', 'Address', 'Members', 'Status']],
            body: items.map((r, i) => [
                i + 1,
                r.household.head_name,
                r.household.street_address || '—',
                r.members.length,
                r.household.status ?? 'active',
            ]),
            theme: 'grid',
            headStyles: { fillColor: GREEN_H, textColor: WHITE, fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
            bodyStyles: { fontSize: 8.5, textColor: SLATE_900 },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 55 },
                2: { cellWidth: 70 },
                3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
                4: { cellWidth: 20, halign: 'center' },
            },
            alternateRowStyles: { fillColor: [236, 253, 245] },
            didDrawPage: (_data: any) => {
                // Repeat header on new pages
                drawHeader(doc, 'Household Census Masterlist', monthYear, barangayId, GREEN_H, GREEN_A);
                drawFooter(doc, generated, GREEN_H);
            },
        });
    }

    // Draw footer on first page too
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawFooter(doc, generated, GREEN_H);
    }

    const filename = `MSWDO_Household_Census_${today.getFullYear()}_${String(today.getMonth() + 1).padStart(2, '0')}.pdf`;
    doc.save(filename);
}
