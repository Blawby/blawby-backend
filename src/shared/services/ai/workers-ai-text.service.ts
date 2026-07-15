import { config } from '@/shared/config';
import { z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';

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
};

const workersAiTextService = { generateText };

export { workersAiTextService };
export type { AiMessage };
