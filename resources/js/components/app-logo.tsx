import { Flame } from 'lucide-react';

export default function AppLogo() {
    return (
        <>
            <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-blue-600 text-white">
                <Flame className="size-5" />
            </div>
            <div className="ml-1 grid flex-1 text-left text-sm">
                <span className="mb-0.5 truncate font-semibold leading-tight">
                    LPG Management
                </span>
                <span className="truncate text-xs text-muted-foreground">
                    Cavite
                </span>
            </div>
        </>
    );
}
