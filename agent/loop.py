import json


class Agent:
    """The ReAct agent loop.

    This class holds everything the agent needs to work:
    - The Anthropic client (for API calls)
    - The system prompt (instructions for Claude)
    - The tools (definitions + implementations)
    - The conversation history

    We use a class here instead of passing 5 arguments to every
    function call. The __init__ method stores the fixed setup,
    and chat() only needs the user's message.
    """

    def __init__(self, client, system_prompt, tools, tool_functions):
        """Set up the agent with everything it needs.

        Args:
            client: The Anthropic API client
            system_prompt: Instructions for Claude
            tools: List of tool definitions (what Claude sees)
            tool_functions: Dict mapping tool names to Python functions
        """
        self.client = client
        self.system_prompt = system_prompt
        self.tools = tools
        self.tool_functions = tool_functions
        # History lives on the agent so it persists across chat() calls
        self.conversation_history = []

    def chat(self, user_message):
        """The ReAct loop — the core of the agent.

        1. Send the user's message + available tools to Claude
        2. If Claude responds with text → we're done, return it
        3. If Claude responds with a tool call → execute the tool,
           send the result back, and go to step 1
        """
        self.conversation_history.append(
            {"role": "user", "content": user_message}
        )

        while True:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=8096,
                system=self.system_prompt,
                messages=self.conversation_history,
                tools=self.tools,
            )

            if response.stop_reason == "end_turn":
                # Claude gave a final answer
                self.conversation_history.append(
                    {"role": "assistant", "content": response.content}
                )

                for block in response.content:
                    if block.type == "text":
                        return block.text

                return "No response generated."

            elif response.stop_reason == "tool_use":
                # Claude wants to call a tool
                self.conversation_history.append(
                    {"role": "assistant", "content": response.content}
                )

                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        tool_name = block.name
                        tool_input = block.input

                        print(f"  [Tool call: {tool_name}({json.dumps(tool_input)})]")

                        # Execute the tool with error handling.
                        # Tools can fail — bad input, bugs, external
                        # services down. We catch the error and send it
                        # to Claude as the tool result, so it can adapt
                        # (e.g., try different input, or tell the user).
                        # Without this, one bad tool call crashes the agent.
                        try:
                            result = self.tool_functions[tool_name](**tool_input)
                        except KeyError:
                            result = f"Error: Unknown tool '{tool_name}'"
                        except Exception as e:
                            result = f"Error executing {tool_name}: {e}"

                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": str(result),
                            }
                        )

                self.conversation_history.append(
                    {"role": "user", "content": tool_results}
                )
