'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Printer,
  ShieldCheck,
  User,
  Ban,
  CheckCircle2,
  QrCode,
  Sparkles,
  FileCheck2,
} from 'lucide-react';
import type { SoloParentRecord } from '@/lib/db/schema';
import { SOLO_PARENT_CATEGORY_LABELS } from '@/lib/solo-parents/rosp-exporter';
import { getBarangayName } from '@/lib/mabini-barangays';
import {
  MAYOR_LUEGO_SIGNATURE_SRC,
  CHU_MSWDO_SIGNATURE_SRC,
  MAYOR_LUEGO_SIGNATURE_B64,
  CHU_MSWDO_SIGNATURE_B64,
} from '@/lib/solo-parents/signatures';

interface SoloParentIdCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: SoloParentRecord | null;
}

export default function SoloParentIdCardModal({
  isOpen,
  onClose,
  record,
}: SoloParentIdCardModalProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [includeQrCode, setIncludeQrCode] = useState<boolean>(true);
  const [activeSide, setActiveSide] = useState<'both' | 'front' | 'back'>('both');

  const categoryLabel = record ? (SOLO_PARENT_CATEGORY_LABELS[record.category] || record.category) : '';
  const barangayName = record ? getBarangayName(record.barangay_id) : '';

  // Generate verified QR code with optimized payload for maximum scannability & sharp dots
  useEffect(() => {
    if (!record) return;
    let cancelled = false;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    
    // Encode compact verification payload for instant offline & online portal verification
    const verificationData = {
      id: record.id_number,
      name: record.full_name,
      brgy: barangayName,
      exp: record.expires_at,
      iss: record.issued_at,
      cat: record.category,
      sub: record.is_minimum_wage_or_below ? 1 : 0,
      st: record.status,
      deps: (record.dependents || []).map((d) => ({
        n: d.full_name,
        a: d.age,
        r: d.relationship,
      })),
    };

    let encodedData = '';
    try {
      encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(verificationData))));
    } catch {
      // fallback if encoding error
    }

    // Direct official LGU Verification Portal URL
    const qrPayload = `${origin}/verify/solo-parent?id=${encodeURIComponent(record.id_number)}${
      encodedData ? `&data=${encodeURIComponent(encodedData)}` : ''
    }`;

    QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      width: 320,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setQrCodeDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate Solo Parent QR code:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [record, barangayName]);

  if (!isOpen || !record) return null;

  const isRevoked = record.status === 'revoked';
  const benefitCode = record.is_minimum_wage_or_below
    ? 'RA 11861 - ₱1k Subsidy (BQC-01)'
    : 'RA 11861 - Standard (BQC-02)';

  // Build rows for 5 dependents (matches the physical Mabini MSWDO card)
  const dependentsList = record.dependents || [];
  const fiveRows = Array.from({ length: 5 }, (_, index) => dependentsList[index] || null);

  function handlePrint() {
    if (!record) return;

    // Remove any previous print iframe
    const existing = document.getElementById('solo-parent-print-iframe');
    if (existing) {
      existing.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'solo-parent-print-iframe';
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

    const dependentsTableRowsHtml = fiveRows
      .map((dep) => {
        if (dep) {
          return `
            <tr>
              <td style="border: 1px solid #0f172a; padding: 0.5px 3px; font-weight: 700; font-size: 6.5px; color: #0f172a; text-transform: uppercase; height: 10px; line-height: 1.05;">${dep.full_name}</td>
              <td style="border: 1px solid #0f172a; padding: 0.5px 2px; font-size: 6.5px; text-align: center; color: #334155; height: 10px; line-height: 1.05;">${dep.birthdate || ''}</td>
              <td style="border: 1px solid #0f172a; padding: 0.5px 2px; font-size: 6.5px; text-align: center; font-weight: 700; color: #0f172a; height: 10px; line-height: 1.05;">${dep.age ? `${dep.age}` : ''}</td>
              <td style="border: 1px solid #0f172a; padding: 0.5px 2px; font-size: 6.5px; text-align: center; color: #334155; height: 10px; line-height: 1.05;">${dep.relationship || ''}</td>
            </tr>
          `;
        }
        return `
          <tr>
            <td style="border: 1px solid #0f172a; padding: 0.5px 2px; height: 10px;">&nbsp;</td>
            <td style="border: 1px solid #0f172a; padding: 0.5px 2px; height: 10px;">&nbsp;</td>
            <td style="border: 1px solid #0f172a; padding: 0.5px 2px; height: 10px;">&nbsp;</td>
            <td style="border: 1px solid #0f172a; padding: 0.5px 2px; height: 10px;">&nbsp;</td>
          </tr>
        `;
      })
      .join('');

    const showFront = activeSide === 'both' || activeSide === 'front';
    const showBack = activeSide === 'both' || activeSide === 'back';

    const printHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <base href="${origin}/" />
          <title>Official Solo Parent ID - ${record.id_number} - ${record.full_name}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm 12mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            body {
              font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #0f172a;
              -webkit-font-smoothing: antialiased;
            }
            .page-container {
              width: 100%;
              max-width: 760px;
              margin: 0 auto;
              padding: 10px 0;
            }
            .header-banner {
              text-align: center;
              border-bottom: 2px solid #945d65;
              padding-bottom: 6px;
              margin-bottom: 18px;
            }
            .header-banner p {
              margin: 0;
              font-size: 9.5px;
              color: #475569;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              font-weight: 700;
            }
            .header-banner h2 {
              margin: 2px 0 0 0;
              font-size: 13.5px;
              font-weight: 900;
              color: #945d65;
              letter-spacing: 0.02em;
              text-transform: uppercase;
            }
            .cards-layout {
              display: flex;
              flex-direction: row;
              justify-content: center;
              align-items: flex-start;
              gap: 20px;
              margin-bottom: 16px;
              flex-wrap: wrap;
            }
            .card-wrapper {
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .guide-label {
              font-size: 8.5px;
              color: #64748b;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              margin-bottom: 4px;
            }
            /* ISO/IEC ID-1 Standard ID Card Dimensions: 355px x 236px (~85.6mm x 57mm) */
            .id-card {
              width: 355px;
              height: 236px;
              border: 1px solid #94a3b8;
              background-color: #ffffff;
              padding: 5px 7px;
              position: relative;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              outline: 1px dashed #94a3b8;
              outline-offset: 3px;
              box-sizing: border-box;
            }
            /* Back Card Double Frame (Matches Authentic Mabini MSWDO physical card) */
            .id-card-back {
              width: 355px;
              height: 236px;
              border: 1.2px solid #0f172a;
              background-color: #ffffff;
              padding: 2.5px;
              position: relative;
              outline: 1px dashed #94a3b8;
              outline-offset: 3px;
              box-sizing: border-box;
            }
            .id-card-back-inner {
              border: 1.2px solid #0f172a;
              width: 100%;
              height: 100%;
              padding: 3px 5px 3.5px 5px;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              position: relative;
            }
            .watermark {
              position: absolute;
              inset: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              pointer-events: none;
              z-index: 20;
            }
            .watermark-box {
              border: 3.5px solid rgba(225, 29, 72, 0.85);
              border-radius: 8px;
              padding: 4px 14px;
              color: rgba(225, 29, 72, 0.9);
              font-size: 18px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.15em;
              transform: rotate(-12deg);
              background-color: rgba(255, 255, 255, 0.88);
            }
            .front-top-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 4px;
              padding-bottom: 2px;
            }
            .front-logo {
              width: 38px;
              height: 38px;
              object-fit: contain;
              flex-shrink: 0;
            }
            .front-header-text {
              text-align: center;
              flex: 1;
              line-height: 1.15;
            }
            .front-header-text .line1 {
              font-size: 9px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              color: #0f172a;
            }
            .front-header-text .line2 {
              font-size: 8px;
              font-weight: 600;
              color: #334155;
            }
            .front-header-text .line3 {
              font-size: 8px;
              font-weight: 600;
              color: #334155;
            }
            .banner-strip {
              background-color: #945d65;
              color: #ffffff;
              text-align: center;
              font-size: 8.5px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              padding: 3px 4px;
              margin: 2px 0 3px 0;
            }
            .id-no-row {
              text-align: right;
              font-size: 8px;
              font-weight: 700;
              color: #0f172a;
              margin-bottom: 2px;
            }
            .id-no-val {
              border-bottom: 1px solid #0f172a;
              font-family: monospace;
              font-weight: 900;
              font-size: 8.5px;
              padding: 0 4px;
              min-width: 90px;
              display: inline-block;
              text-align: center;
            }
            .front-body {
              display: flex;
              gap: 7px;
              align-items: flex-start;
              flex: 1;
            }
            .photo-frame {
              width: 72px;
              height: 82px;
              border: 1px solid #475569;
              background-color: #f8fafc;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
              padding: 2px;
              flex-shrink: 0;
            }
            .photo-frame span {
              font-size: 6.5px;
              color: #64748b;
              text-transform: uppercase;
              font-weight: 600;
            }
            .fields-area {
              flex: 1;
              min-width: 0;
              display: flex;
              flex-direction: column;
              gap: 2px;
            }
            .name-box {
              text-align: center;
              margin-bottom: 2px;
            }
            .name-line {
              border-bottom: 1px solid #0f172a;
              font-weight: 900;
              font-size: 9.5px;
              text-transform: uppercase;
              color: #0f172a;
              display: block;
              padding-bottom: 1px;
            }
            .name-label {
              font-size: 6.5px;
              font-weight: 700;
              text-transform: uppercase;
              color: #475569;
              letter-spacing: 0.05em;
              display: block;
              margin-top: 1px;
            }
            .field-row {
              font-size: 7.5px;
              color: #334155;
              display: flex;
              align-items: baseline;
              line-height: 1.15;
            }
            .field-label {
              font-weight: 700;
              color: #0f172a;
              white-space: nowrap;
            }
            .field-underline {
              border-bottom: 1px solid #475569;
              flex: 1;
              font-weight: 700;
              color: #0f172a;
              padding-left: 3px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .front-bottom {
              display: flex;
              align-items: flex-end;
              justify-content: space-between;
              padding-top: 3px;
              font-size: 6.5px;
            }
            .validity-block {
              color: #334155;
              line-height: 1.2;
            }
            .validity-underline {
              border-bottom: 1px solid #0f172a;
              font-weight: 800;
              color: #be123c;
              padding: 0 3px;
            }
            .sig-block {
              text-align: center;
              width: 145px;
            }
            .sig-line {
              border-bottom: 1px solid #0f172a;
              width: 100%;
              margin-bottom: 1.5px;
            }
            .sig-text {
              font-size: 6.5px;
              color: #334155;
            }
            /* Back Card Styling */
            .dep-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 0.5px;
            }
            .dep-table-title {
              border: 1px solid #0f172a;
              background-color: #f1f5f9;
              text-align: center;
              font-size: 6.8px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              padding: 0.5px 1px;
              line-height: 1.1;
            }
            .dep-col-header {
              border: 1px solid #0f172a;
              background-color: #f8fafc;
              font-size: 5.8px;
              font-weight: 800;
              text-transform: uppercase;
              padding: 0.5px 2px;
              text-align: center;
              line-height: 1.1;
            }
            .emergency-section {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 6.5px;
              padding: 0.5px 0;
              border-top: 1px solid #cbd5e1;
              margin-top: 0.5px;
            }
            .emerg-left {
              display: flex;
              flex-direction: column;
              gap: 0.5px;
              flex: 1;
            }
            .emerg-title {
              font-weight: 900;
              text-transform: uppercase;
              color: #0f172a;
              font-size: 6.5px;
            }
            .emerg-field {
              display: flex;
              align-items: baseline;
              font-size: 6.5px;
            }
            .emerg-underline {
              border-bottom: 1px solid #0f172a;
              flex: 1;
              min-width: 50px;
              padding-left: 2px;
              font-weight: 700;
            }
            .emerg-row-split {
              display: flex;
              align-items: baseline;
              justify-content: space-between;
              gap: 6px;
            }
            .emerg-qr-box {
              display: flex;
              align-items: center;
              justify-content: center;
              background: #ffffff;
              border: 1.2px solid #0f172a;
              padding: 1px;
              margin-left: 6px;
              flex-shrink: 0;
            }
            .emerg-qr-img {
              width: 32px;
              height: 32px;
              display: block;
            }
            .signatures-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              padding-top: 1px;
              margin-top: 1.5px;
              border-top: 1px solid #cbd5e1;
            }
            .official-sig-box {
              width: 145px;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              padding-bottom: 1.5px;
            }
            .official-sig-img {
              height: 27px;
              width: 100%;
              display: flex;
              align-items: flex-end;
              justify-content: center;
              position: relative;
            }
            .sig-mayor-img {
              height: 29px;
              max-width: 100px;
              object-fit: contain;
              display: block;
              margin-bottom: -10px;
              z-index: 2;
              position: relative;
            }
            .sig-chu-img {
              height: 29px;
              max-width: 72px;
              object-fit: contain;
              display: block;
              margin-bottom: -5px;
              z-index: 2;
              position: relative;
            }
            .official-sig-line {
              border-top: 1.2px solid #0f172a;
              width: 100%;
              margin-top: 0.5px;
              margin-bottom: 1px;
              position: relative;
              z-index: 1;
            }
            .official-name {
              font-size: 7.5px;
              font-weight: 900;
              text-transform: uppercase;
              color: #0f172a;
              line-height: 1.15;
              letter-spacing: 0.02em;
              white-space: nowrap;
            }
            .official-role {
              font-size: 7px;
              font-weight: 900;
              text-transform: uppercase;
              color: #0f172a;
              line-height: 1.15;
              letter-spacing: 0.04em;
              margin-top: 0.5px;
              white-space: nowrap;
            }
            .print-guide-footer {
              text-align: center;
              font-size: 8.5px;
              color: #64748b;
              margin-top: 16px;
              padding-top: 8px;
              border-top: 1px dashed #cbd5e1;
            }
          </style>
        </head>
        <body>
          <div class="page-container">
            <div class="header-banner">
              <p>Republic of the Philippines • Province of Davao de Oro • Municipality of Mabini</p>
              <h2>Municipal Social Welfare & Development Office (MSWDO)</h2>
            </div>

            <div class="cards-layout">
              ${
                showFront
                  ? `
                <!-- FRONT OF THE CARD -->
                <div class="card-wrapper">
                  <div class="guide-label">✂ Front of Card</div>
                  <div class="id-card">
                    ${isRevoked ? '<div class="watermark"><div class="watermark-box">REVOKED / VOID</div></div>' : ''}
                    
                    <div>
                      <div class="front-top-header">
                        <img src="/davao-de-oro-logo.png" alt="Davao de Oro Seal" class="front-logo" />
                        <div class="front-header-text">
                          <div class="line1">REPUBLIC OF THE PHILIPPINES</div>
                          <div class="line2">Province of Davao de Oro</div>
                          <div class="line3">Solo Parent Office / Division of Mabini</div>
                        </div>
                        <img src="/mswdo-logo.png" alt="MSWDO Logo" class="front-logo" />
                      </div>

                      <div class="banner-strip">
                        SOLO PARENT IDENTIFICATION CARD
                      </div>

                      <div class="id-no-row">
                        ID No. <span class="id-no-val">${record.id_number}</span>
                      </div>
                    </div>

                    <div class="front-body">
                      <div class="photo-frame">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        <span>1x1 ID picture</span>
                      </div>

                      <div class="fields-area">
                        <div class="name-box">
                          <span class="name-line">${record.full_name.toUpperCase()}</span>
                          <span class="name-label">NAME</span>
                        </div>

                        <div class="field-row">
                          <span class="field-label">Date and Place of Birth:&nbsp;</span>
                          <span class="field-underline">${record.birthdate || 'N/A'}, Mabini</span>
                        </div>

                        <div class="field-row">
                          <span class="field-label">Address:&nbsp;</span>
                          <span class="field-underline">${record.purok_sitio ? `${record.purok_sitio}, ` : ''}${barangayName}, Mabini</span>
                        </div>

                        <div class="field-row">
                          <span class="field-label">Solo Parent Category:&nbsp;</span>
                          <span class="field-underline">${categoryLabel}</span>
                        </div>

                        <div class="field-row">
                          <span class="field-label">Benefit Qualification Code:&nbsp;</span>
                          <span class="field-underline">${benefitCode}</span>
                        </div>
                      </div>
                    </div>

                    <div class="front-bottom">
                      <div class="validity-block">
                        <div>This card is non-transferable and</div>
                        <div>valid until <span class="validity-underline">${record.expires_at}</span></div>
                      </div>

                      <div class="sig-block">
                        <div class="sig-line"></div>
                        <div class="sig-text">Signature or thumbprint of solo parent</div>
                      </div>
                    </div>
                  </div>
                </div>
              `
                  : ''
              }

              ${
                showBack
                  ? `
                <!-- BACK OF THE CARD -->
                <div class="card-wrapper">
                  <div class="guide-label">✂ Back of Card</div>
                  <div class="id-card-back">
                    <div class="id-card-back-inner">
                      ${isRevoked ? '<div class="watermark"><div class="watermark-box">REVOKED / VOID</div></div>' : ''}

                      <div>
                        <table class="dep-table">
                          <thead>
                            <tr>
                              <th colspan="4" class="dep-table-title">CHILD/REN/DEPENDENT/S</th>
                            </tr>
                            <tr>
                              <th class="dep-col-header" style="width: 44%;">NAME</th>
                              <th class="dep-col-header" style="width: 24%;">DATE OF BIRTH</th>
                              <th class="dep-col-header" style="width: 12%;">AGE</th>
                              <th class="dep-col-header" style="width: 20%;">RELATIONSHIP</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${dependentsTableRowsHtml}
                          </tbody>
                        </table>

                        <div class="emergency-section">
                          <div class="emerg-left">
                            <div class="emerg-title">IN CASE OF EMERGENCY:</div>
                            <div class="emerg-field">
                              <span style="font-weight: 700; color: #0f172a;">Name:&nbsp;</span>
                              <span class="emerg-underline">&nbsp;</span>
                            </div>
                            <div class="emerg-row-split">
                              <div class="emerg-field" style="flex: 1;">
                                <span style="font-weight: 700; color: #0f172a;">Address:&nbsp;</span>
                                <span class="emerg-underline">${barangayName}, Mabini</span>
                              </div>
                              <div class="emerg-field" style="flex: 1;">
                                <span style="font-weight: 700; color: #0f172a; white-space: nowrap;">Contact Number:&nbsp;</span>
                                <span class="emerg-underline" style="font-family: monospace;">${record.contact_number || '&nbsp;'}</span>
                              </div>
                            </div>
                          </div>

                          ${
                            includeQrCode && qrCodeDataUrl
                              ? `
                              <div class="emerg-qr-box">
                                <img src="${qrCodeDataUrl}" alt="QR" class="emerg-qr-img" />
                              </div>
                            `
                              : ''
                          }
                        </div>
                      </div>

                      <div class="signatures-row">
                        <!-- Left: Municipal Mayor -->
                        <div class="official-sig-box">
                          <div class="official-sig-img">
                            <img src="${MAYOR_LUEGO_SIGNATURE_B64}" alt="Hon. Emerson L. Luego Signature" class="sig-mayor-img" />
                          </div>
                          <div class="official-sig-line"></div>
                          <div class="official-name">HON. EMERSON L. LUEGO</div>
                          <div class="official-role">MUNICIPAL MAYOR</div>
                        </div>

                        <!-- Right: C/MSWDO HEAD -->
                        <div class="official-sig-box">
                          <div class="official-sig-img">
                            <img src="${CHU_MSWDO_SIGNATURE_B64}" alt="Virgencita M. Chu Signature" class="sig-chu-img" />
                          </div>
                          <div class="official-sig-line"></div>
                          <div class="official-name">VIRGENCITA M. CHU, RSW, MPA</div>
                          <div class="official-role">C/MSWDO HEAD</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              `
                  : ''
              }
            </div>

            <div class="print-guide-footer">
              ✂ <strong>Official LGU Printing Guide:</strong> Print on standard Letter or A4 cardstock paper (Scale 100%). Cut along dashed outer borders and laminate back-to-back for official Municipal Solo Parent ID Card. Signatures authenticated by Hon. Emerson L. Luego and Virgencita M. Chu, RSW, MPA.
            </div>
          </div>
        </body>
      </html>
    `;

    doc.open();
    doc.write(printHtml);
    doc.close();

    // Trigger printing once DOM is ready
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 280);
  }

  return (
    <div
      id="solo-parent-id-card-modal-root"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-4 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static"
    >
      <div
        id="solo-parent-id-card-modal-dialog"
        className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col print:border-none print:shadow-none print:max-w-none print:w-full"
      >
        {/* Main Header */}
        <div className="print:hidden flex items-center justify-between border-b border-slate-100 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white leading-tight">
                  Official Solo Parent Identification Card
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Sparkles className="h-2.5 w-2.5" /> Official Signatures
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Municipality of Mabini • Province of Davao de Oro (RA 11861 Format)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl bg-[#945d65] px-4 py-2 text-xs font-bold text-white hover:bg-[#834d55] shadow transition active:scale-95 cursor-pointer"
            >
              <Printer className="h-4 w-4" /> Print Official Card
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Toolbar: View Filter, QR Toggle & Signature Confirmation */}
        <div className="print:hidden bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Card View Switcher */}
          <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveSide('both')}
              className={`px-3 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                activeSide === 'both'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Both Sides (Front & Back)
            </button>
            <button
              type="button"
              onClick={() => setActiveSide('front')}
              className={`px-3 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                activeSide === 'front'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Front Only
            </button>
            <button
              type="button"
              onClick={() => setActiveSide('back')}
              className={`px-3 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                activeSide === 'back'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Back Only (Signatures)
            </button>
          </div>

          {/* Quick Options */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-medium text-slate-700 hover:text-slate-900">
              <input
                type="checkbox"
                checked={includeQrCode}
                onChange={(e) => setIncludeQrCode(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
              />
              <QrCode className="h-3.5 w-3.5 text-teal-600" />
              <span>Include Anti-Fraud QR Code</span>
            </label>

            <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium border-l border-slate-300 pl-3">
              <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
              Mayor Emerson Luego & Ma'am Virgencita Chu
            </span>
          </div>
        </div>

        {/* Revoked Notice Banner */}
        {isRevoked && (
          <div className="print:hidden bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs text-rose-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-rose-600 shrink-0" />
              <span>
                <strong>Notice:</strong> This ID has been <strong>REVOKED / TERMINATED</strong> (
                {record.revocation_reason || 'Naminyo / Re-married'}). Privileges are invalid.
              </span>
            </div>
            <span className="rounded bg-rose-200 text-rose-900 px-2 py-0.5 text-[10px] font-bold">
              REVOKED / VOID
            </span>
          </div>
        )}

        {/* Main Printable / Digital Preview Area */}
        <div
          id="solo-parent-id-card-print-area"
          className="p-5 sm:p-6 bg-slate-100/90 overflow-y-auto max-h-[80vh] flex flex-col items-center print:bg-white print:p-0 print:max-h-none print:overflow-visible"
        >
          {/* Instructions banner */}
          <div className="print:hidden text-center mb-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200/90 px-3.5 py-1 text-[11px] font-bold text-slate-800 shadow-2xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-teal-700" />
              Official Mabini MSWDO Digital & Physical ID Card Format
            </span>
          </div>

          <div className="flex flex-col lg:flex-row items-center justify-center gap-6 w-full flex-wrap">
            {/* FRONT OF THE CARD */}
            {(activeSide === 'both' || activeSide === 'front') && (
              <div className="flex flex-col items-center">
                <span className="print:hidden text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Front of ID Card
                </span>
                <div className="w-[380px] sm:w-[395px] min-h-[260px] sm:min-h-[270px] rounded-xl border border-slate-300 bg-white shadow-lg p-2.5 relative text-slate-900 font-sans flex flex-col justify-between select-none">
                  {/* Revoked Watermark */}
                  {isRevoked && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                      <div className="border-4 border-rose-600/70 rounded-xl px-5 py-2 text-rose-600/85 font-black text-xl uppercase tracking-widest -rotate-12 bg-white/80 shadow-sm backdrop-blur-2xs">
                        REVOKED / VOID
                      </div>
                    </div>
                  )}

                  {/* Top Section */}
                  <div>
                    <div className="flex items-center justify-between gap-1.5 pb-0.5">
                      <img
                        src="/davao-de-oro-logo.png"
                        alt="Davao de Oro Seal"
                        className="h-10 w-10 object-contain shrink-0"
                      />
                      <div className="text-center flex-1 leading-tight">
                        <p className="text-[9.5px] font-black uppercase tracking-tight text-slate-900">
                          REPUBLIC OF THE PHILIPPINES
                        </p>
                        <p className="text-[8.5px] font-semibold text-slate-700">
                          Province of Davao de Oro
                        </p>
                        <p className="text-[8.5px] font-semibold text-slate-700">
                          Solo Parent Office / Division of Mabini
                        </p>
                      </div>
                      <img
                        src="/mswdo-logo.png"
                        alt="MSWDO Logo"
                        className="h-10 w-10 object-contain shrink-0"
                      />
                    </div>

                    {/* Ribbon Banner */}
                    <div className="bg-[#945d65] text-white text-center font-black text-[9px] uppercase tracking-wider py-0.5 mt-0.5 shadow-xs">
                      SOLO PARENT IDENTIFICATION CARD
                    </div>

                    {/* ID No line */}
                    <div className="text-right text-[8.5px] font-bold text-slate-900 mt-1">
                      ID No.{' '}
                      <span className="border-b border-slate-900 font-mono font-black text-[9px] px-2 inline-block min-w-[100px] text-center text-[#945d65]">
                        {record.id_number}
                      </span>
                    </div>
                  </div>

                  {/* Body: Photo & Fields */}
                  <div className="flex gap-2.5 items-start mt-0.5">
                    {/* Photo frame */}
                    <div className="w-[78px] h-[90px] border border-slate-400 bg-slate-50 flex flex-col items-center justify-center text-center p-1 shrink-0 rounded-xs">
                      <User className="h-8 w-8 text-slate-300 mb-0.5" />
                      <span className="text-[7px] font-bold uppercase text-slate-500">
                        1x1 ID picture
                      </span>
                    </div>

                    {/* Fields Area */}
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5 text-left">
                      <div className="text-center">
                        <span className="border-b border-slate-900 font-black text-[10px] text-slate-900 uppercase block truncate leading-tight pb-0.5">
                          {record.full_name}
                        </span>
                        <span className="text-[7px] font-bold uppercase text-slate-500 block -mt-0.5">
                          NAME
                        </span>
                      </div>

                      <div className="text-[8px] flex items-baseline leading-tight">
                        <span className="font-bold text-slate-900 whitespace-nowrap">
                          Date and Place of Birth:&nbsp;
                        </span>
                        <span className="border-b border-slate-400 font-semibold text-slate-800 flex-1 truncate pl-1">
                          {record.birthdate || 'N/A'}, Mabini
                        </span>
                      </div>

                      <div className="text-[8px] flex items-baseline leading-tight">
                        <span className="font-bold text-slate-900 whitespace-nowrap">
                          Address:&nbsp;
                        </span>
                        <span className="border-b border-slate-400 font-semibold text-slate-800 flex-1 truncate pl-1">
                          {record.purok_sitio ? `${record.purok_sitio}, ` : ''}
                          {barangayName}, Mabini
                        </span>
                      </div>

                      <div className="text-[8px] flex items-baseline leading-tight">
                        <span className="font-bold text-slate-900 whitespace-nowrap">
                          Solo Parent Category:&nbsp;
                        </span>
                        <span className="border-b border-slate-400 font-semibold text-slate-800 flex-1 truncate pl-1">
                          {categoryLabel}
                        </span>
                      </div>

                      <div className="text-[8px] flex items-baseline leading-tight">
                        <span className="font-bold text-slate-900 whitespace-nowrap">
                          Benefit Qualification Code:&nbsp;
                        </span>
                        <span className="border-b border-slate-400 font-semibold text-slate-800 flex-1 truncate pl-1">
                          {benefitCode}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row */}
                  <div className="flex items-end justify-between text-[7px] pt-1">
                    <div className="text-slate-700 leading-tight">
                      <p>This card is non-transferable and</p>
                      <p>
                        valid until{' '}
                        <span className="border-b border-slate-900 font-bold text-rose-700 px-1">
                          {record.expires_at}
                        </span>
                      </p>
                    </div>

                    <div className="text-center w-36">
                      <div className="border-b border-slate-900 w-full mb-0.5" />
                      <p className="text-[7px] text-slate-600">
                        Signature or thumbprint of solo parent
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* BACK OF THE CARD */}
            {(activeSide === 'both' || activeSide === 'back') && (
              <div className="flex flex-col items-center">
                <span className="print:hidden text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                  <span>Back of ID Card</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-300">
                    Official Signatures Applied
                  </span>
                </span>

                {/* Double frame matching official card */}
                <div className="w-[380px] sm:w-[395px] min-h-[260px] sm:min-h-[270px] rounded-xl border-1.5 border-slate-900 bg-white shadow-lg p-[3px] relative text-slate-900 font-sans select-none flex flex-col justify-between">
                  <div className="w-full flex-1 border-1.5 border-slate-900 rounded-lg p-2 sm:p-2.5 flex flex-col justify-between relative">
                    {/* Revoked Watermark */}
                    {isRevoked && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                        <div className="border-4 border-rose-600/70 rounded-xl px-5 py-2 text-rose-600/85 font-black text-xl uppercase tracking-widest -rotate-12 bg-white/80 shadow-sm backdrop-blur-2xs">
                          REVOKED / VOID
                        </div>
                      </div>
                    )}

                    {/* Top: Dependents Table */}
                    <div>
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr>
                            <th
                              colSpan={4}
                              className="border border-slate-900 bg-slate-100 text-center font-black text-[7.5px] uppercase tracking-wider py-0.5 text-slate-900"
                            >
                              CHILD/REN/DEPENDENT/S
                            </th>
                          </tr>
                          <tr className="bg-slate-50 text-[6.5px] font-black uppercase text-slate-800 text-center">
                            <th className="border border-slate-900 py-0.5 px-1 text-left w-[44%]">
                              NAME
                            </th>
                            <th className="border border-slate-900 py-0.5 px-1 w-[24%]">
                              DATE OF BIRTH
                            </th>
                            <th className="border border-slate-900 py-0.5 px-1 w-[12%]">AGE</th>
                            <th className="border border-slate-900 py-0.5 px-1 w-[20%]">
                              RELATIONSHIP
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {fiveRows.map((dep, idx) => (
                            <tr key={idx} className="text-[7px] text-slate-800 h-[12.5px]">
                              <td className="border border-slate-900 px-1 py-0.2 font-bold truncate max-w-[140px]">
                                {dep?.full_name || '\u00A0'}
                              </td>
                              <td className="border border-slate-900 px-1 py-0.2 text-center">
                                {dep?.birthdate || '\u00A0'}
                              </td>
                              <td className="border border-slate-900 px-1 py-0.2 text-center font-bold">
                                {dep?.age ? `${dep.age}` : '\u00A0'}
                              </td>
                              <td className="border border-slate-900 px-1 py-0.2 text-center">
                                {dep?.relationship || '\u00A0'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Middle: Emergency Contact & Optional QR Code */}
                      <div className="flex justify-between items-center pt-1.5 text-[7px] border-t border-slate-200 mt-1 gap-2">
                        <div className="flex-1 flex flex-col gap-0.5">
                          <p className="font-black text-slate-900 text-[7px] uppercase tracking-wide">
                            IN CASE OF EMERGENCY:
                          </p>
                          <p className="flex items-baseline leading-tight">
                            <span className="font-bold text-slate-800">Name:&nbsp;</span>
                            <span className="border-b border-slate-900 flex-1 min-w-[70px]">
                              &nbsp;
                            </span>
                          </p>
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="flex items-baseline leading-tight flex-1">
                              <span className="font-bold text-slate-800">Address:&nbsp;</span>
                              <span className="border-b border-slate-900 flex-1 min-w-[50px] text-slate-700 truncate">
                                {barangayName}, Mabini
                              </span>
                            </p>
                            <p className="flex items-baseline leading-tight flex-1">
                              <span className="font-bold text-slate-800 whitespace-nowrap">Contact Number:&nbsp;</span>
                              <span className="border-b border-slate-900 flex-1 min-w-[50px] font-mono font-bold text-slate-900">
                                {record.contact_number || '\u00A0'}
                              </span>
                            </p>
                          </div>
                        </div>

                        {/* Pure Clean Black-Framed QR Code without extra words */}
                        {includeQrCode && qrCodeDataUrl && (
                          <div className="p-0.5 bg-white border border-slate-900 rounded-xs shrink-0 flex items-center justify-center">
                            <img
                              src={qrCodeDataUrl}
                              alt="QR Code"
                              className="h-9 w-9 sm:h-10 sm:w-10 object-contain block"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom: Official Signatures Row */}
                    <div className="flex justify-between items-end pt-1 border-t border-slate-200 mt-2">
                      {/* Left: Municipal Mayor Hon. Emerson L. Luego */}
                      <div className="w-[145px] sm:w-[155px] flex flex-col items-center text-center">
                        <div className="h-10 flex items-end justify-center w-full relative">
                          <img
                            src={MAYOR_LUEGO_SIGNATURE_SRC}
                            alt="Hon. Emerson L. Luego Signature"
                            className="h-10 max-w-[115px] object-contain select-none pointer-events-none translate-y-[15px] z-10 filter contrast-125 brightness-90"
                          />
                        </div>
                        {/* Official Signature Line above Name */}
                        <div
                          className="w-full my-0.5 relative z-1"
                          style={{ borderTop: '1.2px solid #0f172a' }}
                        />
                        <p className="text-[8px] sm:text-[8.5px] font-black uppercase text-slate-900 leading-tight tracking-tight mt-0.5 whitespace-nowrap">
                          HON. EMERSON L. LUEGO
                        </p>
                        <p className="text-[7px] sm:text-[7.5px] font-black uppercase text-slate-900 leading-tight tracking-wide">
                          MUNICIPAL MAYOR
                        </p>
                      </div>

                      {/* Right: C/MSWDO HEAD Virgencita Chu */}
                      <div className="w-[145px] sm:w-[155px] flex flex-col items-center text-center">
                        <div className="h-10 flex items-end justify-center w-full relative">
                          <img
                            src={CHU_MSWDO_SIGNATURE_SRC}
                            alt="Virgencita M. Chu Signature"
                            className="h-10 max-w-[85px] object-contain select-none pointer-events-none translate-y-2 z-10 filter contrast-125 brightness-90"
                          />
                        </div>
                        {/* Official Signature Line above Name */}
                        <div
                          className="w-full my-0.5 relative z-1"
                          style={{ borderTop: '1.2px solid #0f172a' }}
                        />
                        <p className="text-[8px] sm:text-[8.5px] font-black uppercase text-slate-900 leading-tight tracking-tight mt-0.5 whitespace-nowrap">
                          VIRGENCITA M. CHU, RSW, MPA
                        </p>
                        <p className="text-[7px] sm:text-[7.5px] font-black uppercase text-slate-900 leading-tight tracking-wide">
                          C/MSWDO HEAD
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Global Print fallback for Ctrl+P */}
        <style jsx global>{`
          @media print {
            body {
              background: #ffffff !important;
              color: #000000 !important;
            }
            header,
            nav,
            aside,
            .civic-topbar,
            .print\\:hidden {
              display: none !important;
            }
            #solo-parent-id-card-modal-root {
              position: static !important;
              background: transparent !important;
              padding: 0 !important;
              margin: 0 !important;
              overflow: visible !important;
            }
            #solo-parent-id-card-modal-dialog {
              border: none !important;
              box-shadow: none !important;
              max-width: 100% !important;
              width: 100% !important;
              overflow: visible !important;
            }
            #solo-parent-id-card-print-area {
              background: transparent !important;
              max-height: none !important;
              overflow: visible !important;
              padding: 10px !important;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
