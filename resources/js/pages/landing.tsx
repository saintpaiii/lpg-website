import { Head, Link } from '@inertiajs/react';
import {
    BarChart3,
    Brain,
    CheckCircle,
    ChevronDown,
    CreditCard,
    Facebook,
    Flame,
    Instagram,
    Mail,
    MapPin,
    Menu,
    Package,
    Phone,
    Search,
    Shield,
    Store,
    Truck,
    Twitter,
    UserCog,
    UserPlus,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Product {
    id: number;
    name: string;
    brand: string | null;
    weight_kg: number | string;
    selling_price: number | string;
}

interface Props {
    products: Product[];
    stats: { stores: number; products: number; deliveries: number; customers: number };
}

// ── Animation Hooks ────────────────────────────────────────────────────────────

function useReveal<T extends HTMLElement>(threshold = 0.12): [React.RefObject<T>, boolean] {
    const ref = useRef<T>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
            { threshold }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [threshold]);

    return [ref, visible];
}

function useCounter(target: number, active: boolean, duration = 1800): number {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (!active || target === 0) return;
        let start = 0;
        const startTime = performance.now();
        function tick(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
            else setCount(target);
        }
        requestAnimationFrame(tick);
    }, [active, target, duration]);
    return count;
}

// ── LPG Cylinder SVG ──────────────────────────────────────────────────────────

function LpgCylinder({ className = '' }: { className?: string }) {
    return (
        <svg viewBox="0 0 120 220" className={className} aria-hidden="true">
            <defs>
                <linearGradient id="cb" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="45%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#1e3a8a" />
                </linearGradient>
                <linearGradient id="ct" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#93c5fd" />
                    <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
                <linearGradient id="cbot" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#1e40af" />
                    <stop offset="100%" stopColor="#0f172a" />
                </linearGradient>
            </defs>
            <rect x="52" y="5" width="16" height="10" rx="4" fill="#94a3b8" />
            <rect x="45" y="12" width="30" height="18" rx="6" fill="#64748b" />
            <ellipse cx="60" cy="48" rx="40" ry="20" fill="url(#ct)" />
            <rect x="20" y="46" width="80" height="132" fill="url(#cb)" />
            <ellipse cx="60" cy="178" rx="40" ry="18" fill="url(#cbot)" />
            <rect x="24" y="58" width="13" height="88" rx="6.5" fill="rgba(255,255,255,0.20)" />
            <rect x="20" y="100" width="80" height="38" fill="rgba(255,255,255,0.07)" />
            <rect x="32" y="109" width="56" height="4" rx="2" fill="rgba(255,255,255,0.25)" />
            <rect x="38" y="118" width="44" height="3" rx="1.5" fill="rgba(255,255,255,0.15)" />
            <rect x="44" y="126" width="32" height="3" rx="1.5" fill="rgba(255,255,255,0.15)" />
            <ellipse cx="60" cy="196" rx="32" ry="8" fill="#0f172a" opacity="0.45" />
        </svg>
    );
}

// ── Shared reveal wrapper ──────────────────────────────────────────────────────

function Reveal({ children, delay = 0, className = '' }: {
    children: React.ReactNode;
    delay?: number;
    className?: string;
}) {
    const [ref, visible] = useReveal<HTMLDivElement>();
    return (
        <div
            ref={ref}
            className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
            style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
        >
            {children}
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Landing({ products, stats }: Props) {
    const [scrolled, setScrolled]     = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 60);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    function scrollTo(id: string) {
        setMobileOpen(false);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const navLinks = [
        { label: 'How It Works', id: 'how-it-works' },
        { label: 'For Buyers',   id: 'for-buyers'   },
        { label: 'For Sellers',  id: 'for-sellers'  },
    ];

    // ── Stats section ──────────────────────────────────────────────────────────
    const [statsRef, statsVisible] = useReveal<HTMLDivElement>();
    const storeCount    = useCounter(stats.stores,     statsVisible);
    const productCount  = useCounter(stats.products,   statsVisible);
    const deliveryCount = useCounter(stats.deliveries, statsVisible);
    const customerCount = useCounter(stats.customers,  statsVisible);

    return (
        <>
            <Head title="LPG Distribution Cavite — Your Trusted LPG Marketplace" />

            {/* ── Keyframe styles ───────────────────────────────────────────── */}
            <style>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50%       { transform: translateY(-24px) rotate(3deg); }
                }
                @keyframes float2 {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50%       { transform: translateY(-16px) rotate(-4deg); }
                }
                @keyframes float3 {
                    0%, 100% { transform: translateY(0px); }
                    50%       { transform: translateY(-12px); }
                }
                @keyframes blob {
                    0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
                    50%       { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
                }
                @keyframes heroFadeUp {
                    from { opacity: 0; transform: translateY(32px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
                .animate-float  { animation: float  7s ease-in-out infinite; }
                .animate-float2 { animation: float2 9s ease-in-out infinite 1.5s; }
                .animate-float3 { animation: float3 5s ease-in-out infinite 0.8s; }
                .animate-blob   { animation: blob   8s ease-in-out infinite; }
                .hero-fade-1 { animation: heroFadeUp 0.8s ease-out both 0.1s; }
                .hero-fade-2 { animation: heroFadeUp 0.8s ease-out both 0.3s; }
                .hero-fade-3 { animation: heroFadeUp 0.8s ease-out both 0.5s; }
                .hero-fade-4 { animation: heroFadeUp 0.8s ease-out both 0.7s; }
                .dot-pattern {
                    background-image: radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px);
                    background-size: 28px 28px;
                }
                .glass-card {
                    background: rgba(255,255,255,0.06);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255,255,255,0.12);
                }
                .glass-card-light {
                    background: rgba(255,255,255,0.85);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    border: 1px solid rgba(226,232,240,0.8);
                }
            `}</style>

            <div className="min-h-screen bg-white text-slate-900 antialiased">

                {/* ══════════════ NAVBAR ══════════════ */}
                <nav className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
                    scrolled
                        ? 'bg-slate-900/95 backdrop-blur-md shadow-lg shadow-black/20'
                        : 'bg-transparent'
                }`}>
                    <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                        {/* Logo */}
                        <button onClick={() => scrollTo('hero')} className="flex items-center gap-2.5 group">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/30 group-hover:bg-blue-500 transition-colors">
                                <Flame className="h-5 w-5 text-white" />
                            </div>
                            <div className="leading-tight text-left">
                                <p className="text-sm font-bold text-white">LPG Distribution</p>
                                <p className="text-[10px] text-blue-300">Cavite</p>
                            </div>
                        </button>

                        {/* Desktop links */}
                        <div className="hidden md:flex items-center gap-8">
                            {navLinks.map((l) => (
                                <button
                                    key={l.id}
                                    onClick={() => scrollTo(l.id)}
                                    className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
                                >
                                    {l.label}
                                </button>
                            ))}
                        </div>

                        {/* Desktop CTA */}
                        <div className="hidden md:flex items-center gap-3">
                            <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors">
                                Login
                            </Link>
                            <Link href="/register" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-md shadow-blue-600/25 hover:shadow-blue-500/40 hover:scale-[1.02]">
                                Register
                            </Link>
                        </div>

                        {/* Mobile menu toggle */}
                        <button
                            className="md:hidden p-2 text-slate-300 hover:text-white"
                            onClick={() => setMobileOpen(!mobileOpen)}
                        >
                            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </button>
                    </div>

                    {/* Mobile drawer */}
                    {mobileOpen && (
                        <div className="md:hidden bg-slate-900/98 backdrop-blur-md border-t border-white/10 px-6 py-4 space-y-3">
                            {navLinks.map((l) => (
                                <button
                                    key={l.id}
                                    onClick={() => scrollTo(l.id)}
                                    className="block w-full text-left py-2 text-sm font-medium text-slate-300 hover:text-white"
                                >
                                    {l.label}
                                </button>
                            ))}
                            <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                                <Link href="/login" className="block text-center rounded-lg border border-white/20 py-2 text-sm font-medium text-white">
                                    Login
                                </Link>
                                <Link href="/register" className="block text-center rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white">
                                    Register
                                </Link>
                            </div>
                        </div>
                    )}
                </nav>

                {/* ══════════════ HERO ══════════════ */}
                <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
                    {/* Dot pattern */}
                    <div className="absolute inset-0 dot-pattern opacity-60" />

                    {/* Glowing blobs */}
                    <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl animate-blob" />
                    <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl animate-blob" style={{ animationDelay: '4s' }} />
                    <div className="absolute top-1/3 right-1/4 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl animate-blob" style={{ animationDelay: '2s' }} />

                    {/* Floating cylinders — decorative */}
                    <div className="absolute right-8 top-1/4 w-24 opacity-30 hidden lg:block animate-float">
                        <LpgCylinder className="w-full drop-shadow-2xl" />
                    </div>
                    <div className="absolute left-12 bottom-1/4 w-16 opacity-20 hidden xl:block animate-float2">
                        <LpgCylinder className="w-full" />
                    </div>
                    <div className="absolute right-1/4 bottom-1/3 w-12 opacity-15 hidden xl:block animate-float3">
                        <LpgCylinder className="w-full" />
                    </div>

                    {/* Hero content */}
                    <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
                        {/* Pill badge */}
                        <div className="hero-fade-1 mb-6 inline-flex items-center gap-2 rounded-full bg-blue-500/15 px-4 py-1.5 ring-1 ring-blue-400/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                            <span className="text-sm font-medium text-blue-200">Multi-Vendor LPG Marketplace · Cavite</span>
                        </div>

                        <h1 className="hero-fade-2 text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight text-white">
                            Your Trusted{' '}
                            <span className="bg-gradient-to-r from-blue-400 via-blue-300 to-cyan-300 bg-clip-text text-transparent">
                                LPG Marketplace
                            </span>
                            <br />in Cavite
                        </h1>

                        <p className="hero-fade-3 mt-6 text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
                            Browse multiple LPG distributors, compare prices, and get LPG
                            delivered to your doorstep — with real-time tracking and photo proof.
                        </p>

                        <div className="hero-fade-4 mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                href="/register"
                                className="group relative overflow-hidden rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-xl shadow-blue-600/30 transition-all hover:shadow-blue-500/50 hover:scale-[1.02] hover:bg-blue-500"
                            >
                                <span className="relative z-10">Shop Now</span>
                            </Link>
                            <button
                                onClick={() => scrollTo('how-it-works')}
                                className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-8 py-3.5 text-base font-medium text-white backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/30"
                            >
                                Learn More
                                <ChevronDown className="h-4 w-4 animate-bounce" />
                            </button>
                        </div>
                    </div>

                    {/* Bottom fade */}
                    <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-white to-transparent" />
                </section>

                {/* ══════════════ STATS BAR ══════════════ */}
                <section className="bg-white py-16">
                    <div ref={statsRef} className="mx-auto max-w-5xl px-6">
                        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
                            {[
                                { value: storeCount,    label: 'Active Stores',         suffix: '+' },
                                { value: productCount,  label: 'Products Available',    suffix: '+' },
                                { value: deliveryCount, label: 'Deliveries Completed',  suffix: '+' },
                                { value: customerCount, label: 'Registered Customers',  suffix: '+' },
                            ].map(({ value, label, suffix }, i) => (
                                <div key={label} className="text-center" style={{ transitionDelay: `${i * 100}ms` }}>
                                    <p className="text-4xl font-extrabold text-blue-600 tabular-nums">
                                        {value}{suffix}
                                    </p>
                                    <p className="mt-1.5 text-sm font-medium text-slate-500">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ══════════════ HOW IT WORKS ══════════════ */}
                <section id="how-it-works" className="bg-slate-50 py-24">
                    <div className="mx-auto max-w-6xl px-6">
                        <Reveal className="text-center mb-16">
                            <span className="text-sm font-semibold uppercase tracking-widest text-blue-600">Simple Process</span>
                            <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-slate-900">How It Works</h2>
                            <p className="mt-3 text-slate-500 max-w-lg mx-auto">
                                Get your LPG order in three simple steps
                            </p>
                        </Reveal>

                        <div className="grid gap-8 md:grid-cols-3">
                            {[
                                {
                                    icon: UserPlus,
                                    step: '01',
                                    title: 'Create Your Account',
                                    desc: 'Register and verify your email to get started. Takes less than a minute.',
                                    color: 'bg-blue-50 text-blue-600',
                                    border: 'border-blue-100',
                                },
                                {
                                    icon: Search,
                                    step: '02',
                                    title: 'Browse & Compare',
                                    desc: 'Find LPG products from multiple stores across Cavite. Compare prices and brands.',
                                    color: 'bg-indigo-50 text-indigo-600',
                                    border: 'border-indigo-100',
                                },
                                {
                                    icon: Truck,
                                    step: '03',
                                    title: 'Order & Track',
                                    desc: 'Place your order, pay securely, and track your delivery with real-time status updates.',
                                    color: 'bg-cyan-50 text-cyan-600',
                                    border: 'border-cyan-100',
                                },
                            ].map(({ icon: Icon, step, title, desc, color, border }, i) => (
                                <Reveal key={step} delay={i * 120}>
                                    <div className={`relative rounded-2xl border ${border} bg-white p-8 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 group`}>
                                        <div className="mb-5 flex items-center justify-between">
                                            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color} transition-transform duration-300 group-hover:scale-110`}>
                                                <Icon className="h-6 w-6" />
                                            </div>
                                            <span className="text-5xl font-extrabold text-slate-100 select-none">{step}</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                                        <p className="mt-2 text-sm text-slate-500 leading-relaxed">{desc}</p>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ══════════════ FOR BUYERS ══════════════ */}
                <section id="for-buyers" className="bg-white py-24">
                    <div className="mx-auto max-w-6xl px-6">
                        <Reveal className="text-center mb-16">
                            <span className="text-sm font-semibold uppercase tracking-widest text-blue-600">Buyers</span>
                            <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-slate-900">Everything You Need as a Buyer</h2>
                            <p className="mt-3 text-slate-500 max-w-xl mx-auto">
                                Order LPG with confidence from trusted distributors in Cavite
                            </p>
                        </Reveal>

                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            {[
                                { icon: Store,   title: 'Multiple Distributors',   desc: 'Browse from verified LPG distributors across Cavite in one place.',                       color: 'text-blue-600 bg-blue-50' },
                                { icon: Search,  title: 'Compare Prices',           desc: 'Compare refill and new purchase prices side by side before you order.',                    color: 'text-indigo-600 bg-indigo-50' },
                                { icon: CreditCard, title: 'Secure Payments',       desc: 'Pay via GCash, Maya, Card, or Cash on Delivery — whichever works for you.',               color: 'text-emerald-600 bg-emerald-50' },
                                { icon: Truck,   title: 'Delivery Tracking',        desc: 'Track your order every step of the way with live status updates.',                         color: 'text-orange-600 bg-orange-50' },
                                { icon: Shield,  title: 'Photo Proof Delivery',     desc: 'Riders submit photo proof at each step so you always know your order is safe.',            color: 'text-purple-600 bg-purple-50' },
                                { icon: Package, title: 'Order History',            desc: 'View all past orders, invoices, and payment records from your personal dashboard.',        color: 'text-cyan-600 bg-cyan-50' },
                            ].map(({ icon: Icon, title, desc, color }, i) => (
                                <Reveal key={title} delay={i * 80}>
                                    <div className="glass-card-light group rounded-2xl p-6 transition-all duration-300 hover:shadow-md hover:-translate-y-1">
                                        <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${color} transition-transform duration-300 group-hover:scale-110`}>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <h3 className="font-semibold text-slate-900">{title}</h3>
                                        <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{desc}</p>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ══════════════ FOR SELLERS ══════════════ */}
                <section id="for-sellers" className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 py-24">
                    <div className="absolute inset-0 dot-pattern opacity-40" />
                    <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
                    <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />

                    <div className="relative mx-auto max-w-6xl px-6">
                        <div className="grid gap-16 lg:grid-cols-2 items-center">
                            {/* Left text */}
                            <Reveal>
                                <span className="text-sm font-semibold uppercase tracking-widest text-blue-300">Sellers</span>
                                <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-white">
                                    Grow Your LPG Business
                                </h2>
                                <p className="mt-4 text-blue-100 leading-relaxed">
                                    Join our marketplace and reach more customers across Cavite.
                                    Manage everything from one powerful dashboard.
                                </p>

                                <ul className="mt-8 space-y-4">
                                    {[
                                        'Manage your store, products, and inventory',
                                        'Receive orders from customers across Cavite',
                                        'Track deliveries with rider proof system',
                                        'Smart restocking with Decision Support System',
                                        'Add and manage your own staff with custom permissions',
                                    ].map((item) => (
                                        <li key={item} className="flex items-start gap-3">
                                            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
                                            <span className="text-sm text-blue-100">{item}</span>
                                        </li>
                                    ))}
                                </ul>

                                <div className="mt-10 flex flex-col sm:flex-row gap-4">
                                    <Link
                                        href="/register"
                                        className="inline-flex items-center justify-center rounded-xl bg-white px-7 py-3 text-sm font-semibold text-blue-700 shadow-lg hover:bg-blue-50 transition-all hover:scale-[1.02]"
                                    >
                                        Start Selling
                                    </Link>
                                </div>
                                <p className="mt-4 text-xs text-blue-300/70">
                                    Register as a buyer first, then apply to become a seller from your account.
                                </p>
                            </Reveal>

                            {/* Right — feature cards */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                {[
                                    { icon: Package,  title: 'Product Management',  desc: 'Add, edit, and manage your LPG product catalog with pricing.' },
                                    { icon: BarChart3, title: 'Sales Reports',       desc: 'Track revenue, orders, and delivery performance.' },
                                    { icon: Brain,    title: 'DSS Insights',         desc: 'Data-driven restocking recommendations for your store.' },
                                    { icon: UserCog,  title: 'Staff Management',     desc: 'Add cashiers, warehouse staff, and riders with permissions.' },
                                ].map(({ icon: Icon, title, desc }, i) => (
                                    <Reveal key={title} delay={i * 100}>
                                        <div className="glass-card rounded-xl p-5 transition-all duration-300 hover:-translate-y-1 hover:bg-white/10">
                                            <Icon className="mb-3 h-6 w-6 text-blue-300" />
                                            <h3 className="text-sm font-semibold text-white">{title}</h3>
                                            <p className="mt-1 text-xs text-blue-200/70 leading-relaxed">{desc}</p>
                                        </div>
                                    </Reveal>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ══════════════ PLATFORM FEATURES ══════════════ */}
                <section className="bg-slate-50 py-24">
                    <div className="mx-auto max-w-6xl px-6">
                        <Reveal className="text-center mb-16">
                            <span className="text-sm font-semibold uppercase tracking-widest text-blue-600">Platform</span>
                            <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-slate-900">Built for the Whole Marketplace</h2>
                            <p className="mt-3 text-slate-500 max-w-lg mx-auto">
                                A complete platform for buyers, sellers, and platform administrators
                            </p>
                        </Reveal>

                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            {[
                                { icon: Store,    title: 'Multiple Stores',       desc: 'One platform, many trusted LPG distributors operating independently.',        color: 'bg-blue-600'   },
                                { icon: CreditCard, title: 'Secure Payments',     desc: 'GCash, Maya, Card, or Cash on Delivery — all payment methods supported.',    color: 'bg-emerald-600'},
                                { icon: Truck,    title: 'Delivery Tracking',     desc: 'Real-time status updates with photo proof at every delivery milestone.',      color: 'bg-orange-600' },
                                { icon: Brain,    title: 'Decision Support',      desc: 'Smart analytics dashboard to help sellers make better inventory decisions.',  color: 'bg-purple-600' },
                                { icon: UserCog,  title: 'Role Management',       desc: 'Granular staff permissions — cashiers, warehouse, riders, and more.',         color: 'bg-indigo-600' },
                                { icon: BarChart3, title: 'Transparent Fees',     desc: 'Clear and fair commission model. No hidden charges for sellers.',             color: 'bg-cyan-600'   },
                            ].map(({ icon: Icon, title, desc, color }, i) => (
                                <Reveal key={title} delay={i * 70}>
                                    <div className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                                        <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${color} shadow-sm transition-transform duration-300 group-hover:scale-110`}>
                                            <Icon className="h-5 w-5 text-white" />
                                        </div>
                                        <h3 className="font-semibold text-slate-900">{title}</h3>
                                        <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{desc}</p>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ══════════════ CTA BANNER ══════════════ */}
                <section className="bg-blue-600 py-16">
                    <Reveal>
                        <div className="mx-auto max-w-3xl px-6 text-center">
                            <h2 className="text-3xl font-bold text-white">Ready to Get Started?</h2>
                            <p className="mt-3 text-blue-100">
                                Join customers and sellers already using LPG Distribution Cavite
                            </p>
                            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                                <Link
                                    href="/register"
                                    className="rounded-xl bg-white px-8 py-3 text-sm font-semibold text-blue-700 shadow-lg hover:bg-blue-50 transition-all hover:scale-[1.02]"
                                >
                                    Create Account
                                </Link>
                                <Link
                                    href="/login"
                                    className="rounded-xl border border-white/30 px-8 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-all"
                                >
                                    Sign In
                                </Link>
                            </div>
                        </div>
                    </Reveal>
                </section>

                {/* ══════════════ FOOTER ══════════════ */}
                <footer className="bg-slate-950 py-16">
                    <div className="mx-auto max-w-6xl px-6">
                        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4 mb-12">
                            {/* Brand */}
                            <div className="lg:col-span-2">
                                <div className="flex items-center gap-2.5 mb-4">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
                                        <Flame className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">LPG Distribution</p>
                                        <p className="text-[10px] text-blue-400">Cavite</p>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
                                    A multi-vendor marketplace platform connecting LPG distributors and customers
                                    across Cavite with reliable delivery and secure payments.
                                </p>
                                <div className="mt-5 flex gap-3">
                                    {[Facebook, Twitter, Instagram].map((Icon, i) => (
                                        <div key={i} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-blue-600 hover:text-white transition-all cursor-pointer">
                                            <Icon className="h-4 w-4" />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Quick links */}
                            <div>
                                <h4 className="text-sm font-semibold text-white mb-4">Quick Links</h4>
                                <ul className="space-y-2.5">
                                    {[
                                        { label: 'Home',             onClick: () => scrollTo('hero') },
                                        { label: 'How It Works',     onClick: () => scrollTo('how-it-works') },
                                        { label: 'For Buyers',       onClick: () => scrollTo('for-buyers') },
                                        { label: 'For Sellers',      onClick: () => scrollTo('for-sellers') },
                                    ].map(({ label, onClick }) => (
                                        <li key={label}>
                                            <button onClick={onClick} className="text-sm text-slate-400 hover:text-white transition-colors">
                                                {label}
                                            </button>
                                        </li>
                                    ))}
                                    <li><Link href="/login"    className="text-sm text-slate-400 hover:text-white transition-colors">Login</Link></li>
                                    <li><Link href="/register" className="text-sm text-slate-400 hover:text-white transition-colors">Register</Link></li>
                                </ul>
                            </div>

                            {/* Contact */}
                            <div>
                                <h4 className="text-sm font-semibold text-white mb-4">Contact</h4>
                                <ul className="space-y-3">
                                    <li className="flex items-start gap-2.5 text-sm text-slate-400">
                                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                                        Cavite, Philippines
                                    </li>
                                    <li className="flex items-center gap-2.5 text-sm text-slate-400">
                                        <Mail className="h-4 w-4 shrink-0 text-blue-400" />
                                        info@lpgcavite.ph
                                    </li>
                                    <li className="flex items-center gap-2.5 text-sm text-slate-400">
                                        <Phone className="h-4 w-4 shrink-0 text-blue-400" />
                                        +63 (046) 000-0000
                                    </li>
                                </ul>
                            </div>
                        </div>

                        <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
                            <p>© 2026 LPG Distribution Cavite. All rights reserved.</p>
                            <p>Built for Cavite LPG Distributors</p>
                        </div>
                    </div>
                </footer>
            </div>
        </>
    );
}
