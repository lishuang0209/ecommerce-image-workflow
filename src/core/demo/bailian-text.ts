import { assertSkuTextContext, ecommerceTag, preservationPrompt } from './ecommerce-contract';
import { getProjectAssetById } from '@/core/workspace-lib/assets/user-assets';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getBeatDesignDataRoot } from '@/config/data-root';
import { getConfig } from '@/modules/config/service';
import { loadProjectWithLatestSnapshot } from '@/core/projects/projects';
import { bailianOrigin } from './bailian-image';
import { promptDraftSchema, productPromptMessages, renderProductPrompt, type PromptTask } from './text-prompt-contract';

let busy = false;
export async function draftCanvasProductPrompt(input: { projectId: string; cardId: string; task: PromptTask; brief: string }) {
  if (busy) throw new Error('Text generation is busy. Please wait.');
  busy = true;
  try {
    const state = await loadProjectWithLatestSnapshot({ projectId: input.projectId });
    const card = state?.snapshot.cards.find(item => item.id === input.cardId);
    if (!card || card.kind !== 'text') throw new Error('Text node does not belong to this project.');
    const skuPrompt = /^(sku-[a-f0-9]{16})-(main|scene(?:-office|-outdoor)?)-prompt$/.exec(card.id);
    if (skuPrompt) assertSkuTextContext(skuPrompt[1], card.referenceCardIds);
    const consumers = state!.snapshot.cards.filter(item => item.kind === 'generation' && item.type === 'image' && item.referenceCardIds.includes(card.id));
    const ratios = [...new Set(consumers.map(item => item.aspectRatio))];
    if (ratios.length > 1) throw new Error('This text node is shared by different aspect ratios. Use one text node per task.');
    const ratio = ratios[0] || '1:1';
    const key = await getConfig('BAILIAN_API_KEY');
    if (!key) throw new Error('Save your Bailian API key first.');
    const origin = bailianOrigin(await getConfig('BAILIAN_API_BASE_URL') || 'https://dashscope.aliyuncs.com');
    const upstream = card.referenceCardIds.map(id => state!.snapshot.cards.find(item => item.id === id)).filter(item => item?.kind === 'text').map(item => `${item!.name}: ${item!.textContent}`).join('\n');
    const assetIds=[...new Set(consumers.flatMap(item=>item.referenceCardIds).map(id=>state!.snapshot.cards.find(item=>item.id===id)?.assetId).filter((id):id is string=>!!id))];
    const tags=await Promise.all(assetIds.map(async assetId=>ecommerceTag((await getProjectAssetById({projectId:input.projectId,assetId}))?.metadata)));
    const ownSku=state!.snapshot.cards.find(item=>item.id===skuPrompt?.[1]+'-facts')?.name.replace(/ · 商品信息$/,'');
    const constraints=preservationPrompt(tags.filter(tag=>!ownSku||tag?.sku===ownSku));
    const scene=skuPrompt?.[2]==='scene-office'?'固定场景：办公桌面':skuPrompt?.[2]==='scene-outdoor'?'固定场景：户外森林':'';
    const task=skuPrompt?(skuPrompt[2]==='main'?'main':'scene'):input.task;
    const brief = [upstream, input.brief,constraints,scene].filter(Boolean).join('\n');
    if (brief.length > 16000) throw new Error('Connected product information is too long.');
    const messages = productPromptMessages({ task, brief, name: card.name, ratio });
    const response = await fetch(`${origin}/compatible-mode/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'qwen3.7-flash', messages, enable_thinking: false, response_format: { type: 'json_object' }, max_completion_tokens: 1400, temperature: 0.3 }),
      signal: AbortSignal.timeout(90000),
    });
    const json = await response.json();
    if (!response.ok || json.error) throw new Error(`Bailian text request failed (${response.status}). Check model permissions and region.`);
    const choice = json.choices?.[0];
    if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') throw new Error('Text generation did not finish. Original node was preserved.');
    const draft = promptDraftSchema.parse(JSON.parse(choice.message.content));
    const prompt = renderProductPrompt(draft, task, ratio);
    const id = randomUUID();
    const directory = resolve(getBeatDesignDataRoot(), 'bailian-text-runs');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(resolve(directory, `${id}.json`), JSON.stringify({ id, createdAt: new Date().toISOString(), projectId: input.projectId, cardId: card.id, model: 'qwen3.7-flash', task: input.task, ratio, brief, previousText: card.textContent, prompt, usage: json.usage, providerRequestId: json.id }), { flag: 'wx', mode: 0o600 });
    return { prompt, model: 'qwen3.7-flash', runId: id, task: input.task, ratio };
  } finally { busy = false; }
}
