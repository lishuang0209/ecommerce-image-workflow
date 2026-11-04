import test from 'node:test';
import assert from 'node:assert/strict';
import { promptDraftSchema, renderProductPrompt, productPromptMessages } from './text-prompt-contract';

test('main image never inherits the lifestyle scene field', () => {
 const draft = promptDraftSchema.parse({ product: '黑色保温杯，保留 Logo', composition: '单品居中完整展示', scene: '森林、木桌、户外自然光' });
 const main = renderProductPrompt(draft, 'main', '1:1');
 assert.ok(main.includes('纯白色背景和柔和影棚光'));
 assert.ok(!main.includes('环境与光线：森林'));
 const scene = renderProductPrompt(draft, 'scene', '4:5');
 assert.ok(scene.includes('环境与光线：森林、木桌、户外自然光'));
 assert.ok(scene.includes('4:5'));
 assert.throws(() => renderProductPrompt({ ...draft, composition: '站在户外木桌上' }, 'main', '1:1'));
 assert.throws(() => promptDraftSchema.parse({ product: '', composition: 'center', scene: '' }));
});
test('text requests distinguish untrusted product information and role instructions', () => {
 const messages = productPromptMessages({ task: 'main', name: 'SKU', brief: '主图和场景图都要，偏户外', ratio: '1:1' });
 assert.equal(messages[0].role, 'system');
 assert.ok(messages[0].content.includes('不声称已看过图片'));
 const input = JSON.parse(messages[1].content);
 assert.equal(input.task, '白底主图');
 assert.equal(input.productInformationAndRequirements, '主图和场景图都要，偏户外');
});
