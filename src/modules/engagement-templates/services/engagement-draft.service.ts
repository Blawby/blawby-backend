import { ForbiddenError } from '@casl/ability';
import { z } from '@hono/zod-openapi';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { engagementTemplatesQueries } from '@/modules/engagement-templates/database/queries/engagement-templates.queries';
import type { EngagementTemplateRecord } from '@/modules/engagement-templates/types/engagement-template.types';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { config } from '@/shared/config';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['engagement-templates', 'draft-service']);

const AI_REQUEST_TIMEOUT_MS = 15_000;

type GenerateText = (messages: readonly AiMessage[]) => Promise<string>;

interface AiMessage {
  role: 'system' | 'user';
  content: string;
}

const workersAiResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().min(1),
      }),
    })
  ),
});

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
}): { body: string; requiredTerms: string[] } => {
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
  const retainer = formatCentsAsDollars(retainerCents);
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
    ['{{retainer}}', retainer],
    ['{{contingencyPct}}', feeType === 'contingency' ? fee : ''],
  ]);

  let body = templateBody;
  for (const [placeholder, value] of replacements) {
    body = body.replaceAll(placeholder, value);
  }

  // Authoritative terms the AI must preserve verbatim; a dropped term means an incomplete draft.
  const requiredTerms = [metadata.name, scopeTemplate, fee, retainer].filter((term) => term.trim().length > 0);

  return { body, requiredTerms };
};

const requestWorkersAi: GenerateText = async (messages) => {
  const { accountId, aiApiToken: apiToken, aiGatewayId, aiModel } = config.cloudflare;
  if (!accountId || !apiToken) {
    throw new HTTPException(503, { message: 'Engagement AI generation is not configured' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'cf-aig-gateway-id': aiGatewayId,
        },
        body: JSON.stringify({
          model: aiModel,
          temperature: 0.3,
          max_tokens: 1_200,
          messages,
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new HTTPException(502, {
        message: `Engagement AI generation failed with status ${String(response.status)}`,
      });
    }

    const parsed = workersAiResponseSchema.safeParse(await response.json());
    const content = parsed.success ? parsed.data.choices[0]?.message.content.trim() : undefined;
    if (!content) {
      throw new HTTPException(502, { message: 'Engagement AI returned a malformed response' });
    }
    return content;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Engagement AI request failed: {error}', { error });
    throw new HTTPException(502, { message: 'Engagement AI request failed' });
  } finally {
    clearTimeout(timer);
  }
};

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

  const { body: partialBody, requiredTerms } = resolveStaticPlaceholders({
    template,
    intake,
    practiceName: organization.name,
    now,
  });
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

  const isMissingRequiredTerm = requiredTerms.some((term) => !contractBody.includes(term));
  if (!contractBody || /{{[^}]+}}/.test(contractBody) || isMissingRequiredTerm) {
    throw new HTTPException(502, { message: 'Engagement AI returned an incomplete draft' });
  }

  return { contract_body: contractBody, intake_id: intakeId, template_id: templateId };
};

export const engagementDraftService = {
  generateEngagementDraft,
};
