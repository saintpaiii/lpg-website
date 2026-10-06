<?php

namespace App\Events;

/** An order was created or its status / payment changed: { order_id, order_number, status, payment_status, remaining_balance, is_new }. */
class OrderUpdated extends RealtimeEvent {}
