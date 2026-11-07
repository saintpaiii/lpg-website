<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Rating;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin → Reviews: moderate customer reviews (remove a photo, delete a review). Platform admin only (not platform staff).
 * Note: reviews removed by a database cascade (user / product / order deleted) leave their photo files on disk.
 */
class ReviewController extends Controller
{
    public function index(Request $request): Response
    {
        $this->ensureAdmin($request);

        $withPhotos = $request->boolean('with_photos');
        $stars      = (int) $request->get('rating', 0);
        $store      = trim((string) $request->get('store', ''));

        $reviews = Rating::with(['user:id,name,email', 'product:id,name,brand', 'store:id,store_name'])
            ->when($withPhotos, fn ($q) => $q->whereNotNull('photo_paths')->where('photo_paths', '!=', '[]'))
            ->when($stars >= 1 && $stars <= 5, fn ($q) => $q->where('rating', $stars))
            ->when($store !== '', fn ($q) => $q->whereHas('store', fn ($s) => $s->where('store_name', 'like', "%{$store}%")))
            ->latest()
            ->paginate(20)
            ->withQueryString()
            ->through(fn (Rating $r) => [
                ...$r->publicPayload(),
                'created_at'              => $r->created_at?->format('M d, Y g:i A'),
                'customer_name'           => $r->user?->name ?? 'Deleted user',
                'customer_email'          => $r->user?->email,
                'product_name'            => $r->product ? trim($r->product->name . ' · ' . $r->product->brand, ' ·') : '—',
                'store_name'              => $r->store?->store_name ?? '—',
                'photos_removed_by_admin' => (int) $r->photos_removed_by_admin,
            ]);

        return Inertia::render('admin/reviews', [
            'reviews' => $reviews,
            'filters' => ['with_photos' => $withPhotos, 'rating' => $stars ?: '', 'store' => $store],
        ]);
    }

    /** Remove one photo (by its index in photo_paths) and tell the author. */
    public function removePhoto(Request $request, Rating $rating, int $index): RedirectResponse
    {
        $this->ensureAdmin($request);

        $path = DB::transaction(function () use ($rating, $index) {
            $row   = Rating::whereKey($rating->id)->lockForUpdate()->first();
            $paths = $row?->photo_paths ?? [];
            if (! $row || ! array_key_exists($index, $paths)) {
                return null;
            }
            $path = $paths[$index];
            array_splice($paths, $index, 1);
            $row->update([
                'photo_paths'             => $paths ?: null,
                'photos_removed_by_admin' => (int) $row->photos_removed_by_admin + 1,
            ]);

            return $path;
        });

        if ($path === null) {
            return back()->with('error', 'That photo was already removed.');
        }

        Storage::disk('public')->delete($path);

        $product = $rating->product?->name ?? 'a product';
        NotificationService::send(
            $rating->user_id,
            'review_moderated',
            'A review photo was removed',
            "A photo in your review of {$product} was removed because it broke the review rules.",
            ['link' => '/customer/products/' . $rating->product_id]
        );

        return back()->with('success', 'Photo removed — the customer was told.');
    }

    /** Delete the review (reason required) and tell the author. */
    public function destroy(Request $request, Rating $rating): RedirectResponse
    {
        $this->ensureAdmin($request);

        $data = $request->validate([
            'reason' => 'required|string|max:500',
        ], ['reason.required' => 'Give a reason — the customer will see it.']);

        $product = $rating->product?->name ?? 'a product';
        $userId  = $rating->user_id;

        $rating->deletePhotoFiles();
        $rating->delete();

        NotificationService::send(
            $userId,
            'review_moderated',
            'Your review was removed',
            "Your review of {$product} was removed because it broke the review rules. Reason: {$data['reason']}",
            []
        );

        return back()->with('success', 'Review deleted — the customer was told.');
    }

    private function ensureAdmin(Request $request): void
    {
        // Platform admin only — platform staff (role admin + is_platform_staff) are refused
        abort_unless($request->user()?->isPlatformAdmin(), 403);
    }
}
