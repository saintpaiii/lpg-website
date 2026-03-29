<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Banner;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class BannerController extends Controller
{
    public function index(): Response
    {
        $banners = Banner::withTrashed()
            ->orderBy('display_order')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($b) => [
                'id'            => $b->id,
                'title'         => $b->title,
                'subtitle'      => $b->subtitle,
                'image_url'     => $b->image_url,
                'cta_text'      => $b->cta_text,
                'cta_url'       => $b->cta_url,
                'is_active'     => $b->is_active,
                'display_order' => $b->display_order,
                'deleted_at'    => $b->deleted_at?->toIso8601String(),
            ]);

        $activeCount = Banner::where('is_active', true)->count();

        return Inertia::render('admin/banners', [
            'banners'     => $banners,
            'activeCount' => $activeCount,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'title'         => 'nullable|string|max:200',
            'subtitle'      => 'nullable|string|max:400',
            'cta_text'      => 'nullable|string|max:80',
            'cta_url'       => 'nullable|string|max:500',
            'is_active'     => 'boolean',
            'display_order' => 'integer|min:0',
            'image'         => 'nullable|image|max:3072', // 3 MB
        ]);

        if ($request->hasFile('image')) {
            $data['image_path'] = $request->file('image')->store('banners', 'public');
        }

        unset($data['image']);
        Banner::create($data);

        return back()->with('success', 'Banner created.');
    }

    public function update(Request $request, Banner $banner): RedirectResponse
    {
        $data = $request->validate([
            'title'         => 'nullable|string|max:200',
            'subtitle'      => 'nullable|string|max:400',
            'cta_text'      => 'nullable|string|max:80',
            'cta_url'       => 'nullable|string|max:500',
            'is_active'     => 'boolean',
            'display_order' => 'integer|min:0',
            'image'         => 'nullable|image|max:3072',
        ]);

        if ($request->hasFile('image')) {
            if ($banner->image_path) {
                Storage::disk('public')->delete($banner->image_path);
            }
            $data['image_path'] = $request->file('image')->store('banners', 'public');
        }

        unset($data['image']);
        $banner->update($data);

        return back()->with('success', 'Banner updated.');
    }

    public function toggle(Banner $banner): RedirectResponse
    {
        // Enforce max 5 active banners
        if (! $banner->is_active) {
            $activeCount = Banner::where('is_active', true)->count();
            if ($activeCount >= 5) {
                return back()->with('error', 'Maximum 5 active banners allowed. Deactivate one first.');
            }
        }

        $banner->update(['is_active' => ! $banner->is_active]);

        return back()->with('success', $banner->is_active ? 'Banner activated.' : 'Banner deactivated.');
    }

    public function reorder(Request $request): RedirectResponse
    {
        $request->validate([
            'order'   => 'required|array',
            'order.*' => 'integer|exists:banners,id',
        ]);

        foreach ($request->order as $pos => $id) {
            Banner::where('id', $id)->update(['display_order' => $pos]);
        }

        return back()->with('success', 'Order saved.');
    }

    public function destroy(Banner $banner): RedirectResponse
    {
        $banner->delete();
        return back()->with('success', 'Banner archived.');
    }

    public function restore(Banner $banner): RedirectResponse
    {
        $banner->restore();
        return back()->with('success', 'Banner restored.');
    }

    public function forceDestroy(Banner $banner): RedirectResponse
    {
        if ($banner->image_path) {
            Storage::disk('public')->delete($banner->image_path);
        }
        $banner->forceDelete();
        return back()->with('success', 'Banner permanently deleted.');
    }
}
