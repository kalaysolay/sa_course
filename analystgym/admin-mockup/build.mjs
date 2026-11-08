// Проверяет общий JavaScript и собирает отдельную HTML-страницу для каждого кейса.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
const pages={index:'courses','course-new':'course-new','course-settings':'course-settings','course-outline':'course-outline','course-publish':'course-publish','module-new':'module-new','module-edit':'module-edit','lesson-new':'lesson-new','lesson-settings':'lesson-settings','lesson-lecture':'lesson-lecture','lesson-tests':'lesson-tests','lesson-practice':'lesson-practice','lesson-materials':'lesson-materials','lesson-order':'lesson-order','lesson-preview':'lesson-preview','block-add':'block-add','block-edit':'block-edit','test-edit':'test-edit','practice-new':'practice-new','practice-edit':'practice-edit','practice-library':'practice-library','material-edit':'material-edit',delete:'delete',reset:'reset'};
execFileSync(process.execPath,['--check',path.join(root,'assets/app.js')],{stdio:'inherit'});
for(const [file,page]of Object.entries(pages)){
  fs.writeFileSync(path.join(root,file+'.html'),`<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="robots" content="noindex,nofollow">\n<title>Редакторская — AnalystGYM</title>\n<link rel="stylesheet" href="assets/styles.css">\n<script src="assets/app.js" defer></script>\n</head>\n<body data-page="${page}">\n<div id="app"></div>\n<noscript>Для кликабельного макета включите JavaScript.</noscript>\n</body>\n</html>\n`,'utf8');
}
console.log(`Собрано ${Object.keys(pages).length} HTML-экранов. JavaScript: синтаксис корректен.`);
