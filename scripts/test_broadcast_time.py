from datetime import datetime, timedelta, timezone
from broadcast_time import as_utc, cycle_reached_until, from_unix_ms, next_cycle_at


def test_as_utc_accepts_naive_and_aware():
    naive = datetime(2026, 9, 6, 14, 0, 0)
    aware = datetime(2026, 9, 6, 14, 0, 0, tzinfo=timezone.utc)
    assert as_utc(naive) == aware
    assert as_utc(aware) == aware
    assert as_utc(None) is None


def test_cycle_compare_does_not_raise_on_mixed_tz():
    naive_now = datetime(2026, 9, 6, 14, 0, 0)
    aware_until = datetime(2026, 9, 6, 18, 0, 0, tzinfo=timezone.utc)
    naive_next = datetime(2026, 9, 6, 15, 0, 0)
    assert cycle_reached_until(naive_now, naive_next, aware_until) is False
    assert cycle_reached_until(naive_now, naive_next, None) is False
    expired = datetime(2026, 9, 6, 13, 0, 0, tzinfo=timezone.utc)
    assert cycle_reached_until(naive_now, naive_next, expired) is True


def test_next_cycle_stays_aware():
    now = datetime(2026, 9, 6, 14, 0, 0)
    nxt = next_cycle_at(now, 3600)
    assert nxt.tzinfo is not None
    assert nxt == datetime(2026, 9, 6, 15, 0, 0, tzinfo=timezone.utc)


def test_from_unix_ms_is_aware():
    dt = from_unix_ms(1_725_638_143_024)
    assert dt.tzinfo is not None


if __name__ == "__main__":
    test_as_utc_accepts_naive_and_aware()
    test_cycle_compare_does_not_raise_on_mixed_tz()
    test_next_cycle_stays_aware()
    test_from_unix_ms_is_aware()
    print("broadcast_time tests passed")
