<?php

namespace App\Http\Controllers;

use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class NotificationController extends Controller
{
    /** GET /notifications — paginated list for the authenticated user. */
    public function index(Request $request): Response
    {
        $user      = $request->user();
        $paginator = NotificationService::getForUser($user->id, 20);

        $data = [
            'notifications' => $paginator->through(fn ($n) => [
                'id'         => $n->id,
                'type'       => $n->type,
                'title'      => $n->title,
                'message'    => $n->message,
                'data'       => $n->data,
                'read_at'    => $n->read_at?->toIso8601String(),
                'created_at' => $n->created_at->diffForHumans(),
            ]),
        ];

        // Customers use their own portal layout
        if ($user->role === 'customer') {
            return Inertia::render('customer/notifications', $data);
        }

        return Inertia::render('notifications/index', $data);
    }

    /** POST /notifications/{id}/read */
    public function markAsRead(Request $request, int $id): RedirectResponse
    {
        NotificationService::markAsRead($id, $request->user()->id);

        return back()->with('success', 'Notification marked as read.');
    }

    /** POST /notifications/read-all */
    public function markAllAsRead(Request $request): RedirectResponse
    {
        NotificationService::markAllAsRead($request->user()->id);

        return back()->with('success', 'All notifications marked as read.');
    }

    /** GET /notifications/unread-count — JSON (for client-side polling). */
    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json([
            'count' => NotificationService::getUnreadCount($request->user()->id),
        ]);
    }
}
