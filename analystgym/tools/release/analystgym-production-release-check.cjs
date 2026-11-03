// Только чтение публичных страниц и API после обновления.
const assert=require('node:assert/strict');
(async()=>{
 const base='https://analystgym.pro';
 const paths=['/actuator/health','/api/tasks','/','/api/pricing','/practice.html','/assets/js/task.js?v=20261021-ai-disclaimer-2','/assets/js/admin-tasks.js?v=20261020-reference'];
 const results=await Promise.all(paths.map(async path=>{
  const response=await fetch(base+path);assert.equal(response.status,200,path);
  return {path,response,text:await response.text()};
 }));
 const at=path=>results.find(x=>x.path===path);
 assert.equal(JSON.parse(at('/actuator/health').text).status,'UP');
 const tasks=JSON.parse(at('/api/tasks').text);assert.equal(tasks.length,16);
 const home=at('/').text;
 assert(home.includes('практика для аналитиков'));assert(home.includes('hub-coming-soon'));
 assert(!home.includes('href="courses.html"'));assert(!home.includes('два ИИ-агента'));
 const price=JSON.parse(at('/api/pricing').text);assert(['KZT','RUB','USD'].includes(price.currency));
 assert.equal(price.monthlyAmount,{KZT:5000,RUB:990,USD:11.29}[price.currency]);
 assert(at('/api/pricing').response.headers.get('cache-control').includes('no-store'));
 assert(at('/practice.html').text.includes('pricing.js?v=20261021'));
 assert(at('/assets/js/task.js?v=20261021-ai-disclaimer-2').text.includes('Разбор вашего решения создаёт искусственный интеллект, а не человек.'));
 assert(at('/assets/js/admin-tasks.js?v=20261020-reference').text.includes('data-reference-tab="render"'));
 assert.equal((await fetch(base+'/assets/js/data-tasks-1.js')).status,404);
 console.log(JSON.stringify({health:'UP',publishedTasks:tasks.length,pagesAndAssetsChecked:results.length,pricing:price,pricingCache:at('/api/pricing').response.headers.get('cache-control'),referenceRender:true,aiDisclaimer:true,coursesComingSoon:true,demoAnswersExposed:false}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
