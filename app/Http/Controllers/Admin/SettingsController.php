<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    private array $keys = [
        'company_name',
        'company_address',
        'company_phone',
        'company_email',
        'default_reorder_level',
        'lead_time_days',
    ];

    private array $defaults = [
        'company_name'          => 'LPG Distribution Cavite',
        'company_address'       => '',
        'company_phone'         => '',
        'company_email'         => '',
        'default_reorder_level' => '10',
        'lead_time_days'        => '3',
    ];

    public function index(): Response
    {
        $settings = [];
        foreach ($this->keys as $key) {
            $settings[$key] = Setting::get($key, $this->defaults[$key]);
        }

        return Inertia::render('admin/settings', [
            'settings' => $settings,
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'company_name'          => 'required|string|max:255',
            'company_address'       => 'nullable|string|max:1000',
            'company_phone'         => 'nullable|string|max:50',
            'company_email'         => 'nullable|email|max:255',
            'default_reorder_level' => 'required|integer|min:1|max:9999',
            'lead_time_days'        => 'required|integer|min:1|max:365',
        ]);

        foreach ($data as $key => $value) {
            Setting::set($key, $value ?? '');
        }

        return back()->with('success', 'Settings saved successfully.');
    }
}
