<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class VerificationRequest extends Model
{
    use HasFactory, SoftDeletes;

    /** Auto-read (OCR) result of the valid ID — admin only */
    protected $hidden = ['ocr'];

    protected $fillable = [
        'user_id',
        'type',
        'valid_id_path',
        'selfie_path',
        'bir_permit_path',
        'business_permit_path',
        'fsic_permit_path',
        'doe_lpg_license_path',
        'lto_permit_path',
        'dti_sec_registration_path',
        'status',
        'reviewed_by',
        'reviewed_at',
        'rejection_reason',
        'terms_agreed_at',
        'ocr',
    ];

    protected function casts(): array
    {
        return [
            'reviewed_at'    => 'datetime',
            'terms_agreed_at'=> 'datetime',
            'ocr'            => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function isApproved(): bool
    {
        return $this->status === 'approved';
    }
}
