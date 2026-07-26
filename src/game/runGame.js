// pygame runner. Builds a self-contained HTML document with its OWN Pyodide
// instance and a small pure-Python `pygame` shim that maps the common drawing/
// event calls onto an HTML5 canvas. It is rendered inside an iframe by
// GameModal. The student's game loop runs as an asyncio task (yielding each
// frame via `await asyncio.sleep`), so it never blocks; closing the modal
// unmounts the iframe, which is how you stop it (a game's `while running:` is
// supposed to loop forever, so the 8s failsafe doesn't apply here).
//
// This is intentionally a SUBSET of pygame (shapes, text, keyboard, mouse,
// Rect + collision), enough for beginner games like Pong or Snake without a
// heavyweight WASM pygame build. No image or sound assets.

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.29.4/full/";

// The fake `pygame` module, installed into sys.modules before the student code
// runs. Browser keyCodes are used for the K_* constants so keyboard "just works".
const PYGAME_SHIM = String.raw`
import sys, types, asyncio
import js
from js import document, window

_state = {"ctx": None, "w": 0, "h": 0}

def _css(color):
    if isinstance(color, (tuple, list)) and len(color) >= 3:
        r, g, b = int(color[0]), int(color[1]), int(color[2])
        return "rgb(%d,%d,%d)" % (r, g, b)
    return str(color)

class Surface:
    def __init__(self, w, h):
        self.w = w
        self.h = h
    def fill(self, color):
        ctx = _state["ctx"]
        if ctx:
            ctx.fillStyle = _css(color)
            ctx.fillRect(0, 0, self.w, self.h)
    def get_width(self):
        return self.w
    def get_height(self):
        return self.h
    def blit(self, source, pos, *a, **k):
        ctx = _state["ctx"]
        if ctx is None:
            return
        # Only text surfaces are supported (no image assets in this shim).
        if hasattr(source, "text"):
            ctx.font = "%dpx sans-serif" % source.size
            ctx.textBaseline = "top"
            ctx.fillStyle = _css(source.color)
            if hasattr(pos, "x"):
                px, py = pos.x, pos.y
            else:
                px, py = pos[0], pos[1]
            ctx.fillText(source.text, px, py)

class _Display:
    def set_mode(self, size, *a, **k):
        w, h = int(size[0]), int(size[1])
        canvas = document.getElementById("game")
        canvas.width = w
        canvas.height = h
        _state["ctx"] = canvas.getContext("2d")
        _state["w"], _state["h"] = w, h
        return Surface(w, h)
    def set_caption(self, title):
        document.getElementById("title").textContent = str(title)
    def flip(self):
        pass  # direct-draw: the browser paints on the async yield
    def update(self, *a):
        pass

class _Draw:
    def rect(self, surface, color, rect, width=0, *a, **k):
        ctx = _state["ctx"]
        if hasattr(rect, "x") and hasattr(rect, "width"):
            x, y, w, h = rect.x, rect.y, rect.width, rect.height
        else:
            x, y, w, h = rect[0], rect[1], rect[2], rect[3]
        if width == 0:
            ctx.fillStyle = _css(color)
            ctx.fillRect(x, y, w, h)
        else:
            ctx.strokeStyle = _css(color)
            ctx.lineWidth = width
            ctx.strokeRect(x, y, w, h)
    def polygon(self, surface, color, points, width=0):
        ctx = _state["ctx"]
        pts = list(points)
        ctx.beginPath()
        ctx.moveTo(pts[0][0], pts[0][1])
        for p in pts[1:]:
            ctx.lineTo(p[0], p[1])
        ctx.closePath()
        if width == 0:
            ctx.fillStyle = _css(color)
            ctx.fill()
        else:
            ctx.strokeStyle = _css(color)
            ctx.lineWidth = width
            ctx.stroke()
    def circle(self, surface, color, center, radius, width=0):
        ctx = _state["ctx"]
        ctx.beginPath()
        ctx.arc(center[0], center[1], radius, 0, 6.283185)
        if width == 0:
            ctx.fillStyle = _css(color)
            ctx.fill()
        else:
            ctx.strokeStyle = _css(color)
            ctx.lineWidth = width
            ctx.stroke()
    def line(self, surface, color, start, end, width=1):
        ctx = _state["ctx"]
        ctx.beginPath()
        ctx.moveTo(start[0], start[1])
        ctx.lineTo(end[0], end[1])
        ctx.strokeStyle = _css(color)
        ctx.lineWidth = width
        ctx.stroke()

class Event:
    def __init__(self, type_, key=0, pos=(0, 0), button=0):
        self.type = type_
        self.key = key
        self.pos = pos
        self.button = button

class _EventModule:
    def get(self):
        out = []
        q = window._pygame_events
        while q.length > 0:
            e = q.shift()
            out.append(Event(int(e.type), int(e.key), (int(e.mx), int(e.my)), int(e.button)))
        return out

class Clock:
    def tick(self, fps=60):
        return 16

class _Time:
    def Clock(self):
        return Clock()

class Rect:
    def __init__(self, *args):
        if len(args) == 4:
            x, y, w, h = args
        elif len(args) == 1:
            x, y, w, h = args[0]
        elif len(args) == 2:
            (x, y), (w, h) = args
        else:
            raise TypeError("Rect() takes 1, 2, or 4 arguments")
        self.x = int(x)
        self.y = int(y)
        self.width = int(w)
        self.height = int(h)

    @property
    def left(self):
        return self.x
    @left.setter
    def left(self, v):
        self.x = int(v)

    @property
    def right(self):
        return self.x + self.width
    @right.setter
    def right(self, v):
        self.x = int(v) - self.width

    @property
    def top(self):
        return self.y
    @top.setter
    def top(self, v):
        self.y = int(v)

    @property
    def bottom(self):
        return self.y + self.height
    @bottom.setter
    def bottom(self, v):
        self.y = int(v) - self.height

    @property
    def centerx(self):
        return self.x + self.width // 2
    @centerx.setter
    def centerx(self, v):
        self.x = int(v) - self.width // 2

    @property
    def centery(self):
        return self.y + self.height // 2
    @centery.setter
    def centery(self, v):
        self.y = int(v) - self.height // 2

    @property
    def center(self):
        return (self.centerx, self.centery)
    @center.setter
    def center(self, v):
        self.centerx = v[0]
        self.centery = v[1]

    @property
    def topleft(self):
        return (self.x, self.y)
    @topleft.setter
    def topleft(self, v):
        self.x = int(v[0])
        self.y = int(v[1])

    @property
    def size(self):
        return (self.width, self.height)

    def move(self, dx, dy):
        return Rect(self.x + dx, self.y + dy, self.width, self.height)

    def move_ip(self, dx, dy):
        self.x += int(dx)
        self.y += int(dy)

    def colliderect(self, o):
        return (self.x < o.x + o.width and self.x + self.width > o.x and
                self.y < o.y + o.height and self.y + self.height > o.y)

    def collidepoint(self, px, py=None):
        if py is None:
            px, py = px[0], px[1]
        return self.x <= px < self.x + self.width and self.y <= py < self.y + self.height

    def __getitem__(self, i):
        return (self.x, self.y, self.width, self.height)[i]

    def __iter__(self):
        return iter((self.x, self.y, self.width, self.height))

class _TextSurface:
    def __init__(self, text, color, size):
        self.text = str(text)
        self.color = color
        self.size = int(size)
        ctx = _state["ctx"]
        if ctx is not None:
            ctx.font = "%dpx sans-serif" % self.size
            self._w = int(ctx.measureText(self.text).width)
        else:
            self._w = len(self.text) * (self.size // 2)
    def get_width(self):
        return self._w
    def get_height(self):
        return self.size
    def get_rect(self, **kwargs):
        r = Rect(0, 0, self._w, self.size)
        for k, v in kwargs.items():
            setattr(r, k, v)
        return r

class Font:
    def __init__(self, size):
        self.size = int(size or 20)
    def render(self, text, antialias=True, color=(255, 255, 255), *a):
        return _TextSurface(text, color, self.size)

class _FontModule:
    def init(self, *a, **k):
        pass
    def SysFont(self, name, size, *a, **k):
        return Font(size)
    def Font(self, name, size, *a, **k):
        return Font(size)

class _MouseModule:
    def get_pos(self):
        m = window._pygame_mouse
        return (int(m.x), int(m.y))
    def get_pressed(self):
        return (False, False, False)

class _Pressed:
    def __init__(self, held):
        self._held = held
    def __getitem__(self, k):
        return k in self._held

class _KeyModule:
    def get_pressed(self):
        held = set()
        for k in js.Object.keys(window._pygame_held):
            held.add(int(k))
        return _Pressed(held)

_NAMED_COLORS = {
    "white": (255, 255, 255), "black": (0, 0, 0), "red": (220, 60, 60),
    "green": (60, 200, 90), "blue": (70, 130, 240), "yellow": (240, 220, 70),
    "gray": (128, 128, 128), "grey": (128, 128, 128), "orange": (240, 150, 60),
    "cyan": (80, 220, 220), "purple": (170, 100, 220),
}
def _Color(name, *a):
    if a:
        return (int(name), int(a[0]), int(a[1]))
    if isinstance(name, str):
        return _NAMED_COLORS.get(name.lower(), (255, 255, 255))
    return name

pygame = types.ModuleType("pygame")
pygame.display = _Display()
pygame.draw = _Draw()
pygame.event = _EventModule()
pygame.time = _Time()
pygame.key = _KeyModule()
pygame.mouse = _MouseModule()
pygame.font = _FontModule()
pygame.Surface = Surface
pygame.Rect = Rect
pygame.Color = _Color
pygame.init = lambda *a, **k: (0, 0)
pygame.quit = lambda *a, **k: None
pygame.QUIT = 256
pygame.KEYDOWN = 768
pygame.KEYUP = 769
pygame.MOUSEMOTION = 1024
pygame.MOUSEBUTTONDOWN = 1025
pygame.MOUSEBUTTONUP = 1026
pygame.K_LEFT = 37
pygame.K_UP = 38
pygame.K_RIGHT = 39
pygame.K_DOWN = 40
pygame.K_SPACE = 32
pygame.K_RETURN = 13
for _c in range(ord("a"), ord("z") + 1):
    setattr(pygame, "K_" + chr(_c), ord(chr(_c).upper()))
for _d in range(0, 10):
    setattr(pygame, "K_" + str(_d), ord(str(_d)))
sys.modules["pygame"] = pygame

# Under Pyodide there is already a running event loop, so asyncio.run() would
# raise. Reroute it to schedule the coroutine on the existing loop and return.
def _bg_run(coro):
    asyncio.ensure_future(coro)
asyncio.run = _bg_run
`;

// Returns a fully self-contained HTML document that runs the given pygame code
// on its own Pyodide instance and canvas. Rendered inside an <iframe srcDoc>
// (see GameModal), so it is isolated from the React app and torn down cleanly by
// unmounting the iframe.
export function buildGameHTML(code) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Game</title>
<style>
  html, body { margin: 0; background: #14141c; color: #cdd6f4; font-family: system-ui, sans-serif; }
  #bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; }
  #title { font-weight: 700; font-size: 14px; }
  canvas { display: block; margin: 0 auto; background: #000; border-top: 1px solid #2a2a3a; max-width: 100%; height: auto; }
  #status { font-size: 11px; color: #7f849c; padding: 6px 12px; margin: 0; }
</style>
</head>
<body>
  <div id="bar"><span id="title">Game</span></div>
  <canvas id="game" width="480" height="320"></canvas>
  <pre id="status">Loading Python runtime…</pre>
  <script>
    window._pygame_events = [];
    window._pygame_held = {};
    window._pygame_mouse = { x: 0, y: 0 };
    var _cv = document.getElementById('game');
    // Every event carries current mouse coords + button so the Python side can
    // read them uniformly (pygame events have .pos on mouse events).
    function _push(type, key, button) {
      window._pygame_events.push({
        type: type, key: key || 0, button: button || 0,
        mx: window._pygame_mouse.x, my: window._pygame_mouse.y,
      });
    }
    // Map a KeyboardEvent to a pygame key code. Prefer the modern e.key (always
    // set) over the legacy e.keyCode (missing on synthetic events). Our K_*
    // constants use browser keyCodes: arrows 37-40, space 32, letters = ASCII
    // upper, digits = ASCII.
    var _KEYNAMES = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, ' ': 32, Spacebar: 32, Enter: 13 };
    function _codeOf(e) {
      var k = e.key;
      if (_KEYNAMES[k] !== undefined) return _KEYNAMES[k];
      if (k && k.length === 1) return k.toUpperCase().charCodeAt(0);
      return e.keyCode || 0;
    }
    window.addEventListener('keydown', function (e) {
      // Esc closes the modal even when the game (this iframe) holds focus, since
      // the parent window can't see keydowns that land inside the iframe. It
      // also queues a QUIT first, so a program that handles QUIT (as every
      // starter here does) gets to leave its loop before the iframe is torn
      // down. This is the only source of QUIT now that Stop is gone.
      if (e.key === 'Escape') {
        _push(256, 0, 0);
        setTimeout(function () {
          if (window.parent) window.parent.postMessage('game-stop', '*');
        }, 100);
        return;
      }
      var code = _codeOf(e);
      _push(768, code, 0);
      window._pygame_held[code] = 1;
      if ([32, 37, 38, 39, 40].indexOf(code) >= 0) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) {
      var code = _codeOf(e);
      _push(769, code, 0);
      delete window._pygame_held[code];
    });
    function _mpos(e) {
      var r = _cv.getBoundingClientRect();
      window._pygame_mouse.x = (e.clientX - r.left) * (_cv.width / r.width);
      window._pygame_mouse.y = (e.clientY - r.top) * (_cv.height / r.height);
    }
    _cv.addEventListener('mousemove', function (e) { _mpos(e); _push(1024, 0, 0); });
    _cv.addEventListener('mousedown', function (e) { _mpos(e); _push(1025, 0, e.button + 1); });
    _cv.addEventListener('mouseup', function (e) { _mpos(e); _push(1026, 0, e.button + 1); });
    const USER_CODE = ${JSON.stringify(code)};
    const SHIM = ${JSON.stringify(PYGAME_SHIM)};
    const status = document.getElementById('status');
    // Load Pyodide via a dynamic script + onload so we never depend on the
    // document.write() script ordering (which is fragile in a popup).
    const s = document.createElement('script');
    s.src = ${JSON.stringify(PYODIDE_URL + "pyodide.js")};
    s.onload = async function () {
      try {
        const pyodide = await loadPyodide({ indexURL: ${JSON.stringify(PYODIDE_URL)} });
        status.textContent = 'Running. Press Esc or the X button to end.';
        await pyodide.runPythonAsync(SHIM);
        await pyodide.runPythonAsync(USER_CODE);
      } catch (err) {
        status.textContent = 'Error: ' + err;
        status.style.color = '#FF5F57';
      }
    };
    s.onerror = function () {
      status.textContent = 'Failed to load the Python runtime (network?).';
      status.style.color = '#FF5F57';
    };
    document.head.appendChild(s);
  </script>
</body>
</html>`;
}
