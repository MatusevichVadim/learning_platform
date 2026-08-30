from __future__ import annotations

"""
Rating system for the learning platform.

A user's rating is composed of two parts:

1. ``rating``  - computed automatically from the user's submission history:
   - Every *distinct* task solved correctly awards that task's ``rating`` (1-5 points).
   - Solving tasks *consecutively without errors* builds a "streak". When the
     streak reaches one of the milestones below, a bonus is awarded.

2. ``rating_bonus`` - an optional manual adjustment set by an administrator
   (e.g. for offline achievements). It is simply added to ``rating``.

The effective rating shown everywhere is ``rating + rating_bonus``.

Streak bonuses
--------------
The streak is the number of *consecutive correct* submissions. Any incorrect
or pending submission resets the streak to 0. When the streak hits exactly one
of the milestones, the corresponding bonus is added:

    milestone  bonus
    --------   -----
    5          +5
    10         +10
    15         +15
    20         +20

(See ``STREAK_MILESTONES`` / ``streak_bonus`` below. The bonus equals the
milestone value, so reaching a 20-streak gives +20 points.)
"""

from sqlalchemy import select, func

from .models import Submission, Task, User

# Consecutive-correct-solve milestones that grant a streak bonus.
STREAK_MILESTONES = (5, 10, 15, 20)


def streak_bonus(streak: int) -> int:
    """Return the bonus awarded for a streak that has just reached ``streak``.

    Only the exact milestone values grant a bonus; anything else returns 0.
    """
    if streak in STREAK_MILESTONES:
        return streak
    return 0


def compute_rating_base(db, user_id: int) -> int:
    """Compute the automatic part of a user's rating from their submissions.

    Submissions are processed in chronological order. For each correct
    submission we:
      * award the task's rating the first time that task is solved, and
      * award a streak bonus whenever the running streak hits a milestone.
    An incorrect/pending submission resets the streak.
    """
    rows = db.execute(
        select(Submission, Task.rating)
        .join(Task, Task.id == Submission.task_id)
        .where(Submission.user_id == user_id)
        .order_by(Submission.created_at.asc(), Submission.id.asc())
    ).all()

    rating = 0
    streak = 0
    solved_tasks: set[int] = set()

    for submission, task_rating in rows:
        if submission.is_correct:
            streak += 1
            # Award the task's rating only the first time it is solved correctly.
            if submission.task_id not in solved_tasks:
                solved_tasks.add(submission.task_id)
                rating += int(task_rating or 1)
            # Award a streak bonus when a milestone is reached.
            rating += streak_bonus(streak)
        else:
            # Any wrong/pending submission breaks the consecutive-correct streak.
            streak = 0

    return rating


def recompute_user_rating(db, user_id: int) -> int:
    """Recompute and persist ``user.rating`` for a single user. Returns the value."""
    user = db.get(User, user_id)
    if user is None:
        return 0
    user.rating = compute_rating_base(db, user_id)
    db.flush()
    return user.rating


def recompute_all_ratings(db) -> None:
    """Recompute ``rating`` for every user (used after bulk task changes)."""
    users = db.execute(select(User)).scalars().all()
    for user in users:
        recompute_user_rating(db, user.id)


def effective_rating(user: User) -> int:
    """The rating shown in the UI: computed rating + manual admin bonus."""
    return (user.rating or 0) + (user.rating_bonus or 0)
