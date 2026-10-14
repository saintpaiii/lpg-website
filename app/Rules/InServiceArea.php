<?php

namespace App\Rules;

use App\Support\ServiceArea;
use Closure;
use Illuminate\Contracts\Validation\DataAwareRule;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * A lat/lng pair must be inside the Cavite service area.
 * Put it on the latitude field and name the longitude field: new InServiceArea('longitude').
 * Skipped when either value is empty (other rules decide whether they're required).
 */
class InServiceArea implements DataAwareRule, ValidationRule
{
    private array $data = [];

    public function __construct(private string $lngField) {}

    public function setData(array $data): static
    {
        $this->data = $data;

        return $this;
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $lng = data_get($this->data, $this->lngField);
        if ($value === null || $value === '' || $lng === null || $lng === '' || ! is_numeric($value) || ! is_numeric($lng)) {
            return;
        }
        if (! ServiceArea::contains((float) $value, (float) $lng)) {
            $fail(ServiceArea::MESSAGE);
        }
    }
}
