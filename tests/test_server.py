import importlib.util
import pathlib
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer

spec = importlib.util.spec_from_file_location('tkgtm_server', pathlib.Path(__file__).parents[1] / 'app.py')
assert spec is not None and spec.loader is not None
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)

class ShellTest(unittest.TestCase):
    def test_views_script_is_served_by_local_app(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{server.server_port}/views.js') as response:
                self.assertEqual(response.status, 200)
                self.assertIn(b'function setupViews', response.read())
        finally:
            server.shutdown()
            server.server_close()

if __name__ == '__main__':
    unittest.main()
