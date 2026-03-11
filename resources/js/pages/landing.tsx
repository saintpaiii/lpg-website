import { Head, Link } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import {
    ArrowRight,
    CheckCircle,
    ChevronDown,
    Clock,
    Flame,
    Mail,
    MapPin,
    Menu,
    Phone,
    PhilippinePeso,
    Shield,
    ShoppingCart,
    Truck,
    UserPlus,
    X,
    Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
    id: number;
    name: string;
    brand: string | null;
    weight_kg: number | string;
    selling_price: number | string;
}

interface Props {
    products: Product[];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LpgCylinder({ className = '' }: { className?: string }) {
    return (
        <svg viewBox="0 0 120 220" className={className} aria-hidden="true">
            <defs>
                <linearGradient id="cylBody" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="45%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#1e3a8a" />
                </linearGradient>
                <linearGradient id="cylTop" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#93c5fd" />
                    <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
                <linearGradient id="cylBot" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#1e40af" />
                    <stop offset="100%" stopColor="#0f172a" />
                </linearGradient>
            </defs>
            {/* Valve stem */}
            <rect x="52" y="5" width="16" height="10" rx="4" fill="#94a3b8" />
            {/* Valve body */}
            <rect x="45" y="12" width="30" height="18" rx="6" fill="#64748b" />
            {/* Top dome */}
            <ellipse cx="60" cy="48" rx="40" ry="20" fill="url(#cylTop)" />
            {/* Cylinder body */}
            <rect x="20" y="46" width="80" height="132" fill="url(#cylBody)" />
            {/* Bottom dome */}
            <ellipse cx="60" cy="178" rx="40" ry="18" fill="url(#cylBot)" />
            {/* Highlight stripe */}
            <rect x="24" y="58" width="13" height="88" rx="6.5" fill="rgba(255,255,255,0.20)" />
            {/* Label band */}
            <rect x="20" y="100" width="80" height="38" fill="rgba(255,255,255,0.07)" />
            {/* Label text lines */}
            <rect x="32" y="109" width="56" height="4" rx="2" fill="rgba(255,255,255,0.25)" />
            <rect x="38" y="118" width="44" height="3" rx="1.5" fill="rgba(255,255,255,0.15)" />
            <rect x="44" y="126" width="32" height="3" rx="1.5" fill="rgba(255,255,255,0.15)" />
            {/* Stand shadow */}
            <ellipse cx="60" cy="196" rx="32" ry="8" fill="#0f172a" opacity="0.55" />
        </svg>
    );
}

function MiniCylinder({ gradId }: { gradId: string }) {
    return (
        <svg viewBox="0 0 60 100" className="w-full h-full" aria-hidden="true">
            <defs>
                <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#bfdbfe" />
                    <stop offset="100%" stopColor="#eff6ff" />
                </linearGradient>
            </defs>
            <rect x="8" y="20" width="44" height="60" rx="10" fill={`url(#${gradId})`} />
            <ellipse cx="30" cy="20" rx="22" ry="10" fill="#dbeafe" />
            <ellipse cx="30" cy="80" rx="22" ry="9" fill="#1e3a8a" opacity="0.45" />
            <rect x="22" y="8" width="16" height="11" rx="4" fill="#94a3b8" />
            <rect x="12" y="24" width="7" height="40" rx="3.5" fill="rgba(255,255,255,0.35)" />
        </svg>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-block text-blue-600 font-semibold text-sm uppercase tracking-wider mb-2">
            {children}
        </span>
    );
}

function SectionTitle({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
    return (
        <h2 className={`text-3xl sm:text-4xl font-bold ${light ? 'text-white' : 'text-slate-900'}`}>
            {children}
        </h2>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Landing({ products }: Props) {
    const [scrolled, setScrolled]       = useState(false);
    const [mobileOpen, setMobileOpen]   = useState(false);
    const [formSent, setFormSent]       = useState(false);
    const [form, setForm]               = useState({ name: '', email: '', phone: '', message: '' });
    const formTimerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Navbar background on scroll
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Close mobile menu on resize
    useEffect(() => {
        const onResize = () => { if (window.innerWidth >= 768) setMobileOpen(false); };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => () => { if (formTimerRef.current) clearTimeout(formTimerRef.current); }, []);

    const scrollTo = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        setMobileOpen(false);
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormSent(true);
        setForm({ name: '', email: '', phone: '', message: '' });
        formTimerRef.current = setTimeout(() => setFormSent(false), 7000);
    };

    // Show DB products or fallback if DB is empty
    const displayProducts: Product[] = products.length > 0 ? products : [
        { id: 1, name: '11kg Petron Gasul',  brand: 'Petron', weight_kg: 11,  selling_price: 850  },
        { id: 2, name: '11kg Solane',         brand: 'Solane', weight_kg: 11,  selling_price: 830  },
        { id: 3, name: '22kg Petron Gasul',   brand: 'Petron', weight_kg: 22,  selling_price: 1600 },
        { id: 4, name: '50kg Industrial LPG', brand: 'Shell',  weight_kg: 50,  selling_price: 3500 },
        { id: 5, name: '2.7kg Handy Gas',     brand: 'Total',  weight_kg: 2.7, selling_price: 380  },
    ];

    const navLinks = [
        { label: 'Home',         id: 'hero'         },
        { label: 'About',        id: 'about'        },
        { label: 'Products',     id: 'products'     },
        { label: 'How It Works', id: 'how-it-works' },
        { label: 'Contact',      id: 'contact'      },
    ];

    const navTextClass = scrolled ? 'text-slate-700 hover:text-blue-600' : 'text-white/90 hover:text-white';

    return (
        <>
            <Head>
                <title>LPG Distribution Cavite — Fast & Reliable LPG Delivery</title>
                <meta name="description" content="Trusted LPG distributor in Cavite. Same-day delivery of 11kg, 22kg, and 50kg LPG tanks to your home or business. Order online and track in real-time." />
            </Head>

            {/* ── NAVBAR ──────────────────────────────────────────────────── */}
            <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
                scrolled ? 'bg-white/96 backdrop-blur shadow-md' : 'bg-transparent'
            }`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">

                        {/* Logo */}
                        <button
                            onClick={() => scrollTo('hero')}
                            className="flex items-center gap-2.5 font-bold text-base"
                        >
                            <div className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${
                                scrolled ? 'bg-blue-600' : 'bg-white/15 border border-white/30'
                            }`}>
                                <Flame className={`h-5 w-5 ${scrolled ? 'text-white' : 'text-orange-300'}`} />
                            </div>
                            <span className={scrolled ? 'text-slate-800' : 'text-white'}>
                                LPG Distribution{' '}
                                <span className={scrolled ? 'text-blue-600' : 'text-blue-300'}>Cavite</span>
                            </span>
                        </button>

                        {/* Desktop links */}
                        <div className="hidden md:flex items-center gap-6">
                            {navLinks.map(({ label, id }) => (
                                <button
                                    key={id}
                                    onClick={() => scrollTo(id)}
                                    className={`text-sm font-medium transition-colors ${navTextClass}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* Auth buttons (desktop) */}
                        <div className="hidden md:flex items-center gap-2">
                            <Link href="/login">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={scrolled
                                        ? 'border-blue-600 text-blue-600 hover:bg-blue-50'
                                        : 'border-white/60 text-white hover:bg-white/10 bg-transparent'
                                    }
                                >
                                    Login
                                </Button>
                            </Link>
                            <Link href="/register">
                                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                                    Register
                                </Button>
                            </Link>
                        </div>

                        {/* Mobile hamburger */}
                        <button
                            className={`md:hidden p-2 rounded-lg transition-colors ${scrolled ? 'text-slate-700' : 'text-white'}`}
                            onClick={() => setMobileOpen(!mobileOpen)}
                            aria-label="Toggle menu"
                        >
                            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </button>
                    </div>

                    {/* Mobile menu */}
                    {mobileOpen && (
                        <div className={`md:hidden border-t py-4 pb-6 ${
                            scrolled ? 'border-slate-100 bg-white' : 'border-white/20 bg-blue-900/97 backdrop-blur-md'
                        }`}>
                            <div className="flex flex-col gap-0.5">
                                {navLinks.map(({ label, id }) => (
                                    <button
                                        key={id}
                                        onClick={() => scrollTo(id)}
                                        className={`text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                            scrolled
                                                ? 'text-slate-700 hover:bg-slate-50 hover:text-blue-600'
                                                : 'text-white hover:bg-white/10'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                                <div className="flex gap-2 px-4 mt-4 pt-4 border-t border-current/10">
                                    <Link href="/login" className="flex-1">
                                        <Button variant="outline" size="sm" className="w-full border-white/60 text-white hover:bg-white/10 bg-transparent">
                                            Login
                                        </Button>
                                    </Link>
                                    <Link href="/register" className="flex-1">
                                        <Button size="sm" className="w-full bg-blue-500 hover:bg-blue-400 text-white">
                                            Register
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </nav>

            {/* ── HERO ─────────────────────────────────────────────────────── */}
            <section
                id="hero"
                className="relative min-h-screen flex items-center overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 45%, #0f172a 100%)' }}
            >
                {/* Background decoration */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute -top-64 -right-64 w-[600px] h-[600px] rounded-full bg-blue-500/15 blur-3xl" />
                    <div className="absolute -bottom-64 -left-64 w-[500px] h-[500px] rounded-full bg-indigo-700/20 blur-3xl" />
                    <div className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl" />
                    {/* Subtle grid */}
                    <div
                        className="absolute inset-0 opacity-[0.04]"
                        style={{
                            backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px),
                                              linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`,
                            backgroundSize: '64px 64px',
                        }}
                    />
                    {/* Floating circles */}
                    <div className="absolute top-20 right-[20%] w-4 h-4 rounded-full bg-blue-400/30 animate-pulse" />
                    <div className="absolute bottom-32 left-[15%] w-6 h-6 rounded-full bg-indigo-400/20 animate-pulse" style={{ animationDelay: '1s' }} />
                    <div className="absolute top-1/2 right-[8%] w-3 h-3 rounded-full bg-cyan-400/25 animate-pulse" style={{ animationDelay: '2s' }} />
                </div>

                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16 grid lg:grid-cols-2 gap-16 items-center">
                    {/* Text content */}
                    <div className="text-white space-y-8">
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 text-sm text-blue-200 backdrop-blur-sm">
                            <Zap className="h-3.5 w-3.5 text-yellow-400" />
                            Same-day delivery available in Cavite
                        </div>

                        {/* Headline */}
                        <div>
                            <h1 className="text-5xl sm:text-6xl lg:text-[4rem] font-extrabold leading-[1.1] tracking-tight">
                                Your Trusted{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-cyan-300 to-blue-200">
                                    LPG Delivery
                                </span>{' '}
                                Partner in Cavite
                            </h1>
                        </div>

                        <p className="text-lg sm:text-xl text-blue-100/90 leading-relaxed max-w-lg">
                            Fast, reliable LPG delivery right to your doorstep. Order online and track your delivery in real-time.
                        </p>

                        {/* CTA buttons */}
                        <div className="flex flex-wrap gap-4">
                            <Link href="/register">
                                <Button
                                    size="lg"
                                    className="bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-2xl shadow-blue-950/50 px-8 text-base"
                                >
                                    Order Now
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                            <Button
                                size="lg"
                                variant="outline"
                                onClick={() => scrollTo('about')}
                                className="border-white/40 text-white hover:bg-white/10 bg-transparent text-base"
                            >
                                Learn More
                                <ChevronDown className="ml-2 h-5 w-5" />
                            </Button>
                        </div>

                        {/* Trust indicators */}
                        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
                            {[
                                'DOE Registered',
                                'LPG Safety Certified',
                                '5,000+ Happy Customers',
                            ].map((t) => (
                                <div key={t} className="flex items-center gap-2 text-sm text-blue-200">
                                    <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                                    {t}
                                </div>
                            ))}
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-3 gap-6 pt-4 border-t border-white/10">
                            {[
                                { num: '5K+',  label: 'Deliveries' },
                                { num: '9',    label: 'Cities Served' },
                                { num: '100%', label: 'Safe & Legal' },
                            ].map(({ num, label }) => (
                                <div key={label}>
                                    <p className="text-3xl font-extrabold text-white">{num}</p>
                                    <p className="text-xs text-blue-300 mt-0.5">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Illustration */}
                    <div className="hidden lg:flex items-center justify-center">
                        <div className="relative">
                            {/* Glow */}
                            <div className="absolute inset-0 scale-150 bg-blue-500/20 blur-3xl rounded-full" />

                            {/* Spinning ring (outer) */}
                            <div
                                className="absolute inset-0 -m-12 border border-blue-400/20 rounded-full animate-spin"
                                style={{ animationDuration: '20s' }}
                            />
                            {/* Spinning ring (inner) */}
                            <div
                                className="absolute inset-0 -m-4 border border-indigo-400/15 rounded-full animate-spin"
                                style={{ animationDuration: '12s', animationDirection: 'reverse' }}
                            />

                            {/* Main cylinder */}
                            <div className="relative w-56 h-72">
                                <LpgCylinder className="w-full h-full drop-shadow-2xl" />
                            </div>

                            {/* Flame */}
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2">
                                <Flame
                                    className="h-14 w-14 text-orange-400 animate-pulse"
                                    style={{ filter: 'drop-shadow(0 0 16px rgba(251,146,60,0.9))' }}
                                />
                            </div>

                            {/* Delivery badge */}
                            <div className="absolute top-1/3 -left-20 bg-blue-600 text-white rounded-2xl shadow-xl px-4 py-3 border border-blue-500">
                                <Truck className="h-5 w-5 mx-auto mb-1" />
                                <p className="text-xs font-bold text-center whitespace-nowrap">Fast Delivery</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Scroll cue */}
                <button
                    onClick={() => scrollTo('about')}
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-white/50 hover:text-white/80 transition-colors animate-bounce"
                >
                    <span className="text-[10px] tracking-[0.2em] uppercase font-medium">Scroll</span>
                    <ChevronDown className="h-5 w-5" />
                </button>
            </section>

            {/* ── ABOUT ────────────────────────────────────────────────────── */}
            <section id="about" className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-3xl mx-auto mb-16">
                        <SectionLabel>About Us</SectionLabel>
                        <SectionTitle>Serving Cavite with Excellence</SectionTitle>
                        <p className="mt-5 text-lg text-slate-600 leading-relaxed">
                            We are a leading LPG distributor serving households, commercial establishments, and industrial
                            clients across Cavite. With years of experience in the industry, we provide safe, efficient,
                            and timely LPG delivery services backed by modern technology.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-8">
                        {[
                            {
                                icon: Shield,
                                title: 'Safe & Certified',
                                desc: 'All our products meet Philippine DOE safety standards and are handled by trained, certified professionals.',
                                accent: 'text-blue-600',
                                bg: 'bg-blue-50',
                                border: 'border-blue-100',
                            },
                            {
                                icon: Truck,
                                title: 'Fast Delivery',
                                desc: 'Same-day delivery available across all cities and municipalities in Cavite province — from Imus to Silang.',
                                accent: 'text-emerald-600',
                                bg: 'bg-emerald-50',
                                border: 'border-emerald-100',
                            },
                            {
                                icon: PhilippinePeso,
                                title: 'Fair Pricing',
                                desc: 'Transparent, competitive prices with absolutely no hidden charges. What you see is what you pay.',
                                accent: 'text-violet-600',
                                bg: 'bg-violet-50',
                                border: 'border-violet-100',
                            },
                        ].map(({ icon: Icon, title, desc, accent, bg, border }) => (
                            <div
                                key={title}
                                className={`group bg-white border ${border} rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5`}
                            >
                                <div className={`w-14 h-14 ${bg} rounded-xl flex items-center justify-center mb-6`}>
                                    <Icon className={`h-7 w-7 ${accent}`} />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
                                <p className="text-slate-600 leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── PRODUCTS ─────────────────────────────────────────────────── */}
            <section id="products" className="py-24 bg-slate-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <SectionLabel>Our Products</SectionLabel>
                        <SectionTitle>Quality LPG for Every Need</SectionTitle>
                        <p className="mt-4 text-slate-600">
                            Choose from our wide selection of LPG products for homes, restaurants, and industrial use.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {displayProducts.map((product) => (
                            <div
                                key={product.id}
                                className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 overflow-hidden flex flex-col"
                            >
                                {/* Card header */}
                                <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 flex items-start justify-between">
                                    <div className="flex-1 min-w-0 pr-3">
                                        <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest">
                                            {product.brand ?? 'LPG'}
                                        </p>
                                        <h3 className="text-white font-bold text-lg mt-1 leading-snug">
                                            {product.name}
                                        </h3>
                                        <p className="text-blue-200 text-sm mt-1">
                                            {Number(product.weight_kg)} kg cylinder
                                        </p>
                                    </div>
                                    <div className="w-14 h-16 shrink-0 opacity-90 drop-shadow-lg">
                                        <MiniCylinder gradId={`grad-${product.id}`} />
                                    </div>
                                </div>

                                {/* Card body */}
                                <div className="p-6 flex flex-col flex-1">
                                    <div className="mb-5">
                                        <p className="text-xs text-slate-400 uppercase font-medium">Capacity</p>
                                        <p className="font-bold text-slate-800 text-lg">{Number(product.weight_kg)} kg</p>
                                    </div>

                                    <div className="mt-auto">
                                        <Link href="/register">
                                            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold group-hover:shadow-lg group-hover:shadow-blue-200 transition-shadow">
                                                View Details
                                                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="text-center mt-10 text-sm text-slate-500">
                        Contact us for pricing and availability. Refill rates may vary per product.
                    </p>
                </div>
            </section>

            {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
            <section id="how-it-works" className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <SectionLabel>How It Works</SectionLabel>
                        <SectionTitle>Order in 4 Simple Steps</SectionTitle>
                        <p className="mt-4 text-slate-600">
                            Getting your LPG refill has never been easier. Order from anywhere, anytime.
                        </p>
                    </div>

                    <div className="relative">
                        {/* Connecting dashed line (desktop) */}
                        <div
                            className="hidden lg:block absolute h-0.5 bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200"
                            style={{ top: '2.6rem', left: '12.5%', right: '12.5%' }}
                        />

                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
                            {[
                                {
                                    step: 1,
                                    icon: UserPlus,
                                    title: 'Create Account',
                                    desc: 'Register for free in under a minute. No complicated paperwork.',
                                    bg: 'bg-blue-600',
                                    shadow: 'shadow-blue-200',
                                },
                                {
                                    step: 2,
                                    icon: ShoppingCart,
                                    title: 'Place Your Order',
                                    desc: 'Browse our products and place your order online with ease.',
                                    bg: 'bg-indigo-600',
                                    shadow: 'shadow-indigo-200',
                                },
                                {
                                    step: 3,
                                    icon: Truck,
                                    title: 'We Deliver',
                                    desc: 'Our trained rider picks up and delivers straight to your door.',
                                    bg: 'bg-violet-600',
                                    shadow: 'shadow-violet-200',
                                },
                                {
                                    step: 4,
                                    icon: MapPin,
                                    title: 'Track & Pay',
                                    desc: 'Track your delivery in real-time. Pay on delivery or via e-wallet.',
                                    bg: 'bg-blue-700',
                                    shadow: 'shadow-blue-200',
                                },
                            ].map(({ step, icon: Icon, title, desc, bg, shadow }) => (
                                <div key={step} className="flex flex-col items-center text-center group">
                                    {/* Icon circle */}
                                    <div className={`relative w-20 h-20 ${bg} rounded-full flex items-center justify-center shadow-xl ${shadow} group-hover:scale-110 transition-transform duration-300`}>
                                        <Icon className="h-9 w-9 text-white" />
                                        {/* Step number badge */}
                                        <span className="absolute -top-2 -right-2 w-7 h-7 bg-white border-2 border-slate-100 rounded-full flex items-center justify-center text-xs font-extrabold text-slate-700 shadow-sm">
                                            {step}
                                        </span>
                                    </div>
                                    <h3 className="mt-6 text-lg font-bold text-slate-900">{title}</h3>
                                    <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-[200px]">{desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="text-center mt-14">
                        <Link href="/register">
                            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-10 font-semibold shadow-lg shadow-blue-200">
                                Get Started Today
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── CONTACT ──────────────────────────────────────────────────── */}
            <section id="contact" className="py-24 bg-slate-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <SectionLabel>Contact Us</SectionLabel>
                        <SectionTitle>Get in Touch</SectionTitle>
                        <p className="mt-4 text-slate-600">
                            Have questions? We're here to help. Reach out and we'll get back to you quickly.
                        </p>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-10 items-start">
                        {/* Info panel */}
                        <div className="space-y-6">
                            <div className="bg-gradient-to-br from-blue-600 to-indigo-800 rounded-2xl p-8 text-white space-y-6">
                                <h3 className="text-xl font-bold">Contact Information</h3>
                                {[
                                    { icon: Phone,  label: 'Phone',          value: '0917-123-4567' },
                                    { icon: Mail,   label: 'Email',          value: 'info@lpgcavite.com' },
                                    { icon: MapPin, label: 'Address',        value: 'Blk 5 Lot 12 Kamagong St., Alapan II-A, Imus, Cavite 4103' },
                                    { icon: Clock,  label: 'Business Hours', value: 'Monday – Saturday, 7:00 AM – 6:00 PM' },
                                ].map(({ icon: Icon, label, value }) => (
                                    <div key={label} className="flex gap-4">
                                        <div className="w-10 h-10 bg-white/15 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider">{label}</p>
                                            <p className="text-white mt-0.5 leading-snug">{value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Service areas */}
                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-blue-600" />
                                    Service Areas in Cavite
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {['Imus', 'Bacoor', 'Dasmariñas', 'Cavite City', 'General Trias', 'Rosario', 'Noveleta', 'Tanza', 'Silang'].map((city) => (
                                        <span
                                            key={city}
                                            className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                                        >
                                            {city}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Contact form */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
                            {formSent ? (
                                <div className="flex flex-col items-center justify-center py-14 text-center">
                                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-5">
                                        <CheckCircle className="h-10 w-10 text-emerald-600" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900">Message Sent!</h3>
                                    <p className="mt-2 text-slate-600 max-w-xs">
                                        Thank you for reaching out. We'll get back to you within 24 hours.
                                    </p>
                                </div>
                            ) : (
                                <form onSubmit={handleFormSubmit} className="space-y-5">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                            Full Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={form.name}
                                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                                            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                                            placeholder="Juan Dela Cruz"
                                        />
                                    </div>
                                    <div className="grid sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                                Email <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="email"
                                                required
                                                value={form.email}
                                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                                                placeholder="juan@email.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                                            <input
                                                type="tel"
                                                value={form.phone}
                                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                                                placeholder="0917-XXX-XXXX"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                            Message <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            required
                                            rows={5}
                                            value={form.message}
                                            onChange={(e) => setForm({ ...form, message: e.target.value })}
                                            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                                            placeholder="How can we help you? What product are you interested in?"
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        size="lg"
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
                                    >
                                        Send Message
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── FOOTER ───────────────────────────────────────────────────── */}
            <footer className="bg-slate-900 text-slate-400">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
                    <div className="grid sm:grid-cols-3 gap-12 pb-12 border-b border-slate-800">
                        {/* Company */}
                        <div>
                            <div className="flex items-center gap-2.5 mb-4">
                                <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                                    <Flame className="h-5 w-5 text-white" />
                                </div>
                                <span className="font-bold text-white">
                                    LPG Distribution <span className="text-blue-400">Cavite</span>
                                </span>
                            </div>
                            <p className="text-sm leading-relaxed text-slate-500">
                                Your trusted LPG partner serving Cavite province with safe, reliable, and affordable delivery services backed by modern technology.
                            </p>
                        </div>

                        {/* Quick links */}
                        <div>
                            <h3 className="text-white font-semibold mb-5">Quick Links</h3>
                            <ul className="space-y-2.5 text-sm">
                                {navLinks.map(({ label, id }) => (
                                    <li key={id}>
                                        <button
                                            onClick={() => scrollTo(id)}
                                            className="hover:text-blue-400 transition-colors"
                                        >
                                            {label}
                                        </button>
                                    </li>
                                ))}
                                <li><Link href="/login" className="hover:text-blue-400 transition-colors">Login</Link></li>
                                <li><Link href="/register" className="hover:text-blue-400 transition-colors">Register</Link></li>
                            </ul>
                        </div>

                        {/* Contact */}
                        <div>
                            <h3 className="text-white font-semibold mb-5">Contact Info</h3>
                            <ul className="space-y-3.5 text-sm">
                                <li className="flex items-start gap-3">
                                    <Phone className="h-4 w-4 mt-0.5 text-blue-400 shrink-0" />
                                    <span>0917-123-4567</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <Mail className="h-4 w-4 mt-0.5 text-blue-400 shrink-0" />
                                    <span>info@lpgcavite.com</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <MapPin className="h-4 w-4 mt-0.5 text-blue-400 shrink-0" />
                                    <span>Blk 5 Lot 12 Kamagong St.,<br />Alapan II-A, Imus, Cavite 4103</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <Clock className="h-4 w-4 mt-0.5 text-blue-400 shrink-0" />
                                    <span>Mon – Sat, 7:00 AM – 6:00 PM</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-600">
                        <p>© 2026 LPG Distribution Cavite. All rights reserved.</p>
                        <p className="text-xs">Powered by LPG Management System v1.0</p>
                    </div>
                </div>
            </footer>
        </>
    );
}
