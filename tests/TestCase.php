<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /**
     * Safety net: RefreshDatabase wipes the database, so tests only ever run against a database whose name ends in
     * "_test" (phpunit.xml forces lpg_test) or SQLite in memory — never the real one.
     */
    protected function setUpTraits()
    {
        $db = (string) config('database.connections.' . config('database.default') . '.database');
        if ($db !== ':memory:' && ! str_ends_with($db, '_test')) {
            throw new RuntimeException("Refusing to run tests against database \"{$db}\" — use a *_test database (see phpunit.xml).");
        }

        return parent::setUpTraits();
    }
}