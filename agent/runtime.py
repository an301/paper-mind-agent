"""MCP server lifecycle as a reusable async context manager.

Lifts the boot/teardown code out of backend/api.py so the production
backend and the eval harness share one path. Eval ablations toggle
individual servers off via the keyword flags.

Usage:
    async with agent_runtime() as (anthropic_client, mcp_client):
        ...

    # Ablation: only paper_parser
    async with agent_runtime(knowledge_graph=False) as (client, mcp):
        ...
"""

import sys
from contextlib import asynccontextmanager
from pathlib import Path

from anthropic import AsyncAnthropic

# Make sibling modules importable regardless of how this file is loaded.
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from mcp_client import MCPClient  # noqa: E402

PROJECT_ROOT = _HERE.parent
PAPER_PARSER_SERVER = str(PROJECT_ROOT / "mcp_servers" / "paper_parser" / "server.py")
KNOWLEDGE_GRAPH_SERVER = str(PROJECT_ROOT / "mcp_servers" / "knowledge_graph" / "server.py")


@asynccontextmanager
async def agent_runtime(
    *,
    paper_parser: bool = True,
    knowledge_graph: bool = True,
    verbose: bool = True,
):
    """Boot the requested MCP servers and yield (AsyncAnthropic, MCPClient).

    Production backend uses defaults (both servers on). Eval harness toggles
    individual flags off for ablation runs.
    """
    anthropic_client = AsyncAnthropic()
    mcp = MCPClient()

    try:
        if verbose:
            print("Starting MCP servers...")
        if paper_parser:
            tools = await mcp.connect_to_server(PAPER_PARSER_SERVER)
            if verbose:
                print(f"  Paper Parser: {tools}")
        if knowledge_graph:
            tools = await mcp.connect_to_server(KNOWLEDGE_GRAPH_SERVER)
            if verbose:
                print(f"  Knowledge Graph: {tools}")
        if verbose:
            print(f"  Total tools: {len(mcp.tools)}")
            print("Agent runtime ready.\n")

        yield anthropic_client, mcp
    finally:
        await mcp.cleanup()
        if verbose:
            print("MCP servers shut down.")
