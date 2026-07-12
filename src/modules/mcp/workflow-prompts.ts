import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnyToolDef } from '@/modules/mcp/types';
import {
  MCP_WORKFLOWS,
  buildMcpWorkflowArgumentShape,
  renderMcpWorkflow,
  validateMcpWorkflowRegistry,
} from '@/modules/mcp/workflow-registry';

export const registerMcpWorkflowPrompts = (server: McpServer, tools: AnyToolDef[]): void => {
  validateMcpWorkflowRegistry(new Set(tools.map((tool) => tool.name)));

  for (const workflow of MCP_WORKFLOWS.filter((definition) => definition.audience.includes('mcp'))) {
    server.registerPrompt(
      workflow.id,
      {
        title: workflow.title,
        description: workflow.description,
        argsSchema: buildMcpWorkflowArgumentShape(workflow),
      },
      (args) => {
        const normalizedArgs = Object.fromEntries(
          Object.entries(args).map(([name, value]) => [name, typeof value === 'string' ? value : undefined])
        );
        const rendered = renderMcpWorkflow(workflow.id, normalizedArgs);
        return {
          description: rendered.description,
          messages: [{ role: 'user', content: { type: 'text', text: rendered.text } }],
        };
      }
    );
  }
};
