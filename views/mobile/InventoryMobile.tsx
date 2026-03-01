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

export default function InventoryMobile() {
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

    const displayed = items.filter(
        i => (filterCat === 'all' || i.category === filterCat) &&
            (!search || i.item_name.toLowerCase().includes(search.toLowerCase()))
    );
    const maxQty = Math.max(...items.map(i => i.quantity_available), 1);

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-slate-900">Inventory</h1>
                    <p className="text-xs text-slate-400">{items.length} item types</p>
                </div>
                {hasPermission('manage_inventory') && (
                    <button onClick={() => setShowForm(!showForm)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-md transition-all
              ${showForm ? 'bg-slate-200 text-slate-700' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-amber-500/25'}`}>
                        {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </button>
                )}
            </div>

            {/* Low stock banner */}
            {lowStock.length > 0 && !isLoading && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-semibold text-amber-900">{lowStock.length} item{lowStock.length !== 1 ? 's' : ''} low on stock</p>
                        <p className="text-[10px] text-amber-700 mt-0.5">{lowStock.slice(0, 3).map(i => i.item_name).join(', ')}{lowStock.length > 3 ? ` +${lowStock.length - 3}` : ''}</p>
                    </div>
                </div>
            )}

            {/* Add form */}
            {showForm && (
                <form onSubmit={handleAdd} className="bg-white border border-slate-200/60 rounded-2xl shadow-lg p-4 space-y-3">
                    <p className="font-bold text-slate-800 text-sm mb-1">Add New Item</p>
                    <input type="text" required placeholder="Item name *" value={form.item_name}
                        onChange={e => setForm({ ...form, item_name: e.target.value })}
                        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                    <div className="grid grid-cols-2 gap-2">
                        <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as any })}
                            className="px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30 appearance-none">
                            {Object.entries(CAT_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <input type="number" required min={0} placeholder="Qty" value={form.quantity_available}
                            onChange={e => setForm({ ...form, quantity_available: parseInt(e.target.value) || 0 })}
                            className="px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                    </div>
                    <button type="submit" className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold rounded-xl">
                        Add to Inventory
                    </button>
                </form>
            )}

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
            </div>

            {/* Category pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                <button onClick={() => setFilterCat('all')}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all
            ${filterCat === 'all' ? 'bg-slate-800 text-white shadow' : 'bg-white border border-slate-200 text-slate-500'}`}>
                    All <span className="ml-1 text-[10px]">{items.length}</span>
                </button>
                {Object.entries(CAT_CFG).map(([k, v]) => {
                    const count = items.filter(i => i.category === k).length;
                    return (
                        <button key={k} onClick={() => setFilterCat(k)}
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all
                ${filterCat === k ? `${v.bg} ${v.color} ring-1 ${v.ring} shadow` : 'bg-white border border-slate-200 text-slate-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />{v.label}
                            <span className="text-[10px]">{count}</span>
                        </button>
                    );
                })}
            </div>

            {/* Item list */}
            {isLoading ? (
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => <div key={i} className="bg-white rounded-2xl border border-slate-200/60 p-4 animate-pulse h-16" />)}
                </div>
            ) : displayed.length > 0 ? (
                <div className="space-y-2">
                    {displayed.map(item => {
                        const cfg = CAT_CFG[item.category] || CAT_CFG.other;
                        const isLow = item.quantity_available < LOW_STOCK;
                        return (
                            <div key={item.id} className={`flex items-center gap-3 bg-white border rounded-2xl p-4 ${isLow ? 'border-red-200' : 'border-slate-200/60'}`}>
                                <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="font-semibold text-slate-900 text-sm">{item.item_name}</p>
                                        {isLow && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full ring-1 ring-red-200">Low</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="flex-1 max-w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${isLow ? 'bg-red-400' : 'bg-gradient-to-r from-amber-400 to-orange-500'}`}
                                                style={{ width: `${Math.min((item.quantity_available / maxQty) * 100, 100)}%` }} />
                                        </div>
                                        <span className="text-sm font-bold text-slate-800">{item.quantity_available} <span className="text-xs text-slate-400 font-normal">{item.unit}</span></span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 font-semibold mb-1">No items found</p>
                    <p className="text-slate-400 text-sm">Try clearing filters or add items</p>
                </div>
            )}
        </div>
    );
}
