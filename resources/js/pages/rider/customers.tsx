import { Head } from '@inertiajs/react';
import { Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Customers', href: '/rider/customers' },
];

export default function RiderCustomers() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Customers" />

            <div className="flex flex-col gap-6 p-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
                    <p className="text-muted-foreground">Customer directory (read-only).</p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Customer List</CardTitle>
                        <CardDescription>View customer contact and address info for deliveries</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Users className="mb-4 h-12 w-12 text-muted-foreground/40" />
                            <p className="text-sm font-medium text-muted-foreground">No customers found</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
