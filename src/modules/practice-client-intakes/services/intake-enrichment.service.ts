import { intakeConversationMessagesQueries } from '@/modules/intake-conversations/database/queries/intake-conversation-messages.queries';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { config } from '@/shared/config';
import { uow } from '@/shared/database/uow';
import { queueManager } from '@/shared/queue/queue.manager';
import { workersAiTextService, type AiMessage } from '@/shared/services/ai/workers-ai-text.service';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';
import { z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';

type GenerateText = (messages: readonly AiMessage[]) => Promise<string>;

const intakeEnrichmentJobSchema = z.object({
  intakeId: z.uuid(),
  organizationId: z.uuid(),
  version: z.number().int().positive(),
});

const enrichmentResultSchema = z
  .object({
    summary: z.string().trim().min(1).max(2_000),
    urgency: z.enum(['routine', 'time_sensitive', 'emergency']),
    desired_outcome: z.string().trim().min(1).max(500).nullable(),
  })
  .strict();

type IntakeEnrichmentJob = z.infer<typeof intakeEnrichmentJobSchema>;

const requestWorkersAi: GenerateText = (messages) =>
  workersAiTextService.generateText({
    messages,
    purpose: 'Intake enrichment',
    temperature: 0.1,
    maxTokens: 900,
  });

const requestEnrichment = async (
  { intakeId }: { intakeId: string },
  ctx: ServiceContext
): Promise<{ intake_id: string; enrichment_status: 'pending'; enrichment_version: number }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'PracticeClientIntake');

  const intake = await practiceClientIntakesRepository.findById(intakeId);
  if (!intake) {
    throw new HTTPException(404, { message: 'Practice client intake not found' });
  }
  if (intake.organization_id !== ctx.organizationId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }
  if (intake.status !== 'succeeded' && intake.status !== 'converted') {
    throw new HTTPException(409, { message: 'Only completed intakes can be enriched' });
  }

  // Enqueue only after the version bump durably commits, so a crash between the two never leaves an intake stuck pending with no job behind it.
  const requested = await uow.transaction(async () => {
    const updated = await practiceClientIntakesRepository.requestEnrichment(intakeId, ctx.organizationId);
    if (!updated) {
      throw new HTTPException(404, { message: 'Practice client intake not found' });
    }

    await uow.afterCommit(() =>
      queueManager.addIntakeEnrichmentJob({
        intakeId,
        organizationId: ctx.organizationId,
        version: updated.enrichment_version,
      })
    );

    return updated;
  });

  return {
    intake_id: intakeId,
    enrichment_status: 'pending',
    enrichment_version: requested.enrichment_version,
  };
};

const buildPrompt = async (intake: SelectPracticeClientIntake): Promise<readonly AiMessage[]> => {
  const messages = intake.conversation_id
    ? await intakeConversationMessagesQueries.listByConversation(intake.conversation_id, undefined, 100)
    : [];
  const conversation = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n');
  const context = [
    `Practice service: ${intake.metadata?.practice_service_name ?? 'not provided'}`,
    `Client description: ${intake.metadata?.description ?? 'not provided'}`,
    `Client-stated desired outcome: ${intake.desired_outcome ?? 'not provided'}`,
    `Client-stated urgency: ${intake.urgency ?? 'not provided'}`,
    `Court date: ${intake.court_date?.toISOString() ?? 'not provided'}`,
    `Jurisdiction: ${intake.jurisdiction_match?.state ?? intake.jurisdiction_match?.country ?? 'not provided'}`,
    `Conversation:\n${conversation || 'not provided'}`,
  ].join('\n');

  return [
    {
      role: 'system',
      content: [
        'Summarize this completed legal intake for internal staff triage.',
        'Use only supplied facts. Do not give legal advice or predict the merits of the case.',
        'Classify urgency as routine, time_sensitive, or emergency. This is a staff triage label, not emergency guidance.',
        'Return strict JSON only with keys summary, urgency, and desired_outcome. desired_outcome may be null.',
      ].join('\n'),
    },
    { role: 'user', content: context },
  ];
};

const failureCode = (error: unknown): string => {
  if (error instanceof HTTPException && error.status === 503) {
    return 'provider_not_configured';
  }
  if (error instanceof HTTPException && error.message.includes('malformed structured output')) {
    return 'malformed_response';
  }
  if (error instanceof HTTPException && error.status === 502) {
    return 'provider_failure';
  }
  return 'enrichment_failed';
};

const runEnrichmentJob = async (
  input: IntakeEnrichmentJob,
  generateText: GenerateText = requestWorkersAi
): Promise<'processed' | 'skipped'> => {
  const job = intakeEnrichmentJobSchema.parse(input);
  const intake = await practiceClientIntakesRepository.claimEnrichment(job.intakeId, job.organizationId, job.version);

  if (!intake) {
    const current = await practiceClientIntakesRepository.findById(job.intakeId);
    if (!current || current.organization_id !== job.organizationId || current.enrichment_version !== job.version) {
      return 'skipped';
    }
    if (current.enrichment_status === 'succeeded') {
      return 'skipped';
    }
    throw new Error('Intake enrichment job could not claim its current version');
  }

  // The claim always carries a fresh ownership token on the row it hands back.
  const claimToken = intake.enrichment_claim_token as string;

  try {
    const content = await generateText(await buildPrompt(intake));
    let rawResult: unknown = undefined;
    try {
      rawResult = JSON.parse(content);
    } catch {
      throw new HTTPException(502, { message: 'Intake enrichment returned malformed structured output' });
    }
    const parsed = enrichmentResultSchema.safeParse(rawResult);
    if (!parsed.success) {
      throw new HTTPException(502, { message: 'Intake enrichment returned malformed structured output' });
    }
    const clientUrgency = enrichmentResultSchema.shape.urgency.safeParse(intake.urgency);

    const completed = await practiceClientIntakesRepository.completeEnrichment(
      job.intakeId,
      job.organizationId,
      job.version,
      claimToken,
      {
        transcriptSummary: parsed.data.summary,
        urgency: clientUrgency.success ? clientUrgency.data : parsed.data.urgency,
        desiredOutcome: intake.desired_outcome ?? parsed.data.desired_outcome,
        model: config.cloudflare.aiModel,
      }
    );
    return completed ? 'processed' : 'skipped';
  } catch (error) {
    const failed = await practiceClientIntakesRepository.failEnrichment(
      job.intakeId,
      job.organizationId,
      job.version,
      claimToken,
      failureCode(error)
    );
    if (!failed) {
      return 'skipped';
    }
    throw error;
  }
};

const intakeEnrichmentService = {
  requestEnrichment,
  runEnrichmentJob,
};

export { intakeEnrichmentJobSchema, intakeEnrichmentService };
export type { IntakeEnrichmentJob };
