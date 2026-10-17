/** Driver's-license info the server adds to every rider in the store's rider pickers. */
export type RiderLicenseFields = { can_deliver?: boolean; license_note?: string | null };

/** "(license missing)" etc. for riders who can't deliver yet, '' otherwise. */
export const riderLicenseSuffix = (r: RiderLicenseFields): string =>
    r.can_deliver === false ? ` (${r.license_note ?? 'license needed'})` : '';

/** Riders who can't deliver yet are shown but can't be picked. */
export const riderDisabled = (r: RiderLicenseFields): boolean => r.can_deliver === false;
