<?php

namespace App\Events;

/** A report changed: { report_id, status, waiting_on, is_urgent }. Per-user channels only (never store.{id}). */
class ReportUpdated extends RealtimeEvent {}
