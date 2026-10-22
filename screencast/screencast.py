#!/usr/bin/env python3
"""Mirror this computer's screen to a TV on the local network.

Works with any DLNA/UPnP "MediaRenderer" TV (Samsung, LG, Sony, Philips, Hisense,
most smart TVs and many streaming boxes). Chromecast devices work if the optional
`pychromecast` package is installed. If neither fits, the script prints a URL you
can open in the TV's web browser.

Requires: Python 3.8+ and ffmpeg on PATH. No other dependencies.

    python3 screencast.py list              # find TVs, nearest first
    python3 screencast.py cast              # mirror to the nearest TV
    python3 screencast.py cast --tv "Living" # pick by (part of) name
    python3 screencast.py cast --url-only   # just serve the stream, no TV control
"""
import argparse
import http.server
import queue
import platform
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
from urllib.parse import urljoin, urlparse

SSDP_ADDR = ("239.255.255.250", 1900)
AVT = "urn:schemas-upnp-org:service:AVTransport:1"


# ---------------------------------------------------------------- discovery

class Tv:
    def __init__(self, name, host, rtt, kind, control=None):
        self.name, self.host, self.rtt, self.kind, self.control = name, host, rtt, kind, control

    def __str__(self):
        return f"{self.name}  [{self.kind}] {self.host}  ({self.rtt * 1000:.0f} ms)"


def _local_ip_for(host):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((host, 9))
        return s.getsockname()[0]
    finally:
        s.close()


def _fetch_dlna(location, rtt):
    try:
        with urllib.request.urlopen(location, timeout=3) as r:
            root = ET.fromstring(r.read())
    except Exception:
        return None
    ns = {"d": "urn:schemas-upnp-org:device-1-0"}
    name = root.findtext(".//d:device/d:friendlyName", default="Unknown TV", namespaces=ns)
    for svc in root.iterfind(".//d:service", ns):
        if svc.findtext("d:serviceType", namespaces=ns) == AVT:
            ctrl = urljoin(location, svc.findtext("d:controlURL", namespaces=ns))
            return Tv(name, urlparse(location).hostname, rtt, "DLNA", ctrl)
    return None


def discover_dlna(timeout=3.0):
    msg = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\n"
           f'MAN: "ssdp:discover"\r\nMX: 2\r\nST: {AVT}\r\n\r\n').encode()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 4)
    sock.settimeout(0.5)
    start = time.time()
    sock.sendto(msg, SSDP_ADDR)
    found = {}
    while time.time() - start < timeout:
        try:
            data, addr = sock.recvfrom(4096)
        except socket.timeout:
            continue
        m = re.search(rb"(?im)^location:\s*(\S+)", data)
        if m and addr[0] not in found:
            found[addr[0]] = (m.group(1).decode(), time.time() - start)
    sock.close()
    tvs = [_fetch_dlna(loc, rtt) for loc, rtt in found.values()]
    return [t for t in tvs if t]


def discover_chromecast(timeout=3.0):
    try:
        import pychromecast
    except ImportError:
        return []
    try:
        casts, browser = pychromecast.get_chromecasts(timeout=timeout)
        browser.stop_discovery()
    except Exception:
        return []
    out = []
    for c in casts:
        host = c.cast_info.host
        t0 = time.time()
        try:
            socket.create_connection((host, c.cast_info.port), timeout=2).close()
        except OSError:
            pass
        tv = Tv(c.cast_info.friendly_name, host, time.time() - t0, "Chromecast")
        tv.cast = c
        out.append(tv)
    return out


def discover():
    tvs = discover_dlna() + discover_chromecast()
    return sorted(tvs, key=lambda t: t.rtt)  # lowest network latency ~ "nearest"


# ---------------------------------------------------------------- capture

def capture_args(fps, size):
    sysname = platform.system()
    if sysname == "Linux":
        import os
        if os.environ.get("WAYLAND_DISPLAY") and not os.environ.get("DISPLAY"):
            sys.exit("Pure Wayland session: ffmpeg cannot capture it directly. Run under "
                     "XWayland/X11, or use a pipewire-capable capture and adapt capture_args().")
        disp = os.environ.get("DISPLAY", ":0")
        a = ["-f", "x11grab", "-framerate", str(fps)]
        if size:
            a += ["-video_size", size]
        return a + ["-i", disp]
    if sysname == "Windows":
        return ["-f", "gdigrab", "-framerate", str(fps), "-i", "desktop"]
    if sysname == "Darwin":
        return ["-f", "avfoundation", "-framerate", str(fps), "-capture_cursor", "1", "-i", "1:none"]
    sys.exit(f"Unsupported platform for screen capture: {sysname}")


def start_ffmpeg(fps, size, bitrate, scale):
    cmd = ["ffmpeg", "-loglevel", "error", *capture_args(fps, size),
           "-vf", f"scale={scale}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p",
           "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
           "-profile:v", "main", "-g", str(fps * 2), "-b:v", bitrate,
           "-maxrate", bitrate, "-bufsize", bitrate,
           "-f", "mpegts", "-mpegts_flags", "+resend_headers", "-muxdelay", "0", "-"]
    return subprocess.Popen(cmd, stdout=subprocess.PIPE)


# ---------------------------------------------------------------- stream server

class Broadcaster:
    """Reads ffmpeg output once and fans it out to every connected client."""

    def __init__(self, proc):
        self.proc, self.clients, self.lock = proc, set(), threading.Lock()
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self):
        while True:
            chunk = self.proc.stdout.read(188 * 87)  # whole TS packets only
            if not chunk:
                break
            with self.lock:
                for q in self.clients:
                    try:
                        q.put_nowait(chunk)
                    except queue.Full:
                        pass


def make_handler(bc):
    class H(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.0"

        def log_message(self, *a):
            pass

        def do_HEAD(self):
            self._headers()

        def _headers(self):
            self.send_response(200)
            self.send_header("Content-Type", "video/mpeg")
            self.send_header("transferMode.dlna.org", "Streaming")
            self.send_header("contentFeatures.dlna.org", "DLNA.ORG_OP=00;DLNA.ORG_CI=0")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

        def do_GET(self):
            self._headers()
            q = queue.Queue(maxsize=256)  # slow TV -> drop chunks instead of buffering forever
            with bc.lock:
                bc.clients.add(q)
            try:
                while bc.proc.poll() is None:
                    try:
                        self.wfile.write(q.get(timeout=1))
                    except queue.Empty:
                        pass
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                with bc.lock:
                    bc.clients.discard(q)

    return H


def serve(bc, port):
    handler = make_handler(bc)
    class Server(http.server.ThreadingHTTPServer):
        daemon_threads = True

    srv = Server(("0.0.0.0", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# ---------------------------------------------------------------- TV control

def _soap(control, action, body):
    env = ('<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
           's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>'
           f'<u:{action} xmlns:u="{AVT}">{body}</u:{action}></s:Body></s:Envelope>').encode()
    req = urllib.request.Request(control, env, {
        "Content-Type": 'text/xml; charset="utf-8"', "SOAPACTION": f'"{AVT}#{action}"'})
    urllib.request.urlopen(req, timeout=5).read()


def dlna_play(tv, url):
    from xml.sax.saxutils import escape
    didl = ('<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">'
            '<item id="0" parentID="0" restricted="1"><dc:title>Screen Mirror</dc:title>'
            '<upnp:class>object.item.videoItem</upnp:class>'
            f'<res protocolInfo="http-get:*:video/mpeg:*">{escape(url)}</res></item></DIDL-Lite>')
    _soap(tv.control, "SetAVTransportURI",
          f"<InstanceID>0</InstanceID><CurrentURI>{escape(url)}</CurrentURI>"
          f"<CurrentURIMetaData>{escape(didl)}</CurrentURIMetaData>")
    _soap(tv.control, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>")


def dlna_stop(tv):
    try:
        _soap(tv.control, "Stop", "<InstanceID>0</InstanceID>")
    except Exception:
        pass


# ---------------------------------------------------------------- main

def pick(tvs, name):
    if name:
        for t in tvs:
            if name.lower() in t.name.lower():
                return t
        sys.exit(f"No TV matching '{name}'. Found: {', '.join(t.name for t in tvs) or 'none'}")
    return tvs[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["list", "cast"])
    ap.add_argument("--tv", help="part of the TV name to cast to (default: nearest)")
    ap.add_argument("--url-only", action="store_true", help="serve the stream and print its URL only")
    ap.add_argument("--port", type=int, default=8554)
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--bitrate", default="6M")
    ap.add_argument("--scale", default="1920:1080", help="max output size, e.g. 1280:720 for weak Wi-Fi")
    ap.add_argument("--size", help="capture region on Linux, e.g. 1920x1080")
    a = ap.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found. Install it (apt install ffmpeg / brew install ffmpeg / winget install ffmpeg).")

    if a.command == "list":
        tvs = discover()
        print("\n".join(f"{i + 1}. {t}" for i, t in enumerate(tvs)) or "No TVs found. Same Wi-Fi? TV's "
              "'screen share'/'DLNA'/'media server' setting on?")
        return

    tv = None
    if not a.url_only:
        print("Looking for TVs...")
        tvs = discover()
        if not tvs:
            print("No TVs found; falling back to --url-only mode.")
            a.url_only = True
        else:
            tv = pick(tvs, a.tv)
            print(f"Using: {tv}")

    proc = start_ffmpeg(a.fps, a.size, a.bitrate, a.scale)
    bc = Broadcaster(proc)
    serve(bc, a.port)
    ip = _local_ip_for(tv.host if tv else "8.8.8.8")
    url = f"http://{ip}:{a.port}/screen.ts"

    if tv and tv.kind == "DLNA":
        dlna_play(tv, url)
    elif tv and tv.kind == "Chromecast":
        tv.cast.wait()
        tv.cast.media_controller.play_media(url, "video/mp2t", stream_type="LIVE")
    else:
        print(f"Open this in the TV's browser or any player (VLC etc.): {url}")

    print(f"Mirroring. Stream: {url}\nCtrl+C to stop.")
    try:
        while proc.poll() is None:
            time.sleep(1)
        print("ffmpeg exited; check capture permissions/display.")
    except KeyboardInterrupt:
        pass
    finally:
        proc.terminate()
        if tv and tv.kind == "DLNA":
            dlna_stop(tv)


if __name__ == "__main__":
    main()
