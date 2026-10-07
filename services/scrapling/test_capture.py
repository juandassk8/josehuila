import asyncio
import json
import os
import socket
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from capture import CaptureError, CaptureState, capture, validate_request, retry_after_ms
from server import handler_class, run_until_disconnect


def config():
    return dict(pageId="123456", country="ALL", activeStatus="all", maxPages=10,
                maxDurationMs=15_000, idleTimeoutMs=2000)


def payload(next_page=False, ad_id="98765"):
    return {"data": {"ad_library_main": {"search_results_connection": {
        "edges": [{"node": {"ad_archive_id": ad_id, "page_id": "123456", "is_active": True,
                             "snapshot": {"body": {"text": "Copy verificado"}}}}],
        "page_info": {"has_next_page": next_page, "end_cursor": "next" if next_page else None}
    }}}}


class CaptureTests(unittest.TestCase):
    def test_retry_after_preserves_the_source_wait(self):
        self.assertEqual(retry_after_ms("7200"), 7_200_000)
        for value in (None, "", "invalid", "0", "-1"):
            self.assertIsNone(retry_after_ms(value))

    def test_only_search_connections_advance_progress(self):
        frames = []
        state = CaptureState(frames.append, 10)
        state.ingest(json.dumps({"data": {"page_info": {"has_next_page": False}}}))
        self.assertEqual(state.pages, 0)
        state.ingest(json.dumps(payload(True)))
        state.ingest(json.dumps(payload(True)))
        self.assertEqual(state.pages, 1)
        self.assertTrue(state.has_next)
        state.ingest(json.dumps(payload()))
        self.assertFalse(state.has_next)
        self.assertEqual(len(frames), 2)

    def test_meta_errors_and_page_cap_are_not_terminal(self):
        for value, code in (({"errors": [{"code": 1675004}]}, "META_RATE_LIMITED"),
                            ({"errors": [{"code": 1}]}, "META_SOURCE_ERROR")):
            with self.assertRaisesRegex(CaptureError, code):
                CaptureState(lambda _: None, 1).ingest(json.dumps(value))
        state = CaptureState(lambda _: None, 1)
        state.ingest(json.dumps(payload(True)))
        with self.assertRaisesRegex(CaptureError, "META_PAGE_LIMIT"):
            state.ingest(json.dumps(payload()))

    def test_request_does_not_accept_arbitrary_urls_or_unbounded_work(self):
        for change in ({"url": "http://localhost/admin"}, {"pageId": "https://evil.test"},
                       {"maxPages": 501}, {"maxDurationMs": 0}, {"country": "bad"},
                       {"proxy": {"server": "http://name:secret@proxy.test:80"}}):
            with self.assertRaises(ValueError):
                validate_request({**config(), **change})

    def test_swallowed_action_error_does_not_become_success(self):
        frames = []
        class Page:
            url = "https://www.facebook.com/login/"
            def locator(self, _selector):
                return self
            async def all_text_contents(self):
                return [json.dumps(payload())]

        class Session:
            def __init__(self, **_kwargs):
                pass
            async def __aenter__(self):
                return self
            async def __aexit__(self, *_args):
                pass
            async def fetch(self, _url, **kwargs):
                try:
                    await kwargs["page_action"](Page())
                except CaptureError:
                    pass  # Mirror the SDK, which returns despite action errors.
        with self.assertRaisesRegex(CaptureError, "META_ACCESS_REQUIRED"):
            asyncio.run(capture(config(), frames.append, Session))
        self.assertFalse(any(frame["type"] == "done" for frame in frames))


class ServerTests(unittest.TestCase):
    def test_disconnect_cancels_capture_and_awaits_cleanup(self):
        local, peer = socket.socketpair()
        cleaned = []
        async def runner(_config, _emit):
            try:
                await asyncio.sleep(60)
            finally:
                cleaned.append(True)
        async def run():
            pending = asyncio.create_task(run_until_disconnect(local, runner, {}, lambda _: None))
            await asyncio.sleep(0.02)
            peer.close()
            await asyncio.wait_for(pending, 2)
        try:
            asyncio.run(run())
            self.assertEqual(cleaned, [True])
        finally:
            local.close()
            peer.close()

    def test_authentication_validation_and_stream(self):
        calls = []
        async def runner(value, emit):
            calls.append(value)
            if value["activeStatus"] == "active":
                raise CaptureError("META_RATE_LIMITED", 7_200_000)
            emit({"type": "capture", "body": json.dumps(payload())})
            emit({"type": "done"})
        token = "a" * 32
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler_class(token, runner))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}/crawl"
        def request(body, auth):
            return urllib.request.urlopen(urllib.request.Request(url, json.dumps(body).encode(),
                headers={"Authorization": auth, "Content-Type": "application/json"}), timeout=5)
        try:
            with self.assertRaises(urllib.error.HTTPError) as error:
                request(config(), "Bearer wrong")
            self.assertEqual(error.exception.code, 401)
            with self.assertRaises(urllib.error.HTTPError) as error:
                request({**config(), "url": "https://not-allowed.example"}, "Bearer " + token)
            self.assertEqual(error.exception.code, 400)
            self.assertEqual(calls, [])
            with request(config(), "Bearer " + token) as response:
                frames = [json.loads(line) for line in response]
                self.assertEqual(response.headers["Content-Type"], "application/x-ndjson")
            self.assertEqual(frames[-1], {"type": "done"})
            self.assertEqual(len(calls), 1)
            with request({**config(), "activeStatus": "active"}, "Bearer " + token) as response:
                self.assertEqual(json.loads(response.read()), {
                    "type": "error", "code": "META_RATE_LIMITED", "retryAfterMs": 7_200_000
                })
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


@unittest.skipUnless(os.environ.get("SCRAPLING_BROWSER_TEST") == "1", "Requires installed Scrapling browser")
class BrowserTests(unittest.TestCase):
    def test_real_browser_reads_inline_then_scrolled_graphql_without_network(self):
        from scrapling.fetchers import AsyncStealthySession
        frames, requested = [], []
        html = '<body style="height:10000px"><script type="application/json">' + json.dumps(payload(True)) + '</script>' \
               '<script>window.addEventListener("scroll",()=>fetch("/api/graphql"),{once:true})</script></body>'
        class OfflineSession(AsyncStealthySession):
            def __init__(self, **kwargs):
                # Windows can use the installed Chrome when its Chromium bundle
                # lacks OS runtime dependencies. Linux/Docker tests use Patchright's bundle.
                super().__init__(**kwargs, real_chrome=os.environ.get("SCRAPLING_TEST_CHROME") == "1")

            async def fetch(self, url, **kwargs):
                original = kwargs["page_setup"]
                async def setup(page):
                    await original(page)
                    async def mock(route):
                        requested.append(route.request.url)
                        if "/api/graphql" in route.request.url:
                            await route.fulfill(content_type="application/json", body=json.dumps(payload(False, "98766")))
                        elif route.request.resource_type == "document":
                            await route.fulfill(content_type="text/html", body=html)
                        else:
                            await route.abort()
                    await page.route("**/*", mock)
                return await super().fetch(url, **{**kwargs, "page_setup": setup})
        asyncio.run(capture(config(), frames.append, OfflineSession))
        self.assertTrue(any("/api/graphql" in url for url in requested))
        self.assertEqual([frame["type"] for frame in frames], ["capture", "capture", "done"])


if __name__ == "__main__":
    unittest.main()
