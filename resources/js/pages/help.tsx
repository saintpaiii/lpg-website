import { Head, router, usePage } from '@inertiajs/react';
import { BookOpen, CheckCircle2, Circle, Loader2, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import CustomerLayout from '@/layouts/customer-layout';
import { useTourContext } from '@/tutorials/context';
import { startUrlFor, toursForHelp } from '@/tutorials/registry';
import { resetAll, setEnabled, statusOf, useTutorialProgress } from '@/tutorials/store';
import { startTour } from '@/tutorials/use-tour';
import type { Tour } from '@/tutorials/types';
import type { SharedData } from '@/types';

/** Help & Tutorials — layout chosen like SettingsShell: customers in the Customer Portal, everyone else in the app layout. */
function Shell({ children }: { children: ReactNode }) {
    const { auth } = usePage<SharedData>().props;
    if (auth.user?.role === 'customer') return <CustomerLayout title="Help & Tutorials">{children}</CustomerLayout>;
    return <AppLayout breadcrumbs={[{ title: 'Help & Tutorials', href: '/help' }]}>{children}</AppLayout>;
}

const STATUS = {
    done:    { label: 'Done',     icon: CheckCircle2, cls: 'text-emerald-700 dark:text-emerald-400' },
    skipped: { label: 'Skipped',  icon: SkipForward,  cls: 'text-amber-700 dark:text-amber-400' },
    new:     { label: 'Not seen', icon: Circle,       cls: 'text-muted-foreground' },
} as const;

export default function HelpPage() {
    const ctx = useTourContext();
    const progress = useTutorialProgress();   // re-render when progress changes
    const tours = toursForHelp(ctx);
    const [confirmReset, setConfirmReset] = useState(false);
    const [busy, setBusy] = useState(false);

    function start(tour: Tour) {
        const url = startUrlFor(tour, ctx);
        if (!url) return;
        if (url === window.location.pathname) { startTour(tour, ctx, { replay: true }); return; }
        router.visit(`${url}?tour=${encodeURIComponent(tour.key)}`);
    }

    async function doReset() {
        setBusy(true);
        try {
            await resetAll();
            toast.success('All tutorials will show again.');
            setConfirmReset(false);
        } catch {
            toast.error('Could not reset the tutorials. Please try again.');
        } finally {
            setBusy(false);
        }
    }

    async function toggle(on: boolean) {
        try { await setEnabled(on); } catch { toast.error('Could not save. Please try again.'); }
    }

    return (
        <Shell>
            <Head title="Help & Tutorials" />
            <div className="mx-auto w-full max-w-3xl space-y-5 p-4 md:p-6">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-bold"><BookOpen className="h-5 w-5 text-blue-600" /> Help & Tutorials</h1>
                    <p className="text-sm text-muted-foreground">Short guided tours of each page. The <strong>?</strong> button at the top of a page replays its tour any time.</p>
                </div>

                <Card>
                    <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                        <label htmlFor="tut-auto" className="min-w-0 flex-1 text-sm">
                            <span className="font-medium">Show tutorials automatically</span>
                            <span className="block text-xs text-muted-foreground">A short tour the first time you open each page.</span>
                        </label>
                        <button
                            id="tut-auto" type="button" role="switch" aria-checked={progress.enabled} onClick={() => toggle(!progress.enabled)}
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${progress.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                        >
                            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${progress.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
                        <CardTitle className="text-base">Tutorials</CardTitle>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirmReset(true)}>
                            <RotateCcw className="h-3.5 w-3.5" /> Reset all tutorials
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ul className="divide-y">
                            {tours.map((t) => {
                                const st = STATUS[statusOf(t.key)];
                                const url = startUrlFor(t, ctx);
                                return (
                                    <li key={t.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium">
                                                {t.title}
                                                {t.core && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Start here</span>}
                                            </p>
                                            {!url && t.where && <p className="text-xs text-muted-foreground">{t.where}</p>}
                                        </div>
                                        <span className={`inline-flex items-center gap-1 text-xs ${st.cls}`}><st.icon className="h-3.5 w-3.5" /> {st.label}</span>
                                        {url ? (
                                            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => start(t)}>
                                                <Play className="h-3.5 w-3.5" /> Start
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">Runs on that page</span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </CardContent>
                </Card>
            </div>

            <AlertDialog open={confirmReset} onOpenChange={(o) => !busy && setConfirmReset(o)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset all tutorials?</AlertDialogTitle>
                        <AlertDialogDescription>Every tour shows again, starting with the main one on your home page.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => { e.preventDefault(); doReset(); }} disabled={busy} className="bg-blue-600 text-white hover:bg-blue-700">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reset'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Shell>
    );
}
