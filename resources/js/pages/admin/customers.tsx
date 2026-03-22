import { Head, router, useForm, usePage } from '@inertiajs/react';
import { ArchiveRestore, Edit2, Search, Trash2, Users } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
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
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, SharedData } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type CustomerType = 'household' | 'commercial' | 'industrial';

type Customer = {
    id: number;
    name: string;
    address: string | null;
    city: string | null;
    barangay: string | null;
    phone: string | null;
    email: string | null;
    customer_type: CustomerType;
    notes: string | null;
    orders_count: number;
    deleted_at?: string | null;
};

type PaginatedCustomers = {
    data: Customer[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
};

type Props = {
    customers: PaginatedCustomers;
    filters: { search?: string; type?: string; tab?: string };
    archivedCount: number;
};

type CustomerForm = {
    name: string;
    address: string;
    city: string;
    barangay: string;
    phone: string;
    email: string;
    customer_type: CustomerType;
    notes: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<CustomerType, string> = {
    household:  'Household',
    commercial: 'Commercial',
    industrial: 'Industrial',
};

const TYPE_COLORS: Record<CustomerType, string> = {
    household:  'bg-blue-100 text-blue-700',
    commercial: 'bg-purple-100 text-purple-700',
    industrial: 'bg-amber-100 text-amber-700',
};

function TypeBadge({ type }: { type: CustomerType }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[type]}`}>
            {TYPE_LABELS[type]}
        </span>
    );
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Customers', href: '/admin/customers' }];

const emptyForm: CustomerForm = { name: '', address: '', city: '', barangay: '', phone: '', email: '', customer_type: 'household', notes: '' };

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CustomersPage({ customers, filters, archivedCount }: Props) {
    const { auth } = usePage<SharedData>().props;

    const tab        = filters.tab ?? 'active';
    const isArchived = tab === 'archived';

    // ── Search / filter state ──────────────────────────────────────────────────
    const [search, setSearch]         = useState(filters.search ?? '');
    const [typeFilter, setTypeFilter] = useState(filters.type ?? '');

    useEffect(() => {
        const timeout = setTimeout(() => {
            router.get(
                '/admin/customers',
                { search: search || undefined, type: typeFilter || undefined, tab: tab || undefined },
                { preserveState: true, replace: true },
            );
        }, 350);
        return () => clearTimeout(timeout);
    }, [search, typeFilter]);

    function switchTab(newTab: string) {
        setSearch('');
        setTypeFilter('');
        router.get('/admin/customers', { tab: newTab }, { preserveState: false });
    }

    // ── Edit dialog ────────────────────────────────────────────────────────────
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing]       = useState<Customer | null>(null);

    const { data, setData, put, processing, errors, clearErrors } =
        useForm<CustomerForm>(emptyForm);

    function openEdit(c: Customer) {
        setEditing(c);
        setData({
            name:          c.name,
            address:       c.address ?? '',
            city:          c.city ?? '',
            barangay:      c.barangay ?? '',
            phone:         c.phone ?? '',
            email:         c.email ?? '',
            customer_type: c.customer_type,
            notes:         c.notes ?? '',
        });
        clearErrors();
        setDialogOpen(true);
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!editing) return;
        put(`/admin/customers/${editing.id}`, {
            onSuccess: () => { setDialogOpen(false); toast.success('Customer updated.'); },
        });
    }

    // ── Archive (soft delete) ──────────────────────────────────────────────────
    const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);

    function handleArchive() {
        if (!archiveTarget) return;
        router.delete(`/admin/customers/${archiveTarget.id}`, {
            onSuccess: () => { setArchiveTarget(null); toast.success('Customer archived.'); },
            onError: () => toast.error('Failed to archive customer.'),
        });
    }

    // ── Restore ────────────────────────────────────────────────────────────────
    function handleRestore(c: Customer) {
        router.post(`/admin/customers/${c.id}/restore`, {}, {
            onSuccess: () => toast.success('Customer restored.'),
        });
    }

    // ── Permanent delete ───────────────────────────────────────────────────────
    const [forceTarget, setForceTarget] = useState<Customer | null>(null);

    function handleForceDelete() {
        if (!forceTarget) return;
        router.delete(`/admin/customers/${forceTarget.id}/force`, {
            onSuccess: () => { setForceTarget(null); toast.success('Customer permanently deleted.'); },
            onError: () => toast.error('Failed to delete customer.'),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Customers" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
                        <p className="mt-0.5 text-sm text-gray-500">
                            {customers.total} customer{customers.total !== 1 ? 's' : ''}{isArchived ? ' archived' : ' total'}
                        </p>
                    </div>
                </div>

                {/* ── Tabs ────────────────────────────────────────────────── */}
                <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
                    <button
                        onClick={() => switchTab('active')}
                        className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                            !isArchived
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Active
                    </button>
                    <button
                        onClick={() => switchTab('archived')}
                        className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                            isArchived
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Archived
                        {archivedCount > 0 && (
                            <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
                                {archivedCount}
                            </span>
                        )}
                    </button>
                </div>

                {/* ── Filters ─────────────────────────────────────────────── */}
                <Card>
                    <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <Input
                                className="pl-9"
                                placeholder="Search by name, phone, or barangay…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <Select
                            value={typeFilter || 'all'}
                            onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}
                        >
                            <SelectTrigger className="w-48">
                                <SelectValue placeholder="All types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All types</SelectItem>
                                <SelectItem value="household">Household</SelectItem>
                                <SelectItem value="commercial">Commercial</SelectItem>
                                <SelectItem value="industrial">Industrial</SelectItem>
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                {/* ── Table ───────────────────────────────────────────────── */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            {isArchived
                                ? <ArchiveRestore className="h-4 w-4 text-amber-500" />
                                : <Users className="h-4 w-4 text-blue-600" />
                            }
                            {isArchived ? 'Archived Customers' : 'Customer List'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {customers.data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Users className="mb-3 h-10 w-10" />
                                <p className="font-medium">
                                    {isArchived ? 'No archived customers' : 'No customers found'}
                                </p>
                                <p className="mt-1 text-sm">
                                    {isArchived
                                        ? 'Archived customers will appear here.'
                                        : 'Try adjusting your search or filter.'
                                    }
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Name</th>
                                            <th className="px-4 py-3">Address</th>
                                            <th className="px-4 py-3">Barangay</th>
                                            <th className="px-4 py-3">Phone</th>
                                            <th className="px-4 py-3">Type</th>
                                            <th className="px-4 py-3 text-right">Orders</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {customers.data.map((c) => (
                                            <tr key={c.id} className={`hover:bg-gray-50/60 ${isArchived ? 'opacity-75' : ''}`}>
                                                <td className="px-4 py-3 font-medium">
                                                    {isArchived ? (
                                                        <span className="text-gray-500">{c.name}</span>
                                                    ) : (
                                                        <button
                                                            className="text-blue-600 hover:underline text-left"
                                                            onClick={() => router.visit(`/admin/customers/${c.id}/orders`)}
                                                        >
                                                            {c.name}
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="max-w-[180px] truncate px-4 py-3 text-gray-600">
                                                    {c.address ?? '—'}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">{c.barangay ?? '—'}</td>
                                                <td className="px-4 py-3 text-gray-600">{c.phone ?? '—'}</td>
                                                <td className="px-4 py-3">
                                                    <TypeBadge type={c.customer_type} />
                                                </td>
                                                <td className="px-4 py-3 text-right text-gray-600">
                                                    {c.orders_count}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {isArchived ? (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => handleRestore(c)}
                                                                    title="Restore customer"
                                                                    className="h-8 w-8 p-0 text-gray-500 hover:text-emerald-600"
                                                                >
                                                                    <ArchiveRestore className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => setForceTarget(c)}
                                                                    title="Permanently delete"
                                                                    className="h-8 w-8 p-0 text-gray-500 hover:text-red-600"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => openEdit(c)}
                                                                    title="Edit"
                                                                    className="h-8 w-8 p-0 text-gray-500 hover:text-blue-600"
                                                                >
                                                                    <Edit2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => setArchiveTarget(c)}
                                                                    title="Archive customer"
                                                                    className="h-8 w-8 p-0 text-gray-500 hover:text-amber-600"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
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
                                <p className="text-sm text-gray-500">
                                    Showing {customers.from}–{customers.to} of {customers.total}
                                </p>
                                <div className="flex gap-1">
                                    {customers.links.map((link, i) => (
                                        <button
                                            key={i}
                                            disabled={!link.url}
                                            onClick={() => link.url && router.visit(link.url, { preserveState: true })}
                                            className={`min-w-[32px] rounded px-2 py-1 text-sm ${
                                                link.active
                                                    ? 'bg-blue-600 text-white'
                                                    : link.url
                                                    ? 'hover:bg-gray-100 text-gray-600'
                                                    : 'text-gray-300 cursor-not-allowed'
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

            {/* ── Edit Dialog ──────────────────────────────────────────────── */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit Customer</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="grid gap-4">
                        {/* Name */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="name">Name <span className="text-red-500">*</span></Label>
                            <Input
                                id="name"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                            />
                            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                        </div>

                        {/* Type */}
                        <div className="grid gap-1.5">
                            <Label>Customer Type <span className="text-red-500">*</span></Label>
                            <Select
                                value={data.customer_type}
                                onValueChange={(v) => setData('customer_type', v as CustomerType)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="household">Household</SelectItem>
                                    <SelectItem value="commercial">Commercial</SelectItem>
                                    <SelectItem value="industrial">Industrial</SelectItem>
                                </SelectContent>
                            </Select>
                            {errors.customer_type && (
                                <p className="text-xs text-red-500">{errors.customer_type}</p>
                            )}
                        </div>

                        {/* Address */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="address">Address</Label>
                            <Input
                                id="address"
                                value={data.address}
                                onChange={(e) => setData('address', e.target.value)}
                            />
                        </div>

                        {/* City + Barangay */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="city">City</Label>
                                <Input
                                    id="city"
                                    value={data.city}
                                    onChange={(e) => setData('city', e.target.value)}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="barangay">Barangay</Label>
                                <Input
                                    id="barangay"
                                    value={data.barangay}
                                    onChange={(e) => setData('barangay', e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Phone + Email */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="phone">Phone</Label>
                                <Input
                                    id="phone"
                                    value={data.phone}
                                    onChange={(e) => setData('phone', e.target.value)}
                                />
                                {errors.phone && (
                                    <p className="text-xs text-red-500">{errors.phone}</p>
                                )}
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={data.email}
                                    onChange={(e) => setData('email', e.target.value)}
                                />
                                {errors.email && (
                                    <p className="text-xs text-red-500">{errors.email}</p>
                                )}
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="notes">Notes</Label>
                            <textarea
                                id="notes"
                                rows={3}
                                value={data.notes}
                                onChange={(e) => setData('notes', e.target.value)}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={processing}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                {processing && <Spinner className="mr-1.5" />}
                                {processing ? 'Saving…' : 'Save Changes'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ── Archive Confirmation ─────────────────────────────────────── */}
            <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Archive Customer</AlertDialogTitle>
                        <AlertDialogDescription>
                            Archive <strong>{archiveTarget?.name}</strong>? They will be hidden from the active list but can be restored at any time.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setArchiveTarget(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleArchive}>
                            Archive
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── Permanent Delete Confirmation ────────────────────────────── */}
            <AlertDialog open={!!forceTarget} onOpenChange={(o) => !o && setForceTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Permanently Delete Customer</AlertDialogTitle>
                        <AlertDialogDescription>
                            Permanently delete <strong>{forceTarget?.name}</strong>? This action <strong>cannot be undone</strong> and will remove all associated data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setForceTarget(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleForceDelete}>
                            Delete Forever
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
