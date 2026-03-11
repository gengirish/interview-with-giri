from interviewbot.services.ai_engine import InterviewConversation


def test_conversation_tracks_messages():
    conv = InterviewConversation("You are an interviewer.")
    conv.add_message("assistant", "Tell me about yourself.")
    conv.add_message("user", "I have 5 years of experience.")
    conv.add_message("assistant", "What frameworks have you used?")

    assert conv.get_question_count() == 2
    assert len(conv.messages) == 3


def test_conversation_includes_system_prompt():
    conv = InterviewConversation("System prompt here.")
    conv.add_message("user", "Hello")

    messages = conv.get_messages()
    assert messages[0]["role"] == "system"
    assert messages[0]["content"] == "System prompt here."
    assert len(messages) == 2


def test_conversation_truncates_history():
    conv = InterviewConversation("System", max_history=5)
    for i in range(10):
        conv.add_message("user", f"Message {i}")

    assert len(conv.messages) == 5
    assert conv.messages[0]["content"] == "Message 5"


def test_conversation_empty_question_count():
    conv = InterviewConversation("System")
    assert conv.get_question_count() == 0
