import type { Tour } from './types';

/**
 * Store portal pages. Access = the page's sidebar item is in this user's menu and not plan-locked
 * (store owners and store staff share these pages — staff only see the modules their roles allow).
 */
export const sellerTours: Tour[] = [
    {
        key: 'seller.core', title: 'How your store works', group: 'seller', core: true, page: ['seller/dashboard'], url: '/seller/dashboard',
        access: (c) => c.group === 'seller',
        steps: [
            { element: '[data-tour="dash-stats"]', title: 'Your dashboard', text: 'Today’s orders, sales and stock at a glance.' },
            { title: 'Getting started', text: 'Your store stays hidden from customers until a rider with an approved licence clocks in with a vehicle. The checklist on this page shows what is left.' },
            { nav: '/seller/products', title: 'Products', text: 'Add your tanks with a refill price and a new-tank price, plus stock.' },
            { nav: '/seller/orders', title: 'Orders', text: 'Confirm a new order, prepare it, then assign a rider so it can go out.' },
            { nav: '/seller/deliveries', title: 'Deliveries', text: 'Follow every delivery on the live map and see proof photos.' },
            { nav: '/seller/staff', title: 'Staff', text: 'Add riders and staff, give them roles, work days and hourly pay.' },
            { nav: '/seller/vehicles', title: 'Vehicles', text: 'Each vehicle has a load limit and its own delivery fee, e.g. ₱50 for a motorcycle.' },
            { nav: '/seller/invoices', title: 'Invoices and revenue', text: 'Invoices are made when you confirm an order. Revenue shows your sales and tax estimate.' },
            { nav: '/seller/plan', title: 'My Plan', text: 'Your plan decides how many products and staff you can have and which tools are open.' },
            { nav: '/seller/settings', title: 'Settings', text: 'Store details, Tax & Invoice, delivery area and your refund window.' },
        ],
    },
    {
        key: 'seller.dashboard', title: 'Dashboard', group: 'seller', page: ['seller/dashboard'], url: '/seller/dashboard', nav: '/seller/dashboard',
        steps: [
            { element: '[data-tour="dash-stats"]', title: 'Key numbers', text: 'Orders, sales and products for your store.' },
            { element: '[data-tour="dash-recent-orders"]', title: 'Recent orders', text: 'The newest orders — open one to act on it.' },
            { element: '[data-tour="dash-low-stock"]', title: 'Low stock', text: 'Tanks below their reorder level. Restock before you run out.' },
        ],
    },
    {
        key: 'seller.products', title: 'Products', group: 'seller', page: ['seller/products'], url: '/seller/products', nav: '/seller/products',
        steps: [
            { element: '[data-tour="sp-header"]', title: 'Add a product', text: 'Add a tank with its size, refill price, new-tank price and opening stock.' },
            { element: '[data-tour="sp-tabs"]', title: 'Active and archived', text: 'Archived products are hidden from customers but keep their history.' },
            { element: '[data-tour="sp-table"]', title: 'Your list', text: 'Edit prices, set a purchase limit per customer, or hide a product.' },
            { title: 'Plan limit', text: 'When your plan’s product limit is reached, new products are saved unpublished until you upgrade.' },
            { title: 'Reviews', text: 'Customer reviews of your products are under the Reviews link on this page.' },
        ],
    },
    {
        key: 'seller.reviews', title: 'Reviews', group: 'seller', page: ['seller/reviews'], url: '/seller/reviews', nav: '/seller/products',
        steps: [
            { title: 'What customers say', text: 'Stars, comments and photos from delivered orders.' },
            { title: 'Use the feedback', text: 'Low ratings often mean late deliveries or dented tanks — check with your riders.' },
        ],
    },
    {
        key: 'seller.inventory', title: 'Inventory', group: 'seller', page: ['seller/inventory'], url: '/seller/inventory', nav: '/seller/inventory',
        steps: [
            { element: '[data-tour="inv-tabs"]', title: 'Stock and history', text: 'See current stock and every stock movement.' },
            { title: 'Stock in / out', text: 'Record deliveries from your supplier or damaged tanks so the count stays right.' },
            { title: 'Reorder level', text: 'Set when a tank counts as “low” so it shows on the dashboard.' },
        ],
    },
    {
        key: 'seller.orders', title: 'Orders', group: 'seller', page: ['seller/orders'], url: '/seller/orders', nav: '/seller/orders',
        steps: [
            { element: '[data-tour="so-header"]', title: 'New walk-in order', text: 'Record a sale at your counter with “New order”.' },
            { element: '[data-tour="so-tabs"]', title: 'Order status', text: 'Pending → Confirmed → Preparing → Out for delivery → Delivered.' },
            { element: '[data-tour="so-filters"]', title: 'Filters', text: 'Show delivery or pick-up orders, a date range, or unpaid balances.' },
            { element: '[data-tour="so-table"]', title: 'Act on an order', text: 'Confirm it (stock is taken and an invoice is made), then assign a rider so it can go out.' },
        ],
    },
    {
        key: 'seller.order-show', title: 'An order page', group: 'seller', page: ['seller/order-show'], where: 'Open any order from Orders.', nav: '/seller/orders',
        steps: [
            { element: '[data-tour="sos-header"]', title: 'Next step', text: 'The buttons here move the order forward — confirm, prepare, assign a rider.' },
            { element: '[data-tour="sos-progress"]', title: 'Progress', text: 'Where the order is right now.' },
            { element: '[data-tour="sos-payment"]', title: 'Payment', text: 'Record cash, see receipts and the invoice. Each payment gets its own receipt.' },
        ],
    },
    {
        key: 'seller.order-create', title: 'Walk-in order', group: 'seller', page: ['seller/order-create'], url: '/seller/orders/create', nav: '/seller/orders',
        steps: [
            { title: 'Counter sale', text: 'Pick or add the customer, then the tanks they buy.' },
            { title: 'Payment', text: 'Mark it paid if they paid now — a receipt is made for it.' },
        ],
    },
    {
        key: 'seller.deliveries', title: 'Deliveries', group: 'seller', page: ['seller/deliveries'], url: '/seller/deliveries', nav: '/seller/deliveries',
        steps: [
            { element: '[data-tour="sd-tabs"]', title: 'Active and done', text: 'Deliveries on the way, and finished ones with their proof photos.' },
            { element: '[data-tour="sd-filters"]', title: 'Find a delivery', text: 'Filter by date or rider.' },
            { title: 'Live map', text: 'While a rider shares location you can see them on the map.' },
        ],
    },
    {
        key: 'seller.vehicles', title: 'Vehicles', group: 'seller', page: ['seller/vehicles'], url: '/seller/vehicles', nav: '/seller/vehicles',
        steps: [
            { element: '[data-tour="sv-header"]', title: 'Add a vehicle', text: 'Motorcycle, tricycle, van or truck — each with its plate number.' },
            { element: '[data-tour="sv-table"]', title: 'Load and fee', text: 'The load limit decides which orders fit. The delivery fee is what customers pay for that vehicle.' },
            { title: 'Why it matters', text: 'Your store is hidden until at least one vehicle with a delivery fee is ready.' },
        ],
    },
    {
        key: 'seller.invoices', title: 'Invoices', group: 'seller', page: ['seller/invoices'], url: '/seller/invoices', nav: '/seller/invoices',
        steps: [
            { title: 'Your invoices', text: 'Made automatically when you confirm an order, numbered in your own series.' },
            { title: 'Payment status', text: 'Unpaid, partly paid and paid — filter to follow up on balances.' },
        ],
    },
    {
        key: 'seller.invoice-show', title: 'An invoice', group: 'seller', page: ['seller/invoice-show'], where: 'Open any invoice from Invoices.', nav: '/seller/invoices',
        steps: [
            { title: 'Invoice details', text: 'Your registered name, TIN and VAT come from Settings → Tax & Invoice.' },
            { title: 'Print or email', text: 'Print it or send it again to the customer.' },
        ],
    },
    {
        key: 'seller.staff', title: 'Staff', group: 'seller', page: ['seller/staff'], url: '/seller/staff', nav: '/seller/staff',
        steps: [
            { element: '[data-tour="ss-header"]', title: 'Add Staff and roles', text: 'Add a person and give them roles. Manage Roles lets you make your own, from templates.' },
            { element: '[data-tour="ss-summary"]', title: 'Your team', text: 'How many riders and staff you have, and how many your plan allows.' },
            { element: '[data-tour="ss-table"]', title: 'Each person', text: 'Open someone to set work days, hourly pay and check their documents.' },
            { title: 'Riders need a licence', text: 'A rider can deliver only after you approve their driver’s licence.' },
        ],
    },
    {
        key: 'seller.staff-show', title: 'A staff member', group: 'seller', page: ['seller/staff-show'], where: 'Open anyone from Staff.', nav: '/seller/staff',
        steps: [
            { title: 'Roles and access', text: 'What this person can open and change.' },
            { title: 'Work days and pay', text: 'Their schedule and hourly rate (used by Payroll).' },
            { title: 'Documents', text: 'Approve or reject their uploaded documents here.' },
        ],
    },
    {
        key: 'seller.attendance', title: 'Attendance', group: 'seller', page: ['seller/attendance'], url: '/seller/attendance', nav: '/seller/attendance',
        steps: [
            { element: '[data-tour="att-summary"]', title: 'Today', text: 'Who clocked in, who is late or absent.' },
            { element: '[data-tour="att-table"]', title: 'Records', text: 'Each clock-in and clock-out, with the vehicle a rider chose.' },
            { title: 'Missing clock-out', text: 'Set the time for someone who forgot so their pay is right.' },
        ],
    },
    {
        key: 'seller.payroll', title: 'Payroll', group: 'seller', page: ['seller/payroll'], url: '/seller/payroll', nav: '/seller/payroll',
        steps: [
            { element: '[data-tour="pr-header"]', title: 'Generate', text: 'Pick a period and generate — pay is worked out from attendance and hourly rates.' },
            { element: '[data-tour="pr-summary"]', title: 'Totals', text: 'Gross and net pay for the period.' },
            { element: '[data-tour="pr-table"]', title: 'Draft → Released → Paid', text: 'Check the drafts, release them so staff can see their payslips, then mark them paid.' },
        ],
    },
    {
        key: 'seller.payroll-settings', title: 'Payroll settings', group: 'seller', page: ['seller/payroll-settings'], url: '/seller/payroll/settings', nav: '/seller/payroll/settings',
        steps: [
            { element: '[data-tour="prs-rates"]', title: 'Rate per role', text: 'Set an hourly rate for every role, e.g. ₱75 for riders.' },
            { element: '[data-tour="prs-rules"]', title: 'Rules', text: 'Overtime is at least 1.25× the rate, and a 60-minute meal break is not paid.' },
            { element: '[data-tour="prs-personal"]', title: 'Personal rates', text: 'Give one person a different rate when needed.' },
        ],
    },
    {
        key: 'seller.payslip', title: 'A payslip', group: 'seller', page: ['seller/payslip'], urlPrefix: '/seller/payroll', where: 'Open any payslip from Payroll.', nav: '/seller/payroll',
        steps: [
            { title: 'Breakdown', text: 'Hours, overtime, late and absent deductions, and the net pay.' },
            { title: 'Download', text: 'Save it as a PDF for your records.' },
        ],
    },
    {
        key: 'seller.plan', title: 'My Plan', group: 'seller', page: ['seller/plan'], url: '/seller/plan', nav: '/seller/plan',
        steps: [
            { element: '[data-tour="plan-current"]', title: 'Your plan', text: 'What you have now and when it ends.' },
            { element: '[data-tour="plan-plans"]', title: 'Change or renew', text: 'Compare plans and pay online. Paying for the same plan adds 30 days.' },
            { element: '[data-tour="plan-history"]', title: 'Payments', text: 'Your receipts. A cash payment recorded by the admin waits for you to accept it.' },
        ],
    },
    {
        key: 'seller.revenue', title: 'Revenue', group: 'seller', page: ['seller/revenue'], url: '/seller/revenue', nav: '/seller/revenue',
        steps: [
            { element: '[data-tour="rev-summary"]', title: 'Sales', text: 'What you earned in the period — the store keeps the full amount.' },
            { element: '[data-tour="rev-tax"]', title: 'Tax estimate', text: 'A rough VAT or 3% percentage-tax figure to plan with. Ask your accountant for the real filing.' },
        ],
    },
    {
        key: 'seller.refunds', title: 'Refunds', group: 'seller', page: ['seller/refunds'], url: '/seller/refunds', nav: '/seller/refunds',
        steps: [
            { title: 'Urgent first', text: 'Leaking-tank reports are on top in red — call the customer right away.' },
            { title: 'Accept or reject', text: 'Replace the tank, refund the money or give a store coupon. Rejections need a reason.' },
            { title: 'Escalations', text: 'If the customer disagrees, the platform admin decides.' },
        ],
    },
    {
        key: 'seller.customer-reports', title: 'Customer Reports', group: 'seller', page: ['seller/customer-reports'], url: '/seller/customer-reports', nav: '/seller/customer-reports',
        steps: [
            { title: 'Problems reported', text: 'Complaints from customers about your store, riders or orders.' },
            { title: 'Reply in time', text: 'Answer within 24 hours or the report goes to the platform admin.' },
        ],
    },
    {
        key: 'seller.customer-report-show', title: 'A customer report', group: 'seller', page: ['seller/customer-report-show'], where: 'Open any report from Customer Reports.', nav: '/seller/customer-reports',
        steps: [
            { title: 'The conversation', text: 'Read the customer’s report and reply.' },
            { title: 'Propose a solution', text: 'Offer a fix; the customer confirms when it is solved.' },
        ],
    },
    {
        key: 'seller.coupons', title: 'Coupons', group: 'seller', page: ['seller/coupons'], url: '/seller/coupons', nav: '/seller/coupons',
        steps: [
            { title: 'Promo codes', text: 'Make a code like “SALE50” for ₱50 off, with dates and a usage limit.' },
            { title: 'Track use', text: 'See how often each code was used.' },
        ],
    },
    {
        key: 'seller.reports', title: 'Reports', group: 'seller', page: ['seller/reports'], url: '/seller/reports', nav: '/seller/reports',
        steps: [
            { title: 'Sales reports', text: 'Sales by day, product and payment method.' },
            { title: 'Export', text: 'Download a report to share with your accountant.' },
        ],
    },
    {
        key: 'seller.dss', title: 'DSS Insights', group: 'seller', page: ['seller/dss'], url: '/seller/dss', nav: '/seller/dss',
        steps: [
            { title: 'Demand forecast', text: 'How many tanks you will likely sell soon, from your past orders.' },
            { title: 'Restock advice', text: 'When and how much to reorder so you don’t run out.' },
        ],
    },
    {
        key: 'seller.loyalty-settings', title: 'Loyalty Program', group: 'seller', page: ['seller/loyalty-settings'], url: '/seller/loyalty/settings', nav: '/seller/loyalty/settings',
        steps: [
            { title: 'Turn it on', text: 'Reward regular customers with points and tiers.' },
            { title: 'Tier rewards', text: 'Set discounts per tier, and which tiers may pay only a down payment.' },
        ],
    },
    {
        key: 'seller.loyalty-customers', title: 'Loyalty customers', group: 'seller', page: ['seller/loyalty-customers'], url: '/seller/loyalty/customers', nav: '/seller/loyalty/customers',
        steps: [
            { title: 'Your regulars', text: 'Customers with their points, tier and orders.' },
            { title: 'Export', text: 'Download the list for a promo or a follow-up.' },
        ],
    },
    {
        key: 'seller.settings', title: 'Settings', group: 'seller', page: ['seller/settings'], url: '/seller/settings', nav: '/seller/settings',
        steps: [
            { element: '[data-tour="set-store-info"]', title: 'Store info', text: 'Name, description and logo customers see.' },
            { element: '[data-tour="set-delivery"]', title: 'Delivery area', text: 'How far you deliver from your store pin.' },
            { element: '[data-tour="set-payment"]', title: 'Payment options', text: 'Allow cash on delivery or online payment only.' },
            { element: '[data-tour="set-location"]', title: 'Location', text: 'Your store pin — staff clock in near it and fees are measured from it.' },
            { title: 'Tax & Invoice, refunds', text: 'Further down: your TIN and invoice series, and how many days customers have to ask for a refund.' },
        ],
    },
    {
        key: 'seller.documents', title: 'Store Documents', group: 'seller', page: ['seller/documents'], url: '/seller/documents', nav: '/seller/documents',
        steps: [
            { title: 'Permits and expiry', text: 'You get reminders 30, 7 and 1 day before a permit expires.' },
            { title: 'Upload a renewal', text: 'Upload the new permit; the admin approves it. A permit expired for 7 days hides your store.' },
            { title: 'Other documents', text: 'Add extra proof like a barangay clearance.' },
        ],
    },
    {
        key: 'seller.messages', title: 'Messages', group: 'seller', page: ['seller/messages'], url: '/seller/messages', nav: '/seller/messages',
        steps: [
            { title: 'Customer chats', text: 'Questions from customers about stock and orders.' },
            { title: 'Quick replies', text: 'Use saved answers for common questions.' },
        ],
    },
    {
        key: 'seller.website-reports', title: 'Website problems', group: 'seller', page: ['seller/website-reports', 'seller/website-report-show'], url: '/seller/website-reports',
        access: (c) => c.group === 'seller' || c.group === 'staff',
        steps: [
            { title: 'Report a website problem', text: 'Something not working? Report it with a screenshot.' },
            { title: 'Follow up', text: 'The platform team replies here; confirm when it’s fixed.' },
        ],
    },
    // Store staff only (the owner has no My Documents / My Payslips)
    {
        key: 'staff.my-documents', title: 'My Documents', group: 'staff', page: ['staff/my-documents'], urlPrefix: '/seller', url: '/seller/my-documents', nav: '/seller/my-documents',
        steps: [
            { title: 'Your documents', text: 'Upload IDs or clearances your store asks for. The owner approves them.' },
            { title: 'Expiry', text: 'Add the expiry date so you get a reminder before it runs out.' },
        ],
    },
    {
        key: 'staff.my-payslips', title: 'My Payslips', group: 'staff', page: ['seller/my-payslips'], urlPrefix: '/seller', url: '/seller/my-payslips', nav: '/seller/my-payslips',
        steps: [
            { title: 'Your pay', text: 'Payslips appear once the owner releases them.' },
            { title: 'Details', text: 'Open one to see hours, overtime and deductions, or download it.' },
        ],
    },
    {
        key: 'staff.payslip', title: 'A payslip', group: 'staff', page: ['seller/payslip'], urlPrefix: '/seller/my-payslips', where: 'Open any payslip from My Payslips.', nav: '/seller/my-payslips',
        steps: [
            { title: 'Breakdown', text: 'Hours worked, overtime, deductions and your net pay.' },
            { title: 'Download', text: 'Save it as a PDF.' },
        ],
    },
    {
        key: 'staff.my-attendance', title: 'My Attendance', group: 'staff', page: ['seller/my-attendance'], urlPrefix: '/seller', url: '/seller/my-attendance', nav: '/seller/my-attendance',
        steps: [
            { element: '[data-tour="myatt-location"]', title: 'Be at the store', text: 'You can clock in only near the store pin. Allow location when asked.' },
            { element: '[data-tour="myatt-today"]', title: 'Clock in and out', text: 'Clock in when you start and out when you leave — your pay is based on it.' },
        ],
    },
];
