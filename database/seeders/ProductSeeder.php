<?php

namespace Database\Seeders;

use App\Models\Inventory;
use App\Models\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run(): void
    {
        $products = [
            [
                'name'          => '11kg Petron Gasul',
                'brand'         => 'Petron Gasul',
                'weight_kg'     => 11,
                'selling_price' => 850.00,
                'cost_price'    => 700.00,
                'description'   => '11kg LPG cylinder - Petron Gasul brand',
                'stock'         => 50,
            ],
            [
                'name'          => '11kg Solane',
                'brand'         => 'Solane',
                'weight_kg'     => 11,
                'selling_price' => 830.00,
                'cost_price'    => 680.00,
                'description'   => '11kg LPG cylinder - Solane brand',
                'stock'         => 50,
            ],
            [
                'name'          => '22kg Petron Gasul',
                'brand'         => 'Petron Gasul',
                'weight_kg'     => 22,
                'selling_price' => 1600.00,
                'cost_price'    => 1350.00,
                'description'   => '22kg LPG cylinder - Petron Gasul brand',
                'stock'         => 50,
            ],
            [
                'name'          => '50kg Industrial',
                'brand'         => 'Industrial',
                'weight_kg'     => 50,
                'selling_price' => 3500.00,
                'cost_price'    => 3000.00,
                'description'   => '50kg industrial LPG cylinder',
                'stock'         => 50,
            ],
            [
                'name'          => '2.7kg Handy Gas',
                'brand'         => 'Handy Gas',
                'weight_kg'     => 2.7,
                'selling_price' => 380.00,
                'cost_price'    => 300.00,
                'description'   => '2.7kg portable LPG cylinder - Handy Gas',
                'stock'         => 50,
            ],
        ];

        foreach ($products as $data) {
            $stock = $data['stock'];
            unset($data['stock']);

            $product = Product::updateOrCreate(
                ['name' => $data['name']],
                array_merge($data, ['is_active' => true])
            );

            Inventory::updateOrCreate(
                ['product_id' => $product->id],
                ['quantity' => $stock, 'reorder_level' => 10]
            );
        }
    }
}
