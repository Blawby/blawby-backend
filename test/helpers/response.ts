import type { TypedResponse } from '@/test/types/shared';
import type supertest from 'supertest';

export const toTypedResponse = async <TBody>(
  responsePromise: PromiseLike<supertest.Response> | supertest.Test
): Promise<TypedResponse<TBody>> => (await responsePromise) as TypedResponse<TBody>;
