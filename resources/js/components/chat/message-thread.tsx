import { Link, usePage } from '@inertiajs/react';
import axios from 'axios';
import { ArrowDown, ArrowLeft, Bike, ImagePlus, Info, Loader2, Navigation, Phone, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useDebounced, useEchoPrivate, usePollInterval, useRealtimeStatus } from '@/lib/echo';
import { cn } from '@/lib/utils';
import type { SharedData } from '@/types';
import { Avatar } from './conversation-list';
import { dayKey, dayLabel, timeOf } from './format';
import type { ChatMessage, ChatPortal, ConversationHeader } from './types';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const NEAR_BOTTOM_PX = 120;

/** Plain text with http(s) links made clickable — never renders HTML from the message. */
function Linkified({ text }: { text: string }) {
    const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
    return (
        <>
            {parts.map((p, i) => /^https?:\/\//.test(p)
                ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all underline">{p}</a>
                : <Fragment key={i}>{p}</Fragment>)}
        </>
    );
}

const CANNOT_SEND: Record<string, string> = {
    closed: 'This chat is closed.',
    rider_ended: 'Your delivery for this customer is complete.',
    no_permission: "You can view messages but don't have permission to reply.",
    store_unavailable: 'This store is currently unavailable.',
    no_access: "You can't send messages here.",
};

const ORDER_URL: Record<ChatPortal, ((id: number) => string) | null> = {
    customer: (id) => `/customer/orders/${id}`,
    seller: (id) => `/seller/orders/${id}`,
    rider: null,
};

let tempSeq = -1;

export default function MessageThread({ portal, conversationId, onBack, onLoaded, headerActions, composerTools }: {
    portal: ChatPortal;
    conversationId: number;
    onBack?: () => void;
    /** Called with the header after loading (and when a poll changes it). */
    onLoaded?: (header: ConversationHeader) => void;
    headerActions?: (header: ConversationHeader) => ReactNode;
    /** Extra composer buttons (e.g. quick replies); receives a function that inserts text. */
    composerTools?: (insert: (text: string) => void) => ReactNode;
}) {
    const me = usePage<SharedData>().props.auth.user.id as number;
    const viewerSide = portal === 'seller' ? 'store' : portal;
    const base = `/${portal}/messages/${conversationId}`;
    const pollMs = usePollInterval(5000);
    const live = useRealtimeStatus();

    const [header, setHeader]       = useState<ConversationHeader | null>(null);
    const [messages, setMessages]   = useState<ChatMessage[]>([]);
    const [hasMore, setHasMore]     = useState(false);
    const [loading, setLoading]     = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loadingEarlier, setLoadingEarlier] = useState(false);
    const [newPill, setNewPill]     = useState(false);
    const [text, setText]           = useState('');
    const [image, setImage]         = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageError, setImageError] = useState<string | null>(null);
    const [viewer, setViewer]       = useState<string | null>(null);

    const scrollRef   = useRef<HTMLDivElement>(null);
    const fileRef     = useRef<HTMLInputElement>(null);
    const textRef     = useRef<HTMLTextAreaElement>(null);
    const lastIdRef   = useRef(0);
    const stickRef    = useRef(true);
    const prependRef  = useRef<number | null>(null);
    const onLoadedRef = useRef(onLoaded);
    onLoadedRef.current = onLoaded;

    /** Mine = my own sends; for store staff, anything sent by the store side. */
    const isMine = useCallback((m: ChatMessage) => !!m.status || (viewerSide === 'store' ? m.side === 'store' : m.sender_id === me), [viewerSide, me]);

    const nearBottom = () => {
        const el = scrollRef.current;
        return !el || el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    };

    /** Add messages we don't have yet; a real message replaces its optimistic copy. */
    const mergeNew = useCallback((incoming: ChatMessage[]) => {
        if (!incoming.length) return;
        setMessages((prev) => {
            const seen = new Set(prev.filter((m) => m.id > 0).map((m) => m.id));
            const fresh = incoming.filter((m) => !seen.has(m.id));
            if (!fresh.length) return prev;
            let next = prev;
            for (const m of fresh) {
                if (m.sender_id === me) {
                    const temp = next.find((t) => t.status === 'sending' && (t.body ?? '') === (m.body ?? '') && !!t.attachment_url === !!m.attachment_url);
                    if (temp) next = next.filter((t) => t !== temp);
                }
            }
            return [...next, ...fresh];
        });
        lastIdRef.current = Math.max(lastIdRef.current, ...incoming.map((m) => m.id));
    }, [me]);

    const applyHeader = useCallback((next: ConversationHeader) => {
        setHeader((h) => {
            if (!h || h.can_send !== next.can_send || h.riders.length !== next.riders.length || h.riders[0]?.status !== next.riders[0]?.status) {
                onLoadedRef.current?.(next);
            }
            return next;
        });
    }, []);

    // Load the conversation
    useEffect(() => {
        let cancelled = false;
        setLoading(true); setLoadError(null); setMessages([]); setHeader(null); setNewPill(false);
        lastIdRef.current = 0;
        axios.get<{ conversation: ConversationHeader; messages: ChatMessage[]; has_more: boolean }>(base)
            .then((res) => {
                if (cancelled) return;
                setHeader(res.data.conversation);
                setMessages(res.data.messages);
                setHasMore(res.data.has_more);
                lastIdRef.current = Math.max(0, ...res.data.messages.map((m) => m.id));
                stickRef.current = true;
                onLoadedRef.current?.(res.data.conversation);
            })
            .catch((err) => {
                if (cancelled) return;
                setLoadError(axios.isAxiosError(err) && err.response?.status === 403
                    ? "You can't open this conversation."
                    : 'Could not load messages. Please try again.');
            })
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [base]);

    /** Fetch anything newer (and mark it read). Used by the poll and after live events. */
    const pull = useCallback(async (markRead = false) => {
        const res = await axios.get<{ messages: ChatMessage[]; conversation: ConversationHeader }>(`${base}/messages`, {
            params: { after: lastIdRef.current, ...(markRead ? { read: 1 } : {}) },
        });
        if (res.data.messages.length) {
            const atBottom = nearBottom();
            stickRef.current = atBottom;
            if (!atBottom && res.data.messages.some((m) => !isMine(m))) setNewPill(true);
            mergeNew(res.data.messages);
        }
        applyHeader(res.data.conversation);
    }, [base, mergeNew, applyHeader, isMine]);

    // Poll: every 5 s, or every 60 s as a safety net while live updates are connected
    useEffect(() => {
        if (loading || loadError) return;
        let busy = false;
        const id = setInterval(async () => {
            if (busy || document.visibilityState !== 'visible') return;
            busy = true;
            try { await pull(); } catch { /* keep polling quietly */ } finally { busy = false; }
        }, pollMs);
        return () => clearInterval(id);
    }, [loading, loadError, pull, pollMs]);

    // Live: new messages appear instantly; mark them read shortly after if the tab is visible
    const markReadSoon = useDebounced(() => {
        if (document.visibilityState === 'visible') pull(true).catch(() => {});
    }, 800);
    const onLive = useCallback((m: ChatMessage) => {
        if (m.conversation_id !== conversationId) return;
        const atBottom = nearBottom();
        stickRef.current = atBottom || m.sender_id === me;
        if (!atBottom && !isMine(m)) setNewPill(true);
        mergeNew([m]);
        if (!isMine(m) || m.side === 'system') markReadSoon();
    }, [conversationId, me, isMine, mergeNew, markReadSoon]);

    // Riders in a customer chat receive messages on their own channel (their access is time-boxed)
    const riderInCustomerChat = portal === 'rider' && header?.type === 'customer_store';
    useEchoPrivate<ChatMessage>(header && !riderInCustomerChat ? `conversation.${conversationId}` : null, 'MessageSent', onLive);
    useEchoPrivate<ChatMessage>(riderInCustomerChat ? `user.${me}` : null, 'MessageSent', onLive);

    // Keep the view anchored: bottom for new messages, same spot after loading older ones
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (prependRef.current !== null) {
            el.scrollTop = el.scrollHeight - prependRef.current;
            prependRef.current = null;
        } else if (stickRef.current) {
            el.scrollTop = el.scrollHeight;
            stickRef.current = false;
        }
    }, [messages]);

    async function loadEarlier() {
        const firstId = messages.find((m) => m.id > 0)?.id;
        if (!firstId) return;
        setLoadingEarlier(true);
        try {
            const res = await axios.get<{ messages: ChatMessage[]; has_more: boolean }>(`${base}/messages`, { params: { before: firstId } });
            prependRef.current = scrollRef.current?.scrollHeight ?? 0;
            setMessages((prev) => [...res.data.messages, ...prev]);
            setHasMore(res.data.has_more);
        } finally {
            setLoadingEarlier(false);
        }
    }

    function pickImage(file: File | undefined) {
        setImageError(null);
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setImageError('Please choose a JPG, PNG or WEBP photo.'); return; }
        if (file.size > MAX_IMAGE_BYTES) { setImageError('Photo is too large (max 5 MB).'); return; }
        setImage(file);
        setImagePreview(URL.createObjectURL(file));
    }

    function clearImage() {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImage(null); setImagePreview(null); setImageError(null);
        if (fileRef.current) fileRef.current.value = '';
    }

    async function deliver(tempId: number, body: string, file: File | null) {
        const form = new FormData();
        if (body) form.append('body', body);
        if (file) form.append('image', file);
        try {
            const res = await axios.post<{ message: ChatMessage }>(base, form);
            const real = res.data.message;
            setMessages((prev) => {
                const without = prev.filter((m) => m.id !== tempId && m.id !== real.id);
                return [...without, real].sort((a, b) => (a.id < 0 ? Infinity : a.id) - (b.id < 0 ? Infinity : b.id));
            });
            lastIdRef.current = Math.max(lastIdRef.current, real.id);
        } catch (err) {
            setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed', retry: { body, image: file } } : m)));
            if (axios.isAxiosError(err) && err.response?.status === 422) {
                pull().catch(() => {});   // the chat may have closed meanwhile — refresh the header
            }
        }
    }

    function send() {
        const body = text.trim();
        if ((!body && !image) || !header?.can_send) return;
        const tempId = tempSeq--;
        setMessages((prev) => [...prev, {
            id: tempId, side: viewerSide, sender_id: me, is_automatic: false, sender_name: null, body: body || null,
            attachment_url: imagePreview, order: null, created_at: new Date().toISOString(), status: 'sending',
        }]);
        stickRef.current = true;
        const file = image;
        setText('');
        setImage(null); setImagePreview(null);
        if (fileRef.current) fileRef.current.value = '';
        deliver(tempId, body, file);
        textRef.current?.focus();
    }

    function retry(m: ChatMessage) {
        if (!m.retry) return;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'sending' } : x)));
        deliver(m.id, m.retry.body, m.retry.image);
    }

    const insertText = (t: string) => {
        setText((cur) => (cur.trim() ? `${cur.trimEnd()} ${t}` : t));
        requestAnimationFrame(() => textRef.current?.focus());
    };

    if (loading) {
        return <div className="flex h-full items-center justify-center text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading messages…</div>;
    }
    if (loadError || !header) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-gray-500">
                {loadError ?? 'Conversation not found.'}
                {onBack && <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>}
            </div>
        );
    }

    const orderUrl = ORDER_URL[portal];
    let lastDay = '';

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 border-b px-3 py-2.5">
                {onBack && (
                    <button type="button" onClick={onBack} className="rounded-md p-1 hover:bg-gray-100 md:hidden dark:hover:bg-gray-800" aria-label="Back to conversations">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                )}
                <Avatar initials={header.initials} seed={header.id} src={header.avatar_url} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{header.title}</p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-gray-500">
                        <span className="truncate">{header.my_delivery ? `Order ${header.my_delivery.order_number} · ${header.my_delivery.status_label}` : header.riders.length ? (portal === 'customer' ? 'Store' : 'Customer') : header.subtitle}</span>
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', live === 'connected' ? 'bg-emerald-500' : 'bg-gray-300')}
                            title={live === 'connected' ? 'Live' : 'Updating every few seconds'} />
                        <span className="hidden shrink-0 text-[10px] sm:inline">{live === 'connected' ? 'Live' : 'Updating every few seconds'}</span>
                    </p>
                </div>
                {header.my_delivery?.navigate_url && (
                    <a href={header.my_delivery.navigate_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                        <Navigation className="h-3.5 w-3.5" /> Navigate
                    </a>
                )}
                {header.phone && (
                    <a href={`tel:${header.phone}`} className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600 dark:hover:bg-gray-800" aria-label={`Call ${header.title}`}>
                        <Phone className="h-4 w-4" />
                    </a>
                )}
                {headerActions?.(header)}
            </div>

            {/* Rider currently in this chat (customer & store views) */}
            {header.riders.map((r) => (
                <div key={`${r.rider_id}-${r.order_id}`} className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                    <Bike className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate"><strong>{r.name}</strong> · Rider · {r.status_label}</span>
                    {r.order_number && (r.order_id && orderUrl
                        ? <Link href={orderUrl(r.order_id)} className="shrink-0 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-amber-800 hover:underline dark:bg-gray-900">{r.order_number}</Link>
                        : <span className="shrink-0 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] dark:bg-gray-900">{r.order_number}</span>)}
                    {r.phone && (
                        <a href={`tel:${r.phone}`} className="shrink-0 rounded-md p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40" aria-label={`Call rider ${r.name}`}>
                            <Phone className="h-3.5 w-3.5" />
                        </a>
                    )}
                </div>
            ))}

            {/* Messages */}
            <div className="relative min-h-0 flex-1">
                <div ref={scrollRef} className="h-full overflow-y-auto px-3 py-3"
                    onScroll={() => { if (newPill && nearBottom()) setNewPill(false); }}>
                    {hasMore && (
                        <div className="mb-3 text-center">
                            <Button variant="outline" size="sm" onClick={loadEarlier} disabled={loadingEarlier}>
                                {loadingEarlier && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Load earlier messages
                            </Button>
                        </div>
                    )}
                    {messages.length === 0 && (
                        <p className="py-10 text-center text-sm text-gray-500">No messages yet. Say hello!</p>
                    )}

                    {messages.map((m) => {
                        const day = m.created_at ? dayKey(m.created_at) : lastDay;
                        const separator = day !== lastDay && m.created_at ? dayLabel(m.created_at) : null;
                        lastDay = day;
                        const mine = isMine(m);
                        const orderChip = m.order && (
                            orderUrl
                                ? <Link href={orderUrl(m.order.id)} className={cn('mt-1 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] hover:underline', mine ? 'bg-white/20' : 'bg-white dark:bg-gray-900')}>{m.order.order_number}</Link>
                                : <span className={cn('mt-1 inline-block rounded px-1.5 py-0.5 font-mono text-[10px]', mine ? 'bg-white/20' : 'bg-white dark:bg-gray-900')}>{m.order.order_number}</span>
                        );

                        return (
                            <Fragment key={m.id}>
                                {separator && (
                                    <div className="my-3 flex items-center gap-3 text-[11px] text-gray-400">
                                        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />{separator}<span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                                    </div>
                                )}

                                {m.side === 'system' ? (
                                    <div className="my-2 flex justify-center">
                                        <p className="flex max-w-[85%] items-start gap-1.5 text-center text-[11px] text-gray-500">
                                            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-gray-400" />
                                            <span>{m.body} <span className="text-[10px] text-gray-400">{timeOf(m.created_at)}</span></span>
                                        </p>
                                    </div>
                                ) : (
                                    <div className={cn('my-1.5 flex', mine ? 'justify-end' : 'justify-start')}>
                                        <div className={cn('flex max-w-[80%] flex-col', mine ? 'items-end' : 'items-start')}>
                                            {m.sender_name && (!mine || m.side === 'store') && (
                                                <span className={cn('mb-0.5 flex items-center gap-1 px-1 text-[11px]', m.side === 'rider' ? 'font-medium text-amber-700' : 'text-gray-500')}>
                                                    {m.side === 'rider' && <Bike className="h-3 w-3" />}{m.sender_name}
                                                </span>
                                            )}
                                            {m.is_automatic && (
                                                <span className="mb-0.5 flex items-center gap-1 px-1 text-[10px] text-gray-400">
                                                    <Sparkles className="h-3 w-3" /> Automatic update
                                                </span>
                                            )}
                                            <div className={cn('rounded-2xl px-3 py-2 text-sm',
                                                mine
                                                    ? 'rounded-br-md bg-blue-600 text-white'
                                                    : m.side === 'rider'
                                                        ? 'rounded-bl-md border border-amber-200 bg-amber-50 text-gray-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-gray-100'
                                                        : m.side === 'store'
                                                            ? 'rounded-bl-md bg-blue-50 text-gray-900 dark:bg-blue-900/20 dark:text-gray-100'
                                                            : 'rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100',
                                                m.status === 'sending' && 'opacity-70')}>
                                                {m.attachment_url && (
                                                    <button type="button" onClick={() => setViewer(m.attachment_url)} className="mb-1 block">
                                                        <img src={m.attachment_url} alt="Photo" className="max-h-60 w-auto max-w-[240px] rounded-lg object-cover" />
                                                    </button>
                                                )}
                                                {m.body && <p className="whitespace-pre-wrap break-words"><Linkified text={m.body} /></p>}
                                                {orderChip}
                                            </div>
                                            <span className="mt-0.5 px-1 text-[10px] text-gray-400">
                                                {m.status === 'sending' ? 'Sending…' : m.status === 'failed' ? null : timeOf(m.created_at)}
                                            </span>
                                            {m.status === 'failed' && (
                                                <button type="button" onClick={() => retry(m)} className="flex items-center gap-1 px-1 text-[11px] font-medium text-red-600">
                                                    <RotateCcw className="h-3 w-3" /> Not sent — tap to retry
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </Fragment>
                        );
                    })}
                </div>

                {newPill && (
                    <button type="button" onClick={() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; setNewPill(false); }}
                        className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow">
                        New messages <ArrowDown className="h-3 w-3" />
                    </button>
                )}
            </div>

            {/* Composer */}
            {header.can_send ? (
                <div className="border-t p-2">
                    {imagePreview && (
                        <div className="relative mb-2 inline-block">
                            <img src={imagePreview} alt="Selected photo" className="h-20 rounded-md border object-cover" />
                            <button type="button" onClick={clearImage} aria-label="Remove photo"
                                className="absolute -right-2 -top-2 rounded-full bg-gray-800 p-0.5 text-white"><X className="h-3.5 w-3.5" /></button>
                        </div>
                    )}
                    {imageError && <p className="mb-1 text-xs text-red-600">{imageError}</p>}
                    <div className="flex items-end gap-1.5">
                        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
                        <Button type="button" variant="ghost" size="icon" onClick={() => fileRef.current?.click()} aria-label="Add photo" title="Photo">
                            <ImagePlus className="h-5 w-5" />
                        </Button>
                        {composerTools?.(insertText)}
                        <textarea
                            ref={textRef}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                            placeholder="Type a message…"
                            rows={1}
                            maxLength={2000}
                            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Message"
                        />
                        <Button type="button" onClick={send} disabled={!text.trim() && !image} aria-label="Send" className="gap-1">
                            <Send className="h-4 w-4" /><span className="hidden sm:inline">Send</span>
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="border-t bg-gray-50 px-4 py-3 text-center text-sm text-gray-500 dark:bg-gray-900/40">
                    {CANNOT_SEND[header.cannot_send_reason ?? 'no_access'] ?? "You can't send messages here."}
                </div>
            )}

            {/* Full-size photo */}
            <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
                <DialogContent className="max-w-3xl p-2">
                    <DialogTitle className="sr-only">Photo</DialogTitle>
                    {viewer && <img src={viewer} alt="Photo" className="max-h-[80vh] w-full rounded object-contain" />}
                </DialogContent>
            </Dialog>
        </div>
    );
}
