import type { Tour, TourCtx } from './types';

/** Open before the ID is approved; "history" pages also open for customers who already ordered */
const always = (c: TourCtx) => c.group === 'customer';
const shopping = (c: TourCtx) => c.group === 'customer' && c.verified;
const history = (c: TourCtx) => c.group === 'customer' && (c.verified || c.hasHistory);
const LOCKED = 'After your ID is approved you can';

export const customerTours: Tour[] = [
    {
        key: 'customer.core', title: 'How buying works', group: 'customer', core: true,
        page: ['customer/products', 'customer/id-verification'], access: always,
        steps: [
            { title: 'Welcome to LPG Marketplace', text: 'Buy LPG from verified stores in Cavite. This short tour shows the steps from your ID to your first delivery.' },
            { nav: '/customer/id-verification', title: 'Verify your ID', text: 'Your ID is verified ✓ — you can order any time.',
              lockedText: 'Before you can order, upload a valid ID and a selfie. An admin approves it, usually within a day.' },
            { nav: '/customer/addresses', title: 'My Addresses', text: 'Save where we should deliver and pin it on the map. The delivery fee is based on that pin.' },
            { nav: '/customer/products', title: 'Browse products', text: 'Compare tanks, prices and stores near you.', lockedText: `${LOCKED} browse tanks, prices and stores near you.` },
            { nav: '/customer/find-store', title: 'Find a store', text: 'See stores that can deliver to your pin, nearest first.', lockedText: `${LOCKED} see the stores that deliver to your pin.` },
            { element: '[data-tour="products-grid"]', title: 'Add to cart', text: 'Choose Refill (you swap your empty tank) or New tank, then add it to your cart.', when: (c) => c.verified },
            { element: '[data-tour="nav:/customer/cart"]', title: 'Cart and checkout', text: 'Pick delivery or pick-up, then pay online or cash on delivery.', lockedText: `${LOCKED} check out: delivery or pick-up, online payment or cash on delivery.` },
            { nav: '/customer/orders', title: 'Track your order', text: 'Follow your order live and message the store or the rider.', lockedText: `${LOCKED} follow your orders live here.` },
            { nav: '/customer/invoices', title: 'Receipts and invoices', text: 'You get a payment receipt right away and an invoice when the store confirms.', lockedText: `${LOCKED} find your receipts and invoices here.` },
            { nav: '/customer/become-seller', title: 'Start Selling', text: 'Have an LPG business? Apply to open your own store here.', lockedText: `${LOCKED} apply to open your own store too.` },
        ],
    },
    {
        key: 'customer.products', title: 'Browse products', group: 'customer', page: ['customer/products'], url: '/customer/products', access: shopping,
        steps: [
            { element: '[data-tour="products-search"]', title: 'Search', text: 'Type a brand, size or store name, e.g. "11 kg Petron".' },
            { element: '[data-tour="products-filters"]', title: 'Filters and sorting', text: 'Narrow by city, brand, size or price, and sort by price or rating.' },
            { element: '[data-tour="products-grid"]', title: 'Product cards', text: 'Each card shows the price, stock and store. Open one to see photos and reviews.' },
            { title: 'Refill or new tank', text: 'Refill is cheaper — you give back an empty tank. New tank includes the cylinder.' },
        ],
    },
    {
        key: 'customer.product-show', title: 'A product page', group: 'customer', page: ['customer/product-show'], url: '/customer/products', where: 'Open any product from Browse.', access: shopping,
        steps: [
            { element: '[data-tour="product-main"]', title: 'Photos and details', text: 'Swipe through the photos and read the tank size and store details.' },
            { element: '[data-tour="product-price-types"]', title: 'Refill or new tank', text: 'Pick Refill if you will give back an empty tank; it costs less.' },
            { element: '[data-tour="product-refunds"]', title: 'Refund window', text: 'Each store sets how many days after delivery you can ask for a refund. A leaking tank can always be reported.' },
            { element: '[data-tour="product-add-to-cart"]', title: 'Add to cart', text: 'Choose the quantity and add it. Some stores limit how many you can buy.' },
            { element: '[data-tour="product-reviews"]', title: 'Reviews', text: 'Read what other buyers say — tap "With photos" to see real pictures.' },
        ],
    },
    {
        key: 'customer.find-store', title: 'Find a store', group: 'customer', page: ['customer/find-store'], url: '/customer/find-store', access: shopping,
        steps: [
            { element: '[data-tour="find-need"]', title: 'What you need', text: 'Choose the tank size and refill or new — only stores that have it are shown.' },
            { element: '[data-tour="find-deliver-to"]', title: 'Deliver to', text: 'Pick a saved address or move the pin. Distance and fee depend on it.' },
            { element: '[data-tour="find-results"]', title: 'Nearby stores', text: 'Nearest first, with the delivery fee. Open a store to see all its products.' },
        ],
    },
    {
        key: 'customer.store', title: 'A store page', group: 'customer', page: ['customer/store'], where: 'Open any store from Browse or Find a Store.', access: shopping,
        steps: [
            { title: 'Store page', text: 'See the store’s products, rating, delivery area and contact details.' },
            { title: 'Message the store', text: 'Ask about stock or delivery before you order. Replies show up in Messages.' },
        ],
    },
    {
        key: 'customer.cart', title: 'Your cart', group: 'customer', page: ['customer/cart'], url: '/customer/cart', access: shopping,
        steps: [
            { element: '[data-tour="cart-select"]', title: 'Choose what to buy', text: 'Items are grouped by store. Tick the items you want in this order.' },
            { title: 'Quantities and limits', text: 'Change quantities here. A store may limit how many tanks one customer can buy.' },
            { element: '[data-tour="cart-checkout"]', title: 'Checkout', text: 'Continue to choose delivery, payment and your address.' },
        ],
    },
    {
        key: 'customer.checkout', title: 'Checkout', group: 'customer', page: ['customer/checkout'], url: '/customer/cart', where: 'Opens from your cart → Proceed to Checkout.', access: shopping,
        steps: [
            { element: '[data-tour="checkout-address"]', title: 'Delivery address', text: 'Pick one of your saved addresses or add a new one.' },
            { element: '[data-tour="checkout-pin"]', title: 'Check the pin', text: 'Drag the pin to your exact gate so the rider finds you. The fee follows the distance.' },
            { element: '[data-tour="checkout-fulfillment"]', title: 'Delivery or pick-up', text: 'Pick-up has no delivery fee. For delivery, the fee depends on the vehicle that fits your order.' },
            { element: '[data-tour="checkout-payment"]', title: 'How to pay', text: 'Pay online (GCash, Maya, card) or cash on delivery if the store allows it.' },
            { element: '[data-tour="checkout-coupon"]', title: 'Coupon', text: 'Have a store coupon? Apply it here before you place the order.' },
            { element: '[data-tour="checkout-total"]', title: 'Place the order', text: 'Check the total, add your TIN if you need it on the invoice, then place the order.' },
        ],
    },
    {
        key: 'customer.orders', title: 'My Orders', group: 'customer', page: ['customer/orders'], url: '/customer/orders', access: history,
        steps: [
            { element: '[data-tour="orders-tabs"]', title: 'Order status', text: 'Switch between active, delivered and cancelled orders.' },
            { title: 'Pay or cancel', text: 'Unpaid online orders can be paid from here. You can cancel before the store confirms.' },
            { title: 'Open an order', text: 'Tap an order to track it live, see receipts and message the store.' },
        ],
    },
    {
        key: 'customer.order-show', title: 'An order page', group: 'customer', page: ['customer/order-show'], where: 'Open any order from My Orders.', access: history,
        steps: [
            { element: '[data-tour="order-status"]', title: 'Where your order is', text: 'The timeline shows each step. While it’s on the way you can follow the rider on the map.' },
            { element: '[data-tour="order-actions"]', title: 'Your actions', text: 'Message the store, report a problem, rate the products or ask for a refund here.' },
            { element: '[data-tour="order-payment"]', title: 'Payment', text: 'See how much is paid and what’s left. Each payment gets its own receipt below.' },
            { title: 'Leaking tank?', text: 'Close the valve, open windows and call the store. You can always report a leaking tank, even after the refund period.' },
        ],
    },
    {
        key: 'customer.messages', title: 'Messages', group: 'customer', page: ['customer/messages'], url: '/customer/messages', access: history,
        steps: [
            { title: 'Chat with stores and riders', text: 'Every conversation with a store or a rider is here. New replies show a blue badge.' },
            { title: 'Send photos', text: 'Attach a photo, e.g. of your gate or a damaged tank.' },
        ],
    },
    {
        key: 'customer.loyalty', title: 'My Loyalty', group: 'customer', page: ['customer/loyalty'], url: '/customer/loyalty', access: shopping,
        steps: [
            { title: 'Points per store', text: 'Each store with a loyalty program gives you points when an order is delivered and paid.' },
            { title: 'Tiers and rewards', text: 'More orders move you to a higher tier — e.g. discounts or paying a down payment only.' },
            { title: 'How to earn', text: 'Keep ordering from the same store and pay on time to climb faster.' },
        ],
    },
    {
        key: 'customer.invoices', title: 'My Invoices', group: 'customer', page: ['customer/invoices'], url: '/customer/invoices', access: history,
        steps: [
            { title: 'Your invoices', text: 'The store creates an invoice when it confirms your order. Filter by date at the top.' },
            { title: 'Receipts', text: 'If you paid before that, your payment receipt is on the order page.' },
            { title: 'Print', text: 'Paid, delivered orders have a print button for your records.' },
        ],
    },
    {
        key: 'customer.invoice-show', title: 'An invoice', group: 'customer', page: ['customer/invoice-show'], where: 'Open any invoice from My Invoices.', access: history,
        steps: [
            { title: 'Invoice details', text: 'Store name, TIN, items, VAT (if the store is VAT-registered) and what is still unpaid.' },
            { title: 'Print or save', text: 'Use Print to keep a copy or give it to your accountant.' },
        ],
    },
    {
        key: 'customer.refunds', title: 'My Refunds', group: 'customer', page: ['customer/refunds'], url: '/customer/refunds', access: history,
        steps: [
            { title: 'Your requests', text: 'Every refund or replacement you asked for, with the store’s answer.' },
            { title: 'Not happy with the answer?', text: 'You can escalate a request to the platform admin.' },
            { title: 'Store coupons', text: 'If a store gave you a coupon instead of cash, you’ll find it here.' },
        ],
    },
    {
        key: 'customer.reports', title: 'My Reports', group: 'customer', page: ['customer/reports'], url: '/customer/reports', access: history,
        steps: [
            { title: 'Your reports', text: 'Problems you reported about a store, rider or order, and how they are being handled.' },
            { title: 'Open a report', text: 'Read replies and answer the store or the admin.' },
        ],
    },
    {
        key: 'customer.report-show', title: 'A report', group: 'customer', page: ['customer/report-show'], where: 'Open any report from My Reports.', access: history,
        steps: [
            { title: 'The conversation', text: 'Replies from the store or the admin appear here. Add details or photos if they ask.' },
            { title: 'Closing it', text: 'Confirm when it’s solved, or say it isn’t so it goes back for review.' },
        ],
    },
    {
        key: 'customer.addresses', title: 'My Addresses', group: 'customer', page: ['customer/addresses'], url: '/customer/addresses', access: always,
        steps: [
            { title: 'Saved addresses', text: 'Home, work, a relative’s house — save them once and pick one at checkout.' },
            { title: 'Pin it exactly', text: 'Put the pin on your gate. The rider and the delivery fee both use it.' },
            { title: 'Default address', text: 'Your default address is chosen first at checkout.' },
        ],
    },
    {
        key: 'customer.id-verification', title: 'Verify your ID', group: 'customer', page: ['customer/id-verification'], url: '/customer/id-verification', access: always,
        steps: [
            { element: '[data-tour="idv-valid-id"]', title: 'Valid ID', text: 'Upload a clear photo of a government ID — all four corners, no glare.' },
            { element: '[data-tour="idv-selfie"]', title: 'Selfie', text: 'Take a selfie with your camera or upload one. The admin checks it matches the ID.' },
            { element: '[data-tour="idv-submit"]', title: 'Send for review', text: 'An admin approves it, usually within a day. You’ll get a notification.' },
        ],
    },
    {
        key: 'customer.become-seller', title: 'Start Selling', group: 'customer', page: ['customer/become-seller'], url: '/customer/become-seller', access: shopping,
        steps: [
            { element: '[data-tour="become-steps"]', title: 'Three steps', text: 'Store details and map pin, then your permits, then the seller terms.' },
            { title: 'Documents', text: 'BIR, Business Permit, FSIC, DOE License to Operate and DTI/SEC. Your verified ID is reused.' },
            { title: 'Extra documents', text: 'Add proof like a barangay clearance or a store-front photo — it helps the review.' },
            { title: 'Free trial', text: 'Once approved you get a free 30-day trial of the Premium plan.' },
        ],
    },
    {
        key: 'customer.profile', title: 'Your profile', group: 'customer', page: ['customer/profile'], url: '/customer/profile', access: always,
        steps: [
            { title: 'Your details', text: 'Your name, mobile number and email. Stores use your number to reach you about orders.' },
            { title: 'Security', text: 'Change your password or turn on two-factor sign-in under Settings.' },
        ],
    },
    {
        key: 'customer.notifications', title: 'Notifications', group: 'customer', page: ['customer/notifications'], url: '/customer/notifications', access: always,
        steps: [
            { title: 'Updates in one place', text: 'Order updates, payments, refunds and ID results arrive here and in the bell at the top.' },
            { title: 'Mark as read', text: 'Open one to go to the related page, or mark everything as read.' },
        ],
    },
];
