import { Head, Link } from '@inertiajs/react';
import { ClipboardList, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Orders', href: '/rider/orders' },
];

export default function RiderOrders() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Orders" />

            <div className="flex flex-col gap-6 p-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
                    <p className="mt-0.5 text-sm text-gray-500">Order reference for your deliveries.</p>
                </div>

                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <ClipboardList className="mb-4 h-12 w-12 text-gray-300" />
                        <p className="font-medium text-gray-700">Orders are managed through deliveries</p>
                        <p className="mt-1 text-sm text-gray-500">
                            Go to your deliveries to see order details for each assigned delivery.
                        </p>
                        <Button asChild className="mt-6 bg-blue-600 hover:bg-blue-700 text-white">
                            <Link href="/rider/deliveries">
                                <Truck className="mr-1.5 h-4 w-4" />
                                Go to My Deliveries
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
