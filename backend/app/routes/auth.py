from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from .. import auth as A
from ..db import get_session
from ..models import User
from ..schemas import GoogleIn, LoginIn, RefreshIn, RegisterIn, TokenOut, UserOut
from ..services import user_out

router = APIRouter(prefix="/auth", tags=["auth"])


def _tokens(session: Session, user: User, refresh: str | None = None) -> TokenOut:
    return TokenOut(
        access_token=A.create_access_token(user.id),
        refresh_token=refresh or A.issue_refresh_token(session, user.id),
        user=user_out(user),
    )


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, session: Session = Depends(get_session)):
    email = body.email.lower()
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(name=body.name.strip(), email=email, password_hash=A.hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return _tokens(session, user)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, session: Session = Depends(get_session)):
    email = body.email.lower()
    A.login_limiter.check(f"{request.client.host if request.client else '?'}:{email}")
    user = session.exec(select(User).where(User.email == email)).first()
    if not A.verify_password(body.password, user.password_hash if user else None) or user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return _tokens(session, user)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, session: Session = Depends(get_session)):
    user, new_refresh = A.rotate_refresh_token(session, body.refresh_token)
    return _tokens(session, user, new_refresh)


@router.post("/logout", status_code=204)
def logout(body: RefreshIn, session: Session = Depends(get_session)):
    A.revoke_refresh_token(session, body.refresh_token)


@router.post("/google", response_model=TokenOut)
def google(body: GoogleIn, session: Session = Depends(get_session)):
    claims = A.verify_google_id_token(body.id_token)
    email = claims["email"].lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None:
        user = User(name=claims.get("name") or email.split("@")[0], email=email, google_sub=claims.get("sub"))
        session.add(user)
        session.commit()
        session.refresh(user)
    elif user.google_sub is None:
        user.google_sub = claims.get("sub")
        session.add(user)
        session.commit()
    return _tokens(session, user)


me_router = APIRouter(tags=["auth"])


@me_router.get("/me", response_model=UserOut)
def me(user: User = Depends(A.get_current_user)):
    return user_out(user)
