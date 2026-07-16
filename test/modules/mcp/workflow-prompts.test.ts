import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import type { AnyToolDef } from '@/modules/mcp/types';
import { registerMcpWorkflowPrompts } from '@/modules/mcp/workflow-prompts';

const tools: AnyToolDef[] = [
  'list_intake_templates',
  'trigger_intake_invitation',
  'get_intake',
  'update_intake',
  'run_conflict_check',
].map((name) => ({
  name,
  description: name,
  scope: 'test',
  schema: {},
  handler: async () => null,
}));

const withMcpClient = async <T>(run: (client: Client) => Promise<T>): Promise<T> => {
  const server = new McpServer({ name: 'workflow-prompt-test', version: '1.0.0' });
  registerMcpWorkflowPrompts(server, tools);
  const client = new Client({ name: 'workflow-prompt-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await run(client);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
};

describe('MCP workflow prompt protocol', () => {
  it('lists the canonical workflow prompts with typed arguments', async () => {
    await withMcpClient(async (client) => {
      const result = await client.listPrompts();

      expect(result.prompts.map((prompt) => prompt.name)).toEqual(['new_client_intake', 'conflict_check']);
      expect(result.prompts[0]?.arguments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'client_name', required: true }),
          expect.objectContaining({ name: 'client_email', required: true }),
        ])
      );
    });
  });

  it('renders a prompt through prompts/get using caller-provided facts', async () => {
    await withMcpClient(async (client) => {
      const result = await client.getPrompt({
        name: 'conflict_check',
        arguments: {
          client_name: 'Ada Client',
          opposing_parties: 'Example Landlord LLC',
        },
      });

      expect(result.description).toContain('practice conflict-check workflow');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toMatchObject({ type: 'text' });
      if (result.messages[0]?.content.type === 'text') {
        expect(result.messages[0].content.text).toContain('Example Landlord LLC');
        expect(result.messages[0].content.text).toContain('staff review');
      }
    });
  });
});
