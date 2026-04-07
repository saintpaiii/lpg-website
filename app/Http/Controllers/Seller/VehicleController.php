<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Vehicle;
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
        ]);
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

        return back()->with('success', 'Vehicle added successfully.');
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

        $vehicle->update([
            'vehicle_type'      => $data['vehicle_type'],
            'plate_number'      => $plate,
            'max_capacity_kg'   => $data['max_capacity_kg'],
            'max_tanks'         => $data['max_tanks'],
            'description'       => $data['description'] ?? null,
            'status'            => $data['status'],
            'assigned_rider_id' => $data['assigned_rider_id'] ?? null,
        ]);

        return back()->with('success', 'Vehicle updated.');
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

        $vehicle->restore();
        return back()->with('success', 'Vehicle restored.');
    }
}
