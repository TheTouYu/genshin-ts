#!/usr/bin/env python3
"""hmlt-qixia demo 静态服务器（禁缓存版）。

用法：python3 prototype/serve.py   → http://127.0.0.1:8792/prototype/

为什么不用 `python3 -m http.server 8792`：它不发 Cache-Control，浏览器对
index.html 走启发式缓存，迭代期用户刷新拿到旧版 JS（2026-10-12 键盘修复
v2→v3 被「假不行」掩盖的根因之一）。本服务器全部响应带 no-store。

2026-10-12 CDP 端到端验证（chromium headless + Colemak 语义键派发，
物理 code + Colemak 字母）：J确认/D右/A左/W上/S下/J开火/K放宝 7/7 全绿。
"""
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoStoreHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    root = __file__.rsplit('/prototype/', 1)[0]
    import os
    os.chdir(root)
    print('serving (no-store) http://127.0.0.1:8792/prototype/ from', root)
    HTTPServer(('127.0.0.1', 8792), NoStoreHandler).serve_forever()
