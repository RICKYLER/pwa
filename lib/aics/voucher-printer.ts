import { amountToWords } from './amount-to-words';
import { getBarangayName } from '@/lib/mabini-barangays';

export interface PettyCashVoucherData {
  control_number: string;
  voucher_number?: string;
  intake_date?: string;
  client_name: string;
  barangay_id?: string;
  purok_sitio?: string;
  assistance_type?: string;
  specific_assistance?: string;
  amount_approved: number;
  source_of_fund?: string;
}

/**
 * Print the official Municipality of Mabini MSWDO Petty Cash Voucher
 * exactly matching the physical municipal form standard (DSWD Funding).
 */
export function printPettyCashVoucher(data: PettyCashVoucherData) {
  const existing = document.getElementById('mswdo-voucher-print-iframe');
  if (existing) {
    existing.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'mswdo-voucher-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const barangayName = data.barangay_id ? getBarangayName(data.barangay_id) : 'Mabini';
  const address = data.purok_sitio
    ? `${data.purok_sitio}, ${barangayName}, Mabini, Davao de Oro`
    : `${barangayName}, Mabini, Davao de Oro`;

  const amountNumber = Number(data.amount_approved) || 0;
  const formattedAmount = `₱${amountNumber.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const wordsAmount = amountToWords(amountNumber);
  const formattedDate = data.intake_date
    ? new Date(data.intake_date).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      });

  const aType = (data.assistance_type || '').toLowerCase();
  const isMedical = aType === 'medical';
  const isBurial = aType === 'burial';
  const isTranspo = aType.includes('transport') || aType === 'food_transportation';
  const isEduc = aType === 'educational';
  const isOther = !isMedical && !isBurial && !isTranspo && !isEduc;

  const sourceOfFund = data.source_of_fund || 'DSWD FUNDING';

  const printHtml = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Petty Cash Voucher - ${data.control_number}</title>
    <style>
      @page {
        size: 8.5in 5.5in landscape;
        margin: 0.25in;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif;
      }
      body {
        background: #fff;
        color: #0f172a;
        font-size: 11px;
        line-height: 1.25;
        padding: 10px;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .voucher-container {
        border: 2px solid #1e3a8a;
        border-radius: 8px;
        padding: 12px 14px;
        position: relative;
        background: #ffffff;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 2px solid #2563eb;
        padding-bottom: 8px;
        margin-bottom: 8px;
      }
      .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .logo {
        width: 48px;
        height: 48px;
        object-fit: contain;
      }
      .titles {
        text-align: left;
      }
      .titles h4 {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #475569;
        font-weight: bold;
      }
      .titles h2 {
        font-size: 15px;
        font-weight: 900;
        color: #1e3a8a;
        letter-spacing: -0.3px;
      }
      .titles p {
        font-size: 9px;
        color: #334155;
        font-weight: 600;
      }
      .header-right {
        text-align: right;
      }
      .voucher-pill {
        display: inline-block;
        background: #1e3a8a;
        color: #ffffff;
        font-weight: 900;
        font-size: 12px;
        text-transform: uppercase;
        padding: 4px 12px;
        border-radius: 6px;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }
      .voucher-meta {
        font-size: 10px;
        font-weight: bold;
        color: #1e293b;
      }
      .voucher-meta span {
        border-bottom: 1px solid #1e293b;
        padding: 0 8px;
        display: inline-block;
        min-width: 90px;
      }

      /* Source of Fund & Payee */
      .meta-grid {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 8px;
        gap: 12px;
      }
      .source-box {
        border: 1.5px solid #0284c7;
        border-radius: 6px;
        padding: 4px 8px;
        background: #f0f9ff;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 140px;
      }
      .source-title {
        font-size: 8px;
        font-weight: 800;
        text-transform: uppercase;
        color: #0369a1;
      }
      .source-badge {
        background: #fef08a;
        color: #854d0e;
        border: 1px solid #facc15;
        font-size: 11px;
        font-weight: 900;
        padding: 2px 8px;
        border-radius: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 2px;
      }
      .payee-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .field-row {
        display: flex;
        align-items: baseline;
        gap: 6px;
        font-size: 10.5px;
      }
      .field-label {
        font-weight: bold;
        color: #334155;
        min-width: 90px;
      }
      .field-line {
        flex: 1;
        border-bottom: 1px solid #0f172a;
        font-weight: bold;
        color: #0f172a;
        text-transform: uppercase;
        padding-left: 4px;
      }

      /* Purpose checkboxes */
      .purpose-box {
        border: 1px solid #94a3b8;
        border-radius: 6px;
        padding: 5px 8px;
        background: #f8fafc;
        margin-bottom: 8px;
      }
      .purpose-title {
        font-size: 8.5px;
        font-weight: 900;
        text-transform: uppercase;
        color: #1e3a8a;
        margin-bottom: 4px;
      }
      .purpose-options {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 9.5px;
        font-weight: bold;
        color: #1e293b;
      }
      .chk-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .chk-box {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 13px;
        height: 13px;
        border: 1.5px solid #1e3a8a;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 900;
        line-height: 1;
        background: #ffffff;
      }
      .chk-box.checked {
        background: #1e3a8a;
        color: #ffffff;
      }

      /* Amount Table */
      .amount-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 8px;
      }
      .amount-table th {
        background: #475569;
        color: #ffffff;
        font-size: 9px;
        font-weight: 900;
        text-transform: uppercase;
        padding: 4px 8px;
        border: 1px solid #334155;
      }
      .amount-table td {
        border: 1px solid #64748b;
        padding: 6px 8px;
      }
      .amount-words-cell {
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        color: #0f172a;
        width: 70%;
        background: #ffffff;
      }
      .amount-num-cell {
        font-size: 13px;
        font-weight: 900;
        text-align: right;
        font-family: monospace;
        color: #047857;
        width: 30%;
        background: #f0fdf4;
      }
      .total-row td {
        font-weight: 900;
        font-size: 10.5px;
      }

      .cert-text {
        font-size: 8px;
        font-style: italic;
        color: #475569;
        margin-bottom: 8px;
        line-height: 1.2;
      }

      /* Signatories */
      .signatories-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        margin-bottom: 6px;
      }
      .sig-box {
        border: 1px solid #cbd5e1;
        border-radius: 5px;
        padding: 4px 6px;
        background: #ffffff;
        text-align: center;
        position: relative;
      }
      .sig-label {
        font-size: 7.5px;
        font-weight: 900;
        text-transform: uppercase;
        color: #64748b;
        display: block;
        margin-bottom: 12px;
      }
      .sig-name {
        font-size: 9px;
        font-weight: 900;
        text-transform: uppercase;
        color: #0f172a;
        border-bottom: 1px solid #0f172a;
        padding-bottom: 1px;
      }
      .sig-title {
        font-size: 7.5px;
        font-weight: 600;
        color: #475569;
        margin-top: 1px;
      }

      /* Footer */
      .voucher-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-top: 1px dashed #cbd5e1;
        padding-top: 4px;
        font-size: 8px;
        color: #64748b;
      }
      .footer-slogan {
        font-style: italic;
        font-weight: bold;
        color: #0369a1;
      }
    </style>
  </head>
  <body>
    <div class="voucher-container">
      <!-- Header -->
      <div class="header">
        <div class="header-left">
          <img src="${origin}/davao-de-oro-logo.png" alt="Mabini Seal" class="logo" />
          <img src="${origin}/mswdo-logo.png" alt="MSWDO Logo" class="logo" />
          <div class="titles">
            <h4>Republic of the Philippines</h4>
            <h2>MUNICIPALITY OF MABINI</h2>
            <p>Province of Davao de Oro</p>
            <p style="color: #047857; font-weight: 800;">MUNICIPAL SOCIAL WELFARE AND DEVELOPMENT OFFICE (MSWDO)</p>
          </div>
        </div>
        <div class="header-right">
          <div class="voucher-pill">PETTY CASH VOUCHER</div>
          <div class="voucher-meta">Voucher No.: <span>${data.voucher_number || data.control_number}</span></div>
          <div class="voucher-meta" style="margin-top: 2px;">Date: <span>${formattedDate}</span></div>
        </div>
      </div>

      <!-- Source of Fund & Payee -->
      <div class="meta-grid">
        <div class="source-box">
          <div class="source-title">SOURCE OF FUND:</div>
          <div class="source-badge">${sourceOfFund}</div>
        </div>
        <div class="payee-info">
          <div class="field-row">
            <span class="field-label">Payee / Recipient:</span>
            <span class="field-line">${data.client_name}</span>
          </div>
          <div class="field-row">
            <span class="field-label">Address:</span>
            <span class="field-line">${address}</span>
          </div>
        </div>
      </div>

      <!-- Purpose Checkboxes -->
      <div class="purpose-box">
        <div class="purpose-title">PURPOSE / PARTICULARS (Please check):</div>
        <div class="purpose-options">
          <div class="chk-item">
            <span class="chk-box ${isMedical ? 'checked' : ''}">${isMedical ? '✓' : ''}</span>
            <span>Medical Assistance</span>
          </div>
          <div class="chk-item">
            <span class="chk-box ${isBurial ? 'checked' : ''}">${isBurial ? '✓' : ''}</span>
            <span>Burial Assistance</span>
          </div>
          <div class="chk-item">
            <span class="chk-box ${isTranspo ? 'checked' : ''}">${isTranspo ? '✓' : ''}</span>
            <span>Transportation Assistance</span>
          </div>
          <div class="chk-item">
            <span class="chk-box ${isEduc ? 'checked' : ''}">${isEduc ? '✓' : ''}</span>
            <span>Educational Assistance</span>
          </div>
          <div class="chk-item">
            <span class="chk-box ${isOther ? 'checked' : ''}">${isOther ? '✓' : ''}</span>
            <span>Other Support: <span style="font-weight: 600; text-decoration: underline;">${isOther ? data.specific_assistance || 'Emergency Aid' : '__________'}</span></span>
          </div>
        </div>
      </div>

      <!-- Amount in Words & Numbers -->
      <table class="amount-table">
        <thead>
          <tr>
            <th>AMOUNT IN WORDS</th>
            <th style="text-align: right;">AMOUNT (₱)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="amount-words-cell">${wordsAmount}</td>
            <td class="amount-num-cell">${formattedAmount}</td>
          </tr>
          <tr class="total-row">
            <td style="text-align: right; font-weight: 900; background: #f8fafc; color: #334155;">TOTAL AMOUNT</td>
            <td class="amount-num-cell" style="font-size: 14px; color: #065f46;">${formattedAmount}</td>
          </tr>
        </tbody>
      </table>

      <p class="cert-text">
        I hereby certify that the above expenses are necessary, valid and proper for official use and in accordance with existing rules and regulations.
      </p>

      <!-- 4 Signatories -->
      <div class="signatories-grid">
        <div class="sig-box">
          <span class="sig-label">PREPARED BY:</span>
          <div class="sig-name">VIRGENCITA M. CHU, RSW, MPA</div>
          <div class="sig-title">MSWDO</div>
        </div>
        <div class="sig-box">
          <span class="sig-label">PAID BY:</span>
          <div class="sig-name">FLORITA B. BATIAO</div>
          <div class="sig-title">AO IV</div>
        </div>
        <div class="sig-box">
          <span class="sig-label">APPROVED BY:</span>
          <div class="sig-name">EMERSON L. LUEGO</div>
          <div class="sig-title">Municipal Mayor</div>
        </div>
        <div class="sig-box">
          <span class="sig-label">RECEIVED BY (CLIENT):</span>
          <div class="sig-name" style="color: #047857;">${data.client_name}</div>
          <div class="sig-title">(Signature Over Printed Name)</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="voucher-footer">
        <span>📍 Mabini, Davao de Oro &bull; LGU Mabini</span>
        <span class="footer-slogan">Malasakit &bull; Pagkakaisa &bull; Kaunlaran</span>
      </div>
    </div>
  </body>
</html>
`;

  doc.open();
  doc.write(printHtml);
  doc.close();

  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };
}
