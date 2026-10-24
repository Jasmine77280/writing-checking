import {test,expect} from '@playwright/test';
test('application writing: evidence, hints, revision, teacher review and export',async({page})=>{
 await page.goto('/');await expect(page.getByText('模拟演示模式',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'体验应用文示例'}).click();
 await page.getByRole('checkbox',{name:'我已核对题目'}).check();
 await page.getByRole('button',{name:'保存初稿，开始批改'}).click();
 await expect(page.getByRole('heading',{name:'具体反馈，比一个分数更重要'})).toBeVisible();
 await page.locator('summary').filter({hasText:'invite you attend'}).first().click();
 await expect(page.locator('mark')).toHaveText('invite you attend');
 await page.getByRole('button',{name:'给我更具体的提示'}).click();await expect(page.getByText('第二级 · 修改方向')).toBeVisible();
 await page.getByRole('button',{name:'给我更具体的提示'}).click();await expect(page.getByText('本任务未开启局部示例')).toBeVisible();
 await page.getByRole('button',{name:'自主修改',exact:true}).click();
 const editor=page.getByLabel('二稿第1段');const before=await editor.inputValue();await editor.fill(before.replace('invite you attend','invite you to attend'));
 await page.getByRole('button',{name:'提交二稿并比较'}).click();await expect(page.getByRole('heading',{name:'看见变化，也看见下一步'})).toBeVisible();await expect(page.getByText('已解决',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'分享给教师复核（本机演示）'}).click();
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'JSON',exact:true}).click();expect((await downloaded).suggestedFilename()).toBe('WriteWise-进步报告.json');
 await page.getByRole('button',{name:'教师复核',exact:false}).first().click();await page.getByRole('textbox',{name:'教师备注'}).first().fill('已核实此处结构问题，建议保留学生原意。');await page.getByRole('button',{name:'修改',exact:true}).first().click();
 await page.reload();await page.getByRole('button',{name:'教师复核',exact:false}).first().click();await expect(page.getByRole('textbox',{name:'教师备注'}).first()).toHaveValue('已核实此处结构问题，建议保留学生原意。');
 await page.getByRole('button',{name:'批改记录',exact:false}).click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'删除An invitation to our English club'}).click();await expect(page.getByText('从一篇已完成的英文作文开始')).toBeVisible();
});
test('continuation uses separate reading/student evidence and excludes given text from word count',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'体验读后续写示例'}).click();await page.getByRole('checkbox',{name:'我已核对题目'}).check();await page.getByRole('button',{name:'保存初稿，开始批改'}).click();
 await expect(page.getByRole('heading',{name:'同一条围巾的颜色是否前后一致？'})).toBeVisible();await expect(page.getByText('故事原文',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'情节与衔接',exact:true}).click();await expect(page.getByRole('heading',{name:/故事事实与合理想象/})).toBeVisible();await page.getByRole('button',{name:'自主修改',exact:true}).click();await expect(page.getByText(/学生正文.*含给定句/)).toBeVisible();
});
test('legacy data stays byte-for-byte intact, malformed new storage is not erased',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('wensi-tasks-v1','[{"legacy":"语文记录"}]');localStorage.setItem('writewise-tasks-v2','broken-data');});await page.goto('/');await expect(page.getByText('发现旧版语文训练记录')).toBeVisible();await expect(page.locator('.error[role=alert]')).toContainText('暂停自动保存');expect(await page.evaluate(()=>localStorage.getItem('wensi-tasks-v1'))).toBe('[{"legacy":"语文记录"}]');expect(await page.evaluate(()=>localStorage.getItem('writewise-tasks-v2'))).toBe('broken-data');
});
test('real-mode consent and failure leave inputs intact without mock fallback',async({page})=>{
 await page.route('**/api/config',r=>r.fulfill({json:{provider:'openai-compatible',model:'test-model',configured:true,external:true}}));await page.route('**/api/analyze',async r=>{expect(r.request().postDataJSON().externalConsent).toBe(true);await r.fulfill({status:504,json:{message:'模型响应超时，没有结果。'}});});await page.goto('/');await page.getByRole('button',{name:'体验应用文示例'}).click();const submit=page.getByRole('button',{name:'保存初稿，开始批改'});await expect(submit).toBeDisabled();await page.getByRole('checkbox',{name:'我同意将本次题目'}).check();await submit.click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('超时');await expect(page.getByLabel('学生英文正文')).not.toBeEmpty();
});
test('invalid requests are rejected clearly',async({request})=>{
 const r=await request.post('/api/analyze',{data:{task:{}}});expect(r.status()).toBe(400);const bad=await request.post('/api/analyze',{data:'bad',headers:{'content-type':'application/json'}});expect(bad.status()).toBe(400);
});

test('context extraction stays editable and unconfirmed review is limited',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'体验应用文示例'}).click();await page.getByRole('button',{name:'AI 整理任务要点'}).click();await expect(page.getByText('模拟提取仅按分隔符整理任务',{exact:false})).toBeVisible();await expect(page.getByRole('checkbox',{name:'我已核对题目'})).not.toBeChecked();await page.getByRole('button',{name:'保存初稿，开始批改'}).click();await expect(page.getByText('受限反馈：',{exact:false})).toBeVisible();await expect(page.getByText('不可评估',{exact:true}).first()).toBeVisible();
});
test('mobile layout fits and all form controls remain usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.getByRole('button',{name:'体验读后续写示例'}).click();await expect(page.getByLabel('第1段学生续写')).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
});
