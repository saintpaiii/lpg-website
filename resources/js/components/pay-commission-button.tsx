import axios from 'axios';
import { CreditCard, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** Starts a PayMongo checkout for a commission invoice and redirects to it. */
export function PayCommissionButton({ invoiceId, label = 'Pay Now', className = '', size = 'sm' }: {
    invoiceId: number;
    label?: string;
    className?: string;
    size?: 'sm' | 'default' | 'lg';
}) {
    const [loading, setLoading] = useState(false);

    async function pay() {
        setLoading(true);
        try {
            const res = await axios.post<{ checkout_url?: string; error?: string }>(`/seller/commission/${invoiceId}/pay`);
            if (res.data.checkout_url) {
                window.location.href = res.data.checkout_url;
                return;
            }
            toast.error(res.data.error ?? 'Could not start payment.');
        } catch (err) {
            toast.error(axios.isAxiosError(err) ? (err.response?.data?.error ?? 'Could not start payment.') : 'Could not start payment.');
        }
        setLoading(false);
    }

    return (
        <Button size={size} onClick={pay} disabled={loading} className={`gap-1.5 ${className}`}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {label}
        </Button>
    );
}
