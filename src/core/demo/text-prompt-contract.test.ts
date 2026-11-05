import test from 'node:test';
import assert from 'node:assert/strict';
import { promptDraftSchema, renderProductPrompt, productPromptMessages } from './text-prompt-contract';

test('main image never inherits the lifestyle scene field', () => {
 const draft = promptDraftSchema.parse({ product: '黑色保温杯，保留 Logo', composition: '单品居中完整展示', scene: '森林、木桌、户外自然光' });
 const main = renderProductPrompt(draft, 'main', '1:1');
 assert.ok(main.includes('纯白色背景和柔和影棚光'));
 assert.ok(!main.includes('森林'));
 const scene = renderProductPrompt(draft, 'scene', '4:5');
 assert.ok(scene.includes('背景必须重绘为：森林、木桌、户外自然光'));
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

test('a composition template replaces the drafted composition on main images only', () => {
 const draft = promptDraftSchema.parse({ product: '白色运动鞋', composition: '单只鞋，侧面展示', scene: '' });
 const main = renderProductPrompt(draft, 'main', '1:1', { template: true });
 assert.match(main, /构图：严格按「构图模板」执行/);
 assert.doesNotMatch(main, /单只鞋，侧面展示/);
 assert.match(renderProductPrompt(draft, 'scene', '4:5', { template: true }), /构图：单只鞋，侧面展示/);
});

test('scene prompts force a redrawn background and replace empty compositions', () => {
 const draft = promptDraftSchema.parse({ product: '白色运动鞋', composition: '单只鞋摆放，角度与位置未指定，留白未指定', scene: '城市街头背景，自然光线' });
 const scene = renderProductPrompt(draft, 'scene', '4:5');
 assert.match(scene, /背景必须重绘为：城市街头背景/);
 assert.match(scene, /禁止纯白、纯色或棚拍背景/);
 assert.doesNotMatch(scene, /未指定/);
});
