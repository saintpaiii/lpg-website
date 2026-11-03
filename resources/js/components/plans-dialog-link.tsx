import { useState } from 'react';
import { PlanCards } from '@/components/plan-cards';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PlanCatalog } from '@/types/plans';

/** "See plans and prices" under the plan agreement on the seller application forms. */
export function PlansDialogLink({ catalog }: { catalog?: PlanCatalog | null }) {
    const [open, setOpen] = useState(false);
    if (!catalog || catalog.plans.length === 0) return null;

    return (
        <>
            <button type="button" onClick={() => setOpen(true)} className="ml-7 text-xs font-medium text-blue-600 hover:underline">
                See plans and prices
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
                    <DialogHeader>
                        <DialogTitle>Plans and prices</DialogTitle>
                        <DialogDescription>
                            Your store starts with a free {catalog.trial_days}-day Premium trial after approval. No commission — you keep 100% of your sales.
                        </DialogDescription>
                    </DialogHeader>
                    <PlanCards catalog={catalog} />
                </DialogContent>
            </Dialog>
        </>
    );
}
