import { Head } from '@inertiajs/react';
import { ClipboardList } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
                    <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
                    <p className="text-muted-foreground">View all orders (read-only).</p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>All Orders</CardTitle>
                        <CardDescription>Order list for reference</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground/40" />
                            <p className="text-sm font-medium text-muted-foreground">No orders found</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
