import { router, usePage } from '@inertiajs/react';
import { Check, Crown, Lock, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { peso } from '@/components/plan-cards';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FEATURE_INFO } from '@/lib/plans';
import { cn } from '@/lib/utils';
import type { SharedData } from '@/types';

/**
 * "{Feature} is a Pro / Premium feature" — opened by openUpgrade(feature) from locked sidebar items and buttons.
 * Mounted once in the seller layout.
 */
export function UpgradeDialog() {
    const { auth, plan, planCatalog } = usePage<SharedData>().props;
    const [feature, setFeature] = useState<string | null>(null);

    useEffect(() => {
        const onOpen = (e: Event) => setFeature((e as CustomEvent<{ feature: string }>).detail?.feature ?? null);
        window.addEventListener('open-upgrade', onOpen);
        return () => window.removeEventListener('open-upgrade', onOpen);
    }, []);

    if (!plan) return null;
    const info = feature ? FEATURE_INFO[feature] : null;
    const isOwner = auth.user?.role === 'seller';
    const label = info?.label ?? planCatalog?.feature_labels[feature ?? ''] ?? 'This feature';

    return (
        <Dialog open={!!feature} onOpenChange={(o) => !o && setFeature(null)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-amber-500" />
                        {label} is a {info?.plan ?? 'Pro'} feature
                    </DialogTitle>
                    {info && <DialogDescription>{info.what}</DialogDescription>}
                </DialogHeader>

                {planCatalog && feature && (
                    <div className="grid gap-2 sm:grid-cols-3">
                        {planCatalog.plans.map((p) => {
                            const included = p.features.includes(feature);
                            const current = plan.active && (plan.key === p.key);
                            return (
                                <div
                                    key={p.key}
                                    className={cn(
                                        'rounded-lg border p-3 text-sm',
                                        included ? 'border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30' : 'opacity-70',
                                    )}
                                >
                                    <p className="flex items-center gap-1 font-semibold">
                                        {p.key === 'premium' && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                                        {p.name}
                                        {current && <span className="ml-auto rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Current</span>}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{peso(p.price)} / {planCatalog.days} days</p>
                                    <p className={cn('mt-2 flex items-center gap-1 text-xs font-medium', included ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
                                        {included ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                                        {included ? 'Included' : 'Not included'}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}

                <DialogFooter>
                    {isOwner ? (
                        <>
                            <Button variant="outline" onClick={() => setFeature(null)}>Not now</Button>
                            <Button onClick={() => { setFeature(null); router.visit(`/seller/plan?choose=${info?.key ?? 'pro'}`); }}>
                                See plans
                            </Button>
                        </>
                    ) : (
                        <p className="w-full text-sm text-muted-foreground">Ask your store owner to upgrade the plan.</p>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
