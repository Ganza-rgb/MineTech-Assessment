import { z } from 'zod';

export const TriageRequestSchema = z.object({
  text: z.string().min(1, 'text is required').max(100_000, 'text exceeds maximum length'),
  source: z.string().optional(),
});

export const RagAskSchema = z.object({
  question: z.string().min(1, 'question is required'),
});

export const RagIngestTextSchema = z.object({
  title: z.string().min(1, 'title is required'),
  content: z.string().min(1, 'content is required'),
});

export const TicketUpdateSchema = z.object({
  status: z.enum(['new', 'in-progress', 'resolved'], {
    errorMap: () => ({ message: 'status must be new, in-progress, or resolved' }),
  }),
});

export const RagRetrieveSchema = z.object({
  question: z.string().min(1, 'question is required'),
});
