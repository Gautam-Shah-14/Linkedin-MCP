import { z } from 'zod';

export const createDraftInputSchema = z.object({
  authorId: z.string().uuid(),
  text: z.string().min(1).max(3000),
});

export const updateDraftInputSchema = z.object({
  draftId: z.string().uuid(),
  text: z.string().min(1).max(3000).optional(),
});

export const listPostsInputSchema = z.object({
  authorId: z.string().uuid().optional(),
  status: z.string().optional(),
});

export const attachImageInputSchema = z.object({
  draftId: z.string().uuid(),
  imageUrl: z.string().url(),
});

export const publishPostInputSchema = z.object({
  draftId: z.string().uuid(),
  confirmText: z.string().min(1).max(30),
});

export const schedulePostInputSchema = z.object({
  draftId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
});
