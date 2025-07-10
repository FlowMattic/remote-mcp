#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
/**
 * This script bridges between Claude Desktop (which speaks STDIO)
 * and a remote MCP server (which speaks SSE over HTTP).
 *
 * It acts as a client to the remote SSE server and a server to Claude Desktop.
 */
if (process.argv.length < 3) {
    console.error("Usage: mcp-remote <server-url>");
    process.exit(1);
}
const serverUrl = process.argv[2];
async function main() {
    try {
        // Create a client to connect to our SSE server
        const clientTransport = new SSEClientTransport(new URL(serverUrl));
        const client = new Client({
            name: "FlowMattic MCP Remote",
            version: "1.0.0"
        }, {
            capabilities: {
                tools: {},
            }
        });
        // Connect to the SSE server
        await client.connect(clientTransport);
        console.error(`Connected to SSE server at ${serverUrl}`);
        // Create a stdio server to talk to Claude Desktop
        const stdioServer = new StdioServerTransport();
        // Forward messages from Claude Desktop to the SSE server
        stdioServer.onmessage = async (message) => {
            try {
                await clientTransport.send(message);
            }
            catch (error) {
                console.error("Error forwarding message to SSE server:", error);
            }
        };
        // Forward messages from the SSE server to Claude Desktop
        clientTransport.onmessage = async (message) => {
            try {
                await stdioServer.send(message);
            }
            catch (error) {
                console.error("Error forwarding message to Claude Desktop:", error);
            }
        };
        // Start the stdio server
        await stdioServer.start();
        console.error("Bridge is running. Waiting for Claude Desktop to connect...");
    }
    catch (error) {
        console.error("Fatal error:", error);
        process.exit(1);
    }
}
main();
