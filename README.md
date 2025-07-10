# mcp-remote

A lightweight bridge for connecting to Model Context Protocol (MCP) servers remotely. This package allows Claude Desktop or other MCP-compatible clients to connect to remote MCP servers using a simple bridge.

## Installation

```bash
npm install -g mcp-remote
```

Or install it directly from GitHub:

```bash
npm install -g github:flowmattic/mcp-remote
```

## Usage

```bash
mcp-remote <server-url>
```

For example:

```bash
mcp-remote https://your-mcp-server.example.com/events
```

## How it works

This bridge:
1. Acts as a client to the specified MCP server (which speaks SSE over HTTP)
2. Creates a local STDIO server to talk to Claude Desktop or other MCP clients
3. Forwards messages between the remote server and local clients

## Development

1. Clone the repository:
   ```bash
   git clone https://github.com/flowmattic/mcp-remote.git
   cd mcp-remote
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Run the bridge:
   ```bash
   npm start -- https://your-mcp-server.example.com/events
   ```

## License

MIT
