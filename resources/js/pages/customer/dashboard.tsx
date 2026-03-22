import { Head, Link, router } from '@inertiajs/react';
import { CheckCircle2, Circle, Clock, MapPin, Package, Search, ShoppingBag, ShoppingCart, Star, Truck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { fmtDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CustomerLayout from '@/layouts/customer-layout';

type ActiveOrder = {
    id: number;
    order_number: string;
    status: string;
    total_amount: number;
    created_at: string;
    rider_name: string | null;
} | null;

type FeaturedProduct = {
    id: number;
    name: string;
    brand: string;
    weight: string;
    refill_price: number;
    purchase_price: number;
    image_url: string | null;
    stock: number;
    store_name: string;
    store_city: string;
    store_id: number;
    delivery_fee: number;
};

type Props = {
    customerName: string;
    stats: {
        total_orders: number;
        active_orders: number;
        last_order_at: string | null;
    };
    activeOrder: ActiveOrder;
    hasProfile: boolean;
    featuredProducts: FeaturedProduct[];
};

const ORDER_STEPS = [
    { key: 'pending',          label: 'Pending' },
    { key: 'confirmed',        label: 'Confirmed' },
    { key: 'preparing',        label: 'Preparing' },
    { key: 'out_for_delivery', label: 'Out for Delivery' },
    { key: 'delivered',        label: 'Delivered' },
];

const STATUS_COLORS: Record<string, string> = {
    pending:          'bg-yellow-100 text-yellow-800 border-yellow-200',
    confirmed:        'bg-blue-100 text-blue-800 border-blue-200',
    preparing:        'bg-purple-100 text-purple-800 border-purple-200',
    out_for_delivery: 'bg-orange-100 text-orange-800 border-orange-200',
    delivered:        'bg-green-100 text-green-800 border-green-200',
    cancelled:        'bg-red-100 text-red-800 border-red-200',
};

function StatusStepper({ status }: { status: string }) {
    const currentIdx = ORDER_STEPS.findIndex((s) => s.key === status);

    return (
        <div className="flex items-center gap-0 w-full mt-4">
            {ORDER_STEPS.map((step, idx) => {
                const done    = idx < currentIdx;
                const current = idx === currentIdx;
                const future  = idx > currentIdx;

                return (
                    <div key={step.key} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                                done    ? 'border-green-500 bg-green-500' :
                                current ? 'border-blue-600 bg-blue-600' :
                                          'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                            }`}>
                                {done ? (
                                    <CheckCircle2 className="h-4 w-4 text-white" />
                                ) : current ? (
                                    <Clock className="h-4 w-4 text-white" />
                                ) : (
                                    <Circle className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                                )}
                            </div>
                            <span className={`mt-1.5 text-xs font-medium text-center max-w-[60px] ${
                                done || current ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-600'
                            }`}>
                                {step.label}
                            </span>
                        </div>
                        {idx < ORDER_STEPS.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-1 mb-5 ${
                                done ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                            }`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default function Dashboard({ customerName, stats, activeOrder, hasProfile, featuredProducts }: Props) {
    const [searchQuery, setSearchQuery] = useState('');

    function handleSearch(e: FormEvent) {
        e.preventDefault();
        if (searchQuery.trim()) router.get('/customer/products', { search: searchQuery.trim() });
    }

    return (
        <CustomerLayout>
            <Head title="My Dashboard — LPG Portal" />

            <div className="space-y-8">
                {/* Welcome header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Welcome, {customerName}!
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Here&apos;s an overview of your LPG orders.
                        </p>
                    </div>
                    <Link href="/customer/products">
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6">
                            <ShoppingBag className="h-4 w-4 mr-2" />
                            Browse Products
                        </Button>
                    </Link>
                </div>

                {/* Quick search */}
                <form onSubmit={handleSearch} className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search LPG products by name, brand, or size…"
                            className="w-full rounded-lg border border-gray-300 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                        />
                    </div>
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-5">
                        Search
                    </Button>
                </form>

                {/* Stats cards */}
                <div className="grid gap-4 sm:grid-cols-3">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
                                    <Package className="h-6 w-6 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Orders</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_orders}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/20">
                                    <Truck className="h-6 w-6 text-purple-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Active Orders</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.active_orders}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 dark:bg-green-900/20">
                                    <Clock className="h-6 w-6 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Last Order</p>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                        {stats.last_order_at ? fmtDate(stats.last_order_at) : 'No orders yet'}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Featured products */}
                {featuredProducts.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                                Featured Products
                            </h2>
                            <Link href="/customer/products" className="text-sm text-blue-600 hover:underline">
                                View all
                            </Link>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {featuredProducts.map(p => (
                                <Card key={p.id} className="overflow-hidden hover:shadow-md transition-shadow">
                                    {p.image_url ? (
                                        <img src={p.image_url} alt={p.name} className="w-full h-36 object-cover" />
                                    ) : (
                                        <div className="w-full h-36 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 flex items-center justify-center">
                                            <ShoppingBag className="h-10 w-10 text-blue-300" />
                                        </div>
                                    )}
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                            <p className="font-semibold text-sm text-gray-900 dark:text-white leading-tight">
                                                {p.name}
                                            </p>
                                            <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-semibold px-1.5 py-0.5">
                                                <Star className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500" />
                                                Featured
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mb-2">{p.brand} · {p.weight}</p>
                                        <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
                                            <MapPin className="h-3 w-3" />
                                            {p.store_name} · {p.store_city}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs text-gray-400">Refill from</p>
                                                <p className="font-bold text-blue-600">₱{p.refill_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                                            </div>
                                            {p.stock === 0 ? (
                                                <span className="text-xs font-medium text-red-500">Out of stock</span>
                                            ) : (
                                                <Link href="/customer/products">
                                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                                                        Order
                                                    </Button>
                                                </Link>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {/* Active order tracking */}
                {activeOrder ? (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">Current Order Status</CardTitle>
                                <Link href={`/customer/orders/${activeOrder.id}`}>
                                    <Button variant="outline" size="sm">View Details</Button>
                                </Link>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-3 items-center mb-4">
                                <span className="font-semibold text-gray-900 dark:text-white">
                                    {activeOrder.order_number}
                                </span>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[activeOrder.status] ?? 'bg-gray-100 text-gray-800'}`}>
                                    {activeOrder.status.replace('_', ' ')}
                                </span>
                                <span className="text-sm text-gray-500">
                                    ₱{activeOrder.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                </span>
                                {activeOrder.rider_name && (
                                    <span className="text-sm text-gray-500">
                                        Rider: <span className="font-medium text-gray-700 dark:text-gray-300">{activeOrder.rider_name}</span>
                                    </span>
                                )}
                            </div>
                            <StatusStepper status={activeOrder.status} />
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="border-dashed">
                        <CardContent className="py-12 text-center">
                            <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500 dark:text-gray-400 mb-4">
                                You have no active orders right now.
                            </p>
                            <Link href="/customer/products">
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                                    Browse Products
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                )}
            </div>
        </CustomerLayout>
    );
}
