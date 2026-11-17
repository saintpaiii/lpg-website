<?php

namespace App\Http\Controllers\Chat;

use App\Http\Controllers\Controller;
use App\Models\ConversationMessage;
use App\Services\ChatService;
use App\Support\PrivateDocument;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * GET /chat/attachments/{message} — a chat photo (J6: private, on the 'local' disk).
 * Allowed: participants of that conversation who can see that message (riders only inside their time window) and
 * platform admins. Everyone else gets 403.
 */
class ChatAttachmentController extends Controller
{
    public function show(Request $request, ConversationMessage $message): StreamedResponse
    {
        abort_unless($message->attachment_path, 404);
        $user = $request->user();
        $conversation = $message->conversation;
        abort_unless($conversation, 404);

        $allowed = $user->isAdmin()
            || (ChatService::canView($conversation, $user)
                && ChatService::visibleMessages($conversation->messages()->getQuery(), $conversation, $user)->whereKey($message->id)->exists());
        abort_unless($allowed, 403);

        return PrivateDocument::response($message->attachment_path);
    }
}
