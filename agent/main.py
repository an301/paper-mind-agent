from dotenv import load_dotenv
from anthropic import Anthropic
from prompts import SYSTEM_PROMPT
from tools import TOOLS, TOOL_FUNCTIONS
from loop import Agent

# Load the API key from .env into environment variables
load_dotenv()

# Create the Anthropic client and the agent
client = Anthropic()
agent = Agent(client, SYSTEM_PROMPT, TOOLS, TOOL_FUNCTIONS)


def main():
    """Main conversation loop — handles user input/output only.

    The agent logic (API calls, tool execution) lives in loop.py.
    This function just collects input and displays output.
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

        response = agent.chat(user_input)
        print(f"\nAssistant: {response}\n")


if __name__ == "__main__":
    main()
