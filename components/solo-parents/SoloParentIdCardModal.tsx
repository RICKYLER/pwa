'use client';

import React from 'react';
import { X, Printer, QrCode, ShieldCheck, Heart, User, CheckCircle2, Ban, AlertTriangle } from 'lucide-react';
import type { SoloParentRecord } from '@/lib/db/schema';
import { SOLO_PARENT_CATEGORY_LABELS } from '@/lib/solo-parents/rosp-exporter';
import { getBarangayName } from '@/lib/mabini-barangays';

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
  if (!isOpen || !record) return null;

  const categoryLabel = SOLO_PARENT_CATEGORY_LABELS[record.category] || record.category;
  const barangayName = getBarangayName(record.barangay_id);

  function handlePrint() {
    window.print();
  }

  // QR Code payload data
  const qrVerificationData = JSON.stringify({
    id: record.id_number,
    name: record.full_name,
    brgy: barangayName,
    exp: record.expires_at,
    subsidy: record.is_minimum_wage_or_below ? 'YES' : 'NO',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header (No print) */}
        <div className="print:hidden flex items-center justify-between border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-teal-400" />
            <div>
              <h2 className="text-base font-bold">Printable Official Solo Parent ID Card</h2>
              <p className="text-xs text-slate-400">
                Republic Act 11861 Compliant ID Layout (Front & Back)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-500 shadow transition"
            >
              <Printer className="h-4 w-4" /> Print Card
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Revoked Notice Banner */}
        {record.status === 'revoked' && (
          <div className="print:hidden bg-rose-50 border-b border-rose-200 px-6 py-3 text-xs text-rose-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-rose-600 shrink-0" />
              <span>
                <strong>Notice:</strong> This ID has been <strong>REVOKED / TERMINATED</strong> ({record.revocation_reason || 'Naminyo / Re-married'}). Privileges are invalid.
              </span>
            </div>
            <span className="rounded bg-rose-200 text-rose-900 px-2 py-0.5 text-[10px] font-bold">
              REVOKED / VOID
            </span>
          </div>
        )}

        {/* Printable Area */}
        <div className="p-6 bg-slate-100 space-y-6 overflow-y-auto max-h-[80vh] flex flex-col items-center">
          {/* Card Container for Print */}
          <div className="space-y-6 w-full max-w-md">
            {/* FRONT OF THE CARD */}
            <div className="rounded-2xl border-2 border-slate-300 bg-white shadow-md overflow-hidden p-4 relative text-slate-900 font-sans">
              {/* Revoked Watermark */}
              {record.status === 'revoked' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                  <div className="border-4 border-rose-600/70 rounded-xl px-6 py-2 text-rose-600/80 font-black text-2xl uppercase tracking-widest -rotate-12 bg-white/70 shadow-sm backdrop-blur-2xs select-none">
                    REVOKED / VOID
                  </div>
                </div>
              )}
              {/* Header with Republic of the Philippines */}
              <div className="text-center border-b border-slate-200 pb-2">
                <p className="text-[9px] uppercase tracking-wider font-semibold text-slate-500">
                  Republic of the Philippines • Municipality of Mabini
                </p>
                <h3 className="text-xs font-black uppercase text-teal-900 tracking-tight">
                  Municipal Social Welfare & Development Office
                </h3>
                <div className="inline-block bg-teal-800 text-white font-extrabold text-[10px] px-3 py-0.5 rounded-full mt-1 uppercase tracking-wider">
                  SOLO PARENT IDENTIFICATION CARD
                </div>
              </div>

              {/* Card Body */}
              <div className="flex gap-3.5 mt-3 items-center">
                {/* Photo frame */}
                <div className="flex flex-col items-center">
                  <div className="h-28 w-24 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 text-center p-1">
                    <User className="h-10 w-10 text-slate-300 mb-1" />
                    <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                      1x1 / 2x2 Photo
                    </span>
                  </div>
                  <span className="text-[9px] font-bold text-teal-900 mt-1 uppercase">
                    RA 11861
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 text-left space-y-1">
                  <div>
                    <span className="text-[8.5px] uppercase font-bold text-slate-400 block leading-tight">
                      Card ID Number
                    </span>
                    <span className="text-sm font-mono font-black text-teal-900 leading-tight">
                      {record.id_number}
                    </span>
                  </div>

                  <div>
                    <span className="text-[8.5px] uppercase font-bold text-slate-400 block leading-tight">
                      Name of Solo Parent
                    </span>
                    <span className="text-xs font-bold text-slate-900 uppercase block truncate leading-tight">
                      {record.full_name}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <div>
                      <span className="text-[8.5px] uppercase font-bold text-slate-400 block">
                        Birthdate
                      </span>
                      <span className="font-semibold text-slate-800">{record.birthdate}</span>
                    </div>
                    <div>
                      <span className="text-[8.5px] uppercase font-bold text-slate-400 block">
                        Gender
                      </span>
                      <span className="font-semibold text-slate-800">
                        {record.gender === 'F' ? 'Female' : 'Male'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[8.5px] uppercase font-bold text-slate-400 block">
                      Address / Barangay
                    </span>
                    <span className="text-[10.5px] font-semibold text-slate-800 block truncate">
                      {record.purok_sitio ? `${record.purok_sitio}, ` : ''}
                      {barangayName}
                    </span>
                  </div>

                  <div>
                    <span className="text-[8.5px] uppercase font-bold text-slate-400 block">
                      Category
                    </span>
                    <span className="text-[10px] font-bold text-slate-700 block truncate">
                      {categoryLabel}
                    </span>
                  </div>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center justify-center p-1 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="h-16 w-16 bg-white border border-slate-300 flex items-center justify-center p-1">
                    {/* Simulated SVG QR */}
                    <QrCode className="h-14 w-14 text-slate-800" />
                  </div>
                  <span className="text-[7.5px] font-mono font-bold text-slate-500 mt-0.5">
                    VERIFIED
                  </span>
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between text-[9px] text-slate-600">
                <div>
                  <span className="text-slate-400 font-medium">Issued: </span>
                  <span className="font-bold text-slate-800">{record.issued_at}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Valid Until: </span>
                  <span className="font-bold text-rose-700">{record.expires_at}</span>
                </div>
                {record.is_minimum_wage_or_below && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[8px] font-bold text-emerald-800">
                    ₱1k Subsidy Tagged
                  </span>
                )}
              </div>
            </div>

            {/* BACK OF THE CARD */}
            <div className="rounded-2xl border-2 border-slate-300 bg-white shadow-md overflow-hidden p-4 relative text-slate-900 font-sans">
              {/* Revoked Watermark */}
              {record.status === 'revoked' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                  <div className="border-4 border-rose-600/70 rounded-xl px-6 py-2 text-rose-600/80 font-black text-2xl uppercase tracking-widest -rotate-12 bg-white/70 shadow-sm backdrop-blur-2xs select-none">
                    REVOKED / VOID
                  </div>
                </div>
              )}
              <div className="text-center border-b border-slate-200 pb-1.5">
                <h4 className="text-[10.5px] font-black uppercase text-teal-900 tracking-wider">
                  QUALIFIED DEPENDENT CHILDREN (RA 11861)
                </h4>
                <p className="text-[8.5px] text-slate-500">
                  Dependents entitled to benefits under the custody of the Solo Parent
                </p>
              </div>

              {/* Table of Dependents */}
              <div className="mt-2 min-h-[90px]">
                <table className="w-full text-left text-[9.5px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase text-[8px]">
                      <th className="py-1">Name of Child</th>
                      <th className="py-1">Birthdate</th>
                      <th className="py-1">Age</th>
                      <th className="py-1">Relation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {record.dependents.slice(0, 4).map((dep, i) => (
                      <tr key={i} className="text-slate-800">
                        <td className="py-1 font-bold truncate max-w-[140px]">{dep.full_name}</td>
                        <td className="py-1">{dep.birthdate}</td>
                        <td className="py-1 font-semibold">{dep.age} y/o</td>
                        <td className="py-1">{dep.relationship}</td>
                      </tr>
                    ))}
                    {record.dependents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-2 text-center text-slate-400 italic">
                          No dependent registered
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Signatures & Conditions */}
              <div className="mt-3 pt-2 border-t border-slate-200 grid grid-cols-2 gap-4 text-center">
                <div className="pt-3">
                  <div className="border-t border-slate-800 mx-2" />
                  <p className="text-[9px] font-bold uppercase text-slate-900 mt-0.5">
                    Municipal Mayor
                  </p>
                  <p className="text-[7.5px] text-slate-500">Municipality of Mabini</p>
                </div>
                <div className="pt-3">
                  <div className="border-t border-slate-800 mx-2" />
                  <p className="text-[9px] font-bold uppercase text-slate-900 mt-0.5">
                    MSWDO Officer
                  </p>
                  <p className="text-[7.5px] text-slate-500">Solo Parent Focal Person</p>
                </div>
              </div>

              <div className="mt-2 text-center">
                <p className="text-[7.5px] text-slate-400 italic">
                  Non-transferable. Valid only when presented with proper identification.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Print Stylesheet injection */}
        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden;
            }
            .fixed,
            .fixed * {
              visibility: visible;
            }
            .fixed {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              height: auto;
              background: transparent !important;
              padding: 0 !important;
              box-shadow: none !important;
            }
            .print\\:hidden {
              display: none !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
