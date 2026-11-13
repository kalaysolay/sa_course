import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');
await fs.mkdir(out, { recursive: true });
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const text = (x, y, content, size = 18, anchor = 'middle', color = '#17212b') => {
  const lines = Array.isArray(content) ? content : [content];
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-size="${size}">${lines.map((s, i) => `<tspan x="${x}" dy="${i ? size * 1.32 : 0}">${esc(s)}</tspan>`).join('')}</text>`;
};
const box = (x, y, w, h, rx = 0, fill = '#fff', stroke = '#17212b') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2.3"/>`;
const line = (d, arrow = true, color = '#17212b') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"${arrow ? ' marker-end="url(#arrow)"' : ''}/>`;
const diamond = (x, y, r = 24) => `<path d="M${x},${y-r} L${x+r},${y} L${x},${y+r} L${x-r},${y} Z" fill="#fff" stroke="#17212b" stroke-width="2.3"/>`;
const initial = (x, y) => `<circle cx="${x}" cy="${y}" r="10" fill="#17212b"/>`;
const activityFinal = (x, y) => `<circle cx="${x}" cy="${y}" r="17" fill="#fff" stroke="#17212b" stroke-width="2.3"/><circle cx="${x}" cy="${y}" r="10" fill="#17212b"/>`;
const flowFinal = (x, y) => `<circle cx="${x}" cy="${y}" r="18" fill="#fff" stroke="#17212b" stroke-width="2.3"/>${line(`M${x-9},${y-9} L${x+9},${y+9} M${x+9},${y-9} L${x-9},${y+9}`, false)}`;
const bar = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="7" fill="#17212b"/>`;
const action = (cx, y, w, label, h = 64) => {
  const rows = Array.isArray(label) ? label : [label];
  return box(cx-w/2, y, w, h, 13) + text(cx, y+h/2+6-(rows.length-1)*12, rows);
};
const heading = (title, subtitle) => text(410, 34, title, 23) + (subtitle ? text(410, 63, subtitle, 16, 'middle', '#335c81') : '');
async function save(name, height, title, desc, body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="${height}" viewBox="0 0 820 ${height}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="#17212b" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></marker></defs><rect width="820" height="${height}" fill="#fff"/><g font-family="Arial, DejaVu Sans, sans-serif">${body}</g></svg>`;
  await fs.writeFile(path.join(out, name), svg, 'utf8');
  console.log(`${name}: ${Buffer.byteLength(svg)} bytes; 820 × ${height}`);
}

// Справочник показывает топологии, а не только условные значки.
let gallery = heading('Символы диаграммы активности', 'Стрелки обозначают направление потока; подписи поясняют символ.');
const card = (col, row, title, draw) => {
  const x = 20 + col*400, y = 90 + row*205;
  gallery += box(x, y, 380, 190, 8, '#fff', '#c6d1db') + text(x+190, y+30, title, 20, 'middle', '#335c81') + draw(x, y);
};
card(0,0,'Действие', (x,y)=> action(x+190,y+72,270,'Проверить полноту'));
card(1,0,'Control flow', (x,y)=> line(`M${x+55},${y+100} H${x+325}`)+text(x+190,y+146,'Порядок выполнения',16));
card(0,1,'Начало · initial', (x,y)=>initial(x+190,y+80)+line(`M${x+190},${y+91} V${y+147}`));
card(1,1,'Конец activity · activity final',(x,y)=>line(`M${x+190},${y+62} V${y+102}`)+activityFinal(x+190,y+125)+text(x+190,y+167,'Завершает всю activity',16));
card(0,2,'Выбор · decision',(x,y)=>line(`M${x+190},${y+52} V${y+72}`)+diamond(x+190,y+98,25)+line(`M${x+165},${y+98} H${x+85} V${y+149}`)+line(`M${x+215},${y+98} H${x+295} V${y+149}`)+text(x+85,y+173,'[да]',16)+text(x+295,y+173,'[нет]',16));
card(1,2,'Слияние · merge',(x,y)=>line(`M${x+80},${y+60} V${y+100} H${x+165}`)+line(`M${x+300},${y+60} V${y+100} H${x+215}`)+diamond(x+190,y+100,25)+line(`M${x+190},${y+125} V${y+166}`));
card(0,3,'Разделение · fork',(x,y)=>line(`M${x+190},${y+55} V${y+86}`)+bar(x+75,y+90,230)+line(`M${x+105},${y+98} V${y+157}`)+line(`M${x+275},${y+98} V${y+157}`));
card(1,3,'Синхронизация · join (AND)',(x,y)=>line(`M${x+105},${y+55} V${y+105}`)+line(`M${x+275},${y+55} V${y+105}`)+bar(x+75,y+109,230)+line(`M${x+190},${y+117} V${y+163}`));
card(0,4,'Конец ветви · flow final',(x,y)=>line(`M${x+190},${y+55} V${y+99}`)+flowFinal(x+190,y+123)+text(x+190,y+167,'Другие потоки продолжаются',16));
card(1,4,'Object node',(x,y)=>box(x+80,y+74,220,65)+text(x+190,y+100,['Сведения','обращения'],18));
card(0,5,'Object flow',(x,y)=>box(x+120,y+77,140,55)+text(x+190,y+109,'Обращение',16)+line(`M${x+35},${y+105} H${x+117}`)+line(`M${x+263},${y+105} H${x+345}`)+text(x+190,y+164,'Передача данных через object node',16));
card(1,5,'Дорожки · swimlanes',(x,y)=>box(x+40,y+58,300,112)+line(`M${x+190},${y+58} V${y+170}`,false)+line(`M${x+40},${y+90} H${x+340}`,false)+text(x+115,y+81,'Сотрудник',16)+text(x+265,y+81,'Система',16)+action(x+115,y+107,120,'Отправить',42)+action(x+265,y+107,120,'Проверить',42));
await save('notation.svg',1335,'Основные символы UML activity diagram','Двенадцать наглядных карточек: действия, control flow, initial, activity final, decision с одним входом и двумя выходами, merge с двумя входами и одним выходом, fork, join, flow final, object node, object flow и дорожки.',gallery);

let linear = heading('Последовательность действий', 'Учебный пример: одно обращение; успешный путь без уточнений.');
for (let i=0;i<3;i++) linear += box(20+i*260,90,260,800)+box(20+i*260,90,260,48,0,'#edf2f6')+text(150+i*260,120,['Сотрудник','Система','Комплаенс-офицер'][i],18);
const steps = [
  [150,190,['Подготовить','обращение']], [150,285,['Отправить','обращение']],
  [410,380,['Проверить','полноту']], [410,475,['Зарегистрировать','обращение']],
  [670,570,['Рассмотреть','обращение']], [670,665,['Зафиксировать','решение']],
  [410,760,['Сообщить','результат']]
];
linear += initial(150,160)+line('M150,171 V188');
steps.forEach(([x,y,label],i)=>{linear+=action(x,y,220,label,60);if(i<steps.length-1){const [nx,ny]=steps[i+1];linear+=line(`M${x},${y+61} V${y+77} H${nx} V${ny-2}`);}});
linear += line('M410,821 V852')+activityFinal(410,872);
await save('linear-swimlanes.svg',920,'Линейный процесс в трёх дорожках','Сотрудник подготавливает и отправляет обращение. Система проверяет полноту и регистрирует. Офицер рассматривает и фиксирует решение. Система сообщает результат.',linear);

let choice=heading('Выбор канала ответа и merge','Допущение: готовый ответ отправляют ровно по одному выбранному каналу.');
choice+=initial(410,100)+line('M410,111 V150')+text(480,125,['Выбранный канал','ответа?'],18,'start')+diamond(410,184,30);
choice+=line('M380,184 H205 V265')+line('M440,184 H615 V265')+text(205,224,'[почта]',18)+text(615,224,'[личный кабинет]',18);
choice+=action(205,268,290,['Отправить ответ','по почте'],72)+action(615,268,290,['Разместить ответ','в личном кабинете'],72);
choice+=line('M205,342 V403 H380')+line('M615,342 V403 H440')+diamond(410,403,30)+text(465,382,'merge',20,'start','#335c81');
choice+=line('M410,435 V480')+action(410,482,330,['Зафиксировать','способ ответа'],72)+line('M410,556 V607')+activityFinal(410,629);
choice+=text(410,685,'Два входа, один выход. Merge не ждёт вторую альтернативу.',18);
await save('decision-merge.svg',720,'Выбор канала ответа с явным merge','Decision выбирает между почтой и личным кабинетом. После разных действий две альтернативы приходят в подписанный merge и продолжаются общим действием фиксации способа ответа.',choice);

let loop=heading('Возврат за уточнением','Учебный пример: проверка полноты до регистрации обращения.');
loop+=initial(410,95)+line('M410,107 V129')+diamond(410,155,24)+text(458,163,'merge',20,'start','#335c81');
loop+=line('M410,181 V214')+action(410,216,260,['Подготовить','обращение'],60)+line('M410,278 V313')+action(410,315,260,['Отправить','обращение'],60)+line('M410,377 V413')+action(410,415,260,['Проверить','полноту'],60);
loop+=line('M410,477 V523')+diamond(410,555,30)+text(460,559,'Данных достаточно?',18,'start');
loop+=line('M380,555 H170 V488')+text(250,543,'[нет]',18)+action(170,415,210,['Сообщить,','чего не хватает'],70)+line('M170,413 V155 H384');
loop+=text(183,123,'Возврат',16,'middle','#335c81')+text(410,620,'[да]',18)+line('M410,587 V654');
const last=[[656,['Зарегистрировать','обращение']],[750,['Рассмотреть','обращение']],[844,['Зафиксировать','решение']],[938,['Сообщить','результат']]];
last.forEach(([y,label],i)=>{loop+=action(410,y,260,label,60);if(i<last.length-1)loop+=line(`M410,${y+62} V${last[i+1][0]-2}`);});
loop+=line('M410,1000 V1033')+activityFinal(410,1053);
await save('clarification-loop.svg',1090,'Цикл уточнения с явным merge','Первоначальный вход и обратный путь соединяются в merge перед подготовкой обращения. Неполные данные возвращают сотрудника на уточнение; полные данные ведут к регистрации и рассмотрению.',loop);

let parallel=heading('Две обязательные проверки','После fork обе ветви должны дойти до стандартного AND-join.');
parallel+=initial(410,98)+line('M410,110 V145')+action(410,147,300,['Зарегистрировать','обращение'],64)+line('M410,213 V249')+bar(185,252,450)+text(675,260,'fork',20,'start','#335c81');
parallel+=line('M205,261 V323')+line('M615,261 V323')+action(205,326,290,['Проверить','документы'],72)+action(615,326,290,['Проверить основание','обращения'],72);
parallel+=line('M205,400 V470')+line('M615,400 V470')+bar(185,473,450)+text(667,482,'join (AND)',20,'start','#335c81');
parallel+=line('M410,482 V536')+action(410,539,320,['Составить','рекомендацию'],72)+line('M410,613 V658')+activityFinal(410,679)+text(410,728,'Продолжение — после завершения обеих проверок.',18);
await save('fork-join.svg',765,'Fork и стандартный AND join','После регистрации fork запускает две обязательные проверки. Join синхронизирует оба потока, после чего составляется рекомендация.',parallel);

let endings=heading('Конец ветви и конец всей activity','Два независимых потока; синхронизирующего join здесь нет.');
endings+=initial(410,100)+line('M410,112 V153')+bar(185,156,450)+text(670,165,'fork',20,'start','#335c81')+line('M205,165 V230')+line('M615,165 V230');
endings+=action(205,233,290,['Отправить','напоминание'],72)+action(615,233,290,['Рассмотреть','обращение'],72)+line('M615,307 V339')+action(615,341,290,['Зафиксировать','решение'],64)+line('M205,307 V466')+line('M615,407 V466')+flowFinal(205,487)+activityFinal(615,487);
endings+=text(205,544,'flow final',21,'middle','#335c81')+text(205,578,['Завершает только','ветвь напоминания.'],18)+text(615,544,'activity final',21,'middle','#335c81')+text(615,578,['Завершает всю activity,','включая другую ветвь.'],18);
endings+=text(410,675,['Если напоминание закончилось первым, рассмотрение продолжается.', 'Если решение зафиксировано и достигнут activity final первым,', 'незавершённая ветвь напоминания прерывается.'],18);
await save('final-nodes.svg',775,'Flow final и activity final в параллельных потоках','После fork напоминание завершается flow final, а рассмотрение и фиксация решения activity final. Flow final не прерывает рассмотрение, activity final прекращает все ещё выполняющиеся потоки этой activity.',endings);

let flows=heading('Порядок действий и передача данных','Два отдельных фрагмента: сравниваем смысл стрелок.');
flows+=box(25,100,770,210,8,'#fff','#c6d1db')+text(410,137,'Control flow: что выполняется после чего',21,'middle','#335c81');
flows+=action(225,184,290,['Проверить','полноту'],72)+action(615,184,290,['Зарегистрировать','обращение'],72)+line('M372,220 H467')+text(410,290,'Стрелка задаёт порядок выполнения.',18);
flows+=box(25,345,770,275,8,'#fff','#c6d1db')+text(410,382,'Object flow: какие данные получает действие',21,'middle','#335c81');
flows+=action(150,442,220,['Подготовить','сведения'],72)+box(310,442,200,72)+text(410,471,['Сведения','обращения'],18)+action(670,442,220,['Проверить','полноту'],72);
flows+=box(260,470,10,16)+box(550,470,10,16)+line('M272,478 H307')+line('M513,478 H547')+text(410,567,'Прямоугольник — object node; маленькие квадраты — pins.',18)+text(410,596,'Объект передаётся между действиями; это не ещё одно действие.',18);
await save('control-object-flow.svg',655,'Control flow и object flow','Верхний фрагмент показывает порядок проверки и регистрации. Нижний фрагмент показывает данные Сведения обращения между подготовкой и проверкой, включая output pin и input pin действий.',flows);
