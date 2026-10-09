<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\CustomerLoyalty;
use App\Models\StoreLoyaltySettings;
use App\Models\UserReport;
use App\Services\ChatService;
use App\Services\ReportService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Store side of reports ("Customer Reports"): reports customers / riders filed for this store to
 * handle, and reports this store filed about customers. Behind permission:customer_reports.manage.
 */
class UserReportController extends Controller
{
    private const TABS = ['needs_reply', 'in_progress', 'waiting_customer', 'with_admin', 'closed', 'filed'];

    /** File a report about the customer of one of this store's orders (customer is taken from the order). */
    public function store(Request $request): RedirectResponse
    {
        $report = ReportService::create($request->user(), 'store', $request->only('order_id', 'category', 'subject', 'description', 'product_id'),
            $request->file('evidence', []));

        return redirect(ReportService::linkFor($report, 'seller'))->with('success', 'Your report was sent to the platform admin.');
    }

    public function index(Request $request): Response
    {
        $user    = $request->user();
        $storeId = $this->storeId($request);
        $tab     = in_array($request->get('tab'), self::TABS, true) ? $request->get('tab') : 'needs_reply';
        $search  = trim((string) $request->get('search', ''));

        $list = $this->tabQuery($storeId, $tab)
            ->with(['reporter', 'reportedStore', 'order', 'reportedRider', 'reportedCustomer', 'reportedProduct'])
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->whereHas('order', fn ($o) => $o->where('order_number', 'like', "%{$search}%"))
                ->orWhereHas('reportedCustomer', fn ($c) => $c->where('name', 'like', "%{$search}%"))
                ->orWhereHas('reporter', fn ($u) => $u->where('name', 'like', "%{$search}%"))))
            // Urgent open reports pinned to the top
            ->orderByRaw("(is_urgent = 1 AND status NOT IN ('resolved','dismissed')) DESC")
            ->orderByDesc('last_activity_at')->orderByDesc('id')
            ->paginate(20)->withQueryString()
            ->through(fn (UserReport $r) => ReportService::presentListItem($r, $user, 'seller'));

        return Inertia::render('seller/customer-reports', [
            'reports' => $list,
            'tab'     => $tab,
            'search'  => $search,
            'counts'  => collect(self::TABS)->mapWithKeys(fn ($t) => [$t => $this->tabQuery($storeId, $t)->count()]),
            // Valid complaints + false reports filed by this store, last 90 days (no automatic suspension)
            'storeWarnings' => ReportService::storeWarnings($storeId),
        ]);
    }

    public function show(Request $request, UserReport $userReport): Response
    {
        $this->authorizeView($request, $userReport);
        $userReport->load(['reportedCustomer', 'order.customer']);
        $customer = $userReport->reportedCustomer ?? ($userReport->reporter_side === 'customer' ? $userReport->order?->customer : null);

        $loyalty = null;
        if ($customer?->user_id && StoreLoyaltySettings::where('store_id', $userReport->reported_store_id)->value('is_enabled')) {
            $l = CustomerLoyalty::where('user_id', $customer->user_id)->where('store_id', $userReport->reported_store_id)->first();
            $loyalty = $l ? ['tier' => $l->tier, 'trust_score' => (float) $l->trust_score] : null;
        }

        return Inertia::render('seller/customer-report-show', [
            'report'   => ReportService::present($userReport, $request->user(), 'seller'),
            'customer' => $customer ? ['name' => $customer->name, 'phone' => $customer->phone] : null,
            'loyalty'  => $loyalty,
        ]);
    }

    public function reply(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->authorizeView($request, $userReport);
        ReportService::reply($userReport, $request->user(), $request->input('body'), $request->file('images', []));

        return back()->with('success', 'Reply sent.');
    }

    public function startReview(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->authorizeView($request, $userReport);
        ReportService::startReview($userReport, $request->user());

        return back()->with('success', 'Status changed to Under Review.');
    }

    public function startInvestigating(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->authorizeView($request, $userReport);
        ReportService::startInvestigating($userReport, $request->user(), $request->input('note'));

        return back()->with('success', 'Status changed to Investigating.');
    }

    public function proposeResolution(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->authorizeView($request, $userReport);
        ReportService::proposeResolution($userReport, $request->user(), $request->input('note'), $request->file('photos', []));

        return back()->with('success', 'Resolution sent. We asked the customer to confirm.');
    }

    public function withdraw(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->authorizeView($request, $userReport);
        ReportService::withdraw($userReport, $request->user());

        return back()->with('success', 'Report withdrawn.');
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private function storeId(Request $request): int
    {
        $storeId = ChatService::storeIdFor($request->user());
        abort_unless($storeId, 403);

        return $storeId;
    }

    /** Everything this store may see: store-handled reports, plus ones the store or its riders filed. */
    private function visible(int $storeId): Builder
    {
        return UserReport::where('reported_store_id', $storeId)
            ->where(fn ($q) => $q->whereIn('route', ['store', 'both'])->orWhereIn('reporter_side', ['store', 'rider']));
    }

    private function tabQuery(int $storeId, string $tab): Builder
    {
        $open = fn (Builder $q) => $q->whereNotIn('status', [UserReport::RESOLVED, UserReport::DISMISSED]);
        $handled = fn (Builder $q) => $q->whereIn('reporter_side', ['customer', 'rider'])->whereIn('route', ['store', 'both']);

        return match ($tab) {
            'needs_reply'      => ReportService::storeNeedsActionQuery($storeId),
            'in_progress'      => $handled($open($this->visible($storeId)))->whereIn('status', [UserReport::IN_PROGRESS, UserReport::INVESTIGATING])
                ->whereNull('escalated_at')->where(fn ($q) => $q->where('waiting_on', '!=', 'handler')->orWhereNull('waiting_on')),
            'waiting_customer' => $this->visible($storeId)->where('status', UserReport::AWAITING),
            'with_admin'       => $handled($open($this->visible($storeId)))->where(fn ($q) => $q->whereNotNull('escalated_at')->orWhere('route', 'both')),
            'closed'           => $this->visible($storeId)->whereIn('status', [UserReport::RESOLVED, UserReport::DISMISSED]),
            'filed'            => $this->visible($storeId)->whereIn('reporter_side', ['store', 'rider']),
        };
    }

    private function authorizeView(Request $request, UserReport $r): void
    {
        abort_unless(ReportService::canView($r, $request->user()), 403);
    }
}
