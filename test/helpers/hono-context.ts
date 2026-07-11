import type { Context } from 'hono';

const makeHonoContext = <TState extends Record<string, unknown>>(state: TState) => {
  const values: Record<string, unknown> = { ...state };
  const c = {
    get: (key: string) => values[key],
    set: (key: string, value: unknown) => {
      values[key] = value;
    },
  } as Context;

  return { c, values };
};

export { makeHonoContext };
