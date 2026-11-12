/** First-time tutorials (driver.js) — see use-tour.ts for how they run and are saved. */

export type TourGroup = 'customer' | 'seller' | 'staff' | 'rider' | 'admin';

export type TourStep = {
    /** CSS selector of the element to point at — the first VISIBLE match is used; missing/hidden → centred popover */
    element?: string;
    /** Sidebar item: points at [data-tour="nav:<href>"] and the step is dropped when this user's menu doesn't have it */
    nav?: string;
    title: string;
    text: string;
    /** Customers whose ID isn't verified yet see this instead (their menu items are locked) */
    lockedText?: string;
    side?: 'top' | 'right' | 'bottom' | 'left';
    /** Extra condition for the step */
    when?: (ctx: TourCtx) => boolean;
};

export type Tour = {
    /** Saved progress key, e.g. "customer.products" — ^[a-z0-9._-]{1,60}$ */
    key: string;
    /** Name on the Help page */
    title: string;
    group: TourGroup | 'shared';
    /** The role's main-process tour (first login, on the home page) */
    core?: boolean;
    /** Inertia component name(s) the tour belongs to */
    page?: string[];
    /** Only when the URL starts with this (components shared by /seller and /rider pages) */
    urlPrefix?: string;
    /** Sidebar item that must be in this user's menu (and not plan-locked) — also used for child pages */
    nav?: string;
    /** Where Help → Start opens (pages that need a record say where to open them instead) */
    url?: string;
    /** "Open any order first" etc. — shown on the Help page when there is no url */
    where?: string;
    /** Extra condition (role details, verification…) */
    access?: (ctx: TourCtx) => boolean;
    steps: TourStep[];
};

export type TourCtx = {
    group: TourGroup;
    role: string;
    /** Customers: ID approved */
    verified: boolean;
    /** Customers: has orders / was verified before (history pages open) */
    hasHistory: boolean;
    /** Store owner */
    isOwner: boolean;
    /** Rider who also has store-portal roles */
    isHybrid: boolean;
    /** Platform staff (role platform_staff, or admin + is_platform_staff) */
    isPlatformStaff: boolean;
    /** Sidebar hrefs this user can open (plan-locked ones excluded) */
    navHrefs: Set<string>;
    /** Path of the role's home page (where the core tour starts) */
    homePaths: string[];
};

export type TourProgressEntry = { done: string | null; skipped: string | null };
