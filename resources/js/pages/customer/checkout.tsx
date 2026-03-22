import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import { CreditCard, Loader2, MapPin, ShoppingCart, Store, Truck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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

type CustomerInfo = {
    name: string;
    phone: string;
    address: string;
    city: string;
    barangay: string;
} | null;

type Props = {
    stores: StoreGroup[];
    customer: CustomerInfo;
};

const PAYMENT_METHODS = [
    { value: 'cod',    label: 'Cash on Delivery',   description: 'Pay when your order arrives',            icon: Truck },
    { value: 'online', label: 'Pay Online',          description: 'GCash, Maya, Card, GrabPay via PayMongo', icon: CreditCard },
];

export default function CheckoutPage({ stores, customer }: Props) {
    const [paymentType, setPaymentType] = useState<'cod' | 'online'>('cod');
    const [notes, setNotes]             = useState('');
    const [loading, setLoading]         = useState(false);

    const grandSubtotal = stores.reduce((sum, sg) =>
        sum + sg.items.reduce((s, item) => {
            const price = item.transaction_type === 'refill' ? item.refill_price : item.purchase_price;
            return s + price * item.quantity;
        }, 0), 0);

    const grandDelivery = stores.reduce((sum, sg) => sum + sg.delivery_fee, 0);
    const grandTotal    = grandSubtotal + grandDelivery;

    async function placeOrder() {
        setLoading(true);

        if (paymentType === 'cod') {
            router.post('/customer/checkout', { payment_type: 'cod', notes }, {
                onError: () => {
                    toast.error('Failed to place order. Please try again.');
                    setLoading(false);
                },
                onFinish: () => setLoading(false),
            });
            return;
        }

        // Online payment — axios handles CSRF automatically via XSRF-TOKEN cookie
        try {
            const res = await axios.post<{ checkout_url?: string; error?: string }>(
                '/customer/checkout',
                { payment_type: 'online', notes },
            );
            if (res.data.checkout_url) {
                window.location.href = res.data.checkout_url;
            } else {
                toast.error(res.data.error ?? 'Unexpected response from server.');
                setLoading(false);
            }
        } catch (err) {
            let msg = 'Checkout failed. Please try again or use Cash on Delivery.';
            if (axios.isAxiosError(err)) {
                msg = err.response?.data?.error
                    ?? err.response?.data?.message
                    ?? msg;
            }
            toast.error(msg);
            setLoading(false);
        }
    }

    return (
        <CustomerLayout>
            <Head title="Checkout — LPG Portal" />

            <div className="max-w-3xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Checkout</h1>

                {/* Delivery address */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-blue-600" />
                            Delivery Address
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {customer ? (
                            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                                <p className="font-semibold">{customer.name}</p>
                                <p>{customer.phone}</p>
                                <p>
                                    {[customer.address, customer.barangay, customer.city].filter(Boolean).join(', ')}
                                </p>
                            </div>
                        ) : (
                            <div className="text-sm text-amber-700 dark:text-amber-400">
                                No delivery address on file.{' '}
                                <Link href="/customer/profile" className="text-blue-600 underline">
                                    Complete your profile
                                </Link>{' '}
                                to set your address.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Per-store order summaries */}
                {stores.map(sg => {
                    const storeSubtotal = sg.items.reduce((sum, item) => {
                        const price = item.transaction_type === 'refill' ? item.refill_price : item.purchase_price;
                        return sum + price * item.quantity;
                    }, 0);

                    return (
                        <Card key={sg.store_id}>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Store className="h-4 w-4 text-blue-600" />
                                    {sg.store_name}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {sg.items.map(item => {
                                        const unitPrice = item.transaction_type === 'refill' ? item.refill_price : item.purchase_price;
                                        return (
                                            <div key={item.product_id} className="py-3 flex items-center gap-3">
                                                {item.image_url ? (
                                                    <img src={item.image_url} alt={item.name} className="h-12 w-12 rounded-lg object-cover shrink-0" />
                                                ) : (
                                                    <div className="h-12 w-12 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                                                        <ShoppingCart className="h-5 w-5 text-blue-300" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name}</p>
                                                    <p className="text-xs text-gray-500">{item.brand} · {item.weight} · {item.transaction_type === 'refill' ? 'Refill' : 'New Purchase'}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                                        ₱{(unitPrice * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                    </p>
                                                    <p className="text-xs text-gray-400">×{item.quantity}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-3 space-y-1.5">
                                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                        <span>Subtotal</span>
                                        <span>₱{storeSubtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                        <span>Delivery fee</span>
                                        <span>{sg.delivery_fee > 0 ? `₱${sg.delivery_fee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : 'Free'}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}

                {/* Grand total */}
                {stores.length > 1 && (
                    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10">
                        <CardContent className="pt-5 pb-4">
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                    <span>All subtotals ({stores.length} stores)</span>
                                    <span>₱{grandSubtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                    <span>Total delivery fees</span>
                                    <span>{grandDelivery > 0 ? `₱${grandDelivery.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : 'Free'}</span>
                                </div>
                                <div className="flex justify-between font-bold text-gray-900 dark:text-white text-base pt-1 border-t border-blue-200 dark:border-blue-700 mt-1">
                                    <span>Grand Total</span>
                                    <span>₱{grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Payment method */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-blue-600" />
                            Payment Method
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {PAYMENT_METHODS.map(m => {
                                const Icon = m.icon;
                                return (
                                    <button
                                        key={m.value}
                                        onClick={() => setPaymentType(m.value as 'cod' | 'online')}
                                        className={`rounded-xl border-2 p-4 text-left transition-colors ${
                                            paymentType === m.value
                                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                                                : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Icon className={`h-4 w-4 ${paymentType === m.value ? 'text-blue-600' : 'text-gray-500'}`} />
                                            <span className={`font-semibold text-sm ${paymentType === m.value ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                                                {m.label}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500">{m.description}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Notes */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Order Notes (optional)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Any special instructions for your delivery…"
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                        />
                    </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <Link href="/customer/cart" className="sm:flex-none">
                        <Button variant="outline" className="w-full sm:w-auto">
                            Back to Cart
                        </Button>
                    </Link>
                    <Button
                        onClick={placeOrder}
                        disabled={loading || !customer}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 text-base"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                {paymentType === 'online' ? 'Redirecting to payment…' : 'Placing order…'}
                            </>
                        ) : (
                            <>
                                {paymentType === 'online' ? (
                                    <>
                                        <CreditCard className="h-4 w-4 mr-2" />
                                        Pay ₱{grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} Online
                                    </>
                                ) : (
                                    <>
                                        <Truck className="h-4 w-4 mr-2" />
                                        Place Order{stores.length > 1 ? `s (${stores.length})` : ''} — COD
                                    </>
                                )}
                            </>
                        )}
                    </Button>
                </div>
                {!customer && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
                        You need to{' '}
                        <Link href="/customer/profile" className="underline font-medium">complete your profile</Link>
                        {' '}before placing an order.
                    </p>
                )}
            </div>
        </CustomerLayout>
    );
}
