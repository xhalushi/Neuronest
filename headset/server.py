"""Local-only demo server. No external dispatch or device integrations."""
import argparse
import json
import mimetypes
import os
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from simulation import Home

ROOT = Path(__file__).resolve().parents[1]
home = Home()
lock = threading.RLock()
eeg = None

def live_ready(mode):
    if not eeg:
        return False
    if mode == 'erp':
        return eeg.picture_ready()
    if mode == 'ssvep':
        return eeg.frequency_ready()
    return eeg.snapshot().get('state') == 'ready'


class LocalServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, data, status=200):
        payload = json.dumps(data, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Browser navigation can cancel a polling response.

    def allowed(self):
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        return host in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}') and (not origin or origin in (f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'))

    def do_GET(self):
        if not self.allowed():
            return self.reply(dict(error='Local access only'),403)
        path = urlsplit(self.path).path
        if path == '/api/state':
            with lock:
                return self.reply(home.snapshot())
        if path == '/api/eeg':
            return self.reply(eeg.snapshot() if eeg else dict(state='offline', sequence=0, powers={}, issues=[], error='Manual demo server. Restart with --live for Unicorn.', live=False))
        filename = (ROOT/'dist'/('index.html' if path=='/' else path.lstrip('/'))).resolve()
        if not filename.is_relative_to((ROOT/'dist').resolve()) or not filename.is_file():
            return self.reply(dict(error='File not found. Run npm run build first.'),404)
        payload = filename.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(filename)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def do_POST(self):
        if not self.allowed() or self.headers.get('Content-Type') != 'application/json':
            return self.reply(dict(error='Local JSON requests only'),403)
        try:
            size = int(self.headers.get('Content-Length','0'))
            if not 0 < size < 20000:
                raise ValueError('Invalid request size')
            packet = json.loads(self.rfile.read(size))
            if not isinstance(packet, dict):
                raise ValueError('Expected an object')
            path = urlsplit(self.path).path
            if path in ('/api/picture/mark', '/api/picture/epoch'):
                if eeg is None:
                    return self.reply(dict(error='Open Start Picture Test.cmd to use live EEG.'), 409)
                if path.endswith('/mark'):
                    marker, invalid = eeg.picture_marker()
                    return self.reply(dict(marker=marker, invalid=invalid))
                marker, invalid = packet.get('marker'), packet.get('invalid')
                if type(marker) is not int or type(invalid) is not int:
                    raise ValueError('Missing picture cue marker.')
                from picture import UnusableCue
                try:
                    values = eeg.picture_epoch(marker, invalid)
                except UnusableCue as error:
                    return self.reply(dict(error=str(error), code='unusable_cue'), 422)
                return self.reply(dict(features=values))
            with lock:
                home.tick()
                if path == '/api/session':
                    if packet.get('mode') in ('alpha', 'ssvep', 'erp'):
                        valid = live_ready(packet.get('mode'))
                        packet['ready'] = packet.get('ready') is True and valid
                    home.session_update(packet)
                    result = dict(ok=True)
                elif path == '/api/prepare':
                    result = home.prepare(packet)
                elif path == '/api/commit':
                    result = home.commit(packet)
                elif path == '/api/cancel':
                    home.pending.pop(packet.get('id'),None)
                    result = dict(ok=True)
                elif path == '/api/stop':
                    home.stop('bed','Stop control')
                    for target in home.devices:
                        if home.devices[target]['kind']=='blind':
                            home.stop(target,'Stop control')
                    home.pending.clear()
                    result = dict(ok=True)
                elif path == '/api/scenario':
                    home.scenario_action(packet)
                    result = dict(ok=True)
                elif path == '/api/request':
                    home.request_action(packet)
                    result = dict(ok=True)
                else:
                    return self.reply(dict(error='Unknown endpoint'),404)
            self.reply(result)
        except (ValueError, TypeError, KeyError) as error:
            self.reply(dict(error=str(error)),400)


def tick_forever():
    while True:
        with lock:
            if home.session and home.session['mode'] in ('alpha','ssvep','erp') and not live_ready(home.session['mode']):
                home.session['ready'] = False
                home.pending.clear()
                home.stop('bed','EEG unavailable')
            home.tick()
        time.sleep(.05)


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--live',action='store_true')
    parser.add_argument('--serial')
    parser.add_argument('--pictures', action='store_true', help='Open the isolated three-picture EEG test')
    parser.add_argument('--open',action='store_true',help='Open the local app once the server is listening')
    parser.add_argument('--port',type=int,default=8766)
    parser.add_argument('--max-span-uv', type=float, help='Live SSVEP peak-to-peak limit in microvolts (default 350)')
    args=parser.parse_args()
    if args.live:
        from unicorn import EEG
        try:
            eeg = EEG() if args.max_span_uv is None else EEG(args.max_span_uv)
        except ValueError as error:
            parser.error(str(error))
        print(f'SSVEP range limit: {eeg.max_span_uv:g} microvolts peak-to-peak.', flush=True)
    try:
        server=LocalServer(('127.0.0.1',args.port),Handler)
    except OSError as error:
        raise SystemExit(f'Cannot open local port {args.port}. Close the existing Neuronest server window and try again. ({error})')
    threading.Thread(target=server.serve_forever,daemon=True).start()
    threading.Thread(target=tick_forever,daemon=True).start()
    print(f'Neuronest: http://127.0.0.1:{args.port} · '+('LIVE UNICORN' if args.live else 'MANUAL DEMO'),flush=True)
    if args.open:
        import webbrowser
        webbrowser.open(f'http://127.0.0.1:{args.port}/' + ('?pictures' if args.pictures else ''))
    try:
        if args.live:
            from unicorn import run
            try:
                run(eeg,args.serial)
            except Exception as error:
                eeg.error=str(error)
                print('Headset unavailable: '+str(error),flush=True)
                print('Manual app remains available. Restart this server to retry the headset.',flush=True)
                while True: time.sleep(1)
        else:
            while True: time.sleep(1)
    except KeyboardInterrupt:
        server.shutdown()
