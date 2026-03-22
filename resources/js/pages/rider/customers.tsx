import { Head, router } from '@inertiajs/react';
import { Filter, MapPin, Phone, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Customers', href: '/rider/customers' }];

type Customer = {
    id: number;
    name: string;
    phone: string | null;
    address: string | null;
    barangay: string | null;
    city: string | null;
    customer_type: 'household' | 'commercial' | 'industrial';
    orders_count: number;
};

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
};

type Props = {
    customers: Paginated<Customer>;
    filters: { search?: string; type?: string };
};

const TYPE_LABELS: Record<string, string> = {
    household:  'Household',
    commercial: 'Commercial',
    industrial: 'Industrial',
};

const TYPE_STYLES: Record<string, string> = {
    household:  'bg-green-100 text-green-700',
    commercial: 'bg-blue-100 text-blue-700',
    industrial: 'bg-purple-100 text-purple-700',
};

export default function RiderCustomers({ customers, filters }: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [type, setType]     = useState(filters.type ?? '');

    function applyFilters() {
        router.get('/rider/customers', { search: search || undefined, type: type || undefined }, { preserveState: true, replace: true });
    }

    function clearFilters() {
        setSearch(''); setType('');
        router.get('/rider/customers', {}, { preserveState: false });
    }

    const hasFilters = search || type;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Customers" />

            <div className="flex flex-1 flex-col gap-6 p-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
                    <p className="mt-0.5 text-sm text-gray-500">Customer directory for delivery reference (read-only).</p>
                </div>

                {/* Filters */}
                <Card>
                    <CardContent className="pt-4 pb-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                                <Input
                                    className="pl-8"
                                    placeholder="Search name, phone, barangay…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                                />
                            </div>
                            <Select value={type || 'all'} onValueChange={(v) => setType(v === 'all' ? '' : v)}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="All types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All types</SelectItem>
                                    <SelectItem value="household">Household</SelectItem>
                                    <SelectItem value="commercial">Commercial</SelectItem>
                                    <SelectItem value="industrial">Industrial</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button size="sm" onClick={applyFilters} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Filter className="mr-1.5 h-3.5 w-3.5" /> Apply
                            </Button>
                            {hasFilters && (
                                <Button size="sm" variant="ghost" onClick={clearFilters} className="text-gray-500">
                                    Clear
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Users className="h-4 w-4 text-blue-600" />
                            Customers
                            <span className="ml-auto text-sm font-normal text-gray-400">
                                {customers.total} record{customers.total !== 1 ? 's' : ''}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {customers.data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Users className="mb-3 h-10 w-10" />
                                <p className="font-medium">No customers found</p>
                                {hasFilters && (
                                    <p className="mt-1 text-sm">Try adjusting your search or filter.</p>
                                )}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Name</th>
                                            <th className="px-4 py-3">Type</th>
                                            <th className="px-4 py-3">Phone</th>
                                            <th className="px-4 py-3">Address</th>
                                            <th className="px-4 py-3 text-center">Orders</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {customers.data.map((c) => (
                                            <tr key={c.id} className="hover:bg-gray-50/60">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-900">{c.name}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLES[c.customer_type] ?? 'bg-gray-100 text-gray-600'}`}>
                                                        {TYPE_LABELS[c.customer_type] ?? c.customer_type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {c.phone ? (
                                                        <span className="flex items-center gap-1 text-gray-600">
                                                            <Phone className="h-3.5 w-3.5 text-gray-400" />
                                                            {c.phone}
                                                        </span>
                                                    ) : <span className="text-gray-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {(c.address || c.barangay) ? (
                                                        <span className="flex items-start gap-1 text-gray-600 text-xs">
                                                            <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400 mt-0.5" />
                                                            {[c.address, c.barangay, c.city].filter(Boolean).join(', ')}
                                                        </span>
                                                    ) : <span className="text-gray-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-sm font-medium text-gray-700">{c.orders_count}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination */}
                        {customers.last_page > 1 && (
                            <div className="flex items-center justify-between border-t px-4 py-3">
                                <p className="text-sm text-gray-500">Showing {customers.from}–{customers.to} of {customers.total}</p>
                                <div className="flex gap-1">
                                    {customers.links.map((link, i) => (
                                        <button
                                            key={i}
                                            disabled={!link.url}
                                            onClick={() => link.url && router.visit(link.url, { preserveState: true })}
                                            className={`min-w-[32px] rounded px-2 py-1 text-sm ${
                                                link.active ? 'bg-blue-600 text-white' : link.url ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300 cursor-not-allowed'
                                            }`}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
