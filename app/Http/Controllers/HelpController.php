<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

/**
 * GET /help — "Help & Tutorials": the user's tours with their status, Start, Reset all, and the
 * "Show tutorials automatically" switch. Which tours apply is worked out on the page (same rules as the menu).
 */
class HelpController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('help');
    }
}
