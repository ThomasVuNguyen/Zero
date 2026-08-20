import { privateProcedure, router } from '../trpc';
import { SignJWT } from 'jose';

export const userRouter = router({
  delete: privateProcedure.mutation(async ({ ctx }) => {
    const { success, message } = await ctx.c.var.auth.api.deleteUser({
      body: {
        callbackURL: '/',
      },
      headers: ctx.c.req.raw.headers,
      request: ctx.c.req.raw,
    });
    return { success, message };
  }),
  getIntercomToken: privateProcedure.query(async ({ ctx }) => {
    const secret = new TextEncoder().encode(ctx.c.env.JWT_SECRET);
    const token = await new SignJWT({
      user_id: ctx.sessionUser.id,
      email: ctx.sessionUser.email,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);
    return token;
  }),
});

