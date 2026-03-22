import { Head, Link, router } from '@inertiajs/react';
import { Minus, Plus, ShoppingBag, ShoppingCart, Store, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CustomerLayout from '@/layouts/customer-layout';

type CartItem = {
    product_id: number;
    name: string;
    brand: string;
    weight: string;
    image_url: string | null;
    refill_price: number;
    purchase_price: number;
    transaction_type: 'refill' | 'new_purchase';
    quantity: number;
    stock: number;
};

type StoreGroup = {
    store_id: number;
    store_name: string;
    delivery_fee: number;
    items: CartItem[];
};

type Cart = {
    stores: Record<number, StoreGroup>;
} | null;

type Props = {
    cart: Cart;
};

export default function CartPage({ cart }: Props) {
    const storeGroups: StoreGroup[] = cart?.stores ? Object.values(cart.stores) : [];
    const allProductIds = storeGroups.flatMap(s => s.items.map(i => i.product_id));

    const [selected, setSelected] = useState<Set<number>>(new Set(allProductIds));
    const [clearOpen, setClearOpen] = useState(false);

    function toggleItem(productId: number) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(productId)) next.delete(productId);
            else next.add(productId);
            return next;
        });
    }

    function toggleStore(storeGroup: StoreGroup) {
        const ids = storeGroup.items.map(i => i.product_id);
        const allSelected = ids.every(id => selected.has(id));
        setSelected(prev => {
            const next = new Set(prev);
            if (allSelected) ids.forEach(id => next.delete(id));
            else ids.forEach(id => next.add(id));
            return next;
        });
    }

    function updateItem(productId: number, quantity: number, txType?: string) {
        router.patch('/customer/cart/update', {
            product_id:       productId,
            quantity,
            transaction_type: txType,
        }, { preserveScroll: true });
    }

    function removeItem(productId: number) {
        setSelected(prev => { const next = new Set(prev); next.delete(productId); return next; });
        router.delete('/customer/cart/remove', {
            data: { product_id: productId },
            preserveScroll: true,
        });
    }

    function clearCart() {
        router.delete('/customer/cart', { preserveScroll: false });
    }

    function proceedToCheckout() {
        router.get('/customer/checkout', {
            selected: Array.from(selected),
        });
    }

    if (storeGroups.length === 0) {
        return (
            <CustomerLayout>
                <Head title="My Cart — LPG Portal" />
                <div className="text-center py-24">
                    <ShoppingCart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Your cart is empty</h2>
                    <p className="text-gray-500 mb-6">Browse products and add items to your cart.</p>
                    <Link href="/customer/products">
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white px-6">
                            <ShoppingBag className="h-4 w-4 mr-2" />
                            Browse Products
                        </Button>
                    </Link>
                </div>
            </CustomerLayout>
        );
    }

    // Compute totals for selected items only
    const selectedStores = storeGroups
        .map(sg => ({ ...sg, items: sg.items.filter(i => selected.has(i.product_id)) }))
        .filter(sg => sg.items.length > 0);

    const selectedSubtotal = selectedStores.reduce((sum, sg) =>
        sum + sg.items.reduce((s, item) => {
            const price = item.transaction_type === 'refill' ? item.refill_price : item.purchase_price;
            return s + price * item.quantity;
        }, 0), 0);

    const selectedDelivery = selectedStores.reduce((sum, sg) => sum + sg.delivery_fee, 0);
    const selectedTotal    = selectedSubtotal + selectedDelivery;
    const selectedCount    = selected.size;

    return (
        <CustomerLayout>
            <Head title="My Cart — LPG Portal" />

            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Cart</h1>
                    <button
                        onClick={() => setClearOpen(true)}
                        className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear cart
                    </button>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Store groups */}
                    <div className="lg:col-span-2 space-y-6">
                        {storeGroups.map(sg => {
                            const storeItemIds = sg.items.map(i => i.product_id);
                            const allStoreSelected = storeItemIds.every(id => selected.has(id));
                            const someStoreSelected = storeItemIds.some(id => selected.has(id));

                            return (
                                <Card key={sg.store_id}>
                                    {/* Store header */}
                                    <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={allStoreSelected}
                                                ref={el => { if (el) el.indeterminate = someStoreSelected && !allStoreSelected; }}
                                                onChange={() => toggleStore(sg)}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                                            />
                                            <CardTitle className="text-sm flex items-center gap-2 text-gray-900 dark:text-white">
                                                <Store className="h-4 w-4 text-blue-500" />
                                                {sg.store_name}
                                            </CardTitle>
                                            {sg.delivery_fee > 0 ? (
                                                <span className="ml-auto text-xs text-gray-500">
                                                    Delivery: ₱{sg.delivery_fee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </span>
                                            ) : (
                                                <span className="ml-auto text-xs text-emerald-600 font-medium">Free delivery</span>
                                            )}
                                        </div>
                                    </CardHeader>

                                    <CardContent className="p-0">
                                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                            {sg.items.map(item => {
                                                const unitPrice    = item.transaction_type === 'refill' ? item.refill_price : item.purchase_price;
                                                const subtotalItem = unitPrice * item.quantity;
                                                const isChecked    = selected.has(item.product_id);

                                                return (
                                                    <div key={item.product_id} className="p-4">
                                                        <div className="flex gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => toggleItem(item.product_id)}
                                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer shrink-0"
                                                            />
                                                            {item.image_url ? (
                                                                <img src={item.image_url} alt={item.name} className="h-16 w-16 rounded-lg object-cover shrink-0" />
                                                            ) : (
                                                                <div className="h-16 w-16 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                                                                    <ShoppingCart className="h-6 w-6 text-blue-300" />
                                                                </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div>
                                                                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{item.name}</p>
                                                                        <p className="text-xs text-gray-500">{item.brand} · {item.weight}</p>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => removeItem(item.product_id)}
                                                                        className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </button>
                                                                </div>

                                                                {/* Transaction type toggle */}
                                                                <div className="flex gap-2 mt-2">
                                                                    {(['refill', 'new_purchase'] as const).map(t => (
                                                                        <button
                                                                            key={t}
                                                                            onClick={() => updateItem(item.product_id, item.quantity, t)}
                                                                            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                                                                item.transaction_type === t
                                                                                    ? 'bg-blue-600 border-blue-600 text-white'
                                                                                    : 'border-gray-200 text-gray-600 hover:border-blue-300 dark:border-gray-700 dark:text-gray-400'
                                                                            }`}
                                                                        >
                                                                            {t === 'refill'
                                                                                ? `Refill ₱${item.refill_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                                                                                : `New ₱${item.purchase_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                                                                        </button>
                                                                    ))}
                                                                </div>

                                                                {/* Quantity + subtotal */}
                                                                <div className="flex items-center justify-between mt-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={() => updateItem(item.product_id, item.quantity - 1)}
                                                                            disabled={item.quantity <= 1}
                                                                            className="h-7 w-7 rounded border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                                                        >
                                                                            <Minus className="h-3 w-3" />
                                                                        </button>
                                                                        <span className="w-8 text-center text-sm font-semibold text-gray-900 dark:text-white">{item.quantity}</span>
                                                                        <button
                                                                            onClick={() => updateItem(item.product_id, item.quantity + 1)}
                                                                            disabled={item.quantity >= item.stock}
                                                                            className="h-7 w-7 rounded border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                                                        >
                                                                            <Plus className="h-3 w-3" />
                                                                        </button>
                                                                        <span className="text-xs text-gray-400 ml-1">{item.stock} avail.</span>
                                                                    </div>
                                                                    <span className={`font-bold text-sm ${isChecked ? 'text-gray-900 dark:text-white' : 'text-gray-400 line-through'}`}>
                                                                        ₱{subtotalItem.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {/* Order summary */}
                    <div className="space-y-4">
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">Order Summary</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                    <span>Selected items</span>
                                    <span>{selectedCount}</span>
                                </div>
                                {selectedStores.map(sg => (
                                    <div key={sg.store_id} className="text-xs text-gray-500 space-y-1 border-t border-gray-100 dark:border-gray-800 pt-2 mt-2">
                                        <p className="font-medium text-gray-700 dark:text-gray-300">{sg.store_name}</p>
                                        {sg.delivery_fee > 0 && (
                                            <div className="flex justify-between">
                                                <span>Delivery fee</span>
                                                <span>₱{sg.delivery_fee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800 pt-2">
                                    <span>Subtotal</span>
                                    <span>₱{selectedSubtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                </div>
                                {selectedDelivery > 0 && (
                                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                        <span>Total delivery</span>
                                        <span>₱{selectedDelivery.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                )}
                                <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between font-bold text-gray-900 dark:text-white">
                                    <span>Total</span>
                                    <span>₱{selectedTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <Button
                                    onClick={proceedToCheckout}
                                    disabled={selectedCount === 0}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 disabled:opacity-50"
                                >
                                    Proceed to Checkout
                                    {selectedStores.length > 1 && ` (${selectedStores.length} stores)`}
                                </Button>
                                <Link href="/customer/products" className="block">
                                    <Button variant="outline" className="w-full">
                                        Continue Shopping
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>

                        {selectedCount === 0 && (
                            <p className="text-xs text-amber-600 text-center">
                                Select at least one item to proceed.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Clear cart confirmation */}
            <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clear cart?</AlertDialogTitle>
                        <AlertDialogDescription>
                            All items will be removed from your cart. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={clearCart}
                        >
                            Clear Cart
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </CustomerLayout>
    );
}
