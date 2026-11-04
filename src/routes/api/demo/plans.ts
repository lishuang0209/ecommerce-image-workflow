import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { generateDemoImage } from '@/core/demo/generate';
import { demoInputSchema } from '@/core/demo/workflow-plan';
import { createDemoPlan, importDemoInputs, listDemoInputs, listDemoPlans } from '@/core/demo/service';
import { validateTrustedWorkspaceJsonMutation } from '@/lib/trusted-local-request';
import { readRequestJsonWithLimit } from '@/lib/request-body-limit';

async function GET() {
  const [plans, ecommerce, drama] = await Promise.all([listDemoPlans(), listDemoInputs('ecommerce'), listDemoInputs('drama')]);
  return Response.json({ plans, inputs: { ecommerce, drama } });
}
async function POST({ request }: { request: Request }) {
  const trust = validateTrustedWorkspaceJsonMutation(request);
  if (!trust.ok) return Response.json({ error: trust.message }, { status: trust.status });
  try {
    const body = await readRequestJsonWithLimit<{ action: string; input?: unknown; id?: unknown; revision?: unknown }>(request, 32000);
    if (body.action === 'generate') {
      const args = z.object({ id: z.string().uuid(), stepId: z.string().min(1).max(100), referenceId: z.string().uuid(), requestId: z.string().uuid(), prompt: z.string().trim().min(1).max(12000) }).parse(body);
      return Response.json({ plan: await generateDemoImage(args) });
    }
    if (body.action === 'create') return Response.json({ plan: await createDemoPlan(demoInputSchema.parse(body.input)) });
    if (body.action === 'import') {
      const args = z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).parse(body);
      return Response.json({ plan: await importDemoInputs(args.id, args.revision) });
    }
    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? 'Check the required fields and limits.' : error instanceof Error ? error.message : 'Unable to save the workflow.' }, { status: 400 });
  }
}
export const Route = createFileRoute('/api/demo/plans')({ server: { handlers: { GET, POST } } });
