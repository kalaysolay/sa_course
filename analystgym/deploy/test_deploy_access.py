"""Проверки границы привилегий без root, Docker и изменений системы."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy_access', Path(__file__).with_name('deploy-access.py'))
access = importlib.util.module_from_spec(spec)
spec.loader.exec_module(access)


class AccessTest(unittest.TestCase):
    """Запрещаем способы изменить образ, команду или полномочия контейнера."""

    def config(self):
        """Минимальный одобренный образ имеет неизменяемый локальный ID."""
        return {'services': {'app': {'image': 'sha256:'+'a'*64}}}

    def test_image_must_be_immutable(self):
        """Подвижный тег не должен позволять замену одобренного образа."""
        config = self.config()
        access.validate(config, {'project': 'analystgym'})
        config['services']['app']['image'] = 'repo:latest'
        with self.assertRaises(RuntimeError):
            access.validate(config, {'project': 'analystgym'})

    def test_host_access_is_rejected(self):
        """Контейнер не получает Docker socket, привилегии и host namespace."""
        cases = [('privileged', True), ('build', {'context': '/tmp'}),
                 ('volumes', [{'type': 'bind', 'source': '/var/run/docker.sock'}]),
                 ('pid', 'host'), ('network_mode', 'container:other'),
                 ('env_file', ['/home/deploy/.env']), ('post_start', [{'command': 'x'}])]
        for key, value in cases:
            with self.subTest(key=key):
                config = self.config()
                config['services']['app'][key] = value
                with self.assertRaises(RuntimeError):
                    access.validate(config, {'project': 'analystgym'})

    def test_no_extra_arguments(self):
        """Нельзя передать произвольный путь, shell-команду или второй аргумент."""
        for argv in (['tool'], ['tool', 'deploy', '--file', '/tmp/x'],
                     ['tool', 'status;id'], ['tool', 'shell']):
            with self.subTest(argv=argv), patch.object(access.sys, 'argv', argv):
                with self.assertRaises(RuntimeError):
                    access.main()

    def test_untrusted_paths(self):
        """Чужой владелец, запись группы и симлинк отвергаются до запуска Docker."""
        for mode, uid in ((stat.S_IFREG | 0o664, 0), (stat.S_IFREG | 0o644, 1001),
                          (stat.S_IFLNK | 0o777, 0)):
            with patch.object(Path, 'lstat', return_value=SimpleNamespace(st_mode=mode, st_uid=uid)):
                with self.assertRaises(RuntimeError):
                    access.trusted('/etc/analystgym-deploy/compose.json')

    def test_clean_subprocess_environment(self):
        """Пользовательские DOCKER_HOST, PATH и COMPOSE_FILE не наследуются."""
        with patch.object(access.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='ok')) as call:
            access.run(['/usr/bin/docker', 'version'], True)
        self.assertEqual(call.call_args.kwargs['env'], access.ENV)
        self.assertNotIn('shell', call.call_args.kwargs)
        self.assertNotIn('COMPOSE_FILE', access.ENV)

    def test_dollar_values_are_literal(self):
        """Пароли с долларом в снимке не интерполируются повторно Compose."""
        original = {'services': {'app': {'environment': {'PASSWORD': 'a${X}$b'}}}}
        escaped = access.escape_values(original)
        self.assertEqual(escaped['services']['app']['environment']['PASSWORD'], 'a$${X}$$b')
        self.assertEqual(original['services']['app']['environment']['PASSWORD'], 'a${X}$b')

    def test_project_cannot_be_an_option(self):
        """Имя проекта не превращается в произвольные параметры Docker."""
        with self.assertRaises(RuntimeError):
            access.validate(self.config(), {'project': '--help'})

    def test_real_sudoers_parser(self):
        """Настоящий visudo проверяет синтаксис правила без изменения /etc."""
        if not Path('/usr/sbin/visudo').exists():
            self.skipTest('visudo отсутствует в этой среде')
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory) / 'sudoers'
            candidate.write_text(access.sudoers_rule(), encoding='utf-8')
            result = subprocess.run(['/usr/sbin/visudo', '-cf', str(candidate)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('*', access.sudoers_rule())
        self.assertNotIn('--install', access.sudoers_rule())


if __name__ == '__main__':
    unittest.main()
