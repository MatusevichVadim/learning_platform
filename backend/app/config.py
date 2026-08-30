import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load variables from backend/.env (gitignored). Resolve relative to this file so it
# works regardless of the current working directory (e.g. launched from repo root).
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

SECRET_KEY = os.getenv("APP_SECRET_KEY")
if not SECRET_KEY:
    # Fail closed: a known default key would let anyone forge JWTs (incl. admin).
    raise RuntimeError(
        "APP_SECRET_KEY is not set. Define it in backend/.env (or the environment) before starting the app."
    )

ALGORITHM = "HS256"
# Token lifetime is configurable; default is 7 days (was 30). Shorter limits the
# blast radius of a leaked token. Set ACCESS_TOKEN_EXPIRE_MINUTES to override.
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

# Whether the auth cookie is set with the Secure flag. Enable in production (HTTPS).
SECURE_COOKIES = os.getenv("SECURE_COOKIES", "false").lower() in ("1", "true", "yes", "on")

# Bootstrap credentials for the default admin account (only used to (re)create it).
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    raise RuntimeError(
        "ADMIN_PASSWORD is not set. Define it in backend/.env (or the environment) before starting the app."
    )


