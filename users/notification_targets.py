def notification_target(notification):
    if notification.kind == notification.KIND_FOLLOW and notification.actor:
        return {"type": "profile", "username": notification.actor.username}
    if notification.post_id:
        return {"type": "post", "id": notification.post_id}
    if notification.appointment_id:
        return {"type": "appointment", "id": notification.appointment_id}
    if notification.thread_id:
        return {"type": "chat", "id": notification.thread_id}
    if notification.actor:
        return {"type": "profile", "username": notification.actor.username}
    return {"type": "none"}
