<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Concerns\GeneratesExport;
use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\SubscriptionPayment;
use App\Models\SubscriptionPlan;
use App\Services\SubscriptionService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Platform admin: store plans, plan payments (income), free days, cash payments, plan prices and limits.
 * The 'admin' middleware also lets platform staff in — every action checks isAdmin().
 */
class SubscriptionController extends Controller
{
    use GeneratesExport;

    private const PAID_METHODS = ['paymongo', 'cash'];

    public function index(Request $request): Response
    {
        abort_unless($request->user()->isAdmin(), 403);

        $tab = in_array($request->get('tab'), ['stores', 'payments', 'plans'], true) ? $request->get('tab') : 'stores';

        return Inertia::render('admin/subscriptions', [
            'tab'      => $tab,
            'summary'  => $this->summary(),
            'stores'   => $tab === 'stores' ? $this->storeList($request) : null,
            'payments' => $tab === 'payments' ? $this->paymentQuery($request)->paginate(20)->withQueryString()->through(fn ($p) => $this->paymentRow($p)) : null,
            'plans'    => SubscriptionService::publicPlans(),
            'filters'  => $request->only('search', 'plan', 'status', 'date_from', 'date_to', 'method'),
        ]);
    }

    private function summary(): array
    {
        $income = fn () => SubscriptionPayment::paid()->whereIn('method', self::PAID_METHODS);
        $now = now();

        return [
            'income_month'  => round((float) $income()->whereBetween('paid_at', [$now->copy()->startOfMonth(), $now->copy()->endOfMonth()])->sum('amount'), 2),
            'income_total'  => round((float) $income()->sum('amount'), 2),
            'active_paid'   => Store::whereIn('subscription_plan', SubscriptionService::PLAN_KEYS)->where('subscription_expires_at', '>', $now)->count(),
            'on_trial'      => Store::where('subscription_plan', 'trial')->where('subscription_expires_at', '>', $now)->count(),
            'ending_soon'   => Store::where('subscription_plan', '!=', 'none')->whereBetween('subscription_expires_at', [$now, $now->copy()->addDays((int) config('plans.reminder_days', 3))])->count(),
            'expired'       => Store::where('subscription_plan', '!=', 'none')->where('subscription_expires_at', '<=', $now)->count(),
        ];
    }

    private function storeList(Request $request)
    {
        $now = now();
        $q = Store::query()
            ->whereIn('status', ['approved', 'suspended'])
            ->withSum(['subscriptionPayments as total_paid' => fn ($p) => $p->where('status', 'paid')->whereIn('method', self::PAID_METHODS)], 'amount')
            ->when($request->get('search'), fn ($w, $s) => $w->where('store_name', 'like', "%{$s}%"))
            ->when($request->get('plan'), fn ($w, $p) => $w->where('subscription_plan', $p))
            ->when($request->get('status'), function (Builder $w, $status) use ($now) {
                match ($status) {
                    'trial'   => $w->where('subscription_plan', 'trial')->where('subscription_expires_at', '>', $now),
                    'active'  => $w->whereIn('subscription_plan', SubscriptionService::PLAN_KEYS)->where('subscription_expires_at', '>', $now),
                    'ending'  => $w->where('subscription_plan', '!=', 'none')->whereBetween('subscription_expires_at', [$now, $now->copy()->addDays(3)]),
                    'expired' => $w->where('subscription_plan', '!=', 'none')->where('subscription_expires_at', '<=', $now),
                    'none'    => $w->where('subscription_plan', 'none'),
                    default   => null,
                };
            })
            ->orderByRaw('subscription_expires_at IS NULL, subscription_expires_at ASC');

        return $q->paginate(20)->withQueryString()->through(fn (Store $s) => [
            'id'         => $s->id,
            'store_name' => $s->store_name,
            'city'       => $s->city,
            'plan_key'   => $s->subscription_plan,
            'plan'       => $s->subscription_plan !== 'none' ? SubscriptionService::planName($s->subscription_plan) : 'No plan',
            'status'     => static::statusOf($s),
            'expires'    => $s->subscription_expires_at?->format('M j, Y g:i A'),
            'days_left'  => SubscriptionService::daysLeft($s),
            'total_paid' => round((float) ($s->total_paid ?? 0), 2),
        ]);
    }

    /** trial | active | ending | expired | none */
    public static function statusOf(Store $s): string
    {
        if ($s->subscription_plan === 'none' || ! $s->subscription_expires_at) {
            return 'none';
        }
        if (! SubscriptionService::isActive($s)) {
            return 'expired';
        }
        if (SubscriptionService::daysLeft($s) <= (int) config('plans.reminder_days', 3)) {
            return 'ending';
        }

        return $s->subscription_plan === 'trial' ? 'trial' : 'active';
    }

    private function paymentQuery(Request $request): Builder
    {
        return SubscriptionPayment::with('store:id,store_name')
            ->where('status', 'paid')
            ->when($request->get('method'), fn ($q, $m) => $q->where('method', $m))
            ->when($request->get('date_from'), fn ($q, $d) => $q->whereDate('paid_at', '>=', $d))
            ->when($request->get('date_to'), fn ($q, $d) => $q->whereDate('paid_at', '<=', $d))
            ->when($request->get('search'), fn ($q, $s) => $q->where(fn ($w) => $w->where('receipt_number', 'like', "%{$s}%")
                ->orWhereHas('store', fn ($st) => $st->where('store_name', 'like', "%{$s}%"))))
            ->latest('paid_at');
    }

    private function paymentRow(SubscriptionPayment $p): array
    {
        return [
            'id'             => $p->id,
            'receipt_number' => $p->receipt_number,
            'store_id'       => $p->store_id,
            'store_name'     => $p->store?->store_name ?? '—',
            'plan'           => SubscriptionService::planName($p->plan_key),
            'amount'         => (float) $p->amount,
            'method'         => $p->method,
            'method_label'   => SubscriptionService::methodLabel($p->method),
            'reference'      => $p->reference,
            'period'         => SubscriptionService::periodLabel($p->period_start, $p->period_end),
            'paid_at'        => $p->paid_at?->format('M j, Y g:i A'),
            'status'         => $p->status,
            'notes'          => $p->notes,
        ];
    }

    public function export(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403);

        $format = $request->get('format', 'csv');
        $rows   = $this->paymentQuery($request)->get();
        $from   = $request->get('date_from') ?: ($rows->last()?->paid_at?->toDateString() ?? now()->toDateString());
        $to     = $request->get('date_to') ?: now()->toDateString();
        $filename = $this->exportFilename('subscription_payments', 'LPG_Portal', $from, $to, $format);

        $data = $rows->map(fn (SubscriptionPayment $p) => [
            'receipt' => $p->receipt_number ?? '—',
            'store'   => $p->store?->store_name ?? '—',
            'plan'    => SubscriptionService::planName($p->plan_key),
            'method'  => SubscriptionService::methodLabel($p->method),
            'period'  => SubscriptionService::periodLabel($p->period_start, $p->period_end),
            'paid_at' => $p->paid_at?->setTimezone('Asia/Manila')->format('M d, Y g:i A') ?? '—',
            'amount'  => $this->peso((float) $p->amount),
        ])->values()->all();
        $total = (float) $rows->sum(fn ($p) => (float) $p->amount);

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Subscription Payments',
                'orgName'      => 'LPG Portal — Platform Admin',
                'orgSub'       => 'Cavite, Philippines',
                'dateRange'    => Carbon::parse($from)->format('M d, Y') . ' – ' . Carbon::parse($to)->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Payments', 'value' => count($data)],
                    ['label' => 'Total',    'value' => $this->peso($total)],
                ],
                'columns' => [
                    ['key' => 'receipt', 'label' => 'Receipt #', 'class' => 'mono'],
                    ['key' => 'store',   'label' => 'Store'],
                    ['key' => 'plan',    'label' => 'Plan'],
                    ['key' => 'method',  'label' => 'Method'],
                    ['key' => 'period',  'label' => 'Period'],
                    ['key' => 'paid_at', 'label' => 'Paid at'],
                    ['key' => 'amount',  'label' => 'Amount', 'align' => 'right'],
                ],
                'rows'      => $data,
                'totalsRow' => ['receipt' => 'TOTAL', 'amount' => $this->peso($total)],
            ]);
        }

        $csv   = array_map(fn ($r) => array_values($r), $data);
        $csv[] = ['TOTAL', '', '', '', '', '', $this->peso($total)];

        return $this->csvResponse($filename, ['Receipt #', 'Store', 'Plan', 'Method', 'Period', 'Paid at', 'Amount'], $csv);
    }

    public function giveDays(Request $request, Store $store): RedirectResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $data = $request->validate([
            'days'   => 'required|integer|min:1|max:90',
            'reason' => 'required|string|max:255',
        ]);

        SubscriptionService::giveDays($store, (int) $data['days'], $data['reason'], $request->user());
        $store->refresh();

        return back()->with('success', "{$data['days']} free day(s) given to {$store->store_name} — active until {$store->subscription_expires_at->format('M j, Y')}.");
    }

    public function recordCash(Request $request, Store $store): RedirectResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $data = $request->validate([
            'plan_key'  => 'required|in:' . implode(',', SubscriptionService::PLAN_KEYS),
            'reference' => 'nullable|string|max:100',
        ]);

        $payment = SubscriptionService::recordCash($store, $data['plan_key'], $data['reference'] ?? null, $request->user());

        return back()->with('success', "Cash payment recorded for {$store->store_name} ({$payment->receipt_number}).");
    }

    public function updatePlan(Request $request, SubscriptionPlan $plan): RedirectResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $limit = 'nullable|integer|min:1|max:10000';
        $data = $request->validate([
            'price'        => 'required|numeric|min:0|max:100000',
            'max_products' => $limit,
            'max_staff'    => $limit,
            'max_vehicles' => $limit,
        ]);

        $limitsChanged = $plan->max_products != ($data['max_products'] ?? null)
            || $plan->max_staff != ($data['max_staff'] ?? null)
            || $plan->max_vehicles != ($data['max_vehicles'] ?? null);

        $plan->update($data);
        SubscriptionService::forgetPlans();

        // New limits apply right away to every active store on this plan (the trial uses Premium's limits)
        $updated = 0;
        if ($limitsChanged) {
            $keys = $plan->key === 'premium' ? ['premium', 'trial'] : [$plan->key];
            Store::whereIn('subscription_plan', $keys)->where('subscription_expires_at', '>', now())
                ->each(function (Store $store) use (&$updated) {
                    $r = SubscriptionService::applyPlanLimits($store);
                    if (array_sum($r['paused']) + array_sum($r['restored']) > 0) {
                        $updated++;
                    }
                });
        }

        return back()->with('success', "{$plan->name} plan updated. Price changes apply to the next purchase only."
            . ($limitsChanged ? " {$updated} " . ($updated === 1 ? 'store' : 'stores') . ' updated.' : ''));
    }

    public function receipt(Request $request, SubscriptionPayment $payment): HttpResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        abort_unless($payment->status === 'paid' && $payment->receipt_number, 404);

        return $this->pdfResponse("{$payment->receipt_number}.pdf", SubscriptionService::receiptViewData($payment->load('store')));
    }
}
