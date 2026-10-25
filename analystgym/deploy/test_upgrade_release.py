"""Проверяем выпуск и seed в изолированных каталогах, без Docker/root/сети."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('upgrade', Path(__file__).with_name('upgrade-release.py'))
upgrade = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upgrade)


class UpgradeTest(unittest.TestCase):
    """Сохраняем секреты и работающий образ при отказе; seed получает только ожидаемые поля."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.base = self.root/'etc'
        self.base.mkdir()
        self.releases = self.root/'releases'
        self.releases.mkdir()
        self.old = {'services': {'app': {'image': 'sha256:'+'a'*64,
                        'environment': {'DEEPSEEK_API_KEY': 'existing-$$-key', 'APP_DB_PASSWORD': 'db-secret'}}}}
        (self.base/'compose.json').write_text(json.dumps(self.old))
        (self.base/'settings.json').write_text('{"project":"analystgym"}')
        self.archive = self.root/'image.tar'
        blob = b'{"architecture":"amd64"}'
        self.config_digest = 'sha256:'+hashlib.sha256(blob).hexdigest()
        with tarfile.open(self.archive, 'w') as archive:
            self.add_member(archive, 'config.json', blob)
            self.add_member(archive, 'manifest.json', json.dumps([
                {'Config': 'config.json', 'RepoTags': ['analystgym-app:test']}]).encode())
        self.digest = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.inputs = []
        self.calls = []

    def tearDown(self):
        self.temporary.cleanup()

    @staticmethod
    def add_member(archive, name, data):
        """Тестовый tar содержит только метаданные, не исполняемый образ."""
        member = tarfile.TarInfo(name)
        member.size = len(data)
        archive.addfile(member, io.BytesIO(data))

    @staticmethod
    def write(file, content, mode):
        """Повторяем запись файла с проверяемыми правами без /etc."""
        file.write_text(content, encoding='utf-8')
        os.chmod(file, mode)

    def run_command(self, args, data=None, output=None):
        """Эмулируем только ожидаемые команды релиза и секретный stdin seed."""
        self.calls.append(args)
        if 'inspect' in args:
            return json.dumps([{'Id': 'sha256:'+'b'*64}]).encode()
        if 'pg_dump' in args:
            output.write(b'test-database-backup')
            return None
        if '--bootstrap-staff' in args:
            accounts = json.loads(data)
            self.inputs.append(accounts)
            for account in accounts:
                self.assertEqual(set(account), {'email', 'name', 'role', 'password'})
            return json.dumps([{'email': a['email'], 'role': a['role'],
                                'status': 'created', 'passwordMatches': True} for a in accounts]).encode()
        return b''

    def execute(self, label='test-one', fail_health=False, digest=None):
        """Root/HTTPS/gateway заменены тестовыми двойниками; файлы остаются реальными."""
        access = SimpleNamespace(trusted=lambda p: None, validate=lambda c, s: None,
                                 atomic_write=self.write, compose=lambda s: ['docker', 'compose'])
        loader = SimpleNamespace(load_module=lambda: access)
        arguments = ['tool', '--archive', str(self.archive), '--sha256', digest or self.digest,
                     '--config-digest', self.config_digest, '--release', label]
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(upgrade, 'BASE', self.base))
            stack.enter_context(patch.object(upgrade, 'RELEASES', self.releases))
            stack.enter_context(patch.object(upgrade.os, 'geteuid', return_value=0))
            stack.enter_context(patch.object(upgrade.sys, 'argv', arguments))
            stack.enter_context(patch.object(upgrade.importlib.machinery, 'SourceFileLoader', return_value=loader))
            stack.enter_context(patch.object(upgrade, 'run', side_effect=self.run_command))
            stack.enter_context(patch.object(upgrade, 'health', side_effect=RuntimeError('health failed') if fail_health else None))
            stack.enter_context(patch.object(upgrade.urllib.request, 'urlopen', return_value=io.BytesIO(b'<section class="hub-coming-soon">Soon</section>')))
            output = stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            upgrade.main()
            return output.getvalue()

    def test_release_preserves_secrets_and_uses_private_password_file(self):
        """Меняется только image; файл паролей закрыт и пароли не печатаются."""
        output = self.execute()
        actual = json.loads((self.base/'compose.json').read_text())
        self.assertEqual(actual['services']['app']['environment'], self.old['services']['app']['environment'])
        self.assertEqual(actual['services']['app']['image'], 'sha256:'+'b'*64)
        credentials = self.base/'staff-credentials.json'
        self.assertEqual(credentials.stat().st_mode & 0o777, 0o600)
        accounts = json.loads(credentials.read_text())['accounts']
        self.assertEqual(len({a['password'] for a in accounts}), 4)
        for account in accounts:
            self.assertNotIn(account['password'], output)
        self.assertTrue((self.releases/'test-one'/'database.dump').read_bytes())

    def test_unhealthy_image_restores_original_before_seed(self):
        """При неготовности возвращаем прежнюю конфигурацию и не создаём аккаунты."""
        with self.assertRaises(RuntimeError):
            self.execute(fail_health=True)
        self.assertEqual(json.loads((self.base/'compose.json').read_text()), self.old)
        self.assertEqual(self.inputs, [])

    def test_bad_archive_never_runs_docker(self):
        """Неверный SHA останавливает выпуск до загрузки/замены образа."""
        with self.assertRaises(RuntimeError):
            self.execute(digest='0'*64)
        self.assertEqual(self.calls, [])
        self.assertEqual(json.loads((self.base/'compose.json').read_text()), self.old)

    def test_next_release_reuses_credentials_without_result_fields_in_input(self):
        """Повторный выпуск не генерирует новые пароли и не отправляет status в Java record."""
        self.execute()
        original = self.inputs[0]
        self.execute(label='test-two')
        self.assertEqual(self.inputs[1], original)


if __name__ == '__main__':
    unittest.main()
