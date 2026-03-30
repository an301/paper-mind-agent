import os
import asyncio
from dotenv import load_dotenv
from anthropic import AsyncAnthropic
from prompts import SYSTEM_PROMPT
from loop import Agent
from mcp_client import MCPClient

load_dotenv()

# Paths to MCP servers
PAPER_PARSER_SERVER = os.path.join(
    os.path.dirname(__file__),
    "..", "mcp_servers", "paper_parser", "server.py"
)

KNOWLEDGE_GRAPH_SERVER = os.path.join(
    os.path.dirname(__file__),
    "..", "mcp_servers", "knowledge_graph", "server.py"
)


async def main():
    client = AsyncAnthropic()
    mcp = MCPClient()

    # Connect to MCP servers
    print("Starting Paper Parser MCP server...")
    paper_tools = await mcp.connect_to_server(PAPER_PARSER_SERVER)
    print(f"  Paper Parser tools: {paper_tools}")

    print("Starting Knowledge Graph MCP server...")
    kg_tools = await mcp.connect_to_server(KNOWLEDGE_GRAPH_SERVER)
    print(f"  Knowledge Graph tools: {kg_tools}")

    print(f"\nAll tools loaded. Total: {len(paper_tools) + len(kg_tools)}\n")

    # Create the agent with all MCP tools
    agent = Agent(client, SYSTEM_PROMPT, mcp_client=mcp)

    print("Research Mind — Phase 4")
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
