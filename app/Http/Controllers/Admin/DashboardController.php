<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuthLog;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Store;
use App\Models\User;
use App\Models\VerificationRequest;
use Carbon\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(): Response
    {
        $today = Carbon::today();
        $now   = Carbon::now();

        // ── Stats ─────────────────────────────────────────────────────────────
        $totalStores    = Store::count();
        $pendingStores  = Store::where('status', 'pending')->count();
        $approvedStores = Store::where('status', 'approved')->count();

        $totalUsers       = User::count();
        $newUsersThisWeek = User::where('created_at', '>=', $now->copy()->startOfWeek())->count();

        $totalOrders = Order::whereNull('deleted_at')->count();
        $ordersToday = Order::whereNull('deleted_at')->whereDate('created_at', $today)->count();

        $totalCommissions     = (float) Invoice::sum('platform_commission');
        $commissionsThisMonth = (float) Invoice::whereMonth('created_at', $now->month)
            ->whereYear('created_at', $now->year)
            ->sum('platform_commission');
        $commissionsToday = (float) Invoice::whereDate('created_at', $today)
            ->sum('platform_commission');

        $pendingVerifications = VerificationRequest::where('status', 'pending')->count();

        // ── Commissions per week — last 12 weeks ──────────────────────────────
        $commissionsChart = collect(range(11, 0))->map(function (int $weeksAgo) use ($now) {
            $start = $now->copy()->startOfWeek()->subWeeks($weeksAgo);
            $end   = $start->copy()->endOfWeek();
            return [
                'week'       => $start->format('M j'),
                'commission' => (float) Invoice::whereBetween('created_at', [$start, $end])
                    ->sum('platform_commission'),
            ];
        })->values();

        // ── New user registrations per week — last 12 weeks ──────────────────
        $registrationsChart = collect(range(11, 0))->map(function (int $weeksAgo) use ($now) {
            $start = $now->copy()->startOfWeek()->subWeeks($weeksAgo);
            $end   = $start->copy()->endOfWeek();
            return [
                'week'  => $start->format('M j'),
                'users' => User::whereBetween('created_at', [$start, $end])->count(),
            ];
        })->values();

        // ── Orders per day — last 14 days ─────────────────────────────────────
        $ordersChart = collect(range(13, 0))->map(function (int $daysAgo) use ($now) {
            $date = $now->copy()->subDays($daysAgo);
            return [
                'date'   => $date->format('M j'),
                'orders' => Order::whereNull('deleted_at')->whereDate('created_at', $date)->count(),
            ];
        })->values();

        // ── Recent activity feed ───────────────────────────────────────────────
        $activities = collect();

        // Pending store applications (most recent 5)
        Store::where('status', 'pending')->latest()->take(5)->get()
            ->each(fn ($s) => $activities->push([
                'type'    => 'store_application',
                'message' => "{$s->store_name} applied for approval",
                'time'    => $s->created_at->format('M d, Y g:i A'),
                'ts'      => $s->created_at->timestamp,
            ]));

        // Recently approved stores (most recent 5)
        Store::where('status', 'approved')->whereNotNull('approved_at')
            ->latest('approved_at')->take(5)->get()
            ->each(fn ($s) => $activities->push([
                'type'    => 'store_approved',
                'message' => "{$s->store_name} was approved",
                'time'    => Carbon::parse($s->approved_at)->format('M d, Y g:i A'),
                'ts'      => Carbon::parse($s->approved_at)->timestamp,
            ]));

        // New user registrations (most recent 5)
        User::latest()->take(5)->get()
            ->each(fn ($u) => $activities->push([
                'type'    => 'user_registered',
                'message' => "{$u->name} registered",
                'time'    => $u->created_at->format('M d, Y g:i A'),
                'ts'      => $u->created_at->timestamp,
            ]));

        $recentActivity = $activities
            ->sortByDesc('ts')
            ->take(10)
            ->values()
            ->map(fn ($a) => ['type' => $a['type'], 'message' => $a['message'], 'time' => $a['time']])
            ->values();

        // ── Auth stats (today) ─────────────────────────────────────────────────
        $authSuccessToday = AuthLog::whereDate('created_at', $today)
            ->where('status', 'success')
            ->where('action', 'login_success')
            ->count();

        $authFailedToday = AuthLog::whereDate('created_at', $today)
            ->where('status', 'failed')
            ->whereIn('action', ['login_failed', 'account_locked'])
            ->count();

        $suspiciousActivity = AuthLog::where('status', 'failed')
            ->where('created_at', '>=', $now->copy()->subHour())
            ->whereNotNull('ip_address')
            ->selectRaw('ip_address, COUNT(*) as attempts')
            ->groupBy('ip_address')
            ->having('attempts', '>=', 5)
            ->count();

        return Inertia::render('admin/dashboard', [
            'stats' => [
                'totalStores'          => $totalStores,
                'pendingStores'        => $pendingStores,
                'approvedStores'       => $approvedStores,
                'totalUsers'           => $totalUsers,
                'newUsersThisWeek'     => $newUsersThisWeek,
                'totalOrders'          => $totalOrders,
                'ordersToday'          => $ordersToday,
                'totalCommissions'     => $totalCommissions,
                'commissionsThisMonth' => $commissionsThisMonth,
                'commissionsToday'     => $commissionsToday,
                'pendingVerifications' => $pendingVerifications,
            ],
            'commissionsChart'   => $commissionsChart,
            'registrationsChart' => $registrationsChart,
            'ordersChart'        => $ordersChart,
            'recentActivity'     => $recentActivity,
            'authStats' => [
                'successToday'      => $authSuccessToday,
                'failedToday'       => $authFailedToday,
                'suspiciousCount'   => $suspiciousActivity,
            ],
        ]);
    }
}
