/**
 * Reasons and their matching details for every reason / notes box (components/reason-picker.tsx).
 * Edit the wording here. The server receives plain text (or the key, where it stores keys),
 * so changing a detail never needs a backend change.
 *
 *  - REASON_CATALOG: Reason ▸ Details. The first detail is pre-selected; a reason with no details
 *    (e.g. "Other") goes straight to "type your own".
 *  - NOTE_CATALOG: optional notes — one grouped "Add a note (optional)" dropdown.
 */

export type ReasonOption = {
    /** Unique within the context; also what the server receives unless `submit` is set */
    value: string;
    label: string;
    details: string[];
    /** Server value when several reasons share one (e.g. refund reasons stored as an enum) */
    submit?: string;
};

export type ReasonContext =
    | 'failed_delivery'
    | 'customer_cancel'
    | 'store_cancel'
    | 'refund_issue'
    | 'refund_escalate'
    | 'refund_seller_reject'
    | 'refund_admin_decision'
    | 'verification_reject'
    | 'store_reject'
    | 'account_store_suspend'     // admin/store-show
    | 'account_stores_suspend'    // admin/stores
    | 'account_user'              // admin/user-show deactivate + archive
    | 'account_staff'             // admin/staff-show deactivate + archive
    | 'account_seller_staff'      // seller/staff deactivate
    | 'report_resolution'
    | 'report_still_wrong';

export type NoteContext =
    | 'delivery_instructions'
    | 'delivery_note'
    | 'review'
    | 'report_reply'
    | 'report_safety_note'
    | 'refund_seller_notes'
    | 'stock_note';

const OTHER: ReasonOption = { value: 'Other', label: 'Other', details: [] };

/** Options whose value is the label the server already stores */
const byLabel = (rows: [label: string, details: string[]][]): ReasonOption[] =>
    [...rows.map(([label, details]) => ({ value: label, label, details })), OTHER];

// ── Account actions (suspend / deactivate / archive) ────────────────────────────
// Each page keeps its own labels (the server stores them as typed); details are shared by label.
const ACCOUNT_DETAILS: Record<string, string[]> = {
    'policy violation':              ['Repeated late deliveries', 'Rude to customers', 'Selling unsafe tanks'],
    'violation of terms of service': ['Broke the platform rules'],
    'fraudulent activity':           ['Fake orders', 'Fake documents', 'Payment fraud'],
    'customer complaints':           ['Several complaints this month', 'Serious safety complaint'],
    'customer complaint':            ['Several complaints this month', 'Serious safety complaint'],
    'pending investigation':         ['Under review — temporary'],
    'account inactivity':            ['No activity for 90 days'],
    'inactivity':                    ['No activity for 90 days'],
    'duplicate account':             ['Same person, second account'],
    'staff resignation':             ['Resigned', 'Contract ended'],
    'staff termination':             ['Terminated by the owner'],
    'failed identity verification':  ['ID could not be verified'],
    'account security concern':      ['Possible hacked account', 'Password shared with others'],
    'user request':                  ['User asked to close the account'],
    'suspicious behavior':           ['Unusual order pattern'],
    'failed compliance check':       ['Documents failed review'],
    'inappropriate behavior':        ['Harassment', 'Unsafe handling of tanks'],
    'failure to fulfill orders':     ['Many cancelled orders', 'Orders left undelivered'],
    'unauthorized products':         ['Selling products that are not allowed', 'Unbranded or refilled-elsewhere tanks'],
    'misrepresentation':             ['Wrong store information', 'Misleading product listings'],
    'payment issues':                ['Repeated payment disputes', 'Refunds not given'],
};

const account = (labels: string[]): ReasonOption[] =>
    byLabel(labels.map((l) => [l, ACCOUNT_DETAILS[l.toLowerCase()] ?? []]));

export const REASON_CATALOG: Record<ReasonContext, ReasonOption[]> = {
    // Keys = config/delivery.php fail_reasons (the server stores the key in deliveries.fail_reason)
    failed_delivery: [
        { value: 'customer_not_home',    label: 'Customer not at home',         details: ['No one answered the door', 'House was locked', 'Neighbor said the customer is away'] },
        { value: 'customer_unreachable', label: "Customer can't be reached",    details: ['Called twice, no answer', 'Phone is off or out of coverage', 'Number is wrong'] },
        { value: 'wrong_address',        label: 'Wrong or incomplete address',  details: ['House number not found', 'Pin is in the wrong place', 'Street name is wrong', 'No landmark given'] },
        { value: 'customer_refused',     label: 'Customer refused the order',   details: ['Changed their mind', 'Ordered by mistake', 'Wants a different brand or size', 'Says they already have gas'] },
        { value: 'no_payment',           label: "Customer couldn't pay (COD)",  details: ['No cash on hand', 'Needs change for a big bill', 'Asked to pay next time'] },
        { value: 'wrong_item',           label: 'Wrong item or size',           details: ['Wrong tank size loaded', 'Wrong brand loaded', "Empty tank size doesn't match"] },
        { value: 'vehicle_problem',      label: 'Vehicle problem',              details: ['Flat tire', 'Engine trouble', 'Ran out of fuel'] },
        { value: 'bad_weather',          label: 'Bad weather / flooding',       details: ['Heavy rain', 'Street is flooded', 'Typhoon signal'] },
        { value: 'road_closed',          label: 'Road closed / no access',      details: ['Road under repair', 'Gated area — not allowed in', 'Accident on the road'] },
        { value: 'other',                label: 'Other',                        details: [] },
    ],

    customer_cancel: byLabel([
        ['Changed my mind',              ["I don't need it anymore", "I'll order later"]],
        ['Found a better price',         ['Another store is cheaper', 'Found a promo elsewhere']],
        ['Ordered by mistake',           ['Wrong product', 'Wrong quantity', 'Wrong store']],
        ['Delivery takes too long',      ['Need it today', 'Estimated time is too long']],
        ['Want to change order details', ['Change the address', 'Change the size or brand', 'Change the payment method']],
    ]),

    store_cancel: byLabel([
        ['Out of stock',              ['This size is out of stock', 'Brand is out of stock']],
        ['No rider available',        ['All riders are busy', 'Rider is absent today']],
        ["Customer can't be reached", ['Called twice, no answer', 'Number is wrong']],
        ['Outside delivery area',     ['Address is too far', 'Address is outside Cavite']],
        ['Suspicious order',          ['Duplicate order', 'Fake name or address']],
    ]),

    // Server stores RefundRequest::REASONS keys; "Seal problem" and "Gas ran out too fast" are both quality issues
    refund_issue: [
        { value: 'leaking',  submit: 'leaking_tank',    label: 'Leaking tank',         details: ['Smell of gas', 'Hissing sound', 'Leak at the valve'] },
        { value: 'damaged',  submit: 'damaged_product', label: 'Damaged tank',         details: ['Dented', 'Rusty', 'Broken handle or ring'] },
        { value: 'wrong',    submit: 'wrong_product',   label: 'Wrong item',           details: ['Wrong size', 'Wrong brand'] },
        { value: 'seal',     submit: 'quality_issue',   label: 'Seal problem',         details: ['Seal is missing', 'Seal is broken'] },
        { value: 'gas',      submit: 'quality_issue',   label: 'Gas ran out too fast', details: ['Lasted much shorter than usual', 'Tank felt light on delivery'] },
        { value: 'other',    submit: 'other',           label: 'Other',                details: [] },
    ],

    refund_escalate: byLabel([
        ['Store rejected it unfairly', ["They didn't look at my photos", 'The problem is clear in my photos']],
        ["Store didn't respond",       ['No reply for more than 2 days']],
        ['Replacement problem',        ['Replacement never arrived', 'Replacement is also damaged']],
        ['Wrong refund amount',        ['Refunded less than I paid']],
    ]),

    refund_seller_reject: byLabel([
        ['Not enough proof',       ["Photo doesn't show a problem", 'Photo is too blurry']],
        ['Damage after delivery',  ['Tank was fine when delivered (we have proof)', 'Damage from customer handling']],
        ['Past the refund window', ['Request was made too late']],
        ['Not from our store',     ['Tank is not our brand or seal']],
    ]),

    refund_admin_decision: byLabel([
        ['Store is right',    ["Customer's proof is not enough", 'Damage happened after delivery']],
        ['Customer is right', ['Proof shows the problem — full refund', 'Proof shows the problem — partial refund', 'Replacement instead of refund']],
    ]),

    verification_reject: byLabel([
        ['Photo problem',    ['ID photo is blurry', 'ID is cut off', 'Glare covers the details']],
        ['ID problem',       ['ID is expired', 'ID type is not accepted', 'Back of the ID is missing']],
        ['Mismatch',         ["Name doesn't match the account", "Selfie doesn't match the ID", "Birthdate doesn't match"]],
        ['Document problem', ['Permit is expired', 'Document looks edited', 'Required document is missing']],
    ]),

    store_reject: byLabel([
        ['Incomplete documents',   ['BIR certificate missing', 'Business permit missing', 'FSIC missing', 'DOE license missing']],
        ['Expired documents',      ['Business permit expired', 'FSIC expired', 'DOE license expired']],
        ['Invalid information',    ['Store address is outside Cavite', "Details don't match the documents"]],
        ['Duplicate application',  ['Store already registered']],
    ]),

    // "Non-payment of Commissions" / "Non-payment" removed (commission is being removed)
    account_store_suspend: account([
        'Policy Violation', 'Fraudulent Activity', 'Pending Investigation', 'Customer Complaints',
        'Account Inactivity', 'Failed Compliance Check',
    ]),
    account_stores_suspend: account([
        'Policy violation', 'Fraudulent activity', 'Customer complaints', 'Failure to fulfill orders',
        'Unauthorized products', 'Misrepresentation', 'Payment issues',
    ]),
    account_user: account([
        'Violation of terms of service', 'Fraudulent activity', 'Account security concern', 'Customer complaint',
        'Inactivity', 'Duplicate account', 'User request', 'Suspicious behavior',
    ]),
    account_staff: account([
        'Policy Violation', 'Fraudulent Activity', 'Inappropriate Behavior', 'Account Inactivity', 'Duplicate Account',
        'Failed Identity Verification', 'Staff Resignation', 'Staff Termination', 'Pending Investigation',
    ]),
    account_seller_staff: account([
        'Violation of terms of service', 'Fraudulent activity', 'Account security concern', 'Customer complaint',
        'Inactivity', 'Duplicate account', 'User request', 'Suspicious behavior',
    ]),

    report_resolution: byLabel([
        ['Resolved',     ['Issue fixed', 'Customer refunded', 'Replacement delivered']],
        ['Action taken', ['Rider was warned', 'Store was warned']],
        ['Not valid',    ['Not enough proof', 'Duplicate report']],
    ]),

    // Reporter: "What is still wrong?"
    report_still_wrong: byLabel([
        ['Not fixed',       ['The problem is still there', 'The fix did not work']],
        ['No response',     ['The store did not respond']],
        ['Still unsafe',    ['The tank is still unsafe']],
        ['Not compensated', ['I did not receive a replacement or refund']],
    ]),
};

export const NOTE_CATALOG: Record<NoteContext, { group: string; items: string[] }[]> = {
    // Checkout + every order-create form
    delivery_instructions: [
        { group: 'Contact',  items: ['Please call when you arrive', 'Please text before delivering'] },
        { group: 'Drop-off', items: ['Leave it with the guard', 'Deliver to the back door'] },
        { group: 'Payment',  items: ['Please bring change for ₱1,000'] },
        { group: 'Timing',   items: ['Deliver in the morning', 'Deliver in the afternoon'] },
        { group: 'Tank',     items: ['Please exchange my empty tank (same size)'] },
    ],
    // Rider / admin / seller status notes when NOT failed
    delivery_note: [
        { group: 'Delivered', items: ['Delivered to the customer', 'Received by a family member', 'Left with the guard'] },
        { group: 'Payment',   items: ['Customer paid in cash'] },
        { group: 'Tank',      items: ['Empty tank collected'] },
    ],
    review: [
        { group: 'Good',            items: ['Fast delivery', 'Tank in good condition', 'Friendly rider', 'Good price'] },
        { group: 'Could be better', items: ['Late delivery', 'Tank was dented'] },
    ],
    // Report reply body (never admin internal notes)
    report_reply: [
        { group: 'Acknowledge', items: ["Thank you, we're looking into this", 'Sorry for the trouble'] },
        { group: 'Need info',   items: ['Please send a clear photo of the problem', 'Can you share your order number?'] },
        { group: 'Done',        items: ['We have fixed the issue — please confirm', 'We will send a replacement'] },
    ],
    report_safety_note: [
        { group: 'Safety', items: ['Customer was told to turn off the regulator', 'Rider checked for leaks', 'Tank was replaced'] },
    ],
    // Seller's optional note when approving a refund
    refund_seller_notes: [
        { group: 'Replacement', items: ['Replacement will be delivered today', 'Replacement will be delivered tomorrow'] },
        { group: 'Refund',      items: ['Refund sent via GCash', 'Refund given in cash by our rider'] },
        { group: 'Pickup',      items: ['Please keep the old tank for pickup'] },
    ],
    // Seller inventory stock in / out
    stock_note: [
        { group: 'Stock in',  items: ['New delivery from supplier', 'Empty tanks returned', 'Transferred from another branch'] },
        { group: 'Stock out', items: ['Damaged or leaking tank removed'] },
        { group: 'Count',     items: ['Stock count correction'] },
    ],
};
