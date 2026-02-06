import { createMarkdownFromOpenApi as scalarCreateMarkdownFromOpenApi } from '@scalar/openapi-to-markdown';

/**
 * Converts an OpenAPI document to a Markdown string.
 * This is useful for providing LLM-friendly documentation.
 *
 * @param openApiDocument - The OpenAPI document (JSON object)
 * @returns A promise that resolves to the Markdown string
 */
export const createMarkdownFromOpenApi = async (openApiDocument: unknown): Promise<string> => {
  try {
    return await scalarCreateMarkdownFromOpenApi(openApiDocument);
  } catch (error) {
    console.error('Error generating Markdown from OpenAPI:', error);
    return '# API Documentation\n\nError generating documentation.';
  }
};
