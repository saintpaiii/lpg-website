<?php

namespace App\Http\Middleware;

use App\Services\SectionVisitService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Records when a user last opened a sidebar section (badges + "New" / "Updated" row highlights).
 *
 *  - Full page visit (list or detail): the previous visit is kept on the request for the controller's row
 *    flags, then the section is marked seen BEFORE the page renders — so the badge in that response is gone.
 *    Paging / filtering the same list keeps the original "since" so highlights don't vanish.
 *  - The user's own change (POST / PATCH / DELETE): the section — and the sections that change with it —
 *    are marked seen afterwards, so their own actions never show up as "updated".
 *  - Prefetches, partial reloads and JSON polls are not visits.
 */
class TrackSectionVisit
{
    /**
     * Route name => [section shown, sections the user's own changes touch]. Matched on the exact name
     * or "name.*"; the first match wins (more specific names first).
     */
    private const SECTIONS = [
        // Customer portal (keys without a prefix — existing rows)
        'customer.orders.refund'      => ['orders', ['orders', 'refunds']],
        'customer.orders'             => ['orders', ['orders']],
        'customer.checkout.store'     => [null, ['orders']],
        'customer.refunds'            => ['refunds', ['refunds']],
        'customer.invoices'           => ['invoices', ['invoices']],
        // Seller portal
        'seller.orders'               => ['seller.orders', ['seller.orders', 'seller.deliveries']],
        'seller.deliveries'           => ['seller.deliveries', ['seller.deliveries', 'seller.orders']],
        'seller.refunds'              => ['seller.refunds', ['seller.refunds', 'seller.orders', 'seller.deliveries']],
        'seller.customer-reports'     => ['seller.customer_reports', ['seller.customer_reports']],
        'seller.staff-documents'      => [null, ['seller.staff']],
        'seller.staff'                => ['seller.staff', ['seller.staff']],
        'seller.documents'            => ['seller.store_documents', ['seller.store_documents']],
        // Rider
        'rider.deliveries'            => ['rider.deliveries', ['rider.deliveries']],
        'rider.history'               => ['rider.deliveries', []],
        'rider.documents'             => ['rider.documents', ['rider.documents']],
        // Platform admin / staff
        'admin.verifications'         => ['admin.verifications', ['admin.verifications', 'admin.stores']],
        'admin.store-documents'       => ['admin.store_documents', ['admin.store_documents']],
        'admin.refunds'               => ['admin.refunds', ['admin.refunds']],
        'admin.stores'                => ['admin.stores', ['admin.stores', 'admin.verifications']],
        'admin.user-reports'          => ['admin.user_reports', ['admin.user_reports']],
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $name = $request->route()?->getName();
        $match = $user && $name ? static::match($name) : null;

        if (! $match) {
            return $next($request);
        }
        [$section, $touches] = $match;

        if ($request->isMethod('GET')) {
            if ($section && static::isPageVisit($request)) {
                $request->attributes->set(SectionVisitService::SINCE_ATTRIBUTE, $this->sinceFor($request, $section));
                SectionVisitService::touch($user, $section);
            }

            return $next($request);
        }

        $response = $next($request);
        if ($response->getStatusCode() < 400) {
            SectionVisitService::touch($user, ...$touches);
            // The redirect back reloads the list: don't flag the row the user just changed (rows already
            // highlighted on screen stay highlighted client-side until they leave the page)
            foreach ($touches as $s) {
                if ($request->hasSession() && $request->session()->has("section_since.{$s}")) {
                    $request->session()->put("section_since.{$s}", now());
                }
            }
        }

        return $response;
    }

    /** @return array{0: ?string, 1: string[]}|null */
    public static function match(string $routeName): ?array
    {
        foreach (self::SECTIONS as $prefix => $entry) {
            if ($routeName === $prefix || str_starts_with($routeName, $prefix.'.')) {
                return $entry;
            }
        }

        return null;
    }

    private static function isPageVisit(Request $request): bool
    {
        if ($request->header('Purpose') === 'prefetch' || $request->header('X-Inertia-Partial-Data') !== null) {
            return false;
        }

        return $request->header('X-Inertia') !== null || ! $request->expectsJson();
    }

    /** Paging / filtering the same list keeps the "since" of the first load. */
    private function sinceFor(Request $request, string $section)
    {
        $key = "section_since.{$section}";
        $referer = $request->headers->get('referer');
        $samePage = $referer && parse_url($referer, PHP_URL_PATH) === '/'.ltrim($request->path(), '/');

        if ($samePage && $request->session()->has($key)) {
            return $request->session()->get($key);
        }
        $since = SectionVisitService::lastVisit($request->user(), $section);
        $request->session()->put($key, $since);

        return $since;
    }
}
