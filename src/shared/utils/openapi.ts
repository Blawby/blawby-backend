import { getLogger } from '@logtape/logtape';
import { createMarkdownFromOpenApi as scalarCreateMarkdownFromOpenApi } from '@scalar/openapi-to-markdown';

const logger = getLogger(['app', 'shared', 'openapi']);

/**
 * Converts an OpenAPI document to a Markdown string.
 * This is useful for providing LLM-friendly documentation.
 *
 * @param openApiDocument - The OpenAPI document (JSON object)
 * @returns A promise that resolves to the Markdown string
 */
export const createMarkdownFromOpenApi = async (openApiDocument: unknown): Promise<string> => {
  try {
    return await scalarCreateMarkdownFromOpenApi(openApiDocument as Parameters<typeof scalarCreateMarkdownFromOpenApi>[0]);
  } catch (error) {
    logger.error('Error generating Markdown from OpenAPI: {error}', { error });
    return '# API Documentation\n\nError generating documentation.';
  }
};
