<?php

namespace App\Http\Controllers\Rider;

use App\Http\Controllers\Controller;
use App\Models\UserReport;
use App\Services\ReportService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Rider "My Reports": customers they reported (store + admin see these) and website problems. */
class ReportController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $tab  = $request->get('tab') === 'website' ? 'website' : 'reports';
        $reports = UserReport::with(['reportedStore', 'order', 'reportedCustomer', 'reporter'])
            ->where('reporter_id', $user->id)->where('reporter_side', 'rider')
            ->where('type', $tab === 'website' ? '=' : '!=', UserReport::SYSTEM_TYPE)
            ->orderByRaw("status IN ('resolved','dismissed')")->orderByDesc('last_activity_at')->orderByDesc('id')
            ->paginate(20)->withQueryString()
            ->through(fn (UserReport $r) => ReportService::presentListItem($r, $user, 'rider'));

        return Inertia::render('rider/reports', ['reports' => $reports, 'tab' => $tab]);
    }

    public function store(Request $request): RedirectResponse
    {
        $report = ReportService::create($request->user(), 'rider', $request->only('order_id', 'category', 'subject', 'description'),
            $request->file('evidence', []));

        return redirect(ReportService::linkFor($report, 'rider'))->with('success', 'Your report was sent to the store and the platform admin.');
    }

    public function storeWebsiteProblem(Request $request): RedirectResponse
    {
        ReportService::createSystemReport($request->user(), 'rider', $request->only('category', 'system_area', 'subject', 'description', 'page_url'),
            $request->file('screenshots', []), $request->userAgent());

        return back()->with('success', 'Thanks! The admin team will look into it.');
    }

    public function show(Request $request, UserReport $userReport): Response
    {
        $this->authorizeView($request, $userReport);

        return Inertia::render('rider/report-show', ['report' => ReportService::present($userReport, $request->user(), 'rider')]);
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
