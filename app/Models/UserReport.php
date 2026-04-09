<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class UserReport extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'reporter_id',
        'reported_id',
        'reported_store_id',
        'order_id',
        'type',
        'category',
        'subject',
        'description',
        'evidence_paths',
        'status',
        'admin_notes',
        'resolution',
        'resolved_at',
        'resolved_by',
    ];

    protected $casts = [
        'evidence_paths' => 'array',
        'resolved_at'    => 'datetime',
    ];

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reporter_id');
    }

    public function reported(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_id');
    }

    public function reportedStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'reported_store_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
