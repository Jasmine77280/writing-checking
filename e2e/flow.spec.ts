import { test,expect } from '@playwright/test';
test('student revision and teacher review persist through reload',async({page})=>{
 await page.goto('/');
 await expect(page.getByText('模拟演示模式')).toBeVisible();
 await page.getByRole('button',{name:'先体验一篇示例作文'}).click();
 await page.getByRole('button',{name:'保存初稿，开始诊断'}).click();
 await expect(page.getByRole('heading',{name:'先把“为什么”说清楚'})).toBeVisible();
 await page.getByRole('button',{name:'给我更具体的提示'}).click();
 await expect(page.getByText('第二级 · 修改方向')).toBeVisible();
 await page.getByRole('button',{name:'给我更具体的提示'}).click();
 await expect(page.getByText('第三级 · 局部句式参考')).toBeVisible();
 await page.getByRole('button',{name:'自主修改',exact:true}).click();
 await page.getByLabel('二稿 ·').fill('在快节奏的时代，我们可以为深度思考放慢脚步。例如，阅读时停下来思考一段文字的推理，可以帮助我们发现逻辑上的跳跃。这说明慢的价值在于有意识地反思，而不是单纯降低速度。然而，面对紧急任务，我们仍需迅速行动。因此，应根据情境调整节奏，而不能认为慢下来就能带来成功。');
 await page.getByRole('button',{name:'提交二稿并查看变化'}).click();
 await expect(page.getByText('已确认解决：0 项', {exact:false})).toBeVisible();
 await page.getByRole('button',{name:'分享给教师复核（本机演示）'}).click();
 await page.getByRole('button',{name:'教师复核'}).click();
 await page.getByPlaceholder('填写判断依据；修改反馈时必填').first().fill('该表述需要结合上下文，不宜直接判定为错误。');
 await page.getByRole('button',{name:'修改',exact:true}).first().click();
 await page.reload();
 await page.getByRole('button',{name:'教师复核'}).click();
 await expect(page.getByPlaceholder('填写判断依据；修改反馈时必填').first()).toHaveValue('该表述需要结合上下文，不宜直接判定为错误。');
 await expect(page.locator('.teacher-item .tag').first()).toHaveText('修改');
 await page.getByRole('button',{name:'学习概览'}).click();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'删除快与慢的生活智慧'}).click();
 await expect(page.getByText('你的下一次进步，从这里开始')).toBeVisible();
});
test('API rejects invalid requests and returns anchored mock evidence',async({request})=>{
 const bad=await request.post('/api/analyze',{data:{title:'',text:''}});expect(bad.status()).toBe(400);
 const broken=await request.post('/api/analyze',{data:'{oops',headers:{'Content-Type':'application/json'}});expect(broken.status()).toBe(400);
 const text='所有人都必然成功。这个判断值得推敲。';const valid=await request.post('/api/analyze',{data:{title:'测试',text}});expect(valid.ok()).toBe(true);const r=await valid.json();expect(r.provider).toBe('mock');for(const d of r.dimensions){for(const e of d.evidence)expect(text.slice(e.start,e.end)).toBe(e.quote);}
});
test('real mode requires consent and keeps upstream failures visible',async({page})=>{
 await page.route('**/api/config',route=>route.fulfill({json:{provider:'openai-compatible',model:'test-model',configured:true,external:true}}));
 await page.route('**/api/analyze',async route=>{expect(route.request().postDataJSON().externalConsent).toBe(true);await route.fulfill({status:504,json:{error:'模型响应超时，请稍后重试。',code:'TIMEOUT'}});});
 await page.goto('/');await expect(page.getByText('真实 AI 模式',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'先体验一篇示例作文'}).click();
 await expect(page.getByRole('button',{name:'保存初稿，开始诊断'})).toBeDisabled();
 await page.getByRole('checkbox',{name:'我同意将本次作文、题目和材料发送给所配置的模型服务。'}).check();
 await page.getByRole('button',{name:'保存初稿，开始诊断'}).click();
 await expect(page.getByRole('dialog').getByRole('alert')).toContainText('模型响应超时');
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('heading',{name:'先把“为什么”说清楚'})).toHaveCount(0);
});
