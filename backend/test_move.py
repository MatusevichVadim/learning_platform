#!/usr/bin/env python3
"""Test the move task functionality."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db import get_session
from app.models import Task
from sqlalchemy import select, text

def test_move():
    with get_session() as session:
        # Get tasks from lesson 12
        tasks = session.execute(
            select(Task)
            .where(Task.lesson_id == 12)
            .order_by(Task.order_index)
        ).scalars().all()
        
        print("Before move:")
        for t in tasks:
            print(f"  ID: {t.id}, Title: {t.title}, order_index: {t.order_index}")
        
        # Try to swap first two tasks
        if len(tasks) >= 2:
            t1, t2 = tasks[0], tasks[1]
            print(f"\nSwapping task {t1.id} (order_index={t1.order_index}) with task {t2.id} (order_index={t2.order_index})")
            
            temp = t1.order_index
            t1.order_index = t2.order_index
            t2.order_index = temp
            
            session.flush()
            
            print("\nAfter swap (in session):")
            print(f"  Task {t1.id}: order_index={t1.order_index}")
            print(f"  Task {t2.id}: order_index={t2.order_index}")
        
        session.commit()
        
        # Verify after commit
        print("\nAfter commit (from database):")
        result = session.execute(
            text("SELECT id, title, order_index FROM tasks WHERE lesson_id = 12 ORDER BY order_index")
        )
        for row in result:
            print(f"  ID: {row[0]}, Title: {row[1]}, order_index: {row[2]}")

if __name__ == "__main__":
    test_move()
