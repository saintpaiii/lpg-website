<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\UserReport;
use App\Services\ReportService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Customer "My Reports": problems with orders, and website problems. */
class UserReportController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $tab  = $request->get('tab') === 'website' ? 'website' : 'reports';
        $reports = UserReport::with(['reportedStore', 'order', 'reportedRider', 'reportedProduct', 'reportedCustomer', 'reporter'])
            ->where('reporter_id', $user->id)->where('reporter_side', 'customer')
            ->where('type', $tab === 'website' ? '=' : '!=', UserReport::SYSTEM_TYPE)
            ->orderByRaw("status IN ('resolved','dismissed')")->orderByDesc('last_activity_at')->orderByDesc('id')
            ->paginate(20)->withQueryString()
            ->through(fn (UserReport $r) => ReportService::presentListItem($r, $user, 'customer'));

        return Inertia::render('customer/reports', [
            'reports'     => $reports,
            'tab'         => $tab,
            'falseReports' => ReportService::customerFalseReports($user->id),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $report = ReportService::create($request->user(), 'customer', $request->only('order_id', 'category', 'subject', 'description', 'product_id'),
            $request->file('evidence', []));

        return redirect(ReportService::linkFor($report, 'customer'))->with('success', 'Your report was sent.');
    }

    public function storeWebsiteProblem(Request $request): RedirectResponse
    {
        ReportService::createSystemReport($request->user(), 'customer', $request->only('category', 'system_area', 'subject', 'description', 'page_url'),
            $request->file('screenshots', []), $request->userAgent());

        return back()->with('success', 'Thanks! The admin team will look into it.');
    }

    public function show(Request $request, UserReport $userReport): Response
    {
        $this->authorizeView($request, $userReport);

        return Inertia::render('customer/report-show', ['report' => ReportService::present($userReport, $request->user(), 'customer')]);
    }

    public function reply(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->authorizeView($request, $userReport);
        ReportService::reply($userReport, $request->user(), $request->input('body'), $request->file('images', []));

        return back()->with('success', 'Reply sent.');
    }

    public function confirm(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->authorizeView($request, $userReport);
        ReportService::confirmFixed($userReport, $request->user());

        return back()->with('success', 'Thanks! The report is now resolved.');
    }

    public function notSolved(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->authorizeView($request, $userReport);
        ReportService::notSolved($userReport, $request->user(), $request->input('reason'));

        return back()->with('success', "Thanks for letting us know. We'll keep working on it.");
    }

    /** "Send to admin" when the store hasn't solved it after 24 hours. */
    public function escalate(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->authorizeView($request, $userReport);
        ReportService::escalate($userReport, $request->user(), 'reporter', $request->input('reason'));

        return back()->with('success', 'Your report was sent to the platform admin.');
    }

    public function withdraw(Request $request, UserReport $userReport): RedirectResponse
    {
        $this->authorizeView($request, $userReport);
        ReportService::withdraw($userReport, $request->user());

        return back()->with('success', 'Report withdrawn.');
    }

    private function authorizeView(Request $request, UserReport $r): void
    {
        abort_unless(ReportService::canView($r, $request->user()), 403);
    }
}
