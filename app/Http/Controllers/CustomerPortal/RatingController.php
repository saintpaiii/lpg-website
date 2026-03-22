<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Rating;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class RatingController extends Controller
{
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
        ]);

        foreach ($data['ratings'] as $item) {
            Rating::firstOrCreate(
                [
                    'user_id'    => $request->user()->id,
                    'product_id' => $item['product_id'],
                    'order_id'   => $order->id,
                ],
                [
                    'store_id' => $order->store_id,
                    'rating'   => $item['rating'],
                    'review'   => $item['review'] ?? null,
                ]
            );
        }

        return back()->with('success', 'Thank you for your review!');
    }
}
