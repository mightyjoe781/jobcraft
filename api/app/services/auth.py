import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import RefreshToken, User

# Dummy hash used to prevent account enumeration via timing
_DUMMY_HASH = bcrypt.hashpw(b"dummy-constant-password", bcrypt.gensalt()).decode()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode()[:72], hashed.encode())


def hash_token(token: str) -> str:
    # S-17 fix: keyed HMAC instead of plain SHA-256
    return hmac.new(settings.jwt_secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def create_access_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "access"},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def create_refresh_token_value() -> str:
    return uuid.uuid4().hex + uuid.uuid4().hex


async def store_refresh_token(db: AsyncSession, user_id: uuid.UUID) -> str:
    raw = create_refresh_token_value()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    db.add(RefreshToken(user_id=user_id, token_hash=hash_token(raw), expires_at=expires))
    await db.commit()
    return raw


async def decode_access_token(token: str) -> uuid.UUID:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "access":
            raise ValueError("not an access token")
        return uuid.UUID(payload["sub"])
    except (JWTError, KeyError, ValueError) as exc:
        raise ValueError("invalid token") from exc


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    """S-08 fix: always runs bcrypt to prevent account enumeration via timing."""
    user = await get_user_by_email(db, email)
    # Always verify against a hash — prevents timing oracle
    hash_to_check = user.password_hash if user else _DUMMY_HASH
    if not verify_password(password, hash_to_check):
        return None
    return user


async def rotate_refresh_token(db: AsyncSession, raw_token: str) -> tuple[User, str]:
    token_hash = hash_token(raw_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    stored = result.scalar_one_or_none()
    if not stored:
        raise ValueError("invalid or expired refresh token")

    stored.revoked_at = datetime.now(timezone.utc)
    await db.flush()

    user = await get_user_by_id(db, stored.user_id)
    if not user:
        raise ValueError("user not found")

    new_raw = await store_refresh_token(db, user.id)
    return user, new_raw


async def revoke_refresh_token(db: AsyncSession, raw_token: str) -> None:
    token_hash = hash_token(raw_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        )
    )
    stored = result.scalar_one_or_none()
    if stored:
        stored.revoked_at = datetime.now(timezone.utc)
        await db.commit()
