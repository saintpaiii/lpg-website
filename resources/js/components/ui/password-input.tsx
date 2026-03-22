import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Input>, 'type'>;

const PasswordInput = forwardRef<HTMLInputElement, Props>(({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
        <div className="relative">
            <Input
                {...props}
                ref={ref}
                type={visible ? 'text' : 'password'}
                className={className}
                style={{ paddingRight: '2.5rem' }}
            />
            <button
                type="button"
                tabIndex={-1}
                onClick={() => setVisible((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label={visible ? 'Hide password' : 'Show password'}
            >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
    );
});

PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
