import { Flag } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import ReportFormDialog from './report-form-dialog';

/** Rider: "Report customer" for one delivery (goes to the store and the admin). */
export default function ReportCustomerButton({ order, className }: {
    order: { id: number; order_number: string; store_name: string | null };
    className?: string;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button type="button" size="sm" variant="outline" className={className ?? 'h-7 gap-1 border-red-200 text-xs text-red-600 hover:bg-red-50'}
                onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
                <Flag className="h-3.5 w-3.5" /> Report customer
            </Button>
            <div onClick={(e) => e.stopPropagation()}>
                <ReportFormDialog
                    open={open}
                    onOpenChange={setOpen}
                    reporterSide="rider"
                    submitUrl="/rider/reports"
                    order={{ id: order.id, order_number: order.order_number, items: [], has_rider: true, store_name: order.store_name ?? 'Your store' }}
                />
            </div>
        </>
    );
}
