<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\UserReport;
use App\Services\ReportService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Platform admin "User Reports". The 'admin' route middleware also lets sellers/staff in (isStaff),
 * so EVERY action here checks isAdmin() itself.
 */
class UserReportController extends Controller
{
    private const TABS = ['needs_admin', 'urgent', 'escalated', 'store_no_reply', 'monitoring', 'website', 'open', 'closed', 'store_response'];

    public function index(Request $request): Response
    {
        $this->ensureAdmin($request);
        $user   = $request->user();
        $tab    = in_array($request->get('tab'), self::TABS, true) ? $request->get('tab') : 'needs_admin';
        $search = trim((string) $request->get('search', ''));

        $items = null;
        if ($tab === 'monitoring') {
            $items = ReportService::monitoringList()
                ->with(['reporter', 'reportedStore', 'order', 'reportedRider', 'reportedCustomer', 'reportedProduct'])
                ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                    ->where('subject', 'like', "%{$search}%")
                    ->orWhereHas('order', fn ($o) => $o->where('order_number', 'like', "%{$search}%"))
                    ->orWhereHas('reportedStore', fn ($s) => $s->where('store_name', 'like', "%{$search}%"))))
                ->orderByDesc('is_urgent')
                ->orderByRaw(ReportService::idleSinceSql() . ' ASC')
                ->paginate(20)->withQueryString()
                ->through(fn (UserReport $r) => ReportService::presentListItem($r, $user, 'admin') + [
                    'last_store_activity_at' => $r->last_store_activity_at ? \Illuminate\Support\Carbon::parse($r->last_store_activity_at)->toIso8601String() : null,
                    'idle_since'             => \Illuminate\Support\Carbon::parse($r->last_store_activity_at ?? $r->store_assigned_at ?? $r->created_at)->toIso8601String(),
                    'reminded_at'            => $r->store_reminded_at?->toIso8601String(),
                ]);
        } elseif ($tab !== 'store_response') {
            $items = $this->tabQuery($tab)
                ->with(['reporter', 'reportedStore', 'order', 'reportedRider', 'reportedCustomer', 'reportedProduct'])
                ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                    ->where('subject', 'like', "%{$search}%")
                    ->orWhereHas('reporter', fn ($u) => $u->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('order', fn ($o) => $o->where('order_number', 'like', "%{$search}%"))
                    ->orWhereHas('reportedStore', fn ($s) => $s->where('store_name', 'like', "%{$search}%"))))
                ->orderByRaw("(is_urgent = 1 AND status NOT IN ('resolved','dismissed')) DESC")
                ->orderByDesc('last_activity_at')->orderByDesc('id')
                ->paginate(20)->withQueryString()
                ->through(fn (UserReport $r) => ReportService::presentListItem($r, $user, 'admin'));
        }

        return Inertia::render('admin/user-reports', [
            'items'         => $items,
            'tab'           => $tab,
            'search'        => $search,
            'counts'        => collect(self::TABS)->reject(fn ($t) => $t === 'store_response')
                ->mapWithKeys(fn ($t) => [$t => $t === 'website'
                    ? $this->tabQuery($t)->whereNotIn('status', [UserReport::RESOLVED, UserReport::DISMISSED])->count()
                    : $this->tabQuery($t)->count()]),
            'storeResponse' => $tab === 'store_response' ? $this->storeResponse() : null,
            // Red dot on "Monitoring": some store hasn't done anything for 24+ hours
            'monitoringIdle' => ReportService::monitoringList()->whereRaw(ReportService::idleSinceSql() . ' <= ?', [now()->subHours(24)])->count(),
        ]);
    }

    public function show(Request $request, UserReport $userReport): Response
    {
        $this->ensureAdmin($request);

        return Inertia::render('admin/user-report-show', ['report' => ReportService::present($userReport, $request->user(), 'admin')]);
    }

    public function reply(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->ensureAdmin($request);
        $internal = $request->boolean('internal');
        ReportService::reply($userReport, $request->user(), $request->input('body'), $request->file('images', []), $internal);

        return back()->with('success', $internal ? 'Private note added.' : 'Reply sent.');
    }

    public function startReview(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->ensureAdmin($request);
        ReportService::startReview($userReport, $request->user());

        return back()->with('success', 'Status changed to Under Review.');
    }

    public function startInvestigating(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->ensureAdmin($request);
        ReportService::startInvestigating($userReport, $request->user(), $request->input('note'));

        return back()->with('success', 'Status changed to Investigating.');
    }

    public function proposeResolution(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->ensureAdmin($request);
        ReportService::proposeResolution($userReport, $request->user(), $request->input('note'), $request->file('photos', []));

        return back()->with('success', 'Resolution sent. We asked the reporter to confirm.');
    }

    public function remindStore(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->ensureAdmin($request);
        ReportService::remindStore($userReport, $request->user());

        return back()->with('success', 'The store was reminded.');
    }

    /** The only way an admin closes a report: outcome + reason (+ safety note for gas leaks). */
    public function close(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->ensureAdmin($request);
        ReportService::closeReport($userReport, $request->user(), $request->input('outcome'), $request->input('reason'), $request->input('safety_note'));

        return back()->with('success', 'Report closed.');
    }

    public function handToStore(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->ensureAdmin($request);
        ReportService::handToStore($userReport, $request->user());

        return back()->with('success', 'The report was sent to the store to fix.');
    }

    public function export(Request $request): StreamedResponse
    {
        $this->ensureAdmin($request);
        $reports = UserReport::with(['reporter', 'reported', 'reportedStore', 'order', 'reportedCustomer', 'reportedRider'])
            ->orderByDesc('created_at')->get();

        return response()->stream(function () use ($reports) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['ID', 'Created', 'Reporter side', 'Category', 'Route', 'Urgent', 'Status', 'Escalated', 'Store', 'Order',
                'Reporter', 'Reported', 'First store reply (hours)', 'Resolved at']);
            foreach ($reports as $r) {
                $start = $r->store_assigned_at ?? $r->created_at;
                fputcsv($out, [
                    $r->id,
                    $r->created_at?->format('Y-m-d H:i'),
                    $r->reporter_side,
                    $r->categoryLabel(),
                    $r->route,
                    $r->is_urgent ? 'Yes' : 'No',
                    $r->status,
                    $r->escalated_at ? 'Yes' : 'No',
                    $r->reportedStore?->store_name,
                    $r->order?->order_number,
                    $r->reporter?->name,
                    $r->reportedCustomer?->name ?? $r->reportedRider?->name ?? $r->reported?->name ?? $r->reportedStore?->store_name,
                    $r->store_first_response_at ? round($start->diffInMinutes($r->store_first_response_at) / 60, 1) : '',
                    $r->resolved_at?->format('Y-m-d H:i'),
                ]);
            }
            fclose($out);
        }, 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => 'attachment; filename="user-reports-' . now()->format('Y-m-d') . '.csv"',
        ]);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private function ensureAdmin(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403);
    }

    private function tabQuery(string $tab): Builder
    {
        $open = fn () => UserReport::whereNotIn('status', [UserReport::RESOLVED, UserReport::DISMISSED]);

        return match ($tab) {
            'needs_admin'    => ReportService::adminNeedsActionQuery(),
            'urgent'         => $open()->where('is_urgent', true),
            'escalated'      => $open()->whereNotNull('escalated_at'),
            'store_no_reply' => UserReport::where('route', 'store')->whereNull('escalated_at')->where('status', UserReport::PENDING)
                ->whereRaw('COALESCE(store_assigned_at, created_at) <= ?', [now()->subHours(24)]),
            'monitoring'     => ReportService::monitoringList(),
            'website'        => UserReport::where('type', UserReport::SYSTEM_TYPE),
            'open'           => $open(),
            'closed'         => UserReport::whereIn('status', [UserReport::RESOLVED, UserReport::DISMISSED]),
            default          => UserReport::query(),
        };
    }

    /**
     * Last 90 days, per store, customer reports the store had to handle (route store / both):
     * replies within 24 h, average first reply, fixed by the store without the admin, sent to the admin.
     * One grouped query; slowest stores first (never replied counts as slowest).
     */
    private function storeResponse(): array
    {
        $rows = DB::table('user_reports as r')
            ->join('stores as s', 's.id', '=', 'r.reported_store_id')
            ->whereNull('r.deleted_at')
            ->where('r.reporter_side', 'customer')->whereIn('r.route', ['store', 'both'])
            ->where('r.created_at', '>=', now()->subDays(90))
            ->groupBy('r.reported_store_id', 's.store_name')
            ->selectRaw("r.reported_store_id AS store_id, s.store_name,
                COUNT(*) AS received,
                SUM(r.store_first_response_at IS NOT NULL
                    AND TIMESTAMPDIFF(MINUTE, COALESCE(r.store_assigned_at, r.created_at), r.store_first_response_at) <= 1440) AS replied_24h,
                AVG(CASE WHEN r.store_first_response_at IS NOT NULL
                    THEN TIMESTAMPDIFF(MINUTE, COALESCE(r.store_assigned_at, r.created_at), r.store_first_response_at) / 60 END) AS avg_hours,
                SUM(r.status = 'resolved' AND r.escalated_at IS NULL) AS fixed_by_store,
                SUM(r.escalated_at IS NOT NULL) AS sent_to_admin")
            ->get()
            // Slowest first; stores that never replied count as slowest. (Sorted here: MariaDB can't
            // use an aggregate alias inside an ORDER BY expression, and it's one row per store.)
            ->sortBy([
                fn ($a, $b) => ($b->avg_hours === null) <=> ($a->avg_hours === null),
                fn ($a, $b) => (float) $b->avg_hours <=> (float) $a->avg_hours,
            ])->values();

        $pct = fn ($n, $total) => $total ? round($n * 100 / $total) : 0;
        $warnings = UserReport::where('verdict_at', '>=', now()->subDays(90))
            ->where(fn ($q) => $q->whereIn('verdict', ['store_at_fault', 'rider_at_fault'])
                ->orWhere(fn ($w) => $w->where('verdict', 'false_report')->whereIn('reporter_side', ['store', 'rider'])))
            ->whereNotNull('reported_store_id')
            ->selectRaw('reported_store_id, COUNT(*) AS n')->groupBy('reported_store_id')->pluck('n', 'reported_store_id');

        return $rows->map(fn ($r) => [
            'store_id'       => $r->store_id,
            'store_name'     => $r->store_name,
            'received'       => (int) $r->received,
            'replied_24h'    => $pct($r->replied_24h, $r->received),
            'avg_hours'      => $r->avg_hours !== null ? round((float) $r->avg_hours, 1) : null,
            'fixed_by_store' => $pct($r->fixed_by_store, $r->received),
            'sent_to_admin'  => $pct($r->sent_to_admin, $r->received),
            'warnings_90d'   => (int) ($warnings[$r->store_id] ?? 0),
        ])->all();
    }
}
