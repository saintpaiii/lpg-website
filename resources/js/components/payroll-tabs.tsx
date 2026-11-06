import { Link } from '@inertiajs/react';

/** "Payslips | Pay Rates & Rules" — shared by the Payroll and Payroll Settings pages (owner only). */
export function PayrollTabs({ active }: { active: 'payslips' | 'settings' }) {
    const tabs = [
        { key: 'payslips', label: 'Payslips', href: '/seller/payroll' },
        { key: 'settings', label: 'Pay Rates & Rules', href: '/seller/payroll/settings' },
    ] as const;

    return (
        <div className="border-b border-gray-200 dark:border-gray-800">
            <nav className="-mb-px flex gap-6">
                {tabs.map((t) => (
                    <Link key={t.key} href={t.href}
                        className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${active === t.key
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {t.label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
