import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * @CurrentUser() — extracts the authenticated Supabase user from the request.
 * Usage: `@CurrentUser() user: SupabaseUser`
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    return request.user;
  },
);
