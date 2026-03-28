import os
from dotenv import load_dotenv
from anthropic import Anthropic
from prompts import SYSTEM_PROMPT

# Load the API key from .env file into environment variables.
# This keeps secrets out of source code — a production habit.
load_dotenv()

# Create the Anthropic client. It automatically reads
# ANTHROPIC_API_KEY from environment variables.
client = Anthropic()

# Conversation history — a list of messages exchanged between
# the user and the assistant. We send the FULL history with every
# API call because the API is stateless: Claude doesn't remember
# previous calls. Your code is responsible for maintaining context.
conversation_history = []


def chat(user_message):
    """Send a message to Claude and return the response.

    This function does three things:
    1. Adds the user's message to conversation history
    2. Sends the full history to Claude (so it has context)
    3. Adds Claude's response to history (so future calls have it too)
    """
    # Add the user's message to history
    conversation_history.append({"role": "user", "content": user_message})

    # Make the API call. We send:
    # - model: which Claude model to use
    # - max_tokens: maximum length of the response
    # - system: the system prompt (instructions for Claude)
    # - messages: the full conversation history
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8096,
        system=SYSTEM_PROMPT,
        messages=conversation_history,
    )

    # The response contains a list of content blocks.
    # For a text response (no tools), there's one block with type "text".
    assistant_message = response.content[0].text

    # Add Claude's response to history so it has context for next turn
    conversation_history.append({"role": "assistant", "content": assistant_message})

    return assistant_message


def main():
    """Main conversation loop.

    A simple while loop that:
    1. Gets user input
    2. Sends it to Claude
    3. Prints the response
    4. Repeats until the user types 'quit'
    """
    print("Paper Mind Agent — Phase 1")
    print("Type 'quit' to exit.\n")

    while True:
        user_input = input("You: ").strip()

        if not user_input:
            continue

        if user_input.lower() == "quit":
            print("Goodbye!")
            break

        response = chat(user_input)
        print(f"\nAssistant: {response}\n")


# This is a Python convention. It means: only run main() if this
# file is executed directly (python main.py), not if it's imported
# by another file.
if __name__ == "__main__":
    main()
