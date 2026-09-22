'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TrendingUp, Package, ArrowRight } from 'lucide-react';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getInventoryItems } from '@/lib/db/inventory';
import { computeBodegaStats } from '@/lib/inventory-audit';
import { ForecastingInsightsCard } from '@/components/forecasting/ForecastingInsightsCard';
import { MSWDO_CONSTANTS } from '@/lib/forecasting/demand-predictor';

export default function ForecastingMobile() {
  const router = useRouter();
  const user = getCurrentUser();
  const [currentStockpile, setCurrentStockpile] = useState<number>(
    MSWDO_CONSTANTS.MDRRMO_BODEGA_STOCKPILE_BUFFER
  );

  const loadStockpile = useCallback(async () => {
    if (!user || !hasPermission('view_reports')) {
      router.push('/dashboard');
      return;
    }

    try {
      const items = await getInventoryItems();
      const stats = computeBodegaStats(items);
      if (stats.ffpStock && stats.ffpStock > 0) {
        setCurrentStockpile(stats.ffpStock);
      }
    } catch (err) {
      console.warn('Could not fetch bodega inventory for mobile forecasting:', err);
    }
  }, [router, user]);

  useEffect(() => {
    void loadStockpile();
  }, [loadStockpile]);

  if (!user) return null;

  return (
    <div className="space-y-4 px-3 py-4">
      {/* Mobile Top Header */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-950 text-cyan-200 shadow-sm">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-950">Relief Forecasting</h1>
            <p className="text-[10px] text-slate-500">MDRRMO Demand & Buffer</p>
          </div>
        </div>
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
        >
          <Package className="h-3.5 w-3.5 text-slate-500" />
          <span>Bodega</span>
          <ArrowRight className="h-3 w-3 text-slate-400" />
        </Link>
      </div>

      {/* Main Forecasting Card */}
      <ForecastingInsightsCard
        currentStockpile={currentStockpile}
        className="shadow-sm"
      />
    </div>
  );
}
