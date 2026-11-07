import { useForm } from '@inertiajs/react';
import { RefreshCcw } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const CHIPS = [1, 3, 7, 14, 30];

/** Settings → Refunds: days after delivery a customer can request a refund (own route, like Tax & Invoice). */
export function RefundWindowCard({ days }: { days: number }) {
    const { data, setData, put, processing, errors, recentlySuccessful } = useForm<{ refund_window_days: number | '' }>({
        refund_window_days: days,
    });

    function save(e: React.FormEvent) {
        e.preventDefault();
        put('/seller/settings/refunds', { preserveScroll: true });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <RefreshCcw className="h-4 w-4 text-blue-600" /> Refunds
                </CardTitle>
                <CardDescription>
                    Customers can request a refund within this many days after delivery. Orders already placed keep the window
                    they were bought with. Leaking tanks can always be reported.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={save} className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            type="number" inputMode="numeric" min={1} max={90} step={1}
                            value={data.refund_window_days}
                            onChange={(e) => setData('refund_window_days', e.target.value === '' ? '' : Number(e.target.value))}
                            className="h-9 w-24"
                            aria-label="Refund window in days"
                        />
                        <span className="text-sm text-gray-500">days after delivery</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {CHIPS.map((n) => (
                            <button
                                key={n} type="button" onClick={() => setData('refund_window_days', n)}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                    data.refund_window_days === n
                                        ? 'border-blue-600 bg-blue-600 text-white'
                                        : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                                }`}
                            >
                                {n} day{n === 1 ? '' : 's'}
                            </button>
                        ))}
                    </div>
                    {errors.refund_window_days && <p className="text-xs text-red-600">{errors.refund_window_days}</p>}
                    <div className="flex items-center justify-end gap-3">
                        {recentlySuccessful && <p className="text-sm font-medium text-emerald-600">Saved.</p>}
                        <Button type="submit" disabled={processing} className="bg-blue-600 text-white hover:bg-blue-700">
                            {processing && <Spinner className="mr-1.5" />}
                            {processing ? 'Saving…' : 'Save refund window'}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
