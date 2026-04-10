import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  DistributedItem,
  DistributionEvent,
  DistributionRecord,
} from '@/lib/db/schema';

const TEAL_700: [number, number, number] = [15, 118, 110];
const TEAL_600: [number, number, number] = [13, 148, 136];
const TEAL_400: [number, number, number] = [45, 212, 191];
const EMERALD_500: [number, number, number] = [16, 185, 129];
const AMBER_500: [number, number, number] = [245, 158, 11];
const ROSE_500: [number, number, number] = [244, 63, 94];
const SKY_500: [number, number, number] = [14, 165, 233];
const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_700: [number, number, number] = [51, 65, 85];
const SLATE_500: [number, number, number] = [100, 116, 139];
const SLATE_300: [number, number, number] = [203, 213, 225];
const SLATE_100: [number, number, number] = [241, 245, 249];
const WHITE: [number, number, number] = [255, 255, 255];

type DistributionPackageStockLine = DistributedItem & {
  available: number;
  remainingPackages: number;
  lowStock: boolean;
};

type DistributionReportExportInput = {
  event: DistributionEvent;
  records: DistributionRecord[];
  packageStock: DistributionPackageStockLine[];
  summary: {
    householdsServed: number;
    residentsServed: number;
    totalUnitsReleased: number;
    fullPackagesLeft: number;
    audienceMatchCount: number;
    audienceMatchLabel: string;
    audienceMatchSupport: string;
    scopeLabel: string;
    generatedBy?: string;
  };
};

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sumDistributedUnits(items: DistributedItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'distribution_report';
}

function drawHeader(doc: jsPDF, event: DistributionEvent, generatedAt: string) {
  const width = doc.internal.pageSize.getWidth();

  doc.setFillColor(...TEAL_700);
  doc.rect(0, 0, width, 34, 'F');

  doc.setFillColor(...WHITE);
  doc.setGState(new (doc as jsPDF & { GState: new (options: { opacity: number }) => unknown }).GState({ opacity: 0.06 }));
  for (let x = 10; x < width; x += 14) {
    for (let y = 6; y < 34; y += 10) {
      doc.circle(x, y, 0.8, 'F');
    }
  }
  doc.setGState(new (doc as jsPDF & { GState: new (options: { opacity: number }) => unknown }).GState({ opacity: 1 }));

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('MSWDO CIVIC CONSOLE · DISTRIBUTION OPERATIONS', 14, 10);

  doc.setFontSize(20);
  doc.text('Distribution Event Report', 14, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(event.event_name, 14, 27);

  doc.setFontSize(8);
  doc.text(`Generated ${generatedAt}`, width - 14, 10, { align: 'right' });
  doc.text(`Event ID ${event.id}`, width - 14, 16, { align: 'right' });

  doc.setFillColor(...TEAL_400);
  doc.rect(0, 34, width, 2.4, 'F');
}

function drawFooter(doc: jsPDF, pageNumber: number, totalPages: number) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  doc.setDrawColor(...SLATE_300);
  doc.line(14, height - 10, width - 14, height - 10);
  doc.setTextColor(...SLATE_500);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('MSWDO Distribution Report', 14, height - 5);
  doc.text(`Page ${pageNumber} of ${totalPages}`, width - 14, height - 5, { align: 'right' });
}

function drawSectionTitle(doc: jsPDF, text: string, y: number) {
  const width = doc.internal.pageSize.getWidth();

  doc.setFillColor(...SLATE_100);
  doc.roundedRect(14, y - 4, width - 28, 9, 2, 2, 'F');
  doc.setFillColor(...TEAL_600);
  doc.roundedRect(14, y - 4, 3, 9, 1, 1, 'F');
  doc.setTextColor(...TEAL_700);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(text, 21, y + 1.5);
}

function drawMetricCards(
  doc: jsPDF,
  y: number,
  metrics: Array<{ label: string; value: string; tone: [number, number, number] }>,
) {
  const width = doc.internal.pageSize.getWidth();
  const gap = 4;
  const cardWidth = (width - 28 - gap * (metrics.length - 1)) / metrics.length;

  metrics.forEach((metric, index) => {
    const x = 14 + index * (cardWidth + gap);
    doc.setFillColor(...WHITE);
    doc.setDrawColor(...SLATE_300);
    doc.roundedRect(x, y, cardWidth, 18, 2.5, 2.5, 'FD');
    doc.setFillColor(...metric.tone);
    doc.roundedRect(x, y, cardWidth, 2.6, 2, 2, 'F');

    doc.setTextColor(...SLATE_500);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(metric.label, x + 3, y + 8);

    doc.setTextColor(...SLATE_900);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(metric.value, x + 3, y + 14);
  });
}

export function exportDistributionReportPDF(input: DistributionReportExportInput) {
  const { event, records, packageStock, summary } = input;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const generatedAt = formatDateTime(new Date());

  drawHeader(doc, event, generatedAt);

  let y = 44;
  drawSectionTitle(doc, 'EVENT PROFILE', y);
  y += 7;

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14, top: 42 },
    head: [['Field', 'Value', 'Field', 'Value']],
    body: [[
      'Status',
      event.status,
      'Scheduled Date',
      formatDate(event.scheduled_date),
    ], [
      'Audience',
      `${event.target_scope} · ${event.target_group}`,
      'Coverage',
      summary.scopeLabel,
    ], [
      'Location',
      event.location || 'Not set',
      'Generated By',
      summary.generatedBy || 'MSWDO staff',
    ], [
      'Notes',
      event.notes?.trim() || 'No notes recorded',
      'Audience Detail',
      summary.audienceMatchSupport || 'No audience note available',
    ]],
    theme: 'grid',
    headStyles: {
      fillColor: TEAL_600,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: SLATE_900,
      cellPadding: 2.5,
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 92 },
      2: { cellWidth: 28, fontStyle: 'bold' },
      3: { cellWidth: 93 },
    },
    alternateRowStyles: { fillColor: SLATE_100 },
    didDrawPage: () => {
      drawHeader(doc, event, generatedAt);
    },
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 8;

  drawMetricCards(doc, y, [
    { label: 'Households Served', value: summary.householdsServed.toLocaleString(), tone: EMERALD_500 },
    { label: 'Residents Served', value: summary.residentsServed.toLocaleString(), tone: SKY_500 },
    { label: 'Units Released', value: summary.totalUnitsReleased.toLocaleString(), tone: AMBER_500 },
    { label: 'Full Packages Left', value: summary.fullPackagesLeft.toLocaleString(), tone: TEAL_600 },
    { label: summary.audienceMatchLabel, value: summary.audienceMatchCount.toLocaleString(), tone: ROSE_500 },
  ]);

  y += 24;
  drawSectionTitle(doc, 'PACKAGE AND INVENTORY STATUS', y);
  y += 7;

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14, top: 42 },
    head: [['Package Item', 'Per Release', 'Available Stock', 'Full Packages Left', 'Stock Status']],
    body: packageStock.length > 0
      ? packageStock.map((item) => [
          item.item_name || 'Package item',
          `${item.quantity} ${item.unit || ''}`.trim(),
          `${item.available} ${item.unit || ''}`.trim(),
          item.remainingPackages.toLocaleString(),
          item.lowStock ? 'Needs restock' : 'Ready',
        ])
      : [['No package items configured', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: TEAL_600,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: SLATE_900,
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { cellWidth: 86 },
      1: { cellWidth: 40, halign: 'center' },
      2: { cellWidth: 44, halign: 'center' },
      3: { cellWidth: 36, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 35, halign: 'center' },
    },
    alternateRowStyles: { fillColor: SLATE_100 },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 4 && hookData.cell.raw === 'Needs restock') {
        hookData.cell.styles.textColor = ROSE_500;
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: () => {
      drawHeader(doc, event, generatedAt);
    },
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 8;
  drawSectionTitle(doc, 'DISTRIBUTION RECORDS', y);
  y += 7;

  if (records.length === 0) {
    doc.setDrawColor(...SLATE_300);
    doc.setFillColor(...SLATE_100);
    doc.roundedRect(14, y, doc.internal.pageSize.getWidth() - 28, 18, 2.5, 2.5, 'FD');
    doc.setTextColor(...SLATE_700);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('No distribution records yet', 18, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_500);
    doc.text('This event has not released any packages yet. Inventory values above reflect the latest stock snapshot.', 18, y + 12.5);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14, top: 42 },
      head: [['#', 'Target', 'Beneficiary', 'Received By', 'Reference', 'Items Released', 'Units', 'Released At', 'Notes']],
      body: records.map((record, index) => [
        String(index + 1),
        record.resident_id ? 'Resident' : 'Household',
        record.beneficiary_name || record.received_by_name || 'Beneficiary',
        record.received_by_name || record.beneficiary_name || 'Beneficiary',
        record.resident_id || record.household_id || '—',
        record.items_distributed.map((item) => `${item.item_name || 'Item'} (${item.quantity} ${item.unit || ''})`.trim()).join('; '),
        sumDistributedUnits(record.items_distributed).toLocaleString(),
        formatDateTime(record.timestamp),
        record.notes?.trim() || '—',
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: TEAL_600,
        textColor: WHITE,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: SLATE_900,
        cellPadding: 2.3,
        valign: 'top',
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 15, halign: 'center' },
        2: { cellWidth: 38 },
        3: { cellWidth: 32 },
        4: { cellWidth: 28 },
        5: { cellWidth: 72 },
        6: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
        7: { cellWidth: 28, halign: 'center' },
        8: { cellWidth: 33 },
      },
      alternateRowStyles: { fillColor: SLATE_100 },
      didDrawPage: () => {
        drawHeader(doc, event, generatedAt);
      },
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, page, totalPages);
  }

  const filename = `MSWDO_Distribution_Report_${sanitizeFilenamePart(event.event_name)}_${event.scheduled_date}.pdf`;
  doc.save(filename);
}
