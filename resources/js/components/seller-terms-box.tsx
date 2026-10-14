import { ExternalLink, ScrollText } from 'lucide-react';

export type SellerTerms = { id: number; title: string; version: number; html: string } | null;

/** The current Seller Terms (from Terms & Policies) in a scroll box — used on both seller application forms. */
export default function SellerTermsBox({ terms }: { terms: SellerTerms }) {
    return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                    <ScrollText className="h-4 w-4 text-blue-600" />
                    {terms ? `Seller Terms (version ${terms.version})` : 'Seller Terms'}
                </span>
                <a href="/seller-terms" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                    Open full page <ExternalLink className="h-3 w-3" />
                </a>
            </div>
            <div className="max-h-80 overflow-y-auto p-4">
                {terms
                    ? <div className="legal-content text-sm" dangerouslySetInnerHTML={{ __html: terms.html }} />
                    : <p className="text-sm text-gray-600 dark:text-gray-400">Seller Terms are not available yet.</p>}
            </div>
        </div>
    );
}
