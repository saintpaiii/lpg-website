<?php

namespace App\Services;

use App\Events\ReportUpdated;
use App\Models\Order;
use App\Models\ReportUpdate;
use App\Models\Store;
use App\Models\StoreQuickReply;
use App\Models\User;
use App\Models\UserReport;
use App\Support\Realtime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Every report rule lives here (controllers stay thin).
 *
 * Route (config/reports.php) decides who handles a report:
 *   store — the store handles it, the admin can watch; admin — admin only, the store never sees it;
 *   both  — store and admin from the start (gas leak, paid-not-delivered, every rider report).
 * Steps: New → Under Review → Investigating → Resolution (a fix was proposed) → Resolved.
 * No store response within 48 h → sent to the admin automatically; a proposed resolution the
 * reporter doesn't answer within 72 h closes automatically (reports:auto-escalate).
 * Only an admin's closing outcome creates warnings (and, for customers, suspension after 3 false reports).
 *
 * Roles inside a report: 'reporter', 'store_handler', 'admin'. For reports the store filed, any
 * store handler of that store acts as the reporter. Website problem reports (type system_report)
 * are between the reporter and the admins only.
 */
class ReportService
{
    public const STATUS_LABELS = [
        UserReport::PENDING       => 'New',
        UserReport::IN_PROGRESS   => 'Under Review',
        UserReport::INVESTIGATING => 'Investigating',
        UserReport::AWAITING      => 'Resolution',
        UserReport::RESOLVED      => 'Resolved',
        UserReport::DISMISSED     => 'Resolved',
    ];

    /** Step bar: stored status => step index. */
    private const STEP_INDEX = [
        UserReport::PENDING => 0, UserReport::IN_PROGRESS => 1, UserReport::INVESTIGATING => 2,
        UserReport::AWAITING => 3, UserReport::RESOLVED => 4, UserReport::DISMISSED => 4,
    ];
    private const STEP_LABELS = ['New', 'Under Review', 'Investigating', 'Resolution', 'Resolved'];

    /** Open and still being worked on (before "Resolution"). */
    public const ACTIVE = [UserReport::PENDING, UserReport::IN_PROGRESS, UserReport::INVESTIGATING];

    public const VERDICT_LABELS = [
        'store_at_fault'    => 'Store was at fault',
        'rider_at_fault'    => 'Rider was at fault',
        'customer_at_fault' => 'Customer was at fault',
        'false_report'      => 'False report',
        'not_enough_proof'  => 'Not enough proof',
        'solved'            => 'Solved',
        'fixed'             => 'Fixed',
        'cannot_reproduce'  => 'Could not reproduce',
        'not_a_problem'     => 'Not a problem',
        'withdrawn'         => 'Withdrawn',
    ];
    private const DISMISS_VERDICTS = ['false_report', 'not_enough_proof', 'cannot_reproduce', 'not_a_problem', 'withdrawn'];

    /** A proposed resolution for these needs a photo of the fix. */
    private const PHOTO_CATEGORIES = ['wrong_item', 'damaged_cylinder', 'gas_leak', 'fake_product'];

    private const TYPES = ['customer' => 'buyer_report', 'store' => 'seller_report', 'rider' => 'rider_report'];

    // ── Who can see / do what ────────────────────────────────────────────────

    /** The store may see this report at all (never website problems, never admin-only customer reports). */
    public static function storeCanView(UserReport $r): bool
    {
        return ! $r->isSystem() && $r->reported_store_id !== null
            && (in_array($r->route, ['store', 'both'], true) || in_array($r->reporter_side, ['store', 'rider'], true));
    }

    /** Owner, or staff of that store (not riders) with customer_reports.manage. */
    public static function isStoreHandler(User $u, ?int $storeId): bool
    {
        return $storeId !== null
            && ChatService::storeIdFor($u) === $storeId
            && ($u->role === 'seller' || $u->hasPermission('customer_reports.manage'));
    }

    public static function canView(UserReport $r, User $u): bool
    {
        return static::roleOf($r, $u) !== null;
    }

    /** 'admin' | 'reporter' | 'store_handler' | null (no access). */
    public static function roleOf(UserReport $r, User $u): ?string
    {
        if ($u->isAdmin()) {
            return 'admin';
        }
        if ($r->reporter_id === $u->id && ($r->isSystem() || $r->reporter_side !== 'store')) {
            return 'reporter';
        }
        if ($r->isSystem()) {
            return null;   // website problems: only the reporter and admins
        }
        if (static::isStoreHandler($u, $r->reported_store_id) && static::storeCanView($r)) {
            return $r->reporter_side === 'store' ? 'reporter' : 'store_handler';
        }

        return null;
    }

    /** The store is the one working on this report right now. */
    private static function storeHandles(UserReport $r): bool
    {
        return ! $r->isSystem() && $r->reporter_side === 'customer' && in_array($r->route, ['store', 'both'], true)
            && ! $r->isEscalated() && ! $r->isClosed();
    }

    /** The admin may propose a resolution (admin-handled customer reports, and website problems). */
    private static function adminProposes(UserReport $r): bool
    {
        return ! $r->isClosed()
            && ($r->isSystem() || ($r->reporter_side === 'customer' && ($r->route === 'admin' || $r->isEscalated())));
    }

    /** What the viewer may do right now (also sent to the page as flags). */
    public static function flags(UserReport $r, User $u): array
    {
        $role    = static::roleOf($r, $u);
        $closed  = $r->isClosed();
        $active  = in_array($r->status, self::ACTIVE, true);
        $handler = ($role === 'store_handler' && static::storeHandles($r)) || ($role === 'admin' && ! $closed);

        return [
            'can_reply'               => $role === 'admin' || ($role !== null && ! $closed),
            'can_start_review'        => $handler && $r->status === UserReport::PENDING,
            'can_start_investigating' => $handler && in_array($r->status, [UserReport::PENDING, UserReport::IN_PROGRESS], true),
            'can_propose_resolution'  => $active && (($role === 'store_handler' && static::storeHandles($r)) || ($role === 'admin' && static::adminProposes($r))),
            'proposal_needs_photo'    => in_array($r->category, self::PHOTO_CATEGORIES, true),
            'can_confirm'             => $role === 'reporter' && $r->status === UserReport::AWAITING,
            'can_not_solved'          => $role === 'reporter' && $r->status === UserReport::AWAITING,
            // Customer stuck with a store that doesn't resolve: "Send to admin" after 24 h
            'can_escalate'            => $role === 'reporter' && ! $r->isSystem() && $r->reporter_side === 'customer'
                && in_array($r->route, ['store', 'both'], true) && ! $r->isEscalated() && $active
                && $r->store_assigned_at && $r->store_assigned_at->lte(now()->subHours(24)),
            'can_withdraw'            => $role === 'reporter' && $r->status === UserReport::PENDING
                && $r->category !== 'gas_leak' && ! static::hasHandlerReply($r),
            'can_close'               => $role === 'admin' && ! $closed,
            'needs_safety_note'       => $role === 'admin' && static::needsSafetyNote($r),
            'can_remind_store'        => $role === 'admin' && ! $r->isSystem() && in_array($r->route, ['store', 'both'], true)
                && ! $closed && ! $r->isEscalated() && $r->reported_store_id !== null,
            'reminded_at'             => $role === 'admin' ? $r->store_reminded_at?->toIso8601String() : null,
            'can_hand_to_store'       => $role === 'admin' && ! $r->isSystem() && $r->reporter_side === 'customer'
                && $r->route === 'admin' && $r->reported_store_id && ! $closed,
            'can_add_internal_note'   => $role === 'admin',
            'can_request_refund'      => $role === 'reporter' && $r->reporter_side === 'customer' && static::canRequestRefund($r),
        ];
    }

    /** Gas leak: the admin closes only after a store resolution with photos, or with a written safety note. */
    private static function needsSafetyNote(UserReport $r): bool
    {
        return $r->category === 'gas_leak' && ! ($r->status === UserReport::AWAITING && ! empty($r->resolution_photos));
    }

    /** Same rule as the "Request Refund" button on the customer's order page. */
    private static function canRequestRefund(UserReport $r): bool
    {
        if ($r->isSystem() || ! ($r->categoryConfig()['offers_refund'] ?? false) || ! $r->order) {
            return false;
        }
        $o = $r->order;
        $latest = $o->refundRequests()->latest()->first();

        return $o->status === 'delivered' && in_array($o->payment_status, ['paid', 'partial'], true)
            && ! ($latest && in_array($latest->status, ['pending', 'approved', 'processed'], true));
    }

    private static function hasHandlerReply(UserReport $r): bool
    {
        return $r->updates()->whereIn('author_side', $r->reporter_side === 'store' ? ['admin'] : ['store', 'admin'])->where('is_internal', false)->exists();
    }

    // ── Create ────────────────────────────────────────────────────────────────

    public static function create(User $reporter, string $side, array $data, array $files = []): UserReport
    {
        $v = Validator::make($data + ['evidence' => $files], [
            'order_id'    => 'required|integer|exists:orders,id',
            'category'    => 'required|string',
            'subject'     => 'required|string|max:150',
            'description' => 'required|string|min:10|max:5000',
            'product_id'  => 'nullable|integer',
            'evidence'    => 'nullable|array|max:5',
            'evidence.*'  => 'file|mimes:jpg,jpeg,png,webp,mp4,pdf|max:10240',
        ], ['description.min' => 'Please describe the problem in at least 10 characters.']);
        $data = $v->validate();

        // Website problem categories live in system_categories, so they can't be filed here
        $cat = config("reports.categories.{$data['category']}");
        if (! $cat || $cat['reporter'] !== $side) {
            throw ValidationException::withMessages(['category' => 'Please choose a problem from the list.']);
        }

        $order = Order::with(['customer', 'delivery', 'items'])->findOrFail($data['order_id']);
        static::checkOwnership($order, $reporter, $side);
        static::checkTimeWindow($order, $side, $data['category']);

        // One open report per order + problem
        $existing = UserReport::where('reporter_id', $reporter->id)->where('order_id', $order->id)
            ->where('category', $data['category'])->whereNotIn('status', [UserReport::RESOLVED, UserReport::DISMISSED])->value('id');
        if ($existing) {
            throw ValidationException::withMessages([
                'category'           => 'You already have an open report about this. Add details to it instead.',
                'existing_report_id' => (string) $existing,
            ]);
        }

        $fields = [
            'reporter_id'       => $reporter->id,
            'reporter_side'     => $side,
            'type'              => self::TYPES[$side],
            'category'          => $data['category'],
            'target_type'       => $cat['target'],
            'route'             => $cat['route'],
            'is_urgent'         => (bool) $cat['urgent'],
            'reported_store_id' => $order->store_id,
            'order_id'          => $order->id,
            'subject'           => $data['subject'],
            'description'       => $data['description'],
            'status'            => UserReport::PENDING,
            'waiting_on'        => 'handler',
            'store_assigned_at' => in_array($cat['route'], ['store', 'both'], true) ? now() : null,
            'last_activity_at'  => now(),
        ];
        match ($cat['target']) {
            'rider'    => $fields += static::riderTarget($order),
            'customer' => $fields += ['reported_customer_id' => $order->customer_id, 'reported_id' => $order->customer?->user_id],
            'product'  => $fields += static::productTarget($order, $data['product_id'] ?? null),
            default    => null,
        };

        $report = DB::transaction(function () use ($fields, $files) {
            $fields['evidence_paths'] = collect($files)->map(fn (UploadedFile $f) => $f->store('reports/evidence', 'public'))->values()->all();

            return UserReport::create($fields);
        });

        static::afterCreate($report);

        return $report;
    }

    /** "Report a website problem" — any customer, store user or rider; only admins handle it. */
    public static function createSystemReport(User $user, string $portal, array $data, array $files, ?string $userAgent): UserReport
    {
        $data = Validator::make($data + ['screenshots' => $files], [
            'category'      => ['required', 'string', 'in:' . implode(',', array_keys(config('reports.system_categories')))],
            'system_area'   => ['required', 'string', 'in:' . implode(',', config("reports.system_areas.{$portal}", []))],
            'subject'       => 'required|string|max:150',
            'description'   => 'required|string|min:10|max:5000',
            'page_url'      => 'nullable|string|max:500',
            'screenshots'   => 'required|array|min:1|max:5',
            'screenshots.*' => 'image|mimes:jpg,jpeg,png,webp|max:10240',
        ], [
            'description.min'      => 'Please describe the problem in at least 10 characters.',
            'screenshots.required' => 'Please add at least one screenshot.',
            'screenshots.min'      => 'Please add at least one screenshot.',
            'category.in'          => 'Please choose a problem from the list.',
            'system_area.in'       => 'Please choose where it happened.',
        ])->validate();

        $report = DB::transaction(fn () => UserReport::create([
            'reporter_id'       => $user->id,
            'reporter_side'     => $portal,
            'type'              => UserReport::SYSTEM_TYPE,
            'category'          => $data['category'],
            'target_type'       => 'platform',
            'route'             => 'admin',
            'is_urgent'         => false,
            'reported_store_id' => null,   // no store can ever see it
            'order_id'          => null,
            'subject'           => $data['subject'],
            'description'       => $data['description'],
            'evidence_paths'    => collect($files)->map(fn (UploadedFile $f) => $f->store('reports/evidence', 'public'))->values()->all(),
            'system_area'       => $data['system_area'],
            'page_url'          => $data['page_url'] ?? null,
            'user_agent'        => $userAgent ? Str::limit($userAgent, 497) : null,
            'status'            => UserReport::PENDING,
            'waiting_on'        => 'handler',
            'last_activity_at'  => now(),
        ]));

        static::notify(static::adminIds(), 'admin', $report, "New website problem: {$report->categoryLabel()} — {$report->system_area}",
            Str::limit($report->subject, 150), $user->id);
        static::broadcast($report);

        return $report;
    }

    private static function checkOwnership(Order $order, User $u, string $side): void
    {
        $ok = match ($side) {
            'customer' => $order->customer?->user_id === $u->id,
            'store'    => ChatService::storeIdFor($u) === $order->store_id,
            'rider'    => $order->delivery?->rider_id === $u->id,
        };
        abort_unless($ok, 403);
    }

    private static function checkTimeWindow(Order $order, string $side, string $category): void
    {
        if ($side === 'rider') {
            $d = $order->delivery;
            $active = in_array($d->status, ['assigned', 'picked_up', 'in_transit'], true);
            $recent = in_array($d->status, ['delivered', 'failed'], true) && ($d->delivered_at ?? $d->updated_at)?->gte(now()->subDays(7));
            if (! $active && ! $recent) {
                throw ValidationException::withMessages(['category' => 'You can report a customer within 7 days of the delivery.']);
            }

            return;
        }
        $orderDate = $order->ordered_at ?? $order->created_at;
        if ($category !== 'gas_leak' && $orderDate && $orderDate->lt(now()->subDays(30))) {
            throw ValidationException::withMessages(['category' => 'You can report a problem within 30 days of your order.']);
        }
    }

    private static function riderTarget(Order $order): array
    {
        $riderId = $order->delivery?->rider_id;
        if (! $riderId) {
            throw ValidationException::withMessages(['category' => 'No rider was assigned to this order.']);
        }

        return ['reported_rider_id' => $riderId, 'reported_id' => $riderId];
    }

    private static function productTarget(Order $order, ?int $productId): array
    {
        if ($productId === null) {
            return [];
        }
        if (! $order->items->pluck('product_id')->contains($productId)) {
            throw ValidationException::withMessages(['product_id' => 'Please choose an item from this order.']);
        }

        return ['reported_product_id' => $productId];
    }

    private static function afterCreate(UserReport $r): void
    {
        $r->load('reportedStore', 'order');
        $urgent = $r->is_urgent ? 'URGENT: ' : '';
        $label  = $r->categoryLabel();
        $num    = $r->order?->order_number ?? '';
        $storeName = $r->reportedStore?->store_name ?? 'the store';

        $title = match ($r->reporter_side) {
            'store' => "{$urgent}Store report about a customer: {$label}",
            'rider' => "{$urgent}Rider report about a customer: {$label}",
            default => "{$urgent}New customer report: {$label}",
        };
        $msg = trim("{$num} — {$r->subject}", ' —');

        if (in_array($r->route, ['store', 'both'], true) && static::storeCanView($r)) {
            static::notify(static::storeHandlerIds($r->reported_store_id), 'seller', $r, $title, $msg, $r->reporter_id);
        }
        if (in_array($r->route, ['admin', 'both'], true)) {
            static::notify(static::adminIds(), 'admin', $r, $title, $msg, $r->reporter_id);
        } elseif ($r->route === 'store') {
            // Low-priority heads-up: the admin monitors store-handled reports too
            static::notify(static::adminIds(), 'admin', $r, "New store report: {$label}",
                "{$storeName} · {$num} — the store is handling this. You can monitor it.", $r->reporter_id);
        }
        if ($r->reporter_side === 'customer') {
            $to = match ($r->route) {
                'store' => $storeName,
                'admin' => 'the platform admin',
                default => "{$storeName} and the platform admin",
            };
            static::notify([$r->reporter_id], 'customer', $r, 'Report sent', "We sent your report to {$to}.", null);
        }
        static::broadcast($r);
    }

    // ── Conversation ──────────────────────────────────────────────────────────

    public static function reply(UserReport $r, User $u, ?string $body, array $images = [], bool $internal = false): ReportUpdate
    {
        $role = static::roleOf($r, $u);
        abort_unless($role !== null, 403);
        abort_if($internal && $role !== 'admin', 403);
        if ($role !== 'admin' && $r->isClosed()) {
            throw ValidationException::withMessages(['body' => 'This report is closed.']);
        }
        $data = Validator::make(['body' => $body, 'images' => $images], [
            'body'     => 'nullable|string|max:2000|required_without:images',
            'images'   => 'nullable|array|max:3',
            'images.*' => 'image|mimes:jpg,jpeg,png,webp|max:5120',
        ], ['body.required_without' => 'Write a message or add a photo.'])->validate();

        $update = DB::transaction(function () use ($r, $u, $role, $data, $images, $internal) {
            $changes = ['last_activity_at' => now()];
            $statusTo = null;
            if (! $internal && ! $r->isClosed()) {
                if ($role === 'reporter') {
                    $changes['waiting_on'] = 'handler';
                } elseif ($role === 'store_handler') {
                    // New → Under Review on the handler's first reply
                    if ($r->status === UserReport::PENDING) {
                        $statusTo = $changes['status'] = UserReport::IN_PROGRESS;
                    }
                    $changes['store_first_response_at'] = $r->store_first_response_at ?? now();
                    if (! $r->isEscalated()) {
                        $changes['waiting_on'] = 'reporter';   // escalated: the admin still has to act
                    }
                } elseif ($role === 'admin' && ($r->route === 'admin' || $r->isEscalated())) {
                    // On a store-handled report the admin just comments: the store still owes a reply
                    $changes['waiting_on'] = 'reporter';
                    if ($r->status === UserReport::PENDING) {
                        $statusTo = $changes['status'] = UserReport::IN_PROGRESS;
                    }
                }
            }

            $update = $r->updates()->create([
                'author_id'   => $u->id,
                'author_side' => static::authorSide($r, $role),
                'body'        => $data['body'] ?? null,
                'attachments' => collect($images)->map(fn (UploadedFile $f) => $f->store('reports/updates', 'public'))->values()->all() ?: null,
                'is_internal' => $internal,
                'status_to'   => $statusTo,
            ]);
            $r->update($changes);

            return $update;
        });

        if (! $internal) {
            $who = static::actorLabel($r, $u, $role);
            if ($role === 'reporter') {
                static::notifyHandlers($r, "New reply on a report: {$r->categoryLabel()}", "{$who}: " . static::preview($update), $u->id);
            } else {
                static::notifyReporter($r, 'New reply on your report', "{$who}: " . static::preview($update), $u->id);
            }
        }
        static::broadcast($r, $internal);

        return $update;
    }

    // ── Status steps ──────────────────────────────────────────────────────────

    public static function startReview(UserReport $r, User $u): void
    {
        abort_unless(static::canView($r, $u), 403);
        if (! static::flags($r, $u)['can_start_review']) {
            throw ValidationException::withMessages(['status' => "This report can't be moved to Under Review right now."]);
        }
        static::changeStep($r, $u, UserReport::IN_PROGRESS, null);
    }

    public static function startInvestigating(UserReport $r, User $u, ?string $note = null): void
    {
        abort_unless(static::canView($r, $u), 403);
        if (! static::flags($r, $u)['can_start_investigating']) {
            throw ValidationException::withMessages(['status' => "This report can't be moved to Investigating right now."]);
        }
        $note = trim((string) $note);
        if (mb_strlen($note) > 1000) {
            throw ValidationException::withMessages(['note' => 'Please keep the note under 1000 characters.']);
        }
        static::changeStep($r, $u, UserReport::INVESTIGATING, $note !== '' ? $note : null);
    }

    /** Under Review / Investigating step, with an optional note from the handler. Keeps waiting_on 'handler'. */
    private static function changeStep(UserReport $r, User $u, string $to, ?string $note): void
    {
        $role = static::roleOf($r, $u);
        $who  = static::actorLabel($r, $u, $role);
        DB::transaction(function () use ($r, $u, $role, $to, $note, $who) {
            $changes = ['status' => $to, 'waiting_on' => 'handler', 'last_activity_at' => now()];
            if ($role === 'store_handler') {
                $changes['store_first_response_at'] = $r->store_first_response_at ?? now();   // the store is working on it
            }
            $r->update($changes);
            static::systemUpdate($r, 'Status changed to ' . self::STATUS_LABELS[$to] . " by {$who}.", $to);
            if ($note) {
                $r->updates()->create(['author_id' => $u->id, 'author_side' => static::authorSide($r, $role), 'body' => $note]);
            }
        });
        static::notifyReporter($r, 'Report update: ' . self::STATUS_LABELS[$to],
            "Your report ({$r->categoryLabel()}) is now " . self::STATUS_LABELS[$to] . '.', $u->id);
        static::broadcast($r);
    }

    /** Handler proposes how it was solved (photo needed for physical problems) → "Resolution". */
    public static function proposeResolution(UserReport $r, User $u, ?string $note, array $photos = []): void
    {
        abort_unless(static::canView($r, $u), 403);
        $flags = static::flags($r, $u);
        if (! $flags['can_propose_resolution']) {
            throw ValidationException::withMessages(['note' => "A resolution can't be proposed on this report right now."]);
        }
        $data = Validator::make(['note' => $note, 'photos' => $photos], [
            'note'     => 'required|string|max:1000',
            'photos'   => ($flags['proposal_needs_photo'] ? 'required|array|min:1' : 'nullable|array') . '|max:3',
            'photos.*' => 'image|mimes:jpg,jpeg,png,webp|max:5120',
        ], [
            'note.required'   => 'Please say what was done to solve it.',
            'photos.required' => 'Please add a photo showing the fix.',
            'photos.min'      => 'Please add a photo showing the fix.',
        ])->validate();

        $role = static::roleOf($r, $u);
        DB::transaction(function () use ($r, $u, $role, $data, $photos) {
            $paths = collect($photos)->map(fn (UploadedFile $f) => $f->store('reports/resolutions', 'public'))->values()->all();
            $changes = [
                'status'                 => UserReport::AWAITING,
                'resolution'             => $data['note'],
                'resolution_photos'      => $paths ?: null,
                'resolution_proposed_at' => now(),
                'waiting_on'             => 'reporter',
                'last_activity_at'       => now(),
            ];
            if ($role === 'store_handler') {
                $changes['store_marked_fixed_at']   = now();
                $changes['store_first_response_at'] = $r->store_first_response_at ?? now();
            }
            $r->update($changes);
            $r->updates()->create([
                'author_id' => $u->id, 'author_side' => static::authorSide($r, $role),
                'body' => "Proposed resolution: {$data['note']}", 'attachments' => $paths ?: null, 'status_to' => UserReport::AWAITING,
            ]);
        });

        $who = static::actorLabel($r, $u, $role);
        static::notifyReporter($r, 'Is your problem solved?', "{$who} proposed a resolution for your report. Please confirm.", $u->id);
        static::broadcast($r);
    }

    /** Reporter: "Yes, it's solved". */
    public static function confirmFixed(UserReport $r, User $u): void
    {
        abort_unless(static::roleOf($r, $u) === 'reporter', 403);
        if ($r->status !== UserReport::AWAITING) {
            throw ValidationException::withMessages(['status' => 'This report is not waiting for your confirmation.']);
        }
        DB::transaction(function () use ($r, $u) {
            $r->update([
                'status' => UserReport::RESOLVED, 'resolved_at' => now(), 'resolved_by' => $u->id,
                'reporter_confirmed_at' => now(), 'waiting_on' => null, 'last_activity_at' => now(),
                'verdict' => $r->isSystem() ? 'fixed' : 'solved', 'verdict_by' => null, 'verdict_at' => now(),
            ]);
            static::systemUpdate($r, 'The reporter confirmed the problem is solved.', UserReport::RESOLVED);
        });
        static::notifyHandlers($r, 'Report resolved', "The reporter confirmed the problem is solved ({$r->categoryLabel()}).", $u->id);
        static::broadcast($r);
    }

    /** Reporter: "Not solved" → back to Investigating (and, for store-handled customer reports, to the admin). */
    public static function notSolved(UserReport $r, User $u, ?string $reason): void
    {
        abort_unless(static::roleOf($r, $u) === 'reporter', 403);
        if ($r->status !== UserReport::AWAITING) {
            throw ValidationException::withMessages(['reason' => 'This report is not waiting for your confirmation.']);
        }
        $reason = static::requireText($reason, 'reason', 'Please tell us what is still wrong.', 1000);
        $toAdmin = ! $r->isSystem() && $r->reporter_side === 'customer' && in_array($r->route, ['store', 'both'], true) && ! $r->isEscalated();

        DB::transaction(function () use ($r, $u, $reason) {
            // Photos stay visible in the timeline update of the proposal
            $r->update(['resolution_photos' => null, 'resolution_proposed_at' => null, 'last_activity_at' => now()]);
            $r->updates()->create(['author_id' => $u->id, 'author_side' => static::authorSide($r, 'reporter'),
                'body' => "Not solved: {$reason}", 'status_to' => UserReport::INVESTIGATING]);
        });
        if ($toAdmin) {
            static::doEscalate($r, $u, 'reporter', $reason);
        }
        $r->refresh()->update(['status' => UserReport::INVESTIGATING, 'waiting_on' => 'handler', 'last_activity_at' => now()]);

        if (! $toAdmin) {
            static::notifyHandlers($r, "Not solved: {$r->categoryLabel()}", "The reporter says the problem is not solved: {$reason}", $u->id);
        }
        static::broadcast($r);
    }

    /** Customer "Send to admin" (store hasn't solved it after 24 h). Automatic sending uses source 'auto'. */
    public static function escalate(UserReport $r, ?User $u, string $source, ?string $reason = null): void
    {
        if ($source === 'reporter') {
            abort_unless($u && static::flags($r, $u)['can_escalate'], 403);
            $reason = static::requireText($reason, 'reason', 'Please tell the admin what is still wrong.', 1000);
        }
        static::doEscalate($r, $u, $source, $reason);
    }

    private static function doEscalate(UserReport $r, ?User $u, string $source, ?string $reason): void
    {
        if ($r->isEscalated() || $r->isClosed()) {
            return;   // idempotent (scheduled command)
        }
        $note = $source === 'auto'
            ? 'Sent to the platform admin because the store did not reply within 48 hours.'
            : "Sent to the platform admin by the customer: {$reason}";
        $keepStatus = $r->status === UserReport::INVESTIGATING;
        DB::transaction(function () use ($r, $source, $reason, $note, $keepStatus) {
            $r->update([
                'escalated_at' => now(), 'escalation_source' => $source, 'escalation_reason' => $reason,
                'status' => $keepStatus ? UserReport::INVESTIGATING : UserReport::IN_PROGRESS,
                'waiting_on' => 'handler', 'last_activity_at' => now(),
            ]);
            static::systemUpdate($r, $note, $keepStatus ? null : UserReport::IN_PROGRESS);
        });

        $actor = $u?->id;
        $label = $r->categoryLabel();
        static::notify(static::adminIds(), 'admin', $r, ($r->is_urgent ? 'URGENT: ' : '') . "Report sent to admin: {$label}", $note, $actor);
        if ($source === 'auto') {
            static::notifyReporter($r, 'Your report is now with the admin', $note, $actor);
        }
        if (static::storeCanView($r)) {
            static::notify(static::storeHandlerIds($r->reported_store_id), 'seller', $r, "Report sent to admin: {$label}", $note, $actor);
        }
        static::broadcast($r);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /** "Remind the store" — at most once per hour (checked under a row lock). */
    public static function remindStore(UserReport $r, User $admin): void
    {
        abort_unless($admin->isAdmin(), 403);
        if (! static::flags($r, $admin)['can_remind_store']) {
            throw ValidationException::withMessages(['remind' => "The store can't be reminded about this report."]);
        }
        DB::transaction(function () use ($r) {
            $locked = UserReport::whereKey($r->id)->lockForUpdate()->first();
            if ($locked->store_reminded_at && $locked->store_reminded_at->gt(now()->subHour())) {
                throw ValidationException::withMessages(['remind' => 'The store was already reminded in the last hour.']);
            }
            $locked->update(['store_reminded_at' => now(), 'last_activity_at' => now()]);
            static::systemUpdate($locked, 'The admin reminded the store to respond.');
        });
        $r->refresh();
        static::notify(static::storeHandlerIds($r->reported_store_id), 'seller', $r,
            ($r->category === 'gas_leak' ? 'URGENT: ' : '') . "Admin reminder: please respond to report #{$r->id} — {$r->categoryLabel()}",
            'The platform admin asked your store to respond to this report as soon as possible.', $admin->id);
        static::broadcast($r);
    }

    /** "Send to store to fix": an admin-only customer report the store must physically fix. */
    public static function handToStore(UserReport $r, User $admin): void
    {
        abort_unless($admin->isAdmin(), 403);
        if (! static::flags($r, $admin)['can_hand_to_store']) {
            throw ValidationException::withMessages(['route' => 'Only open customer reports that only the admin can see can be sent to the store.']);
        }
        DB::transaction(function () use ($r) {
            $r->update([
                'route' => 'store', 'escalated_at' => null, 'escalation_source' => null, 'escalation_reason' => null,
                'store_assigned_at' => now(), 'store_first_response_at' => null,
                'waiting_on' => 'handler', 'status' => UserReport::PENDING, 'last_activity_at' => now(),
            ]);
            static::systemUpdate($r, 'The admin asked the store to handle this report.', UserReport::PENDING);
        });

        $store = $r->reportedStore?->store_name ?? 'the store';
        static::notify(static::storeHandlerIds($r->reported_store_id), 'seller', $r, "New customer report: {$r->categoryLabel()}",
            'The platform admin asked your store to handle this report.', $admin->id);
        static::notifyReporter($r, 'Your report was passed to the store', "Your report was passed to {$store} to resolve.", $admin->id);
        static::broadcast($r);
    }

    /** Outcomes the admin can choose when closing this report. */
    public static function closeOutcomes(UserReport $r): array
    {
        $keys = match (true) {
            $r->isSystem()                    => ['fixed', 'cannot_reproduce', 'not_a_problem'],
            $r->reporter_side === 'customer'  => array_values(array_filter(
                ['store_at_fault', 'rider_at_fault', 'false_report', 'not_enough_proof', 'solved'],
                fn ($k) => $k !== 'rider_at_fault' || ($r->reported_rider_id || $r->order?->delivery?->rider_id))),
            default                           => ['customer_at_fault', 'false_report', 'not_enough_proof', 'solved'],
        };

        return array_map(fn ($k) => ['key' => $k, 'label' => self::VERDICT_LABELS[$k]], $keys);
    }

    /**
     * "Close report" — the only way an admin closes a report. Outcome + reason (shown to both sides).
     * Creates warnings; a customer's 3rd false report suspends the account (customers only).
     */
    public static function closeReport(UserReport $r, User $admin, ?string $outcome, ?string $reason, ?string $safetyNote = null): void
    {
        abort_unless($admin->isAdmin(), 403);
        if (! in_array($outcome, array_column(static::closeOutcomes($r), 'key'), true)) {
            throw ValidationException::withMessages(['outcome' => 'Please choose an outcome.']);
        }
        $reason = trim((string) $reason);
        if (mb_strlen($reason) < 10 || mb_strlen($reason) > 2000) {
            throw ValidationException::withMessages(['reason' => 'Please write a reason of at least 10 characters (both sides will see it).']);
        }
        $safetyNote = trim((string) $safetyNote);

        $effects = DB::transaction(function () use ($r, $admin, $outcome, $reason, $safetyNote) {
            $locked = UserReport::with('order.delivery')->whereKey($r->id)->lockForUpdate()->first();
            if ($locked->isClosed()) {
                throw ValidationException::withMessages(['outcome' => 'This report was already closed.']);
            }
            if (static::needsSafetyNote($locked) && mb_strlen($safetyNote) < 10) {
                throw ValidationException::withMessages(['safety_note' => 'Please write a safety note: what was confirmed and with whom (at least 10 characters).']);
            }

            $changes = [
                'status'      => in_array($outcome, self::DISMISS_VERDICTS, true) ? UserReport::DISMISSED : UserReport::RESOLVED,
                'verdict'     => $outcome, 'verdict_by' => $admin->id, 'verdict_at' => now(),
                'resolution'  => $reason, 'resolved_at' => now(), 'resolved_by' => $admin->id,
                'waiting_on'  => null, 'last_activity_at' => now(),
            ];
            if ($outcome === 'rider_at_fault' && ! $locked->reported_rider_id) {
                $changes['reported_rider_id'] = $locked->order?->delivery?->rider_id;
            }
            $locked->update($changes);
            $locked->updates()->create([
                'author_id' => $admin->id, 'author_side' => 'admin', 'status_to' => $changes['status'],
                'body' => 'Closed — ' . self::VERDICT_LABELS[$outcome] . ": {$reason}" . ($safetyNote !== '' ? "\nSafety note: {$safetyNote}" : ''),
            ]);

            return $outcome === 'false_report' && $locked->reporter_side === 'customer' && ! $locked->isSystem()
                ? static::applyFalseReport($locked, $admin) : null;
        });

        $r->refresh();
        $label = self::VERDICT_LABELS[$outcome];
        static::notifyReporter($r, "Report closed: {$label}", "{$r->categoryLabel()}: {$reason}", $admin->id);
        if (static::storeCanView($r) && $r->reporter_side !== 'store') {
            static::notify(static::storeHandlerIds($r->reported_store_id), 'seller', $r, "Report closed: {$label}", "{$r->categoryLabel()}: {$reason}", $admin->id);
        }
        if ($effects) {
            static::notifyFalseReport($r, $effects);
        }
        static::notifyStoreWarning($r, $outcome, $reason);
        static::broadcast($r);
    }

    /**
     * Inside the close transaction: lock the reporter, count their false reports and suspend at 3+
     * (role 'customer' only — a store owner's account also runs their store).
     */
    private static function applyFalseReport(UserReport $r, User $admin): array
    {
        $reporter = User::withTrashed()->whereKey($r->reporter_id)->lockForUpdate()->first();
        $ids = UserReport::where('reporter_id', $r->reporter_id)->where('reporter_side', 'customer')
            ->where('verdict', 'false_report')->orderBy('id')->pluck('id');
        $count = $ids->count();
        $suspended = false;

        if ($count >= 3 && $reporter && $reporter->role === 'customer' && $reporter->is_active) {
            $suspended = AccountService::suspend($reporter, $admin, 'Repeated false reports',
                'Reports: ' . $ids->map(fn ($id) => "#{$id}")->implode(', '));
        }

        return ['count' => $count, 'suspended' => $suspended, 'is_customer_role' => $reporter?->role === 'customer', 'name' => $reporter?->name];
    }

    private static function notifyFalseReport(UserReport $r, array $e): void
    {
        $n = $e['count'];
        $msg = match (true) {
            $n === 1 => "Warning 1 of 3: your report #{$r->id} was found to be false. Repeated false reports will lead to account suspension.",
            $n === 2 => "Final warning (2 of 3): your report #{$r->id} was found to be false. One more false report will suspend your account.",
            $e['suspended'] => "Your account was suspended because your report #{$r->id} was your " . static::ordinal($n) . ' false report.',
            default  => "Your report #{$r->id} was found to be false. You have {$n} false reports.",
        };
        static::notify([$r->reporter_id], 'customer', $r, $n >= 3 ? 'Account notice: false reports' : 'Warning: false report', $msg, null);

        if ($n >= 3 && ! $e['is_customer_role']) {
            static::notify(static::adminIds(), 'admin', $r, 'Please review an account',
                "{$e['name']} has reached {$n} false reports — please review their account manually.", null);
        }
    }

    /** Valid complaints warn the store (never suspend). Admin-only complaints: no details at all. */
    private static function notifyStoreWarning(UserReport $r, string $outcome, string $reason): void
    {
        if ($r->isSystem() || ! $r->reported_store_id) {
            return;
        }
        $valid = in_array($outcome, ['store_at_fault', 'rider_at_fault'], true) && $r->reporter_side === 'customer';
        $falseByStore = $outcome === 'false_report' && in_array($r->reporter_side, ['store', 'rider'], true);
        if (! $valid && ! $falseByStore) {
            return;
        }
        $ids = static::storeHandlerIds($r->reported_store_id);

        if (! static::storeCanView($r)) {
            // The store must never learn who filed an admin-only report
            try {
                foreach ($ids as $id) {
                    NotificationService::send($id, 'user_report', 'Warning from the platform admin',
                        'Warning: the platform admin confirmed a customer complaint about your store. Please review how your team serves customers.', []);
                }
            } catch (\Throwable $e) {
                Log::warning('Store warning notification failed', ['report_id' => $r->id, 'error' => $e->getMessage()]);
            }

            return;
        }
        $msg = $falseByStore
            ? "Warning: a report your store filed (#{$r->id}) was found to be false — {$reason}"
            : "Warning: a report about your store (#{$r->id}) was found valid — {$reason}. Please respond to and solve customer problems quickly.";
        static::notify($ids, 'seller', $r, 'Warning from the platform admin', $msg, null);
    }

    public static function withdraw(UserReport $r, User $u): void
    {
        abort_unless(static::roleOf($r, $u) === 'reporter', 403);
        if ($r->category === 'gas_leak') {
            throw ValidationException::withMessages(['status' => "Safety reports can't be withdrawn."]);
        }
        if (! static::flags($r, $u)['can_withdraw']) {
            throw ValidationException::withMessages(['status' => 'This report can no longer be withdrawn.']);
        }
        DB::transaction(function () use ($r, $u) {
            $r->update([
                'status' => UserReport::DISMISSED, 'resolution' => 'Withdrawn by the reporter.', 'resolved_at' => now(),
                'resolved_by' => $u->id, 'waiting_on' => null, 'last_activity_at' => now(),
                'verdict' => 'withdrawn', 'verdict_at' => now(),
            ]);
            static::systemUpdate($r, 'The report was withdrawn.', UserReport::DISMISSED);
        });
        static::notifyHandlers($r, 'Report withdrawn', "A report was withdrawn ({$r->categoryLabel()}).", $u->id);
        static::broadcast($r);
    }

    /** Scheduled: close a proposed resolution the reporter didn't answer within 72 h. */
    public static function autoClose(UserReport $r): void
    {
        if ($r->status !== UserReport::AWAITING) {
            return;
        }
        DB::transaction(function () use ($r) {
            $r->update([
                'status' => UserReport::RESOLVED, 'resolved_at' => now(), 'waiting_on' => null, 'last_activity_at' => now(),
                'verdict' => $r->isSystem() ? 'fixed' : 'solved', 'verdict_by' => null, 'verdict_at' => now(),
            ]);
            static::systemUpdate($r, 'Closed automatically because there was no reply within 3 days.', UserReport::RESOLVED);
        });
        static::notifyReporter($r, 'Report closed', "Your report ({$r->categoryLabel()}) was closed because there was no reply within 3 days.", null);
        if (static::storeCanView($r)) {
            static::notify(static::storeHandlerIds($r->reported_store_id), 'seller', $r, 'Report closed',
                "A report your store resolved was closed automatically ({$r->categoryLabel()}).", null);
        }
        static::broadcast($r);
    }

    // ── Warnings ─────────────────────────────────────────────────────────────

    public static function customerFalseReports(int $userId): int
    {
        return UserReport::where('reporter_id', $userId)->where('reporter_side', 'customer')->where('verdict', 'false_report')->count();
    }

    /** Valid complaints about the store + false reports it (or its riders) filed, last 90 days. */
    public static function storeWarnings(int $storeId): int
    {
        return UserReport::where('reported_store_id', $storeId)->where('verdict_at', '>=', now()->subDays(90))
            ->where(fn ($q) => $q->whereIn('verdict', ['store_at_fault', 'rider_at_fault'])
                ->orWhere(fn ($w) => $w->where('verdict', 'false_report')->whereIn('reporter_side', ['store', 'rider'])))
            ->count();
    }

    public static function riderWarnings(int $riderId): int
    {
        return UserReport::where('reported_rider_id', $riderId)->where('verdict', 'rider_at_fault')
            ->where('verdict_at', '>=', now()->subDays(90))->count();
    }

    // ── Queues & badges ───────────────────────────────────────────────────────

    /** Customer / rider reports the store must answer now. */
    public static function storeNeedsActionQuery(int $storeId): Builder
    {
        return UserReport::query()
            ->whereIn('route', ['store', 'both'])->where('reported_store_id', $storeId)
            ->where('waiting_on', 'handler')->whereNull('escalated_at')
            ->whereNotIn('status', [UserReport::RESOLVED, UserReport::DISMISSED])
            ->whereIn('reporter_side', ['customer', 'rider'])
            ->where('type', '!=', UserReport::SYSTEM_TYPE);
    }

    public static function storeNeedsAction(int $storeId): int
    {
        return static::storeNeedsActionQuery($storeId)->count();
    }

    /**
     * Reports the admin must act on: admin-only (incl. website problems) or sent-to-admin ones waiting
     * on a handler, plus every open 'both' report (gas leak, paid-not-delivered, rider reports).
     */
    public static function adminNeedsActionQuery(): Builder
    {
        return UserReport::query()
            ->whereNotIn('status', [UserReport::RESOLVED, UserReport::DISMISSED])
            ->where(fn ($q) => $q
                ->where(fn ($w) => $w->where('waiting_on', 'handler')->where(fn ($x) => $x->where('route', 'admin')->orWhereNotNull('escalated_at')))
                ->orWhere('route', 'both'));
    }

    /**
     * Open store-handled reports (route store/both, not sent to the admin) with the time of the store's
     * last activity: its latest reply / step (report_updates by the store side) or its first response,
     * whichever is later. One subquery — no N+1.
     */
    public static function monitoringQuery(): Builder
    {
        return UserReport::query()
            ->select('user_reports.*')
            ->selectRaw("NULLIF(GREATEST(
                COALESCE((SELECT MAX(u.created_at) FROM report_updates u WHERE u.user_report_id = user_reports.id AND u.author_side = 'store'), '1970-01-01'),
                COALESCE(user_reports.store_first_response_at, '1970-01-01')
            ), '1970-01-01') AS last_store_activity_at")
            ->whereIn('route', ['store', 'both'])
            ->whereNull('escalated_at')
            ->whereNotIn('status', [UserReport::RESOLVED, UserReport::DISMISSED])
            ->where('type', '!=', UserReport::SYSTEM_TYPE);
    }

    /** Once per report: tell admins a store-handled report has had no store activity for 24 hours. */
    public static function alertAdminsIdle(UserReport $r): void
    {
        $sent = UserReport::whereKey($r->id)->whereNull('admin_idle_alert_sent_at')->update(['admin_idle_alert_sent_at' => now()]);
        if (! $sent) {
            return;   // another run already alerted
        }
        $r->loadMissing('reportedStore', 'order');
        static::notify(static::adminIds(), 'admin', $r, "Store hasn't responded for 24 hours: report #{$r->id}",
            trim(($r->reportedStore?->store_name ?? 'Store') . " · {$r->categoryLabel()}" . ($r->order ? " · {$r->order->order_number}" : '')), null);
    }

    /** The monitoring rows as a derived table, so last_store_activity_at can be sorted / filtered. */
    public static function monitoringList(): Builder
    {
        return UserReport::query()->fromSub(static::monitoringQuery(), 'user_reports')->select('user_reports.*');
    }

    /** "Idle since": the store's last activity, else when the store got the report. */
    public static function idleSinceSql(): string
    {
        return 'COALESCE(user_reports.last_store_activity_at, user_reports.store_assigned_at, user_reports.created_at)';
    }

    public static function adminNeedsAction(): int
    {
        return static::adminNeedsActionQuery()->count();
    }

    /** Sidebar badges — only queried for the roles that see them. */
    public static function badgesFor(?User $u): array
    {
        if (! $u) {
            return ['store' => 0, 'admin' => 0];
        }
        $storeId = ChatService::storeIdFor($u);

        return [
            'store' => $storeId && static::isStoreHandler($u, $storeId) ? static::storeNeedsAction($storeId) : 0,
            'admin' => $u->isAdmin() ? static::adminNeedsAction() : 0,
        ];
    }

    // ── Recipients, notifications, live updates ──────────────────────────────

    public static function adminIds(): array
    {
        return User::where(fn ($q) => $q->whereIn('role', ['platform_admin', 'admin'])->orWhere('is_admin', true))
            ->pluck('id')->all();   // SoftDeletes excludes deleted users
    }

    /** Store owner + active non-rider staff with customer_reports.manage (same pattern as ChatService::storeRecipients). */
    public static function storeHandlerIds(?int $storeId): array
    {
        if (! $storeId) {
            return [];
        }
        $ownerId = Store::whereKey($storeId)->value('user_id');
        $staff   = User::where('store_id', $storeId)->where('role', 'seller_staff')
            ->where(fn ($q) => $q->whereNull('sub_role')->orWhere('sub_role', '!=', 'rider'))
            ->where('is_active', true)->get()
            ->filter(fn (User $u) => $u->hasPermission('customer_reports.manage'))
            ->pluck('id')->all();

        return array_values(array_unique(array_filter([$ownerId, ...$staff])));
    }

    /** Reporter side recipients: the reporter — or, for store-filed reports, all store handlers. */
    private static function reporterRecipients(UserReport $r): array
    {
        if ($r->isSystem()) {
            return [[$r->reporter_id], $r->reporter_side === 'store' ? 'seller' : $r->reporter_side];
        }

        return $r->reporter_side === 'store'
            ? [static::storeHandlerIds($r->reported_store_id), 'seller']
            : [[$r->reporter_id], $r->reporter_side];   // 'customer' | 'rider' portal
    }

    private static function notifyReporter(UserReport $r, string $title, string $msg, ?int $exceptId): void
    {
        [$ids, $portal] = static::reporterRecipients($r);
        static::notify($ids, $portal, $r, $title, $msg, $exceptId);
    }

    /** Whoever currently handles the report: the store (store-handled, not sent to admin) and/or admins. */
    private static function notifyHandlers(UserReport $r, string $title, string $msg, ?int $exceptId): void
    {
        $storeHandled = in_array($r->route, ['store', 'both'], true);
        if ($storeHandled && ! $r->isEscalated() && $r->reporter_side !== 'store' && static::storeCanView($r)) {
            static::notify(static::storeHandlerIds($r->reported_store_id), 'seller', $r, $title, $msg, $exceptId);
        }
        if (in_array($r->route, ['admin', 'both'], true) || $r->isEscalated()) {
            static::notify(static::adminIds(), 'admin', $r, $title, $msg, $exceptId);
        }
    }

    private static function notify(array $ids, string $portal, UserReport $r, string $title, string $msg, ?int $exceptId): void
    {
        try {
            $link = static::linkFor($r, $portal);
            foreach (array_unique($ids) as $id) {
                if ($id && $id !== $exceptId) {
                    NotificationService::send((int) $id, 'user_report', $title, Str::limit($msg, 200), ['report_id' => $r->id, 'link' => $link]);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Report notification failed', ['report_id' => $r->id, 'error' => $e->getMessage()]);
        }
    }

    public static function linkFor(UserReport $r, string $portal): string
    {
        return match ($portal) {
            'admin'  => "/admin/user-reports/{$r->id}",
            'seller' => $r->isSystem() ? "/seller/website-reports/{$r->id}" : "/seller/customer-reports/{$r->id}",
            'rider'  => "/rider/reports/{$r->id}",
            default  => "/customer/reports/{$r->id}",
        };
    }

    /** Live refresh for everyone who can see the report — per-user channels only (never store.{id}). */
    private static function broadcast(UserReport $r, bool $adminsOnly = false): void
    {
        try {
            $ids = static::adminIds();
            if (! $adminsOnly) {
                $ids = [...$ids, ...static::reporterRecipients($r)[0]];
                if (static::storeCanView($r)) {
                    $ids = [...$ids, ...static::storeHandlerIds($r->reported_store_id)];
                }
            }
            $r->refresh();
            Realtime::send(new ReportUpdated([
                'report_id' => $r->id, 'status' => $r->status, 'waiting_on' => $r->waiting_on, 'is_urgent' => (bool) $r->is_urgent,
            ], array_map(fn ($id) => "user.{$id}", array_values(array_unique(array_filter($ids))))));
        } catch (\Throwable $e) {
            Log::warning('Report live update failed', ['report_id' => $r->id, 'error' => $e->getMessage()]);
        }
    }

    // ── Presentation ──────────────────────────────────────────────────────────

    /** Short row for list pages. */
    public static function presentListItem(UserReport $r, User $viewer, string $portal): array
    {
        $role = static::roleOf($r, $viewer);

        return [
            'id'               => $r->id,
            'category'         => $r->category,
            'category_label'   => $r->categoryLabel(),
            'route'            => $r->route,
            'reporter_side'    => $r->reporter_side,
            'is_system'        => $r->isSystem(),
            'system_area'      => $r->system_area,
            'is_urgent'        => (bool) $r->is_urgent,
            'status'           => $r->status,
            'status_label'     => static::statusLabel($r, $role),
            'verdict'          => $r->verdict,
            'verdict_label'    => $r->verdict ? (self::VERDICT_LABELS[$r->verdict] ?? $r->verdict) : null,
            'waiting_on'       => $r->waiting_on,
            'escalated'        => $r->isEscalated(),
            'subject'          => $r->subject,
            'order_number'     => $r->order?->order_number,
            'store'            => $r->reportedStore ? ['id' => $r->reportedStore->id, 'name' => $r->reportedStore->store_name] : null,
            'reporter'         => ['name' => static::reporterName($r), 'side' => $r->reporter_side, 'role' => $r->reporter?->role],
            'target'           => static::target($r),
            'screenshots'      => count($r->evidence_paths ?? []),
            'page_url'         => $portal === 'admin' ? $r->page_url : null,
            'created_at'       => $r->created_at?->format('M d, Y g:i A'),
            'last_activity_at' => ($r->last_activity_at ?? $r->updated_at)?->toIso8601String(),
            'link'             => static::linkFor($r, $portal),
        ];
    }

    /** Full report for a detail page, filtered for the viewer (internal notes / admin data only for admins). */
    public static function present(UserReport $r, User $viewer, string $portal): array
    {
        $r->loadMissing(['reporter', 'reportedStore', 'order', 'reportedRider', 'reportedCustomer', 'reportedProduct', 'updates.author']);
        $role    = static::roleOf($r, $viewer);
        $isAdmin = $role === 'admin';
        $cfg     = $r->categoryConfig();

        $data = static::presentListItem($r, $viewer, $portal) + [
            'description'       => $r->description,
            'evidence_urls'     => collect($r->evidence_paths ?? [])->map(fn ($p) => Storage::url($p))->values()->all(),
            'resolution_photos' => collect($r->resolution_photos ?? [])->map(fn ($p) => Storage::url($p))->values()->all(),
            'escalation_reason' => $r->escalation_reason,
            'resolution'        => $r->resolution,
            'offers_refund'     => ! $r->isSystem() && (bool) ($cfg['offers_refund'] ?? false),
            'viewer_role'       => $role,
            'steps'             => static::steps($r),
            'order'             => $r->order ? [
                'id'           => $r->order->id,
                'order_number' => $r->order->order_number,
                'link'         => match ($portal) {
                    'customer' => "/customer/orders/{$r->order->id}",
                    'seller'   => "/seller/orders/{$r->order->id}",
                    default    => null,
                },
            ] : null,
            'flags'             => static::flags($r, $viewer),
            'quick_replies'     => static::quickReplies($r, $viewer, $role),
            'updates'           => $r->updates
                ->filter(fn (ReportUpdate $u) => $isAdmin || ! $u->is_internal)
                ->map(fn (ReportUpdate $u) => [
                    'id'              => $u->id,
                    'author_side'     => $u->author_side,
                    'author_label'    => static::authorLabel($r, $u),
                    'author_staff'    => $u->author_side === 'store' && in_array($portal, ['seller', 'admin'], true) && $u->author
                        ? ChatService::firstName($u->author) : null,
                    'body'            => $u->body,
                    'attachment_urls' => $u->attachment_urls,
                    'is_internal'     => (bool) $u->is_internal,
                    'status_to'       => $u->status_to,
                    'created_at'      => $u->created_at?->format('M d, Y g:i A'),
                ])->values()->all(),
        ];

        // Warnings visible to this viewer
        if ($role === 'reporter' && $r->reporter_side === 'customer') {
            $data['my_false_reports'] = static::customerFalseReports($viewer->id);
        }
        if (($isAdmin || $role === 'store_handler' || ($role === 'reporter' && $r->reporter_side === 'store')) && $r->reported_store_id) {
            $data['store_warnings'] = $isAdmin || static::storeCanView($r) ? static::storeWarnings($r->reported_store_id) : null;
            $riderId = $r->reported_rider_id ?? $r->order?->delivery?->rider_id;
            $data['rider'] = $riderId ? [
                'name'     => ChatService::displayName(User::withTrashed()->find($riderId)),
                'warnings' => static::riderWarnings($riderId),
            ] : null;
        }
        // Order summary for the admin and the store (never for website problems)
        if ($r->order && ! $r->isSystem() && ($isAdmin || $role === 'store_handler' || ($role === 'reporter' && $r->reporter_side === 'store'))) {
            $data['order_summary'] = static::orderSummary($r->order, $portal, $viewer);
        }

        if ($isAdmin) {
            $data['admin'] = [
                'admin_notes'             => $r->admin_notes,
                'reporter_email'          => $r->reporter?->email,
                'reporter_phone'          => $r->reporter?->phone,
                'reported_email'          => $r->reportedRider?->email ?? $r->reportedCustomer?->email,
                'store_first_response_at' => $r->store_first_response_at?->format('M d, Y g:i A'),
                'escalation_source'       => $r->escalation_source,
                'page_url'                => $r->page_url,
                'user_agent'              => $r->user_agent,
                'store_id'                => $r->reported_store_id,
                'close_outcomes'          => static::closeOutcomes($r),
                'close_preview'           => static::closePreview($r),
            ];
        }

        return $data;
    }

    /** Five steps with the time each was reached (from the timeline). */
    private static function steps(UserReport $r): array
    {
        $current = self::STEP_INDEX[$r->status] ?? 0;
        $times = [0 => $r->created_at];
        foreach ($r->updates as $u) {
            if ($u->status_to !== null && isset(self::STEP_INDEX[$u->status_to])) {
                $i = self::STEP_INDEX[$u->status_to];
                $times[$i] ??= $u->created_at;
            }
        }

        return array_map(fn ($i) => [
            'label'   => self::STEP_LABELS[$i],
            'done'    => $i < $current || $current === 4,
            'current' => $i === $current,
            'at'      => $i <= $current ? ($times[$i] ?? null)?->format('M d, g:i A') : null,
        ], range(0, 4));
    }

    /** What closing as "False report" would do (for the admin's close dialog). */
    private static function closePreview(UserReport $r): ?array
    {
        if ($r->isSystem() || $r->reporter_side !== 'customer' || ! $r->reporter) {
            return null;
        }

        return [
            'reporter_name'    => $r->reporter->name,
            'next_false_count' => static::customerFalseReports($r->reporter_id) + 1,
            'is_customer_role' => $r->reporter->role === 'customer',
            'is_active'        => (bool) $r->reporter->is_active,
        ];
    }

    /** Order card for the admin and the store. Never shows cost prices. */
    private static function orderSummary(Order $o, string $portal, User $viewer): array
    {
        $o->loadMissing([
            'items.product' => fn ($q) => $q->withTrashed(),
            'delivery.rider', 'delivery.proofs',
        ]);
        $paid = match ($o->payment_status) {
            'paid'                  => $o->grandTotal(),
            'partial'               => (float) $o->down_payment_amount,
            'to_refund', 'refunded' => (float) $o->down_payment_amount > 0 ? (float) $o->down_payment_amount : $o->grandTotal(),
            default                 => 0.0,
        };
        $refund = $o->refundRequests()->latest()->first();
        $proof  = $o->delivery?->proofs->whereIn('status', ['delivered', 'failed'])->sortByDesc('id')->first();
        $canOpen = $portal === 'seller' && ($viewer->role === 'seller' || $viewer->hasPermission('orders.view'));

        return [
            'order_number'      => $o->order_number,
            'link'              => $canOpen ? "/seller/orders/{$o->id}" : null,
            'status'            => ucfirst(str_replace('_', ' ', (string) $o->status)),
            'ordered_at'        => ($o->ordered_at ?? $o->created_at)?->format('M d, Y g:i A'),
            'payment_method'    => $o->payment_method ? ucwords(str_replace('_', ' ', $o->payment_method)) : ($o->payment_mode === 'cod' ? 'Cash on delivery' : null),
            'payment_status'    => match ($o->payment_status) {
                'paid' => 'Paid', 'partial' => 'Partially paid', 'unpaid' => 'Not paid',
                'to_refund' => 'Refund pending', 'refunded' => 'Refunded', default => ucfirst((string) $o->payment_status),
            },
            'amount_paid'       => round($paid, 2),
            'grand_total'       => round($o->grandTotal(), 2),
            'remaining_balance' => (float) $o->remaining_balance > 0 ? (float) $o->remaining_balance : null,
            'balance_due_date'  => $o->balance_due_date?->format('M d, Y'),
            'items'             => $o->items->map(fn ($i) => [
                'name'       => $i->product?->name ?? 'Item',
                'quantity'   => (int) $i->quantity,
                'unit_price' => (float) $i->unit_price,
                'line_total' => round((float) $i->unit_price * (int) $i->quantity, 2),
            ])->values()->all(),
            'delivery'          => $o->delivery ? [
                'rider'        => $o->delivery->rider?->name,
                'status'       => ChatService::DELIVERY_LABELS[$o->delivery->status] ?? $o->delivery->status,
                'delivered_at' => $o->delivery->delivered_at?->format('M d, Y g:i A'),
                'proof_url'    => $proof?->photo_path ? Storage::url($proof->photo_path) : null,
            ] : null,
            'refund'            => $refund ? ['status' => ucfirst((string) $refund->status), 'amount' => (float) $refund->amount] : null,
        ];
    }

    /** Quick reply chips for the viewer: suggested (category / website), general, and the store's saved replies. */
    private static function quickReplies(UserReport $r, User $viewer, ?string $role): array
    {
        $key = match ($role) {
            'admin'         => 'admin',
            'store_handler' => 'store',
            'reporter'      => $r->reporter_side,   // customer | store | rider
            default         => null,
        };
        if (! $key) {
            return [];
        }
        $groups = [];
        $suggested = $r->isSystem() ? config("report_replies.system.{$key}", []) : config("report_replies.categories.{$r->category}.{$key}", []);
        if ($suggested) {
            $groups[] = ['group' => 'Suggested', 'items' => $suggested];
        }
        if (! $r->isSystem() && ($general = config("report_replies.common.{$key}", []))) {
            $groups[] = ['group' => 'General', 'items' => $general];
        }
        if ($key === 'store' && ($storeId = ChatService::storeIdFor($viewer))) {
            $saved = StoreQuickReply::where('store_id', $storeId)->orderBy('title')->get()
                ->map(fn ($q) => ['label' => $q->title, 'text' => $q->body])->all();
            if ($saved) {
                $groups[] = ['group' => 'Your saved replies', 'items' => $saved];
            }
        }

        return $groups;
    }

    public static function statusLabel(UserReport $r, ?string $role): string
    {
        return self::STATUS_LABELS[$r->status] ?? ucfirst(str_replace('_', ' ', (string) $r->status));
    }

    private static function reporterName(UserReport $r): string
    {
        return $r->reporter_side === 'store' && ! $r->isSystem()
            ? ($r->reportedStore?->store_name ?? 'Store')
            : ChatService::displayName($r->reporter);
    }

    private static function target(UserReport $r): array
    {
        if ($r->isSystem()) {
            return ['type' => 'platform', 'name' => 'Website'];
        }
        $name = match ($r->target_type) {
            'customer' => $r->reportedCustomer?->name ?? 'Customer',
            'rider'    => ChatService::displayName($r->reportedRider),
            'product'  => $r->reportedProduct?->name ?? 'Product from this order',
            default    => $r->reportedStore?->store_name ?? 'Store',
        };

        return ['type' => $r->target_type, 'name' => $name];
    }

    private static function authorSide(UserReport $r, ?string $role): string
    {
        return match ($role) {
            'admin'         => 'admin',
            'store_handler' => 'store',
            default         => $r->reporter_side,
        };
    }

    private static function authorLabel(UserReport $r, ReportUpdate $u): string
    {
        if ($r->isSystem() && $u->author_side !== 'admin' && $u->author_side !== 'system') {
            return ChatService::displayName($u->author);
        }

        return match ($u->author_side) {
            'store'  => $r->reportedStore?->store_name ?? 'Store',
            'rider'  => ChatService::displayName($u->author) . ' · Rider',
            'admin'  => 'Platform Admin',
            'system' => '',
            default  => ChatService::displayName($u->author),
        };
    }

    private static function actorLabel(UserReport $r, User $u, ?string $role): string
    {
        return match (true) {
            $role === 'admin'                                   => 'the platform admin',
            $role === 'store_handler'                           => $r->reportedStore?->store_name ?? 'the store',
            $r->reporter_side === 'store' && ! $r->isSystem()   => $r->reportedStore?->store_name ?? 'the store',
            $r->reporter_side === 'rider' && ! $r->isSystem()   => ChatService::displayName($u) . ' (Rider)',
            default                                             => ChatService::displayName($u),
        };
    }

    private static function preview(ReportUpdate $u): string
    {
        return $u->body ? Str::limit($u->body, 120) : '📷 Photo';
    }

    /** 1st, 2nd, 3rd, 4th, 11th, 21st … */
    public static function ordinal(int $n): string
    {
        $suffix = in_array($n % 100, [11, 12, 13], true) ? 'th' : (['th', 'st', 'nd', 'rd'][$n % 10] ?? 'th');

        return $n . $suffix;
    }

        private static function systemUpdate(UserReport $r, string $body, ?string $statusTo = null): void
    {
        $r->updates()->create(['author_id' => null, 'author_side' => 'system', 'body' => $body, 'status_to' => $statusTo]);
    }

    private static function requireText(?string $text, string $field, string $message, int $max = 2000): string
    {
        $text = trim((string) $text);
        if ($text === '') {
            throw ValidationException::withMessages([$field => $message]);
        }
        if (mb_strlen($text) > $max) {
            throw ValidationException::withMessages([$field => "Please keep it under {$max} characters."]);
        }

        return $text;
    }
}
