"""Проверяем безопасное изменение nginx и изоляцию БД без запуска релиза."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('first_release', Path(__file__).with_name('first-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class FirstReleaseTest(unittest.TestCase):
    """Сохраняем TLS/ACME и не меняем чужой виртуальный хост."""

    def test_replace_only_target_location(self):
        """Вложенные блоки и комментарии не должны сдвигать границы замены."""
        before = '''# comment { }
server { listen 443 ssl; server_name analystgym.pro;
ssl_certificate /cert/fullchain.pem;
location / { root /var/www; if ($x) { return 404; } }
location /.well-known/acme-challenge/ { root /challenge; }
}
server { listen 443 ssl; server_name nginx84006.hostkey.in; location / { return 200 "ok{}"; } }
'''
        after = release.patch_site(before, '172.18.0.1')
        self.assertIn('proxy_pass http://172.18.0.1:18080;', after)
        self.assertIn('ssl_certificate /cert/fullchain.pem;', after)
        self.assertIn('location /.well-known/acme-challenge/ { root /challenge; }', after)
        self.assertIn('server_name nginx84006.hostkey.in; location / { return 200 "ok{}"; }', after)
        self.assertNotIn('root /var/www', after)

    def test_append_location_when_absent(self):
        """Пустой TLS server получает root location внутри собственного блока."""
        after = release.patch_site('server { listen [::]:443 ssl; server_name analystgym.pro; }', '172.18.0.1')
        self.assertIn('proxy_set_header X-Forwarded-Proto $scheme;', after)
        release.nginx_nodes(after)

    def test_different_domain_unchanged(self):
        """Общий nginx хостинга не должен быть изменён."""
        self.assertIsNone(release.patch_site('server { listen 443 ssl; server_name other.example; }', '172.18.0.1'))

    def test_ambiguous_or_custom_routing_rejected(self):
        """Не выбираем наугад server и не сохраняем несовместимый старый API-route."""
        site = 'server { listen 443 ssl; server_name analystgym.pro; }'
        with self.assertRaises(RuntimeError):
            release.patch_site(site+site, '172.18.0.1')
        with self.assertRaises(RuntimeError):
            release.patch_site(site[:-1]+'location /api { return 200; }}', '172.18.0.1')

    def test_incomplete_config_rejected(self):
        """Обрезанный конфиг не записываем поверх работающего файла."""
        with self.assertRaises(RuntimeError):
            release.patch_site('server { listen 443 ssl;', '172.18.0.1')

    def test_database_not_published(self):
        """SQL-порт не публикуется, app принимает HTTP только на выбранных IP."""
        config = release.build_config('sha256:'+'a'*64, '172.18.0.1', 'db', 'jwt', 'webhook')
        self.assertNotIn('ports', config['services']['postgres'])
        self.assertTrue(config['networks']['backend']['internal'])
        self.assertEqual(config['services']['app']['ports'], ['127.0.0.1:18080:8080', '172.18.0.1:18080:8080'])
        self.assertNotIn('build', config['services']['app'])


if __name__ == '__main__':
    unittest.main()
