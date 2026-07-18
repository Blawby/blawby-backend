import { config } from '@/shared/config';
import { z } from '@hono/zod-openapi';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['shared', 'workers-ai-text-service']);

const AI_REQUEST_TIMEOUT_MS = 15_000;

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

const generateText = async ({
  messages,
  purpose,
  temperature,
  maxTokens,
}: {
  messages: readonly AiMessage[];
  purpose: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> => {
  const { accountId, aiApiToken: apiToken, aiGatewayId, aiModel } = config.cloudflare;
  if (!accountId || !apiToken) {
    throw new HTTPException(503, { message: `${purpose} is not configured` });
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
        body: JSON.stringify({ model: aiModel, temperature, max_tokens: maxTokens, messages }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new HTTPException(502, { message: `${purpose} failed with status ${String(response.status)}` });
    }

    const parsed = workersAiResponseSchema.safeParse(await response.json());
    const content = parsed.success ? parsed.data.choices[0]?.message.content.trim() : undefined;
    if (!content) {
      throw new HTTPException(502, { message: `${purpose} returned a malformed response` });
    }
    return content;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('{purpose} request failed: {error}', { purpose, error });
    throw new HTTPException(502, { message: `${purpose} request failed`, cause: error });
  } finally {
    clearTimeout(timer);
  }
};

const workersAiTextService = { generateText };

export { workersAiTextService };
export type { AiMessage };
