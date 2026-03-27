interface StarRatingProps {
    value: number;         // 0–5, can be decimal
    count?: number;        // total number of reviews
    size?: 'xs' | 'sm';
}

/**
 * Displays a row of 5 filled/unfilled star characters with optional review count.
 * When count === 0 (and count is provided) shows "No reviews yet".
 */
export function StarRating({ value, count, size = 'sm' }: StarRatingProps) {
    if (typeof count !== 'undefined' && count === 0) {
        return (
            <div className="flex items-center gap-1">
                <span className="flex leading-none">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <span key={i} className={`${size === 'xs' ? 'text-[11px]' : 'text-sm'} text-gray-300`}>★</span>
                    ))}
                </span>
                <span className={`${size === 'xs' ? 'text-[10px]' : 'text-xs'} text-gray-400 italic`}>No reviews yet</span>
            </div>
        );
    }

    const filled   = Math.round(value); // round to nearest integer for star fill
    const textCls  = size === 'xs' ? 'text-[10px]' : 'text-xs';

    return (
        <div className="flex items-center gap-1">
            <span className="flex leading-none">
                {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className={`${size === 'xs' ? 'text-[11px]' : 'text-sm'} ${i <= filled ? 'text-amber-400' : 'text-gray-300'}`}>
                        ★
                    </span>
                ))}
            </span>
            {value > 0 && (
                <span className={`${textCls} text-gray-600 tabular-nums`}>{value.toFixed(1)}</span>
            )}
            {typeof count !== 'undefined' && (
                <span className={`${textCls} text-gray-400`}>
                    ({count})
                </span>
            )}
        </div>
    );
}
