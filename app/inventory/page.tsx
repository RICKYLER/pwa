'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getInventoryItems, createInventoryItem, updateInventoryItem, getLowStockItems } from '@/lib/db/inventory';
import { InventoryItem } from '@/lib/db/schema';
import { Plus, AlertTriangle, Edit2, Trash2 } from 'lucide-react';

export default function InventoryPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    item_name: '',
    category: 'food' as const,
    quantity_available: 0,
    unit: 'pcs' as const,
    expiration_date: '',
    notes: '',
  });

  useEffect(() => {
    if (!user || !hasPermission('view_reports')) {
      router.push('/dashboard');
      return;
    }

    loadData();
  }, [user, router]);

  async function loadData() {
    try {
      setIsLoading(true);
      const inventory = await getInventoryItems();
      setItems(inventory);

      const lowStock = await getLowStockItems();
      setLowStockItems(lowStock);
    } catch (error) {
      console.error('[v0] Error loading inventory:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createInventoryItem({
        ...formData,
        quantity_available: parseInt(formData.quantity_available.toString()),
      });

      setFormData({
        item_name: '',
        category: 'food',
        quantity_available: 0,
        unit: 'pcs',
        expiration_date: '',
        notes: '',
      });

      setShowForm(false);
      await loadData();
    } catch (error) {
      console.error('[v0] Error adding item:', error);
      alert('Failed to add item');
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Inventory Management</h1>
              <p className="text-sm text-muted-foreground">{items.length} items in stock</p>
            </div>
            {hasPermission('manage_inventory') && (
              <button
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Low Stock Alert */}
        {lowStockItems.length > 0 && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">{lowStockItems.length} items running low on stock</p>
              <p className="text-sm text-amber-800 mt-1">Please reorder items below 10 units</p>
            </div>
          </div>
        )}

        {/* Add Item Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Add New Item</h2>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Item Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.item_name}
                    onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Rice"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="food">Food</option>
                    <option value="medicine">Medicine</option>
                    <option value="hygiene">Hygiene</option>
                    <option value="clothing">Clothing</option>
                    <option value="blankets">Blankets</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Quantity *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.quantity_available}
                    onChange={(e) => setFormData({ ...formData, quantity_available: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Unit *</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value as any })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="pcs">Pieces</option>
                    <option value="kg">Kilogram</option>
                    <option value="box">Box</option>
                    <option value="pack">Pack</option>
                    <option value="bundle">Bundle</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Expiration Date</label>
                  <input
                    type="date"
                    value={formData.expiration_date}
                    onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Additional info"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
                >
                  Add Item
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-border rounded-md hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Inventory List */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading inventory...</p>
          </div>
        ) : items.length > 0 ? (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Item Name</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Category</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Quantity</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Expiration</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted/30 border-b border-border'}>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-foreground">{item.item_name}</p>
                        {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded-full">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-foreground">
                        {item.quantity_available} {item.unit}
                      </p>
                      {item.quantity_available < 10 && (
                        <p className="text-xs text-destructive">Low stock</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {item.expiration_date ? new Date(item.expiration_date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button className="p-1 hover:bg-muted rounded transition-colors">
                          <Edit2 className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button className="p-1 hover:bg-destructive/10 rounded transition-colors">
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 bg-card border border-dashed border-border rounded-lg">
            <p className="text-muted-foreground mb-4">No inventory items yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
            >
              Add First Item
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
