"""Bounded capture transport. Node owns normalization and inventory validation."""
import asyncio
import hashlib
import json
import logging
import re
import time
from email.utils import parsedate_to_datetime
from urllib.parse import urlencode, urlsplit

MAX_BODY = 15_000_000
META_HOST = re.compile(r"(^|\.)(facebook\.com|fbcdn\.net|fbsbx\.com)$")


class CaptureError(Exception):
    def __init__(self, code, retry_after_ms=None):
        super().__init__(code)
        self.retry_after_ms = retry_after_ms


def retry_after_ms(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        seconds = float(value) if re.fullmatch(r"\d+(\.\d+)?", value.strip()) \
            else parsedate_to_datetime(value).timestamp() - time.time()
        return int(seconds * 1000 + 0.999) if 0 < seconds < (8.64e15 / 1000) - time.time() else None
    except (ValueError, TypeError, OverflowError):
        return None


def validate_request(value):
    if not isinstance(value, dict) or set(value) - {
        "pageId", "country", "activeStatus", "maxPages", "maxDurationMs", "idleTimeoutMs", "proxy"
    }:
        raise ValueError("INVALID_REQUEST")
    if not re.fullmatch(r"\d{5,25}", str(value.get("pageId", ""))):
        raise ValueError("INVALID_REQUEST")
    if not re.fullmatch(r"ALL|[A-Z]{2}", str(value.get("country", ""))):
        raise ValueError("INVALID_REQUEST")
    if value.get("activeStatus") not in ("all", "active"):
        raise ValueError("INVALID_REQUEST")
    for name, low, high in (("maxPages", 1, 500), ("maxDurationMs", 1000, 900_000), ("idleTimeoutMs", 1000, 60_000)):
        if type(value.get(name)) is not int or not low <= value[name] <= high:
            raise ValueError("INVALID_REQUEST")
    proxy = value.get("proxy")
    if proxy is not None:
        if not isinstance(proxy, dict) or set(proxy) - {"server", "username", "password"}:
            raise ValueError("INVALID_PROXY")
        parsed = urlsplit(proxy.get("server", ""))
        if parsed.scheme not in ("http", "https", "socks5") or not parsed.hostname or not parsed.port \
                or parsed.username or parsed.password or parsed.path.rstrip("/") or parsed.query or parsed.fragment:
            raise ValueError("INVALID_PROXY")
        if bool(proxy.get("username")) != bool(proxy.get("password")):
            raise ValueError("INVALID_PROXY")
    return value


def search_connections(payload):
    stack, visited = [payload], 0
    while stack:
        node = stack.pop()
        visited += 1
        if visited > 300_000:
            raise CaptureError("META_PAYLOAD_LIMIT")
        if isinstance(node, dict):
            main = node.get("ad_library_main")
            connection = main.get("search_results_connection") if isinstance(main, dict) else None
            if connection is not None:
                if not isinstance(connection, dict) or not isinstance(connection.get("edges"), list) \
                        or type(connection.get("page_info", {}).get("has_next_page")) is not bool:
                    raise CaptureError("META_SCHEMA_CHANGED")
                yield connection
            stack.extend(item for item in node.values() if isinstance(item, (dict, list)))
        elif isinstance(node, list):
            stack.extend(node)


class CaptureState:
    def __init__(self, emit, max_pages, now=time.monotonic):
        self.emit, self.max_pages, self.now = emit, max_pages, now
        self.seen = set()
        self.pages = 0
        self.has_next = True
        self.progress_at = now()
        self.failure = None

    def ingest(self, body):
        if len(body) > MAX_BODY:
            raise CaptureError("META_PAYLOAD_LIMIT")
        for line in re.sub(r"^for\s*\(;;\);\s*", "", body).splitlines():
            try:
                payload = json.loads(line)
            except (ValueError, TypeError):
                continue
            if not isinstance(payload, dict):
                continue
            errors = payload.get("errors") or []
            codes = [payload.get("error")] + [item.get("code") for item in errors if isinstance(item, dict)]
            if any(str(code) == "1675004" for code in codes):
                raise CaptureError("META_RATE_LIMITED")
            if payload.get("error") or errors:
                raise CaptureError("META_SOURCE_ERROR")
            connections = list(search_connections(payload))
            if not connections:
                continue
            identity = hashlib.sha256(line.encode()).digest()
            if identity in self.seen:
                continue
            self.seen.add(identity)
            self.pages += len(connections)
            if self.pages > self.max_pages:
                raise CaptureError("META_PAGE_LIMIT")
            self.has_next = connections[-1]["page_info"]["has_next_page"]
            self.emit({"type": "capture", "body": line})
            self.progress_at = self.now()


async def capture(value, emit, session_factory=None):
    config = validate_request(value)
    if session_factory is None:
        from scrapling.fetchers import AsyncStealthySession
        session_factory = AsyncStealthySession
    # Scrapling/Playwright must never log fetched payloads or proxy credentials.
    logging.getLogger("scrapling").disabled = True
    state = CaptureState(emit, config["maxPages"])
    pending = set()
    finished_action = False

    async def read_response(response):
        try:
            if response.status == 429:
                raise CaptureError("META_RATE_LIMITED", retry_after_ms(response.headers.get("retry-after")))
            state.ingest(await response.text())
        except Exception as error:
            state.failure = error if isinstance(error, CaptureError) else CaptureError("SCRAPLING_CAPTURE_FAILED")

    async def setup(page):
        async def route_request(route):
            url = urlsplit(route.request.url)
            allowed = url.scheme == "https" and META_HOST.search(url.hostname or "")
            if not allowed or route.request.resource_type in ("image", "media", "font"):
                await route.abort()
            else:
                await route.continue_()
        await page.route("**/*", route_request)

        def on_response(response):
            parsed = urlsplit(response.url)
            if parsed.path.startswith("/api/graphql") and META_HOST.search(parsed.hostname or ""):
                task = asyncio.create_task(read_response(response))
                pending.add(task)
                task.add_done_callback(pending.discard)
            elif response.request.resource_type == "document" and response.status == 429:
                state.failure = CaptureError("META_RATE_LIMITED", retry_after_ms(response.headers.get("retry-after")))
        page.on("response", on_response)

    async def action(page):
        nonlocal finished_action
        async def scripts():
            for body in await page.locator('script[type="application/json"]').all_text_contents():
                state.ingest(body)
        await scripts()
        while True:
            if state.failure:
                raise state.failure
            if re.search(r"/(login|checkpoint|challenge)(/|\.php|$)", urlsplit(page.url).path):
                raise CaptureError("META_ACCESS_REQUIRED")
            if state.pages and not state.has_next:
                if pending:
                    await asyncio.gather(*list(pending))
                if state.failure:
                    raise state.failure
                if not state.has_next:
                    finished_action = True
                    return
            if (time.monotonic() - state.progress_at) * 1000 > config["idleTimeoutMs"]:
                raise CaptureError("META_PAGINATION_STALLED" if state.pages else "META_NO_SEARCH_DATA")
            await page.evaluate("() => { if (document.body) window.scrollTo(0, document.body.scrollHeight); }")
            await page.wait_for_timeout(1200)
            if not state.pages:
                await scripts()

    url = "https://www.facebook.com/ads/library/?" + urlencode({
        "active_status": config["activeStatus"], "ad_type": "all", "country": config["country"],
        "search_type": "page", "view_all_page_id": config["pageId"],
    })

    async def run():
        async def guarded_setup(page):
            try:
                await setup(page)
            except Exception:
                state.failure = CaptureError("SCRAPLING_CAPTURE_FAILED")
                await page.close()
                raise state.failure

        async def guarded_action(page):
            # Scrapling logs and swallows page_action exceptions in 0.4.15.
            # Retain the failure ourselves; a returned Response is not success.
            try:
                await action(page)
            except Exception as error:
                state.failure = error if isinstance(error, CaptureError) else CaptureError("SCRAPLING_CAPTURE_FAILED")
                raise state.failure

        # A fresh context per job. No SDK retries layered on top of our coordinator.
        async with session_factory(headless=True, locale="en-US", proxy=config.get("proxy"),
                                   retries=1, google_search=False, solve_cloudflare=False,
                                   block_webrtc=True, block_ads=False, max_pages=1) as session:
            await session.fetch(url, page_setup=guarded_setup, page_action=guarded_action, timeout=45_000, network_idle=False)

    try:
        await asyncio.wait_for(run(), timeout=config["maxDurationMs"] / 1000)
        if state.failure:
            raise state.failure
        if not finished_action or state.has_next:
            raise CaptureError("SCRAPLING_CAPTURE_FAILED")
        emit({"type": "done"})
    except TimeoutError as error:
        raise CaptureError("META_CRAWL_TIMEOUT") from error
    except CaptureError:
        raise
    except Exception as error:
        code = "META_PROXY_UNAVAILABLE" if re.search(r"ERR_(PROXY_|SOCKS_|TUNNEL_CONNECTION_FAILED|NO_SUPPORTED_PROXIES)", str(error)) else "SCRAPLING_CAPTURE_FAILED"
        raise CaptureError(code) from None
    finally:
        for task in pending:
            task.cancel()
        await asyncio.gather(*list(pending), return_exceptions=True)
