#!/usr/bin/python3 -I
"""Первый запуск проверенного образа за существующим nginx; только для root."""
import argparse
import hashlib
import importlib.machinery
import ipaddress
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

DOMAIN = 'analystgym.pro'
NGINX = 'nginx-nginx-1'
CONF_DIR = Path('/data/nginx/user_conf.d')
BASE = Path('/etc/analystgym-deploy')
STATE = Path('/var/lib/analystgym-release')
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
       'LANG': 'C.UTF-8', 'DOCKER_HOST': 'unix:///var/run/docker.sock',
       'DOCKER_CONFIG': '/root/.docker'}


def command(args, capture=True):
    """Не передаём shell и не печатаем Docker stderr с возможными секретами."""
    result = subprocess.run(args, env=ENV, cwd='/', stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE, text=True)
    if result.returncode:
        raise RuntimeError('Ошибка команды %s, код %s' % (args[0], result.returncode))
    return result.stdout


def nginx_nodes(text):
    """Разбираем границы директив/блоков nginx, учитывая комментарии и кавычки."""
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\#[^\n]*|[{};]|[^\s{};\#]+'''
    tokens = [m for m in re.finditer(pattern, text) if not m[0].startswith('#')]
    index = 0

    def parse(nested=False):
        nonlocal index
        nodes = []
        while index < len(tokens):
            if tokens[index][0] == '}':
                if not nested:
                    raise RuntimeError('Лишняя закрывающая скобка nginx')
                end = tokens[index].end()
                index += 1
                return nodes, end
            start = tokens[index].start()
            words = []
            while index < len(tokens) and tokens[index][0] not in ('{', '}', ';'):
                words.append(tokens[index][0].strip('\"\''))
                index += 1
            if not words or index == len(tokens) or tokens[index][0] == '}':
                raise RuntimeError('Не удалось разобрать директиву nginx')
            delimiter = tokens[index]
            index += 1
            children = []
            if delimiter[0] == '{':
                children, end = parse(True)
            else:
                end = delimiter.end()
            nodes.append({'words': words, 'start': start, 'end': end,
                          'open': delimiter.end(), 'children': children,
                          'block': delimiter[0] == '{'})
        if nested:
            raise RuntimeError('Незакрытый блок nginx')
        return nodes, len(text)
    return parse()[0]


def patch_site(text, upstream):
    """Заменяем только корневой location нужного HTTPS-сервера, сохраняя TLS."""
    candidates = []
    for node in nginx_nodes(text):
        if node['words'] != ['server'] or not node['block']:
            continue
        children = node['children']
        domain = any(n['words'][0] == 'server_name' and DOMAIN in n['words'][1:] for n in children)
        tls = any(n['words'][0] == 'listen' and
                  any(w == '443' or w.endswith(':443') for w in n['words'][1:]) for n in children)
        if domain and tls:
            candidates.append(node)
    if not candidates:
        return None
    if len(candidates) != 1:
        raise RuntimeError('Несколько HTTPS server-блоков домена; требуется ручная проверка')
    server = candidates[0]
    locations = [n for n in server['children'] if n['words'][0] == 'location']
    roots = [n for n in locations if n['words'] == ['location', '/']]
    # Не затираем неизвестные API/static/regex-маршруты существующего сайта.
    for node in locations:
        if node not in roots and not any('/.well-known/acme-challenge' in w for w in node['words']):
            raise RuntimeError('Дополнительный location требует ручной проверки nginx')
    if len(roots) > 1:
        raise RuntimeError('Несколько location /')
    replacement = '''location / {
        proxy_pass http://%s:18080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }''' % upstream
    if roots:
        return text[:roots[0]['start']] + replacement + text[roots[0]['end']:]
    position = server['end'] - 1
    return text[:position] + '\n    ' + replacement + '\n' + text[position:]


def build_config(image, gateway, password, jwt, webhook):
    """БД не имеет host-порта; HTTP доступен только localhost и bridge nginx."""
    return {
        'name': 'analystgym',
        'services': {
            'app': {
                'image': image, 'pull_policy': 'never', 'restart': 'unless-stopped',
                'ports': ['127.0.0.1:18080:8080', gateway+':18080:8080'],
                'networks': ['backend', 'egress'],
                'depends_on': {'postgres': {'condition': 'service_healthy'}},
                'environment': {
                    'SPRING_PROFILES_ACTIVE': 'prod',
                    'APP_DB_URL': 'jdbc:postgresql://postgres:5432/analystgym',
                    'APP_DB_USER': 'analystgym', 'APP_DB_PASSWORD': password,
                    'APP_JWT_SECRET': jwt, 'APP_COOKIES_SECURE': 'true',
                    'APP_SITE_BASE_URL': 'https://'+DOMAIN,
                    'APP_GOOGLE_ENABLED': 'false', 'APP_MAIL_ENABLED': 'false',
                    'REVIEW_ENGINE': 'mock', 'BILLING_FAKE_ENABLED': 'false',
                    'BILLING_WEBHOOK_SECRET': webhook,
                },
            },
            'postgres': {
                'image': 'postgres:16', 'restart': 'unless-stopped',
                'networks': ['backend'], 'volumes': ['pgdata:/var/lib/postgresql/data'],
                'environment': {'POSTGRES_DB': 'analystgym', 'POSTGRES_USER': 'analystgym',
                                'POSTGRES_PASSWORD': password},
                'healthcheck': {
                    'test': ['CMD-SHELL', 'pg_isready -U analystgym -d analystgym'],
                    'interval': '5s', 'timeout': '5s', 'retries': 30,
                },
            },
        },
        'networks': {'backend': {'internal': True}, 'egress': {}},
        'volumes': {'pgdata': {'name': 'analystgym_pgdata'}},
    }


def ready(url, host=None):
    """Проверяем реальный HTTP без подмены сертификатов и утечки тел ответа."""
    req = urllib.request.Request(url, headers={'Host': host} if host else {})
    with urllib.request.urlopen(req, timeout=10) as response:
        body = json.loads(response.read())
        return response.status == 200 and body.get('status') in ('UP', 'ok')


def wait_ready(url, host=None):
    """Первый старт включает миграции; даём ограниченное время готовности."""
    for _ in range(60):
        try:
            if ready(url, host):
                return
        except (OSError, ValueError, urllib.error.URLError):
            pass
        time.sleep(3)
    raise RuntimeError('HTTP-проверка не стала успешной: '+url)


def main():
    """Утверждаем подготовленный релиз и переключаем nginx только после проверок."""
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--image', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Первый запуск выполняется root')
    if not re.fullmatch(r'[0-9a-f]{64}', args.sha256) or not re.fullmatch(r'sha256:[0-9a-f]{64}', args.image):
        raise RuntimeError('Некорректные контрольные суммы')
    access = importlib.machinery.SourceFileLoader('access', '/usr/local/sbin/analystgym-deploy').load_module()
    access.trusted(Path(__file__))
    access.trusted(BASE)
    access.trusted(CONF_DIR)
    access.trusted(STATE.parent)
    if STATE.exists() or (BASE/'compose.json').exists() or (BASE/'settings.json').exists():
        raise RuntimeError('Первый запуск уже начат/настроен. Повтор требует проверки root, данные не менялись.')
    command(['/usr/bin/docker', 'exec', NGINX, 'nginx', '-t'])
    nginx = json.loads(command(['/usr/bin/docker', 'inspect', NGINX]))[0]
    mount_ok = any(m['Type'] == 'bind' and m['Source'] == str(CONF_DIR)
                   and m['Destination'] == '/etc/nginx/user_conf.d' for m in nginx['Mounts'])
    if not mount_ok:
        raise RuntimeError('Монтирование конфигов nginx отличается от проверенного')
    gateways = {v['Gateway'] for v in nginx['NetworkSettings']['Networks'].values()
                if v.get('Gateway') and ipaddress.ip_address(v['Gateway']).version == 4}
    if len(gateways) != 1 or not ipaddress.ip_address(next(iter(gateways))).is_private:
        raise RuntimeError('Нельзя однозначно определить приватный gateway nginx')
    gateway = next(iter(gateways))
    changes = []
    for file in CONF_DIR.rglob('*.conf'):
        access.trusted(file)
        original = file.read_text(encoding='utf-8')
        patched = patch_site(original, gateway)
        if patched is not None:
            changes.append((file, original, patched))
    if len(changes) != 1:
        raise RuntimeError('Ожидался один конфиг HTTPS для '+DOMAIN+'; файлы не менялись')
    # Не используем существующую БД/контейнеры с совпавшими именами.
    existing = command(['/usr/bin/docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=analystgym']).strip()
    volumes = command(['/usr/bin/docker', 'volume', 'ls', '--format', '{{.Name}}']).splitlines()
    if existing or 'analystgym_pgdata' in volumes:
        raise RuntimeError('Найден существующий проект/volume AnalystGym; нужна проверка root')
    STATE.mkdir(mode=0o700)
    archive = STATE/'approved-image.tar'
    digest = hashlib.sha256()
    print('1/6: копирование и проверка архива образа', flush=True)
    with open(args.archive, 'rb') as source, archive.open('xb') as target:
        os.chmod(archive, 0o600)
        while chunk := source.read(1024*1024):
            digest.update(chunk)
            target.write(chunk)
    if digest.hexdigest() != args.sha256:
        archive.unlink()
        STATE.rmdir()
        raise RuntimeError('SHA-256 архива не совпал; запуск отменён')
    print('2/6: загрузка одобренного образа', flush=True)
    command(['/usr/bin/docker', 'load', '-i', str(archive)])
    # Containerd и legacy Docker по-разному называют Image ID. Проверяем config
    # digest из проверенного архива и затем фиксируем локальный ID после load.
    with tarfile.open(archive) as image_tar:
        manifest = json.load(image_tar.extractfile('manifest.json'))
        if len(manifest) != 1 or len(manifest[0].get('RepoTags', [])) != 1:
            raise RuntimeError('Ожидался один образ и один тег в одобренном архиве')
        blob = image_tar.extractfile(manifest[0]['Config']).read()
        if 'sha256:'+hashlib.sha256(blob).hexdigest() != args.image:
            raise RuntimeError('Config digest отличается от одобренного')
        image_tag = manifest[0]['RepoTags'][0]
        if not re.fullmatch(r'[a-z0-9][a-z0-9./:_-]+', image_tag):
            raise RuntimeError('Некорректный тег в архиве')
    loaded = json.loads(command(['/usr/bin/docker', 'image', 'inspect', image_tag]))[0]
    local_image = loaded['Id']
    config = build_config(local_image, gateway, secrets.token_hex(32), secrets.token_hex(48), secrets.token_hex(32))
    settings = {'project': 'analystgym', 'sourceDirectory': str(BASE), 'service': 'app',
                'approval': 'first-release-root-approved'}
    access.validate(config, settings)
    access.atomic_write(BASE/'compose.json', json.dumps(access.escape_values(config), indent=2)+'\n', 0o600)
    # settings пока не публикуем: deploy не должен вмешаться до завершения установки.
    prefix = access.compose(settings)
    command([*prefix, 'config', '--quiet'])
    print('3/6: запуск PostgreSQL и приложения, ожидание миграций', flush=True)
    command([*prefix, 'up', '-d', 'postgres', 'app'])
    wait_ready('http://127.0.0.1:18080/actuator/health', DOMAIN)
    file, original, patched = changes[0]
    access.atomic_write(STATE/'nginx-before.conf', original, 0o600)
    print('4/6: бэкап начальной БД', flush=True)
    backup_dir = Path('/var/backups/analystgym')
    if backup_dir.exists():
        access.trusted(backup_dir)
    else:
        access.trusted(backup_dir.parent)
        backup_dir.mkdir(mode=0o700)
    backup = backup_dir/'initial-release.dump'
    with backup.open('xb') as stream:
        os.chmod(backup, 0o600)
        result = subprocess.run([*prefix, 'exec', '-T', 'postgres', 'pg_dump', '-U', 'analystgym', '-d', 'analystgym', '-Fc'],
                                env=ENV, cwd='/', stdout=stream, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('Бэкап не создан; nginx не менялся')
    print('5/6: проверка и переключение nginx', flush=True)
    mode = file.stat().st_mode & 0o777
    try:
        access.atomic_write(file, patched, mode)
        command(['/usr/bin/docker', 'exec', NGINX, 'nginx', '-t'])
        command(['/usr/bin/docker', 'exec', NGINX, 'nginx', '-s', 'reload'])
        wait_ready('https://'+DOMAIN+'/actuator/health')
        with urllib.request.urlopen('https://'+DOMAIN+'/api/tasks', timeout=15) as response:
            tasks = json.loads(response.read())
            if response.status != 200 or not isinstance(tasks, list) or len(tasks) != 16:
                raise RuntimeError('Каталог не содержит ожидаемые 16 задач')
    except Exception:
        access.atomic_write(file, original, mode)
        command(['/usr/bin/docker', 'exec', NGINX, 'nginx', '-t'])
        command(['/usr/bin/docker', 'exec', NGINX, 'nginx', '-s', 'reload'])
        raise RuntimeError('Проверка релиза не прошла. Предыдущий nginx-конфиг восстановлен; БД сохранена.')
    access.atomic_write(BASE/'settings.json', json.dumps(settings, indent=2)+'\n', 0o600)
    access.atomic_write(STATE/'release.json', json.dumps({'domain':DOMAIN, 'image':local_image, 'configDigest':args.image,
                        'archiveSha256':args.sha256, 'nginxConfig':str(file), 'nginxGateway':gateway,
                        'databaseBackup':str(backup), 'reviewEngine':'mock', 'mailEnabled':False}, indent=2)+'\n', 0o600)
    print('6/6: готово — https://'+DOMAIN, flush=True)
    print('Проверки: БД доступна, HTTPS исправен, каталог содержит 16 задач.')
    print('LLM/SMTP не подключены; ревью демонстрационное. Администратор ещё не создан.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        print('Остановка: '+str(error), file=sys.stderr, flush=True)
        sys.exit(1)
