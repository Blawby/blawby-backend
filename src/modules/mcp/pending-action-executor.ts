import { MCP_TOOLS_REGISTRY } from '@/modules/mcp/mcp.tools.generated';
import type { SelectPendingAction } from '@/modules/pending-actions/database/schema/pending-actions.schema';
import type { ServiceContext } from '@/shared/types/service-context';

/**
 * Executes the underlying MCP tool call recorded on an approved pending
 * action. Lives in the mcp module (not pending-actions) because it's the
 * mcp module that owns the tool registry — pending-actions only owns
 * storage/state, to avoid a circular import between the two modules.
 */
export const executePendingAction = async (row: SelectPendingAction, ctx: ServiceContext): Promise<unknown> => {
  const tool = MCP_TOOLS_REGISTRY.find((t) => t.name === row.tool_name);
  if (!tool) {
    throw new Error(`Unknown tool_name on pending action: ${row.tool_name}`);
  }
  return tool.handler(row.tool_params as Record<string, unknown>, ctx);
};
