// The research explainer: a developer asks the agent (on Opus) to research how to use a dependency installed in
// the project's .venv, with a subagent on a cheaper model. The main agent picks Claude Code's built-in Explore
// subagent, which has no tools that edit files, and runs it on Haiku. Explore reads the package's source in its
// own context and reports back, and the main agent carries on with just the report. Based on a recorded run;
// see SOURCES.md.

import { start } from "./agents.js";

/** @typedef {import("./agents.js").Script} Script */

const PROMPT = "Research how to use Flask-Limiter. Use a cheaper subagent. Don't use the web, read its source locally.";

const SP = ".venv/lib/python3.14/site-packages";

const LISTING = `Explore: Read-only search agent for sweeping many
  files and directories when you only need the
  conclusion, not the file dumps.
  (Tools: all except Agent, Edit, Write,
  NotebookEdit, ExitPlanMode)

general-purpose: General-purpose agent for
  researching complex questions, searching for code,
  and executing multi-step tasks. (Tools: *)

Plan: Software architect agent for designing
  implementation plans. (Tools: all except Agent,
  Edit, Write, NotebookEdit, ExitPlanMode)`;

// The prompt the main agent wrote for Explore, as in the run. The Agent call and the subagent's conversation
// both show its start and say how much more there is.
const TASK = "Research how to use the Flask-Limiter package installed in this project's virtualenv at /home/learner/checkout/.venv. Do NOT use the web — only read the installed source (find it under .venv/lib/python*/site-packages/flask_limiter and its dist-info METADATA). Also briefly look at the project's own app code (outside .venv) to understand how a Flask app is structured there (it's a quotes API), so advice fits.\n\nReport back concisely:\n1. Installed version (from dist-info).\n2. The Limiter constructor signature and key args (key_func, app, default_limits, storage_uri, strategy, headers_enabled, etc.) — note whether key_func is positional/required in this version.\n3. How to init (direct vs init_app pattern).\n4. Decorators/APIs: limiter.limit(...), limiter.exempt, shared_limit, request_filter, per-blueprint limits — with exact signatures.\n5. Limit string syntax (e.g. \"5 per minute\", \"100/day\") and where it's parsed.\n6. Behavior on limit exceeded (exception type, status code, how to customize the response/error handler).\n7. Relevant config keys (RATELIMIT_*) from the source.\n8. Storage backends and default (memory warning?).\n9. Any key util functions (flask_limiter.util.get_remote_address).\nCite file paths with line numbers. Include a short minimal example tailored to this project's app.";

/** Word-wraps text to `width` columns, each line indented by `indent`. @param {string} text @param {number} width @param {string} indent */
const wrap = (text, width, indent) => text.split("\n").flatMap((para) => {
  if (!para) return [""];
  const out = [""];
  for (const word of para.split(" ")) {
    const last = out[out.length - 1];
    if (last && (indent + last + " " + word).length > width) out.push(word);
    else out[out.length - 1] = last ? `${last} ${word}` : word;
  }
  return out.map((l) => indent + l);
});

const PROMPT_LINES = wrap(TASK, 50, "  ");
const SHOWN = 17;
const CALL = ["subagent_type: Explore", "model: haiku", "description: Research Flask-Limiter source usage", "prompt: |",
  ...PROMPT_LINES.slice(0, SHOWN)].join("\n");

const METADATA = `Metadata-Version: 2.4
Name: Flask-Limiter
Version: 4.1.1
Summary: Rate limiting for flask applications
License-Expression: MIT
Classifier: Development Status :: 5 - Production/Stable
Classifier: Framework :: Flask
Requires-Python: >=3.10
Requires-Dist: flask>=2
Requires-Dist: limits>=3.13
Provides-Extra: redis`;

const CONSTRUCTOR = `    def __init__(
        self,
        key_func: Callable[[], str],
        *,
        app: flask.Flask | None = None,
        default_limits: list[str | Callable[[], str] | Limit] | None = None,
        default_limits_per_method: bool | None = None,
        application_limits: list[str | Callable[[], str] | ApplicationLimit] | None = None,
        headers_enabled: bool | None = None,
        strategy: str | None = None,
        storage_uri: str | None = None,
        storage_options: dict[str, str | int] | None = None,
        swallow_errors: bool | None = None,
        on_breach: Callable[[RequestLimit], flask.wrappers.Response | None] | None = None,
        in_memory_fallback_enabled: bool | None = None,
        key_prefix: str = "",
        enabled: bool = True,
    ) -> None:`;

const STORAGE = `        storage_uri_from_config = config.get(ConfigVars.STORAGE_URI, None)

        if not storage_uri_from_config:
            if not self._storage_uri:
                warnings.warn(
                    "Using the in-memory storage for tracking rate limits as no storage "
                    "was explicitly specified. This is not recommended for production use. "
                    "See: https://flask-limiter.readthedocs.io#configuring-a-storage-backend "
                    "for documentation about configuring the storage backend."
                )
            storage_uri_from_config = "memory://"`;

// The report Explore sent back, as in the run.
const REPORT = "Flask-Limiter research (local source only, no web used).\n\nPROJECT CONTEXT\n- /home/learner/checkout/app.py: a single-module Flask app. `app = Flask(__name__)`, Redis client from `REDIS_URL` env (default redis://localhost:6379/0). Routes: `POST /api/quotes` (create, returns 201 with id) and `GET /api/quotes/<int:quote_id>` (404 JSON if missing). No app factory, no blueprints, no existing limiter.\n- requirements.txt pins flask==3.1.1, Flask-Limiter[redis]==4.1.1, gunicorn==23.0.0, redis==6.2.0. Procfile runs `gunicorn --workers 4 app:app`. Note: 4 workers means the in-memory storage would be per-process, so a shared backend (Redis) is needed for correct limits.\n\n1. INSTALLED VERSION\n- Flask-Limiter 4.1.1: .venv/lib/python3.14/site-packages/flask_limiter-4.1.1.dist-info/METADATA (Requires-Python >=3.10; deps flask>=2, limits>=3.13, ordered-set, typing-extensions; extra `redis` pulls limits[redis]).\n- Installed `limits` is 5.8.0 (.venv/lib/python3.14/site-packages/limits-5.8.0.dist-info). Flask 3.1.1.\n\n2. CONSTRUCTOR (.venv/lib/python3.14/site-packages/flask_limiter/_extension.py:182-324)\n`Limiter(key_func, *, app=None, default_limits=None, default_limits_per_method=None, default_limits_exempt_when=None, default_limits_deduct_when=None, default_limits_cost=None, application_limits=None, application_limits_per_method=None, application_limits_exempt_when=None, application_limits_deduct_when=None, application_limits_cost=None, headers_enabled=None, header_name_mapping=None, strategy=None, storage_uri=None, storage_options=None, swallow_errors=None, fail_on_first_breach=None, on_breach=None, meta_limits=None, on_meta_breach=None, in_memory_fallback=None, in_memory_fallback_enabled=None, retry_after=None, key_prefix=\"\", request_identifier=None, enabled=True)`\n- `key_func` is the ONLY positional argument and is REQUIRED (type Callable[[], str], no default). Everything else is keyword-only (after `*`).\n- Key args: default_limits (list of strings/callables/Limit), storage_uri, strategy (default \"fixed-window\"; valid values from limits.strategies.STRATEGIES), headers_enabled (default False), swallow_errors (default False), key_prefix, enabled.\n\n3. INIT PATTERNS\n- Direct: `limiter = Limiter(get_remote_address, app=app, ...)`.\n- Factory/deferred: `limiter = Limiter(get_remote_address, ...)` then `limiter.init_app(app)` (init_app at _extension.py:326-496). Passing app= just calls init_app. For this module-level `app`, either works. init_app registers before_request/after_request/teardown_request hooks (_extension.py ~line 487-491).\n- Config keys are read in init_app; constructor args take precedence over RATELIMIT_* config.\n\n4. DECORATORS / APIs\n- `limiter.limit(limit_value, *, key_func=None, per_method=False, methods=None, error_message=None, exempt_when=None, override_defaults=True, deduct_when=None, on_breach=None, cost=1, scope=None, meta_limits=None) -> RouteLimit` (_extension.py:517-592). Usable as decorator (place BELOW @app.route) or as context manager `with limiter.limit(\"10/second\"): ...` inside a view.\n- `limiter.shared_limit(limit_value, scope, *, key_func=None, per_method=False, methods=None, error_message=None, exempt_when=None, override_defaults=True, deduct_when=None, on_breach=None, cost=1, meta_limits=None)` (_extension.py:595-655). `scope` is required positional; use for one limit shared across several routes.\n- `limiter.exempt(obj=None, *, flags=ExemptionScope.APPLICATION|DEFAULT|META)` (_extension.py:657-744). Works as bare decorator `@limiter.exempt`, with flags, or on a Blueprint `limiter.exempt(bp)`.\n- `limiter.request_filter(fn)` (_extension.py:746-756): fn takes no args, returns bool; when True the request is exempt from limit checks. Decorator form.\n- Per-blueprint: `flask_limiter.RouteLimit(\"N/unit\", limiter=limiter)` applied to a Blueprint object (`bp`) via call (_limits.py:240-338). `limiter.limit(...)` can also be applied to a Blueprint (the RouteLimit __call__ handles Blueprint at _limits.py:299-311). Limits on a blueprint apply to all its routes.\n- `limiter.limiter`, `limiter.current_limit`, `limiter.reset()`, `limiter.identify_request()` also exist.\n\n5. LIMIT STRING SYNTAX\n- Parsed in limits package, not flask_limiter: flask_limiter/_limits.py:184 calls `limits.parse_many`, which is limits/util.py:159-186 (`parse`/`parse_many`). Regex at limits/util.py:19-33: `<int> (/ | per) [<int multiplier>] <granularity>`, case-insensitive; multiple limits separated by `,` `;` or `|`.\n- Granularities: second, minute, hour, day, month, year (limits/limits.py:31-32 and 150-195). Examples: \"5 per minute\", \"5/minute\", \"100/day\", \"10/second; 200/hour\".\n- Limit values can also be callables returning a string (evaluated per request).\n\n6. ON EXCEEDED\n- Raises `flask_limiter.RateLimitExceeded` (flask_limiter/errors.py:11-29), a subclass of werkzeug `TooManyRequests` => HTTP 429. Default body is the limit string (e.g. \"5 per 1 minute\") as HTML description.\n- Raised from `__evaluate_limits` (_extension.py ~1011-1140) during the before_request hook (`_check_request_limit`, _extension.py:1142-1169), which re-raises RateLimitExceeded untouched.\n- Customize: (a) standard Flask error handler: `@app.errorhandler(RateLimitExceeded)` returning JSON with 429. (b) Per-limit `error_message=`. (c) `on_breach=` callback (global via Limiter(on_breach=...) or per-limit): if it returns a flask Response, that becomes the response embedded in the exception (_extension.py ~1100-1120).\n- Headers: `headers_enabled=True` (or RATELIMIT_HEADERS_ENABLED) adds X-RateLimit-Limit/Remaining/Reset and Retry-After (names in constants.py:39-52, injected in _extension.py:890+).\n\n7. CONFIG KEYS (flask_limiter/constants.py:6-36, class ConfigVars)\nRATELIMIT_ENABLED, RATELIMIT_KEY_PREFIX, RATELIMIT_FAIL_ON_FIRST_BREACH, RATELIMIT_ON_BREACH_CALLBACK, RATELIMIT_SWALLOW_ERRORS, RATELIMIT_APPLICATION, RATELIMIT_APPLICATION_PER_METHOD, RATELIMIT_APPLICATION_EXEMPT_WHEN, RATELIMIT_APPLICATION_DEDUCT_WHEN, RATELIMIT_APPLICATION_COST, RATELIMIT_DEFAULT, RATELIMIT_DEFAULTS_PER_METHOD, RATELIMIT_DEFAULTS_EXEMPT_WHEN, RATELIMIT_DEFAULTS_DEDUCT_WHEN, RATELIMIT_DEFAULTS_COST, RATELIMIT_REQUEST_IDENTIFIER, RATELIMIT_STRATEGY (default \"fixed-window\"), RATELIMIT_STORAGE_URI, RATELIMIT_STORAGE_OPTIONS, RATELIMIT_HEADERS_ENABLED, RATELIMIT_HEADER_LIMIT / _REMAINING / _RESET / _RETRY_AFTER (header name overrides), RATELIMIT_HEADER_RETRY_AFTER_VALUE, RATELIMIT_IN_MEMORY_FALLBACK, RATELIMIT_IN_MEMORY_FALLBACK_ENABLED, RATELIMIT_META, RATELIMIT_ON_META_BREACH_CALLBACK.\nNote: there is no RATELIMIT_KEY_FUNC use in init_app (ConfigVars.KEY_FUNC is defined but key_func is a required constructor arg).\n\n8. STORAGE\n- Backend is chosen via storage_uri arg or RATELIMIT_STORAGE_URI; uses limits.storage.storage_from_string (_extension.py:362-376). Schemes include memory://, redis://, rediss://, memcached://, mongodb://, valkey://, and redis cluster/sentinel variants (limits/storage/__init__.py).\n- Default: `memory://`. If neither storage_uri nor the config is set, init_app emits a `warnings.warn` \"Using the in-memory storage ... not recommended for production use\" (_extension.py:366-373). With 4 gunicorn workers, memory storage would not be shared across processes, so use Redis here.\n- Optional `in_memory_fallback` / `RATELIMIT_IN_MEMORY_FALLBACK_ENABLED` falls back to memory when the backend is down (_extension.py:1158-1167).\n\n9. KEY UTILS\n- `flask_limiter.util.get_remote_address()` (flask_limiter/util.py:9-14): returns `request.remote_addr or \"127.0.0.1\"`. This is the natural key_func for this API. Behind a proxy (Heroku-style Procfile), remote_addr may be the proxy IP, so consider ProxyFix or a custom key from X-Forwarded-For.\n- `get_qualified_name` is internal.\n\nMINIMAL EXAMPLE FOR THIS PROJECT (app.py style)\n```python\nimport os\nfrom flask import Flask, jsonify, request\nfrom flask_limiter import Limiter, RateLimitExceeded\nfrom flask_limiter.util import get_remote_address\nfrom redis import Redis\n\napp = Flask(__name__)\nredis = Redis.from_url(os.environ.get(\"REDIS_URL\", \"redis://localhost:6379/0\"))\n\nlimiter = Limiter(\n    get_remote_address,                       # key_func (required, positional)\n    app=app,\n    default_limits=[\"200 per day\", \"50 per hour\"],\n    storage_uri=os.environ.get(\"REDIS_URL\", \"redis://localhost:6379/0\"),\n    headers_enabled=True,\n)\n\n@app.errorhandler(RateLimitExceeded)\ndef ratelimited(e):\n    return jsonify({\"error\": \"rate limit exceeded\", \"detail\": str(e.description)}), 429\n\n@app.post(\"/api/quotes\")\n@limiter.limit(\"5 per minute\")               # decorator goes BELOW the route\ndef create_quote():\n    ...\n\n@app.get(\"/api/quotes/<int:quote_id>\")\n@limiter.exempt                              # skip default limits for reads\ndef get_quote(quote_id):\n    ...\n```\n(Alternatively, drop `@limiter.exempt` and rely on default_limits for reads.)\n\nFiles cited: flask_limiter/_extension.py, _limits.py, errors.py, constants.py, util.py, all under /home/learner/checkout/.venv/lib/python3.14/site-packages/flask_limiter/. Limit parsing: .venv/lib/python3.14/site-packages/limits/util.py and limits/limits.py.\nLine numbers are approximate for some blocks (e.g. __evaluate_limits ~1011-1140, _check_request_limit 1142-1169).";

// The main agent's reply, as in the run, with its Markdown shown as the terminal shows it.
const REPLY = "I had a Haiku subagent read the installed Flask-Limiter source in .venv, with no web access. I haven't checked its findings against the source myself, and it said some of its line numbers are approximate.\n\n<b>Versions:</b> Flask-Limiter 4.1.1, limits 5.8.0, Flask 3.1.1, all under .venv/lib/python3.14/site-packages/.\n\n<b>Setup</b>\n- Limiter(key_func, *, app=None, default_limits=None, storage_uri=None, strategy=None, headers_enabled=None, ...). key_func is the only positional argument and it's required. Everything else is keyword-only. (flask_limiter/_extension.py:182-324)\n- You can pass app=app directly, or call limiter.init_app(app) later. Since app.py creates app at module level, either works.\n- flask_limiter.util.get_remote_address gives you request.remote_addr, which is the natural key here. Behind a proxy that will be the proxy's IP, so you'd need ProxyFix or a custom key function.\n\n<b>Using it</b>\n- @limiter.limit(\"5 per minute\") goes below @app.route. It also works as a context manager.\n- limiter.shared_limit(limit, scope) applies one limit across several routes.\n- @limiter.exempt skips limits for a route.\n- limiter.request_filter(fn) exempts any request where fn() returns True.\n- You can also apply limits to a whole Blueprint.\n- Limit strings look like \"5/minute\", \"100 per day\" or \"10/second; 200/hour\". The limits package parses them (limits/util.py).\n\n<b>When the limit is hit</b>\n- It raises flask_limiter.RateLimitExceeded, a 429 subclass of werkzeug's TooManyRequests, defined in errors.py.\n- To return JSON instead of the default HTML, use @app.errorhandler(RateLimitExceeded). You can also customise the response with error_message= or on_breach=.\n- headers_enabled=True adds X-RateLimit-* and Retry-After headers to responses.\n- Config keys follow the RATELIMIT_* pattern (RATELIMIT_STORAGE_URI, RATELIMIT_DEFAULT, RATELIMIT_HEADERS_ENABLED, ...) and are listed in constants.py. Arguments passed to the constructor override config.\n\n<b>Storage matters for this project:</b> the default is memory://, which logs a warning that it isn't meant for production. Your Procfile runs gunicorn --workers 4, and each worker would keep its own counters, so limits would be wrong. Point storage_uri at your existing REDIS_URL; Flask-Limiter[redis] is already in requirements.txt.\n\n<b>Minimal example for app.py:</b>\nfrom flask_limiter import Limiter, RateLimitExceeded\nfrom flask_limiter.util import get_remote_address\n\nlimiter = Limiter(\n    get_remote_address,\n    app=app,\n    default_limits=[\"200 per day\", \"50 per hour\"],\n    storage_uri=os.environ.get(\"REDIS_URL\", \"redis://localhost:6379/0\"),\n    headers_enabled=True,\n)\n\n@app.errorhandler(RateLimitExceeded)\ndef ratelimited(e):\n    return jsonify({\"error\": \"rate limit exceeded\", \"detail\": e.description}), 429\n\n@app.post(\"/api/quotes\")\n@limiter.limit(\"5 per minute\")\ndef create_quote(): ...\n\nDo you want me to add this to app.py?";

/** @type {Script} */
const script = {
  mainModel: "opus",
  prices: [
    { key: "opus", label: "opus", in: 4, out: 20 },
    { key: "haiku", label: "haiku", in: 0.1, out: 0.5 },
  ],
  // Each step says what changes once it has happened (see Step in agents.js).
  steps: [
    { title: "Initial prompt", typed: PROMPT, button: "Send",
      note: { html: "<p>We will look at a scenario where a user asks their agent to use a subagent.</p><p>(You can click this to collapse it)</p>", at: "#cc", side: "center" } },

    { title: "The subagents it can call", ctx: { main: 9_900 },
      main: [{ cls: "user", text: PROMPT }],
      view: { kind: "file", label: "Subagents", path: "built into Claude Code", text: LISTING, hl: [0, 1, 2, 3, 4] },
      note: { html: "<p>The agent sees a list of built-in subagents it can call. It decides to use <code>Explore</code>.</p><p>The <code>Explore</code> subagent has a custom system prompt to make it good at exploring codebases. It also has a reduced read-only toolset, preventing it from certain mistakes like trying to implement the change.</p>", at: "#view .vbody .line:nth-child(5)", side: "below" } },

    { title: "It calls a subagent", cost: { opus: 0.040 },
      main: [{ cls: "tool", text: "Explore(Research Flask-Limiter source usage)", spin: "Explore" }],
      view: { kind: "file", label: "Tool call", path: "Agent", text: CALL, more: PROMPT_LINES.length - SHOWN, hl: [0, 1] },
      note: { html: "The main agent calls <code>Explore</code> and specifies it should run on Haiku (a cheaper model).", at: "#view .vbody .line:nth-child(2)", side: "left" } },

    { title: "It writes the subagent's prompt",
      view: { kind: "file", label: "Tool call", path: "Agent", text: CALL, more: PROMPT_LINES.length - SHOWN, hl: Array.from({ length: SHOWN + 1 }, (_, i) => i + 3) },
      note: { html: "It also writes a prompt for the subagent. These are often much more detailed than a human would write.", at: "#view .vbody .hl", side: "left" } },

    { title: "The subagent starts", ctx: { Explore: 7_100 },
      spawn: { name: "Explore", model: "haiku" },
      stats: { Explore: "starting" },
      select: "Explore",
      view: null,
      sub: { Explore: [{ cls: "user", text: TASK, clip: 15 }] },
      note: { html: "The prompt is the subagent's first message. It starts with a fresh context of its own, and everything it reads goes into that context, not the main agent's.", at: "#subterm .ln.user", side: "above" } },

    { title: "It finds the package", ctx: { Explore: 9_600 }, cost: { haiku: 0.002 }, stats: { Explore: "3 tool uses" },
      sub: { Explore: [
        { cls: "tool", text: "Bash(ls -la && find .venv/lib -iname \"*flask*limiter*\" …)" },
        { cls: "tool", text: "Bash(for d in …/*flask_limiter* …; cat …/Flask_Limiter*/METADATA)" },
        { cls: "res", text: "Exit code 1" },
        { cls: "tool", text: "Bash(ls flask_limiter && head -40 …/METADATA && cat app.py …)" },
      ] },
      view: { kind: "file", path: `${SP}/flask_limiter-4.1.1.dist-info/METADATA`, text: METADATA, hl: [2]  },
      note: { html: "The subagent explores the code using its tools.", at: "#cc", side: "center" } },

    { title: "It reads the source", ctx: { Explore: 20_400 }, cost: { haiku: 0.005 }, stats: { Explore: "7 tool uses" },
      sub: { Explore: [
        { cls: "tool", text: "Bash(cat -n __init__.py; grep -n \"def \\|class \" _extension.py)" },
        { cls: "tool", text: "Bash(grep -n \"def \\|class \" util.py errors.py constants.py …)" },
        { cls: "tool", text: "Bash(sed -n 120,330p _extension.py)" },
        { cls: "tool", text: "Bash(sed -n 326,360p _extension.py; sed -n 517,760p …)" },
      ] },
      view: { kind: "file", path: `${SP}/flask_limiter/_extension.py`, text: CONSTRUCTOR, hl: [3]  },
      note: { html: "The subagent explores the code using its tools.", at: "#cc", side: "center" } },

    { title: "It keeps reading", ctx: { Explore: 35_800 }, cost: { haiku: 0.008 }, stats: { Explore: "13 tool uses" },
      sub: { Explore: [
        { cls: "tool", text: "Bash(sed -n 360,500p _extension.py; cat -n constants.py …)" },
        { cls: "tool", text: "Bash(sed -n 1011,1060p _extension.py; …)" },
        { cls: "tool", text: "Bash(grep -n \"parse_many\" _limits.py; …)" },
        { cls: "tool", text: "Bash(grep -rn \"def parse_many\" limits/*.py; …)" },
        { cls: "tool", text: "Bash(sed -n 14,40p limits/util.py; …)" },
        { cls: "tool", text: "Bash(grep -n \"GRANULARITY = \" limits/limits.py)" },
      ] },
      view: { kind: "file", path: `${SP}/flask_limiter/_extension.py`, text: STORAGE, hl: [2, 3, 4, 5, 6, 7, 8, 9, 10]  },
      note: { html: "The subagent explores the code using its tools.", at: "#cc", side: "center" } },

    { title: "It reports back", ctx: { Explore: 40_100 }, cost: { haiku: 0.010 }, status: { Explore: "done" }, stats: { Explore: "14 tool uses · 40.1k" },
      sub: { Explore: [{ cls: "box", text: REPORT, clip: 6, keep: true }] },
      view: { kind: "file", label: "Report", path: "sent back to the main agent", text: REPORT, hl: "*" },
      note: { html: "Explore sends its report back to the main agent. This is all of its work the main agent sees.", at: "#view .vbody .line:nth-child(4)", side: "left", mayCover: "#subterm .ln" } },

    { title: "The main agent gets the report", ctx: { main: 15_400 }, grow: ["main"], cost: { opus: 0.086 }, select: "main", view: null,
      main: [{ cls: "res", text: "Done (14 tool uses · 40.1k tokens · 42s)" }],
      note: { html: "The main agent gets just the report, about 5k tokens. Its context is not used up on all the files the subagent explored (about 29k further tokens).", at: "#ctx-main", side: "below" } },

    { title: "The main agent replies", ctx: { main: 16_700 }, cost: { opus: 0.112 },
      main: [{ cls: "say", html: REPLY.slice(0, REPLY.lastIndexOf("\n\n")), clip: 10, keep: true, tail: REPLY.slice(REPLY.lastIndexOf("\n\n") + 2) }],
      note: { html: "The Haiku subagent cost about a cent.", at: "#cost-haiku", side: "below" } },

    { title: "The session's cost",
      note: { html: "The overall cost is about 12c. If we didn't use the subagent it would be about 25c.", at: "#cost .total", side: "below" } },
  ],
};

start(script);
