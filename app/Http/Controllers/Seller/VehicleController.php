<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\StoreDeliveryRate;
use App\Services\DeliveryFeeService;
use App\Services\SubscriptionService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class VehicleController extends Controller
{
    private function ownerOnly(): void
    {
        if (auth()->user()->role !== 'seller') {
            abort(403);
        }
    }

    public function index(Request $request): Response
    {
        $store = $request->attributes->get('seller_store');

        $busy = SubscriptionService::busyVehicleIds($store->id);
        $vehicles = Vehicle::withTrashed()
            ->where('store_id', $store->id)
            ->with('assignedRider:id,name')
            ->orderByRaw("deleted_at IS NOT NULL, status = 'retired', status = 'maintenance', id ASC")
            ->get()
            ->map(fn ($v) => [
                'id'                => $v->id,
                'vehicle_type'      => $v->vehicle_type,
                'plate_number'      => $v->plate_number,
                'max_capacity_kg'   => (float) $v->max_capacity_kg,
                'max_tanks'         => $v->max_tanks,
                'description'       => $v->description,
                'status'            => $v->status,
                'paused_by_plan'    => (bool) $v->paused_by_plan,
                'busy'              => in_array($v->id, $busy),
                'assigned_rider'    => $v->assignedRider ? ['id' => $v->assignedRider->id, 'name' => $v->assignedRider->name] : null,
                'deleted_at'        => $v->deleted_at?->toISOString(),
            ])
            ->values();

        $riders = User::where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->where('sub_role', 'rider')
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn ($r) => ['id' => $r->id, 'name' => $r->name])
            ->values();

        return Inertia::render('seller/vehicles', [
            'vehicles' => $vehicles,
            'riders'   => $riders,
            // Delivery fee per vehicle type the store currently has (non-retired, not deleted)
            'rates'    => $this->rateRows($store),
            'can_deliver' => DeliveryFeeService::clientOptions($store) !== [],
            'planLimit' => [
                'used'    => SubscriptionService::usage($store)['vehicles'],
                'limit'   => SubscriptionService::limits($store)['vehicles'],
                'plan'    => SubscriptionService::summary($store)['last_name'] ?? 'Basic',
                'message' => SubscriptionService::limitMessage($store, 'vehicles'),
                'can_add' => SubscriptionService::canAdd($store, 'vehicles'),
            ],
        ]);
    }

    /** One row per vehicle type the store has now (non-retired, not deleted), with its fee (null = not set). */
    private function rateRows($store): array
    {
        $rates = StoreDeliveryRate::where('store_id', $store->id)->get()->keyBy('vehicle_type');
        $types = Vehicle::where('store_id', $store->id)->where('status', '!=', 'retired')->distinct()->pluck('vehicle_type');
        $order = array_flip(array_keys(DeliveryFeeService::types()));

        return $types->sortBy(fn ($t) => $order[$t] ?? 99)->map(fn ($t) => [
            'vehicle_type' => $t,
            'label'        => DeliveryFeeService::label($t),
            'base_fee'     => $rates->has($t) ? (float) $rates[$t]->base_fee : null,
            'fee_per_km'   => $rates->has($t) ? (float) $rates[$t]->fee_per_km : null,
        ])->values()->all();
    }

    /** First vehicle of a type → its delivery fee gets the suggested default. Returns the flash suffix. */
    private function ensureRate($store, string $type): string
    {
        if (StoreDeliveryRate::where('store_id', $store->id)->where('vehicle_type', $type)->exists()) {
            return '';
        }
        $d = DeliveryFeeService::types()[$type] ?? ['default_base' => 50, 'default_per_km' => 10];
        StoreDeliveryRate::create(['store_id' => $store->id, 'vehicle_type' => $type, 'base_fee' => $d['default_base'], 'fee_per_km' => $d['default_per_km']]);

        return ' Delivery fee for ' . DeliveryFeeService::label($type) . " set to ₱{$d['default_base']} + ₱{$d['default_per_km']}/km — you can change it below.";
    }

    /** Save the delivery fee of each vehicle type (owner only). */
    public function updateRates(Request $request): RedirectResponse
    {
        $this->ownerOnly();
        $store = $request->attributes->get('seller_store');
        $data = $request->validate([
            'rates'                => 'required|array|min:1',
            'rates.*.vehicle_type' => 'required|in:' . implode(',', array_keys(DeliveryFeeService::types())),
            'rates.*.base_fee'     => 'required|numeric|min:0|max:9999.99',
            'rates.*.fee_per_km'   => 'required|numeric|min:0|max:999.99',
        ], [
            'rates.*.base_fee.required'   => 'Enter a base fee.',
            'rates.*.fee_per_km.required' => 'Enter a fee per km (0 for a flat fee).',
        ]);

        foreach ($data['rates'] as $r) {
            StoreDeliveryRate::updateOrCreate(
                ['store_id' => $store->id, 'vehicle_type' => $r['vehicle_type']],
                ['base_fee' => $r['base_fee'], 'fee_per_km' => $r['fee_per_km']],
            );
        }

        return back()->with('success', 'Delivery fees saved.');
    }

    public function store(Request $request): RedirectResponse
    {
        $this->ownerOnly();
        $store = $request->attributes->get('seller_store');

        $data = $request->validate([
            'vehicle_type'      => 'required|in:motorcycle,tricycle,multicab,van,pickup_truck,small_truck,large_truck',
            'plate_number'      => 'required|string|max:20',
            'max_capacity_kg'   => 'required|numeric|min:1|max:99999',
            'max_tanks'         => 'required|integer|min:1|max:9999',
            'description'       => 'nullable|string|max:255',
            'assigned_rider_id' => 'nullable|exists:users,id',
        ]);

        // Unique plate per store
        $exists = Vehicle::where('store_id', $store->id)
            ->where('plate_number', strtoupper(trim($data['plate_number'])))
            ->withTrashed()
            ->exists();
        if ($exists) {
            return back()->withErrors(['plate_number' => 'This plate number already exists for your store.']);
        }
        if (! SubscriptionService::canAdd($store, 'vehicles')) {
            return back()->with('error', SubscriptionService::limitMessage($store, 'vehicles'));
        }

        Vehicle::create([
            'store_id'          => $store->id,
            'vehicle_type'      => $data['vehicle_type'],
            'plate_number'      => strtoupper(trim($data['plate_number'])),
            'max_capacity_kg'   => $data['max_capacity_kg'],
            'max_tanks'         => $data['max_tanks'],
            'description'       => $data['description'] ?? null,
            'status'            => 'available',
            'assigned_rider_id' => $data['assigned_rider_id'] ?? null,
        ]);

        return back()->with('success', 'Vehicle added successfully.' . $this->ensureRate($store, $data['vehicle_type']));
    }

    public function update(Request $request, Vehicle $vehicle): RedirectResponse
    {
        $this->ownerOnly();
        $store = $request->attributes->get('seller_store');
        if ($vehicle->store_id !== $store->id) abort(403);

        $data = $request->validate([
            'vehicle_type'      => 'required|in:motorcycle,tricycle,multicab,van,pickup_truck,small_truck,large_truck',
            'plate_number'      => 'required|string|max:20',
            'max_capacity_kg'   => 'required|numeric|min:1|max:99999',
            'max_tanks'         => 'required|integer|min:1|max:9999',
            'description'       => 'nullable|string|max:255',
            'status'            => 'required|in:available,in_use,maintenance,retired',
            'assigned_rider_id' => 'nullable|exists:users,id',
        ]);

        $plate = strtoupper(trim($data['plate_number']));

        $conflict = Vehicle::where('store_id', $store->id)
            ->where('plate_number', $plate)
            ->where('id', '!=', $vehicle->id)
            ->withTrashed()
            ->exists();
        if ($conflict) {
            return back()->withErrors(['plate_number' => 'This plate number already exists for your store.']);
        }
        // Bringing a retired vehicle back counts against the plan (a paused one doesn't count yet)
        if ($vehicle->status === 'retired' && $data['status'] !== 'retired' && ! $vehicle->paused_by_plan
            && ! SubscriptionService::canAdd($store, 'vehicles')) {
            return back()->with('error', SubscriptionService::limitMessage($store, 'vehicles'));
        }

        $vehicle->update([
            'vehicle_type'      => $data['vehicle_type'],
            'plate_number'      => $plate,
            'max_capacity_kg'   => $data['max_capacity_kg'],
            'max_tanks'         => $data['max_tanks'],
            'description'       => $data['description'] ?? null,
            'status'            => $data['status'],
            'assigned_rider_id' => $data['assigned_rider_id'] ?? null,
        ]);

        return back()->with('success', 'Vehicle updated.' . ($data['status'] !== 'retired' ? $this->ensureRate($store, $data['vehicle_type']) : ''));
    }

    public function destroy(Vehicle $vehicle): RedirectResponse
    {
        $this->ownerOnly();
        $store = request()->attributes->get('seller_store');
        if ($vehicle->store_id !== $store->id) abort(403);

        $vehicle->delete();
        return back()->with('success', 'Vehicle archived.');
    }

    public function restore(Vehicle $vehicle): RedirectResponse
    {
        $this->ownerOnly();
        $store = request()->attributes->get('seller_store');
        if ($vehicle->store_id !== $store->id) abort(403);

        if ($vehicle->status !== 'retired' && ! $vehicle->paused_by_plan && ! SubscriptionService::canAdd($store, 'vehicles')) {
            return back()->with('error', SubscriptionService::limitMessage($store, 'vehicles'));
        }

        $vehicle->restore();
        return back()->with('success', 'Vehicle restored.' . ($vehicle->status !== 'retired' ? $this->ensureRate($store, $vehicle->vehicle_type) : ''));
    }

    /** Pause (plan limit) / Activate — the owner chooses which vehicles stay usable. */
    public function togglePlanPause(Vehicle $vehicle): RedirectResponse
    {
        $this->ownerOnly();
        $store = request()->attributes->get('seller_store');
        if ($vehicle->store_id !== $store->id) abort(403);

        if (! $vehicle->paused_by_plan) {
            if ($vehicle->status === 'in_use' || in_array($vehicle->id, SubscriptionService::busyVehicleIds($store->id))) {
                return back()->with('error', 'This vehicle is on a delivery. Pause it after the delivery is finished.');
            }
            $vehicle->update(['paused_by_plan' => true]);

            return back()->with('success', "Vehicle {$vehicle->plate_number} paused.");
        }

        if ($vehicle->status !== 'retired' && ! SubscriptionService::canAdd($store, 'vehicles')) {
            return back()->with('error', SubscriptionService::limitMessage($store, 'vehicles'));
        }
        $vehicle->update(['paused_by_plan' => false]);

        return back()->with('success', "Vehicle {$vehicle->plate_number} activated.");
    }
}
