<?php

use App\Models\SalesHistory;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    Storage::fake('local');
    $this->store = $this->makeStore();
    $this->owner = User::find($this->store->user_id);
    $this->p11 = $this->makeProduct($this->store, 11);
    $this->p11->update(['name' => '11kg Petron Gasul']);
    $this->p22 = $this->makeProduct($this->store, 22);
});

function csvUpload(array $lines): UploadedFile
{
    return UploadedFile::fake()->createWithContent('past-sales.csv', implode("\n", $lines) . "\n");
}

test('preview: counts per problem with row numbers; confirm imports only the valid rows (by name, case-insensitive, or by id)', function () {
    $old = now()->subMonths(3)->toDateString();
    $file = csvUpload([
        'date,product,quantity',
        "{$old},11KG PETRON GASUL,5",                                        // row 2 valid (name, other case)
        now()->subMonths(2)->format('m/d/Y') . ",{$this->p22->id},2",         // row 3 valid (id, MM/DD/YYYY)
        "{$old},Unknown Tank,3",                                              // row 4 unknown product
        "2025-02-30,11kg Petron Gasul,1",                                     // row 5 bad date
        now()->addDay()->toDateString() . ',11kg Petron Gasul,1',            // row 6 future date
        "{$old},11kg Petron Gasul,0",                                         // row 7 quantity ≤ 0
        now()->subYears(6)->toDateString() . ',11kg Petron Gasul,1',         // row 8 too old
        '',
        "{$old},11kg petron gasul,4",                                         // row 10 valid
    ]);

    $res = $this->actingAs($this->owner)->post('/seller/dss/sales-history/preview', ['file' => $file], ['Accept' => 'application/json'])->assertOk();
    expect($res->json('counts'))->toMatchArray(['valid' => 3, 'unknown_product' => 1, 'bad_date' => 1, 'future_date' => 1, 'bad_quantity' => 1, 'too_old' => 1])
        ->and($res->json('problems'))->toMatchArray(['unknown_product' => [4], 'bad_date' => [5], 'future_date' => [6], 'bad_quantity' => [7], 'too_old' => [8]])
        ->and($res->json('rows'))->toBe(8)
        ->and($res->json('preview.0.matched'))->toBe('11kg Petron Gasul')
        ->and(SalesHistory::count())->toBe(0);   // nothing imported yet

    $this->actingAs($this->owner)->post('/seller/dss/sales-history/import', ['token' => $res->json('token')])
        ->assertSessionHas('success', '3 row(s) of past sales imported (5 skipped).');

    expect(SalesHistory::where('source', 'import')->count())->toBe(3)
        ->and((int) SalesHistory::where('product_id', $this->p11->id)->sum('quantity'))->toBe(9)
        ->and(SalesHistory::where('product_id', $this->p22->id)->value('quantity'))->toBe(2)
        ->and(SalesHistory::where('product_id', $this->p11->id)->value('size_group'))->toBe('11 kg')
        ->and(SalesHistory::distinct()->count('import_batch'))->toBe(1);

    // The preview token is used up
    $this->actingAs($this->owner)->post('/seller/dss/sales-history/import', ['token' => $res->json('token')])->assertSessionHas('error');
    expect(SalesHistory::count())->toBe(3);
});

test('the import warns about months that already have platform orders; template lists the store products', function () {
    [, $customer] = $this->makeCustomer();
    $this->makeOrder($customer, $this->store, [[$this->p11, 1]], ['status' => 'delivered']);
    $file = csvUpload(['date,product,quantity', now()->toDateString() . ',11kg Petron Gasul,2']);
    $res = $this->actingAs($this->owner)->post('/seller/dss/sales-history/preview', ['file' => $file], ['Accept' => 'application/json'])->assertOk();
    expect($res->json('order_months'))->toBe([now()->format('Y-m')]);

    $csv = $this->actingAs($this->owner)->get('/seller/dss/sales-history/template')->assertOk()->getContent();
    expect($csv)->toStartWith("date,product,quantity\n")->toContain('11kg Petron Gasul');
});

test('delete one import batch only; another store (or staff without DSS) → 403', function () {
    $import = function (string $date) {
        $res = $this->actingAs($this->owner)->post('/seller/dss/sales-history/preview', ['file' => csvUpload(['date,product,quantity', "{$date},11kg Petron Gasul,3"])], ['Accept' => 'application/json']);
        $this->actingAs($this->owner)->post('/seller/dss/sales-history/import', ['token' => $res->json('token')]);
    };
    $import(now()->subMonths(5)->toDateString());
    $import(now()->subMonths(4)->toDateString());
    [$a, $b] = SalesHistory::orderBy('id')->pluck('import_batch')->all();

    $this->actingAs($this->owner)->get('/seller/dss')->assertInertia(fn ($page) => $page->has('salesImports', 2)->where('seasonalCan.import', true));

    // Another store's owner can't touch it
    $other = User::find($this->makeStore()->user_id);
    $this->actingAs($other)->delete("/seller/dss/sales-history/imports/{$a}")->assertForbidden();
    // Staff of this store without the DSS module
    $warehouse = $this->makeWarehouse($this->store);
    $this->actingAs($warehouse)->deleteJson("/seller/dss/sales-history/imports/{$a}")->assertForbidden();
    $this->actingAs($warehouse)->postJson('/seller/dss/sales-history/preview', ['file' => csvUpload(['date,product,quantity'])])->assertForbidden();
    expect(SalesHistory::count())->toBe(2);

    $this->actingAs($this->owner)->delete("/seller/dss/sales-history/imports/{$a}")->assertSessionHas('success');
    expect(SalesHistory::pluck('import_batch')->all())->toBe([$b]);
});
