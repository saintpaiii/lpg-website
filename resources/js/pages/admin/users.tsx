import { Head, Link, router } from '@inertiajs/react';
import { BadgeCheck, Search, ShoppingBag, Store, Users } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Users', href: '/admin/users' },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserRow {
    id: number;
    name: string;
    email: string;
    role: string;
    sub_role: string | null;
    is_active: boolean;
    id_verified: boolean;
    created_at: string;
    deleted_at: string | null;
    owned_store: { store_name: string; status: string } | null;
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
}

interface Props {
    users: Paginated<UserRow>;
    filter: string;
    search: string;
}

// ── Role badges ────────────────────────────────────────────────────────────────

function RoleBadges({ user }: { user: UserRow }) {
    const badges: { label: string; cls: string }[] = [];

    if (user.role === 'customer') {
        badges.push({ label: 'Buyer', cls: 'bg-blue-100 text-blue-700' });
    } else if (user.role === 'seller') {
        badges.push({ label: 'Seller', cls: 'bg-emerald-100 text-emerald-700' });
    } else if (user.role === 'seller_staff') {
        badges.push({ label: user.sub_role ? `Staff · ${user.sub_role}` : 'Seller Staff', cls: 'bg-teal-100 text-teal-700' });
    } else if (user.role === 'platform_staff') {
        badges.push({ label: user.sub_role ? `Platform Staff · ${user.sub_role}` : 'Platform Staff', cls: 'bg-violet-100 text-violet-700' });
    } else if (['platform_admin', 'admin', 'manager', 'cashier', 'warehouse', 'rider'].includes(user.role)) {
        badges.push({ label: user.role.replace('_', ' '), cls: 'bg-purple-100 text-purple-700 capitalize' });
    }


    return (
        <div className="flex flex-wrap gap-1">
            {badges.map((b, i) => (
                <span key={i} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}>
                    {b.label}
                </span>
            ))}
        </div>
    );
}

// ── Filter tabs ────────────────────────────────────────────────────────────────

const FILTERS = [
    { key: 'all',     label: 'All',     icon: Users       },
    { key: 'buyers',  label: 'Buyers',  icon: ShoppingBag },
    { key: 'sellers', label: 'Sellers', icon: Store       },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminUsers({ users, filter, search }: Props) {
    const [searchVal, setSearchVal] = useState(search);

    function applyFilter(f: string) {
        router.get('/admin/users', { filter: f, search: searchVal }, { preserveScroll: true });
    }

    function applySearch() {
        router.get('/admin/users', { filter, search: searchVal }, { preserveScroll: true });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Users" />

            <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            All registered users across the platform — {users.total} total
                        </p>
                    </div>
                </div>

                {/* Filters + Search */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex rounded-lg border bg-card p-1 gap-1">
                        {FILTERS.map((f) => {
                            const Icon = f.icon;
                            return (
                                <button
                                    key={f.key}
                                    onClick={() => applyFilter(f.key)}
                                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                        filter === f.key
                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {f.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={searchVal}
                                onChange={(e) => setSearchVal(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                                placeholder="Search name or email…"
                                className="pl-8 w-64"
                            />
                        </div>
                        <Button variant="outline" size="sm" onClick={applySearch}>
                            Search
                        </Button>
                    </div>
                </div>

                {/* Table */}
                <div className="rounded-lg border bg-card overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                                <th className="px-4 py-3 font-medium">User</th>
                                <th className="px-4 py-3 font-medium">Role</th>
                                <th className="px-4 py-3 font-medium">ID</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3 font-medium">Joined</th>
                                <th className="px-4 py-3 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {users.data.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                                        No users found.
                                    </td>
                                </tr>
                            ) : users.data.map((u) => (
                                <tr key={u.id} className={`hover:bg-muted/30 transition-colors ${u.deleted_at ? 'opacity-60' : ''}`}>
                                    <td className="px-4 py-3">
                                        <p className="font-medium">{u.name}</p>
                                        <p className="text-muted-foreground text-xs">{u.email}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <RoleBadges user={u} />
                                        {u.owned_store && (
                                            <p className="text-xs text-muted-foreground mt-0.5">{u.owned_store.store_name}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {u.id_verified ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                                                <BadgeCheck className="h-3.5 w-3.5" /> Verified
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {u.deleted_at ? (
                                            <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Archived</span>
                                        ) : u.is_active ? (
                                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Active</span>
                                        ) : (
                                            <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Inactive</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(u.created_at)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            href={`/admin/users/${u.id}`}
                                            className="text-xs text-primary hover:underline"
                                        >
                                            View
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {users.last_page > 1 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                            Page {users.current_page} of {users.last_page} · {users.total} users
                        </span>
                        <div className="flex gap-1">
                            {users.links.map((link, i) => (
                                <button
                                    key={i}
                                    disabled={!link.url}
                                    onClick={() => link.url && router.get(link.url, {}, { preserveScroll: true })}
                                    className={`rounded px-3 py-1.5 text-xs transition-colors ${
                                        link.active
                                            ? 'bg-primary text-primary-foreground'
                                            : link.url
                                            ? 'border hover:bg-muted'
                                            : 'opacity-40 cursor-not-allowed border'
                                    }`}
                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
