interface PracticeSkillContext {
  practiceName: string;
  jurisdictions: string[];
  practiceAreas: string[];
  billingIncrementMinutes: number;
  consultationFeeCents: number | null;
  introMessage: string | null;
}

interface PracticeSkillDefinition {
  key: PracticeSkillKey;
  label: string;
  description: string;
  version: number;
  scopes: string[];
  buildPromptContribution: (context: PracticeSkillContext) => string[];
}

const PRACTICE_SKILL_KEYS = ['matter_management', 'billing', 'client_intake'] as const;
type PracticeSkillKey = (typeof PRACTICE_SKILL_KEYS)[number];

const formatList = (values: string[]): string => (values.length > 0 ? values.join(', ') : 'not configured');

const SKILL_REGISTRY: Record<PracticeSkillKey, PracticeSkillDefinition> = {
  matter_management: {
    key: 'matter_management',
    label: 'Matter management',
    description: 'Work with matters, tasks, deadlines, notes, files, and engagement records.',
    version: 1,
    scopes: [
      'matters:read',
      'matters:write',
      'engagement_contracts:read',
      'engagement_contracts:write',
      'engagement_templates:read',
      'engagement_templates:write',
    ],
    buildPromptContribution: (context) => [
      'Matter management is enabled.',
      `Practice areas: ${formatList(context.practiceAreas)}.`,
      `Jurisdictions: ${formatList(context.jurisdictions)}.`,
      'Use persisted matter state and never invent a deadline, assignment, status, or engagement term.',
    ],
  },
  billing: {
    key: 'billing',
    label: 'Billing and trust',
    description: 'Review invoices, time, payouts, subscriptions, and trust-ledger evidence.',
    version: 1,
    scopes: [
      'invoices:read',
      'invoices:write',
      'payouts:read',
      'subscriptions:read',
      'subscriptions:write',
      'trust:read',
      'trust:write',
    ],
    buildPromptContribution: (context) => [
      'Billing and trust assistance is enabled.',
      `Billing increment: ${context.billingIncrementMinutes} minute(s).`,
      `Consultation fee: ${context.consultationFeeCents === null ? 'not configured' : `${context.consultationFeeCents} cents`}.`,
      'Keep trust balances, operating revenue, invoice receivables, and payouts distinct. Financial writes require the underlying approval and idempotency contract.',
    ],
  },
  client_intake: {
    key: 'client_intake',
    label: 'Client intake',
    description: 'Manage clients, intake templates, intake records, conflict checks, and supporting files.',
    version: 1,
    scopes: ['clients:read', 'clients:write', 'intakes:read', 'intakes:write', 'practice:read', 'practice:write'],
    buildPromptContribution: (context) => [
      'Client intake assistance is enabled.',
      `Practice: ${context.practiceName}.`,
      `Jurisdictions: ${formatList(context.jurisdictions)}.`,
      `Practice areas: ${formatList(context.practiceAreas)}.`,
      context.introMessage
        ? `Practice-provided client introduction: ${context.introMessage}`
        : 'No client introduction is configured.',
      'Collect operational facts without legal advice. Conflict, jurisdiction, fit, and urgency outputs remain staff review material.',
    ],
  },
};

const DEFAULT_PRACTICE_SKILLS: PracticeSkillKey[] = [...PRACTICE_SKILL_KEYS];

const isPracticeSkillKey = (value: string): value is PracticeSkillKey =>
  PRACTICE_SKILL_KEYS.some((key) => key === value);

const normalizePracticeSkills = (values: readonly string[] | null | undefined): PracticeSkillKey[] => {
  if (!values) {
    return [...DEFAULT_PRACTICE_SKILLS];
  }
  const normalized = [...new Set(values)];
  for (const value of normalized) {
    if (!isPracticeSkillKey(value)) {
      throw new Error(`Unknown practice AI skill "${value}".`);
    }
  }
  return PRACTICE_SKILL_KEYS.filter((key) => normalized.includes(key));
};

const getSkillScopes = (skills: readonly PracticeSkillKey[]): string[] => [
  ...new Set(skills.flatMap((key) => SKILL_REGISTRY[key].scopes)),
];

const buildSystemPrompt = (skills: readonly PracticeSkillKey[], context: PracticeSkillContext): string =>
  skills
    .flatMap((key) => {
      const skill = SKILL_REGISTRY[key];
      return [`## ${skill.label} (v${skill.version})`, ...skill.buildPromptContribution(context)];
    })
    .join('\n');

const getSkillCatalog = (): Omit<PracticeSkillDefinition, 'buildPromptContribution'>[] =>
  PRACTICE_SKILL_KEYS.map((key) => {
    const { buildPromptContribution: _buildPromptContribution, ...definition } = SKILL_REGISTRY[key];
    return definition;
  });

export {
  DEFAULT_PRACTICE_SKILLS,
  PRACTICE_SKILL_KEYS,
  SKILL_REGISTRY,
  buildSystemPrompt,
  getSkillCatalog,
  getSkillScopes,
  isPracticeSkillKey,
  normalizePracticeSkills,
};
export type { PracticeSkillContext, PracticeSkillDefinition, PracticeSkillKey };
