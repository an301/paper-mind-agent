import json
import asyncio
from contextlib import AsyncExitStack
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


class MCPClient:
    """Connects to MCP servers and makes their tools available to the agent.

    Handles starting server subprocesses, discovering tools, and
    forwarding tool calls.
    """

    def __init__(self):
        self._tool_sessions = {}
        self._tool_definitions = []
        # AsyncExitStack manages the lifecycle of all connections.
        # It ensures servers are properly shut down when we're done.
        self._exit_stack = AsyncExitStack()

    @property
    def tools(self):
        """Tool definitions in Anthropic API format."""
        return self._tool_definitions

    @property
    def tool_names(self):
        """Set of all available tool names."""
        return set(self._tool_sessions.keys())

    async def connect_to_server(self, server_script_path, server_name=None):
        """Start an MCP server and discover its tools.

        Args:
            server_script_path: Path to the server's Python script
            server_name: Optional name prefix to avoid tool name collisions
        """
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
        )

        # Use the exit stack to manage the stdio_client context manager.
        # This keeps the server process alive until cleanup() is called.
        transport = await self._exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        read_stream, write_stream = transport

        # Create and initialize the MCP session
        session = await self._exit_stack.enter_async_context(
            ClientSession(read_stream, write_stream)
        )
        await session.initialize()

        # Discover tools
        tools_response = await session.list_tools()

        for tool in tools_response.tools:
            tool_name = tool.name
            if server_name:
                tool_name = f"{server_name}__{tool.name}"

            self._tool_definitions.append({
                "name": tool_name,
                "description": tool.description or "",
                "input_schema": tool.inputSchema,
            })
            self._tool_sessions[tool_name] = {
                "session": session,
                "original_name": tool.name,
            }

        return [t.name for t in tools_response.tools]

    async def call_tool(self, tool_name, arguments):
        """Forward a tool call to the appropriate MCP server."""
        if tool_name not in self._tool_sessions:
            return f"Error: Unknown tool '{tool_name}'"

        session_info = self._tool_sessions[tool_name]
        session = session_info["session"]
        original_name = session_info["original_name"]

        result = await session.call_tool(original_name, arguments)

        texts = []
        for block in result.content:
            if hasattr(block, "text"):
                texts.append(block.text)
        return "\n".join(texts) if texts else "No result returned."

    async def cleanup(self):
        """Shut down all server connections."""
        await self._exit_stack.aclose()
