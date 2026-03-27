import { Head, router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { Flame, Loader2, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFlashToast } from '@/hooks/use-flash-toast';

type Props = {
    email: string;
    resend_available: number; // seconds until resend is available (0 = available now)
    code_expires_in: number;  // seconds until current OTP expires
};

export default function VerifyOtp({ email, resend_available, code_expires_in }: Props) {
    useFlashToast();

    // 6 individual digit refs
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
    const [submitting, setSubmitting] = useState(false);
    const [resending, setResending] = useState(false);

    // Countdown timer for resend
    const [countdown, setCountdown] = useState(resend_available > 0 ? resend_available : 0);

    useEffect(() => {
        if (countdown <= 0) return;
        const timer = setInterval(() => {
            setCountdown((c) => {
                if (c <= 1) { clearInterval(timer); return 0; }
                return c - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [countdown]);

    // OTP expiry countdown
    const [otpCountdown, setOtpCountdown] = useState(code_expires_in > 0 ? code_expires_in : 0);
    const otpExpired = otpCountdown <= 0;

    useEffect(() => {
        if (otpCountdown <= 0) return;
        const timer = setInterval(() => {
            setOtpCountdown((c) => {
                if (c <= 1) { clearInterval(timer); return 0; }
                return c - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [otpCountdown]);

    // Focus first input on mount
    useEffect(() => {
        inputRefs.current[0]?.focus();
    }, []);

    // Collect errors from Inertia
    const { errors } = usePage<{ errors: Record<string, string> }>().props;

    function handleChange(index: number, value: string) {
        // Accept only digits; take the last typed char
        const digit = value.replace(/\D/g, '').slice(-1);
        const next = [...digits];
        next[index] = digit;
        setDigits(next);

        // Move focus forward
        if (digit && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all 6 digits entered
        if (next.every((d) => d !== '') && next.join('').length === 6) {
            submitCode(next.join(''));
        }
    }

    function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Backspace') {
            if (digits[index] === '' && index > 0) {
                const next = [...digits];
                next[index - 1] = '';
                setDigits(next);
                inputRefs.current[index - 1]?.focus();
            } else {
                const next = [...digits];
                next[index] = '';
                setDigits(next);
            }
        } else if (e.key === 'ArrowLeft' && index > 0) {
            inputRefs.current[index - 1]?.focus();
        } else if (e.key === 'ArrowRight' && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
    }

    function handlePaste(e: React.ClipboardEvent) {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (!pasted) return;
        const next = [...digits];
        pasted.split('').forEach((ch, i) => { if (i < 6) next[i] = ch; });
        setDigits(next);

        const focusIdx = Math.min(pasted.length, 5);
        inputRefs.current[focusIdx]?.focus();

        if (pasted.length === 6) {
            submitCode(pasted);
        }
    }

    function submitCode(code: string) {
        if (submitting) return;
        setSubmitting(true);
        router.post('/verify-otp', { code }, {
            onError: () => setSubmitting(false),
            onSuccess: () => setSubmitting(false),
        });
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const code = digits.join('');
        if (code.length < 6) {
            toast.error('Please enter all 6 digits.');
            return;
        }
        submitCode(code);
    }

    function handleResend() {
        if (countdown > 0 || resending) return;
        setResending(true);
        router.post('/verify-otp/resend', {}, {
            onSuccess: () => {
                setResending(false);
                setCountdown(60);
                setOtpCountdown(60); // reset OTP expiry timer for the new code
                // Clear digits and refocus
                setDigits(['', '', '', '', '', '']);
                setTimeout(() => inputRefs.current[0]?.focus(), 50);
            },
            onError: () => setResending(false),
        });
    }

    const codeError = errors?.code;
    const resendError = errors?.resend;

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 px-4">
            <Head title="Verify Your Email" />

            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="flex justify-center mb-8">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 shadow-lg">
                            <Flame className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <p className="font-bold text-lg text-slate-800 dark:text-white leading-tight">LPG Management</p>
                            <p className="text-xs text-blue-600 font-medium">Cavite</p>
                        </div>
                    </div>
                </div>

                <Card className="shadow-xl border-0 dark:bg-gray-900">
                    <CardContent className="pt-8 pb-8 px-8">
                        {/* Header */}
                        <div className="text-center mb-8">
                            <div className="flex justify-center mb-3">
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                                    <ShieldCheck className="h-7 w-7 text-blue-600" />
                                </div>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Verify your email</h1>
                            <div className="flex items-center justify-center gap-1.5 mt-2">
                                <Mail className="h-4 w-4 text-gray-400" />
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    We sent a 6-digit code to <span className="font-semibold text-gray-700 dark:text-gray-300">{email}</span>
                                </p>
                            </div>
                        </div>

                        {/* OTP Input */}
                        <form onSubmit={handleSubmit}>
                            <div className="flex justify-center gap-2.5 mb-2" onPaste={handlePaste}>
                                {digits.map((digit, i) => (
                                    <input
                                        key={i}
                                        ref={(el) => { inputRefs.current[i] = el; }}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleChange(i, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(i, e)}
                                        disabled={submitting}
                                        className={`w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-all outline-none
                                            ${codeError
                                                ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-500 dark:text-red-400'
                                                : digit
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:border-blue-400 dark:text-blue-300'
                                                    : 'border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white'
                                            }
                                            focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800
                                            disabled:opacity-50`}
                                    />
                                ))}
                            </div>

                            {/* Error */}
                            {codeError && (
                                <p className="text-center text-sm text-red-600 dark:text-red-400 mb-4 mt-2">
                                    {codeError}
                                </p>
                            )}
                            {resendError && (
                                <p className="text-center text-sm text-amber-600 dark:text-amber-400 mb-4 mt-2">
                                    {resendError}
                                </p>
                            )}

                            <div className="mt-6">
                                <Button
                                    type="submit"
                                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                                    disabled={submitting || digits.join('').length < 6 || otpExpired}
                                >
                                    {submitting
                                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying…</>
                                        : 'Verify Email'
                                    }
                                </Button>
                            </div>
                        </form>

                        {/* Resend */}
                        <div className="mt-5 text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Didn't receive the code?{' '}
                                {countdown > 0 ? (
                                    <span className="text-gray-400 dark:text-gray-500">
                                        Resend in <span className="font-medium tabular-nums">{countdown}s</span>
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleResend}
                                        disabled={resending}
                                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium transition-colors disabled:opacity-50"
                                    >
                                        {resending
                                            ? <><Loader2 className="h-3 w-3 animate-spin" />Sending…</>
                                            : <><RefreshCw className="h-3 w-3" />Resend Code</>
                                        }
                                    </button>
                                )}
                            </p>
                        </div>

                                        {otpExpired ? (
                            <p className="mt-5 text-center text-sm font-medium text-red-500 dark:text-red-400">
                                Code expired. Click Resend to get a new one.
                            </p>
                        ) : (
                            <p className="mt-5 text-center text-xs text-gray-400 dark:text-gray-500">
                                Code expires in{' '}
                                <span className="font-medium tabular-nums text-gray-500 dark:text-gray-400">
                                    {Math.floor(otpCountdown / 60)}:{String(otpCountdown % 60).padStart(2, '0')}
                                </span>
                                . Check your spam folder if you don&apos;t see it.
                            </p>
                        )}

                        <p className="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
                            Wrong email?{' '}
                            <button
                                type="button"
                                onClick={() => router.post('/logout')}
                                className="text-blue-500 hover:text-blue-600 transition-colors"
                            >
                                Log out
                            </button>
                            {' '}and register again
                        </p>
                    </CardContent>
                </Card>
            </div>
            <Toaster richColors position="top-right" />
        </div>
    );
}
