"""miniweb - a very small web framework, deliberately shaped like Flask.

You are meant to read this file. Every name in it (`route`, `request`, `jsonify`,
`abort`, `redirect`, `test_client`) is a name Flask also has, so moving to the real
thing later is mostly a change of import line. It is about 300 lines, which is the
whole point: nothing here is magic, and you built most of it yourself in the
"Building a Router" chapter.

    from miniweb import MiniWeb, request, jsonify, abort, redirect, Response

    app = MiniWeb()

    @app.get("/hello/<name>")
    def hello(name):
        return "Hello, " + name + "!"

There is no socket and no `serve_forever` anywhere in here, because a web
application does not need one to exist. An application is a *function*: hand it a
request, it hands you back a response. A real server's only extra job is reading
that request off a network connection. `app.test_client()` skips the network and
calls the application directly - which is exactly how the tests for a real Flask
app are written too.

Two deliberate simplifications, so you are not surprised later:

* `request.args` and `request.form` are plain dicts holding the first value for
  each key. Flask uses a MultiDict, which can hold several values per key.
* Only `<name>` and `<int:name>` placeholders are supported. Flask has more
  converters (`float`, `path`, `uuid`).
"""

import io
import json
import re
import traceback
from http import HTTPStatus
from urllib.parse import parse_qsl, urlencode, urlsplit

__all__ = [
    "MiniWeb",
    "Response",
    "Request",
    "Headers",
    "HTTPError",
    "request",
    "jsonify",
    "abort",
    "redirect",
]

# `json` is shadowed by the `json=` keyword argument on the test client, so the
# module keeps a private alias for use inside those methods.
_json = json

JSON_TYPE = "application/json"
HTML_TYPE = "text/html; charset=utf-8"
FORM_TYPE = "application/x-www-form-urlencoded"


def reason(status):
    """The official reason phrase for a status code: 404 -> 'Not Found'."""
    try:
        return HTTPStatus(int(status)).phrase
    except ValueError:
        return ""


class Headers:
    """A dictionary of headers that does not care about capitalisation.

    `headers["content-type"]` and `headers["Content-Type"]` are the same entry,
    because HTTP says header names are case-insensitive.
    """

    def __init__(self, items=None):
        self._items = {}
        if items:
            pairs = items.items() if hasattr(items, "items") else items
            for key, value in pairs:
                self[key] = value

    @staticmethod
    def _normalize(key):
        return "-".join(part.capitalize() for part in str(key).split("-"))

    def __setitem__(self, key, value):
        self._items[self._normalize(key)] = str(value)

    def __getitem__(self, key):
        return self._items[self._normalize(key)]

    def __contains__(self, key):
        return self._normalize(key) in self._items

    def __iter__(self):
        return iter(self._items)

    def __len__(self):
        return len(self._items)

    def get(self, key, default=None):
        return self._items.get(self._normalize(key), default)

    def setdefault(self, key, value):
        return self._items.setdefault(self._normalize(key), str(value))

    def items(self):
        return self._items.items()

    def keys(self):
        return self._items.keys()

    def __repr__(self):
        return "Headers(%r)" % (self._items,)


class Response:
    """What a handler's return value becomes: a status, some headers and a body.

    A `dict` or a `list` body is turned into JSON automatically; anything else is
    turned into text.
    """

    def __init__(self, body="", status=200, headers=None):
        if isinstance(body, (dict, list)):
            self.text = _json.dumps(body)
            default_type = JSON_TYPE
        else:
            self.text = "" if body is None else str(body)
            default_type = HTML_TYPE
        self.status_code = int(status)
        self.headers = Headers(headers)
        self.headers.setdefault("Content-Type", default_type)

    @property
    def status(self):
        """The status line as a server would write it: '404 Not Found'."""
        return ("%d %s" % (self.status_code, reason(self.status_code))).strip()

    def json(self):
        """The body, parsed as JSON."""
        return _json.loads(self.text)

    def __repr__(self):
        return "<Response %d %r>" % (self.status_code, self.text[:40])


class Request:
    """Everything that arrived: the method, the path, the query, the body."""

    def __init__(self, method="GET", path="/", query_string="", body="", headers=None):
        self.method = str(method).upper()
        self.path = path or "/"
        self.query_string = query_string or ""
        self.body = body or ""
        self.headers = Headers(headers)
        self.view_args = {}
        # First value wins, the same way `request.args["q"]` behaves in Flask.
        self.args = {}
        for key, value in parse_qsl(self.query_string, keep_blank_values=True):
            self.args.setdefault(key, value)

    @property
    def json(self):
        """The body parsed as JSON, or None when there is no usable JSON body."""
        if not self.body:
            return None
        try:
            return _json.loads(self.body)
        except ValueError:
            return None

    @property
    def form(self):
        """The body parsed as submitted form fields."""
        if not self.headers.get("Content-Type", "").startswith(FORM_TYPE):
            return {}
        fields = {}
        for key, value in parse_qsl(self.body, keep_blank_values=True):
            fields.setdefault(key, value)
        return fields

    def __repr__(self):
        return "<Request %s %s>" % (self.method, self.path)


class HTTPError(Exception):
    """Raised by `abort`. The application turns it into a response."""

    def __init__(self, status, description=None):
        super().__init__("%d %s" % (int(status), reason(status)))
        self.status = int(status)
        self.description = description


def abort(status, description=None):
    """Stop the handler and answer with an error status."""
    raise HTTPError(status, description)


def redirect(location, status=302):
    """Answer with 'go and ask over there instead'."""
    return Response("", status, {"Location": location})


def jsonify(obj):
    """Answer with JSON, saying so in the Content-Type header."""
    return Response(_json.dumps(obj), 200, {"Content-Type": JSON_TYPE})


class _RequestProxy:
    """The importable `request` name.

    `from miniweb import request` copies the name into your module once, so the
    object behind it can never be swapped out afterwards. This proxy is that one
    permanent object, and it forwards every attribute to whichever request is
    being handled right now. Flask does the same thing for the same reason.
    """

    _current = None

    def __getattr__(self, name):
        current = _RequestProxy._current
        if current is None:
            raise RuntimeError(
                "there is no request being handled right now, so `request." + name + "` has no value"
            )
        return getattr(current, name)

    def __repr__(self):
        current = _RequestProxy._current
        return "<request unbound>" if current is None else repr(current)


request = _RequestProxy()


_PLACEHOLDER = re.compile(r"<(?:(int|str):)?([A-Za-z_][A-Za-z0-9_]*)>")


def _compile_rule(rule):
    """Turn '/users/<int:id>' into a regular expression plus its value types."""
    pattern = "^"
    types = {}
    cursor = 0
    for match in _PLACEHOLDER.finditer(rule):
        pattern += re.escape(rule[cursor : match.start()])
        kind = match.group(1) or "str"
        name = match.group(2)
        types[name] = kind
        pattern += "(?P<%s>%s)" % (name, r"\d+" if kind == "int" else r"[^/]+")
        cursor = match.end()
    pattern += re.escape(rule[cursor:]) + "$"
    return re.compile(pattern), types


class _Route:
    def __init__(self, rule):
        self.rule = rule
        self.regex, self.types = _compile_rule(rule)
        self.handlers = {}


def _make_response(value):
    """Turn whatever a handler returned into a Response."""
    if isinstance(value, Response):
        return value
    if isinstance(value, tuple):
        if len(value) == 2:
            body, status = value
            headers = None
        elif len(value) == 3:
            body, status, headers = value
        else:
            raise TypeError(
                "a handler returned a tuple of %d items; return (body, status) or (body, status, headers)"
                % len(value)
            )
        return Response(body, status, headers)
    if value is None:
        raise TypeError("a handler returned nothing - did you forget to `return`?")
    return Response(value)


class MiniWeb:
    """The application. Routes go in, responses come out."""

    def __init__(self):
        self._routes = []
        self._error_handlers = {}

    # -- registering routes ------------------------------------------------

    def add_url_rule(self, rule, handler, methods=("GET",)):
        if isinstance(methods, str):
            methods = (methods,)
        route = None
        for existing in self._routes:
            if existing.rule == rule:
                route = existing
                break
        if route is None:
            route = _Route(rule)
            self._routes.append(route)
        for method in methods:
            route.handlers[str(method).upper()] = handler
        return handler

    def route(self, rule, methods=("GET",)):
        def decorator(handler):
            return self.add_url_rule(rule, handler, methods)

        return decorator

    def get(self, rule):
        return self.route(rule, ("GET",))

    def post(self, rule):
        return self.route(rule, ("POST",))

    def put(self, rule):
        return self.route(rule, ("PUT",))

    def patch(self, rule):
        return self.route(rule, ("PATCH",))

    def delete(self, rule):
        return self.route(rule, ("DELETE",))

    def errorhandler(self, status):
        def decorator(handler):
            self._error_handlers[int(status)] = handler
            return handler

        return decorator

    # -- answering a request -----------------------------------------------

    def _dispatch(self, req):
        allowed = set()
        for route in self._routes:
            match = route.regex.match(req.path)
            if match is None:
                continue
            handler = route.handlers.get(req.method)
            if handler is None:
                allowed.update(route.handlers)
                continue
            captured = {
                name: int(value) if route.types[name] == "int" else value
                for name, value in match.groupdict().items()
            }
            req.view_args = captured
            result = handler(**captured)
            if result is None:
                raise TypeError(
                    "%s() returned nothing - did you forget to `return`?" % handler.__name__
                )
            return result
        abort(405 if allowed else 404)

    def _error_response(self, error):
        handler = self._error_handlers.get(error.status)
        if handler is not None:
            response = _make_response(handler(error))
            if response.status_code == 200:
                response.status_code = error.status
            return response
        return Response({"error": error.description or reason(error.status)}, error.status)

    def handle(self, req):
        """Answer one request. This is the whole application in one method."""
        _RequestProxy._current = req
        try:
            try:
                return _make_response(self._dispatch(req))
            except HTTPError as error:
                return self._error_response(error)
        except HTTPError as error:
            # An error handler is allowed to abort as well.
            return self._error_response(error)
        except Exception as error:  # noqa: BLE001 - a crash must not take the server down
            # Name the innermost frame that is *not* in this file, so the student
            # is pointed at their own handler rather than at miniweb's plumbing.
            where = ""
            for frame in reversed(traceback.extract_tb(error.__traceback__)):
                if frame.filename != __file__:
                    where = " in " + frame.name
                    break
            # Printed to stdout on purpose: a real server logs this instead of
            # letting the traceback escape, and the student needs to see it.
            print("!! %s: %s%s" % (type(error).__name__, error, where))
            return Response("Internal Server Error", 500)
        finally:
            _RequestProxy._current = None

    # -- the two ways to call it -------------------------------------------

    def __call__(self, environ, start_response):
        """The WSGI interface: this is what a real server would call."""
        response = self.handle(request_from_environ(environ))
        body = response.text.encode("utf-8")
        headers = list(response.headers.items())
        if "Content-Length" not in response.headers:
            headers.append(("Content-Length", str(len(body))))
        start_response(response.status, headers)
        return [body]

    def test_client(self):
        """A client that calls the application directly, with no network."""
        return TestClient(self)


def request_from_environ(environ):
    """Build a Request from the dictionary a WSGI server hands over."""
    headers = Headers()
    if environ.get("CONTENT_TYPE"):
        headers["Content-Type"] = environ["CONTENT_TYPE"]
    for key, value in environ.items():
        if key.startswith("HTTP_"):
            headers[key[5:].replace("_", "-")] = value
    body = ""
    stream = environ.get("wsgi.input")
    if stream is not None:
        try:
            length = int(environ.get("CONTENT_LENGTH") or 0)
        except ValueError:
            length = 0
        raw = stream.read(length) if length else b""
        body = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)
    return Request(
        environ.get("REQUEST_METHOD", "GET"),
        environ.get("PATH_INFO", "/"),
        environ.get("QUERY_STRING", ""),
        body,
        headers,
    )


class TestClient:
    """Makes requests to an application without a network in between."""

    def __init__(self, app):
        self.app = app

    def open(self, method="GET", path="/", json=None, data=None, headers=None):
        parts = urlsplit(path)
        sent = Headers(headers)
        body = ""
        if json is not None:
            body = _json.dumps(json)
            sent.setdefault("Content-Type", JSON_TYPE)
        elif data is not None:
            body = urlencode(data) if isinstance(data, dict) else str(data)
            sent.setdefault("Content-Type", FORM_TYPE)
        raw = body.encode("utf-8")
        environ = {
            "REQUEST_METHOD": str(method).upper(),
            "PATH_INFO": parts.path or "/",
            "QUERY_STRING": parts.query,
            "CONTENT_TYPE": sent.get("Content-Type", ""),
            "CONTENT_LENGTH": str(len(raw)),
            "wsgi.input": io.BytesIO(raw),
        }
        for key, value in sent.items():
            if key != "Content-Type":
                environ["HTTP_" + key.upper().replace("-", "_")] = value
        captured = {}

        def start_response(status, response_headers):
            captured["status"] = status
            captured["headers"] = response_headers

        chunks = self.app(environ, start_response)
        text = b"".join(chunks).decode("utf-8")
        code = int(captured["status"].split()[0])
        return Response(text, code, captured["headers"])

    def get(self, path, **kwargs):
        return self.open("GET", path, **kwargs)

    def post(self, path, **kwargs):
        return self.open("POST", path, **kwargs)

    def put(self, path, **kwargs):
        return self.open("PUT", path, **kwargs)

    def patch(self, path, **kwargs):
        return self.open("PATCH", path, **kwargs)

    def delete(self, path, **kwargs):
        return self.open("DELETE", path, **kwargs)
