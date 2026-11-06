import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, BadgeDollarSign, FileDown } from 'lucide-react';
import { PayslipView, type PayslipData } from '@/components/payslip-view';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type Props = {
    payslip: PayslipData;
    /** store = owner / Payroll staff; self = my payslips */
    mode: 'store' | 'self';
    is_rider: boolean;
    pdf_url: string;
    back_url: string;
};

export default function PayslipPage({ payslip, mode, is_rider, pdf_url, back_url }: Props) {
    const breadcrumbs: BreadcrumbItem[] = mode === 'store'
        ? [
            { title: 'Dashboard', href: '/seller/dashboard' },
            { title: 'Payroll', href: back_url },
            { title: payslip.name, href: `/seller/payroll/${payslip.id}` },
        ]
        : [
            { title: is_rider ? 'My Deliveries' : 'Dashboard', href: is_rider ? '/rider/deliveries' : '/seller/dashboard' },
            { title: 'My Payslips', href: back_url },
            { title: 'Payslip', href: `${back_url}/${payslip.id}` },
        ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Payslip — ${payslip.name}`} />

            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <Link href={back_url} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Back">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100">
                            <BadgeDollarSign className="h-5 w-5 text-blue-600" /> Payslip
                        </h1>
                    </div>
                    <a href={pdf_url} target="_blank" rel="noopener"
                        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent">
                        <FileDown className="h-4 w-4" /> PDF
                    </a>
                </div>

                <PayslipView p={payslip} />
            </div>
        </AppLayout>
    );
}
