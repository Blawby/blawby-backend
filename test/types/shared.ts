import type supertest from 'supertest';

export interface TestUser {
  id: string;
  email: string;
  name: string;
}

export interface TestOrganization {
  id: string;
  name: string;
  slug: string;
}

export type TypedResponse<TBody> = Omit<supertest.Response, 'body'> & { body: TBody };

export type SuccessResponse<T extends { data?: unknown }> = Omit<T, 'data'> & {
  data: NonNullable<T['data']>;
};
