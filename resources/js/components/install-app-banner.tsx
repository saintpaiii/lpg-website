import { Flame, X } from 'lucide-react';
import { useEffect, useState } from 'react';

// Typed interface for the browser install prompt event
interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    prompt(): Promise<void>;
}

export function InstallAppBanner() {
    const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [dismissed, setDismissed]     = useState(false);
    const [installing, setInstalling]   = useState(false);

    useEffect(() => {
        // Already installed (running as PWA)
        if (window.matchMedia('(display-mode: standalone)').matches) return;

        // Previously dismissed this session
        if (sessionStorage.getItem('pwa-banner-dismissed')) return;

        const handler = (e: Event) => {
            e.preventDefault();
            setPromptEvent(e as BeforeInstallPromptEvent);
        };

        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    async function handleInstall() {
        if (!promptEvent) return;
        setInstalling(true);
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === 'accepted') {
            setPromptEvent(null);
        }
        setInstalling(false);
    }

    function handleDismiss() {
        sessionStorage.setItem('pwa-banner-dismissed', '1');
        setDismissed(true);
    }

    if (!promptEvent || dismissed) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden animate-in slide-in-from-bottom duration-300">
            <div className="mx-3 mb-3 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 shadow-xl shadow-blue-900/30 p-4 text-white">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                        <Flame className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight">Install LPG Cavite App</p>
                        <p className="text-xs text-blue-100 mt-0.5">Get faster access and a better experience</p>
                        <div className="mt-2.5 flex gap-2">
                            <button
                                onClick={handleInstall}
                                disabled={installing}
                                className="rounded-lg bg-white text-blue-700 font-semibold text-xs px-4 py-1.5 hover:bg-blue-50 transition-colors disabled:opacity-70"
                            >
                                {installing ? 'Installing…' : 'Install'}
                            </button>
                            <button
                                onClick={handleDismiss}
                                className="rounded-lg border border-white/30 text-white font-medium text-xs px-3 py-1.5 hover:bg-white/10 transition-colors"
                            >
                                Not now
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                        aria-label="Dismiss"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
