import json
import asyncio


class Agent:
    """The ReAct agent loop.

    Supports tools from two sources:
    - Local Python functions (like Phase 1 toy tools)
    - MCP servers (like the Paper Parser)
    """

    def __init__(self, client, system_prompt, tools=None, tool_functions=None, mcp_client=None):
        self.client = client
        self.system_prompt = system_prompt
        # Local tools (Phase 1 style)
        self.tools = tools or []
        self.tool_functions = tool_functions or {}
        # MCP client for server-based tools
        self.mcp_client = mcp_client
        self.conversation_history = []

    def get_all_tools(self):
        """Combine local tool definitions with MCP tool definitions."""
        all_tools = list(self.tools)
        if self.mcp_client:
            all_tools.extend(self.mcp_client.tools)
        return all_tools

    def chat(self, user_message):
        """Synchronous wrapper around the async ReAct loop."""
        return asyncio.run(self._chat_async(user_message))

    async def chat_async(self, user_message):
        """Async version of chat for use in async contexts."""
        return await self._chat_async(user_message)

    async def _chat_async(self, user_message):
        """The ReAct loop — the core of the agent.

        1. Send the user's message + available tools to Claude
        2. If Claude responds with text → we're done, return it
        3. If Claude responds with a tool call → execute the tool,
           send the result back, and go to step 1
        """
        self.conversation_history.append(
            {"role": "user", "content": user_message}
        )

        all_tools = self.get_all_tools()

        while True:
            # Build API call kwargs — only include tools if we have any
            api_kwargs = {
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 8096,
                "system": self.system_prompt,
                "messages": self.conversation_history,
            }
            if all_tools:
                api_kwargs["tools"] = all_tools

            response = self.client.messages.create(**api_kwargs)

            if response.stop_reason == "end_turn":
                self.conversation_history.append(
                    {"role": "assistant", "content": response.content}
                )

                for block in response.content:
                    if block.type == "text":
                        return block.text

                return "No response generated."

            elif response.stop_reason == "tool_use":
                self.conversation_history.append(
                    {"role": "assistant", "content": response.content}
                )

                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        tool_name = block.name
                        tool_input = block.input

                        print(f"  [Tool call: {tool_name}({json.dumps(tool_input)})]")

                        try:
                            result = await self._execute_tool(tool_name, tool_input)
                        except Exception as e:
                            result = f"Error executing {tool_name}: {e}"

                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": str(result),
                        })

                self.conversation_history.append(
                    {"role": "user", "content": tool_results}
                )

    async def _execute_tool(self, tool_name, tool_input):
        """Execute a tool — checks local functions first, then MCP servers."""
        # Check local tools first
        if tool_name in self.tool_functions:
            return self.tool_functions[tool_name](**tool_input)

        # Check MCP tools
        if self.mcp_client and tool_name in self.mcp_client.tool_names:
            return await self.mcp_client.call_tool(tool_name, tool_input)

        return f"Error: Unknown tool '{tool_name}'"
