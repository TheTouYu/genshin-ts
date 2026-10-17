#!/usr/bin/env python3
"""最小 GTK3 沙箱应用：给通用 GUI 能力层做 G1 验证（自有一切，不碰用户的 App）。"""
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib

class App(Gtk.Window):
    def __init__(self):
        super().__init__(title='GUI-SANDBOX')
        self.set_default_size(420, 220)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        box.set_border_width(16)
        self.label = Gtk.Label(label='当前: 无')
        self.label.set_name('status-label')
        box.pack_start(self.label, False, False, 0)
        row = Gtk.Box(spacing=8)
        for name in ('红色', '绿色', '蓝色'):
            b = Gtk.Button(label=name)
            b.set_name(f'btn-{name}')
            b.connect('clicked', self.on_click, name)
            row.pack_start(b, True, True, 0)
        box.pack_start(row, False, False, 0)
        self.add(box)
        self.connect('destroy', Gtk.main_quit)

    def on_click(self, _b, name):
        print(f'[click] {name}', flush=True)
        self.label.set_text(f'当前: {name}')

if __name__ == '__main__':
    App().show_all()
    Gtk.main()
