#!/usr/bin/env python3
"""Test the move API directly."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db import get_session
from app.models import Task
from sqlalchemy import select

def test_api():
    # First verify tasks exist
    with get_session() as session:
        tasks = session.execute(
            select(Task).where(Task.lesson_id == 12).order_by(Task.order_index)
        ).scalars().all()
        
        print("=== Current tasks in lesson 12 ===")
        for t in tasks:
            print(f"  ID: {t.id}, Title: {t.title}, order_index: {t.order_index}")
        
        # Try moving the second task up (should swap with first)
        if len(tasks) >= 2:
            t2 = tasks[1]
            print(f"\n=== Trying to move task {t2.id} ('{t2.title}') UP ===")
            print(f"  Current order_index: {t2.order_index}")
            
            # Find adjacent task above
            adjacent = session.execute(
                select(Task)
                .where(Task.lesson_id == 12)
                .where(Task.order_index < t2.order_index)
                .order_by(Task.order_index.desc())
            ).scalars().first()
            
            if adjacent:
                print(f"  Found adjacent task: ID {adjacent.id}, order_index: {adjacent.order_index}")
                
                # Swap
                temp = t2.order_index
                t2.order_index = adjacent.order_index
                adjacent.order_index = temp
                
                session.flush()
                print(f"  Swapped order_index values")
                print(f"  Task {t2.id} now has order_index: {t2.order_index}")
                print(f"  Task {adjacent.id} now has order_index: {adjacent.order_index}")
            else:
                print("  No adjacent task found above")
            
            session.commit()
        
        # Show updated tasks
        print("\n=== Updated tasks in lesson 12 ===")
        tasks = session.execute(
            select(Task).where(Task.lesson_id == 12).order_by(Task.order_index)
        ).scalars().all()
        for t in tasks:
            print(f"  ID: {t.id}, Title: {t.title}, order_index: {t.order_index}")

if __name__ == "__main__":
    test_api()
