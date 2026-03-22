import { Head } from '@inertiajs/react';
import {
    ArrowLeft,
    Building2,
    CheckCircle,
    CreditCard,
    Mail,
    MapPin,
    Phone,
    Printer,
    User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type PaymentStatus = 'unpaid' | 'paid' | 'partial';

type OrderItem = {
    id: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
    product: { id: number; name: string; brand: string | null } | null;
};

type Invoice = {
    id: number;
    invoice_number: string;
    payment_status: PaymentStatus;
    total_amount: number;
    paid_amount: number;
    balance: number;
    platform_commission: number;
    net_amount: number;
    payment_method: string | null;
    paid_at: string | null;
    due_date: string | null;
    created_at: string;
    deleted_at: string | null;
    customer: {
        id: number;
        name: string;
        phone: string | null;
        email: string | null;
        address: string | null;
        barangay: string | null;
        city: string | null;
    } | null;
    order: {
        id: number;
        order_number: string;
        status: string;
        transaction_type: string;
        payment_method: string;
        payment_status: string;
        notes: string | null;
        ordered_at: string | null;
        delivered_at: string | null;
        items: OrderItem[];
    } | null;
};

type Company = {
    name: string;
    address: string;
    phone: string;
    email: string;
};

type Props = {
    invoice: Invoice;
    company: Company;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<PaymentStatus, string> = {
    unpaid:  'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
    paid:    'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
    unpaid:  'Unpaid',
    partial: 'Partial',
    paid:    'Paid',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash:          'Cash',
    gcash:         'GCash',
    maya:          'Maya',
    bank_transfer: 'Bank Transfer',
};

const TX_LABELS: Record<string, string> = {
    refill:       'Refill',
    new_purchase: 'New Purchase',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

// ── Invoice Print View (injected into DOM, shown on print) ────────────────────

function InvoicePrintView({ invoice, company }: { invoice: Invoice; company: Company }) {
    return (
        <div className="hidden print:block font-sans text-gray-900">
            {/* Company header */}
            <div className="mb-8 flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{company.name}</h1>
                    {company.address && <p className="text-sm text-gray-600">{company.address}</p>}
                    {company.phone && <p className="text-sm text-gray-600">{company.phone}</p>}
                    {company.email && <p className="text-sm text-gray-600">{company.email}</p>}
                </div>
                <div className="text-right">
                    <h2 className="text-3xl font-bold text-gray-300">INVOICE</h2>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{invoice.invoice_number}</p>
                    <p className="text-sm text-gray-500">Date: {fmtDate(invoice.created_at)}</p>
                    {invoice.due_date && <p className="text-sm text-gray-500">Due: {fmtDate(invoice.due_date)}</p>}
                </div>
            </div>

            {/* Customer */}
            <div className="mb-8">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Bill To</h3>
                {invoice.customer && (
                    <>
                        <p className="font-semibold text-gray-900">{invoice.customer.name}</p>
                        {invoice.customer.phone && <p className="text-sm text-gray-600">{invoice.customer.phone}</p>}
                        {invoice.customer.email && <p className="text-sm text-gray-600">{invoice.customer.email}</p>}
                        {(invoice.customer.address || invoice.customer.barangay) && (
                            <p className="text-sm text-gray-600">
                                {[invoice.customer.address, invoice.customer.barangay, invoice.customer.city].filter(Boolean).join(', ')}
                            </p>
                        )}
                    </>
                )}
            </div>

            {/* Items table */}
            <table className="mb-8 w-full border-collapse text-sm">
                <thead>
                    <tr className="border-b-2 border-gray-900">
                        <th className="pb-2 text-left">Description</th>
                        <th className="pb-2 text-right">Qty</th>
                        <th className="pb-2 text-right">Unit Price</th>
                        <th className="pb-2 text-right">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    {invoice.order?.items.map((item) => (
                        <tr key={item.id} className="border-b border-gray-200">
                            <td className="py-2">
                                {item.product?.name ?? 'Unknown product'}
                                {item.product?.brand && <span className="text-gray-500"> ({item.product.brand})</span>}
                            </td>
                            <td className="py-2 text-right">{item.quantity}</td>
                            <td className="py-2 text-right">{peso(item.unit_price)}</td>
                            <td className="py-2 text-right font-medium">{peso(item.subtotal)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="border-t-2 border-gray-900">
                        <td colSpan={3} className="pt-3 text-right font-bold">Total</td>
                        <td className="pt-3 text-right font-bold text-lg">{peso(invoice.total_amount)}</td>
                    </tr>
                    {invoice.paid_amount > 0 && (
                        <tr>
                            <td colSpan={3} className="pt-1 text-right text-gray-600">Paid</td>
                            <td className="pt-1 text-right text-emerald-700">({peso(invoice.paid_amount)})</td>
                        </tr>
                    )}
                    {invoice.balance > 0 && (
                        <tr>
                            <td colSpan={3} className="pt-1 text-right font-semibold text-red-700">Balance Due</td>
                            <td className="pt-1 text-right font-semibold text-red-700">{peso(invoice.balance)}</td>
                        </tr>
                    )}
                </tfoot>
            </table>

            {/* Payment info */}
            {invoice.payment_method && (
                <div className="mb-4">
                    <p className="text-sm text-gray-600">
                        Payment Method: <span className="font-medium">{PAYMENT_METHOD_LABELS[invoice.payment_method] ?? invoice.payment_method}</span>
                    </p>
                    {invoice.paid_at && (
                        <p className="text-sm text-gray-600">Paid at: <span className="font-medium">{fmtDate(invoice.paid_at)}</span></p>
                    )}
                </div>
            )}

            {/* Status stamp */}
            <div className={`inline-block rounded-lg border-4 px-6 py-2 text-xl font-black uppercase tracking-widest ${
                invoice.payment_status === 'paid'
                    ? 'border-emerald-500 text-emerald-500'
                    : invoice.payment_status === 'partial'
                    ? 'border-amber-500 text-amber-500'
                    : 'border-red-500 text-red-500'
            }`}>
                {STATUS_LABELS[invoice.payment_status]}
            </div>

            <p className="mt-8 text-center text-xs text-gray-400">Thank you for your business!</p>
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function InvoiceShowPage({ invoice, company }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Invoices', href: '/admin/invoices' },
        { title: invoice.invoice_number, href: `/admin/invoices/${invoice.id}` },
    ];

    const isPaid = invoice.payment_status === 'paid';
    const isArchived = !!invoice.deleted_at;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Invoice ${invoice.invoice_number}`} />

            {/* Print styles injected globally */}
            <style>{`
                @media print {
                    body > * { display: none !important; }
                    body > div.print-root { display: block !important; }
                    .no-print { display: none !important; }
                }
            `}</style>

            <div className="flex flex-1 flex-col gap-6 p-6 no-print">

                {/* Toolbar */}
                <div className="flex items-center justify-between">
                    <Button
                        variant="ghost"
                        onClick={() => history.back()}
                        className="flex items-center gap-1.5 text-gray-600"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Invoices
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => window.print()}
                        >
                            <Printer className="mr-1.5 h-4 w-4" />
                            Print
                        </Button>
                    </div>
                </div>

                {isArchived && (
                    <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700 border border-amber-200">
                        This invoice is read-only (platform monitoring).
                    </div>
                )}

                {/* Main invoice layout */}
                <div className="grid gap-6 lg:grid-cols-3">

                    {/* Invoice document — left 2/3 */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Header card */}
                        <Card>
                            <CardContent className="pt-6">
                                {/* Company + Invoice number row */}
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                                            <Building2 className="h-5 w-5 text-blue-600" />
                                            {company.name}
                                        </h2>
                                        {company.address && (
                                            <p className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
                                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                                {company.address}
                                            </p>
                                        )}
                                        {company.phone && (
                                            <p className="flex items-center gap-1.5 mt-0.5 text-sm text-gray-500">
                                                <Phone className="h-3.5 w-3.5 shrink-0" />
                                                {company.phone}
                                            </p>
                                        )}
                                        {company.email && (
                                            <p className="flex items-center gap-1.5 mt-0.5 text-sm text-gray-500">
                                                <Mail className="h-3.5 w-3.5 shrink-0" />
                                                {company.email}
                                            </p>
                                        )}
                                    </div>

                                    <div className="text-right">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Invoice</p>
                                        <p className="font-mono text-xl font-bold text-blue-600">{invoice.invoice_number}</p>
                                        <p className="mt-1 text-sm text-gray-500">Issued: {fmtDate(invoice.created_at)}</p>
                                        {invoice.due_date && (
                                            <p className="text-sm text-gray-500">Due: {fmtDate(invoice.due_date)}</p>
                                        )}
                                        <div className="mt-2">
                                            <span className={`inline-flex items-center rounded-full px-3 py-0.5 text-sm font-semibold ${STATUS_STYLES[invoice.payment_status]}`}>
                                                {STATUS_LABELS[invoice.payment_status]}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Bill to */}
                                <Separator className="my-5" />
                                <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Bill To</p>
                                    {invoice.customer ? (
                                        <div className="flex items-start gap-2">
                                            <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                            <div>
                                                <p className="font-semibold text-gray-900">{invoice.customer.name}</p>
                                                {invoice.customer.phone && (
                                                    <p className="text-sm text-gray-500">{invoice.customer.phone}</p>
                                                )}
                                                {invoice.customer.email && (
                                                    <p className="text-sm text-gray-500">{invoice.customer.email}</p>
                                                )}
                                                {(invoice.customer.address || invoice.customer.barangay) && (
                                                    <p className="text-sm text-gray-500">
                                                        {[invoice.customer.address, invoice.customer.barangay, invoice.customer.city].filter(Boolean).join(', ')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-400">No customer info</p>
                                    )}
                                </div>

                                {/* Order reference */}
                                {invoice.order && (
                                    <>
                                        <Separator className="my-5" />
                                        <div className="flex flex-wrap gap-4 text-sm">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Order</p>
                                                <a
                                                    href={`/admin/orders/${invoice.order.id}`}
                                                    className="font-mono font-semibold text-blue-600 hover:underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {invoice.order.order_number}
                                                </a>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Type</p>
                                                <p className="font-medium">{TX_LABELS[invoice.order.transaction_type] ?? invoice.order.transaction_type}</p>
                                            </div>
                                            {invoice.order.ordered_at && (
                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Ordered</p>
                                                    <p className="font-medium">{invoice.order.ordered_at}</p>
                                                </div>
                                            )}
                                            {invoice.order.delivered_at && (
                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Delivered</p>
                                                    <p className="font-medium text-emerald-600">{invoice.order.delivered_at}</p>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>

                        {/* Items table */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Items</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                <th className="px-4 py-3">Product</th>
                                                <th className="px-4 py-3 text-right">Qty</th>
                                                <th className="px-4 py-3 text-right">Unit Price</th>
                                                <th className="px-4 py-3 text-right">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {(invoice.order?.items ?? []).map((item) => (
                                                <tr key={item.id}>
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium text-gray-900">{item.product?.name ?? '—'}</p>
                                                        {item.product?.brand && (
                                                            <p className="text-xs text-gray-400">{item.product.brand}</p>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{peso(item.unit_price)}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums font-medium">{peso(item.subtotal)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-gray-200 bg-gray-50">
                                                <td colSpan={3} className="px-4 py-3 text-right font-bold text-gray-900">Total</td>
                                                <td className="px-4 py-3 text-right tabular-nums text-lg font-bold text-gray-900">
                                                    {peso(invoice.total_amount)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sidebar — right 1/3 */}
                    <div className="space-y-4">

                        {/* Payment summary */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <CreditCard className="h-4 w-4 text-blue-600" />
                                    Payment
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Total Amount</span>
                                    <span className="font-semibold tabular-nums">{peso(invoice.total_amount)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Paid</span>
                                    <span className="font-semibold tabular-nums text-emerald-600">{peso(invoice.paid_amount)}</span>
                                </div>
                                <Separator />
                                <div className="flex justify-between text-sm font-bold">
                                    <span>Balance</span>
                                    <span className={`tabular-nums ${invoice.balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                        {peso(invoice.balance)}
                                    </span>
                                </div>

                                {invoice.platform_commission > 0 && (
                                    <>
                                        <Separator />
                                        <div className="flex justify-between text-sm">
                                            <span className="text-amber-600">Platform Fee</span>
                                            <span className="tabular-nums text-amber-600">-{peso(invoice.platform_commission)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm font-semibold">
                                            <span>Net to Seller</span>
                                            <span className="tabular-nums text-emerald-600">{peso(invoice.net_amount)}</span>
                                        </div>
                                    </>
                                )}

                                {invoice.payment_method && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Method</span>
                                        <span>{PAYMENT_METHOD_LABELS[invoice.payment_method] ?? invoice.payment_method}</span>
                                    </div>
                                )}

                                {invoice.paid_at && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Paid at</span>
                                        <span className="text-right">{fmtDate(invoice.paid_at)}</span>
                                    </div>
                                )}

                                {invoice.due_date && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Due date</span>
                                        <span>{fmtDate(invoice.due_date)}</span>
                                    </div>
                                )}

                                {isPaid && (
                                    <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">
                                        <CheckCircle className="h-4 w-4 shrink-0" />
                                        Fully paid
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Order notes */}
                        {invoice.order?.notes && (
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base text-sm">Order Notes</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-gray-600 whitespace-pre-line">{invoice.order.notes}</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>

            {/* Print-only version */}
            <div className="print-root hidden print:block p-8">
                <InvoicePrintView invoice={invoice} company={company} />
            </div>

        </AppLayout>
    );
}
