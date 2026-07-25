import { z } from '@hono/zod-openapi';

type McpWorkflowDomain = 'practice' | 'intake' | 'matters' | 'billing' | 'trust' | 'documents';
type McpWorkflowAudience = 'mcp' | 'public_docs' | 'internal_agent';
type McpWorkflowMinimumRole = 'owner' | 'admin' | 'member';

interface McpWorkflowArgument {
  name: string;
  description: string;
  required: boolean;
}

interface McpWorkflowDefinition {
  id: string;
  title: string;
  description: string;
  domain: McpWorkflowDomain;
  audience: McpWorkflowAudience[];
  minimumRole: McpWorkflowMinimumRole;
  tools: string[];
  guardrails: string[];
  arguments: McpWorkflowArgument[];
  exampleArguments: Record<string, string>;
  render: (args: Record<string, string | undefined>) => string[];
}

const requireArgument = (args: Record<string, string | undefined>, name: string): string => {
  const value = args[name]?.trim();
  if (!value) {
    throw new Error(`Argument "${name}" is required for this prompt.`);
  }
  return value;
};

const MCP_WORKFLOWS: McpWorkflowDefinition[] = [
  {
    id: 'new_client_intake',
    title: 'New client intake',
    description: 'Start and guide a prospective client through the practice intake workflow.',
    domain: 'intake',
    audience: ['mcp', 'public_docs', 'internal_agent'],
    minimumRole: 'member',
    tools: ['list_intake_templates', 'trigger_intake_invitation', 'get_intake', 'update_intake'],
    guardrails: [
      'Collect operational facts without giving legal advice.',
      'Ask only for missing required fields and never invent an answer.',
      'Do not represent an intake as accepted or converted until a staff-owned tool confirms that state.',
    ],
    arguments: [
      { name: 'client_name', description: 'Prospective client name.', required: true },
      { name: 'client_email', description: 'Email address to receive the intake invitation.', required: true },
      { name: 'matter_summary', description: 'Known short summary of the prospective matter.', required: false },
    ],
    exampleArguments: {
      client_name: 'Example Client',
      client_email: 'client@example.test',
      matter_summary: 'Needs help with a residential lease dispute.',
    },
    render: (args) => {
      const clientName = requireArgument(args, 'client_name');
      const clientEmail = requireArgument(args, 'client_email');
      const matterSummary = args.matter_summary?.trim();
      return [
        'Call list_intake_templates and identify the published template that fits the request. Do not invent a template or required field.',
        `Call trigger_intake_invitation for ${clientName} at ${clientEmail}, using the selected canonical template.`,
        matterSummary
          ? `Use this caller-provided matter context when the tool accepts it: ${matterSummary}`
          : 'Ask for a short matter summary only if the selected intake workflow requires it.',
        'After an intake exists, call get_intake before asking questions. Ask only for required fields that are still missing, then call update_intake with the client-provided answers.',
        'Treat all conflict, jurisdiction, urgency, and fit outputs as staff review material. Never promise representation, acceptance, an outcome, or legal advice.',
      ];
    },
  },
  {
    id: 'conflict_check',
    title: 'Conflict check',
    description: 'Collect known parties and run the practice conflict-check workflow for staff review.',
    domain: 'practice',
    audience: ['mcp', 'public_docs', 'internal_agent'],
    minimumRole: 'member',
    tools: ['run_conflict_check'],
    guardrails: [
      'A conflict result is review material, not a legal conclusion.',
      'Never convert an unknown party into a negative match.',
      'Do not expose another client or matter beyond the tool response authorized for the caller.',
    ],
    arguments: [
      { name: 'client_name', description: 'Prospective or current client name.', required: true },
      { name: 'opposing_parties', description: 'Comma-separated opposing party names, when known.', required: false },
      { name: 'opposing_counsel', description: 'Comma-separated opposing counsel names, when known.', required: false },
      { name: 'matter_summary', description: 'Short factual description of the matter.', required: false },
    ],
    exampleArguments: {
      client_name: 'Example Client',
      opposing_parties: 'Example Landlord LLC',
      matter_summary: 'Residential lease dispute.',
    },
    render: (args) => {
      const clientName = requireArgument(args, 'client_name');
      const opposingParties = args.opposing_parties?.trim();
      const opposingCounsel = args.opposing_counsel?.trim();
      const matterSummary = args.matter_summary?.trim();
      return [
        `Prepare run_conflict_check with the client name "${clientName}".`,
        opposingParties
          ? `Include these caller-provided opposing parties: ${opposingParties}.`
          : 'Ask whether any opposing parties are known; preserve an explicit unknown if none are provided.',
        opposingCounsel
          ? `Include this caller-provided opposing counsel: ${opposingCounsel}.`
          : 'Ask whether opposing counsel is known only when that fact is available to the caller.',
        matterSummary
          ? `Include this caller-provided matter summary: ${matterSummary}`
          : 'Request a short factual matter summary when needed to distinguish potential matches.',
        'Call run_conflict_check once with the collected facts. Present matches and uncertainty for staff review; do not declare that no conflict exists or provide legal advice.',
      ];
    },
  },
];

const workflowById = new Map(MCP_WORKFLOWS.map((workflow) => [workflow.id, workflow]));

const getMcpWorkflow = (id: string): McpWorkflowDefinition => {
  const workflow = workflowById.get(id);
  if (!workflow) {
    throw new Error(`Unknown MCP workflow prompt "${id}".`);
  }
  return workflow;
};

const renderMcpWorkflow = (
  id: string,
  args: Record<string, string | undefined>
): { description: string; text: string } => {
  const workflow = getMcpWorkflow(id);
  return {
    description: workflow.description,
    text: [...workflow.render(args), ...workflow.guardrails.map((guardrail) => `Guardrail: ${guardrail}`)].join(' '),
  };
};

const buildMcpWorkflowArgumentShape = (
  workflow: McpWorkflowDefinition
): Record<string, z.ZodString | z.ZodOptional<z.ZodString>> =>
  Object.fromEntries(
    workflow.arguments.map((argument) => [
      argument.name,
      argument.required
        ? z.string().trim().min(1).describe(argument.description)
        : z.string().trim().min(1).optional().describe(argument.description),
    ])
  );

const validateMcpWorkflowRegistry = (knownToolNames: ReadonlySet<string>): void => {
  const seen = new Set<string>();
  for (const workflow of MCP_WORKFLOWS) {
    if (seen.has(workflow.id)) {
      throw new Error(`Duplicate MCP workflow prompt "${workflow.id}".`);
    }
    seen.add(workflow.id);

    if (!workflow.id || !workflow.title || !workflow.description || workflow.audience.length === 0) {
      throw new Error(`MCP workflow "${workflow.id}" is missing required metadata.`);
    }
    if (workflow.tools.length === 0) {
      throw new Error(`MCP workflow "${workflow.id}" must reference at least one tool.`);
    }
    if (workflow.guardrails.length === 0) {
      throw new Error(`MCP workflow "${workflow.id}" must define at least one guardrail.`);
    }
    if (workflow.guardrails.some((guardrail) => !guardrail.trim())) {
      throw new Error(`MCP workflow "${workflow.id}" has a blank guardrail.`);
    }

    const argumentNames = new Set<string>();
    const argumentDescriptions = new Set<string>();
    for (const argument of workflow.arguments) {
      const argumentName = argument.name.trim();
      const argumentDescription = argument.description.trim();
      if (!argumentName || !argumentDescription) {
        throw new Error(`MCP workflow "${workflow.id}" has an argument with a blank name or description.`);
      }
      if (argumentNames.has(argumentName)) {
        throw new Error(`MCP workflow "${workflow.id}" has duplicate argument name "${argumentName}".`);
      }
      if (argumentDescriptions.has(argumentDescription)) {
        throw new Error(`MCP workflow "${workflow.id}" has duplicate argument description "${argumentDescription}".`);
      }
      argumentNames.add(argumentName);
      argumentDescriptions.add(argumentDescription);
    }

    for (const toolName of workflow.tools) {
      if (!knownToolNames.has(toolName)) {
        throw new Error(`MCP workflow "${workflow.id}" references unknown tool "${toolName}".`);
      }
    }
    renderMcpWorkflow(workflow.id, workflow.exampleArguments);
  }
};

const renderMcpWorkflowDocs = (): string =>
  MCP_WORKFLOWS.filter((workflow) => workflow.audience.includes('public_docs'))
    .map((workflow) => {
      const argumentsText = workflow.arguments
        .map(
          (argument) =>
            `- \`${argument.name}\` (${argument.required ? 'required' : 'optional'}): ${argument.description}`
        )
        .join('\n');
      return `## ${workflow.title}\n\n${workflow.description}\n\nTools: ${workflow.tools.map((tool) => `\`${tool}\``).join(', ')}\n\n${argumentsText}`;
    })
    .join('\n\n');

export {
  MCP_WORKFLOWS,
  buildMcpWorkflowArgumentShape,
  getMcpWorkflow,
  renderMcpWorkflow,
  renderMcpWorkflowDocs,
  validateMcpWorkflowRegistry,
};
export type {
  McpWorkflowArgument,
  McpWorkflowAudience,
  McpWorkflowDefinition,
  McpWorkflowDomain,
  McpWorkflowMinimumRole,
};
