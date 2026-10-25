#!/usr/bin/python3 -I
"""Ограниченный вход к операциям приложения; установка выполняется root один раз."""
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import syslog
import tempfile

BASE = Path('/etc/analystgym-deploy')
PROGRAM = Path('/usr/local/sbin/analystgym-deploy')
RULE = Path('/etc/sudoers.d/analystgym-deploy')
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
       'LANG': 'C.UTF-8', 'DOCKER_HOST': 'unix:///var/run/docker.sock',
       'DOCKER_CONFIG': '/root/.docker'}
ACTIONS = ('status', 'restart', 'deploy')


def fail(message):
    """Отказываем без вывода окружения, конфигурации и секретов."""
    raise RuntimeError(message)


def trusted(path):
    """Проверяем владельца и отсутствие ссылок/права записи у группы и остальных."""
    path = Path(path)
    for item in (path, *path.parents):
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            fail('Небезопасные права или ссылка: ' + str(item))


def run(args, capture=False):
    """Запускаем фиксированную команду с чистым окружением и без shell."""
    result = subprocess.run(args, env=ENV, cwd='/', stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE, text=True)
    if result.returncode:
        # stderr Docker может содержать параметры с секретами — не публикуем его.
        fail('Команда не выполнена (код %s): %s' % (result.returncode, args[0]))
    return result.stdout if capture else ''


def atomic_write(path, content, mode):
    """Устанавливаем root-файл атомарной заменой, без перехода по ссылке назначения."""
    trusted(path.parent)
    fd, temporary = tempfile.mkstemp(prefix='.install-', dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
            stream.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def escape_values(value):
    """Исключаем повторную интерполяцию долларов в уже разрешённом Compose-снимке."""
    if isinstance(value, str):
        return value.replace('$', '$$')
    if isinstance(value, dict):
        return {key: escape_values(item) for key, item in value.items()}
    if isinstance(value, list):
        return [escape_values(item) for item in value]
    return value


def validate(config, settings):
    """Не разрешаем выбирать другой проект, образ по тегу или host-доступ из app."""
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', settings['project']):
        fail('Некорректное имя Compose-проекта')
    app = config['services']['app']
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', app.get('image', '')):
        fail('Образ app должен быть локальным неизменяемым Image ID sha256')
    for key in ('build', 'privileged', 'devices', 'device_cgroup_rules', 'cap_add',
                'volumes_from', 'use_api_socket', 'develop', 'post_start', 'pre_stop',
                'provider', 'env_file', 'extends', 'credential_spec'):
        if app.get(key):
            fail('Не разрешено в ограниченном app: ' + key)
    for key in ('network_mode', 'pid', 'ipc', 'uts', 'userns_mode'):
        if app.get(key) == 'host' or str(app.get(key, '')).startswith('container:'):
            fail('Общий host/container namespace не разрешён: ' + key)
    for volume in app.get('volumes', []):
        if not isinstance(volume, dict) or volume.get('type') != 'volume':
            fail('Bind/tmpfs-монтирование app требует отдельной проверки root')
    if app.get('configs') or app.get('secrets'):
        fail('Файловые configs/secrets app требуют отдельной проверки root')
    if config.get('include'):
        fail('Вложенный include не разрешён')


def compose(settings):
    """Фиксируем проект, конфигурацию, сокет и отсутствие внешнего env-файла."""
    return ['/usr/bin/docker', 'compose', '--ansi', 'never',
            '--env-file', '/dev/null', '--project-directory', str(BASE),
            '-p', settings['project'], '-f', str(BASE / 'compose.json')]


def discover():
    """Находим единственное уже существующее Compose-приложение с сервисом app."""
    ids = run(['/usr/bin/docker', 'ps', '-aq',
               '--filter', 'label=com.docker.compose.service=app'], True).split()
    if not ids:
        return None
    containers = json.loads(run(['/usr/bin/docker', 'inspect', *ids], True))
    projects = {}
    for container in containers:
        labels = container['Config'].get('Labels') or {}
        if labels.get('com.docker.compose.oneoff', '').lower() == 'true':
            continue
        project = labels.get('com.docker.compose.project')
        if project:
            projects[project] = container
    if len(projects) != 1:
        fail('Найдено несколько Compose-проектов; нужна ручная настройка root')
    if not projects:
        return None
    project, container = next(iter(projects.items()))
    labels = container['Config']['Labels']
    work = Path(labels['com.docker.compose.project.working_dir'])
    files = [Path(value) for value in labels['com.docker.compose.project.config_files'].split(',')]
    trusted(work)
    args = ['/usr/bin/docker', 'compose', '--project-directory', str(work), '-p', project]
    # Не используем изменяемое окружение deploy, автозагрузку .env и Compose override.
    env_file = next((p for p in (files[0].parent / '.env', work / '.env') if p.is_file()), None)
    args.extend(['--env-file', str(env_file) if env_file else '/dev/null'])
    if env_file:
        trusted(env_file)
    for file in files:
        trusted(file)
        args.extend(['-f', str(file)])
    config = json.loads(run([*args, 'config', '--format', 'json'], True))
    if not {'app', 'postgres'}.issubset(config.get('services', {})):
        fail('Проект не похож на AnalystGym (нужны app и postgres)')
    app = config['services']['app']
    app.pop('build', None)
    app['image'] = container['Image']
    app['pull_policy'] = 'never'
    settings = {'project': project, 'sourceDirectory': str(work),
                'approval': 'running-image-at-install', 'service': 'app'}
    validate(config, settings)
    return config, settings


def install():
    """Root фиксирует текущий образ/конфигурацию и выдаёт три точных sudo-команды."""
    import pwd
    trusted(Path(__file__))
    pwd.getpwnam('deploy')
    for directory in (BASE.parent, PROGRAM.parent, RULE.parent):
        trusted(directory)
    if BASE.exists():
        trusted(BASE)
        fail('Настройка уже существует; повторная установка требует проверки root')
    discovered = discover()
    BASE.mkdir(mode=0o700)
    trusted(BASE)
    if discovered:
        config, settings = discovered
        atomic_write(BASE / 'compose.json', json.dumps(escape_values(config), indent=2)+'\n', 0o600)
        atomic_write(BASE / 'settings.json', json.dumps(settings, indent=2)+'\n', 0o600)
        run([*compose(settings), 'config', '--quiet'], True)
    else:
        print('Compose-app пока не найден. Устанавливается доступ без активного релиза.')
    atomic_write(PROGRAM, Path(__file__).read_text(encoding='utf-8'), 0o755)
    rule = sudoers_rule()
    candidate = BASE / 'sudoers.candidate'
    atomic_write(candidate, rule, 0o600)
    run(['/usr/sbin/visudo', '-cf', str(candidate)], True)
    if RULE.exists() or RULE.is_symlink():
        fail('Файл sudoers уже существует; не перезаписываем')
    atomic_write(RULE, rule, 0o440)
    try:
        run(['/usr/sbin/visudo', '-cf', '/etc/sudoers'], True)
    except RuntimeError:
        RULE.unlink()
        raise
    print('Установлено. Контейнеры, группы пользователя и sshd не изменялись.')
    print('Разрешены только: sudo -n analystgym-deploy status|restart|deploy')
    if discovered:
        print('Проект: '+settings['project']+'. Одобрен текущий локальный Image ID.')


def sudoers_rule():
    """Строка аргументов в sudoers совпадает целиком, без wildcard и SETENV."""
    commands = ', '.join(str(PROGRAM)+' '+action for action in ACTIONS)
    return ('Defaults!'+str(PROGRAM)+' env_reset, !setenv\n'
            + 'deploy ALL=(root) NOPASSWD: NOSETENV: '+commands+'\n')


def operate(action):
    """Разрешаем только фиксированные действия; аргументы не передаются Docker."""
    trusted(PROGRAM)
    trusted(BASE)
    if not (BASE / 'settings.json').exists():
        if action == 'status':
            print('Доступ установлен. Compose-проект и образ ещё не утверждены root.')
            return
        fail('Нет одобренного релиза. Требуется настройка root.')
    for file in ('settings.json', 'compose.json'):
        trusted(BASE / file)
    settings = json.loads((BASE / 'settings.json').read_text())
    config = json.loads((BASE / 'compose.json').read_text())
    validate(config, settings)
    # Один файл сериализует restart/deploy; deploy не выбирает имя/путь блокировки.
    lock = os.open(BASE / 'operation.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        syslog.openlog('analystgym-deploy', facility=syslog.LOG_AUTHPRIV)
        actor = os.environ.get('SUDO_USER', 'root')
        syslog.syslog('start action=%s actor=%s project=%s' % (action, actor, settings['project']))
        prefix = compose(settings)
        if action == 'status':
            run([*prefix, 'ps', '--all'])
        elif action == 'restart':
            run([*prefix, 'restart', '--no-deps', 'app'])
        else:
            run([*prefix, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'app'])
        syslog.syslog('finish action=%s actor=%s result=ok' % (action, actor))
    finally:
        os.close(lock)


def main():
    """Запуск через изолированный Python не загружает код из home deploy."""
    if len(sys.argv) != 2 or sys.argv[1] not in (*ACTIONS, '--install'):
        fail('Разрешён ровно один аргумент: status, restart или deploy')
    if os.geteuid() != 0:
        fail('Используйте точную разрешённую команду через sudo -n')
    if sys.argv[1] == '--install':
        install()
    else:
        operate(sys.argv[1])


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        syslog.openlog('analystgym-deploy', facility=syslog.LOG_AUTHPRIV)
        syslog.syslog(syslog.LOG_ERR, 'failure: '+str(error))
        print('Отказ: '+str(error), file=sys.stderr)
        sys.exit(1)
