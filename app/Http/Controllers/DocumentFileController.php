<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\CylinderIncident;
use App\Models\DeliveryProof;
use App\Models\OrderItemAdjustment;
use App\Models\StaffDocument;
use App\Models\Store;
use App\Models\StoreDocumentSubmission;
use App\Models\User;
use App\Models\VerificationRequest;
use App\Support\PrivateDocument;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * GET /documents/{kind}/{id}/{field} — opens a private document (ID, selfie, permit, store document).
 * Allowed: the owner of the record, or a document reviewer (platform admin / permitted platform staff).
 */
class DocumentFileController extends Controller
{
    private const FIELDS = [
        'user'           => ['valid_id', 'valid_id_path', 'selfie_path'],
        'verification'   => ['valid_id_path', 'selfie_path', 'bir_permit_path', 'business_permit_path', 'fsic_permit_path', 'doe_lpg_license_path', 'lto_permit_path', 'dti_sec_registration_path'],
        'store'          => ['bir_permit', 'business_permit', 'fsic_permit', 'doe_lpg_license', 'dti_sec_registration', 'lto_permit'],   // lto_permit: old files only
        'store-document' => ['file_path'],
        'staff-document' => ['file_path', 'selfie_path'],   // selfie_path: the rider's live selfie for the license face check
        // Live-camera clock-in / clock-out photos
        'attendance'     => ['clock_in_photo_path', 'clock_out_photo_path'],
        // J5: "tank not accepted" photo taken at handover (J4)
        'handover-photo' => ['photo_path'],
        // J6: delivery proof photos (rider's Delivered / Failed photo)
        'delivery-proof' => ['photo_path'],
        // J7: damaged / expired cylinder photos
        'cylinder-incident' => ['photo_path'],
    ];

    public function show(Request $request, string $kind, int $id, string $field): StreamedResponse
    {
        abort_unless(in_array($field, self::FIELDS[$kind] ?? [], true), 404);

        // Soft-deleted records stay viewable for reviewers (e.g. a rejected application)
        [$record, $ownerId] = match ($kind) {
            'user'           => [$u = User::withTrashed()->find($id), $u?->id],
            'verification'   => [$v = VerificationRequest::withTrashed()->find($id), $v?->user_id],
            'store'          => [$s = Store::withTrashed()->find($id), $s?->user_id],
            'store-document' => [$d = StoreDocumentSubmission::with(['store' => fn ($q) => $q->withTrashed()])->find($id), $d?->store?->user_id],
            // Two people may open a staff document: the staff member and the owner of their store
            'staff-document' => [$sd = StaffDocument::with(['store' => fn ($q) => $q->withTrashed()])->find($id), [$sd?->user_id, $sd?->store?->user_id]],
            // The staff member and their store's owner (store staff with the Attendance module: checked below)
            'attendance'     => [$at = Attendance::with(['store' => fn ($q) => $q->withTrashed()])->find($id), [$at?->user_id, $at?->store?->user_id]],
            // The order's customer, the store owner, the rider of the delivery and whoever recorded it (store staff with Orders: below)
            'handover-photo' => [$ha = OrderItemAdjustment::with(['order' => fn ($q) => $q->withTrashed()->with(['customer', 'store' => fn ($s) => $s->withTrashed(), 'delivery'])])->find($id),
                [$ha?->order?->customer?->user_id, $ha?->order?->store?->user_id, $ha?->order?->delivery?->rider_id, $ha?->recorded_by]],
            // The order's customer, the store owner, the delivery's rider and who took it (store staff with Orders / Deliveries: below)
            'delivery-proof' => [$dp = DeliveryProof::with(['delivery' => fn ($q) => $q->withTrashed()->with(['order' => fn ($o) => $o->withTrashed()->with(['customer', 'store' => fn ($s) => $s->withTrashed()])])])->find($id),
                [$dp?->delivery?->order?->customer?->user_id, $dp?->delivery?->order?->store?->user_id, $dp?->delivery?->rider_id, $dp?->user_id]],
            // The store owner and who recorded it (store staff with Inventory: below)
            'cylinder-incident' => [$ci = CylinderIncident::find($id),
                [$ci ? \App\Models\Store::withTrashed()->whereKey($ci->store_id)->value('user_id') : null, $ci?->recorded_by]],
        };
        abort_unless($record, 404);

        $user = $request->user();
        $allowed = in_array($user->id, array_filter((array) $ownerId), true) || $user->canReviewDocuments()
            // Attendance photos: also staff of the same store who see everyone's attendance (owner / HR pages)
            || ($kind === 'attendance' && $user->role === 'seller_staff' && (int) $user->store_id === (int) $record->store_id
                && ($user->hasPermission('attendance.view') || $user->hasPermission('attendance.manage')))
            // Handover photos: store staff of that store who can see its orders
            || ($kind === 'handover-photo' && $user->role === 'seller_staff' && (int) $user->store_id === (int) $record->order?->store_id
                && $user->hasPermission('orders.view'))
            || ($kind === 'delivery-proof' && $user->role === 'seller_staff' && (int) $user->store_id === (int) $record->delivery?->order?->store_id
                && ($user->hasPermission('orders.view') || $user->hasPermission('deliveries.view')))
            || ($kind === 'cylinder-incident' && $user->role === 'seller_staff' && (int) $user->store_id === (int) $record->store_id
                && $user->hasPermission('inventory.view'));
        abort_unless($allowed, 403);

        $path = $record->{$field};
        abort_unless($path, 404);

        // Handover photos saved on the public disk before J5: moved to private storage on first view (same path)
        if ($kind === 'handover-photo') {
            PrivateDocument::moveToPrivate($path);
        }

        return PrivateDocument::response($path);
    }
}
