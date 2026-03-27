<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuthLog;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AuthLogController extends Controller
{
    public function index(Request $request): Response
    {
        $query = AuthLog::with('user')->latest();

        // ── Filters ───────────────────────────────────────────────────────────
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('action')) {
            $query->where('action', $request->action);
        }
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('email', 'like', "%{$search}%")
                  ->orWhereHas('user', fn ($q2) => $q2->where('name', 'like', "%{$search}%"))
                  ->orWhere('ip_address', 'like', "%{$search}%");
            });
        }
        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        $logs = $query->paginate(50)->through(fn ($log) => [
            'id'             => $log->id,
            'user_id'        => $log->user_id,
            'user_name'      => $log->user?->name,
            'email'          => $log->email,
            'action'         => $log->action,
            'ip_address'     => $log->ip_address ?? '—',
            'user_agent'     => $log->user_agent ?? '',
            'status'         => $log->status,
            'failure_reason' => $log->failure_reason,
            'created_at'     => $log->created_at->format('M d, Y g:i A'),
            'created_ts'     => $log->created_at->timestamp,
        ]);

        // ── Today's stats ─────────────────────────────────────────────────────
        $today = Carbon::today();

        $successToday = AuthLog::whereDate('created_at', $today)
            ->where('status', 'success')
            ->where('action', 'login_success')
            ->count();

        $failedToday = AuthLog::whereDate('created_at', $today)
            ->where('status', 'failed')
            ->whereIn('action', ['login_failed', 'account_locked'])
            ->count();

        // ── Suspicious IPs: 5+ failed attempts from same IP in last hour ──────
        $suspiciousIps = AuthLog::where('status', 'failed')
            ->where('created_at', '>=', Carbon::now()->subHour())
            ->whereNotNull('ip_address')
            ->selectRaw('ip_address, COUNT(*) as attempts')
            ->groupBy('ip_address')
            ->having('attempts', '>=', 5)
            ->get()
            ->map(fn ($row) => [
                'ip_address' => $row->ip_address,
                'attempts'   => (int) $row->attempts,
            ])
            ->values();

        return Inertia::render('admin/auth-logs', [
            'logs'          => $logs,
            'successToday'  => $successToday,
            'failedToday'   => $failedToday,
            'suspiciousIps' => $suspiciousIps,
            'filters'       => [
                'status'    => $request->status    ?? '',
                'action'    => $request->action    ?? '',
                'search'    => $request->search    ?? '',
                'date_from' => $request->date_from ?? '',
                'date_to'   => $request->date_to   ?? '',
            ],
        ]);
    }
}
