import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { createCreativeCanvas } from '@/core/demo/create-canvas';
import { validateTrustedWorkspaceJsonMutation } from '@/lib/trusted-local-request';
import { readRequestJsonWithLimit } from '@/lib/request-body-limit';
async function POST({ request }: { request: Request }) {
 const trust = validateTrustedWorkspaceJsonMutation(request);
 if (!trust.ok) return Response.json({ error: trust.message }, { status: trust.status });
 try { const input = z.object({ name: z.string().trim().min(1).max(100), template: z.enum(['ecommerce','video','blank']), locale: z.enum(['zh','en','ja']) }).strict().parse(await readRequestJsonWithLimit(request, 4096)); const project = await createCreativeCanvas(input); return Response.json({ id: project.id }); }
 catch { return Response.json({ error: 'Unable to create canvas. Check the project name.' }, { status: 400 }); }
}
export const Route = createFileRoute('/api/demo/create-canvas')({ server: { handlers: { POST } } });
