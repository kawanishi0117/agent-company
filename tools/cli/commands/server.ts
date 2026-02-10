/**
 * @file Server Command
 * @description Orchestrator APIサーバーの起動コマンド
 * @module cli/commands/server
 */

import { startServer } from '../lib/execution/orchestrator-server.js';

// =============================================================================
// 定数
// =============================================================================

const DEFAULT_PORT = 3001;

// =============================================================================
// コマンド実装
// =============================================================================

/**
 * サーバー起動コマンド
 */
export async function serverCommand(args: string[]): Promise<void> {
  // ポート番号を取得
  let port = DEFAULT_PORT;
  const portIndex = args.indexOf('--port');
  if (portIndex !== -1 && args[portIndex + 1]) {
    port = parseInt(args[portIndex + 1], 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error('Error: Invalid port number');
      process.exit(1);
    }
  }

  console.log('Starting Orchestrator API Server...');
  console.log(`Port: ${port}`);

  try {
    const server = await startServer(port);

    // シグナルハンドリング
    const shutdown = async (): Promise<void> => {
      console.log('\nShutting down...');
      await server.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log('\nOrchestrator API Server is running.');
    console.log(`Health check: http://localhost:${port}/api/health`);
    console.log('\nAvailable endpoints:');
    console.log('  POST   /api/tasks              - Submit a new task');
    console.log('  GET    /api/tasks/:id          - Get task status');
    console.log('  DELETE /api/tasks/:id          - Cancel a task');
    console.log('  GET    /api/agents             - Get active agents');
    console.log('  POST   /api/agents/pause       - Pause all agents');
    console.log('  POST   /api/agents/resume      - Resume all agents');
    console.log('  POST   /api/agents/emergency-stop - Emergency stop');
    console.log('  POST   /api/tickets            - Create ticket and execute');
    console.log('  GET    /api/dashboard/status   - Dashboard status');
    console.log('  GET    /api/config             - Get config');
    console.log('  PUT    /api/config             - Update config');
    console.log('\nPress Ctrl+C to stop.');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * ヘルプ表示
 */
export function showServerHelp(): void {
  console.log(`
Usage: agentcompany server [options]

Start the Orchestrator API server for GUI integration.

Options:
  --port <number>  Port number (default: 3001)
  --help           Show this help message

Examples:
  agentcompany server
  agentcompany server --port 8080
`);
}

export default serverCommand;
