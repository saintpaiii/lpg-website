import { Head, Link } from '@inertiajs/react';
import { CheckCircle2, Circle, Clock, Package, ShoppingCart, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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

type Props = {
    customerName: string;
    stats: {
        total_orders: number;
        active_orders: number;
        last_order_at: string | null;
    };
    activeOrder: ActiveOrder;
    hasProfile: boolean;
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
    preparing:        'bg-indigo-100 text-indigo-800 border-indigo-200',
    out_for_delivery: 'bg-purple-100 text-purple-800 border-purple-200',
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

export default function Dashboard({ customerName, stats, activeOrder, hasProfile }: Props) {
    return (
        <CustomerLayout>
            <Head title="My Dashboard — LPG Portal" />

            <div className="space-y-8">
                {/* Welcome header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Welcome back, {customerName}!
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Here&apos;s an overview of your LPG orders.
                        </p>
                    </div>
                    <Link href="/customer/orders/create">
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6">
                            <ShoppingCart className="h-4 w-4 mr-2" />
                            Place New Order
                        </Button>
                    </Link>
                </div>

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
                                        {stats.last_order_at ?? 'No orders yet'}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

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
                            <Link href="/customer/orders/create">
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                                    Place Your First Order
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                )}
            </div>
        </CustomerLayout>
    );
}
