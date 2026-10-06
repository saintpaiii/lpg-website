<?php

namespace App\Events;

/** A chat message (payload = the same message shape the messages endpoint returns, plus conversation_id). */
class MessageSent extends RealtimeEvent {}
