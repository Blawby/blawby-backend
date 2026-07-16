import { describe, expect, it } from 'vitest';
import { deleteClientRoute, listClientsRoute } from '@/modules/clients/routes/clients.routes';
import { deleteMatterRoute, listMattersRoute } from '@/modules/matters/routes/core.routes';

describe('standard API response contracts', () => {
  it.each([
    ['clients', deleteClientRoute],
    ['matters', deleteMatterRoute],
  ])('%s DELETE declares 204 with no 200 response', (_name, route) => {
    expect(route.responses).toHaveProperty('204');
    expect(route.responses).not.toHaveProperty('200');
  });

  it.each([
    ['clients', listClientsRoute],
    ['matters', listMattersRoute],
  ])('%s list declares data and pagination', (_name, route) => {
    const { 200: response } = route.responses;
    const schema = 'content' in response ? response.content?.['application/json']?.schema : undefined;
    expect(schema).toHaveProperty('shape.data');
    expect(schema).toHaveProperty('shape.pagination');
    expect(schema).not.toHaveProperty('shape.total');
  });
});
