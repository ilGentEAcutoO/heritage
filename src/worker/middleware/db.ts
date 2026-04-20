import type { MiddlewareHandler } from 'hono';
import { createDb } from '../../db/client';
import type { HonoEnv } from '../types';

export const dbMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  c.set('db', createDb(c.env.DB));
  await next();
};
