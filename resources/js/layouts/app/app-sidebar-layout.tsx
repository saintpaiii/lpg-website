import { AppContent } from '@/components/app-content';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { DocumentSuspensionBanner } from '@/components/document-suspension-banner';
import { PlanExpiryDialog } from '@/components/plan-expiry-dialog';
import { PlanStatusBanner } from '@/components/plan-status-banner';
import { UpgradeDialog } from '@/components/upgrade-dialog';
import { StoreLocationBanner } from '@/components/store-location-banner';
import { StoreVisibilityBanner } from '@/components/store-visibility-banner';
import { RiderLicenseBanner } from '@/components/rider-license-banner';
import { InstallAppBanner } from '@/components/install-app-banner';
import { useFlashToast } from '@/hooks/use-flash-toast';
import type { AppLayoutProps } from '@/types';
import { Toaster } from 'sonner';

export default function AppSidebarLayout({
    children,
    breadcrumbs = [],
}: AppLayoutProps) {
    useFlashToast();

    return (
        <AppShell variant="sidebar">
            <AppSidebar />
            <AppContent variant="sidebar" className="overflow-x-hidden">
                <AppSidebarHeader breadcrumbs={breadcrumbs} />
                <PlanStatusBanner />
                <DocumentSuspensionBanner />
                <StoreVisibilityBanner />
                <StoreLocationBanner />
                <RiderLicenseBanner />
                {children}
            </AppContent>
            <Toaster richColors position="top-right" toastOptions={{ duration: 3000 }} />
            <InstallAppBanner />
            <PlanExpiryDialog />
            <UpgradeDialog />
        </AppShell>
    );
}
