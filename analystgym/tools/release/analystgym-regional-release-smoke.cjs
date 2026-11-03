// Проверка релизного образа на отдельной БД, без доступа к рабочим данным.
const {execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const assert=require('node:assert/strict');
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const network='analystgym-regional-release-check', db='analystgym-regional-release-db', app='analystgym-regional-release-app';
const password=randomBytes(24).toString('hex');
const created=[];
(async()=>{
 try {
  docker('network','create',network);created.push('network');
  docker('run','-d','--name',db,'--network',network,'-e','POSTGRES_USER=analystgym','-e','POSTGRES_DB=analystgym','-e','POSTGRES_PASSWORD='+password,'postgres:16-alpine');created.push(db);
  for(let i=0;i<40;i++){try{docker('exec',db,'pg_isready','-U','analystgym','-d','analystgym');break;}catch{}await new Promise(r=>setTimeout(r,1000));}
  docker('run','-d','--name',app,'--network',network,'-p','127.0.0.1:18082:8080',
   '-e','APP_DB_URL=jdbc:postgresql://'+db+':5432/analystgym','-e','APP_DB_USER=analystgym','-e','APP_DB_PASSWORD='+password,
   '-e','APP_JWT_SECRET='+randomBytes(48).toString('hex'),'-e','APP_COOKIES_SECURE=false',
   '-e','BILLING_FAKE_ENABLED=false','-e','REVIEW_QUEUE_ENABLED=false','-e','QUALITY_RECHECK_ENABLED=false',
   'analystgym-app:release-7e37bf2');created.push(app);
  let ready=false;
  for(let i=0;i<90;i++){try{const r=await fetch('http://127.0.0.1:18082/actuator/health');if(r.ok&&(await r.json()).status==='UP'){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
  assert(ready,'Приложение не запустилось');
  const request=(path,headers={})=>fetch('http://127.0.0.1:18082'+path,{headers});
  const tasks=await(await request('/api/tasks')).json();assert.equal(tasks.length,16);
  const home=await(await request('/')).text();assert(home.includes('практика для аналитиков'));assert(home.includes('hub-coming-soon'));assert(!home.includes('href="courses.html"'));assert(!home.includes('два ИИ-агента'));
  for(const [ip,currency,amount] of [['2.132.0.1','KZT',5000],['77.88.8.8','RUB',990],['8.8.8.8','USD',11.29],['2001:4860:4860::8888','USD',11.29]]){
   const response=await request('/api/pricing',{'X-Forwarded-For':ip});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
   const price=await response.json();assert.equal(price.currency,currency);assert.equal(price.monthlyAmount,amount);
  }
  const unknown=await(await request('/api/pricing')).json();assert.equal(unknown.currency,'USD');
  const source=await(await request('/assets/js/task.js')).text();assert(source.includes('Разбор вашего решения создаёт искусственный интеллект, а не человек.'));
  const admin=await(await request('/assets/js/admin-tasks.js')).text();assert(admin.includes('data-reference-tab="render"'));
  assert.equal((await request('/assets/js/data-tasks-1.js')).status,404);
  console.log(JSON.stringify({status:'ok',freshDatabase:true,health:'UP',publishedTasks:16,forwardedIPv4AndIPv6:true,currencies:['KZT','RUB','USD'],referenceRender:true,aiDisclaimer:true,coursesComingSoon:true,referenceLeak:false}));
 } finally {
  for(const name of [app,db])if(created.includes(name))docker('rm','-f','-v',name);
  if(created.includes('network'))docker('network','rm',network);
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
