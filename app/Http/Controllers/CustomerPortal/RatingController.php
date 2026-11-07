<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Rating;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class RatingController extends Controller
{
    private const PHOTO_DIR   = 'reviews/photos';
    private const PHOTO_RULES = 'image|mimes:jpg,jpeg,png,webp|max:5120';

    private const PHOTO_MESSAGES = [
        'mimes'    => 'Photos must be JPG, PNG or WEBP.',
        'image'    => 'Photos must be JPG, PNG or WEBP.',
        'max'      => 'Each photo must be 5 MB or smaller.',
        'uploaded' => 'A photo failed to upload — it may be too big. Try a smaller photo.',
    ];

    public function store(Request $request, Order $order): RedirectResponse
    {
        $customer = Customer::where('user_id', $request->user()->id)->firstOrFail();

        if ($order->customer_id !== $customer->id) {
            abort(403);
        }

        if ($order->status !== 'delivered') {
            return back()->withErrors(['general' => 'You can only rate delivered orders.']);
        }

        $data = $request->validate([
            'ratings'                => 'required|array|min:1',
            'ratings.*.product_id'   => 'required|integer|exists:products,id',
            'ratings.*.rating'       => 'required|integer|min:1|max:5',
            'ratings.*.review'       => 'nullable|string|max:500',
            'ratings.*.photos'       => 'nullable|array|max:' . Rating::MAX_PHOTOS,
            'ratings.*.photos.*'     => self::PHOTO_RULES,
        ], $this->photoMessages('ratings.*.photos'));

        foreach ($data['ratings'] as $i => $item) {
            $existing = Rating::where('user_id', $request->user()->id)
                ->where('product_id', $item['product_id'])
                ->where('order_id', $order->id)
                ->exists();
            if ($existing) {
                continue; // firstOrCreate semantics: never a duplicate, never overwritten here (use Edit)
            }

            $paths = [];
            foreach ($request->file("ratings.$i.photos") ?? [] as $file) {
                $paths[] = $file->store(self::PHOTO_DIR, 'public');
            }

            $rating = Rating::firstOrCreate(
                [
                    'user_id'    => $request->user()->id,
                    'product_id' => $item['product_id'],
                    'order_id'   => $order->id,
                ],
                [
                    'store_id'    => $order->store_id,
                    'rating'      => $item['rating'],
                    'review'      => $item['review'] ?? null,
                    'photo_paths' => $paths ?: null,
                ]
            );

            // Lost a race to a parallel submit → our files aren't referenced by the row
            if (! $rating->wasRecentlyCreated) {
                foreach ($paths as $p) {
                    Storage::disk('public')->delete($p);
                }
            }
        }

        return back()->with('success', 'Thank you for your review!');
    }

    /** Author only, within Rating::EDIT_DAYS of posting. Sent as POST + _method=PUT (multipart). */
    public function update(Request $request, Rating $rating): RedirectResponse
    {
        if ($rating->user_id !== $request->user()->id) {
            abort(403);
        }
        if (! $rating->canEdit()) {
            abort(403, 'Reviews can only be edited within ' . Rating::EDIT_DAYS . ' days of posting.');
        }

        $current = $rating->photo_paths ?? [];

        $data = $request->validate([
            'rating'        => 'required|integer|min:1|max:5',
            'review'        => 'nullable|string|max:500',
            'keep_photos'   => 'nullable|array',
            'keep_photos.*' => 'string',
            'photos'        => 'nullable|array|max:' . Rating::MAX_PHOTOS,
            'photos.*'      => self::PHOTO_RULES,
        ], $this->photoMessages('photos'));

        $keep = array_values(array_unique($data['keep_photos'] ?? []));
        if (array_diff($keep, $current)) {
            throw ValidationException::withMessages(['photos' => 'One of the photos no longer belongs to this review — reload the page.']);
        }

        $newFiles = $request->file('photos') ?? [];
        if (count($keep) + count($newFiles) > Rating::MAX_PHOTOS) {
            throw ValidationException::withMessages(['photos' => 'A review can have up to ' . Rating::MAX_PHOTOS . ' photos.']);
        }

        $added = [];
        foreach ($newFiles as $file) {
            $added[] = $file->store(self::PHOTO_DIR, 'public');
        }

        $removed = array_diff($current, $keep);

        $rating->update([
            'rating'      => $data['rating'],
            'review'      => $data['review'] ?? null,
            'photo_paths' => array_merge($keep, $added) ?: null,
            'edited_at'   => now(),
        ]);

        foreach ($removed as $p) {
            Storage::disk('public')->delete($p);
        }

        return back()->with('success', 'Your review was updated.');
    }

    /** Author only, any time. The product can then be rated again from the same order. */
    public function destroy(Request $request, Rating $rating): RedirectResponse
    {
        if ($rating->user_id !== $request->user()->id) {
            abort(403);
        }

        $rating->deletePhotoFiles();
        $rating->delete();

        return back()->with('success', 'Your review was deleted.');
    }

    /** @return array<string, string> */
    private function photoMessages(string $prefix): array
    {
        $out = [
            "$prefix.max" => 'A review can have up to ' . Rating::MAX_PHOTOS . ' photos.',
        ];
        foreach (self::PHOTO_MESSAGES as $rule => $msg) {
            $out["$prefix.*.$rule"] = $msg;
        }

        return $out;
    }
}
