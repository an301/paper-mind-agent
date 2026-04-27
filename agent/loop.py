import json
import asyncio


class Agent:
    """The ReAct agent loop.

    Supports tools from two sources:
    - Local Python functions (like Phase 1 toy tools)
    - MCP servers (like the Paper Parser, Knowledge Graph)

    Uses AsyncAnthropic client for non-blocking API calls.
    """

    def __init__(
        self,
        client,
        system_prompt,
        tools=None,
        tool_functions=None,
        mcp_client=None,
        excluded_tools: set[str] | None = None,
        temperature: float = 0.0,
    ):
        self.client = client
        self.system_prompt = system_prompt
        self.tools = tools or []
        self.tool_functions = tool_functions or {}
        self.mcp_client = mcp_client
        self.excluded_tools = excluded_tools or set()
        self.temperature = temperature
        self.conversation_history = []
        # Per-call usage records — eval sums these for telemetry.
        self.usage_log: list[dict] = []

    def get_all_tools(self):
        """Combine local + MCP tool definitions, filtering excluded names."""
        all_tools = list(self.tools)
        if self.mcp_client:
            all_tools.extend(self.mcp_client.tools)
        if self.excluded_tools:
            all_tools = [t for t in all_tools if t["name"] not in self.excluded_tools]
        return all_tools

    def chat(self, user_message):
        """Synchronous wrapper for simple CLI use."""
        return asyncio.run(self._chat_async(user_message))

    async def chat_async(self, user_message):
        """Async version — returns the full text response."""
        return await self._chat_async(user_message)

    async def _chat_async(self, user_message):
        """The ReAct loop — calls Claude, executes tools, repeats until done."""
        self.conversation_history.append(
            {"role": "user", "content": user_message}
        )

        all_tools = self.get_all_tools()
        collected_text = []

        while True:
            api_kwargs = {
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 8096,
                "temperature": self.temperature,
                "system": self.system_prompt,
                "messages": self.conversation_history,
            }
            if all_tools:
                api_kwargs["tools"] = all_tools

            response = await self.client.messages.create(**api_kwargs)
            self.usage_log.append({
                "input_tokens": getattr(response.usage, "input_tokens", 0),
                "output_tokens": getattr(response.usage, "output_tokens", 0),
            })

            for block in response.content:
                if block.type == "text" and block.text:
                    collected_text.append(block.text)

            if response.stop_reason == "end_turn":
                self.conversation_history.append(
                    {"role": "assistant", "content": response.content}
                )
                return "\n\n".join(collected_text) if collected_text else "No response generated."

            elif response.stop_reason == "tool_use":
                self.conversation_history.append(
                    {"role": "assistant", "content": response.content}
                )

                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        print(f"  [Tool call: {block.name}({json.dumps(block.input)})]")
                        try:
                            result = await self._execute_tool(block.name, block.input)
                        except Exception as e:
                            result = f"Error executing {block.name}: {e}"

                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": str(result),
                        })

                self.conversation_history.append(
                    {"role": "user", "content": tool_results}
                )

    async def chat_stream(self, user_message):
        """Async generator that yields events during the ReAct loop.

        Streams tokens as they arrive and reports tool calls.

        Events yielded:
        - {"type": "token", "text": "..."} — streamed text token
        - {"type": "tool_call", "name": "...", "input": {...}} — tool being called
        - {"type": "done"} — response complete
        """
        self.conversation_history.append(
            {"role": "user", "content": user_message}
        )

        all_tools = self.get_all_tools()

        while True:
            api_kwargs = {
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 8096,
                "temperature": self.temperature,
                "system": self.system_prompt,
                "messages": self.conversation_history,
            }
            if all_tools:
                api_kwargs["tools"] = all_tools

            # Stream the response — tokens arrive as they're generated
            async with self.client.messages.stream(**api_kwargs) as stream:
                async for text in stream.text_stream:
                    yield {"type": "token", "text": text}
                response = await stream.get_final_message()
            self.usage_log.append({
                "input_tokens": getattr(response.usage, "input_tokens", 0),
                "output_tokens": getattr(response.usage, "output_tokens", 0),
            })

            if response.stop_reason == "end_turn":
                self.conversation_history.append(
                    {"role": "assistant", "content": response.content}
                )
                yield {"type": "done"}
                return

            elif response.stop_reason == "tool_use":
                self.conversation_history.append(
                    {"role": "assistant", "content": response.content}
                )

                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        yield {
                            "type": "tool_call",
                            "name": block.name,
                            "input": block.input,
                        }

                        try:
                            result = await self._execute_tool(block.name, block.input)
                        except Exception as e:
                            result = f"Error executing {block.name}: {e}"

                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": str(result),
                        })

                self.conversation_history.append(
                    {"role": "user", "content": tool_results}
                )
                # Continue the while loop — Claude will respond to tool results

    async def _execute_tool(self, tool_name, tool_input):
        """Execute a tool — checks local functions first, then MCP servers."""
        if tool_name in self.tool_functions:
            return self.tool_functions[tool_name](**tool_input)

        if self.mcp_client and tool_name in self.mcp_client.tool_names:
            return await self.mcp_client.call_tool(tool_name, tool_input)

        return f"Error: Unknown tool '{tool_name}'"
