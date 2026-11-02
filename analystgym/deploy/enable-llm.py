#!/usr/bin/python3 -I
"""Включение настоящего DeepSeek на установленном VPS; запускается только root."""
import copy
import getpass
import importlib.machinery
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request

BASE = Path('/etc/analystgym-deploy')


def configured(config, key):
    """Меняем только параметры ревью, сохраняя образ и остальные секреты."""
    if not key or any(char.isspace() for char in key):
        raise RuntimeError('Нужен непустой API-ключ без пробельных символов')
    updated = copy.deepcopy(config)
    env = updated['services']['app']['environment']
    env.update(REVIEW_ENGINE='llm', REVIEW_LLM_PRIMARY='deepseek',
               REVIEW_LLM_FALLBACK='deepseek', DEEPSEEK_API_KEY=key.replace('$', '$$'))
    return updated


def check_provider(provider, key):
    """Короткий настоящий вызов проверяет ключ, баланс и выбранную модель без учебных данных."""
    if not provider or not provider['enabled'] or provider['key_env'] != 'DEEPSEEK_API_KEY':
        raise RuntimeError('Провайдер deepseek должен быть включён с key_env=DEEPSEEK_API_KEY')
    base = provider['base_url'].rstrip('/')
    if base not in ('https://api.deepseek.com', 'https://api.deepseek.com/v1'):
        raise RuntimeError('Ожидается официальный HTTPS-адрес DeepSeek; настройки не изменены')
    body = json.dumps({'model': provider['model'], 'max_tokens': 32,
                       'messages': [{'role': 'user', 'content': 'Reply with the single word OK.'}]}).encode()
    request = urllib.request.Request(base+'/chat/completions', data=body,
        headers={'Authorization': 'Bearer '+key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
        if not result.get('choices'):
            raise RuntimeError('DeepSeek вернул ответ без choices')
        print('DeepSeek ответил: модель '+str(result.get('model', provider['model']))+
              ', токенов '+str(result.get('usage', {}).get('total_tokens', 'не указано')), flush=True)
    except urllib.error.HTTPError as error:
        raise RuntimeError('DeepSeek отклонил проверку: HTTP '+str(error.code)+
                           '. Проверьте ключ, баланс и модель. Настройки не изменены.') from None
    except (OSError, ValueError):
        raise RuntimeError('Не удалось получить корректный ответ DeepSeek; настройки не изменены') from None


def health():
    """Ждём приложение и БД через публичный HTTPS, не отключая проверку сертификата."""
    for _ in range(30):
        try:
            with urllib.request.urlopen('https://analystgym.pro/actuator/health', timeout=5) as response:
                if response.status == 200 and json.load(response).get('status') == 'UP':
                    return
        except (OSError, ValueError):
            pass
        time.sleep(2)
    raise RuntimeError('Приложение не прошло проверку здоровья')


def main():
    """Проверяем провайдера до изменения окружения; при ошибке возвращаем прежнюю конфигурацию."""
    if os.geteuid() != 0:
        raise RuntimeError('Команда выполняется под root')
    import fcntl
    access = importlib.machinery.SourceFileLoader('access', '/usr/local/sbin/analystgym-deploy').load_module()
    for path in (Path(__file__), BASE/'compose.json', BASE/'settings.json'):
        access.trusted(path)
    lock = os.open(BASE/'operation.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        original = (BASE/'compose.json').read_text(encoding='utf-8')
        config = json.loads(original)
        settings = json.loads((BASE/'settings.json').read_text(encoding='utf-8'))
        access.validate(config, settings)
        prefix = access.compose(settings)
        query = "SELECT row_to_json(p) FROM providers p WHERE id='deepseek';"
        provider = json.loads(access.run([*prefix, 'exec', '-T', 'postgres', 'psql', '-XAt',
            '-U', 'analystgym', '-d', 'analystgym', '-c', query], True) or 'null')
        key = getpass.getpass('API-ключ DeepSeek (ввод скрыт): ').strip()
        updated = configured(config, key)
        print('Проверяю настоящий запрос к DeepSeek...', flush=True)
        check_provider(provider, key)
        access.validate(updated, settings)
        backup = BASE/('compose.before-llm-'+time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())+'.json')
        if backup.exists():
            raise RuntimeError('Резервная копия уже существует; повторите через секунду')
        access.atomic_write(backup, original, 0o600)
        print('Резервная копия: '+str(backup), flush=True)
        try:
            access.atomic_write(BASE/'compose.json', json.dumps(updated, ensure_ascii=False, indent=2)+'\n', 0o600)
            access.run([*prefix, 'config', '--quiet'])
            access.run([*prefix, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'app'])
            access.run([*prefix, 'exec', '-T', 'app', 'sh', '-c',
                        'test "$REVIEW_ENGINE" = llm && test -n "$DEEPSEEK_API_KEY"'])
            health()
        except BaseException:
            access.atomic_write(BASE/'compose.json', original, 0o600)
            access.run([*prefix, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'app'])
            raise
        print('LLM включена для НОВЫХ отправок. Старые попытки не пересчитываются.', flush=True)
        print('Отправьте решение на сайте ещё раз: проверим журнал реального ревью.', flush=True)
    finally:
        os.close(lock)


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        # Наши RuntimeError и gateway содержат только безопасное описание отказа.
        print('Отказ: '+str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError):
        # Никаких repr/traceback: ошибки библиотек могут содержать параметры с секретами.
        print('Включение не завершено. Проверьте статус приложения; ключ и настройки не выводятся.', file=sys.stderr)
        sys.exit(1)
