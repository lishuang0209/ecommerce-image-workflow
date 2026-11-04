import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { validateTrustedWorkspaceJsonMutation } from '@/lib/trusted-local-request';
import { readRequestJsonWithLimit } from '@/lib/request-body-limit';
import { draftCanvasProductPrompt } from '@/core/demo/bailian-text';
import { promptTaskSchema } from '@/core/demo/text-prompt-contract';

const inputSchema = z.object({ projectId: z.string().uuid(), cardId: z.string().min(1).max(200), task: promptTaskSchema, brief: z.string().trim().min(1).max(12000) }).strict();
async function POST({ request }: { request: Request }) {
  const trust = validateTrustedWorkspaceJsonMutation(request);
  if (!trust.ok) return Response.json({ error: trust.message }, { status: trust.status });
  try { return Response.json(await draftCanvasProductPrompt(inputSchema.parse(await readRequestJsonWithLimit(request, 20000)))); }
  catch (error) { return Response.json({ error: error instanceof z.ZodError ? 'Invalid text generation fields or model response.' : error instanceof Error ? error.message : 'Text generation failed.' }, { status: 400 }); }
}
export const Route = createFileRoute('/api/demo/text-prompt')({ server: { handlers: { POST } } });
