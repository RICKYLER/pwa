'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getInventoryItems, createInventoryItem, getLowStockItems } from '@/lib/db/inventory';
import { InventoryItem } from '@/lib/db/schema';
import { Plus, AlertTriangle, Package, X, Search } from 'lucide-react';

const CAT_CFG: Record<string, { label: string; dot: string; bg: string; color: string; ring: string }> = {
    food: { label: 'Food', dot: 'bg-emerald-500', bg: 'bg-emerald-50', color: 'text-emerald-700', ring: 'ring-emerald-200' },
    medicine: { label: 'Medicine', dot: 'bg-blue-500', bg: 'bg-blue-50', color: 'text-blue-700', ring: 'ring-blue-200' },
    hygiene: { label: 'Hygiene', dot: 'bg-violet-500', bg: 'bg-violet-50', color: 'text-violet-700', ring: 'ring-violet-200' },
    clothing: { label: 'Clothing', dot: 'bg-orange-500', bg: 'bg-orange-50', color: 'text-orange-700', ring: 'ring-orange-200' },
    blankets: { label: 'Blankets', dot: 'bg-indigo-500', bg: 'bg-indigo-50', color: 'text-indigo-700', ring: 'ring-indigo-200' },
    other: { label: 'Other', dot: 'bg-slate-400', bg: 'bg-slate-50', color: 'text-slate-600', ring: 'ring-slate-200' },
};
const LOW_STOCK = 10;

export default function InventoryDesktop() {
    const router = useRouter();
    const user = getCurrentUser();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
    const [filterCat, setFilterCat] = useState('all');
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [form, setForm] = useState({ item_name: '', category: 'food' as const, quantity_available: 0, unit: 'pcs' as const, expiration_date: '', notes: '' });

    useEffect(() => {
        if (!user || !hasPermission('view_reports')) { router.push('/dashboard'); return; }
        load();
    }, [user, router]);

    async function load() {
        setIsLoading(true);
        const [inv, ls] = await Promise.all([getInventoryItems(), getLowStockItems()]);
        setItems(inv); setLowStock(ls); setIsLoading(false);
    }

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        await createInventoryItem({ ...form, quantity_available: parseInt(form.quantity_available.toString()) });
        setForm({ item_name: '', category: 'food', quantity_available: 0, unit: 'pcs', expiration_date: '', notes: '' });
        setShowForm(false);
        await load();
    }

    if (!user) return null;

    const displayed = items.filter(i => (filterCat === 'all' || i.category === filterCat) && (!search || i.item_name.toLowerCase().includes(search.toLowerCase())));
    const maxQty = Math.max(...items.map(i => i.quantity_available), 1);
    const totalUnits = items.reduce((s, i) => s + i.quantity_available, 0);
    const hasFilters = search || filterCat !== 'all';

    return (
        <div className="p-8 max-w-[1400px] mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
                    <p className="text-sm text-slate-500 mt-0.5">{items.length} item types · {totalUnits.toLocaleString()} total units</p>
                </div>
                {hasPermission('manage_inventory') && (
                    <button onClick={() => setShowForm(!showForm)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all shadow-md hover:-translate-y-px ${showForm ? 'bg-slate-200 text-slate-700 shadow-slate-200/50' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-amber-500/25'}`}>
                        {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {showForm ? 'Cancel' : 'Add Item'}
                    </button>
                )}
            </div>

            {/* Low stock alert */}
            {lowStock.length > 0 && !isLoading && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-amber-900">{lowStock.length} item{lowStock.length !== 1 ? 's' : ''} low on stock (under {LOW_STOCK} units)</p>
                        <p className="text-xs text-amber-700 mt-0.5">{lowStock.map(i => i.item_name).join(', ')}</p>
                    </div>
                </div>
            )}

            {/* Add form — 4 col */}
            {showForm && (
                <div className="bg-white border border-slate-200/60 rounded-2xl shadow-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <p className="font-bold text-slate-800">Add New Inventory Item</p>
                        <button onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-4 h-4" /></button>
                    </div>
                    <form onSubmit={handleAdd} className="p-6">
                        <div className="grid grid-cols-4 gap-4 mb-4">
                            <div className="col-span-2">
                                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Item Name *</label>
                                <input type="text" required placeholder="e.g. Rice 5kg" value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })}
                                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all" />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Category *</label>
                                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as any })}
                                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30 appearance-none">
                                    {Object.entries(CAT_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Quantity *</label>
                                <input type="number" required min={0} placeholder="0" value={form.quantity_available} onChange={e => setForm({ ...form, quantity_available: parseInt(e.target.value) || 0 })}
                                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all" />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all shadow-md shadow-amber-500/20 hover:-translate-y-px">
                                Add to Inventory
                            </button>
                            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-xl transition-all">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Filters row */}
            <div className="flex items-center gap-3">
                <div className="relative w-72">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                    {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
                </div>
                <div className="flex gap-1.5 flex-1 overflow-x-auto pb-0">
                    <button onClick={() => setFilterCat('all')}
                        className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${filterCat === 'all' ? 'bg-slate-800 text-white shadow' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        All <span className="ml-1">{items.length}</span>
                    </button>
                    {Object.entries(CAT_CFG).map(([k, v]) => {
                        const count = items.filter(i => i.category === k).length;
                        return (
                            <button key={k} onClick={() => setFilterCat(k)}
                                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${filterCat === k ? `${v.bg} ${v.color} ring-1 ${v.ring} shadow` : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                                <span className={`w-2 h-2 rounded-full ${v.dot}`} />{v.label}
                                <span className="text-[10px] opacity-70">{count}</span>
                            </button>
                        );
                    })}
                </div>
                {hasFilters && <button onClick={() => { setSearch(''); setFilterCat('all'); }} className="text-xs text-amber-500 hover:text-amber-700 font-semibold whitespace-nowrap">Clear</button>}
            </div>

            {/* 3-col Grid */}
            {isLoading ? (
                <div className="grid grid-cols-3 gap-3">
                    {[...Array(9)].map((_, i) => <div key={i} className="bg-white rounded-2xl border border-slate-200/60 p-5 animate-pulse h-32" />)}
                </div>
            ) : displayed.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                    {displayed.map(item => {
                        const cfg = CAT_CFG[item.category] || CAT_CFG.other;
                        const isLow = item.quantity_available < LOW_STOCK;
                        return (
                            <div key={item.id} className={`bg-white border rounded-2xl p-5 transition-all hover:shadow-md ${isLow ? 'border-red-200 bg-red-50/20' : 'border-slate-200/60'}`}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                                        <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-semibold text-slate-900 text-sm">{item.item_name}</p>
                                            {isLow && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full ring-1 ring-red-200">Low stock</span>}
                                        </div>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color} ring-1 ${cfg.ring} mt-1`}>
                                            <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />{cfg.label}
                                        </span>
                                    </div>
                                </div>
                                <div className="mb-2">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs text-slate-500">Stock level</span>
                                        <span className="text-lg font-bold text-slate-800">{item.quantity_available} <span className="text-sm font-normal text-slate-400">{item.unit}</span></span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-700 ${isLow ? 'bg-red-400' : 'bg-gradient-to-r from-amber-400 to-orange-500'}`}
                                            style={{ width: `${Math.min((item.quantity_available / maxQty) * 100, 100)}%` }} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-700 font-semibold mb-1">No items found</p>
                    <p className="text-slate-400 text-sm mb-5">Clear filters or add your first item</p>
                    {hasFilters && <button onClick={() => { setSearch(''); setFilterCat('all'); }} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Clear filters</button>}
                </div>
            )}
        </div>
    );
}
