#!/usr/bin/python3 -I
"""Одобрение релиза и начального персонала: выполняется root, не через gateway deploy."""
import argparse
import hashlib
import importlib.machinery
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request

BASE = Path('/etc/analystgym-deploy')
RELEASES = Path('/var/lib/analystgym-release')
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
       'DOCKER_HOST': 'unix:///var/run/docker.sock', 'DOCKER_CONFIG': '/root/.docker', 'LANG': 'C.UTF-8'}
STAFF = [('admin', 'Администратор', 'SUPERADMIN'), ('reviewer', 'Ревьюер', 'REVIEWER'),
         ('methodist', 'Методист', 'METHODIST'), ('llm-admin', 'Администратор LLM', 'LLM_ADMIN')]


def run(args, data=None, output=None):
    """Не показываем stderr приложения, где могут оказаться параметры подключения."""
    result = subprocess.run(args, input=data, stdout=output or subprocess.PIPE,
                            stderr=subprocess.PIPE, env=ENV, cwd='/')
    if result.returncode:
        raise RuntimeError('Команда завершилась с ошибкой: '+args[0])
    return result.stdout


def health():
    """Проверяем готовность БД через HTTPS, не отключая проверку сертификата."""
    for _ in range(60):
        try:
            with urllib.request.urlopen('https://analystgym.pro/actuator/health', timeout=10) as response:
                if response.status == 200 and json.load(response).get('status') == 'UP':
                    return
        except (OSError, ValueError, urllib.error.URLError):
            pass
        time.sleep(3)
    raise RuntimeError('Релиз не прошёл проверку здоровья')


def new_accounts(domain):
    """Пароли уникальны для каждого запуска/пользователя, не известны из исходного кода."""
    return [{'email': login+'@'+domain, 'name': name, 'role': role,
             'password': secrets.token_urlsafe(32)} for login, name, role in STAFF]


def main():
    """Сохраняем конфигурацию/БД, меняем только image и отдельно создаём персонал."""
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--config-digest', required=True)
    parser.add_argument('--release', required=True)
    parser.add_argument('--staff-domain', default='analystgym.pro')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Одобрение релиза выполняется root')
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{1,63}', args.release):
        raise RuntimeError('Некорректное имя релиза')
    if not re.fullmatch(r'[0-9a-f]{64}', args.sha256) or not re.fullmatch(r'sha256:[0-9a-f]{64}', args.config_digest):
        raise RuntimeError('Некорректный digest')
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]+\.[a-z]{2,}', args.staff_domain):
        raise RuntimeError('Некорректный домен персонала')
    access = importlib.machinery.SourceFileLoader('access', '/usr/local/sbin/analystgym-deploy').load_module()
    for item in (Path(__file__), BASE, BASE/'compose.json', BASE/'settings.json', RELEASES):
        access.trusted(item)
    settings = json.loads((BASE/'settings.json').read_text())
    original = (BASE/'compose.json').read_text()
    config = json.loads(original)
    access.validate(config, settings)
    destination = RELEASES/args.release
    if destination.exists():
        raise RuntimeError('Каталог релиза уже существует; сначала проверьте предыдущий запуск под root')
    destination.mkdir(mode=0o700)
    archive = destination/'image.tar'
    print('1/5: копирование и проверка нового образа', flush=True)
    digest = hashlib.sha256()
    with open(args.archive, 'rb') as source, archive.open('xb') as target:
        os.chmod(archive, 0o600)
        while chunk := source.read(1024*1024):
            target.write(chunk)
            digest.update(chunk)
    if digest.hexdigest() != args.sha256:
        raise RuntimeError('SHA-256 архива не совпал; приложение не менялось')
    with tarfile.open(archive) as image_tar:
        manifest = json.load(image_tar.extractfile('manifest.json'))
        if len(manifest) != 1 or len(manifest[0].get('RepoTags', [])) != 1:
            raise RuntimeError('Ожидается один образ с одним тегом')
        blob = image_tar.extractfile(manifest[0]['Config']).read()
        if 'sha256:'+hashlib.sha256(blob).hexdigest() != args.config_digest:
            raise RuntimeError('Config digest не совпал')
        tag = manifest[0]['RepoTags'][0]
        if not re.fullmatch(r'[a-z0-9][a-z0-9./:_-]+', tag):
            raise RuntimeError('Некорректный тег')
    run(['/usr/bin/docker', 'load', '-i', str(archive)])
    image = json.loads(run(['/usr/bin/docker', 'image', 'inspect', tag]))[0]['Id']
    prefix = access.compose(settings)
    print('2/5: бэкап БД и конфигурации; существующие ключи сохраняются', flush=True)
    access.atomic_write(destination/'compose-before.json', original, 0o600)
    with (destination/'database.dump').open('xb') as backup:
        os.chmod(destination/'database.dump', 0o600)
        run([*prefix, 'exec', '-T', 'postgres', 'pg_dump', '-U', 'analystgym', '-d', 'analystgym', '-Fc'], output=backup)
    config['services']['app']['image'] = image
    access.validate(config, settings)
    print('3/5: запуск одобренного образа', flush=True)
    try:
        access.atomic_write(BASE/'compose.json', json.dumps(config, indent=2)+'\n', 0o600)
        run([*prefix, 'config', '--quiet'])
        run(['/usr/local/sbin/analystgym-deploy', 'deploy'])
        health()
        with urllib.request.urlopen('https://analystgym.pro/', timeout=15) as response:
            page = response.read().decode('utf-8')
        if 'hub-coming-soon' not in page or 'href="courses.html"' in page:
            raise RuntimeError('Новая главная не прошла проверку')
    except Exception:
        # Этот релиз не меняет схему БД: возврат прежнего образа совместим.
        access.atomic_write(BASE/'compose.json', original, 0o600)
        run(['/usr/local/sbin/analystgym-deploy', 'deploy'])
        raise RuntimeError('Проверка релиза не прошла; прежняя конфигурация восстановлена')
    print('4/5: создание служебных пользователей без смены существующих паролей', flush=True)
    credentials = BASE/'staff-credentials.json'
    if credentials.exists():
        access.trusted(credentials)
        saved = json.loads(credentials.read_text())
        accounts = saved['accounts']
        # Для уже известных записей сохраняем первоначальный пароль; неизвестный не угадываем.
        for account in accounts:
            if not account.get('password'):
                account['password'] = secrets.token_urlsafe(32)
    else:
        accounts = new_accounts(args.staff_domain)
        saved = {'status': 'prepared', 'accounts': accounts}
        access.atomic_write(credentials, json.dumps(saved, ensure_ascii=False, indent=2)+'\n', 0o600)
    seed_input = [{key: account[key] for key in ('email', 'name', 'role', 'password')} for account in accounts]
    result = json.loads(run([*prefix, 'exec', '-T', 'app', 'java', '-jar', '/app/app.jar', '--bootstrap-staff'],
                            data=json.dumps(seed_input, ensure_ascii=False).encode('utf-8')))
    by_email = {row['email']: row for row in result}
    for account in accounts:
        row = by_email[account['email']]
        if not row.get('passwordMatches'):
            account['password'] = None
        account['status'] = row['status']
    saved.update(status='applied', accounts=accounts)
    access.atomic_write(credentials, json.dumps(saved, ensure_ascii=False, indent=2)+'\n', 0o600)
    health()
    access.atomic_write(destination/'result.json', json.dumps({'image': image, 'archiveSha256': args.sha256,
                        'staff': result, 'status': 'ok'}, indent=2)+'\n', 0o600)
    print('5/5: готово. Служебные роли: '+', '.join(row['role'] for row in result), flush=True)
    print('Пароли не выводились. Закрытый файл root: '+str(credentials))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        print('Остановка: '+str(error), file=sys.stderr, flush=True)
        sys.exit(1)
