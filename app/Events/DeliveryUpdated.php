<?php

namespace App\Events;

/** A delivery was created, reassigned or changed status: { delivery_id, order_id, status, rider_id }. */
class DeliveryUpdated extends RealtimeEvent {}
