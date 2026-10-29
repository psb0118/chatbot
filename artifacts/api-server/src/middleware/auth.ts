import { clerkClient, getAuth } from '@clerk/express';
import type { RequestHandler } from 'express';

import { config } from '../config';

export const requireUser: RequestHandler = (request, response, next) => {
  const { userId } = getAuth(request);
  if (!userId) {
    response.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }

  response.locals.userId = userId;
  next();
};

export const requireAdmin: RequestHandler = async (request, response, next) => {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      response.status(401).json({ error: '로그인이 필요합니다.' });
      return;
    }

    if (config.adminEmails.length === 0) {
      response.status(503).json({
        error: '관리자 이메일(ADMIN_EMAILS)이 설정되지 않았습니다.',
      });
      return;
    }

    const user = await clerkClient.users.getUser(userId);
    const emails = user.emailAddresses.map((address) =>
      address.emailAddress.toLowerCase(),
    );

    if (!emails.some((email) => config.adminEmails.includes(email))) {
      response.status(403).json({ error: '관리자 권한이 없습니다.' });
      return;
    }

    response.locals.userId = userId;
    response.locals.adminEmail = emails[0] ?? userId;
    next();
  } catch (error) {
    next(error);
  }
};
