#!/usr/bin/env python3
"""Tiny static server for the Ashfall prototype.

Binds all interfaces so a phone or a second PC on the same Wi-Fi can reach it,
and disables caching so a refresh always picks up code changes.

    python serve.py                # http  on :8000
    python serve.py --https        # https on :8443 (self-signed)
    python serve.py 9000           # pick a port

Why --https matters: WebHID (the DualSense lightbar and adaptive triggers) is
only exposed in a *secure context*. http://localhost counts as secure, but
http://192.168.x.x does not — so over plain HTTP on a LAN address the browser
hides navigator.hid entirely. Serving over HTTPS fixes that. The certificate is
self-signed, so the browser shows a one-time warning you have to accept
(Advanced -> Proceed).
"""

import argparse
import base64
import datetime
import json
import http.server
import ipaddress
import os
import socket
import socketserver
import ssl
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
CERT_DIR = os.path.join(ROOT, ".certs")
CERT_FILE = os.path.join(CERT_DIR, "dev-cert.pem")
KEY_FILE = os.path.join(CERT_DIR, "dev-key.pem")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep the console readable: only surface errors.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)

    def do_POST(self):
        """Dev-only asset sink: the in-page baker POSTs generated PNGs here.

        Local dev server, so this writes straight to ./assets. Filenames are
        stripped to a basename so a crafted request can't escape the folder.
        """
        if self.path != "/__save-assets":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            out_dir = os.path.join(ROOT, "assets")
            os.makedirs(out_dir, exist_ok=True)

            written = []
            for name, data in payload.get("files", {}).items():
                safe = os.path.basename(str(name))
                if not safe or safe.startswith("."):
                    continue
                path = os.path.join(out_dir, safe)
                if data.startswith("data:"):
                    b64 = data.split(",", 1)[1]
                    with open(path, "wb") as f:
                        f.write(base64.b64decode(b64))
                else:
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(data)
                written.append(f"assets/{safe}")

            body = json.dumps({"ok": True, "written": written}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            print(f"  baked -> {', '.join(written)}")
        except Exception as err:  # noqa: BLE001 - dev tool, report and continue
            self.send_error(500, str(err))


Handler.extensions_map.update({
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".html": "text/html",
    ".css": "text/css",
})


def lan_addresses():
    """Best-effort list of this machine's LAN IPv4 addresses."""
    addrs = []
    # The address used to reach the internet is almost always the right one.
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        addrs.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in addrs and not ip.startswith("127."):
                addrs.append(ip)
    except OSError:
        pass
    return addrs


def ensure_cert(hosts):
    """Generate a self-signed cert covering localhost and every LAN IP."""
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        return True
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except ImportError:
        print("  ! --https needs the 'cryptography' package:  pip install cryptography")
        return False

    os.makedirs(CERT_DIR, exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    alt = [x509.DNSName("localhost")]
    for h in hosts:
        try:
            alt.append(x509.IPAddress(ipaddress.ip_address(h)))
        except ValueError:
            alt.append(x509.DNSName(h))
    alt.append(x509.IPAddress(ipaddress.ip_address("127.0.0.1")))

    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Ashfall dev server")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=825))
        .add_extension(x509.SubjectAlternativeName(alt), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    with open(KEY_FILE, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))
    with open(CERT_FILE, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    print(f"  generated a self-signed certificate in {CERT_DIR}")
    return True


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("port", nargs="?", type=int, default=None)
    ap.add_argument("--https", action="store_true",
                    help="serve over TLS so WebHID / secure-context APIs work on the LAN")
    args = ap.parse_args()

    port = args.port or (8443 if args.https else 8000)
    scheme = "https" if args.https else "http"
    hosts = lan_addresses()

    if args.https and not ensure_cert(hosts):
        sys.exit(1)

    httpd = Server(("0.0.0.0", port), Handler)
    if args.https:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(CERT_FILE, KEY_FILE)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

    print()
    print("  ASHFALL - dev server")
    print("  " + "-" * 52)
    print(f"  local     {scheme}://localhost:{port}")
    for ip in hosts:
        print(f"  phone     {scheme}://{ip}:{port}")
    print()
    if args.https:
        print("  Self-signed cert: the browser will warn once.")
        print("  Click Advanced -> Proceed. Then WebHID and the DualSense")
        print("  lightbar / adaptive triggers work over the LAN.")
    else:
        print("  Controllers work here, but the DualSense lightbar and adaptive")
        print("  triggers need a secure context: use localhost, or --https.")
    print()
    print("  Landscape on phones. Ctrl+C to stop.")
    print()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  stopped.\n")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
