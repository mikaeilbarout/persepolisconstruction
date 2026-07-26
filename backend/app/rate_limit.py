from slowapi import Limiter
from slowapi.util import get_remote_address

# In-memory, per-process rate limiting keyed by client IP. Good enough for a
# single-instance deployment; if the API ever runs behind multiple workers or
# processes, point this at Redis instead (slowapi supports a storage_uri arg).
#
# default_limits applies to every route that doesn't declare its own
# @limiter.limit(...) — a generous ceiling against generic flooding.
# Public write endpoints (login, quote/review submission) carry tighter,
# per-route limits declared next to those routes.
limiter = Limiter(key_func=get_remote_address, default_limits=["55/minute"])
