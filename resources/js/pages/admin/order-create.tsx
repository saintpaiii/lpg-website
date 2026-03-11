import { Head, router, useForm } from '@inertiajs/react';
import { AlertTriangle, ChevronDown, Plus, Search, X } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Customer = {
    id: number;
    name: string;
    phone: string | null;
    address: string | null;
    city: string | null;
    barangay: string | null;
};

type ProductOption = {
    id: number;
    name: string;
    brand: string | null;
    weight_kg: number | null;
    selling_price: number;
    stock: number;
};

type Props = {
    customers: Customer[];
    products: ProductOption[];
};

type LineItem = { product_id: string; quantity: string };

// ── Breadcrumbs ────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Orders', href: '/admin/orders' },
    { title: 'New Order', href: '/admin/orders/create' },
];

// ── Customer Combobox ─────────────────────────────────────────────────────────

function CustomerCombobox({
    customers,
    value,
    onChange,
    error,
}: {
    customers: Customer[];
    value: string;
    onChange: (val: string) => void;
    error?: string;
}) {
    const [query, setQuery]   = useState('');
    const [open, setOpen]     = useState(false);
    const inputRef            = useRef<HTMLInputElement>(null);
    const containerRef        = useRef<HTMLDivElement>(null);

    const selected = customers.find((c) => c.id.toString() === value);

    const filtered = customers.filter((c) => {
        const q = query.toLowerCase();
        return (
            c.name.toLowerCase().includes(q) ||
            (c.phone ?? '').toLowerCase().includes(q) ||
            (c.city ?? '').toLowerCase().includes(q)
        );
    });

    function select(c: Customer) {
        onChange(c.id.toString());
        setQuery('');
        setOpen(false);
    }

    function clear() {
        onChange('');
        setQuery('');
        setTimeout(() => inputRef.current?.focus(), 0);
    }

    // Close on outside click
    React.useEffect(() => {
        function handler(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={containerRef} className="relative">
            {selected ? (
                <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <div>
                        <span className="font-medium">{selected.name}</span>
                        {selected.phone && <span className="ml-2 text-gray-400 text-xs">{selected.phone}</span>}
                        {(selected.barangay || selected.city) && (
                            <p className="text-xs text-gray-400 mt-0.5">
                                {[selected.barangay, selected.city].filter(Boolean).join(', ')}
                            </p>
                        )}
                    </div>
                    <button type="button" onClick={clear} className="ml-2 text-gray-400 hover:text-gray-600">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        placeholder="Search customer by name or phone…"
                        className="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                </div>
            )}

            {open && !selected && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-60 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-4 text-center text-sm text-gray-400">No customers found</div>
                    ) : (
                        filtered.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onMouseDown={() => select(c)}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm transition-colors"
                            >
                                <p className="font-medium text-gray-900">{c.name}</p>
                                <p className="text-xs text-gray-400">
                                    {[c.phone, c.barangay, c.city].filter(Boolean).join(' · ')}
                                </p>
                            </button>
                        ))
                    )}
                </div>
            )}
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OrderCreatePage({ customers, products }: Props) {
    const { data, setData, post, processing, errors } = useForm<{
        customer_id:      string;
        transaction_type: 'refill' | 'new_purchase';
        payment_method:   'cash' | 'gcash' | 'bank_transfer' | 'maya';
        payment_status:   'unpaid' | 'paid' | 'partial';
        notes:            string;
        items:            LineItem[];
    }>({
        customer_id:      '',
        transaction_type: 'refill',
        payment_method:   'cash',
        payment_status:   'unpaid',
        notes:            '',
        items:            [{ product_id: '', quantity: '1' }],
    });

    const [stockErrors, setStockErrors] = useState<string[]>([]);

    // ── Line item helpers ─────────────────────────────────────────────────────

    function addLine() {
        setData('items', [...data.items, { product_id: '', quantity: '1' }]);
    }

    function removeLine(idx: number) {
        setData('items', data.items.filter((_, i) => i !== idx));
        setStockErrors((prev) => prev.filter((_, i) => i !== idx));
    }

    function updateLine(idx: number, field: keyof LineItem, val: string) {
        const updated = data.items.map((item, i) =>
            i === idx ? { ...item, [field]: val } : item
        );
        setData('items', updated);

        if (field === 'quantity') {
            const product = products.find((p) => p.id.toString() === updated[idx].product_id);
            const qty = parseInt(val) || 0;
            setStockErrors((prev) => {
                const next = [...prev];
                next[idx] = product && qty > product.stock ? `Only ${product.stock} in stock` : '';
                return next;
            });
        }
        if (field === 'product_id') {
            setStockErrors((prev) => {
                const next = [...prev];
                next[idx] = '';
                return next;
            });
        }
    }

    const chosenProductIds = data.items.map((l) => l.product_id).filter(Boolean);

    const total = data.items.reduce((sum, line) => {
        const product = products.find((p) => p.id.toString() === line.product_id);
        return sum + (product ? product.selling_price * (parseInt(line.quantity) || 0) : 0);
    }, 0);

    const hasStockError = stockErrors.some(Boolean);
    const hasEmptyLine  = data.items.some((l) => !l.product_id || !l.quantity || parseInt(l.quantity) < 1);
    const canSubmit     = data.customer_id && !hasStockError && !hasEmptyLine;

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        post('/admin/orders');
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="New Order" />

            <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">New Order</h1>
                    <p className="mt-0.5 text-sm text-gray-500">
                        Create a new customer order. Stock is deducted when order is confirmed.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="grid gap-6">

                    {/* Customer */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Customer</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <CustomerCombobox
                                customers={customers}
                                value={data.customer_id}
                                onChange={(v) => setData('customer_id', v)}
                                error={errors.customer_id}
                            />
                        </CardContent>
                    </Card>

                    {/* Order details */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Order Details</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid gap-4 sm:grid-cols-3">
                                <div className="grid gap-1.5">
                                    <Label>Transaction Type *</Label>
                                    <Select
                                        value={data.transaction_type}
                                        onValueChange={(v) => setData('transaction_type', v as 'refill' | 'new_purchase')}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="refill">Refill</SelectItem>
                                            <SelectItem value="new_purchase">New Purchase</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-1.5">
                                    <Label>Payment Method *</Label>
                                    <Select
                                        value={data.payment_method}
                                        onValueChange={(v) => setData('payment_method', v as any)}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="cash">Cash</SelectItem>
                                            <SelectItem value="gcash">GCash</SelectItem>
                                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                            <SelectItem value="maya">Maya</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-1.5">
                                    <Label>Payment Status *</Label>
                                    <Select
                                        value={data.payment_status}
                                        onValueChange={(v) => setData('payment_status', v as any)}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="unpaid">Unpaid</SelectItem>
                                            <SelectItem value="paid">Paid</SelectItem>
                                            <SelectItem value="partial">Partial</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid gap-1.5">
                                <Label>Notes</Label>
                                <textarea
                                    value={data.notes}
                                    onChange={(e) => setData('notes', e.target.value)}
                                    placeholder="Special instructions, delivery notes…"
                                    rows={2}
                                    className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Items */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">Items</CardTitle>
                                <Button type="button" size="sm" variant="ghost" onClick={addLine} className="gap-1 text-blue-600">
                                    <Plus className="h-3.5 w-3.5" /> Add Item
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="grid gap-3">
                            {/* Header row */}
                            <div className="grid grid-cols-[1fr_96px_100px_32px] gap-2 text-xs font-medium text-gray-500 px-1">
                                <span>Product</span>
                                <span className="text-center">Qty</span>
                                <span className="text-right">Subtotal</span>
                                <span />
                            </div>

                            {data.items.map((line, idx) => {
                                const product = products.find((p) => p.id.toString() === line.product_id);
                                const subtotal = product ? product.selling_price * (parseInt(line.quantity) || 0) : 0;

                                return (
                                    <div key={idx} className="grid grid-cols-[1fr_96px_100px_32px] gap-2 items-start">
                                        {/* Product select */}
                                        <div>
                                            <select
                                                value={line.product_id}
                                                onChange={(e) => updateLine(idx, 'product_id', e.target.value)}
                                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            >
                                                <option value="">Select product…</option>
                                                {products
                                                    .filter((p) => p.id.toString() === line.product_id || !chosenProductIds.includes(p.id.toString()))
                                                    .map((p) => (
                                                        <option key={p.id} value={p.id.toString()} disabled={p.stock === 0}>
                                                            {p.name}{p.brand ? ` (${p.brand})` : ''} — ₱{p.selling_price.toLocaleString()} | {p.stock} left
                                                        </option>
                                                    ))}
                                            </select>
                                            {product && (
                                                <p className="mt-0.5 px-1 text-[10px] text-gray-400">
                                                    ₱{product.selling_price.toLocaleString()} each · {product.stock} available
                                                </p>
                                            )}
                                            {stockErrors[idx] && (
                                                <p className="mt-0.5 flex items-center gap-1 text-xs text-red-500">
                                                    <AlertTriangle className="h-3 w-3" /> {stockErrors[idx]}
                                                </p>
                                            )}
                                        </div>

                                        {/* Quantity */}
                                        <Input
                                            type="number"
                                            min="1"
                                            max={product?.stock}
                                            className="h-9 text-center text-sm"
                                            value={line.quantity}
                                            onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                                        />

                                        {/* Subtotal */}
                                        <div className="flex h-9 items-center justify-end text-sm font-medium text-gray-700">
                                            {product
                                                ? `₱${subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                                                : '—'}
                                        </div>

                                        {/* Remove */}
                                        {data.items.length > 1 ? (
                                            <button
                                                type="button"
                                                onClick={() => removeLine(idx)}
                                                className="flex h-9 w-8 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        ) : (
                                            <div className="h-9 w-8" />
                                        )}
                                    </div>
                                );
                            })}

                            {/* Total */}
                            {total > 0 && (
                                <div className="mt-2 flex justify-end border-t pt-3">
                                    <div className="text-right">
                                        <p className="text-xs text-gray-500">Order Total</p>
                                        <p className="text-xl font-bold text-blue-700">
                                            ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {errors.items && (
                                <p className="text-xs text-red-500">{errors.items}</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Info note */}
                    <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>
                            Stock will be deducted and an invoice will be generated when the order is <strong>confirmed</strong>.
                            The order is saved as <strong>Pending</strong> until then.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => router.visit('/admin/orders')}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={processing || !canSubmit}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {processing ? 'Creating…' : 'Create Order'}
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
