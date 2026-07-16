import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { engagementTemplatesQueries } from '@/modules/engagement-templates/database/queries/engagement-templates.queries';
import type { EngagementTemplateRecord } from '@/modules/engagement-templates/types/engagement-template.types';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { workersAiTextService, type AiMessage } from '@/shared/services/ai/workers-ai-text.service';
import type { ServiceContext } from '@/shared/types/service-context';

type GenerateText = (messages: readonly AiMessage[]) => Promise<string>;

const formatCentsAsDollars = (cents: number | null): string =>
  cents === null || cents <= 0
    ? ''
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const feeText = (template: EngagementTemplateRecord): string => {
  switch (template.fee_type) {
    case 'hourly':
      return formatCentsAsDollars(template.hourly_rate_cents);
    case 'flat':
      return formatCentsAsDollars(template.flat_fee_cents);
    case 'contingency':
      return template.contingency_pct === null ? '' : `${template.contingency_pct}%`;
    case 'pro_bono':
      return 'pro bono';
    default:
      throw new HTTPException(422, { message: 'Engagement template has an unsupported fee type' });
  }
};

const resolveStaticPlaceholders = ({
  template,
  intake,
  practiceName,
  now,
}: {
  template: EngagementTemplateRecord;
  intake: SelectPracticeClientIntake;
  practiceName: string;
  now: Date;
}): string => {
  const {
    court_date: courtDate,
    jurisdiction_match: jurisdictionMatch,
    metadata,
    transcript_summary: transcriptSummary,
  } = intake;
  const {
    body: templateBody,
    fee_type: feeType,
    practice_area: templatePracticeArea,
    retainer_cents: retainerCents,
    scope_template: scopeTemplate,
  } = template;
  if (!metadata?.name || !metadata.email) {
    throw new HTTPException(422, { message: 'Intake is missing required client identity fields' });
  }

  const fee = feeText(template);
  const practiceArea =
    templatePracticeArea.trim().length > 0 ? templatePracticeArea : (metadata.practice_service_name ?? '');
  const replacements = new Map<string, string>([
    ['{{clientName}}', metadata.name],
    ['{{clientEmail}}', metadata.email],
    ['{{date}}', new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(now)],
    ['{{practiceName}}', practiceName],
    ['{{practiceArea}}', practiceArea],
    ['{{opposingParty}}', metadata.opposing_party ?? ''],
    ['{{courtDate}}', courtDate?.toISOString().slice(0, 10) ?? ''],
    ['{{jurisdiction}}', jurisdictionMatch?.state ?? jurisdictionMatch?.country ?? ''],
    ['{{matterDescription}}', transcriptSummary ?? metadata.description ?? ''],
    ['{{scope}}', scopeTemplate],
    ['{{hourlyRate}}', feeType === 'hourly' ? fee : ''],
    ['{{flatFee}}', feeType === 'flat' ? fee : ''],
    ['{{retainer}}', formatCentsAsDollars(retainerCents)],
    ['{{contingencyPct}}', feeType === 'contingency' ? fee : ''],
  ]);

  let body = templateBody;
  for (const [placeholder, value] of replacements) {
    body = body.replaceAll(placeholder, value);
  }
  return body;
};

const requestWorkersAi: GenerateText = (messages) =>
  workersAiTextService.generateText({
    messages,
    purpose: 'Engagement AI generation',
    temperature: 0.3,
    maxTokens: 1_200,
  });

const generateEngagementDraft = async (
  {
    intakeId,
    templateId,
    now = new Date(),
    generateText = requestWorkersAi,
  }: {
    intakeId: string;
    templateId: string;
    now?: Date;
    generateText?: GenerateText;
  },
  ctx: ServiceContext
): Promise<{ contract_body: string; intake_id: string; template_id: string }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Organization');

  const [template, intake, organization] = await Promise.all([
    engagementTemplatesQueries.findByIdAndPractice(templateId, ctx.organizationId),
    practiceClientIntakesRepository.findById(intakeId),
    organizationRepository.findById(ctx.organizationId),
  ]);

  if (!template) {
    throw new HTTPException(404, { message: 'Engagement template not found' });
  }
  if (!intake) {
    throw new HTTPException(404, { message: 'Practice client intake not found' });
  }
  if (intake.organization_id !== ctx.organizationId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }
  if (!organization) {
    throw new HTTPException(404, { message: 'Practice not found' });
  }

  const partialBody = resolveStaticPlaceholders({ template, intake, practiceName: organization.name, now });
  const practiceArea =
    template.practice_area.trim().length > 0 ? template.practice_area : (intake.metadata?.practice_service_name ?? '');
  const context = [
    `Client: ${intake.metadata?.name ?? ''}`,
    `Practice area: ${practiceArea}`,
    `Urgency: ${intake.urgency ?? 'not provided'}`,
    `Desired outcome: ${intake.desired_outcome ?? 'not provided'}`,
    `Matter description: ${intake.transcript_summary ?? intake.metadata?.description ?? 'not provided'}`,
    `Fee arrangement: ${template.fee_type}`,
  ].join('\n');

  const contractBody = (
    await generateText([
      {
        role: 'system',
        content: [
          'Draft a professional engagement letter from the supplied authoritative practice, intake, and template data.',
          'Resolve or remove every remaining {{placeholder}} token.',
          'Do not add legal advice, change fee amounts, or broaden the supplied scope.',
          'Return only the final letter body with no markdown fence or commentary.',
        ].join('\n'),
      },
      { role: 'user', content: `MATTER CONTEXT:\n${context}\n\nTEMPLATE:\n${partialBody}` },
    ])
  ).trim();

  if (!contractBody || /{{[^}]+}}/.test(contractBody)) {
    throw new HTTPException(502, { message: 'Engagement AI returned an incomplete draft' });
  }

  return { contract_body: contractBody, intake_id: intakeId, template_id: templateId };
};

export const engagementDraftService = {
  generateEngagementDraft,
};
