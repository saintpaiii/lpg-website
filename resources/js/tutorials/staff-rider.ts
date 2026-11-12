import type { Tour } from './types';

/** Store staff (not riders) and riders — incl. "hybrid" riders who also have store-portal roles. */
export const staffTours: Tour[] = [
    {
        key: 'staff.core', title: 'Your work in the store portal', group: 'staff', core: true, access: (c) => c.group === 'staff',
        steps: [
            { title: 'Welcome', text: 'This is your store’s portal. The menu shows only what your roles allow.' },
            { nav: '/seller/my-attendance', title: 'My Attendance', text: 'Clock in when you arrive and out when you leave — near the store. Your pay is based on it.' },
            { nav: '/seller/orders', title: 'Orders', text: 'Confirm and prepare customer orders.' },
            { nav: '/seller/products', title: 'Products', text: 'Prices and details of the tanks you sell.' },
            { nav: '/seller/inventory', title: 'Inventory', text: 'Record stock coming in and going out.' },
            { nav: '/seller/deliveries', title: 'Deliveries', text: 'Follow deliveries and assign riders.' },
            { nav: '/seller/invoices', title: 'Invoices', text: 'Invoices for confirmed orders.' },
            { nav: '/seller/attendance', title: 'Attendance', text: 'Check everyone’s clock-ins and fix missing clock-outs.' },
            { nav: '/seller/payroll', title: 'Payroll', text: 'Generate and release payslips.' },
            { nav: '/seller/my-payslips', title: 'My Payslips', text: 'Your payslips appear here once they are released.' },
            { nav: '/seller/messages', title: 'Messages', text: 'Chats with customers.' },
            { nav: '/notifications', title: 'Notifications', text: 'Updates about your work arrive here and in the bell.' },
        ],
    },
];

export const riderTours: Tour[] = [
    {
        key: 'rider.core', title: 'How deliveries work', group: 'rider', core: true, page: ['rider/deliveries'], url: '/rider/deliveries',
        access: (c) => c.group === 'rider',
        steps: [
            { title: 'Welcome, rider', text: 'This app shows your deliveries, your route and your pay.' },
            { nav: '/rider/documents', title: 'My Documents', text: 'Upload your driver’s licence first. You can deliver only after the owner approves it.' },
            { nav: '/rider/my-attendance', title: 'Clock in with a vehicle', text: 'Clock in at the store and choose your vehicle. You only get orders that fit it.' },
            { nav: '/rider/deliveries', title: 'My Deliveries', text: 'Start → Picked up → Delivered, with a photo. Collect the cash and the empty tanks.' },
            { nav: '/rider/history', title: 'Delivery History', text: 'Every delivery you finished.' },
            { nav: '/rider/messages', title: 'Messages', text: 'Chat with customers about where to meet.' },
            { nav: '/rider/my-payslips', title: 'My Payslips', text: 'Your pay, once the owner releases it.' },
            { element: '[data-tour="nav-user"]', title: 'Switch portal', text: 'Open your menu to switch between the Rider app and the Store portal.', when: (c) => c.isHybrid },
        ],
    },
    {
        key: 'rider.deliveries', title: 'My Deliveries', group: 'rider', page: ['rider/deliveries'], url: '/rider/deliveries', nav: '/rider/deliveries',
        steps: [
            { title: 'List or map', text: 'Your assigned deliveries, nearest first. Tap one for details.' },
            { element: '[data-tour="rd-actions"]', title: 'Update the status', text: 'Picked up and Delivered need a photo. Failed needs a reason.' },
            { element: '[data-tour="rd-map"]', title: 'Route', text: 'Follow the route to the customer’s pin. Sharing your location lets them track you.' },
            { title: 'Cash and empty tanks', text: 'For cash on delivery, collect the amount shown. For refills, take the empty tanks.' },
        ],
    },
    {
        key: 'rider.history', title: 'Delivery History', group: 'rider', page: ['rider/history'], url: '/rider/history', nav: '/rider/history',
        steps: [
            { title: 'Finished deliveries', text: 'Delivered and failed deliveries with their proof photos.' },
            { title: 'Filter', text: 'Look up a date to answer a customer question.' },
        ],
    },
    {
        key: 'rider.messages', title: 'Messages', group: 'rider', page: ['rider/messages'], url: '/rider/messages', nav: '/rider/messages',
        steps: [
            { title: 'Customer chats', text: 'Message the customer about the gate or a landmark.' },
            { title: 'Send a photo', text: 'Show where you are waiting.' },
        ],
    },
    {
        key: 'rider.reports', title: 'My Reports', group: 'rider', page: ['rider/reports', 'rider/report-show'], url: '/rider/reports', nav: '/rider/reports',
        steps: [
            { title: 'Problems on the road', text: 'Report a customer or an incident here.' },
            { title: 'Replies', text: 'The store or the admin answers in the report.' },
        ],
    },
    {
        key: 'rider.my-attendance', title: 'My Attendance', group: 'rider', page: ['seller/my-attendance'], urlPrefix: '/rider', url: '/rider/my-attendance', nav: '/rider/my-attendance',
        steps: [
            { element: '[data-tour="myatt-location"]', title: 'At the store', text: 'You clock in near the store pin. Allow location when asked.' },
            { element: '[data-tour="myatt-today"]', title: 'Choose your vehicle', text: 'Pick the vehicle you drive today. Only orders that fit it are given to you.' },
        ],
    },
    {
        key: 'rider.my-documents', title: 'My Documents', group: 'rider', page: ['staff/my-documents'], urlPrefix: '/rider', url: '/rider/documents', nav: '/rider/documents',
        steps: [
            { title: 'Driver’s licence', text: 'Upload your licence with its number and expiry date. The owner approves it.' },
            { title: 'Keep it valid', text: 'An expired licence stops new deliveries until a renewed one is approved.' },
        ],
    },
    {
        key: 'rider.my-payslips', title: 'My Payslips', group: 'rider', page: ['seller/my-payslips'], urlPrefix: '/rider', url: '/rider/my-payslips', nav: '/rider/my-payslips',
        steps: [
            { title: 'Your pay', text: 'Payslips appear once the owner releases them.' },
            { title: 'Details', text: 'Hours, overtime and deductions — download one as a PDF.' },
        ],
    },
    {
        key: 'rider.payslip', title: 'A payslip', group: 'rider', page: ['seller/payslip'], urlPrefix: '/rider', where: 'Open any payslip from My Payslips.', nav: '/rider/my-payslips',
        steps: [
            { title: 'Breakdown', text: 'Hours worked, overtime, deductions and your net pay.' },
            { title: 'Download', text: 'Save it as a PDF.' },
        ],
    },
];
