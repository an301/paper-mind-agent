import os
import asyncio
from dotenv import load_dotenv
from anthropic import Anthropic
from prompts import SYSTEM_PROMPT
from loop import Agent
from mcp_client import MCPClient

load_dotenv()

# Path to the Paper Parser MCP server
PAPER_PARSER_SERVER = os.path.join(
    os.path.dirname(__file__),
    "..", "mcp_servers", "paper_parser", "server.py"
)


async def main():
    client = Anthropic()
    mcp = MCPClient()

    # Connect to the Paper Parser MCP server
    print("Starting Paper Parser MCP server...")
    tools = await mcp.connect_to_server(PAPER_PARSER_SERVER)
    print(f"Connected. Available tools: {tools}\n")

    # Create the agent with MCP tools
    agent = Agent(client, SYSTEM_PROMPT, mcp_client=mcp)

    print("Paper Mind Agent — Phase 2")
    print("Type 'quit' to exit.\n")

    try:
        while True:
            user_input = input("You: ").strip()

            if not user_input:
                continue

            if user_input.lower() == "quit":
                print("Goodbye!")
                break

            response = await agent.chat_async(user_input)
            print(f"\nAssistant: {response}\n")
    finally:
        await mcp.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
