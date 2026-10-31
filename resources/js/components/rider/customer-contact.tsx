import { Copy, Mail, MapPin, MessageSquare, Phone, StickyNote } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

/**
 * Customer contact for riders, usable on a phone AND a computer:
 * phone / email / address shown as text with Copy buttons; Call and Text are tel: / sms: links
 * (on computers they also copy the number); Email opens Gmail compose, with a mailto: fallback.
 */

/** Copy to the clipboard (with a fallback for browsers without the Clipboard API) and toast. */
export async function copyText(text: string, message: string): Promise<void> {
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const el = document.createElement('textarea');
            el.value = text;
            el.setAttribute('readonly', '');
            el.style.position = 'fixed';
            el.style.opacity = '0';
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            el.remove();
        }
        toast.success(message);
    } catch {
        toast.error("Couldn't copy — please select the text and copy it.");
    }
}

/** True on computers (mouse / trackpad), where tel: and sms: links usually do nothing. */
function usePointerFine(): boolean {
    const [fine, setFine] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia('(pointer: fine)');
        setFine(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setFine(e.matches);
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, []);
    return fine;
}

export const gmailComposeUrl = (email: string, orderNumber: string, name: string) =>
    'https://mail.google.com/mail/?view=cm&fs=1'
    + `&to=${encodeURIComponent(email)}`
    + `&su=${encodeURIComponent(`Your LPG order ${orderNumber}`)}`
    + `&body=${encodeURIComponent(`Hi ${name},\n\n`)}`;

export const mailtoUrl = (email: string, orderNumber: string) =>
    `mailto:${email}?subject=${encodeURIComponent(`Your LPG order ${orderNumber}`)}`;

export const smsUrl = (phone: string, orderNumber: string) =>
    `sms:${phone}?body=${encodeURIComponent(`Hi, this is your LPG rider for order ${orderNumber}.`)}`;

function CopyButton({ text, message, label }: { text: string; message: string; label: string }) {
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void copyText(text, message); }}
            className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            aria-label={label}
            title={label}
        >
            <Copy className="h-3 w-3" /> Copy
        </button>
    );
}

function Row({ icon, children, copy }: { icon: ReactNode; children: ReactNode; copy?: ReactNode }) {
    return (
        <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-gray-400">{icon}</span>
            <div className="min-w-0 flex-1 break-words">{children}</div>
            {copy}
        </div>
    );
}

const btn = 'inline-flex min-h-11 flex-1 basis-[calc(50%-0.25rem)] items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors sm:flex-none sm:basis-auto';

export type ContactCustomer = {
    name: string;
    /** null when the delivery ended more than 24 h ago (privacy rule on the server) */
    phone: string | null;
    email: string | null;
    address: string | null;
    barangay: string | null;
    city: string | null;
    province?: string | null;
    delivery_notes?: string | null;
};

/** "House/Street, Barangay, City, Cavite" */
export const fullAddress = (c: Pick<ContactCustomer, 'address' | 'barangay' | 'city' | 'province'>) =>
    [c.address, c.barangay, c.city, c.address || c.barangay || c.city ? (c.province ?? 'Cavite') : null].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');

/** Full customer card on the rider's delivery details. */
export default function CustomerContactCard({ customer, orderNumber, contactVisible, extraActions }: {
    customer: ContactCustomer;
    orderNumber: string;
    /** Active or finished < 24 h ago — otherwise only the name is shown */
    contactVisible: boolean;
    /** Chat / Navigate buttons */
    extraActions?: ReactNode;
}) {
    const onComputer = usePointerFine();
    const address = fullAddress(customer);
    const { phone, email } = customer;

    // On a computer the link still opens (e.g. a phone-link app), and the number is copied too
    const copyOnComputer = () => {
        if (onComputer && phone) void copyText(phone, 'Number copied — call from your phone');
    };

    return (
        <div className="rounded-lg border bg-white p-3 text-sm dark:bg-gray-950">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Customer</p>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{customer.name}</p>

            <div className="mt-2 grid gap-2">
                {contactVisible && (
                    <>
                        <Row icon={<Phone className="h-4 w-4" />}
                            copy={phone ? <CopyButton text={phone} message="Number copied" label="Copy phone number" /> : undefined}>
                            {phone ? <span className="font-medium tabular-nums">{phone}</span> : <span className="text-gray-400">No phone on file</span>}
                        </Row>
                        <Row icon={<Mail className="h-4 w-4" />}
                            copy={email ? <CopyButton text={email} message="Email copied" label="Copy email address" /> : undefined}>
                            {email ? <span className="font-medium">{email}</span> : <span className="text-gray-400">No email on file</span>}
                        </Row>
                    </>
                )}
                {contactVisible && (
                    <Row icon={<MapPin className="h-4 w-4" />}
                        copy={address ? <CopyButton text={address} message="Address copied" label="Copy address" /> : undefined}>
                        {address || <span className="text-gray-400">No address on file</span>}
                    </Row>
                )}
                {customer.delivery_notes && (
                    <div className="flex items-start gap-2 rounded-md bg-gray-50 px-2.5 py-2 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                        <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="whitespace-pre-line break-words">{customer.delivery_notes}</span>
                    </div>
                )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                {contactVisible && phone && (
                    <>
                        <a href={`tel:${phone}`} onClick={copyOnComputer} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
                            <Phone className="h-4 w-4" /> Call
                        </a>
                        <a href={smsUrl(phone, orderNumber)} onClick={copyOnComputer} className={`${btn} border border-emerald-600 bg-white text-emerald-700 hover:bg-emerald-50 dark:bg-transparent`}>
                            <MessageSquare className="h-4 w-4" /> Text
                        </a>
                    </>
                )}
                {contactVisible && email && (
                    <a href={gmailComposeUrl(email, orderNumber, customer.name)} target="_blank" rel="noopener noreferrer"
                        className={`${btn} border bg-white text-gray-700 hover:bg-gray-100 dark:bg-transparent dark:text-gray-200`}>
                        <Mail className="h-4 w-4" /> Email
                    </a>
                )}
                {extraActions}
            </div>

            {contactVisible && (phone || email) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    {onComputer && phone && <span>Call and Text work on your phone — on a computer they copy the number.</span>}
                    {email && (
                        <a href={mailtoUrl(email, orderNumber)} className="underline hover:text-gray-700">Use mail app</a>
                    )}
                </div>
            )}
        </div>
    );
}

/** Compact phone + email (with Copy) for the route map popups and stop list. */
export function CompactContact({ phone, email }: { phone: string | null; email: string | null }) {
    if (!phone && !email) return null;
    return (
        <div className="grid gap-1 text-xs">
            {phone && (
                <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 shrink-0 text-gray-400" />
                    <a href={`tel:${phone}`} className="flex-1 font-medium tabular-nums !text-gray-800">{phone}</a>
                    <CopyButton text={phone} message="Number copied" label="Copy phone number" />
                </div>
            )}
            {email && (
                <div className="flex items-center gap-1.5">
                    <Mail className="h-3 w-3 shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1 truncate" title={email}>{email}</span>
                    <CopyButton text={email} message="Email copied" label="Copy email address" />
                </div>
            )}
        </div>
    );
}
