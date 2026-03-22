import { Head, Link } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type InvoiceItem = { product: string; brand: string; qty: number; price: number; subtotal: number };
type Invoice = {
    id: number;
    invoice_number: string;
    total_amount: number;
    paid_amount: number;
    payment_status: string;
    payment_method: string | null;
    platform_commission: number;
    net_amount: number;
    due_date: string | null;
    paid_at: string | null;
    created_at: string;
    customer: { name: string; phone: string | null; address: string; city: string } | null;
    order: { id: number; order_number: string; transaction_type: string; items: InvoiceItem[] } | null;
};

type Props = { invoice: Invoice };

const PAY_COLORS: Record<string, string> = {
    paid:    'bg-green-100 text-green-700 border-green-200',
    unpaid:  'bg-red-100 text-red-700 border-red-200',
    partial: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

function fmt(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SellerInvoiceShow({ invoice }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/seller/dashboard' },
        { title: 'Invoices',  href: '/seller/invoices'  },
        { title: invoice.invoice_number, href: `/seller/invoices/${invoice.id}` },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={invoice.invoice_number} />

            <div className="p-6 space-y-6 max-w-3xl">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Link href="/seller/invoices">
                            <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
                        </Link>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-bold font-mono">{invoice.invoice_number}</h1>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PAY_COLORS[invoice.payment_status] ?? 'bg-gray-100 text-gray-700'}`}>
                                    {invoice.payment_status}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Issued {invoice.created_at}
                                {invoice.due_date && ` · Due ${invoice.due_date}`}
                                {invoice.paid_at && ` · Paid ${invoice.paid_at}`}
                            </p>
                        </div>
                    </div>
                    {invoice.order && (
                        <Link href={`/seller/orders/${invoice.order.id}`}>
                            <Button size="sm" variant="outline">View Order</Button>
                        </Link>
                    )}
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Items */}
                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2"><CardTitle className="text-base">Items</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Product</th>
                                        <th className="text-center px-4 py-2 font-medium text-muted-foreground">Qty</th>
                                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Price</th>
                                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(invoice.order?.items ?? []).map((item, idx) => (
                                        <tr key={idx} className="border-b last:border-0">
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{item.product}</p>
                                                <p className="text-xs text-muted-foreground">{item.brand}</p>
                                            </td>
                                            <td className="px-4 py-3 text-center">{item.qty}</td>
                                            <td className="px-4 py-3 text-right">{fmt(item.price)}</td>
                                            <td className="px-4 py-3 text-right font-medium">{fmt(item.subtotal)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t">
                                        <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground text-sm">Subtotal</td>
                                        <td className="px-4 py-2 text-right font-semibold">{fmt(invoice.total_amount)}</td>
                                    </tr>
                                    <tr>
                                        <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground text-sm">Platform Commission</td>
                                        <td className="px-4 py-2 text-right text-red-600 font-medium">−{fmt(invoice.platform_commission)}</td>
                                    </tr>
                                    <tr className="bg-muted/20">
                                        <td colSpan={3} className="px-4 py-3 text-right font-bold">Net Earnings</td>
                                        <td className="px-4 py-3 text-right font-bold text-emerald-700 text-lg">{fmt(invoice.net_amount)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </CardContent>
                    </Card>

                    {/* Right panel */}
                    <div className="space-y-4">
                        {invoice.customer && (
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm">Customer</CardTitle></CardHeader>
                                <CardContent className="text-sm space-y-1">
                                    <p className="font-semibold">{invoice.customer.name}</p>
                                    {invoice.customer.phone && <p className="text-muted-foreground">{invoice.customer.phone}</p>}
                                    <p className="text-xs text-muted-foreground">{invoice.customer.address}, {invoice.customer.city}</p>
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">Payment</CardTitle></CardHeader>
                            <CardContent className="text-sm space-y-1.5">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Method</span>
                                    <span className="capitalize">{invoice.payment_method?.replace('_', ' ') ?? '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Status</span>
                                    <span className="font-medium capitalize">{invoice.payment_status}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Paid</span>
                                    <span>{fmt(invoice.paid_amount)}</span>
                                </div>
                                <div className="flex justify-between pt-1 border-t">
                                    <span className="text-muted-foreground">Balance</span>
                                    <span className={`font-semibold ${invoice.total_amount - invoice.paid_amount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {fmt(Math.max(0, invoice.total_amount - invoice.paid_amount))}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
