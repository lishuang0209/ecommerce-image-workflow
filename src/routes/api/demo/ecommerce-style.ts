import { EcommercePaidJobError } from '@/core/demo/ecommerce-paid-job';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { deleteStyledImage, listStyledImages, restyleEcommerceImages, stylePresetIds, type StylePreset } from '@/core/demo/ecommerce-style';
import { validateTrustedWorkspaceJsonMutation } from '@/lib/trusted-local-request';
import { readRequestJsonWithLimit } from '@/lib/request-body-limit';

async function GET({ request }: { request: Request }) {
  try {
    const projectId = z.string().uuid().parse(new URL(request.url).searchParams.get('projectId'));
    return Response.json({ styled: await listStyledImages(projectId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load restyled images.' }, { status: 400 });
  }
}
async function POST({ request }: { request: Request }) {
  const trust = validateTrustedWorkspaceJsonMutation(request);
  if (!trust.ok) return Response.json({ error: trust.message }, { status: trust.status });
  try {
    const input = z.object({
      projectId: z.string().uuid(),
      assetIds: z.array(z.string().uuid()).min(1).max(8),
      preset: z.enum(stylePresetIds as [StylePreset, ...StylePreset[]]),
    }).strict().parse(await readRequestJsonWithLimit(request, 8192));
    return Response.json({ styled: await restyleEcommerceImages(input) });
  } catch (error) {
    if (error instanceof EcommercePaidJobError) return Response.json({ error: error.message, code: error.code, jobId: error.jobId }, { status: 409 });
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to restyle images.' }, { status: 400 });
  }
}
async function DELETE({ request }: { request: Request }) {
  const trust = validateTrustedWorkspaceJsonMutation(request);
  if (!trust.ok) return Response.json({ error: trust.message }, { status: trust.status });
  try {
    const input = z.object({ projectId: z.string().uuid(), assetId: z.string().uuid() }).strict().parse(await readRequestJsonWithLimit(request, 1024));
    await deleteStyledImage(input);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to delete restyled image.' }, { status: 400 });
  }
}
export const Route = createFileRoute('/api/demo/ecommerce-style')({ server: { handlers: { GET, POST, DELETE } } });
