"""Проверяем включение LLM без VPS, настоящих ключей и платных запросов."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('enable_llm', Path(__file__).with_name('enable-llm.py'))
enable = importlib.util.module_from_spec(spec)
spec.loader.exec_module(enable)


class EnableLlmTest(unittest.TestCase):
    """Сохраняем рабочее окружение и не отправляем ключ на чужой адрес."""

    def test_only_review_settings_change(self):
        """Включение не меняет образ, БД и другие секреты; mock исключён из маршрутов."""
        original = {'services': {'app': {'image': 'sha256:fixed', 'environment': {
            'APP_DB_PASSWORD': 'unchanged', 'REVIEW_ENGINE': 'mock', 'REVIEW_LLM_FALLBACK': 'mock-llm'}}}}
        changed = enable.configured(original, 'synthetic-$-key')
        env = changed['services']['app']['environment']
        self.assertEqual(env['REVIEW_ENGINE'], 'llm')
        self.assertEqual(env['REVIEW_LLM_PRIMARY'], 'deepseek')
        self.assertEqual(env['REVIEW_LLM_FALLBACK'], 'deepseek')
        self.assertEqual(env['DEEPSEEK_API_KEY'], 'synthetic-$$-key')
        self.assertEqual(env['APP_DB_PASSWORD'], 'unchanged')
        self.assertEqual(changed['services']['app']['image'], 'sha256:fixed')
        self.assertEqual(original['services']['app']['environment']['REVIEW_ENGINE'], 'mock')

    def test_invalid_keys_stop_before_network(self):
        """Пустые ключи и случайный пробел не создают заведомо неработающий режим."""
        for key in ('', 'two words', 'line\nbreak'):
            with self.assertRaises(RuntimeError):
                enable.configured({}, key)

    def test_untrusted_address_never_receives_key(self):
        """Даже изменённая запись провайдера не может отправить ключ на другой домен."""
        provider = {'enabled': True, 'key_env': 'DEEPSEEK_API_KEY',
                    'base_url': 'https://example.invalid', 'model': 'deepseek-chat'}
        with patch.object(enable.urllib.request, 'urlopen') as network:
            with self.assertRaises(RuntimeError):
                enable.check_provider(provider, 'synthetic-key')
            network.assert_not_called()

    def test_real_http_shape_and_secret_redaction(self):
        """Запрос идёт в chat/completions; текст ошибки API с ключом не попадает в сообщение."""
        provider = {'enabled': True, 'key_env': 'DEEPSEEK_API_KEY',
                    'base_url': 'https://api.deepseek.com/v1', 'model': 'deepseek-chat'}
        reply = io.BytesIO(json.dumps({'choices': [{}], 'model': 'deepseek-chat',
                                      'usage': {'total_tokens': 12}}).encode())
        with patch.object(enable.urllib.request, 'urlopen', return_value=reply) as network:
            with contextlib.redirect_stdout(io.StringIO()) as output:
                enable.check_provider(provider, 'synthetic-key')
            request = network.call_args.args[0]
            self.assertEqual(request.full_url, 'https://api.deepseek.com/v1/chat/completions')
            self.assertEqual(request.get_method(), 'POST')
            self.assertEqual(json.loads(request.data)['max_tokens'], 32)
            self.assertNotIn('synthetic-key', output.getvalue())
        error = urllib.error.HTTPError('https://api.deepseek.com', 402, 'synthetic-key', {}, None)
        with patch.object(enable.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaises(RuntimeError) as failure:
                enable.check_provider(provider, 'synthetic-key')
            self.assertIn('402', str(failure.exception))
            self.assertNotIn('synthetic-key', str(failure.exception))


if __name__ == '__main__':
    unittest.main()
