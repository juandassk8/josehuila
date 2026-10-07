"""Loopback-only, authenticated NDJSON service; no DB or storage credentials."""
import asyncio
import hmac
import json
import os
import select
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from capture import CaptureError, capture, validate_request


async def run_until_disconnect(connection, runner, config, emit):
    # A DB error/cancel in Node must not leave the sidecar scrolling for 15 minutes.
    async def disconnected():
        while True:
            try:
                ready, _, _ = select.select([connection], [], [], 0)
                if ready and not connection.recv(1, socket.MSG_PEEK):
                    return
            except OSError:
                return
            await asyncio.sleep(0.2)

    work = asyncio.create_task(runner(config, emit))
    watcher = asyncio.create_task(disconnected())
    try:
        finished, _ = await asyncio.wait([work, watcher], return_when=asyncio.FIRST_COMPLETED)
        if work in finished:
            await work
    finally:
        for task in (work, watcher):
            if not task.done():
                task.cancel()
        await asyncio.gather(work, watcher, return_exceptions=True)


def handler_class(token, runner=capture):
    slots = threading.BoundedSemaphore(1)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            self.send_response(200 if self.path == "/health" else 404)
            self.end_headers()

        def do_POST(self):
            self.connection.settimeout(10)
            supplied = self.headers.get("Authorization", "")
            if not hmac.compare_digest(supplied.encode(), ("Bearer " + token).encode()):
                self.send_error(401)
                return
            if self.path != "/crawl":
                self.send_error(404)
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 8192 or self.headers.get("Transfer-Encoding"):
                    raise ValueError("INVALID_REQUEST")
                config = validate_request(json.loads(self.rfile.read(size)))
            except (ValueError, TypeError, OSError):
                self.send_error(400)
                return
            if not slots.acquire(blocking=False):
                self.send_error(409)
                return
            try:
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()

                def emit(value):
                    self.wfile.write((json.dumps(value, ensure_ascii=False) + "\n").encode())
                    self.wfile.flush()
                try:
                    asyncio.run(run_until_disconnect(self.connection, runner, config, emit))
                except (BrokenPipeError, ConnectionError, TimeoutError):
                    pass
                except CaptureError as error:
                    emit({"type": "error", "code": str(error), "retryAfterMs": error.retry_after_ms})
                except Exception:
                    emit({"type": "error", "code": "SCRAPLING_CAPTURE_FAILED"})
            except (BrokenPipeError, ConnectionError, TimeoutError):
                pass
            finally:
                slots.release()
    return Handler


if __name__ == "__main__":
    service_token = os.environ.get("ADLIB_SCRAPLING_TOKEN", "")
    if len(service_token) < 32 or "\n" in service_token or "\r" in service_token:
        raise SystemExit("ADLIB_SCRAPLING_TOKEN must contain at least 32 characters")
    ThreadingHTTPServer(("127.0.0.1", 3081), handler_class(service_token)).serve_forever()
