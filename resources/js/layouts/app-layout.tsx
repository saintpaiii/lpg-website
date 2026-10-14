import LegalUpdateDialog from '@/components/legal-update-dialog';
import AppLayoutTemplate from '@/layouts/app/app-sidebar-layout';
import type { AppLayoutProps } from '@/types';

export default ({ children, breadcrumbs, ...props }: AppLayoutProps) => (
    <AppLayoutTemplate breadcrumbs={breadcrumbs} {...props}>
        {children}
        {/* Updated Terms / Privacy Policy must be accepted to continue */}
        <LegalUpdateDialog />
    </AppLayoutTemplate>
);
