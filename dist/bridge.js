#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import https from 'https';
import http from 'http';
/**
 * This script bridges between Claude Desktop (which speaks STDIO)
 * and a remote MCP server (which speaks HTTP).
 *
 * It acts as a server to Claude Desktop and a client to the remote HTTP server.
 */
if (process.argv.length < 3) {
    console.error("Usage: flowmattic-mcp-remote <server-url>");
    process.exit(1);
}
const serverUrl = process.argv[2];
class MCPHTTPBridge {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.setupServer();
    }
    log(message) {
        console.error(`[MCP Remote] ${new Date().toISOString()} ${message}`);
    }
    setupServer() {
        // Create MCP server for Claude Desktop
        this.server = new Server({
            name: "FlowMattic MCP Remote",
            version: "1.0.0"
        }, {
            capabilities: {
                tools: {
                    listChanged: true
                },
                resources: {
                    subscribe: false,
                    listChanged: false
                },
                prompts: {
                    listChanged: false
                }
            }
        });
        this.setupHandlers();
    }
    setupHandlers() {
        // Handle tools/list
        this.server.setRequestHandler("tools/list", async () => {
            this.log("Handling tools/list request");
            try {
                const response = await this.makeHttpRequest({
                    jsonrpc: "2.0",
                    method: "tools/list",
                    params: {},
                    id: this.generateId()
                });
                if (response.error) {
                    throw new Error(response.error.message);
                }
                const tools = response.result?.tools || [];
                this.log(`Retrieved ${tools.length} tools from FlowMattic server`);
                return { tools };
            }
            catch (error) {
                this.log(`Tools/list error: ${error.message}`);
                throw new Error(`Failed to get tools: ${error.message}`);
            }
        });
        // Handle tools/call
        this.server.setRequestHandler("tools/call", async (request) => {
            const toolName = request.params?.name;
            this.log(`Handling tools/call request for tool: ${toolName}`);
            try {
                const response = await this.makeHttpRequest({
                    jsonrpc: "2.0",
                    method: "tools/call",
                    params: request.params,
                    id: this.generateId()
                });
                if (response.error) {
                    throw new Error(response.error.message);
                }
                // Return the content from the FlowMattic server
                return {
                    content: response.result?.content || [
                        {
                            type: "text",
                            text: JSON.stringify(response.result || {})
                        }
                    ]
                };
            }
            catch (error) {
                this.log(`Tools/call error for ${toolName}: ${error.message}`);
                throw new Error(`Tool execution failed: ${error.message}`);
            }
        });
        // Handle resources/list
        this.server.setRequestHandler("resources/list", async () => {
            this.log("Handling resources/list request");
            try {
                const response = await this.makeHttpRequest({
                    jsonrpc: "2.0",
                    method: "resources/list",
                    params: {},
                    id: this.generateId()
                });
                return {
                    resources: response.result?.resources || []
                };
            }
            catch (error) {
                this.log(`Resources/list error: ${error.message}`);
                return { resources: [] };
            }
        });
        // Handle resources/read
        this.server.setRequestHandler("resources/read", async (request) => {
            this.log("Handling resources/read request");
            try {
                const response = await this.makeHttpRequest({
                    jsonrpc: "2.0",
                    method: "resources/read",
                    params: request.params,
                    id: this.generateId()
                });
                return {
                    contents: response.result?.contents || []
                };
            }
            catch (error) {
                this.log(`Resources/read error: ${error.message}`);
                return { contents: [] };
            }
        });
        // Handle prompts/list
        this.server.setRequestHandler("prompts/list", async () => {
            this.log("Handling prompts/list request");
            try {
                const response = await this.makeHttpRequest({
                    jsonrpc: "2.0",
                    method: "prompts/list",
                    params: {},
                    id: this.generateId()
                });
                return {
                    prompts: response.result?.prompts || []
                };
            }
            catch (error) {
                this.log(`Prompts/list error: ${error.message}`);
                return { prompts: [] };
            }
        });
        // Handle prompts/get
        this.server.setRequestHandler("prompts/get", async (request) => {
            this.log("Handling prompts/get request");
            try {
                const response = await this.makeHttpRequest({
                    jsonrpc: "2.0",
                    method: "prompts/get",
                    params: request.params,
                    id: this.generateId()
                });
                return {
                    description: response.result?.description || "",
                    messages: response.result?.messages || []
                };
            }
            catch (error) {
                this.log(`Prompts/get error: ${error.message}`);
                return {
                    description: "",
                    messages: []
                };
            }
        });
    }
    generateId() {
        return Math.floor(Math.random() * 1000000);
    }
    async makeHttpRequest(data) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.serverUrl);
            const postData = JSON.stringify(data);
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'Claude-User/1.0',
                    'Accept': 'application/json'
                },
                // For ngrok/development - ignore SSL errors
                rejectUnauthorized: false
            };
            const client = url.protocol === 'https:' ? https : http;
            const req = client.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                res.on('end', () => {
                    this.log(`HTTP response: ${res.statusCode} - ${responseData.substring(0, 200)}...`);
                    try {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            const parsed = JSON.parse(responseData);
                            resolve(parsed);
                        }
                        else {
                            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                        }
                    }
                    catch (error) {
                        this.log(`Response parse error: ${error.message}`);
                        reject(new Error(`Invalid JSON response: ${responseData}`));
                    }
                });
            });
            req.on('error', (error) => {
                this.log(`Request error: ${error.message}`);
                reject(error);
            });
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            req.setTimeout(30000); // 30 second timeout
            req.write(postData);
            req.end();
        });
    }
    async start() {
        try {
            this.log(`Starting MCP HTTP Bridge for FlowMattic server: ${this.serverUrl}`);
            // Test connection to FlowMattic server
            try {
                await this.makeHttpRequest({
                    jsonrpc: "2.0",
                    method: "initialize",
                    params: {
                        protocolVersion: "2024-11-05",
                        capabilities: {},
                        clientInfo: {
                            name: "FlowMattic MCP Remote",
                            version: "1.0.0"
                        }
                    },
                    id: 1
                });
                this.log("✅ Successfully connected to FlowMattic server");
            }
            catch (error) {
                this.log(`⚠️  FlowMattic server test failed: ${error.message}`);
                this.log("Continuing anyway, but there may be connection issues...");
            }
            // Start stdio transport for Claude Desktop
            const transport = new StdioServerTransport();
            this.log("Starting stdio server for Claude Desktop...");
            await this.server.connect(transport);
            this.log("✅ Bridge started successfully");
            this.log("Waiting for Claude Desktop to connect...");
        }
        catch (error) {
            this.log(`❌ Fatal error starting bridge: ${error.message}`);
            throw error;
        }
    }
}
async function main() {
    try {
        const bridge = new MCPHTTPBridge(serverUrl);
        await bridge.start();
    }
    catch (error) {
        console.error("Fatal error:", error);
        process.exit(1);
    }
}
// Handle process cleanup
process.on('SIGINT', () => {
    console.error('\nReceived SIGINT, shutting down gracefully...');
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.error('\nReceived SIGTERM, shutting down gracefully...');
    process.exit(0);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
main();
