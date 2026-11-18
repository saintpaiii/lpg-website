<?php

use App\Mail\OtpMail;
use App\Models\OtpCode;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

test('customer registration → /verify-otp sends the first code by itself, once (a refresh does not send another)', function () {
    Mail::fake();

    // Like the register page: axios (Accept: application/json), then window.location = /email/verify
    $res = $this->withHeaders(['Accept' => 'application/json, text/plain, */*', 'X-Requested-With' => 'XMLHttpRequest'])->post('/register', [
        'first_name' => 'Maria', 'last_name' => 'Santos', 'email' => 'maria.k7@example.com', 'phone' => '09171234567',
        'address' => '1 Rizal St.', 'city' => 'Imus', 'barangay' => 'Alapan I-A',
        'password' => 'Str0ng!Passw0rd#2026', 'password_confirmation' => 'Str0ng!Passw0rd#2026', 'terms' => '1',
    ]);
    $res->assertOk();
    $user = User::where('email', 'maria.k7@example.com')->firstOrFail();

    // Follow the redirects like the browser does until the OTP page renders
    $page = $this->withHeaders(['Accept' => 'text/html'])->followingRedirects()->get('/email/verify');
    $page->assertOk()->assertInertia(fn ($p) => $p->component('auth/verify-otp')->where('code_sent', true)->where('resend_available', fn ($s) => $s > 0));
    expect(OtpCode::where('user_id', $user->id)->count())->toBe(1);
    Mail::assertSent(OtpMail::class, 1);

    // Refresh: no second code (the resend timer still runs)
    $this->withHeaders(['Accept' => 'text/html'])->get('/verify-otp')->assertOk()->assertInertia(fn ($p) => $p->where('code_sent', true));
    expect(OtpCode::where('user_id', $user->id)->count())->toBe(1);
    Mail::assertSent(OtpMail::class, 1);
});
