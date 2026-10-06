<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** How far a user has read in a conversation (last_read_message_id). */
class ConversationRead extends Model
{
    protected $fillable = ['conversation_id', 'user_id', 'last_read_message_id'];
}
