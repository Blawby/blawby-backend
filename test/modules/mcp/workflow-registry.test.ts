import { describe, expect, it } from 'vitest';
import {
  MCP_WORKFLOWS,
  renderMcpWorkflow,
  renderMcpWorkflowDocs,
  type McpWorkflowDefinition,
  validateMcpWorkflowRegistry,
} from '@/modules/mcp/workflow-registry';

const knownTools = new Set([
  'list_intake_templates',
  'trigger_intake_invitation',
  'get_intake',
  'update_intake',
  'run_conflict_check',
]);

interface MalformedWorkflowCase {
  label: string;
  override: Partial<McpWorkflowDefinition>;
  expectedError: string;
}

const malformedWorkflowCases: MalformedWorkflowCase[] = [
  {
    label: 'an empty tool list',
    override: { tools: [] },
    expectedError: 'must reference at least one tool',
  },
  {
    label: 'an empty guardrail list',
    override: { guardrails: [] },
    expectedError: 'must define at least one guardrail',
  },
  {
    label: 'a blank argument name',
    override: {
      arguments: [{ name: ' ', description: 'Client name.', required: true }],
    },
    expectedError: 'blank name or description',
  },
  {
    label: 'a blank argument description',
    override: {
      arguments: [{ name: 'client_name', description: ' ', required: true }],
    },
    expectedError: 'blank name or description',
  },
  {
    label: 'duplicate argument names',
    override: {
      arguments: [
        { name: 'client_name', description: 'Prospective client name.', required: true },
        { name: 'client_name', description: 'Current client name.', required: false },
      ],
    },
    expectedError: 'duplicate argument name "client_name"',
  },
  {
    label: 'duplicate argument descriptions',
    override: {
      arguments: [
        { name: 'client_name', description: 'Client name.', required: true },
        { name: 'other_name', description: 'Client name.', required: false },
      ],
    },
    expectedError: 'duplicate argument description "Client name."',
  },
];

const expectMalformedWorkflowToFail = (override: Partial<McpWorkflowDefinition>, expectedError: string): void => {
  const [workflow] = MCP_WORKFLOWS;
  if (!workflow) {
    throw new Error('Expected at least one MCP workflow fixture.');
  }

  const originalWorkflow = { ...workflow };
  Object.assign(workflow, override);
  try {
    expect(() => validateMcpWorkflowRegistry(knownTools)).toThrow(expectedError);
  } finally {
    Object.assign(workflow, originalWorkflow);
  }
};

describe('MCP workflow registry', () => {
  it('validates complete metadata, rendering, and real tool references', () => {
    expect(() => validateMcpWorkflowRegistry(knownTools)).not.toThrow();
    expect(MCP_WORKFLOWS.map((workflow) => workflow.id)).toEqual(['new_client_intake', 'conflict_check']);
  });

  it('fails visibly when the generated tool inventory cannot satisfy a workflow', () => {
    expect(() => validateMcpWorkflowRegistry(new Set(['run_conflict_check']))).toThrow(
      'references unknown tool "list_intake_templates"'
    );
  });

  it.each(malformedWorkflowCases)('rejects $label', ({ override, expectedError }) => {
    expectMalformedWorkflowToFail(override, expectedError);
  });

  it('returns explicit missing-argument and unknown-prompt errors', () => {
    expect(() => renderMcpWorkflow('new_client_intake', {})).toThrow(
      'Argument "client_name" is required for this prompt.'
    );
    expect(() => renderMcpWorkflow('not_registered', {})).toThrow('Unknown MCP workflow prompt "not_registered".');
  });

  it('renders intake and conflict prompts with caller facts and guardrails', () => {
    const intake = renderMcpWorkflow('new_client_intake', {
      client_name: 'Ada Client',
      client_email: 'ada@example.test',
      matter_summary: 'Lease dispute',
    });
    const conflict = renderMcpWorkflow('conflict_check', {
      client_name: 'Ada Client',
      opposing_parties: 'Example Landlord LLC',
    });

    expect(intake.text).toContain('trigger_intake_invitation');
    expect(intake.text).toContain('Lease dispute');
    expect(conflict.text).toContain('run_conflict_check');
    expect(conflict.text).toContain('staff review');
  });

  it('derives public AI Assistance documentation from the same registry', () => {
    const docs = renderMcpWorkflowDocs();
    expect(docs).toContain('## New client intake');
    expect(docs).toContain('`client_email` (required)');
    expect(docs).toContain('## Conflict check');
    expect(docs).toContain('`run_conflict_check`');
  });
});
