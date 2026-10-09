<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\UserReport;
use App\Services\ReportService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "My website reports" for store owners and staff (no extra permission — anyone in the seller
 * portal can report a problem with the site). Only the reporter and the admins see these.
 */
class WebsiteReportController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $reports = UserReport::with(['reporter'])
            ->where('reporter_id', $user->id)->where('type', UserReport::SYSTEM_TYPE)
            ->orderByRaw("status IN ('resolved','dismissed')")->orderByDesc('last_activity_at')->orderByDesc('id')
            ->paginate(20)->withQueryString()
            ->through(fn (UserReport $r) => ReportService::presentListItem($r, $user, 'seller'));

        return Inertia::render('seller/website-reports', ['reports' => $reports]);
    }

    public function store(Request $request): RedirectResponse
    {
        ReportService::createSystemReport($request->user(), 'store', $request->only('category', 'system_area', 'subject', 'description', 'page_url'),
            $request->file('screenshots', []), $request->userAgent());

        return back()->with('success', 'Thanks! The admin team will look into it.');
    }

    public function show(Request $request, UserReport $userReport): Response
    {
        $this->authorizeView($request, $userReport);

        return Inertia::render('seller/website-report-show', ['report' => ReportService::present($userReport, $request->user(), 'seller')]);
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

    /** Only website problems this user filed. */
    private function authorizeView(Request $request, UserReport $r): void
    {
        abort_unless($r->isSystem() && ReportService::canView($r, $request->user()), 403);
    }
}
