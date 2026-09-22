'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TrendingUp, Package, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getInventoryItems } from '@/lib/db/inventory';
import { computeBodegaStats } from '@/lib/inventory-audit';
import { ForecastingInsightsCard } from '@/components/forecasting/ForecastingInsightsCard';
import { MSWDO_CONSTANTS } from '@/lib/forecasting/demand-predictor';

export default function ForecastingDesktop() {
  const router = useRouter();
  const user = getCurrentUser();
  const [currentStockpile, setCurrentStockpile] = useState<number>(
    MSWDO_CONSTANTS.MDRRMO_BODEGA_STOCKPILE_BUFFER
  );
  const [totalItemTypes, setTotalItemTypes] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadStockpile = useCallback(async () => {
    if (!user || !hasPermission('view_reports')) {
      router.push('/dashboard');
      return;
    }

    try {
      setIsLoading(true);
      const items = await getInventoryItems();
      const stats = computeBodegaStats(items);
      if (stats.ffpStock && stats.ffpStock > 0) {
        setCurrentStockpile(stats.ffpStock);
      }
      setTotalItemTypes(stats.totalItemTypes);
    } catch (err) {
      console.warn('Could not fetch bodega inventory for forecasting:', err);
    } finally {
      setIsLoading(false);
    }
  }, [router, user]);

  useEffect(() => {
    void loadStockpile();
  }, [loadStockpile]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-cyan-950 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider text-cyan-300 shadow-sm ring-1 ring-cyan-800">
            E-MABINI
          </span>
          <span className="text-xl font-light text-slate-300">|</span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Relief Demand Forecasting & Simulation
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <Sparkles className="h-3 w-3" />
                Active Model
              </span>
            </div>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              MSWDO disaster demand projections, baseline model MAPE evaluation, and bodega stockpile readiness.
            </p>
          </div>
        </div>

        {/* Action button to Bodega */}
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Package className="h-4 w-4 text-slate-500" />
            <span>Bodega Inventory ({totalItemTypes} types)</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
        </div>
      </div>

      {/* Main Dedicated Forecasting Card */}
      <div className="relative">
        <ForecastingInsightsCard
          currentStockpile={currentStockpile}
          className="shadow-sm"
        />
      </div>
    </div>
  );
}
