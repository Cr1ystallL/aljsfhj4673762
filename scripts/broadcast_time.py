"""Timezone helpers for the broadcast worker.

Postgres `timestamptz` columns come back as offset-aware datetimes.
`datetime.now()` / `fromtimestamp()` are naive by default, and comparing
the two raises TypeError: can't compare offset-naive and offset-aware
datetimes.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def from_unix_ms(ms: float | int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def cycle_reached_until(
    now: datetime,
    next_run: datetime,
    until_date: datetime | None,
) -> bool:
    """True when the cyclical broadcast should stop instead of rescheduling."""
    until_utc = as_utc(until_date)
    if until_utc is None:
        return False
    now_utc = as_utc(now) or utc_now()
    next_utc = as_utc(next_run) or now_utc
    return now_utc >= until_utc or next_utc > until_utc


def next_cycle_at(now: datetime, interval_seconds: int) -> datetime:
    return (as_utc(now) or utc_now()) + timedelta(seconds=int(interval_seconds))
