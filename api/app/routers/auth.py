import hmac

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
)
from app.services.auth import (
    authenticate_user,
    create_access_token,
    get_user_by_email,
    hash_password,
    revoke_refresh_token,
    rotate_refresh_token,
    store_refresh_token,
)
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_response(user: User, refresh_token: str) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


@router.get("/config")
def auth_config():
    """Public endpoint — tells the frontend whether registration requires a token."""
    return {"registration_token_required": bool(settings.registration_token)}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # S-16: timing-safe comparison prevents oracle attacks
    if settings.registration_token and not hmac.compare_digest(body.registration_token, settings.registration_token):
        raise HTTPException(status_code=403, detail="Invalid registration token")

    existing = await get_user_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(user)
    await db.flush()
    refresh = await store_refresh_token(db, user.id)
    await db.commit()
    await db.refresh(user)
    return _token_response(user, refresh)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    # S-08: authenticate_user always runs bcrypt — no timing oracle for account existence
    user = await authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    refresh = await store_refresh_token(db, user.id)
    await db.commit()
    return _token_response(user, refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        user, new_refresh = await rotate_refresh_token(db, body.refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    return _token_response(user, new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: LogoutRequest, db: AsyncSession = Depends(get_db)):
    await revoke_refresh_token(db, body.refresh_token)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.display_name is not None:
        current_user.display_name = body.display_name
    if body.tailoring_preference is not None:
        current_user.tailoring_preference = body.tailoring_preference
    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # S-22: audit log before deletion
    from app.models.activity import ActivityLog
    db.add(ActivityLog(
        user_id=current_user.id,
        entity_type="user",
        entity_id=current_user.id,
        action="account_deleted",
    ))
    await db.flush()
    await db.delete(current_user)
    await db.commit()
