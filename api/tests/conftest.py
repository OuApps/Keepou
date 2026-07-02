"""Shared test harness: in-memory DB + TestClient with get_session overridden."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import models  # noqa: F401  (populate SQLModel.metadata)
from app.db import get_session
from app.main import app


@pytest.fixture()
def engine():
    # One shared in-memory SQLite per test (StaticPool → same connection everywhere).
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def session(engine) -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


@pytest.fixture()
def client(engine) -> Generator[TestClient, None, None]:
    def _get_session() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _get_session
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
