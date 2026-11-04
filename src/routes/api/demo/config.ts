import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { getConfig, saveConfigs } from '@/modules/config/service';
import { validateTrustedLocalJsonMutation } from '@/lib/trusted-local-request';
import { readRequestJsonWithLimit } from '@/lib/request-body-limit';
import { demoModels } from '@/core/demo/workflow-plan';

const defaultBaseUrl = 'https://dashscope.aliyuncs.com';
const settingsSchema = z.object({
  apiKey: z.string().trim().min(10).max(512).optional(),
  baseUrl: z.string().url().max(256),
}).strict();
async function GET() {
  return Response.json({ configured: Boolean(await getConfig('BAILIAN_API_KEY')), baseUrl: await getConfig('BAILIAN_API_BASE_URL') || defaultBaseUrl, models: demoModels });
}
async function POST({ request }: { request: Request }) {
  const trust = validateTrustedLocalJsonMutation(request);
  if (!trust.ok) return Response.json({ error: trust.message }, { status: trust.status });
  try {
    const settings = settingsSchema.parse(await readRequestJsonWithLimit(request, 4096));
    const url = new URL(settings.baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || !/^(dashscope\.aliyuncs\.com|[a-zA-Z0-9-]+\.cn-beijing\.maas\.aliyuncs\.com)$/.test(url.hostname)) {
      return Response.json({ error: 'Use the official Beijing DashScope or Beijing workspace HTTPS origin.' }, { status: 400 });
    }
    await saveConfigs({ BAILIAN_API_BASE_URL: url.origin, ...(settings.apiKey ? { BAILIAN_API_KEY: settings.apiKey } : {}) });
    return GET();
  } catch { return Response.json({ error: 'Invalid local configuration. Nothing was sent to a model.' }, { status: 400 }); }
}
export const Route = createFileRoute('/api/demo/config')({ server: { handlers: { GET, POST } } });
