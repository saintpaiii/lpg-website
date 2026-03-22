import { useMemo } from 'react';

interface Props {
    password: string;
}

const REQUIREMENTS = [
    { label: 'At least 8 characters',          test: (p: string) => p.length >= 8 },
    { label: 'Uppercase letter (A–Z)',          test: (p: string) => /[A-Z]/.test(p) },
    { label: 'Lowercase letter (a–z)',          test: (p: string) => /[a-z]/.test(p) },
    { label: 'Number (0–9)',                    test: (p: string) => /\d/.test(p) },
    { label: 'Special character (!@#$%^&*_-)', test: (p: string) => /[!@#$%^&*_\-]/.test(p) },
];

export function PasswordStrengthIndicator({ password }: Props) {
    const met = useMemo(() => REQUIREMENTS.filter((r) => r.test(password)).length, [password]);

    if (!password) return null;

    const strength = met <= 2 ? 'Weak' : met <= 4 ? 'Medium' : 'Strong';

    return (
        <div className="mt-1.5 space-y-2">
            <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden dark:bg-gray-700">
                    <div
                        className={`h-full rounded-full transition-all duration-300 ${
                            strength === 'Weak'   ? 'w-1/3 bg-red-500' :
                            strength === 'Medium' ? 'w-2/3 bg-orange-400' :
                                                    'w-full bg-green-500'
                        }`}
                    />
                </div>
                <span className={`text-xs font-semibold w-12 ${
                    strength === 'Weak'   ? 'text-red-500' :
                    strength === 'Medium' ? 'text-orange-500' :
                                           'text-green-600'
                }`}>
                    {strength}
                </span>
            </div>
            <ul className="grid grid-cols-1 gap-y-0.5 sm:grid-cols-2">
                {REQUIREMENTS.map((req) => {
                    const passed = req.test(password);
                    return (
                        <li key={req.label} className={`flex items-center gap-1.5 text-xs ${passed ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${passed ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                            {req.label}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
