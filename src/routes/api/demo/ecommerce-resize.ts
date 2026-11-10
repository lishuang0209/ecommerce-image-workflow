import { EcommercePaidJobError } from '@/core/demo/ecommerce-paid-job';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { expandEcommerceImages } from '@/core/demo/ecommerce-expand';
import { deleteDerivedSize, deriveResizedAssets, listDerivedSizes } from '@/core/demo/ecommerce-resize';
import { resizeRatios } from '@/core/demo/image-resize';
import { validateTrustedWorkspaceJsonMutation } from '@/lib/trusted-local-request';
import { readRequestJsonWithLimit } from '@/lib/request-body-limit';

async function GET({ request }: { request: Request }) {
  try {
    const projectId = z.string().uuid().parse(new URL(request.url).searchParams.get('projectId'));
    return Response.json({ derived: await listDerivedSizes(projectId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load resized images.' }, { status: 400 });
  }
}
async function POST({ request }: { request: Request }) {
  const trust = validateTrustedWorkspaceJsonMutation(request);
  if (!trust.ok) return Response.json({ error: trust.message }, { status: trust.status });
  try {
    const input = z.object({
      projectId: z.string().uuid(),
      assetIds: z.array(z.string().uuid()).min(1).max(40),
      ratios: z.array(z.enum(resizeRatios as [string, ...string[]])).min(1).max(resizeRatios.length),
      mode: z.enum(['auto', 'crop', 'pad', 'expand']),
    }).strict().parse(await readRequestJsonWithLimit(request, 8192));
    if (input.mode === 'expand') return Response.json(await expandEcommerceImages({ projectId: input.projectId, assetIds: input.assetIds, ratios: input.ratios as never }));
    return Response.json({ derived: await deriveResizedAssets({ ...input, ratios: input.ratios as never, mode: input.mode }) });
  } catch (error) {
    if (error instanceof EcommercePaidJobError) return Response.json({ error: error.message, code: error.code, jobId: error.jobId }, { status: 409 });
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to resize images.' }, { status: 400 });
  }
}
async function DELETE({ request }: { request: Request }) {
  const trust = validateTrustedWorkspaceJsonMutation(request);
  if (!trust.ok) return Response.json({ error: trust.message }, { status: trust.status });
  try {
    const input = z.object({ projectId: z.string().uuid(), assetId: z.string().uuid() }).strict().parse(await readRequestJsonWithLimit(request, 1024));
    await deleteDerivedSize(input);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to delete resized image.' }, { status: 400 });
  }
}
export const Route = createFileRoute('/api/demo/ecommerce-resize')({ server: { handlers: { GET, POST, DELETE } } });
