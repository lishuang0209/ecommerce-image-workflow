import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { deriveResizedAssets, listDerivedSizes } from '@/core/demo/ecommerce-resize';
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
      mode: z.enum(['auto', 'crop', 'pad']),
    }).strict().parse(await readRequestJsonWithLimit(request, 8192));
    return Response.json({ derived: await deriveResizedAssets({ ...input, ratios: input.ratios as never }) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to resize images.' }, { status: 400 });
  }
}
export const Route = createFileRoute('/api/demo/ecommerce-resize')({ server: { handlers: { GET, POST } } });
