import { usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { PlanCardButton, PlanCards } from '@/components/plan-cards';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { planNeedsAttention } from '@/lib/plans';
import type { SharedData } from '@/types';

const STORAGE_KEY = 'plan-expiry-dialog-seen';

/** Store owner only: once a day while the plan ends within 3 days or has ended — compare plans and pick one. */
export function PlanExpiryDialog() {
    const { auth, plan, planCatalog } = usePage<SharedData>().props;
    const state = planNeedsAttention(plan);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (auth.user?.role !== 'seller' || !state || !planCatalog) return;
        if (window.location.pathname.startsWith('/seller/plan')) return;
        const today = new Date().toISOString().slice(0, 10);
        let seen: string | null = null;
        try { seen = localStorage.getItem(STORAGE_KEY); } catch { /* storage blocked */ }
        if (seen === today) return;
        try { localStorage.setItem(STORAGE_KEY, today); } catch { /* storage blocked */ }
        setOpen(true);
    }, [auth.user?.role, state, planCatalog]);

    if (!plan || !planCatalog || !state) return null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
                <DialogHeader>
                    <DialogTitle>
                        {state === 'expired' ? 'Your plan has ended' : `Your plan ends in ${plan.days_left} day${plan.days_left === 1 ? '' : 's'}`}
                    </DialogTitle>
                    <DialogDescription>
                        {state === 'expired'
                            ? 'Your products are hidden from customers until you choose a plan.'
                            : `Choose a plan before ${plan.expires_label} so your products stay visible to customers.`}
                    </DialogDescription>
                </DialogHeader>
                <PlanCards
                    catalog={planCatalog}
                    currentKey={plan.active && !plan.is_trial ? plan.key : null}
                    renderAction={(p) => (
                        <PlanCardButton href={`/seller/plan?choose=${p.key}`} variant={p.key === 'pro' ? 'default' : 'outline'}>
                            {plan.active && plan.key === p.key ? 'Extend 30 days' : `Choose ${p.name}`}
                        </PlanCardButton>
                    )}
                />
            </DialogContent>
        </Dialog>
    );
}
